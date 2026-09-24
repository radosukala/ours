"use server";

/**
 * /u/[handle]'s server action: the next page of a person's posts. The core
 * lists only the posts the viewer may see, whatever author id arrives.
 */
import { getDb } from "@/core/db";
import { invalid, notFound } from "@/core/errors";
import { listPostsByAuthor } from "@/core/posts";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

/** Bound to the author's id on the page: `.bind(null, authorId)`. */
export async function loadMoreProfilePostsAction(authorId: unknown, cursor: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    if (typeof authorId !== "string" || authorId.length < 1 || authorId.length > 64) {
      throw notFound();
    }
    if (typeof cursor !== "string" || cursor === "") {
      throw invalid("That page link isn't valid. Reload and try again.");
    }
    const page = await listPostsByAuthor(getDb(), viewer.id, authorId, { cursor });
    return { items: page.items, nextCursor: page.nextCursor };
  });
}
