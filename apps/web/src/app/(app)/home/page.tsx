/**
 * /home: the composer and the feed (SPEC §7, §8 "Posts").
 *
 * The feed is the posts of the people you chose, newest first. A marker
 * shows where you were caught up, and the feed ends after fourteen days.
 * The page records the visit after loading the first page, as SPEC §7
 * says, so the marker it shows reflects the visit before.
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { Composer } from "@/components/posts/Composer";
import { FeedList } from "@/components/posts/FeedList";
import { getDb } from "@/core/db";
import { getFeed, recordFeedVisit } from "@/core/feed";
import { LIMITS } from "@/core/validate";
import { requireViewer } from "@/web/viewer";
import { createPostAction, loadMoreFeedAction } from "./actions";

export const metadata: Metadata = { title: "Home" };

/** The counter appears from this many characters (SPEC §8). */
const POST_COUNTER_FROM = 1800;

export default async function HomePage() {
  const viewer = await requireViewer();
  const db = getDb();
  const now = new Date();
  const feed = await getFeed(db, viewer.id, { now });
  await recordFeedVisit(db, viewer.id, now);

  return (
    <>
      <PageHeader title="Home" wordmark />
      <Composer
        id="compose"
        viewer={{ handle: viewer.handle, displayName: viewer.displayName }}
        label="New post"
        placeholder="What's new?"
        max={LIMITS.postMax}
        counterFrom={POST_COUNTER_FROM}
        submitLabel="Post"
        audience={viewer.acceptsFollowers}
        submit={createPostAction}
      />
      <h2 className="visually-hidden">Your feed</h2>
      <FeedList
        first={{ items: feed.items, nextCursor: feed.nextCursor }}
        loadMore={loadMoreFeedAction}
        markers
        caughtUpBefore={feed.caughtUpBefore}
        hideMuted
        empty={{
          text: "Your feed is quiet. Invite someone you know.",
          action: { href: "/people/invites", label: "Invite" },
        }}
      />
    </>
  );
}
