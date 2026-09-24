/**
 * The feed (SPEC §7): the posts of the people you chose, newest first, with
 * a marker where you were caught up and an end after fourteen days. No
 * ranking: the order is `created_at desc, id desc` and nothing else.
 *
 * Candidates are exactly the posts `visiblePostPredicate` lets the viewer
 * see — their own, their friends' (both audiences) and the followers posts
 * of people they follow — so the feed has no rule of its own about who may
 * see what. It only narrows: the 14-day window, and no muted authors.
 */
import { and, eq, gte, type SQL, sql } from "drizzle-orm";
import { FEED_WINDOW_DAYS, PAGE_SIZE } from "./config";
import type { Db } from "./db";
import { accounts, posts } from "./schema";
import { afterCursor, postPage, type PostView } from "./posts";
import { visiblePostPredicate } from "./visibility";

export type FeedPage = {
  items: PostView[];
  /** Opaque base64url of `created_at|id`, or null at the end. */
  nextCursor: string | null;
  /** `feed_previous_visit_at`, or null. */
  caughtUpBefore: Date | null;
  /** No more items in the 14-day window. */
  ended: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A visit this long after the last one moves the caught-up marker. */
export const FEED_VISIT_GAP_MS = 30 * 60 * 1000;

/** The oldest moment still in the feed: `now − 14 days`, inclusive. */
export function feedWindowStart(now: Date): Date {
  return new Date(now.getTime() - FEED_WINDOW_DAYS * DAY_MS);
}

export async function getFeed(
  db: Db,
  viewerId: string,
  input: { cursor?: string | null; now?: Date },
): Promise<FeedPage> {
  const now = input.now ?? new Date();
  const [viewer] = await db
    .select({
      suspendedAt: accounts.suspendedAt,
      previous: accounts.feedPreviousVisitAt,
    })
    .from(accounts)
    .where(eq(accounts.id, viewerId))
    .limit(1);
  // A suspended or missing viewer can see nothing (SPEC §6).
  if (!viewer || viewer.suspendedAt) {
    return { items: [], nextCursor: null, caughtUpBefore: null, ended: true };
  }
  const notMuted: SQL = sql`not exists (
    select 1 from mutes feed_mute
    where feed_mute.muter_id = ${viewerId} and feed_mute.muted_id = ${posts.authorId}
  )`;
  const where = and(
    visiblePostPredicate(viewerId),
    gte(posts.createdAt, feedWindowStart(now)),
    notMuted,
    afterCursor(input.cursor),
  );
  const page = await postPage(db, viewerId, where!, PAGE_SIZE);
  return {
    items: page.items,
    nextCursor: page.nextCursor,
    caughtUpBefore: viewer.previous ?? null,
    ended: page.nextCursor === null,
  };
}

/**
 * SPEC §7. The page calls this after loading the first page, so the marker
 * it just showed reflects the visit before:
 *
 *   - no last visit: last = now;
 *   - more than 30 minutes since the last visit: previous = last, last = now;
 *   - otherwise: last = now.
 *
 * One UPDATE, so two tabs cannot interleave a read and a write: every
 * right-hand side reads the row as it was before this statement.
 */
export async function recordFeedVisit(
  db: Db,
  viewerId: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();
  const gapStart = new Date(at.getTime() - FEED_VISIT_GAP_MS);
  await db
    .update(accounts)
    .set({
      feedPreviousVisitAt: sql`case
        when ${accounts.feedLastVisitAt} is not null
         and ${accounts.feedLastVisitAt} < ${gapStart}
        then ${accounts.feedLastVisitAt}
        else ${accounts.feedPreviousVisitAt}
      end`,
      feedLastVisitAt: at,
    })
    .where(eq(accounts.id, viewerId));
}
