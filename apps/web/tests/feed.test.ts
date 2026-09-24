/**
 * The feed (SPEC §7). Only posts the viewer may see, newest first, from the
 * last fourteen days, excluding muted and blocked people, and it ends.
 * Everyone here is FICTIONAL.
 */
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { CoreErrorCode } from "@/core/errors";
import { newId } from "@/core/ids";
import { FEED_VISIT_GAP_MS, feedWindowStart, getFeed, recordFeedVisit } from "@/core/feed";
import { encodeCursor } from "@/core/posts";
import { accounts, follows, posts } from "@/core/schema";
import {
  at,
  befriend,
  block,
  db,
  follow,
  makeAccount,
  mute,
  plus,
  post,
  reset,
} from "./helpers";

beforeEach(reset);

const NOW = at("2026-09-15T12:00:00Z");

async function expectCode(promise: Promise<unknown>, code: CoreErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: "CoreError", code });
}

async function suspend(accountId: string) {
  await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, accountId));
}

async function removePost(postId: string) {
  await db()
    .update(posts)
    .set({ removedAt: new Date(), removalCategory: "spam", removalReason: "FICTIONAL reasons." })
    .where(eq(posts.id, postId));
}

async function feedIds(viewerId: string, now = NOW): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const page = await getFeed(db(), viewerId, { cursor, now });
    ids.push(...page.items.map((p) => p.id));
    if (page.ended) return ids;
    cursor = page.nextCursor;
  }
  throw new Error("the feed never ended");
}

async function account(id: string) {
  const [row] = await db().select().from(accounts).where(eq(accounts.id, id));
  return row!;
}

/* ------------------------------------------------------------ who is in it */

describe("getFeed: denials", () => {
  it("never shows a stranger's posts, of either audience", async () => {
    const viewer = await makeAccount();
    const stranger = await makeAccount({ acceptsFollowers: true });
    await post(stranger, { audience: "friends", at: NOW });
    await post(stranger, { audience: "followers", at: NOW });
    expect(await feedIds(viewer.id)).toEqual([]);
  });

  it("shows a follower only followers posts, and only while following", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const viewer = await makeAccount();
    await follow(viewer, author);
    await post(author, { audience: "friends", at: plus.minutes(NOW, -2) });
    const fo = await post(author, { audience: "followers", at: plus.minutes(NOW, -1) });
    expect(await feedIds(viewer.id)).toEqual([fo.id]);
    await db()
      .delete(follows)
      .where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, author.id)));
    expect(await feedIds(viewer.id)).toEqual([]);
  });

  it("drops a followed author's posts once they stop accepting followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const viewer = await makeAccount();
    await follow(viewer, author);
    await post(author, { audience: "followers", at: NOW });
    await db().update(accounts).set({ acceptsFollowers: false }).where(eq(accounts.id, author.id));
    expect(await feedIds(viewer.id)).toEqual([]);
  });

  it("excludes people blocked in either direction, friends and followed alike", async () => {
    const viewer = await makeAccount();
    const friendBlocked = await makeAccount();
    const friendBlocker = await makeAccount();
    const followedBlocked = await makeAccount({ acceptsFollowers: true });
    await befriend(viewer, friendBlocked);
    await befriend(viewer, friendBlocker);
    await follow(viewer, followedBlocked);
    await post(friendBlocked, { at: NOW });
    await post(friendBlocker, { at: NOW });
    await post(followedBlocked, { audience: "followers", at: NOW });
    await block(viewer, friendBlocked);
    await block(friendBlocker, viewer);
    await block(followedBlocked, viewer);
    expect(await feedIds(viewer.id)).toEqual([]);
  });

  it("excludes muted people, and nothing else about them changes", async () => {
    const viewer = await makeAccount();
    const friend = await makeAccount();
    const other = await makeAccount();
    await befriend(viewer, friend);
    await befriend(viewer, other);
    await post(friend, { at: plus.minutes(NOW, -1) });
    const kept = await post(other, { at: NOW });
    await mute(viewer, friend);
    expect(await feedIds(viewer.id)).toEqual([kept.id]);
  });

  it("excludes removed posts, even the viewer's own, and suspended authors", async () => {
    const viewer = await makeAccount();
    const friend = await makeAccount();
    const suspended = await makeAccount();
    await befriend(viewer, friend);
    await befriend(viewer, suspended);
    const own = await post(viewer, { at: NOW });
    const theirs = await post(friend, { at: NOW });
    await post(suspended, { at: NOW });
    await removePost(own.id);
    await removePost(theirs.id);
    await suspend(suspended.id);
    expect(await feedIds(viewer.id)).toEqual([]);
  });

  it("gives a suspended viewer nothing", async () => {
    const viewer = await makeAccount();
    await post(viewer, { at: NOW });
    await suspend(viewer.id);
    const page = await getFeed(db(), viewer.id, { now: NOW });
    expect(page).toEqual({ items: [], nextCursor: null, caughtUpBefore: null, ended: true });
  });
});

describe("getFeed: who is in it", () => {
  it("has the viewer's own posts, friends' posts of both audiences, and followed people's followers posts", async () => {
    const viewer = await makeAccount();
    const friend = await makeAccount({ acceptsFollowers: true });
    const followed = await makeAccount({ acceptsFollowers: true });
    await befriend(viewer, friend);
    await follow(viewer, followed);
    const own = await post(viewer, { at: plus.minutes(NOW, -1) });
    const f1 = await post(friend, { audience: "friends", at: plus.minutes(NOW, -2) });
    const f2 = await post(friend, { audience: "followers", at: plus.minutes(NOW, -3) });
    await post(followed, { audience: "friends", at: plus.minutes(NOW, -4) });
    const fo = await post(followed, { audience: "followers", at: plus.minutes(NOW, -5) });
    expect(await feedIds(viewer.id)).toEqual([own.id, f1.id, f2.id, fo.id]);
  });

  it("gives a friend's post in the feed no like count, and the viewer's own post one", async () => {
    const viewer = await makeAccount();
    const friend = await makeAccount();
    await befriend(viewer, friend);
    await post(friend, { at: NOW });
    await post(viewer, { at: plus.minutes(NOW, -1) });
    const page = await getFeed(db(), viewer.id, { now: NOW });
    expect(page.items[0]).toMatchObject({ isOwn: false, removed: null, likedByMe: false });
    expect(page.items[0]!.likeCount).toBeUndefined();
    expect(page.items[1]).toMatchObject({ isOwn: true, likeCount: 0 });
  });
});

/* -------------------------------------------------------------- the window */

describe("getFeed: the fourteen-day window", () => {
  it("includes a post exactly 14 days old and excludes one a millisecond older", async () => {
    const viewer = await makeAccount();
    const edge = feedWindowStart(NOW);
    expect(edge.getTime()).toBe(NOW.getTime() - 14 * 86_400_000);
    const inside = await post(viewer, { at: edge });
    await post(viewer, { at: new Date(edge.getTime() - 1) });
    const fresh = await post(viewer, { at: NOW });
    expect(await feedIds(viewer.id)).toEqual([fresh.id, inside.id]);
  });

  it("ends after the window: ended is true and there is no cursor", async () => {
    const viewer = await makeAccount();
    await post(viewer, { at: plus.days(NOW, -20) });
    const page = await getFeed(db(), viewer.id, { now: NOW });
    expect(page).toMatchObject({ items: [], nextCursor: null, ended: true });
  });
});

/* ------------------------------------------------------- order and paging */

describe("getFeed: order and pages", () => {
  it("orders by created_at desc, then id desc", async () => {
    const viewer = await makeAccount();
    const same = plus.minutes(NOW, -10);
    const a = await post(viewer, { at: same });
    const b = await post(viewer, { at: same });
    const newer = await post(viewer, { at: plus.minutes(NOW, -1) });
    const older = await post(viewer, { at: plus.minutes(NOW, -60) });
    const tied = [a.id, b.id].sort().reverse();
    expect(await feedIds(viewer.id)).toEqual([newer.id, ...tied, older.id]);
  });

  it("pages 30 at a time without gaps or repeats, across a run of equal timestamps", async () => {
    const viewer = await makeAccount();
    const friend = await makeAccount();
    await befriend(viewer, friend);
    const tie = plus.minutes(NOW, -500);
    for (let i = 0; i < 65; i++) {
      // Posts 20–44 share one timestamp, spanning the page boundary at 30.
      const when = i >= 20 && i < 45 ? tie : plus.minutes(NOW, -i * 20);
      await post(i % 2 ? friend : viewer, { at: when });
    }
    const expected = (
      await db()
        .select({ id: posts.id })
        .from(posts)
        .orderBy(sql`${posts.createdAt} desc, ${posts.id} desc`)
    ).map((r) => r.id);

    const p1 = await getFeed(db(), viewer.id, { now: NOW });
    const p2 = await getFeed(db(), viewer.id, { cursor: p1.nextCursor, now: NOW });
    const p3 = await getFeed(db(), viewer.id, { cursor: p2.nextCursor, now: NOW });
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([30, 30, 5]);
    expect([p1.ended, p2.ended, p3.ended]).toEqual([false, false, true]);
    expect(p3.nextCursor).toBeNull();
    const all = [...p1.items, ...p2.items, ...p3.items].map((p) => p.id);
    expect(all).toEqual(expected);
    expect(new Set(all).size).toBe(65);

    // Stable: asking again with the same cursor gives the same page.
    const again = await getFeed(db(), viewer.id, { cursor: p1.nextCursor, now: NOW });
    expect(again.items.map((p) => p.id)).toEqual(p2.items.map((p) => p.id));
  });

  it("keeps microsecond order at a page boundary (posts inside one millisecond)", async () => {
    const viewer = await makeAccount();
    for (let i = 0; i < 29; i++) await post(viewer, { at: plus.minutes(NOW, -i - 1) });
    // Two posts 1 µs apart, older than the rest: the 30th and the 31st.
    const early = newId();
    const late = newId();
    await db().execute(sql`
      insert into posts (id, author_id, body, audience, created_at) values
        (${late}, ${viewer.id}, 'FICTIONAL late', 'friends', '2026-09-15 06:00:00.000002+00'),
        (${early}, ${viewer.id}, 'FICTIONAL early', 'friends', '2026-09-15 06:00:00.000001+00')
    `);
    const p1 = await getFeed(db(), viewer.id, { now: NOW });
    expect(p1.items[29]!.id).toBe(late);
    const p2 = await getFeed(db(), viewer.id, { cursor: p1.nextCursor, now: NOW });
    expect(p2.items.map((p) => p.id)).toEqual([early]);
    expect(p2.ended).toBe(true);
  });

  it("refuses a malformed or tampered cursor (INVALID)", async () => {
    const viewer = await makeAccount();
    await expectCode(getFeed(db(), viewer.id, { cursor: "%%%", now: NOW }), "INVALID");
    await expectCode(
      getFeed(db(), viewer.id, {
        cursor: Buffer.from("2026-09-01|x' or 1=1").toString("base64url"),
        now: NOW,
      }),
      "INVALID",
    );
  });

  it("a cursor is only a position: it never widens what the viewer may see", async () => {
    const viewer = await makeAccount();
    const stranger = await makeAccount();
    const hidden = await post(stranger, { at: plus.minutes(NOW, -5) });
    const cursor = encodeCursor("2026-09-15T12:00:00.000000Z", "ZZZZZZZZZZZZZZZZZZZZZZZZZZ");
    const page = await getFeed(db(), viewer.id, { cursor, now: NOW });
    expect(page.items.map((p) => p.id)).not.toContain(hidden.id);
    expect(page.items).toEqual([]);
  });
});

/* ------------------------------------------- the caught-up marker's data */

describe("caughtUpBefore and recordFeedVisit", () => {
  it("is null before any earlier visit is recorded", async () => {
    const viewer = await makeAccount();
    expect((await getFeed(db(), viewer.id, { now: NOW })).caughtUpBefore).toBeNull();
  });

  it("is feed_previous_visit_at", async () => {
    const viewer = await makeAccount();
    const previous = plus.hours(NOW, -5);
    await db()
      .update(accounts)
      .set({ feedPreviousVisitAt: previous, feedLastVisitAt: plus.hours(NOW, -1) })
      .where(eq(accounts.id, viewer.id));
    expect((await getFeed(db(), viewer.id, { now: NOW })).caughtUpBefore).toEqual(previous);
  });

  it("sets only the last visit on the first visit", async () => {
    const viewer = await makeAccount();
    await recordFeedVisit(db(), viewer.id, NOW);
    const row = await account(viewer.id);
    expect(row.feedLastVisitAt).toEqual(NOW);
    expect(row.feedPreviousVisitAt).toBeNull();
  });

  it("moves only the last visit within 30 minutes, including exactly 30", async () => {
    const viewer = await makeAccount();
    await recordFeedVisit(db(), viewer.id, NOW);
    await recordFeedVisit(db(), viewer.id, plus.minutes(NOW, 10));
    let row = await account(viewer.id);
    expect(row.feedLastVisitAt).toEqual(plus.minutes(NOW, 10));
    expect(row.feedPreviousVisitAt).toBeNull();
    const exactly = new Date(plus.minutes(NOW, 10).getTime() + FEED_VISIT_GAP_MS);
    await recordFeedVisit(db(), viewer.id, exactly);
    row = await account(viewer.id);
    expect(row.feedLastVisitAt).toEqual(exactly);
    expect(row.feedPreviousVisitAt).toBeNull();
  });

  it("moves the previous visit to the last one after more than 30 minutes", async () => {
    const viewer = await makeAccount();
    await recordFeedVisit(db(), viewer.id, NOW);
    const later = new Date(NOW.getTime() + FEED_VISIT_GAP_MS + 1);
    await recordFeedVisit(db(), viewer.id, later);
    const row = await account(viewer.id);
    expect(row.feedPreviousVisitAt).toEqual(NOW);
    expect(row.feedLastVisitAt).toEqual(later);
    // And a quick return keeps the marker where it is.
    await recordFeedVisit(db(), viewer.id, plus.minutes(later, 5));
    expect((await account(viewer.id)).feedPreviousVisitAt).toEqual(NOW);
    expect((await getFeed(db(), viewer.id, { now: later })).caughtUpBefore).toEqual(NOW);
  });

  it("touches no one else's visits", async () => {
    const viewer = await makeAccount();
    const other = await makeAccount();
    await recordFeedVisit(db(), viewer.id, NOW);
    const row = await account(other.id);
    expect(row.feedLastVisitAt).toBeNull();
    expect(row.feedPreviousVisitAt).toBeNull();
  });
});
