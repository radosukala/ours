"use server";

/**
 * Server actions behind the post components (like, the ⋯ menu, deleting a
 * reply). Each one gets the viewer, calls the core, and returns
 * `{ ok: true, … } | { ok: false, error }` (SPEC §10). Every permission
 * decision is the core's; these only pass the viewer's id along.
 *
 * Arguments arrive from the browser, so each is checked to be a string
 * before it reaches the core. An id that is not a string is answered like a
 * missing post.
 */
import { revalidatePath } from "next/cache";
import { block, mute, unmute } from "@/core/connections";
import { getDb } from "@/core/db";
import { notFound } from "@/core/errors";
import { deletePost, deleteReply, toggleLike } from "@/core/posts";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

function idArg(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) {
    throw notFound();
  }
  return value;
}

/** Like or unlike. No revalidation: the button already shows the answer. */
export async function toggleLikeAction(postId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    const { liked } = await toggleLike(getDb(), viewer.id, idArg(postId));
    return { liked };
  });
}

/** Delete your own post. The list it was in hides it on success. */
export async function deletePostAction(postId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    await deletePost(getDb(), viewer.id, idArg(postId));
  });
}

/** Delete a reply you wrote, or one on your post. */
export async function deleteReplyAction(replyId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    await deleteReply(getDb(), viewer.id, idArg(replyId));
    revalidatePath("/p/[id]", "page");
  });
}

/** Mute: their posts leave your feed. Private; they are not told. */
export async function mutePersonAction(personId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    await mute(getDb(), viewer.id, idArg(personId));
  });
}

export async function unmutePersonAction(personId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    await unmute(getDb(), viewer.id, idArg(personId));
  });
}

/**
 * Block: takes effect at once (the core removes the friendship, follows,
 * requests, likes and notifications between you). The navigation's counts
 * can change, so the layout is revalidated.
 */
export async function blockPersonAction(personId: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    await block(getDb(), viewer.id, idArg(personId));
    revalidatePath("/", "layout");
  });
}
