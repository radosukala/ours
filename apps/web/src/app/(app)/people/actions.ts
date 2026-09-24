"use server";

/**
 * Server actions for connections and invites (SPEC §8, §10). The profile
 * header, the /people pages and anyone else who needs them (a post's ⋯
 * menu, the blocked list) import them from here.
 *
 * Each one gets the viewer, calls the core, revalidates, and returns
 * `{ ok: true, … } | { ok: false, error }`. Every one of them revalidates
 * the whole layout: a request, an acceptance or an invite changes the
 * counts in the navigation and the right column.
 *
 * Arguments come from the browser, so they are untrusted: an id that is not
 * a plausible id is the same NOT_FOUND the core would give.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl } from "@/core/config";
import {
  acceptFriendRequest,
  block,
  cancelFriendRequest,
  declineFriendRequest,
  follow,
  type FriendRequestResult,
  mute,
  PERSON_NOT_FOUND,
  REQUEST_NOT_FOUND,
  sendFriendRequest,
  unblock,
  unfollow,
  unfriend,
  unmute,
} from "@/core/connections";
import { getDb } from "@/core/db";
import { CoreError } from "@/core/errors";
import { createInvite, revokeInvite } from "@/core/invites";
import { type ActionResult, run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

/** A plausible id (ulid text), or the NOT_FOUND the core would give. */
function idArg(value: unknown, message: string = PERSON_NOT_FOUND): string {
  if (typeof value !== "string" || !/^[0-9A-Za-z]{1,64}$/.test(value)) {
    throw new CoreError("NOT_FOUND", message);
  }
  return value;
}

/** A local path to go to after an action, or null. Never another site. */
function localPath(value: unknown): string | null {
  return typeof value === "string" && /^\/(?![/\\])[\w\-./@#?=&]*$/.test(value)
    ? value
    : null;
}

function refresh(): void {
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------- friend requests */

export async function sendFriendRequestAction(
  otherId: string,
): Promise<ActionResult<{ status: FriendRequestResult["status"] }>> {
  return run(async () => {
    const viewer = await requireViewer();
    const result = await sendFriendRequest(getDb(), viewer.id, idArg(otherId));
    refresh();
    return { status: result.status };
  });
}

export async function acceptFriendRequestAction(fromId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await acceptFriendRequest(getDb(), viewer.id, idArg(fromId, REQUEST_NOT_FOUND));
    refresh();
  });
}

export async function declineFriendRequestAction(fromId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await declineFriendRequest(getDb(), viewer.id, idArg(fromId, REQUEST_NOT_FOUND));
    refresh();
  });
}

export async function cancelFriendRequestAction(toId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await cancelFriendRequest(getDb(), viewer.id, idArg(toId, REQUEST_NOT_FOUND));
    refresh();
  });
}

export async function unfriendAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unfriend(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

/* ---------------------------------------------------------------- follows */

export async function followAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await follow(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

export async function unfollowAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unfollow(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

/* ---------------------------------------------------------- block, mute */

/**
 * Block someone. With `then` (a local path), go there afterwards: a
 * profile you have blocked is not found, so the profile header sends you
 * home instead of leaving you on a page that just disappeared.
 */
export async function blockAction(
  otherId: string,
  then?: string,
): Promise<ActionResult> {
  const result = await run(async () => {
    const viewer = await requireViewer();
    await block(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
  const next = localPath(then);
  if (result.ok && next) redirect(next);
  return result;
}

export async function unblockAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unblock(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

export async function muteAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await mute(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

export async function unmuteAction(otherId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unmute(getDb(), viewer.id, idArg(otherId));
    refresh();
  });
}

/* ---------------------------------------------------------------- invites */

export type CreateInviteState = ActionResult<{ url: string; expiresAt: string }> | null;

/**
 * Create an invite link (for `useActionState`). The link is returned once
 * and shown once; only a hash of its code is kept.
 */
export async function createInviteAction(
  _prev: CreateInviteState,
  form: FormData,
): Promise<CreateInviteState> {
  return run(async () => {
    const viewer = await requireViewer();
    const note = form.get("note");
    const { code, expiresAt } = await createInvite(getDb(), viewer.id, {
      note: typeof note === "string" ? note : "",
    });
    refresh();
    return { url: `${appUrl()}/i/${code}`, expiresAt: expiresAt.toISOString() };
  });
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await revokeInvite(getDb(), viewer.id, idArg(inviteId, "That invite isn't available."));
    refresh();
  });
}
