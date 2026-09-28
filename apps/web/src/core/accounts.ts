/**
 * Accounts (M1; SPEC §6, §8, §13): profiles and settings, signing in by
 * an emailed link, and deleting an account.
 *
 * Every function takes the account id from the caller's session; none of
 * them takes a second account to act on. A suspended account can do
 * nothing (SPEC §6), so each write refuses it with NOT_FOUND, the same
 * answer as an account that does not exist.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { accountCreationOpen, appUrl, clientIpHeader } from "./config";
import {
  consumeEmailToken,
  createEmailToken,
  createPendingJoin,
  createSession,
  peekEmailToken,
  retireEmailTokens,
  revokeAllSessions,
} from "./auth";
import { type Db, withTx } from "./db";
import { closed, conflict, CoreError, invalid, isCoreError, notFound } from "./errors";
import { inviteOfferForViewer } from "./invites";
import { hit, RATE, rateKeyHash } from "./limits";
import { type Defer, nowOrDeferred, sendMail } from "./mail";
import { signInEmail } from "./mail-templates";
import {
  accounts,
  emailTokens,
  follows,
  invites,
  outbox,
  pendingJoins,
  waitlist,
} from "./schema";
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

/** CLOSED while production names no client-address header (SPEC §17 item 3). */
export const SIGN_IN_REQUESTS_OFF =
  "This server can't send sign-in links yet: its setup doesn't name the header that carries each visitor's address (CLIENT_IP_HEADER).";

const HANDLE_TAKEN = "That username is taken. Choose another.";
const CONFIRM_MISMATCH = "Type your username exactly as shown to confirm.";

/**
 * An emailed link opened in a browser signed in as another account (SPEC
 * §17 item 5). The link is not used: the person signs out first, then
 * opens it again.
 */
export class SignedInElsewhere extends CoreError {
  readonly handle: string;

  constructor(handle: string) {
    super(
      "CONFLICT",
      `You're signed in as @${handle}. Sign out first, then open the link again.`,
    );
    this.handle = handle;
  }
}

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
 *
 * Usernames are unique, so trying one tells you whether it is taken, even
 * when its holder blocked you or is suspended. SPEC §17 item 9 accepts
 * this, says so on /rules, and limits tries at a new username to 5 a day
 * (`handle:<accountId>`). Every try counts, taken or not: the limit is
 * recorded before the transaction, so a refusal does not roll it back.
 */
export async function changeHandle(
  db: Db,
  accountId: string,
  handleInput: string,
  now: Date = new Date(),
): Promise<{ handle: string }> {
  const handle = validHandle(handleInput);
  await countHandleTry(db, accountId, handle, now);
  return changeHandleWithin(db, accountId, handle);
}

/**
 * Record a try at a new username, or throw RATE_LIMITED. Keeping the
 * current name is not a try. `db` must not be a transaction that may
 * still roll back (SPEC §10).
 */
async function countHandleTry(
  db: Db,
  accountId: string,
  handle: string,
  now: Date,
): Promise<void> {
  const [me] = await db
    .select({ handle: accounts.handle })
    .from(accounts)
    .where(activeAccount(accountId))
    .limit(1);
  if (!me) throw notFound();
  if (me.handle === handle) return;
  await hit(db, `handle:${accountId}`, { ...RATE.handle, now });
}

async function changeHandleWithin(
  db: Db,
  accountId: string,
  handle: string,
): Promise<{ handle: string }> {
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
  input: { displayName: string; handle: string; bio: string; now?: Date },
): Promise<{ handle: string }> {
  const displayName = validDisplayName(input.displayName);
  const handle = validHandle(input.handle);
  const bio = validBio(input.bio);
  // Counted before the transaction, so a refused name still counts.
  await countHandleTry(db, accountId, handle, input.now ?? new Date());
  return withTx(db, async (tx) => {
    const result = await changeHandleWithin(tx, accountId, handle);
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
 *
 * Lock order (SPEC §17 item 7): the join links made from this account's
 * invites, then the invites, then the account. A join takes the same order
 * (its link, its invite, then the inviter's account through `invited_by`),
 * so a join racing the inviter's deletion waits instead of deadlocking.
 */
export async function deleteAccount(
  db: Db,
  accountId: string,
  confirmHandle: string,
): Promise<void> {
  await withTx(db, async (tx) => {
    const mine = tx
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.inviterId, accountId));
    await tx
      .select({ id: emailTokens.id })
      .from(emailTokens)
      .where(inArray(emailTokens.inviteId, mine))
      .for("update");
    await tx
      .select({ id: invites.id })
      .from(invites)
      .where(eq(invites.inviterId, accountId))
      .for("update");

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
    // A place in the seat line under this address goes too (SPEC §18.12):
    // otherwise the next wave would email a seat to someone who left.
    await tx.delete(waitlist).where(eq(waitlist.email, me.email));
    await tx.delete(accounts).where(eq(accounts.id, me.id));
  });
}

/* -------------------------------------------------------------- sign out */

/**
 * Sign out everywhere (SPEC §8, §17 item 6): revoke every session of the
 * account, and mark every unused sign-in and join link to its address as
 * used, so a link requested before cannot sign anyone in afterwards.
 *
 * It locks the account row for update first. A link being opened holds
 * that row for share from before it is used until its session exists
 * (`openEmailLink`), so the two serialize, and no session started by a
 * link opened a moment before outlives this (the second verification's
 * identity defect 4).
 */
export async function signOutEverywhere(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<void> {
  await withTx(db, async (tx) => {
    const [me] = await tx
      .select({ email: accounts.email })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for("update")
      .limit(1);
    if (!me) throw notFound();
    await revokeAllSessions(tx, accountId, now);
    await retireEmailTokens(tx, me.email, now);
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
 * Whether the account exists, the link and the mail are one task, which
 * runs after the response when the caller passes `defer` (SPEC §17 item
 * 4): the request itself then does the same work, and takes the same time,
 * for every address. Without `defer` (tests, scripts) it runs inline.
 *
 * Refused with CLOSED while production names no client-address header
 * (SPEC §17 item 3). `ipHash` is `clientIpHash()` from the web layer:
 * already a keyed hash, never an address.
 */
export async function requestSignIn(
  db: Db,
  input: { email: string; ipHash: string; now?: Date; defer?: Defer },
): Promise<void> {
  const now = input.now ?? new Date();
  if (!clientIpHeader()) throw closed(SIGN_IN_REQUESTS_OFF);
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

  await nowOrDeferred(async () => {
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
  }, input.defer);
}

export type VerifyEmailLinkResult =
  | { kind: "signed_in"; accountId: string }
  | { kind: "join_pending"; pendingJoinId: string }
  /** A join link for an existing account: signed in, the invite offered, nothing applied. */
  | { kind: "joined_existing"; accountId: string; inviteId: string };

/** A session `openEmailLink` started: its id, the cookie value and when it ends. */
export type StartedSession = { id: string; cookieValue: string; expiresAt: Date };

/** What /auth does with a link: `VerifyEmailLinkResult`, with the session it started. */
export type OpenedEmailLink =
  | { kind: "join_pending"; pendingJoinId: string }
  | { kind: "signed_in"; accountId: string; session: StartedSession }
  | { kind: "joined_existing"; accountId: string; inviteId: string; session: StartedSession };

/**
 * Use an emailed link (SPEC §8, as amended by §17 items 1 and 5), in one
 * transaction:
 *
 * - `sign_in`: the account for the address, if it is active.
 * - `join`, an account exists for the address: it is signed in, and
 *   nothing else happens here. If the invite could be added (usable, not
 *   their own, no block either way, not friends already), the result is
 *   `joined_existing` with the invite's id, and the caller asks "Add <Name>
 *   (@handle) as a friend?" on /join/confirm; only their Add applies it.
 *   Otherwise the result is plain `signed_in`.
 * - `join`, no account: a pending join, while accounts can be created
 *   (CLOSED otherwise).
 *
 * `signedInAs` is the account of a live session this browser already has.
 * If the link is for anyone else, it is refused with SignedInElsewhere
 * (CONFLICT) and nothing is used: the person signs out first.
 *
 * Unknown, used and expired links, and links for a suspended or deleted
 * account, are all the same NOT_FOUND. A refusal rolls back, so the token
 * is marked used only when the link did what it was for.
 *
 * This decides only; /auth calls `openEmailLink`, which also starts the
 * session in the same transaction.
 */
export async function verifyEmailLink(
  db: Db,
  input: { token: string; now?: Date; signedInAs?: string | null },
): Promise<VerifyEmailLinkResult> {
  return withTx(db, (tx) => verifyEmailLinkWithin(tx, input));
}

/**
 * `verifyEmailLink` and, for `signed_in` and `joined_existing`, the new
 * session, in ONE transaction, with the link's account locked for share
 * from before the link is used until the session exists.
 *
 * `signOutEverywhere` locks the same row for update before it revokes the
 * sessions and retires the links, so the two cannot interleave (the second
 * verification's identity defect 4): either the link commits first, with
 * its session, and sign out everywhere then revokes that session too; or
 * sign out everywhere commits first, having retired the link, and the link
 * is refused. No session outlives a finished "sign out everywhere".
 */
export async function openEmailLink(
  db: Db,
  input: { token: string; now?: Date; signedInAs?: string | null },
): Promise<OpenedEmailLink> {
  const now = input.now ?? new Date();
  return withTx(db, async (tx): Promise<OpenedEmailLink> => {
    const link = await verifyEmailLinkWithin(tx, { ...input, now });
    if (link.kind === "join_pending") return link;
    const session = await createSession(tx, link.accountId, now);
    return { ...link, session };
  });
}

async function verifyEmailLinkWithin(
  tx: Db,
  input: { token: string; now?: Date; signedInAs?: string | null },
): Promise<VerifyEmailLinkResult> {
  const now = input.now ?? new Date();

  // Read the link first, without using it, to learn whose account it
  // names; lock that account for share; only then use the link. Lock
  // order: the account, then the link, as sign out everywhere takes them.
  const named = await peekEmailToken(tx, input.token, now);
  if (!named) throw notFound(LINK_REFUSED);
  const [account] = await tx
    .select({ id: accounts.id, suspendedAt: accounts.suspendedAt })
    .from(accounts)
    .where(eq(accounts.email, named.email))
    .for("share")
    .limit(1);

  let link: Awaited<ReturnType<typeof consumeEmailToken>>;
  try {
    // Used, retired or deleted since it was read: refused here.
    link = await consumeEmailToken(tx, input.token, now);
  } catch (error) {
    if (isCoreError(error) && error.code === "NOT_FOUND") {
      throw notFound(LINK_REFUSED);
    }
    throw error;
  }

  if (account?.suspendedAt) throw notFound(LINK_REFUSED);
  if (link.purpose === "sign_in" && !account) throw notFound(LINK_REFUSED);
  if (link.purpose === "join" && !link.inviteId) throw notFound(LINK_REFUSED);

  // A browser signed in as someone else is not switched (SPEC §17 item
  // 5). Thrown inside the transaction, so the link stays unused.
  if (input.signedInAs && input.signedInAs !== account?.id) {
    const [current] = await tx
      .select({ handle: accounts.handle })
      .from(accounts)
      .where(activeAccount(input.signedInAs))
      .limit(1);
    if (current) throw new SignedInElsewhere(current.handle);
  }

  if (link.purpose === "sign_in") {
    return { kind: "signed_in", accountId: account!.id };
  }

  if (account) {
    const offer = await inviteOfferForViewer(tx, {
      inviteId: link.inviteId!,
      viewerId: account.id,
      now,
    });
    return offer.kind === "can_add"
      ? { kind: "joined_existing", accountId: account.id, inviteId: offer.invite.inviteId }
      : { kind: "signed_in", accountId: account.id };
  }

  if (!accountCreationOpen()) throw closed();
  const pending = await createPendingJoin(tx, {
    email: link.email,
    inviteId: link.inviteId!,
    now,
  });
  return { kind: "join_pending", pendingJoinId: pending.id };
}
