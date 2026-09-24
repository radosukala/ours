/**
 * Cookies. Both are httpOnly, sameSite=lax, secure in production, path /.
 * The values are signed by the core (`id.hmac(id)`); this file only moves
 * them in and out of the request.
 */
import { cookies } from "next/headers";
import { sessionIdFromCookie } from "@/core/auth";

export const SESSION_COOKIE = "ours_session";
export const JOIN_COOKIE = "ours_join";

function options(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

/* ---------------------------------------------------------------- session */

export async function setSessionCookie(
  cookieValue: string,
  expiresAt: Date,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, cookieValue, options(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", options(new Date(0)));
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value || null;
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
  (await cookies()).set(JOIN_COOKIE, cookieValue, options(expiresAt));
}

export async function clearJoinCookie(): Promise<void> {
  (await cookies()).set(JOIN_COOKIE, "", options(new Date(0)));
}

export async function readJoinCookie(): Promise<string | null> {
  return (await cookies()).get(JOIN_COOKIE)?.value || null;
}
