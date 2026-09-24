/**
 * Likes (SPEC §6 "Likes"): only the author sees who liked a post and how
 * many; everyone else sees only whether they liked it. canLike(V, P) =
 * canSeePost(V, P) and active(V). Everyone here is FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { CoreErrorCode } from "@/core/errors";
import { getFeed } from "@/core/feed";
import { newId } from "@/core/ids";
import { getPostForViewer, listPostsByAuthor, toggleLike } from "@/core/posts";
import { accounts, likes, notifications, posts } from "@/core/schema";
import {
  at,
  befriend,
  block,
  db,
  follow,
  makeAccount,
  plus,
  post,
  reset,
} from "./helpers";

beforeEach(reset);

const NOW = at("2026-09-10T09:00:00Z");

async function expectCode(promise: Promise<unknown>, code: CoreErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: "CoreError", code });
}

async function suspend(accountId: string) {
  await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, accountId));
}

async function likeRows(postId: string) {
  return db().select().from(likes).where(eq(likes.postId, postId));
}

async function likeNotifications(postId: string) {
  return db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.postId, postId), eq(notifications.kind, "like")));
}

/* -------------------------------------------------------------- refusals */

describe("toggleLike: refusals", () => {
  it("refuses a person who is not a friend on a friends-only post (NOT_FOUND, like an unknown post)", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends" });
    await expectCode(toggleLike(db(), stranger.id, p.id, NOW), "NOT_FOUND");
    await expectCode(toggleLike(db(), stranger.id, newId(), NOW), "NOT_FOUND");
    expect(await likeRows(p.id)).toEqual([]);
    expect(await likeNotifications(p.id)).toEqual([]);
  });

  it("refuses a follower on a friends-only post, and allows one on a followers post", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const friendsOnly = await post(author, { audience: "friends" });
    const forFollowers = await post(author, { audience: "followers" });
    await expectCode(toggleLike(db(), follower.id, friendsOnly.id, NOW), "NOT_FOUND");
    expect(await toggleLike(db(), follower.id, forFollowers.id, NOW)).toEqual({ liked: true });
  });

  it("refuses likes across a block in either direction (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const v1 = await makeAccount();
    const v2 = await makeAccount();
    await befriend(author, v1);
    await befriend(author, v2);
    await block(author, v1);
    await block(v2, author);
    const p = await post(author);
    await expectCode(toggleLike(db(), v1.id, p.id, NOW), "NOT_FOUND");
    await expectCode(toggleLike(db(), v2.id, p.id, NOW), "NOT_FOUND");
    expect(await likeRows(p.id)).toEqual([]);
    expect(await likeNotifications(p.id)).toEqual([]);
  });

  it("refuses a like on a removed post and on a suspended author's post (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const other = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    await befriend(other, friend);
    const removed = await post(author);
    await db()
      .update(posts)
      .set({ removedAt: new Date(), removalCategory: "spam", removalReason: "FICTIONAL." })
      .where(eq(posts.id, removed.id));
    await expectCode(toggleLike(db(), friend.id, removed.id, NOW), "NOT_FOUND");
    await expectCode(toggleLike(db(), author.id, removed.id, NOW), "NOT_FOUND");
    const p = await post(other);
    await suspend(other.id);
    await expectCode(toggleLike(db(), friend.id, p.id, NOW), "NOT_FOUND");
  });

  it("refuses a suspended liker (FORBIDDEN), whatever the post", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await suspend(friend.id);
    await expectCode(toggleLike(db(), friend.id, p.id, NOW), "FORBIDDEN");
    await expectCode(toggleLike(db(), friend.id, newId(), NOW), "FORBIDDEN");
    expect(await likeRows(p.id)).toEqual([]);
  });
});

/* ------------------------------------------------------------ the toggle */

describe("toggleLike: the toggle", () => {
  it("likes, then unlikes", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    expect(await toggleLike(db(), friend.id, p.id, NOW)).toEqual({ liked: true });
    expect(await likeRows(p.id)).toHaveLength(1);
    expect((await getPostForViewer(db(), friend.id, p.id))!.likedByMe).toBe(true);
    expect(await toggleLike(db(), friend.id, p.id, NOW)).toEqual({ liked: false });
    expect(await likeRows(p.id)).toEqual([]);
    expect((await getPostForViewer(db(), friend.id, p.id))!.likedByMe).toBe(false);
  });

  it("lets the author like their own post", async () => {
    const author = await makeAccount();
    const p = await post(author);
    expect(await toggleLike(db(), author.id, p.id, NOW)).toEqual({ liked: true });
    expect((await getPostForViewer(db(), author.id, p.id))!.likeCount).toBe(1);
  });
});

/* --------------------------------------------- who sees likes and counts */

describe("likes are seen only by the author", () => {
  it("gives the author the count and the likers; a liker and another friend see only their own like", async () => {
    const author = await makeAccount();
    const liker1 = await makeAccount();
    const liker2 = await makeAccount();
    const bystander = await makeAccount();
    for (const x of [liker1, liker2, bystander]) await befriend(author, x);
    const p = await post(author);
    await toggleLike(db(), liker1.id, p.id, NOW);
    await toggleLike(db(), liker2.id, p.id, plus.minutes(NOW, 1));

    const asAuthor = await getPostForViewer(db(), author.id, p.id);
    expect(asAuthor!.likeCount).toBe(2);
    expect(asAuthor!.likers!.map((l) => l.id)).toEqual([liker2.id, liker1.id]);
    expect(asAuthor!.likers![0]).toEqual({
      id: liker2.id,
      handle: liker2.handle,
      displayName: liker2.displayName,
    });

    const asLiker = await getPostForViewer(db(), liker1.id, p.id);
    expect(asLiker!.likedByMe).toBe(true);
    expect(asLiker!.likeCount).toBeUndefined();
    expect(asLiker!.likers).toBeUndefined();

    const asBystander = await getPostForViewer(db(), bystander.id, p.id);
    expect(asBystander!.likedByMe).toBe(false);
    expect(asBystander!.likeCount).toBeUndefined();
    expect(asBystander!.likers).toBeUndefined();
  });

  it("gives no one who cannot see the post anything at all", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    const stranger = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await toggleLike(db(), friend.id, p.id, NOW);
    expect(await getPostForViewer(db(), stranger.id, p.id)).toBeNull();
  });

  it("shows a like count in lists only on the viewer's own posts", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { at: NOW });
    await toggleLike(db(), friend.id, p.id, NOW);
    const own = (await listPostsByAuthor(db(), author.id, author.id)).items[0]!;
    expect(own.likeCount).toBe(1);
    expect(own.likers).toBeUndefined();
    const theirs = (await listPostsByAuthor(db(), friend.id, author.id)).items[0]!;
    expect(theirs.likeCount).toBeUndefined();
    expect(theirs.likedByMe).toBe(true);
    const inFeed = (await getFeed(db(), friend.id, { now: plus.minutes(NOW, 5) })).items[0]!;
    expect(inFeed.likeCount).toBeUndefined();
    expect(inFeed.likedByMe).toBe(true);
    const authorFeed = (await getFeed(db(), author.id, { now: plus.minutes(NOW, 5) })).items[0]!;
    expect(authorFeed.likeCount).toBe(1);
  });

  it("leaves suspended likers and likers blocked either way out of the author's count and list", async () => {
    const author = await makeAccount();
    const kept = await makeAccount();
    const suspended = await makeAccount();
    const blockedByAuthor = await makeAccount();
    const blockerOfAuthor = await makeAccount();
    for (const x of [kept, suspended, blockedByAuthor, blockerOfAuthor]) await befriend(author, x);
    const p = await post(author);
    for (const x of [kept, suspended, blockedByAuthor, blockerOfAuthor]) {
      await toggleLike(db(), x.id, p.id, NOW);
    }
    await suspend(suspended.id);
    // Fixture blocks only: the core's block() would also delete these likes.
    await block(author, blockedByAuthor);
    await block(blockerOfAuthor, author);
    const view = await getPostForViewer(db(), author.id, p.id);
    expect(view!.likeCount).toBe(1);
    expect(view!.likers!.map((l) => l.id)).toEqual([kept.id]);
  });
});

/* --------------------------------------------------------- notifications */

describe("like notifications", () => {
  it("notifies the author, with the liker as actor", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await toggleLike(db(), friend.id, p.id, NOW);
    const rows = await likeNotifications(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: author.id,
      actorId: friend.id,
      kind: "like",
      postId: p.id,
      readAt: null,
      createdAt: NOW,
    });
  });

  it("never notifies the author about liking their own post", async () => {
    const author = await makeAccount();
    const p = await post(author);
    await toggleLike(db(), author.id, p.id, NOW);
    expect(await likeNotifications(p.id)).toEqual([]);
  });

  it("takes the notification back on unlike, so toggling cannot flood the author", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    for (let i = 0; i < 5; i++) await toggleLike(db(), friend.id, p.id, NOW);
    // Five toggles end liked, with exactly one notification.
    expect(await likeRows(p.id)).toHaveLength(1);
    expect(await likeNotifications(p.id)).toHaveLength(1);
    await toggleLike(db(), friend.id, p.id, NOW);
    expect(await likeNotifications(p.id)).toEqual([]);
  });

  it("taking back one person's like leaves another person's like notification", async () => {
    const author = await makeAccount();
    const a = await makeAccount();
    const b = await makeAccount();
    await befriend(author, a);
    await befriend(author, b);
    const p = await post(author);
    await toggleLike(db(), a.id, p.id, NOW);
    await toggleLike(db(), b.id, p.id, NOW);
    await toggleLike(db(), a.id, p.id, NOW);
    const rows = await likeNotifications(p.id);
    expect(rows.map((r) => r.actorId)).toEqual([b.id]);
  });
});
