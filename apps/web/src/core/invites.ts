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
 * - A join link opened by someone who already has an account applies
 *   nothing: it signs them in and offers "Add <Name> (@handle) as a
 *   friend?" (SPEC §17 item 1). Only their Add calls `useInviteAsExisting`.
 * - A seat invite (SPEC §18.4) is an invite from the maintainer with the
 *   note "seat", made when someone takes a seat (core/seats.ts). It takes
 *   none of the maintainer's own invites and is never refunded, listed or
 *   revoked as one of theirs; so no invite of a person's own may carry
 *   that note. Joining through it is the usual join.
 */
import { and, desc, eq, gt, isNull, lte, ne, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createEmailToken, createSession, pendingJoinFromCookie } from "./auth";
import {
  accountCreationOpen,
  appUrl,
  clientIpHeader,
  INVITE_TTL_DAYS,
} from "./config";
import { insertFriendship, isUniqueViolation } from "./connections";
import { type Db, withTx } from "./db";
import { closed, conflict, forbidden, invalid, isCoreError, notFound } from "./errors";
import { newId, randomToken, sha256 } from "./ids";
import { hit, RATE, rateKeyHash } from "./limits";
import { type Defer, nowOrDeferred, sendMail } from "./mail";
import { joinEmail } from "./mail-templates";
import { notify } from "./notifications";
import { accounts, friendRequests, invites, pendingJoins } from "./schema";
import {
  normEmail,
  validDisplayName,
  validHandle,
  validNote,
} from "./validate";
import { areFriends, isActive, isBlocked, pairLock, personShownTo } from "./visibility";

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
/** CLOSED while production names no client-address header (SPEC §17 item 3). */
export const JOIN_REQUESTS_OFF =
  "This server can't send join links yet: its setup doesn't name the header that carries each visitor's address (CLIENT_IP_HEADER).";

/** The note that marks a seat invite (SPEC §18.4). */
export const SEAT_NOTE = "seat";
/** A person's own invite can't carry the seat note: it would be taken for a seat. */
export const NOTE_RESERVED = "That note is reserved. Choose another.";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Codes are 22 characters; anything that cannot be a code is not looked up. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** Invite ids are ulids; anything else is not looked up. */
const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;

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
 * A seat invite took none of the inviter's invites, so none is given back.
 */
async function refundExpired(db: Db, inviterId: string, now: Date): Promise<number> {
  return withTx(db, async (tx) => {
    const expired = await tx
      .update(invites)
      .set({ revokedAt: sql`${invites.expiresAt}` })
      .where(
        and(
          eq(invites.inviterId, inviterId),
          ne(invites.note, SEAT_NOTE),
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
 * The note "seat" is refused (INVALID): it marks seat invites.
 */
export async function createInvite(
  db: Db,
  inviterId: string,
  input: { note?: string; now?: Date },
): Promise<{ id: string; code: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const note = validNote(input.note ?? "");
  if (note === SEAT_NOTE) throw invalid(NOTE_RESERVED);
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

/**
 * A seat invite (SPEC §18.4), made inside the transaction that takes the
 * seat: an invite from the maintainer with the note "seat", valid for as
 * long as any invite. It takes none of the maintainer's invites. Its code
 * is never shown to anyone (only its hash is stored, as for every invite):
 * the seat email carries a join link for it, and joining through that link
 * is the usual join, with the maintainer recorded as the inviter.
 */
export async function createSeatInvite(
  tx: Db,
  maintainerId: string,
  now: Date,
): Promise<{ id: string }> {
  const id = newId();
  await tx.insert(invites).values({
    id,
    codeHash: sha256(randomToken(16)),
    inviterId: maintainerId,
    note: SEAT_NOTE,
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
  });
  return { id };
}

/**
 * Your invites, newest first. Expired unused ones are marked and refunded
 * here. Seat invites are not yours to list: they are the maintainer's only
 * because a seat is an invitation from the maintainer.
 */
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
      // The one rule for showing a person (SPEC §17 item 11): someone
      // suspended, or with a block either way, reads like a deleted account.
      usedByShown: sql<boolean>`${personShownTo(inviterId, invites.usedBy)}`,
    })
    .from(invites)
    .leftJoin(usedBy, eq(usedBy.id, invites.usedBy))
    .where(and(eq(invites.inviterId, inviterId), ne(invites.note, SEAT_NOTE)))
    .orderBy(desc(invites.createdAt), desc(invites.id));
  return {
    remaining: me?.remaining ?? 0,
    invites: rows.map((row) => ({
      id: row.id,
      note: row.note,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: statusOf(row, now),
      usedByHandle: row.usedByShown === true ? (row.usedByHandle ?? null) : null,
    })),
  };
}

/**
 * Revoke one of your unused invites; refunds one. Someone else's invite is
 * NOT_FOUND, and so is a seat invite, which is not one of yours; a used one
 * is CONFLICT; one already revoked or expired changes nothing (and is not
 * refunded again).
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
      .where(
        and(
          eq(invites.id, inviteId),
          eq(invites.inviterId, inviterId),
          ne(invites.note, SEAT_NOTE),
        ),
      )
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
  return findUsableInvite(db, eq(invites.codeHash, sha256(code)), now, viewerId);
}

/** The usable invite `which` selects, with its active inviter, or null. */
async function findUsableInvite(
  db: Db,
  which: SQL,
  now: Date,
  viewerId?: string | null,
): Promise<PublicInvite | null> {
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
    .where(and(which, usable(now)))
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
  return stateForSignedIn(db, invite, viewerId);
}

/** What a signed-in viewer is offered for a usable invite. */
async function stateForSignedIn(
  db: Db,
  invite: PublicInvite,
  viewerId: string,
): Promise<InvitePageState> {
  if (invite.isOwn) return { kind: "own", invite, note: invite.note ?? "" };
  if (!(await isActive(db, viewerId))) return { kind: "unusable" };
  if (await isBlocked(db, viewerId, invite.inviter.id)) return { kind: "unusable" };
  if (await areFriends(db, viewerId, invite.inviter.id)) {
    return { kind: "already_friends", invite };
  }
  return { kind: "can_add", invite };
}

/**
 * What a join link opened by an existing account offers (SPEC §17 item 1),
 * by invite id: the same answers the invite page gives a signed-in viewer.
 * `verifyEmailLink` asks this to decide whether to offer the invite at all,
 * and /join/confirm asks again when it shows the offer. It writes nothing.
 * The id comes from the signed `ours_invite` cookie, never from a form.
 */
export async function inviteOfferForViewer(
  db: Db,
  {
    inviteId,
    viewerId,
    now = new Date(),
  }: { inviteId: string; viewerId: string; now?: Date },
): Promise<InvitePageState> {
  if (typeof inviteId !== "string" || !ID_PATTERN.test(inviteId)) {
    return { kind: "unusable" };
  }
  const invite = await findUsableInvite(db, eq(invites.id, inviteId), now, viewerId);
  if (!invite) return { kind: "unusable" };
  return stateForSignedIn(db, invite, viewerId);
}

/* ---------------------------------------------------------------- joining */

/**
 * Send a join link for an invite. Refused with CLOSED while no controller
 * is named, and while production names no client-address header (SPEC §17
 * item 3). Rate-limited: 3/hour per email hash, 10/hour per IP hash, and
 * 10/day per invite (`join:invite:<id>`), so one link cannot mail any
 * number of addresses however the client's address is presented.
 *
 * The caller always shows the same answer. The link goes to the address
 * whether or not it already has an account (an existing account is signed
 * in and asked whether to add the inviter, SPEC §17 item 1). An address
 * whose account is suspended, or has a block either way with the inviter
 * (SPEC §17 item 2), is sent nothing, with the same answer.
 *
 * Which of those it is, and the mail, are worked out in one task that runs
 * after the response when the caller passes `defer` (SPEC §17 item 4), so
 * the request itself does the same work for every address.
 */
export async function requestJoin(
  db: Db,
  input: { code: string; email: string; ipHash: string; now?: Date; defer?: Defer },
): Promise<void> {
  const now = input.now ?? new Date();
  if (!accountCreationOpen()) throw closed();
  if (!clientIpHeader()) throw closed(JOIN_REQUESTS_OFF);
  const email = normEmail(input.email);
  if (!input.ipHash) throw new Error("requestJoin needs the client's IP hash.");

  await hit(db, `join:ip:${input.ipHash}`, { ...RATE.joinIp, now });
  await hit(db, `join:email:${rateKeyHash(email)}`, { ...RATE.joinEmail, now });

  const invite = await lookupInvite(db, input.code, now);
  if (!invite) throw notFound(INVITE_UNUSABLE);
  await hit(db, `join:invite:${invite.inviteId}`, { ...RATE.joinInvite, now });

  await nowOrDeferred(async () => {
    const [existing] = await db
      .select({ id: accounts.id, suspendedAt: accounts.suspendedAt })
      .from(accounts)
      .where(eq(accounts.email, email))
      .limit(1);
    if (existing?.suspendedAt) return;
    if (existing && (await isBlocked(db, existing.id, invite.inviter.id))) return;

    const token = await createEmailToken(db, {
      email,
      purpose: "join",
      inviteId: invite.inviteId,
      now,
    });
    const mail = joinEmail(
      `${appUrl()}/auth#${token}`,
      invite.inviter.displayName,
      invite.inviter.handle,
    );
    await sendMail(db, {
      to: email,
      subject: mail.subject,
      body: mail.body,
      kind: "join",
      accountId: null,
    });
  }, input.defer);
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
 * Re-checks everything inside the transaction, with the invite and the
 * pending join locked: the pending join is valid, the invite usable, the
 * inviter active, the email and the handle free. Then it creates the
 * account, marks the invite used, makes the new person and the inviter
 * friends, notifies the inviter (invite_joined), completes the pending
 * join and starts a session. The caller deletes the join cookie and sets
 * the session cookie.
 *
 * Every username tried counts against one pending join, 5 a day
 * (`handle:join:<pendingJoinId>`, RATE.handle), as a username change does
 * (SPEC §17 item 9): "That username is taken" says the name is held, so
 * the join form is limited like the settings form (the second
 * verification's privacy defect 5 and identity defect 3). The try is
 * recorded before the transaction, so a refusal does not roll it back.
 *
 * Lock order (SPEC §17 item 7): the invite, then the pending join, then
 * (by inserting `invited_by`) the inviter's account. `deleteAccount` locks
 * the account's invites before the account, and its cascade reaches the
 * pending joins only after both, so the two wait for each other instead
 * of deadlocking.
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
    throw invalid("our.one is for adults. Confirm that you're 18 or older.");
  }
  if (typeof input.pendingJoinId !== "string" || !ID_PATTERN.test(input.pendingJoinId)) {
    throw notFound(JOIN_EXPIRED);
  }
  await hit(db, `handle:join:${input.pendingJoinId}`, { ...RATE.handle, now });

  try {
    return await withTx(db, async (tx) => {
      // Which invite, read without a lock; everything is checked again
      // below, once the invite and then the pending join are locked.
      const [named] = await tx
        .select({ inviteId: pendingJoins.inviteId })
        .from(pendingJoins)
        .where(eq(pendingJoins.id, input.pendingJoinId))
        .limit(1);
      if (!named) throw notFound(JOIN_EXPIRED);

      const [invite] = await tx
        .select({ id: invites.id, inviterId: invites.inviterId, note: invites.note })
        .from(invites)
        .innerJoin(
          accounts,
          and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
        )
        .where(and(eq(invites.id, named.inviteId), usable(now)))
        .for("update", { of: invites });

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
      if (!invite || invite.id !== pending.inviteId) throw notFound(INVITE_UNUSABLE);

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
      // A seat is an invitation from the maintainer, not an offer of
      // friendship (SPEC §18.4, as amended after the build): joining through
      // one makes no friendship and tells the maintainer nothing.
      if (invite.note !== SEAT_NOTE) {
        await insertFriendship(tx, invite.inviterId, accountId, now);
        await notify(tx, {
          recipientId: invite.inviterId,
          kind: "invite_joined",
          actorId: accountId,
          now,
        });
      }
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
    // By shape, not by class: a bundle may hold another copy of this module.
    if (isCoreError(error)) throw error;
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
      .select({ id: invites.id, inviterId: invites.inviterId, note: invites.note })
      .from(invites)
      .innerJoin(
        accounts,
        and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
      )
      .where(and(eq(invites.id, input.inviteId), usable(now)))
      .for("update", { of: invites });
    if (!invite) throw notFound(INVITE_UNUSABLE);
    // A seat never offers friendship with the maintainer (SPEC §18.4).
    if (invite.note === SEAT_NOTE) throw notFound(INVITE_UNUSABLE);
    if (invite.inviterId === accountId) return { status: "own_invite" };
    // Serialize with a block between the two (SPEC §17 item 10), then check
    // for one under the lock: a block either committed before (refused
    // here) or waits for this transaction and then removes the friendship.
    await pairLock(tx, accountId, invite.inviterId);
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
 * a misplaced hook, so callers (the invite page's Add and /join/confirm's
 * Add) call it by this name.
 */
export { useInviteAsExisting as applyInviteAsExisting };
