/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M3 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M3 (posts), which replaces the
 * bodies (SPEC §7).
 */
import type { Db } from "./db";
import type { PostView } from "./posts";

export type FeedPage = {
  items: PostView[];
  /** Opaque base64url of `created_at|id`, or null at the end. */
  nextCursor: string | null;
  /** `feed_previous_visit_at`, or null. */
  caughtUpBefore: Date | null;
  /** No more items in the 14-day window. */
  ended: boolean;
};

export async function getFeed(
  db: Db,
  viewerId: string,
  input: { cursor?: string | null; now?: Date },
): Promise<FeedPage> {
  throw new Error("not implemented: M3");
}

export async function recordFeedVisit(
  db: Db,
  viewerId: string,
  now?: Date,
): Promise<void> {
  throw new Error("not implemented: M3");
}
