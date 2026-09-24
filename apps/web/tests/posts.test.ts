/**
 * Posts and replies (SPEC §6, §8 "Posts"). Denial paths first: a green
 * happy path is not the product. Every refusal asserts its CoreError code.
 * Everyone here is FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { CoreErrorCode } from "@/core/errors";
import { newId } from "@/core/ids";
import {
  createPost,
  createReply,
  deletePost,
  deleteReply,
  getPostForViewer,
  listPostsByAuthor,
  listReplies,
} from "@/core/posts";
import {
  accounts,
  follows,
  friendships,
  likes,
  notifications,
  posts,
  replies,
} from "@/core/schema";
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

/* ---------------------------------------------------------------- helpers */

async function expectCode(promise: Promise<unknown>, code: CoreErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: "CoreError", code });
}

async function suspend(accountId: string) {
  await db()
    .update(accounts)
    .set({ suspendedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

async function removePost(postId: string) {
  await db()
    .update(posts)
    .set({
      removedAt: new Date(),
      removalCategory: "spam",
      removalReason: "FICTIONAL statement of reasons.",
    })
    .where(eq(posts.id, postId));
}

async function removeReply(replyId: string) {
  await db()
    .update(replies)
    .set({
      removedAt: new Date(),
      removalCategory: "harassment",
      removalReason: "FICTIONAL reason for the reply.",
    })
    .where(eq(replies.id, replyId));
}

/** A reply row, inserted directly (a fixture, not the product path). */
async function replyRow(
  postId: string,
  authorId: string,
  options: { body?: string; at?: Date } = {},
) {
  const [row] = await db()
    .insert(replies)
    .values({
      id: newId(),
      postId,
      authorId,
      body: options.body ?? "A FICTIONAL reply.",
      createdAt: options.at ?? new Date(),
    })
    .returning();
  return row!;
}

async function unfriend(a: { id: string }, b: { id: string }) {
  const [x, y] = [a.id, b.id].sort();
  await db()
    .delete(friendships)
    .where(and(eq(friendships.aId, x!), eq(friendships.bId, y!)));
}

async function unfollow(a: { id: string }, b: { id: string }) {
  await db()
    .delete(follows)
    .where(and(eq(follows.followerId, a.id), eq(follows.followeeId, b.id)));
}

async function stopAcceptingFollowers(a: { id: string }) {
  await db()
    .update(accounts)
    .set({ acceptsFollowers: false })
    .where(eq(accounts.id, a.id));
}

async function replyCountRows(postId: string) {
  return db().select().from(replies).where(eq(replies.postId, postId));
}

const NOW = at("2026-09-01T12:00:00Z");

/* ------------------------------------------------------------ createPost */

describe("createPost: refusals", () => {
  it("refuses an empty body and a body over 2000 characters (INVALID)", async () => {
    const a = await makeAccount();
    await expectCode(createPost(db(), a.id, { body: "   \n ", audience: "friends" }), "INVALID");
    await expectCode(
      createPost(db(), a.id, { body: "x".repeat(2001), audience: "friends" }),
      "INVALID",
    );
    expect(await db().select().from(posts)).toEqual([]);
  });

  it("refuses the followers audience to someone who does not accept followers (INVALID)", async () => {
    const a = await makeAccount({ acceptsFollowers: false });
    await expectCode(
      createPost(db(), a.id, { body: "To my followers", audience: "followers" }),
      "INVALID",
    );
    expect(await db().select().from(posts)).toEqual([]);
  });

  it("refuses an audience that is not in the spec (INVALID)", async () => {
    const a = await makeAccount({ acceptsFollowers: true });
    await expectCode(
      createPost(db(), a.id, { body: "Hello", audience: "public" as never }),
      "INVALID",
    );
  });

  it("refuses a suspended or unknown author (FORBIDDEN)", async () => {
    const a = await makeAccount();
    await suspend(a.id);
    await expectCode(createPost(db(), a.id, { body: "Hi", audience: "friends" }), "FORBIDDEN");
    await expectCode(createPost(db(), newId(), { body: "Hi", audience: "friends" }), "FORBIDDEN");
    expect(await db().select().from(posts)).toEqual([]);
  });

  it("refuses the 51st post in a day (RATE_LIMITED), and allows one again a day later", async () => {
    const a = await makeAccount();
    for (let i = 0; i < 50; i++) {
      await createPost(db(), a.id, { body: `Post ${i}`, audience: "friends", now: plus.minutes(NOW, i) });
    }
    await expectCode(
      createPost(db(), a.id, { body: "One too many", audience: "friends", now: plus.hours(NOW, 2) }),
      "RATE_LIMITED",
    );
    expect(await db().select().from(posts)).toHaveLength(50);
    await createPost(db(), a.id, {
      body: "A new day",
      audience: "friends",
      now: plus.minutes(plus.days(NOW, 1), 1),
    });
    expect(await db().select().from(posts)).toHaveLength(51);
  });
});

describe("createPost: what it stores", () => {
  it("stores the trimmed body, the audience and the time", async () => {
    const a = await makeAccount({ acceptsFollowers: true });
    const { id } = await createPost(db(), a.id, {
      body: "  Line one\r\nline two  ",
      audience: "followers",
      now: NOW,
    });
    const [row] = await db().select().from(posts).where(eq(posts.id, id));
    expect(row).toMatchObject({
      authorId: a.id,
      body: "Line one\nline two",
      audience: "followers",
      createdAt: NOW,
      removedAt: null,
    });
  });
});

/* ------------------------------------------------------ getPostForViewer */

describe("getPostForViewer: denials look exactly like nothing (null)", () => {
  it("hides a friends-only post from a person who is not a friend, like an unknown id", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends" });
    expect(await getPostForViewer(db(), stranger.id, p.id)).toBeNull();
    expect(await getPostForViewer(db(), stranger.id, newId())).toBeNull();
  });

  it("shows a follower only followers posts, and only while following", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const friendsOnly = await post(author, { audience: "friends" });
    const forFollowers = await post(author, { audience: "followers" });
    expect(await getPostForViewer(db(), follower.id, friendsOnly.id)).toBeNull();
    expect(await getPostForViewer(db(), follower.id, forFollowers.id)).not.toBeNull();
    await unfollow(follower, author);
    expect(await getPostForViewer(db(), follower.id, forFollowers.id)).toBeNull();
  });

  it("hides followers posts from a follower once the author stops accepting followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers" });
    await stopAcceptingFollowers(author);
    expect(await getPostForViewer(db(), follower.id, p.id)).toBeNull();
  });

  it("hides a followers post from a follower when a block exists either way", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const f1 = await makeAccount();
    const f2 = await makeAccount();
    await follow(f1, author);
    await follow(f2, author);
    await block(author, f1);
    await block(f2, author);
    const p = await post(author, { audience: "followers" });
    expect(await getPostForViewer(db(), f1.id, p.id)).toBeNull();
    expect(await getPostForViewer(db(), f2.id, p.id)).toBeNull();
  });

  it("hides a post between friends when either has blocked the other", async () => {
    const author = await makeAccount();
    const v1 = await makeAccount();
    const v2 = await makeAccount();
    await befriend(author, v1);
    await befriend(author, v2);
    await block(v1, author);
    await block(author, v2);
    const p = await post(author);
    expect(await getPostForViewer(db(), v1.id, p.id)).toBeNull();
    expect(await getPostForViewer(db(), v2.id, p.id)).toBeNull();
  });

  it("removes a friend's access at once when the friendship ends", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    expect(await getPostForViewer(db(), friend.id, p.id)).not.toBeNull();
    await unfriend(author, friend);
    expect(await getPostForViewer(db(), friend.id, p.id)).toBeNull();
  });

  it("hides a removed post from everyone but its author", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await removePost(p.id);
    expect(await getPostForViewer(db(), friend.id, p.id)).toBeNull();
  });

  it("hides every post of a suspended author, from friends and followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const friend = await makeAccount();
    const follower = await makeAccount();
    await befriend(author, friend);
    await follow(follower, author);
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    await suspend(author.id);
    for (const v of [friend, follower]) {
      expect(await getPostForViewer(db(), v.id, p1.id)).toBeNull();
      expect(await getPostForViewer(db(), v.id, p2.id)).toBeNull();
    }
  });

  it("shows nothing to a suspended viewer, not even their own post", async () => {
    const author = await makeAccount();
    const p = await post(author);
    await suspend(author.id);
    expect(await getPostForViewer(db(), author.id, p.id)).toBeNull();
  });
});

describe("getPostForViewer: what the author and others see", () => {
  it("shows the author their own removed post, marked, with the statement of reasons", async () => {
    const author = await makeAccount();
    const p = await post(author, { body: "FICTIONAL removed text" });
    await removePost(p.id);
    const view = await getPostForViewer(db(), author.id, p.id);
    expect(view).toMatchObject({
      id: p.id,
      body: "FICTIONAL removed text",
      isOwn: true,
      removed: { category: "spam", reason: "FICTIONAL statement of reasons." },
      replyCount: 0,
    });
  });

  it("does not mark a visible post as removed, and gives a friend no like count or likers", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { body: "Hello friends" });
    const view = await getPostForViewer(db(), friend.id, p.id);
    expect(view).toMatchObject({
      id: p.id,
      body: "Hello friends",
      audience: "friends",
      isOwn: false,
      removed: null,
      likedByMe: false,
      author: { id: author.id, handle: author.handle, displayName: author.displayName },
    });
    expect(view!.likeCount).toBeUndefined();
    expect(view!.likers).toBeUndefined();
  });

  it("counts only the replies each viewer can see", async () => {
    const author = await makeAccount();
    const viewer = await makeAccount();
    const blocked = await makeAccount();
    const suspended = await makeAccount();
    const plain = await makeAccount();
    for (const x of [viewer, blocked, suspended, plain]) await befriend(author, x);
    const p = await post(author);
    await replyRow(p.id, plain.id);
    await replyRow(p.id, blocked.id);
    await replyRow(p.id, suspended.id);
    const removed = await replyRow(p.id, plain.id);
    await block(viewer, blocked);
    await suspend(suspended.id);
    await removeReply(removed.id);
    expect((await getPostForViewer(db(), viewer.id, p.id))!.replyCount).toBe(1);
    expect((await getPostForViewer(db(), author.id, p.id))!.replyCount).toBe(2);
  });
});

/* ------------------------------------------------------ listPostsByAuthor */

describe("listPostsByAuthor", () => {
  it("gives a stranger nothing, a follower only followers posts, a friend both", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const stranger = await makeAccount();
    const follower = await makeAccount();
    const friend = await makeAccount();
    await follow(follower, author);
    await befriend(author, friend);
    const f = await post(author, { audience: "friends", at: plus.minutes(NOW, 1) });
    const fo = await post(author, { audience: "followers", at: plus.minutes(NOW, 2) });
    const ids = async (v: { id: string }) =>
      (await listPostsByAuthor(db(), v.id, author.id)).items.map((p) => p.id);
    expect(await ids(stranger)).toEqual([]);
    expect(await ids(follower)).toEqual([fo.id]);
    expect(await ids(friend)).toEqual([fo.id, f.id]);
    expect(await ids(author)).toEqual([fo.id, f.id]);
  });

  it("gives nothing across a block, and never lists removed posts, even to their author", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const kept = await post(author);
    const gone = await post(author);
    await removePost(gone.id);
    expect((await listPostsByAuthor(db(), author.id, author.id)).items.map((p) => p.id)).toEqual([
      kept.id,
    ]);
    await block(author, friend);
    expect((await listPostsByAuthor(db(), friend.id, author.id)).items).toEqual([]);
  });

  it("pages newest first, 30 at a time, with a cursor", async () => {
    const author = await makeAccount();
    const made: string[] = [];
    for (let i = 0; i < 35; i++) {
      made.push((await post(author, { at: plus.minutes(NOW, i) })).id);
    }
    const first = await listPostsByAuthor(db(), author.id, author.id);
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).not.toBeNull();
    const second = await listPostsByAuthor(db(), author.id, author.id, {
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((p) => p.id)).toEqual([...made].reverse());
  });

  it("refuses a malformed cursor (INVALID)", async () => {
    const author = await makeAccount();
    await expectCode(
      listPostsByAuthor(db(), author.id, author.id, { cursor: "not-a-cursor!" }),
      "INVALID",
    );
  });
});

/* ------------------------------------------------------------ createReply */

describe("createReply: refusals", () => {
  it("refuses a person who is not a friend on a friends-only post (NOT_FOUND, like an unknown post)", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends" });
    await expectCode(createReply(db(), stranger.id, p.id, { body: "Hi" }), "NOT_FOUND");
    await expectCode(createReply(db(), stranger.id, newId(), { body: "Hi" }), "NOT_FOUND");
    expect(await replyCountRows(p.id)).toEqual([]);
  });

  it("refuses a follower on a friends-only post, and allows one on a followers post", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const friendsOnly = await post(author, { audience: "friends" });
    const forFollowers = await post(author, { audience: "followers" });
    await expectCode(createReply(db(), follower.id, friendsOnly.id, { body: "Hi" }), "NOT_FOUND");
    await createReply(db(), follower.id, forFollowers.id, { body: "Hi" });
    expect(await replyCountRows(forFollowers.id)).toHaveLength(1);
  });

  it("refuses replies across a block in either direction (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const v1 = await makeAccount();
    const v2 = await makeAccount();
    await befriend(author, v1);
    await befriend(author, v2);
    await block(author, v1);
    await block(v2, author);
    const p = await post(author);
    await expectCode(createReply(db(), v1.id, p.id, { body: "Hi" }), "NOT_FOUND");
    await expectCode(createReply(db(), v2.id, p.id, { body: "Hi" }), "NOT_FOUND");
    expect(await replyCountRows(p.id)).toEqual([]);
  });

  it("refuses a reply to a removed post, even by its author, and to a suspended author's post (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    const other = await makeAccount();
    await befriend(author, friend);
    await befriend(other, friend);
    const removed = await post(author);
    await removePost(removed.id);
    await expectCode(createReply(db(), friend.id, removed.id, { body: "Hi" }), "NOT_FOUND");
    await expectCode(createReply(db(), author.id, removed.id, { body: "Hi" }), "NOT_FOUND");
    const p = await post(other);
    await suspend(other.id);
    await expectCode(createReply(db(), friend.id, p.id, { body: "Hi" }), "NOT_FOUND");
  });

  it("refuses a suspended replier (FORBIDDEN), whatever the post", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await suspend(friend.id);
    await expectCode(createReply(db(), friend.id, p.id, { body: "Hi" }), "FORBIDDEN");
    await expectCode(createReply(db(), friend.id, newId(), { body: "Hi" }), "FORBIDDEN");
  });

  it("refuses an empty reply and one over 1000 characters (INVALID)", async () => {
    const author = await makeAccount();
    const p = await post(author);
    await expectCode(createReply(db(), author.id, p.id, { body: "  " }), "INVALID");
    await expectCode(createReply(db(), author.id, p.id, { body: "y".repeat(1001) }), "INVALID");
  });

  it("refuses the 201st reply in a day (RATE_LIMITED)", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    for (let i = 0; i < 200; i++) {
      await createReply(db(), friend.id, p.id, { body: `Reply ${i}`, now: plus.minutes(NOW, i) });
    }
    await expectCode(
      createReply(db(), friend.id, p.id, { body: "One too many", now: plus.hours(NOW, 4) }),
      "RATE_LIMITED",
    );
    expect(await replyCountRows(p.id)).toHaveLength(200);
  });
});

/* ------------------------------------------------------------ listReplies */

describe("listReplies", () => {
  it("returns nothing for a post the viewer cannot see", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    const stranger = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await replyRow(p.id, friend.id);
    expect(await listReplies(db(), stranger.id, p.id)).toEqual([]);
    expect(await listReplies(db(), stranger.id, newId())).toEqual([]);
  });

  it("hides every reply of a removed post, from its author too", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await replyRow(p.id, friend.id);
    await removePost(p.id);
    expect(await listReplies(db(), author.id, p.id)).toEqual([]);
    expect(await listReplies(db(), friend.id, p.id)).toEqual([]);
  });

  it("hides replies by people blocked either way with the viewer, and shows them to others", async () => {
    const author = await makeAccount();
    const viewer = await makeAccount();
    const blockedByViewer = await makeAccount();
    const blockerOfViewer = await makeAccount();
    for (const x of [viewer, blockedByViewer, blockerOfViewer]) await befriend(author, x);
    const p = await post(author);
    const r1 = await replyRow(p.id, blockedByViewer.id, { at: plus.minutes(NOW, 1) });
    const r2 = await replyRow(p.id, blockerOfViewer.id, { at: plus.minutes(NOW, 2) });
    const r3 = await replyRow(p.id, author.id, { at: plus.minutes(NOW, 3) });
    await block(viewer, blockedByViewer);
    await block(blockerOfViewer, viewer);
    expect((await listReplies(db(), viewer.id, p.id)).map((r) => r.id)).toEqual([r3.id]);
    expect((await listReplies(db(), author.id, p.id)).map((r) => r.id)).toEqual([
      r1.id,
      r2.id,
      r3.id,
    ]);
  });

  it("hides a suspended replier's reply", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    await befriend(author, replier);
    const p = await post(author);
    await replyRow(p.id, replier.id);
    await suspend(replier.id);
    expect(await listReplies(db(), author.id, p.id)).toEqual([]);
  });

  it("hides a removed reply from everyone but its replier, who sees it marked with the reasons", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    await befriend(author, replier);
    const p = await post(author);
    const r = await replyRow(p.id, replier.id, { body: "FICTIONAL removed reply" });
    await removeReply(r.id);
    expect(await listReplies(db(), author.id, p.id)).toEqual([]);
    const own = await listReplies(db(), replier.id, p.id);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      id: r.id,
      body: "FICTIONAL removed reply",
      isOwn: true,
      removed: { category: "harassment", reason: "FICTIONAL reason for the reply." },
    });
  });

  it("lists replies oldest first, and says who may delete each", async () => {
    const author = await makeAccount();
    const a = await makeAccount();
    const b = await makeAccount();
    await befriend(author, a);
    await befriend(author, b);
    const p = await post(author);
    const late = await replyRow(p.id, b.id, { at: plus.minutes(NOW, 9) });
    const early = await replyRow(p.id, a.id, { at: plus.minutes(NOW, 1) });
    const asA = await listReplies(db(), a.id, p.id);
    expect(asA.map((r) => r.id)).toEqual([early.id, late.id]);
    expect(asA.map((r) => r.canDelete)).toEqual([true, false]);
    expect(asA.map((r) => r.removed)).toEqual([null, null]);
    const asAuthor = await listReplies(db(), author.id, p.id);
    expect(asAuthor.map((r) => r.canDelete)).toEqual([true, true]);
  });
});

/* -------------------------------------------------------------- deleting */

describe("deletePost", () => {
  it("refuses someone else's post and an unknown post (NOT_FOUND), and keeps the post", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await expectCode(deletePost(db(), friend.id, p.id), "NOT_FOUND");
    await expectCode(deletePost(db(), author.id, newId()), "NOT_FOUND");
    expect(await db().select().from(posts).where(eq(posts.id, p.id))).toHaveLength(1);
  });

  it("refuses a suspended author (FORBIDDEN)", async () => {
    const author = await makeAccount();
    const p = await post(author);
    await suspend(author.id);
    await expectCode(deletePost(db(), author.id, p.id), "FORBIDDEN");
  });

  it("deletes your own post with its replies, likes and notifications", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await createReply(db(), friend.id, p.id, { body: "Nice" });
    await db().insert(likes).values({ postId: p.id, accountId: friend.id });
    await deletePost(db(), author.id, p.id);
    expect(await db().select().from(posts)).toEqual([]);
    expect(await db().select().from(replies)).toEqual([]);
    expect(await db().select().from(likes)).toEqual([]);
    expect(await db().select().from(notifications)).toEqual([]);
  });
});

describe("deleteReply", () => {
  it("refuses a third person and an unknown reply (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    const third = await makeAccount();
    await befriend(author, replier);
    await befriend(author, third);
    const p = await post(author);
    const r = await replyRow(p.id, replier.id);
    await expectCode(deleteReply(db(), third.id, r.id), "NOT_FOUND");
    await expectCode(deleteReply(db(), replier.id, newId()), "NOT_FOUND");
    expect(await replyCountRows(p.id)).toHaveLength(1);
  });

  it("lets the replier delete their reply", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    await befriend(author, replier);
    const p = await post(author);
    const r = await replyRow(p.id, replier.id);
    await deleteReply(db(), replier.id, r.id);
    expect(await replyCountRows(p.id)).toEqual([]);
  });

  it("lets the post's author delete a reply on their post, even one hidden from them by a block", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    await befriend(author, replier);
    const p = await post(author);
    const r1 = await replyRow(p.id, replier.id);
    const r2 = await replyRow(p.id, replier.id);
    await deleteReply(db(), author.id, r1.id);
    await block(author, replier);
    await deleteReply(db(), author.id, r2.id);
    expect(await replyCountRows(p.id)).toEqual([]);
  });
});
