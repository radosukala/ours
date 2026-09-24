"use server";

/**
 * Actions on an invite page (SPEC §8 "Join from an invite").
 *
 * - `requestJoinAction`: a signed-out person asks for a join link. The
 *   answer on success is always the same ("Check your email — we've sent a
 *   link."), whether or not the address has an account.
 * - `acceptInviteAction`: a signed-in person uses the invite to become the
 *   inviter's friend, then goes to the inviter's profile.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/core/db";
import { CoreError } from "@/core/errors";
import {
  applyInviteAsExisting,
  INVITE_UNUSABLE,
  lookupInvite,
  requestJoin,
} from "@/core/invites";
import { type ActionResult, run } from "@/web/actions";
import { clientIpHash } from "@/web/request";
import { requireViewer } from "@/web/viewer";

export type InviteFormState = ActionResult | null;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function requestJoinAction(
  _prev: InviteFormState,
  form: FormData,
): Promise<InviteFormState> {
  return run(async () => {
    await requestJoin(getDb(), {
      code: text(form, "code"),
      email: text(form, "email"),
      ipHash: await clientIpHash(),
    });
  });
}

export async function acceptInviteAction(
  _prev: InviteFormState,
  form: FormData,
): Promise<InviteFormState> {
  let next: string | null = null;
  const result = await run(async () => {
    const viewer = await requireViewer();
    const db = getDb();
    const now = new Date();
    const invite = await lookupInvite(db, text(form, "code"), now, viewer.id);
    if (!invite) throw new CoreError("NOT_FOUND", INVITE_UNUSABLE);
    const outcome = await applyInviteAsExisting(db, {
      accountId: viewer.id,
      inviteId: invite.inviteId,
      now,
    });
    if (outcome.status === "own_invite") {
      throw new CoreError("CONFLICT", "This is your own invite.");
    }
    revalidatePath("/", "layout");
    next = `/u/${encodeURIComponent(invite.inviter.handle)}`;
  });
  if (result.ok && next) redirect(next);
  return result;
}
