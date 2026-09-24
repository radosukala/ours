"use server";

/**
 * Using an emailed link (SPEC §8, "Sign in" step 5 and "Join from an
 * invite" step 2). The core decides what the link does
 * (`verifyEmailLink`); this action only moves the result into cookies:
 *
 * - signed in (with or without an invite applied): a new session, and any
 *   session this browser had before is revoked; then /home.
 * - a pending join: the signed join cookie; then /join.
 *
 * Public: the person is not signed in yet. The token is the only input,
 * and the core refuses anything that is not a live, unused token.
 */
import { verifyEmailLink } from "@/core/accounts";
import { createSession, revokeSession, signValue } from "@/core/auth";
import { PENDING_JOIN_TTL_MINUTES } from "@/core/config";
import { getDb } from "@/core/db";
import { type ActionResult, run } from "@/web/actions";
import {
  clearJoinCookie,
  currentSessionId,
  setJoinCookie,
  setSessionCookie,
} from "@/web/session";

export async function openEmailLinkAction(
  token: string,
): Promise<ActionResult<{ next: "/home" | "/join" }>> {
  return run(async () => {
    const db = getDb();
    const now = new Date();
    const result = await verifyEmailLink(db, {
      token: typeof token === "string" ? token : "",
      now,
    });

    if (result.kind === "join_pending") {
      await setJoinCookie(
        signValue(result.pendingJoinId),
        new Date(now.getTime() + PENDING_JOIN_TTL_MINUTES * 60_000),
      );
      return { next: "/join" as const };
    }

    const session = await createSession(db, result.accountId, now);
    const previous = await currentSessionId();
    if (previous) await revokeSession(db, previous, now);
    await setSessionCookie(session.cookieValue, session.expiresAt);
    await clearJoinCookie();
    return { next: "/home" as const };
  });
}
