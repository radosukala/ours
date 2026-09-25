/**
 * Identity: emailed links, sessions and signed values.
 *
 * - An email token is 32 random bytes. Only its sha256 is stored; the raw
 *   token exists only in the email. It works once, for 15 minutes.
 * - A session id is 32 random bytes. The cookie carries `id.hmac(id)`; the
 *   HMAC stops anyone from minting a cookie, the row lets us revoke it.
 * - A pending join is a verified email waiting to choose a handle, held in
 *   a signed cookie for 60 minutes.
 * - An invite offer is a join link opened by someone who already has an
 *   account: the invite waits, in a signed cookie for 15 minutes, for them
 *   to say Add or Not now (SPEC §17 item 1).
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  EMAIL_TOKEN_TTL_MINUTES,
  INVITE_OFFER_TTL_MINUTES,
  PENDING_JOIN_TTL_MINUTES,
  SESSION_TTL_DAYS,
  sessionSecret,
} from "./config";
import type { Db } from "./db";
import { invalid, notFound } from "./errors";
import { hmac, newId, randomToken, sha256, timingSafeEqualStr } from "./ids";
import {
  accounts,
  emailTokens,
  type EmailTokenPurpose,
  pendingJoins,
  sessions,
} from "./schema";
import { normEmail } from "./validate";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const MAX_TOKEN_LENGTH = 200;

const LINK_REFUSED = "This link has expired or was already used.";

/* --------------------------------------------------------- signed values */

/** `value.hmac(value)` with the session secret. */
export function signValue(value: string): string {
  if (!value || value.includes(".")) {
    throw new Error("signValue: the value must be non-empty and contain no '.'");
  }
  return `${value}.${hmac(sessionSecret(), value)}`;
}

/** The value inside a signed string, or null if the signature does not match. */
export function verifySignedValue(signed: unknown): string | null {
  if (typeof signed !== "string" || signed.length > 512) return null;
  const cut = signed.lastIndexOf(".");
  if (cut < 1 || cut === signed.length - 1) return null;
  const value = signed.slice(0, cut);
  const given = signed.slice(cut + 1);
  const expected = hmac(sessionSecret(), value);
  return timingSafeEqualStr(given, expected) ? value : null;
}

/* ---------------------------------------------------------- email tokens */

/**
 * Create a single-use link token and return the raw token, which goes into
 * the email and nowhere else. A 'join' token must carry its invite; a
 * 'sign_in' token must not.
 */
export async function createEmailToken(
  db: Db,
  {
    email,
    purpose,
    inviteId,
    now = new Date(),
  }: {
    email: string;
    purpose: EmailTokenPurpose;
    inviteId?: string | null;
    now?: Date;
  },
): Promise<string> {
  if (purpose === "join" && !inviteId) {
    throw invalid("A join link needs an invite.");
  }
  if (purpose === "sign_in" && inviteId) {
    throw invalid("A sign-in link does not carry an invite.");
  }
  const token = randomToken(32);
  await db.insert(emailTokens).values({
    id: newId(),
    tokenHash: sha256(token),
    email: normEmail(email),
    purpose,
    inviteId: purpose === "join" ? (inviteId ?? null) : null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MINUTES * MINUTE),
  });
  return token;
}

/**
 * What a token would do if it were used now, without using it or locking
 * it, or null for an unknown, used or expired token. A caller that must
 * lock something the link names (its account) before using it reads the
 * link with this first; `consumeEmailToken` then decides, so a link used
 * or retired in between is still refused.
 */
export async function peekEmailToken(
  db: Db,
  token: unknown,
  now: Date = new Date(),
): Promise<{ email: string; purpose: EmailTokenPurpose; inviteId: string | null } | null> {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const [row] = await db
    .select({
      email: emailTokens.email,
      purpose: emailTokens.purpose,
      inviteId: emailTokens.inviteId,
    })
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, sha256(token)),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Use a token. It is marked used in the same statement that checks it, so
 * two requests racing with one token cannot both succeed. Unknown, used and
 * expired tokens are all the same NOT_FOUND.
 */
export async function consumeEmailToken(
  db: Db,
  token: unknown,
  now: Date = new Date(),
): Promise<{ email: string; purpose: EmailTokenPurpose; inviteId: string | null }> {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) {
    throw notFound(LINK_REFUSED);
  }
  const rows = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailTokens.tokenHash, sha256(token)),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now),
      ),
    )
    .returning({
      email: emailTokens.email,
      purpose: emailTokens.purpose,
      inviteId: emailTokens.inviteId,
    });
  const row = rows[0];
  if (!row) throw notFound(LINK_REFUSED);
  return row;
}

/**
 * Mark every unused link to an address as used, so none of them can sign
 * in or join any more (sign out everywhere, SPEC §17 item 6). Returns how
 * many there were.
 */
export async function retireEmailTokens(
  db: Db,
  email: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(and(eq(emailTokens.email, normEmail(email)), isNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id });
  return rows.length;
}

/* -------------------------------------------------------------- sessions */

/**
 * Start a session for an active account. Returns the id and the cookie
 * value (`id.hmac(id)`). A suspended or missing account gets NOT_FOUND.
 */
export async function createSession(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<{ id: string; cookieValue: string; expiresAt: Date }> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)))
    .limit(1);
  if (!account) throw notFound();
  const id = randomToken(32);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * DAY);
  await db
    .insert(sessions)
    .values({ id, accountId, createdAt: now, expiresAt });
  return { id, cookieValue: signValue(id), expiresAt };
}

/** The session id inside a cookie value, if its HMAC is ours. */
export function sessionIdFromCookie(value: unknown): string | null {
  return verifySignedValue(value);
}

/**
 * The account a session cookie belongs to, or null. Checks the HMAC,
 * expiry, revocation and that the account is active.
 */
export async function sessionFromCookie(
  db: Db,
  value: unknown,
  now: Date = new Date(),
): Promise<string | null> {
  const id = sessionIdFromCookie(value);
  if (!id) return null;
  const [row] = await db
    .select({ accountId: sessions.accountId })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(
      and(
        eq(sessions.id, id),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        isNull(accounts.suspendedAt),
      ),
    )
    .limit(1);
  return row?.accountId ?? null;
}

/** Revoke one session (sign out). Revoking twice is harmless. */
export async function revokeSession(
  db: Db,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoke every session of an account (sign out everywhere, suspension). */
export async function revokeAllSessions(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length;
}

/* --------------------------------------------------------- pending joins */

/** A verified email waiting to choose a handle. Returns the signed cookie value. */
export async function createPendingJoin(
  db: Db,
  {
    email,
    inviteId,
    now = new Date(),
  }: { email: string; inviteId: string; now?: Date },
): Promise<{ id: string; cookieValue: string; expiresAt: Date }> {
  const id = newId();
  const expiresAt = new Date(now.getTime() + PENDING_JOIN_TTL_MINUTES * MINUTE);
  await db.insert(pendingJoins).values({
    id,
    email: normEmail(email),
    inviteId,
    createdAt: now,
    expiresAt,
  });
  return { id, cookieValue: signValue(id), expiresAt };
}

export type PendingJoinView = {
  id: string;
  email: string;
  inviteId: string;
  expiresAt: Date;
};

/** The pending join a cookie names, if it is signed, unexpired and not completed. */
export async function pendingJoinFromCookie(
  db: Db,
  value: unknown,
  now: Date = new Date(),
): Promise<PendingJoinView | null> {
  const id = verifySignedValue(value);
  if (!id) return null;
  const [row] = await db
    .select({
      id: pendingJoins.id,
      email: pendingJoins.email,
      inviteId: pendingJoins.inviteId,
      expiresAt: pendingJoins.expiresAt,
    })
    .from(pendingJoins)
    .where(
      and(
        eq(pendingJoins.id, id),
        isNull(pendingJoins.completedAt),
        gt(pendingJoins.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* ---------------------------------------------------------- invite offers */

const OFFER_TAG = "invite-offer";

/**
 * The signed cookie value that carries an invite offer: which invite, for
 * which account, until when. Tagged, so no other signed value (a session,
 * a pending join) can be read as one.
 */
export function inviteOfferCookieValue({
  inviteId,
  accountId,
  now = new Date(),
}: {
  inviteId: string;
  accountId: string;
  now?: Date;
}): { cookieValue: string; expiresAt: Date } {
  if (!/^[A-Za-z0-9_-]+$/.test(inviteId) || !/^[A-Za-z0-9_-]+$/.test(accountId)) {
    throw new Error("inviteOfferCookieValue: ids must be plain ids");
  }
  const expiresAt = new Date(now.getTime() + INVITE_OFFER_TTL_MINUTES * MINUTE);
  return {
    cookieValue: signValue(`${OFFER_TAG}:${inviteId}:${accountId}:${expiresAt.getTime()}`),
    expiresAt,
  };
}

/**
 * The invite offer inside a cookie value, or null when it is not ours, is
 * malformed, or has expired. The caller checks that `accountId` is the
 * signed-in person before showing or applying it.
 */
export function inviteOfferFromCookie(
  value: unknown,
  now: Date = new Date(),
): { inviteId: string; accountId: string; expiresAt: Date } | null {
  const inside = verifySignedValue(value);
  if (!inside) return null;
  const parts = inside.split(":");
  if (parts.length !== 4 || parts[0] !== OFFER_TAG) return null;
  const [, inviteId, accountId, expires] = parts as [string, string, string, string];
  if (!inviteId || !accountId || !/^\d{1,15}$/.test(expires)) return null;
  const expiresAt = new Date(Number(expires));
  if (expiresAt.getTime() <= now.getTime()) return null;
  return { inviteId, accountId, expiresAt };
}

/* ---------------------------------------------------------------- viewer */

export type ViewerAccount = {
  id: string;
  handle: string;
  displayName: string;
  isAdmin: boolean;
  acceptsFollowers: boolean;
  invitesRemaining: number;
};

/** What the web layer needs about the signed-in person, or null if not active. */
export async function viewerAccount(
  db: Db,
  accountId: string,
): Promise<ViewerAccount | null> {
  const [row] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
      isAdmin: accounts.isAdmin,
      acceptsFollowers: accounts.acceptsFollowers,
      invitesRemaining: accounts.invitesRemaining,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)))
    .limit(1);
  return row ?? null;
}

