/**
 * Invites and joining (SPEC §5 `invites`, §8 "Join from an invite",
 * "Controller gate", "Invites").
 *
 * - A code is 16 random bytes as base64url (22 characters). Only its
 *   sha256 is stored; the code itself is returned once, to the inviter.
 * - Accounting: creating an invite takes one from `invites_remaining` and is
 *   refused at 0. Revoking an unused invite gives one back. An invite that
 *   expires unused (30 days) is marked expired (`revoked_at = expires_at`)
 *   and given back lazily, whenever the inviter's invites are listed or a
 *   new one is created.
 * - An invite works once. Unknown, used, expired, revoked, and an inviter
 *   who is suspended or gone are one answer: not usable (SPEC §2 rule 3).
 * - New accounts can be created only while a data controller is named
 *   (`config.accountCreationOpen()`); otherwise `requestJoin` and
 *   `completeJoin` refuse with CLOSED.
 */
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createEmailToken, createSession, pendingJoinFromCookie } from "./auth";
import { accountCreationOpen, appUrl, INVITE_TTL_DAYS } from "./config";
import { insertFriendship, isUniqueViolation } from "./connections";
import { type Db, withTx } from "./db";
import { closed, conflict, CoreError, forbidden, invalid, notFound } from "./errors";
import { newId, randomToken, sha256 } from "./ids";
import { hit, RATE, rateKeyHash } from "./limits";
import { sendMail } from "./mail";
import { joinEmail } from "./mail-templates";
import { notify } from "./notifications";
import { accounts, friendRequests, invites, pendingJoins } from "./schema";
import {
  normEmail,
  validDisplayName,
  validHandle,
  validNote,
} from "./validate";
import { areFriends, isActive, isBlocked } from "./visibility";

export type InviteStatus = "waiting" | "used" | "expired" | "revoked";

/** One of your invites, as /people/invites lists it. The code is never stored. */
export type InviteView = {
  id: string;
  note: string;
  createdAt: Date;
  expiresAt: Date;
  status: InviteStatus;
  usedByHandle: string | null;
};

/** The one sentence for an invite that is not usable, whatever the reason. */
export const INVITE_UNUSABLE =
  "This invite can't be used. Ask the person who sent it for a new one.";
export const NO_INVITES_LEFT = "You have no invites left.";
export const JOIN_EXPIRED =
  "This link has expired or was already used. Open the invite link again to get a new one.";
export const EMAIL_TAKEN =
  "There's already an account for this email. Sign in instead.";
export const HANDLE_TAKEN = "That username is taken. Choose another.";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Codes are 22 characters; anything that cannot be a code is not looked up. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/* --------------------------------------------------------------- helpers */

/** SQL: the invite can still be used at `now` (not whether its inviter is active). */
function usable(now: Date) {
  return and(
    isNull(invites.usedAt),
    isNull(invites.revokedAt),
    gt(invites.expiresAt, now),
  );
}

/**
 * Mark the inviter's unused invites that have expired as expired
 * (`revoked_at = expires_at`) and give each one back. Two listings at once
 * cannot refund twice: the second update finds the rows already marked.
 */
async function refundExpired(db: Db, inviterId: string, now: Date): Promise<number> {
  return withTx(db, async (tx) => {
    const expired = await tx
      .update(invites)
      .set({ revokedAt: sql`${invites.expiresAt}` })
      .where(
        and(
          eq(invites.inviterId, inviterId),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          lte(invites.expiresAt, now),
        ),
      )
      .returning({ id: invites.id });
    if (expired.length > 0) {
      await tx
        .update(accounts)
        .set({
          invitesRemaining: sql`${accounts.invitesRemaining} + ${expired.length}`,
        })
        .where(eq(accounts.id, inviterId));
    }
    return expired.length;
  });
}

function statusOf(
  row: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InviteStatus {
  if (row.usedAt) return "used";
  if (row.revokedAt) {
    return row.revokedAt.getTime() === row.expiresAt.getTime() ? "expired" : "revoked";
  }
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "waiting";
}

/* ------------------------------------------------------ your own invites */

/**
 * Create an invite: decrements `invites_remaining` (refused at 0),
 * rate-limited to 20 a day. Returns the code, shown to the inviter once.
 */
export async function createInvite(
  db: Db,
  inviterId: string,
  input: { note?: string; now?: Date },
): Promise<{ id: string; code: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const note = validNote(input.note ?? "");
  if (!(await isActive(db, inviterId))) throw forbidden();

  await refundExpired(db, inviterId, now);
  const [me] = await db
    .select({ remaining: accounts.invitesRemaining })
    .from(accounts)
    .where(eq(accounts.id, inviterId))
    .limit(1);
  if (!me || me.remaining <= 0) throw forbidden(NO_INVITES_LEFT);

  // Before the transaction: a limit hit inside it would roll back with it.
  await hit(db, `invite:${inviterId}`, { ...RATE.invite, now });

  const id = newId();
  const code = randomToken(16);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
  await withTx(db, async (tx) => {
    const taken = await tx
      .update(accounts)
      .set({ invitesRemaining: sql`${accounts.invitesRemaining} - 1` })
      .where(
        and(
          eq(accounts.id, inviterId),
          isNull(accounts.suspendedAt),
          gt(accounts.invitesRemaining, 0),
        ),
      )
      .returning({ id: accounts.id });
    if (taken.length === 0) throw forbidden(NO_INVITES_LEFT);
    await tx.insert(invites).values({
      id,
      codeHash: sha256(code),
      inviterId,
      note,
      createdAt: now,
      expiresAt,
    });
  });
  return { id, code, expiresAt };
}

/** Your invites, newest first. Expired unused ones are marked and refunded here. */
export async function listInvites(
  db: Db,
  inviterId: string,
  now: Date = new Date(),
): Promise<{ remaining: number; invites: InviteView[] }> {
  await refundExpired(db, inviterId, now);
  const usedBy = alias(accounts, "invite_used_by");
  const [me] = await db
    .select({ remaining: accounts.invitesRemaining })
    .from(accounts)
    .where(eq(accounts.id, inviterId))
    .limit(1);
  const rows = await db
    .select({
      id: invites.id,
      note: invites.note,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      usedAt: invites.usedAt,
      revokedAt: invites.revokedAt,
      usedByHandle: usedBy.handle,
      usedBySuspendedAt: usedBy.suspendedAt,
    })
    .from(invites)
    .leftJoin(usedBy, eq(usedBy.id, invites.usedBy))
    .where(eq(invites.inviterId, inviterId))
    .orderBy(desc(invites.createdAt), desc(invites.id));
  return {
    remaining: me?.remaining ?? 0,
    invites: rows.map((row) => ({
      id: row.id,
      note: row.note,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: statusOf(row, now),
      // A suspended account's profile is hidden from everyone (SPEC §6).
      usedByHandle: row.usedBySuspendedAt ? null : (row.usedByHandle ?? null),
    })),
  };
}

/**
 * Revoke one of your unused invites; refunds one. Someone else's invite is
 * NOT_FOUND; a used one is CONFLICT; one already revoked or expired changes
 * nothing (and is not refunded again).
 */
export async function revokeInvite(
  db: Db,
  inviterId: string,
  inviteId: string,
  now: Date = new Date(),
): Promise<void> {
  await refundExpired(db, inviterId, now);
  await withTx(db, async (tx) => {
    const [row] = await tx
      .select({
        id: invites.id,
        usedAt: invites.usedAt,
        revokedAt: invites.revokedAt,
      })
      .from(invites)
      .where(and(eq(invites.id, inviteId), eq(invites.inviterId, inviterId)))
      .for("update");
    if (!row) throw notFound("That invite isn't available.");
    if (row.usedAt) throw conflict("This invite was already used.");
    if (row.revokedAt) return;
    await tx.update(invites).set({ revokedAt: now }).where(eq(invites.id, row.id));
    await tx
      .update(accounts)
      .set({ invitesRemaining: sql`${accounts.invitesRemaining} + 1` })
      .where(eq(accounts.id, inviterId));
  });
}

/* ------------------------------------------------------- the invite link */

/** What anyone holding the link may see. */
export type PublicInvite = {
  inviteId: string;
  inviter: { id: string; handle: string; displayName: string };
  /** The viewer (when one is given) is the inviter. */
  isOwn: boolean;
  /** The inviter's private note: only when `isOwn`, otherwise null. */
  note: string | null;
};

/**
 * The invite behind a code, or null when it is not usable (unknown, used,
 * expired, revoked, inviter suspended or gone) — one answer for all.
 *
 * `viewerId` is optional: when it is the inviter, `isOwn` is true and the
 * private note is included. Nobody else ever receives the note.
 */
export async function lookupInvite(
  db: Db,
  code: string,
  now: Date = new Date(),
  viewerId?: string | null,
): Promise<PublicInvite | null> {
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) return null;
  const [row] = await db
    .select({
      inviteId: invites.id,
      note: invites.note,
      inviterId: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
    })
    .from(invites)
    .innerJoin(
      accounts,
      and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
    )
    .where(and(eq(invites.codeHash, sha256(code)), usable(now)))
    .limit(1);
  if (!row) return null;
  const isOwn = Boolean(viewerId) && viewerId === row.inviterId;
  return {
    inviteId: row.inviteId,
    inviter: { id: row.inviterId, handle: row.handle, displayName: row.displayName },
    isOwn,
    note: isOwn ? row.note : null,
  };
}

/** What /i/<code> shows, decided here so the page only renders it (SPEC §8). */
export type InvitePageState =
  /** Unknown, used, expired, revoked, inviter gone or suspended, or a block either way. */
  | { kind: "unusable" }
  /** Signed in, and the viewer made this invite. */
  | { kind: "own"; invite: PublicInvite; note: string }
  /** Signed in and already friends: using it would change nothing. */
  | { kind: "already_friends"; invite: PublicInvite }
  /** Signed in: "Add <Name> as a friend". */
  | { kind: "can_add"; invite: PublicInvite }
  /** Signed out, and no data controller is named: no form. */
  | { kind: "closed"; invite: PublicInvite }
  /** Signed out: the email form. */
  | { kind: "can_join"; invite: PublicInvite };

export async function inviteForViewer(
  db: Db,
  {
    code,
    viewerId,
    now = new Date(),
  }: { code: string; viewerId: string | null; now?: Date },
): Promise<InvitePageState> {
  const invite = await lookupInvite(db, code, now, viewerId);
  if (!invite) return { kind: "unusable" };
  if (!viewerId) {
    return accountCreationOpen()
      ? { kind: "can_join", invite }
      : { kind: "closed", invite };
  }
  if (invite.isOwn) return { kind: "own", invite, note: invite.note ?? "" };
  if (!(await isActive(db, viewerId))) return { kind: "unusable" };
  if (await isBlocked(db, viewerId, invite.inviter.id)) return { kind: "unusable" };
  if (await areFriends(db, viewerId, invite.inviter.id)) {
    return { kind: "already_friends", invite };
  }
  return { kind: "can_add", invite };
}

/* ---------------------------------------------------------------- joining */

/**
 * Send a join link for an invite. Refused with CLOSED while no controller
 * is named. Rate-limited (3/hour per email hash, 10/hour per IP hash).
 *
 * The caller always shows the same answer: the link goes to the address
 * whether or not it already has an account (an existing account is signed
 * in and uses the invite, SPEC §8 step 2). An address whose account is
 * suspended is sent nothing, with the same answer.
 */
export async function requestJoin(
  db: Db,
  input: { code: string; email: string; ipHash: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  if (!accountCreationOpen()) throw closed();
  const email = normEmail(input.email);
  if (!input.ipHash) throw new Error("requestJoin needs the client's IP hash.");

  await hit(db, `join:ip:${input.ipHash}`, { ...RATE.joinIp, now });
  await hit(db, `join:email:${rateKeyHash(email)}`, { ...RATE.joinEmail, now });

  const invite = await lookupInvite(db, input.code, now);
  if (!invite) throw notFound(INVITE_UNUSABLE);

  const [existing] = await db
    .select({ suspendedAt: accounts.suspendedAt })
    .from(accounts)
    .where(eq(accounts.email, email))
    .limit(1);
  if (existing?.suspendedAt) return;

  const token = await createEmailToken(db, {
    email,
    purpose: "join",
    inviteId: invite.inviteId,
    now,
  });
  const mail = joinEmail(`${appUrl()}/auth#${token}`, invite.inviter.displayName);
  await sendMail(db, {
    to: email,
    subject: mail.subject,
    body: mail.body,
    kind: "join",
    accountId: null,
  });
}

/** What /join shows about the pending join in its cookie, or null. */
export type PendingJoinDetails = {
  pendingJoinId: string;
  email: string;
  inviter: { handle: string; displayName: string };
};

/**
 * The pending join behind a signed `ours_join` cookie value, with its
 * inviter — or null when the cookie is not ours, the pending join expired
 * or was completed, or its invite is no longer usable.
 */
export async function describePendingJoin(
  db: Db,
  cookieValue: unknown,
  now: Date = new Date(),
): Promise<PendingJoinDetails | null> {
  const pending = await pendingJoinFromCookie(db, cookieValue, now);
  if (!pending) return null;
  const [row] = await db
    .select({ handle: accounts.handle, displayName: accounts.displayName })
    .from(invites)
    .innerJoin(
      accounts,
      and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
    )
    .where(and(eq(invites.id, pending.inviteId), usable(now)))
    .limit(1);
  if (!row) return null;
  return { pendingJoinId: pending.id, email: pending.email, inviter: row };
}

/**
 * Finish joining, in one transaction (SPEC §8 step 4). Refused with CLOSED
 * while no controller is named.
 *
 * Re-checks everything inside the transaction, with the pending join and
 * the invite locked: the pending join is valid, the invite usable, the
 * inviter active, the email and the handle free. Then it creates the
 * account, marks the invite used, makes the new person and the inviter
 * friends, notifies the inviter (invite_joined), completes the pending
 * join and starts a session. The caller deletes the join cookie and sets
 * the session cookie.
 */
export async function completeJoin(
  db: Db,
  input: {
    pendingJoinId: string;
    displayName: string;
    handle: string;
    adultConfirmed: boolean;
    now?: Date;
  },
): Promise<{
  accountId: string;
  session: { id: string; cookieValue: string; expiresAt: Date };
}> {
  const now = input.now ?? new Date();
  if (!accountCreationOpen()) throw closed();
  const displayName = validDisplayName(input.displayName);
  const handle = validHandle(input.handle);
  if (input.adultConfirmed !== true) {
    throw invalid("OURS is for adults. Confirm that you're 18 or older.");
  }

  try {
    return await withTx(db, async (tx) => {
      const [pending] = await tx
        .select({
          id: pendingJoins.id,
          email: pendingJoins.email,
          inviteId: pendingJoins.inviteId,
        })
        .from(pendingJoins)
        .where(
          and(
            eq(pendingJoins.id, input.pendingJoinId),
            isNull(pendingJoins.completedAt),
            gt(pendingJoins.expiresAt, now),
          ),
        )
        .for("update");
      if (!pending) throw notFound(JOIN_EXPIRED);

      const [invite] = await tx
        .select({ id: invites.id, inviterId: invites.inviterId })
        .from(invites)
        .innerJoin(
          accounts,
          and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
        )
        .where(and(eq(invites.id, pending.inviteId), usable(now)))
        .for("update", { of: invites });
      if (!invite) throw notFound(INVITE_UNUSABLE);

      const [emailTaken] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.email, pending.email))
        .limit(1);
      if (emailTaken) throw conflict(EMAIL_TAKEN);

      const [handleTaken] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.handle, handle))
        .limit(1);
      if (handleTaken) throw conflict(HANDLE_TAKEN);

      const accountId = newId();
      await tx.insert(accounts).values({
        id: accountId,
        email: pending.email,
        handle,
        displayName,
        invitedBy: invite.inviterId,
        adultConfirmedAt: now,
        createdAt: now,
      });
      await tx
        .update(invites)
        .set({ usedAt: now, usedBy: accountId })
        .where(eq(invites.id, invite.id));
      await insertFriendship(tx, invite.inviterId, accountId, now);
      await notify(tx, {
        recipientId: invite.inviterId,
        kind: "invite_joined",
        actorId: accountId,
        now,
      });
      await tx
        .update(pendingJoins)
        .set({ completedAt: now })
        .where(eq(pendingJoins.id, pending.id));
      const session = await createSession(tx, accountId, now);
      return { accountId, session };
    });
  } catch (error) {
    // Two joins racing for one handle or email: the loser gets the same
    // answer as if it had come second.
    if (error instanceof CoreError) throw error;
    if (isUniqueViolation(error, "accounts_handle_unique")) throw conflict(HANDLE_TAKEN);
    if (isUniqueViolation(error, "accounts_email_unique")) throw conflict(EMAIL_TAKEN);
    throw error;
  }
}

export type UseInviteResult =
  | { status: "friends" }
  | { status: "already_friends" }
  | { status: "own_invite" };

/**
 * An existing account uses an invite: becomes friends with the inviter.
 * Already friends does not consume the invite. Blocked either way is
 * NOT_FOUND, like an unusable invite.
 *
 * Using it marks the invite used, resolves any pending request between
 * the two as accepted, and tells the inviter (friend_accepted: they are
 * now friends; nobody joined).
 */
export async function useInviteAsExisting(
  db: Db,
  input: { accountId: string; inviteId: string; now?: Date },
): Promise<UseInviteResult> {
  const now = input.now ?? new Date();
  const { accountId } = input;
  return withTx(db, async (tx) => {
    const [invite] = await tx
      .select({ id: invites.id, inviterId: invites.inviterId })
      .from(invites)
      .innerJoin(
        accounts,
        and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
      )
      .where(and(eq(invites.id, input.inviteId), usable(now)))
      .for("update", { of: invites });
    if (!invite) throw notFound(INVITE_UNUSABLE);
    if (invite.inviterId === accountId) return { status: "own_invite" };
    if (!(await isActive(tx, accountId))) throw notFound(INVITE_UNUSABLE);
    if (await isBlocked(tx, accountId, invite.inviterId)) {
      throw notFound(INVITE_UNUSABLE);
    }
    if (await areFriends(tx, accountId, invite.inviterId)) {
      return { status: "already_friends" };
    }

    await tx
      .update(invites)
      .set({ usedAt: now, usedBy: accountId })
      .where(eq(invites.id, invite.id));
    await tx
      .update(friendRequests)
      .set({ status: "accepted", respondedAt: now })
      .where(
        and(
          eq(friendRequests.status, "pending"),
          sql`least(${friendRequests.fromId}, ${friendRequests.toId}) = least(${accountId}::text, ${invite.inviterId}::text)`,
          sql`greatest(${friendRequests.fromId}, ${friendRequests.toId}) = greatest(${accountId}::text, ${invite.inviterId}::text)`,
        ),
      );
    await insertFriendship(tx, invite.inviterId, accountId, now);
    await notify(tx, {
      recipientId: invite.inviterId,
      kind: "friend_accepted",
      actorId: accountId,
      now,
    });
    return { status: "friends" };
  });
}

/**
 * The same function under a name that does not start with "use": the
 * react-hooks lint rule treats any call of `use…()` outside a component as
 * a misplaced hook, so callers (M1's verifyEmailLink, the invite page's
 * action) call it by this name.
 */
export { useInviteAsExisting as applyInviteAsExisting };
