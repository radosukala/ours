/**
 * Accounts (M1; SPEC §6, §8, §13): profiles and settings, signing in by
 * an emailed link, and deleting an account.
 *
 * Every function takes the account id from the caller's session; none of
 * them takes a second account to act on. A suspended account can do
 * nothing (SPEC §6), so each write refuses it with NOT_FOUND, the same
 * answer as an account that does not exist.
 */
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { accountCreationOpen, appUrl } from "./config";
import { consumeEmailToken, createEmailToken, createPendingJoin } from "./auth";
import { type Db, withTx } from "./db";
import { closed, conflict, invalid, isCoreError, notFound } from "./errors";
// Aliased: the `use` prefix belongs to React hooks, and this is not one.
import { useInviteAsExisting as applyInviteAsExisting } from "./invites";
import { hit, RATE, rateKeyHash } from "./limits";
import { sendMail } from "./mail";
import { signInEmail } from "./mail-templates";
import { accounts, emailTokens, follows, outbox, pendingJoins } from "./schema";
import {
  HANDLE_PATTERN,
  normEmail,
  validBio,
  validDisplayName,
  validHandle,
} from "./validate";
import { canSeeAccount, isActive } from "./visibility";

/** What /auth shows for an unknown, used or expired link (SPEC §8). */
export const LINK_REFUSED = "This link has expired or was already used.";

/** What /signin always answers, whether or not the account exists (SPEC §8). */
export const SIGN_IN_ANSWER =
  "If there's an account for that address, we've sent a sign-in link. It works once, for 15 minutes.";

const HANDLE_TAKEN = "That username is taken. Choose another.";
const CONFIRM_MISMATCH = "Type your username exactly as shown to confirm.";

/* --------------------------------------------------------------- helpers */

const activeAccount = (accountId: string) =>
  and(eq(accounts.id, accountId), isNull(accounts.suspendedAt));

/** A lookup handle: trimmed, a leading @ ignored, lowercased; null if malformed. */
function lookupHandle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const handle = input.trim().replace(/^@/, "").toLowerCase();
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

/** Postgres unique_violation, whether or not drizzle wrapped the error. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (value: unknown) =>
    typeof value === "object" && value !== null
      ? (value as { code?: unknown }).code
      : undefined;
  return (
    codeOf(error) === "23505" ||
    codeOf((error as { cause?: unknown } | null)?.cause) === "23505"
  );
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid("Choose on or off.");
  return value;
}

/* -------------------------------------------------------------- profiles */

/** What a viewer may see of another person's account. */
export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  acceptsFollowers: boolean;
  createdAt: Date;
};

/**
 * The profile at `handle` as the viewer may see it, or null when it does
 * not exist, is suspended, or there is a block either way (SPEC §6). A
 * viewer who is not active sees nothing. The address is never included.
 */
export async function getAccountByHandle(
  db: Db,
  viewerId: string,
  handle: string,
): Promise<PublicProfile | null> {
  const wanted = lookupHandle(handle);
  if (!wanted) return null;
  const [row] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
      bio: accounts.bio,
      acceptsFollowers: accounts.acceptsFollowers,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(and(eq(accounts.handle, wanted), isNull(accounts.suspendedAt)))
    .limit(1);
  if (!row) return null;
  if (!(await isActive(db, viewerId))) return null;
  if (!(await canSeeAccount(db, viewerId, row.id))) return null;
  return row;
}

/** Everything /settings shows: the person's own account, and only theirs. */
export type AccountSettings = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  email: string;
  acceptsFollowers: boolean;
  weeklyEmail: boolean;
};

export async function getSettings(
  db: Db,
  accountId: string,
): Promise<AccountSettings> {
  const [row] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
      bio: accounts.bio,
      email: accounts.email,
      acceptsFollowers: accounts.acceptsFollowers,
      weeklyEmail: accounts.weeklyEmail,
    })
    .from(accounts)
    .where(activeAccount(accountId))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

/** Change your display name and bio. */
export async function updateProfile(
  db: Db,
  accountId: string,
  input: { displayName: string; bio: string },
): Promise<void> {
  const displayName = validDisplayName(input.displayName);
  const bio = validBio(input.bio);
  const rows = await db
    .update(accounts)
    .set({ displayName, bio })
    .where(activeAccount(accountId))
    .returning({ id: accounts.id });
  if (rows.length === 0) throw notFound();
}

/**
 * Change your username. The format and the reserved names are checked by
 * `validHandle` (INVALID); a name someone else has, in any letter case, is
 * CONFLICT. Keeping your own name is allowed and changes nothing.
 */
export async function changeHandle(
  db: Db,
  accountId: string,
  handleInput: string,
): Promise<{ handle: string }> {
  const handle = validHandle(handleInput);
  return withTx(db, async (tx) => {
    const [me] = await tx
      .select({ handle: accounts.handle })
      .from(accounts)
      .where(activeAccount(accountId))
      .limit(1);
    if (!me) throw notFound();
    if (me.handle === handle) return { handle };
    const [taken] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(sql`lower(${accounts.handle}) = ${handle}`, ne(accounts.id, accountId)))
      .limit(1);
    if (taken) throw conflict(HANDLE_TAKEN);
    try {
      await withTx(tx, (sp) =>
        sp.update(accounts).set({ handle }).where(eq(accounts.id, accountId)),
      );
    } catch (error) {
      // Two people racing for one name: the unique index decides.
      if (isUniqueViolation(error)) throw conflict(HANDLE_TAKEN);
      throw error;
    }
    return { handle };
  });
}

/**
 * The settings form: name, username and bio together. Every field is
 * checked before anything is written, and the writes share a transaction,
 * so a refusal changes nothing.
 */
export async function saveProfile(
  db: Db,
  accountId: string,
  input: { displayName: string; handle: string; bio: string },
): Promise<{ handle: string }> {
  const displayName = validDisplayName(input.displayName);
  const handle = validHandle(input.handle);
  const bio = validBio(input.bio);
  return withTx(db, async (tx) => {
    const result = await changeHandle(tx, accountId, handle);
    await updateProfile(tx, accountId, { displayName, bio });
    return result;
  });
}

/**
 * Turning it off deletes every follow of this account, in the same
 * transaction (SPEC §6). Posts keep their audience; the canSeePost rule
 * then shows 'followers' posts to friends only.
 */
export async function setAcceptsFollowers(
  db: Db,
  accountId: string,
  value: boolean,
): Promise<void> {
  const accepts = requireBoolean(value);
  await withTx(db, async (tx) => {
    const rows = await tx
      .update(accounts)
      .set({ acceptsFollowers: accepts })
      .where(activeAccount(accountId))
      .returning({ id: accounts.id });
    if (rows.length === 0) throw notFound();
    if (!accepts) {
      await tx.delete(follows).where(eq(follows.followeeId, accountId));
    }
  });
}

export async function setWeeklyEmail(
  db: Db,
  accountId: string,
  value: boolean,
): Promise<void> {
  const weekly = requireBoolean(value);
  const rows = await db
    .update(accounts)
    .set({ weeklyEmail: weekly })
    .where(activeAccount(accountId))
    .returning({ id: accounts.id });
  if (rows.length === 0) throw notFound();
}

/* -------------------------------------------------------------- deletion */

/**
 * Delete the account row; cascades remove sessions, posts, replies, likes,
 * friendships, follows, blocks, mutes, notifications, invites and friend
 * requests. Reports the person made keep the report with the reporter set
 * to null. `confirmHandle` must be the account's own username.
 *
 * The address also leaves the tables that hold it without a reference to
 * the account: unused links and development mail sent to it.
 */
export async function deleteAccount(
  db: Db,
  accountId: string,
  confirmHandle: string,
): Promise<void> {
  await withTx(db, async (tx) => {
    const [me] = await tx
      .select({ id: accounts.id, handle: accounts.handle, email: accounts.email })
      .from(accounts)
      .where(activeAccount(accountId))
      .for("update")
      .limit(1);
    if (!me) throw notFound();
    const typed =
      typeof confirmHandle === "string"
        ? confirmHandle.trim().replace(/^@/, "").toLowerCase()
        : "";
    if (typed !== me.handle) throw invalid(CONFIRM_MISMATCH);

    await tx.delete(emailTokens).where(eq(emailTokens.email, me.email));
    await tx.delete(pendingJoins).where(eq(pendingJoins.email, me.email));
    await tx.delete(outbox).where(eq(outbox.toAddress, me.email));
    await tx.delete(accounts).where(eq(accounts.id, me.id));
  });
}

/* --------------------------------------------------------------- sign in */

/**
 * Rate-limited (5/hour per email hash, 20/hour per IP hash). Sends a
 * sign-in link only if an active account exists; otherwise it does
 * nothing and returns the same way, so the caller always shows the same
 * answer (SIGN_IN_ANSWER). The limits count every request, whether or not
 * the account exists, so a refusal says nothing about the address either.
 *
 * `ipHash` is `clientIpHash()` from the web layer: already a keyed hash,
 * never an address.
 */
export async function requestSignIn(
  db: Db,
  input: { email: string; ipHash: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const email = normEmail(input.email);
  const ipHash =
    typeof input.ipHash === "string" && input.ipHash
      ? input.ipHash
      : rateKeyHash("unknown");

  // Each hit commits on its own (SPEC §10: before, not inside, a
  // transaction that may fail), so a refused request is still counted.
  await hit(db, `signin:ip:${ipHash}`, { ...RATE.signinIp, now });
  await hit(db, `signin:email:${rateKeyHash(email)}`, {
    ...RATE.signinEmail,
    now,
  });

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.email, email), isNull(accounts.suspendedAt)))
    .limit(1);
  if (!account) return;

  const token = await createEmailToken(db, { email, purpose: "sign_in", now });
  const { subject, body } = signInEmail(`${appUrl()}/auth#${token}`);
  // A transport failure is logged in mail_log; the answer stays the same.
  await sendMail(db, { to: email, subject, body, kind: "sign_in", accountId: account.id });
}

export type VerifyEmailLinkResult =
  | { kind: "signed_in"; accountId: string }
  | { kind: "join_pending"; pendingJoinId: string }
  | { kind: "joined_existing"; accountId: string };

/**
 * Use an emailed link (SPEC §8), in one transaction:
 *
 * - `sign_in`: the account for the address, if it is active.
 * - `join`, an account exists for the address: it is signed in, and the
 *   invite is applied as for an existing account (M2's
 *   `useInviteAsExisting`). An invite that can no longer be used
 *   (NOT_FOUND there) still signs the person in, and applies nothing.
 * - `join`, no account: a pending join, while accounts can be created
 *   (CLOSED otherwise).
 *
 * Unknown, used and expired links, and links for a suspended or deleted
 * account, are all the same NOT_FOUND. The caller creates the session for
 * `signed_in` and `joined_existing`, and sets the join cookie for
 * `join_pending`. A refusal rolls back, so the token is marked used only
 * when the link did what it was for.
 */
export async function verifyEmailLink(
  db: Db,
  input: { token: string; now?: Date },
): Promise<VerifyEmailLinkResult> {
  const now = input.now ?? new Date();
  return withTx(db, async (tx): Promise<VerifyEmailLinkResult> => {
    let link: Awaited<ReturnType<typeof consumeEmailToken>>;
    try {
      link = await consumeEmailToken(tx, input.token, now);
    } catch (error) {
      if (isCoreError(error) && error.code === "NOT_FOUND") {
        throw notFound(LINK_REFUSED);
      }
      throw error;
    }

    const [account] = await tx
      .select({ id: accounts.id, suspendedAt: accounts.suspendedAt })
      .from(accounts)
      .where(eq(accounts.email, link.email))
      .limit(1);
    if (account?.suspendedAt) throw notFound(LINK_REFUSED);

    if (link.purpose === "sign_in") {
      if (!account) throw notFound(LINK_REFUSED);
      return { kind: "signed_in", accountId: account.id };
    }

    if (!link.inviteId) throw notFound(LINK_REFUSED);

    if (account) {
      try {
        // A savepoint, so a refusal inside cannot abort this transaction.
        const used = await withTx(tx, (sp) =>
          applyInviteAsExisting(sp, {
            accountId: account.id,
            inviteId: link.inviteId!,
            now,
          }),
        );
        return used.status === "friends"
          ? { kind: "joined_existing", accountId: account.id }
          : { kind: "signed_in", accountId: account.id };
      } catch (error) {
        if (isCoreError(error) && error.code === "NOT_FOUND") {
          return { kind: "signed_in", accountId: account.id };
        }
        throw error;
      }
    }

    if (!accountCreationOpen()) throw closed();
    const pending = await createPendingJoin(tx, {
      email: link.email,
      inviteId: link.inviteId,
      now,
    });
    return { kind: "join_pending", pendingJoinId: pending.id };
  });
}
