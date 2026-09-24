"use server";

/**
 * /p/[id]'s server action: reply. The core refuses a reply the viewer may
 * not make (canReply) with NOT_FOUND, like a post that does not exist.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { notFound } from "@/core/errors";
import { createReply } from "@/core/posts";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

/** Bound to the post's id on the page: `createReplyAction.bind(null, id)`. */
export async function createReplyAction(postId: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    if (typeof postId !== "string" || postId.length < 1 || postId.length > 64) {
      throw notFound();
    }
    const body = form.get("body");
    const { id } = await createReply(getDb(), viewer.id, postId, {
      body: typeof body === "string" ? body : "",
    });
    revalidatePath("/p/[id]", "page");
    return { id };
  });
}
