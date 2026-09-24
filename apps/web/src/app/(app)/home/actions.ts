"use server";

/**
 * /home's server actions (SPEC §10): post, and load the next page of the
 * feed. Each gets the viewer, calls the core, and returns
 * `{ ok: true, … } | { ok: false, error }`.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { invalid } from "@/core/errors";
import { getFeed } from "@/core/feed";
import { createPost } from "@/core/posts";
import type { Audience } from "@/core/schema";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

/** Post to friends, or to friends and followers. Rate-limited by the core. */
export async function createPostAction(form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    const body = form.get("body");
    const audience = form.get("audience");
    // The core checks both, and refuses an audience that is not allowed.
    const { id } = await createPost(getDb(), viewer.id, {
      body: typeof body === "string" ? body : "",
      audience: (typeof audience === "string" ? audience : "friends") as Audience,
    });
    revalidatePath("/home");
    return { id };
  });
}

/** The next page of the feed after `cursor`. */
export async function loadMoreFeedAction(cursor: unknown) {
  return run(async () => {
    const viewer = await requireViewer();
    if (typeof cursor !== "string" || cursor === "") {
      throw invalid("That page link isn't valid. Reload and try again.");
    }
    const page = await getFeed(getDb(), viewer.id, { cursor, now: new Date() });
    return { items: page.items, nextCursor: page.nextCursor };
  });
}
