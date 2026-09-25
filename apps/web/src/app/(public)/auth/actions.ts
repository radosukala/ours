"use server";

/**
 * Using an emailed link (SPEC §8, "Sign in" step 5 and "Join from an
 * invite" step 2, as amended by §17 items 1 and 5). The core decides what
 * the link does and starts the session in the same transaction as it uses
 * the link (`openEmailLink`), so "sign out everywhere" cannot slip between
 * the two; this action only moves the result into cookies:
 *
 * - signed in: a new session, and any session this browser had before is
 *   revoked; then /home.
 * - a join link for an existing account: signed in the same way, and the
 *   invite offer goes into the signed `ours_invite` cookie (15 minutes);
 *   then /join/confirm, which asks before anything is applied.
 * - a pending join: the signed join cookie; then /join.
 * - this browser is signed in as another account: nothing is used, and the
 *   answer says who is signed in (`signedInAs`), so the page can offer to
 *   sign out first.
 *
 * Public: the person may not be signed in yet. The token is the only
 * input, and the core refuses anything that is not a live, unused token.
 */
import { openEmailLink, SignedInElsewhere } from "@/core/accounts";
import {
  inviteOfferCookieValue,
  revokeSession,
  sessionFromCookie,
  signValue,
} from "@/core/auth";
import { PENDING_JOIN_TTL_MINUTES } from "@/core/config";
import { getDb } from "@/core/db";
import { type ActionFail, type ActionResult, run } from "@/web/actions";
import {
  clearInviteCookie,
  clearJoinCookie,
  currentSessionId,
  readSessionCookie,
  setInviteCookie,
  setJoinCookie,
  setSessionCookie,
} from "@/web/session";

export type OpenLinkResult =
  | ActionResult<{ next: "/home" | "/join" | "/join/confirm" }>
  | (ActionFail & { signedInAs: string });

export async function openEmailLinkAction(token: string): Promise<OpenLinkResult> {
  let signedInAs = null as string | null;
  const result = await run(async () => {
    const db = getDb();
    const now = new Date();
    const current = await sessionFromCookie(db, await readSessionCookie(), now);
    let link: Awaited<ReturnType<typeof openEmailLink>>;
    try {
      link = await openEmailLink(db, {
        token: typeof token === "string" ? token : "",
        now,
        signedInAs: current,
      });
    } catch (error) {
      if (error instanceof SignedInElsewhere) signedInAs = error.handle;
      throw error;
    }

    if (link.kind === "join_pending") {
      await setJoinCookie(
        signValue(link.pendingJoinId),
        new Date(now.getTime() + PENDING_JOIN_TTL_MINUTES * 60_000),
      );
      return { next: "/join" as const };
    }

    const { session } = link;
    const previous = await currentSessionId();
    if (previous) await revokeSession(db, previous, now);
    await setSessionCookie(session.cookieValue, session.expiresAt);
    await clearJoinCookie();

    if (link.kind === "joined_existing") {
      const offer = inviteOfferCookieValue({
        inviteId: link.inviteId,
        accountId: link.accountId,
        now,
      });
      await setInviteCookie(offer.cookieValue, offer.expiresAt);
      return { next: "/join/confirm" as const };
    }
    await clearInviteCookie();
    return { next: "/home" as const };
  });
  if (!result.ok && signedInAs) return { ...result, signedInAs };
  return result;
}
