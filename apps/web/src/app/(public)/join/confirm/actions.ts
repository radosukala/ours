"use server";

/**
 * The two answers on /join/confirm (SPEC §17 item 1). The invite comes from
 * the signed `ours_invite` cookie, set when a join link was opened by
 * someone who already has an account, and only for that account; never
 * from the form.
 *
 * - `addInviterAction` (Add): applies the invite (`useInviteAsExisting`,
 *   which re-checks everything under its locks), then goes to the
 *   inviter's profile. This is the only way a join link connects anyone.
 * - `notNowAction` (Not now): forgets the offer and goes home. The invite
 *   stays unused.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteOfferFromCookie } from "@/core/auth";
import { getDb } from "@/core/db";
import { CoreError } from "@/core/errors";
import {
  applyInviteAsExisting,
  INVITE_UNUSABLE,
  inviteOfferForViewer,
} from "@/core/invites";
import { type ActionResult, run } from "@/web/actions";
import { clearInviteCookie, readInviteCookie } from "@/web/session";
import { requireViewer } from "@/web/viewer";

export type ConfirmState = ActionResult | null;

export async function addInviterAction(
  _prev: ConfirmState,
  _form: FormData,
): Promise<ConfirmState> {
  let next: string | null = null;
  const result = await run(async () => {
    const viewer = await requireViewer();
    const db = getDb();
    const now = new Date();
    const offer = inviteOfferFromCookie(await readInviteCookie(), now);
    if (!offer || offer.accountId !== viewer.id) {
      await clearInviteCookie();
      throw new CoreError("NOT_FOUND", INVITE_UNUSABLE);
    }
    const state = await inviteOfferForViewer(db, {
      inviteId: offer.inviteId,
      viewerId: viewer.id,
      now,
    });
    if (state.kind !== "can_add" && state.kind !== "already_friends") {
      await clearInviteCookie();
      throw new CoreError("NOT_FOUND", INVITE_UNUSABLE);
    }
    try {
      const outcome = await applyInviteAsExisting(db, {
        accountId: viewer.id,
        inviteId: offer.inviteId,
        now,
      });
      if (outcome.status === "own_invite") {
        throw new CoreError("NOT_FOUND", INVITE_UNUSABLE);
      }
    } finally {
      await clearInviteCookie();
    }
    revalidatePath("/", "layout");
    next = `/u/${encodeURIComponent(state.invite.inviter.handle)}`;
  });
  if (result.ok && next) redirect(next);
  return result;
}

export async function notNowAction(): Promise<void> {
  await requireViewer();
  await clearInviteCookie();
  redirect("/home");
}
