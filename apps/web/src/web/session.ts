/**
 * Cookies. All are httpOnly, sameSite=lax, secure in production, path /,
 * and carry no Domain. The values are signed by the core (`id.hmac(id)`);
 * this file only moves them in and out of the request.
 *
 * - session: who is signed in (60 days).
 * - join: a pending join, from a join link for a new address (60 minutes).
 * - invite: an invite offer, from a join link opened by someone who already
 *   has an account, read by /join/confirm (15 minutes, SPEC §17 item 1).
 *
 * In production each name carries the `__Host-` prefix (SPEC §17 item 8).
 * A browser accepts such a cookie only from this exact host, over HTTPS,
 * with Path=/ and no Domain, so a sibling subdomain (D-0004 puts
 * community tools on subdomains) cannot plant one. The plain names are
 * used in development, where the site runs over http and a `__Host-`
 * cookie would be refused; they are never read in production.
 */
import { cookies } from "next/headers";
import { sessionIdFromCookie } from "@/core/auth";
import { isProduction } from "@/core/config";

/** The cookies' names in development and tests; see `cookieName`. */
export const SESSION_COOKIE = "ours_session";
export const JOIN_COOKIE = "ours_join";
export const INVITE_COOKIE = "ours_invite";

type CookieBase = typeof SESSION_COOKIE | typeof JOIN_COOKIE | typeof INVITE_COOKIE;

/** The name a cookie is set and read under: `__Host-<name>` in production. */
export function cookieName(base: CookieBase): string {
  return isProduction() ? `__Host-${base}` : base;
}

function options(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    path: "/",
    expires,
  };
}

async function setCookie(base: CookieBase, value: string, expires: Date): Promise<void> {
  (await cookies()).set(cookieName(base), value, options(expires));
}

async function clearCookie(base: CookieBase): Promise<void> {
  (await cookies()).set(cookieName(base), "", options(new Date(0)));
}

async function readCookie(base: CookieBase): Promise<string | null> {
  return (await cookies()).get(cookieName(base))?.value || null;
}

/* ---------------------------------------------------------------- session */

export async function setSessionCookie(
  cookieValue: string,
  expiresAt: Date,
): Promise<void> {
  await setCookie(SESSION_COOKIE, cookieValue, expiresAt);
}

export async function clearSessionCookie(): Promise<void> {
  await clearCookie(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<string | null> {
  return readCookie(SESSION_COOKIE);
}

/** The id of this request's session, if its cookie is signed by us. */
export async function currentSessionId(): Promise<string | null> {
  const raw = await readSessionCookie();
  return raw ? sessionIdFromCookie(raw) : null;
}

/* ------------------------------------------------------------ pending join */

export async function setJoinCookie(
  cookieValue: string,
  expiresAt: Date,
): Promise<void> {
  await setCookie(JOIN_COOKIE, cookieValue, expiresAt);
}

export async function clearJoinCookie(): Promise<void> {
  await clearCookie(JOIN_COOKIE);
}

export async function readJoinCookie(): Promise<string | null> {
  return readCookie(JOIN_COOKIE);
}

/* ------------------------------------------------------------ invite offer */

export async function setInviteCookie(
  cookieValue: string,
  expiresAt: Date,
): Promise<void> {
  await setCookie(INVITE_COOKIE, cookieValue, expiresAt);
}

export async function clearInviteCookie(): Promise<void> {
  await clearCookie(INVITE_COOKIE);
}

export async function readInviteCookie(): Promise<string | null> {
  return readCookie(INVITE_COOKIE);
}
