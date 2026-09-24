/**
 * The permission core (SPEC §6). Denial paths first: a green happy path is
 * not the product. Everyone here is FICTIONAL.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  countIncomingRequests,
  countUnread,
  notify,
} from "@/core/notifications";
import {
  accounts,
  blocks,
  friendRequests,
  friendships,
  notifications,
  posts,
  replies,
} from "@/core/schema";
import { newId } from "@/core/ids";
import {
  areFriends,
  canSeeAccount,
  canSeePost,
  canSeeReply,
  isActive,
  isBlocked,
  isFollowing,
  relationship,
  visiblePostPredicate,
  visibleReplyPredicate,
} from "@/core/visibility";
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

async function reply(postId: string, authorId: string, body = "A FICTIONAL reply.") {
  const [row] = await db()
    .insert(replies)
    .values({ id: newId(), postId, authorId, body })
    .returning();
  return row!;
}

/** The ids of all posts the viewer may see, through the list predicate. */
async function visibleIds(viewerId: string): Promise<string[]> {
  const rows = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(visiblePostPredicate(viewerId))
    .orderBy(posts.id);
  return rows.map((r) => r.id);
}

describe("canSeePost: denials", () => {
  it("denies a friends-only post to a person who is not a friend", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends" });
    expect(await canSeePost(db(), stranger.id, p.id)).toBeNull();
  });

  it("denies a followers post to a person who neither is a friend nor follows", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const stranger = await makeAccount();
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), stranger.id, p.id)).toBeNull();
  });

  it("denies a friends-only post to a follower", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "friends" });
    expect(await canSeePost(db(), follower.id, p.id)).toBeNull();
  });

  it("denies a followers post when the author does not accept followers, even with a follow row", async () => {
    const author = await makeAccount({ acceptsFollowers: false });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), follower.id, p.id)).toBeNull();
  });

  it("denies when the viewer blocked the author, even between friends", async () => {
    const author = await makeAccount();
    const viewer = await makeAccount();
    await befriend(author, viewer);
    await block(viewer, author);
    const p = await post(author, { audience: "friends" });
    expect(await canSeePost(db(), viewer.id, p.id)).toBeNull();
  });

  it("denies when the author blocked the viewer, even between friends", async () => {
    const author = await makeAccount();
    const viewer = await makeAccount();
    await befriend(author, viewer);
    await block(author, viewer);
    const p = await post(author, { audience: "friends" });
    expect(await canSeePost(db(), viewer.id, p.id)).toBeNull();
  });

  it("denies a followers post to a follower when a block exists either way", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const f1 = await makeAccount();
    const f2 = await makeAccount();
    await follow(f1, author);
    await follow(f2, author);
    await block(author, f1);
    await block(f2, author);
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), f1.id, p.id)).toBeNull();
    expect(await canSeePost(db(), f2.id, p.id)).toBeNull();
  });

  it("denies a removed post to everyone, including its author (the author's view is a separate path)", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { audience: "friends" });
    await removePost(p.id);
    expect(await canSeePost(db(), friend.id, p.id)).toBeNull();
    expect(await canSeePost(db(), author.id, p.id)).toBeNull();
  });

  it("denies every post of a suspended author, to friends and followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const friend = await makeAccount();
    const follower = await makeAccount();
    await befriend(author, friend);
    await follow(follower, author);
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    await suspend(author.id);
    for (const viewer of [friend, follower, author]) {
      expect(await canSeePost(db(), viewer.id, p1.id)).toBeNull();
      expect(await canSeePost(db(), viewer.id, p2.id)).toBeNull();
    }
  });

  it("denies an unknown post id the same way as a hidden one", async () => {
    const viewer = await makeAccount();
    expect(await canSeePost(db(), viewer.id, newId())).toBeNull();
  });

  it("removes access at once when a friendship ends", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { audience: "friends" });
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
    const [a, b] = [author.id, friend.id].sort();
    await db()
      .delete(friendships)
      .where(and(eq(friendships.aId, a!), eq(friendships.bId, b!)));
    expect(await canSeePost(db(), friend.id, p.id)).toBeNull();
  });

  it("removes access to followers posts when the author stops accepting followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), follower.id, p.id)).not.toBeNull();
    await db()
      .update(accounts)
      .set({ acceptsFollowers: false })
      .where(eq(accounts.id, author.id));
    expect(await canSeePost(db(), follower.id, p.id)).toBeNull();
  });
});

describe("canSeePost: what is allowed", () => {
  it("lets the author see their own posts of both audiences", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    expect((await canSeePost(db(), author.id, p1.id))?.id).toBe(p1.id);
    expect((await canSeePost(db(), author.id, p2.id))?.id).toBe(p2.id);
  });

  it("lets a friend see friends-only and followers posts", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    expect((await canSeePost(db(), friend.id, p1.id))?.id).toBe(p1.id);
    // followers means friends *and* followers, whether or not the author
    // accepts followers
    expect((await canSeePost(db(), friend.id, p2.id))?.id).toBe(p2.id);
  });

  it("lets a follower see a followers post while the author accepts followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers" });
    expect((await canSeePost(db(), follower.id, p.id))?.id).toBe(p.id);
  });

  it("is symmetric in friendship: the friendship row's order does not matter", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    await befriend(y, x);
    const px = await post(x);
    const py = await post(y);
    expect(await canSeePost(db(), y.id, px.id)).not.toBeNull();
    expect(await canSeePost(db(), x.id, py.id)).not.toBeNull();
  });
});

describe("canSeePost: each clause binds the viewer and the author together", () => {
  // Added by the independent review. Each case would pass if a clause
  // checked only one side of the pair (the author alone, or the viewer
  // alone), so each one pins a way the predicate could be subtly wrong.

  it("denies a friend of a friend: friendship is not transitive", async () => {
    const author = await makeAccount({ acceptsFollowers: false });
    const middle = await makeAccount();
    const viewer = await makeAccount();
    await befriend(author, middle);
    await befriend(middle, viewer);
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), viewer.id, p1.id)).toBeNull();
    expect(await canSeePost(db(), viewer.id, p2.id)).toBeNull();
    expect(await visibleIds(viewer.id)).toEqual([]);
  });

  it("denies when only the author follows the viewer (the follow runs the wrong way)", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const viewer = await makeAccount({ acceptsFollowers: true });
    await follow(author, viewer);
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), viewer.id, p.id)).toBeNull();
  });

  it("denies when the viewer follows someone else who accepts followers, but not this author", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const other = await makeAccount({ acceptsFollowers: true });
    const viewer = await makeAccount();
    await follow(viewer, other);
    const p = await post(author, { audience: "followers" });
    const q = await post(other, { audience: "followers" });
    expect(await canSeePost(db(), viewer.id, p.id)).toBeNull();
    expect((await canSeePost(db(), viewer.id, q.id))?.id).toBe(q.id);
  });

  it("a block between other people hides nothing between these two", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const friend = await makeAccount();
    const follower = await makeAccount();
    const outsider = await makeAccount();
    await befriend(author, friend);
    await follow(follower, author);
    await block(author, outsider);
    await block(friend, outsider);
    await block(outsider, follower);
    const p1 = await post(author, { audience: "friends" });
    const p2 = await post(author, { audience: "followers" });
    expect((await canSeePost(db(), friend.id, p1.id))?.id).toBe(p1.id);
    expect((await canSeePost(db(), follower.id, p2.id))?.id).toBe(p2.id);
  });

  it("a block created after a follow hides at once, and lifting it restores the follow's reach", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers" });
    expect(await canSeePost(db(), follower.id, p.id)).not.toBeNull();
    // The fixture leaves the follow row in place, so only the block denies.
    await block(follower, author);
    expect(await canSeePost(db(), follower.id, p.id)).toBeNull();
    expect(await visibleIds(follower.id)).toEqual([]);
    await db()
      .delete(blocks)
      .where(and(eq(blocks.blockerId, follower.id), eq(blocks.blockedId, author.id)));
    expect((await canSeePost(db(), follower.id, p.id))?.id).toBe(p.id);
  });

  it("a follow row while accepts_followers is false reaches nothing, and reaches followers posts once it is true", async () => {
    const author = await makeAccount({ acceptsFollowers: false });
    const follower = await makeAccount();
    await follow(follower, author);
    const pFollowers = await post(author, { audience: "followers" });
    const pFriends = await post(author, { audience: "friends" });
    expect(await visibleIds(follower.id)).toEqual([]);
    await db()
      .update(accounts)
      .set({ acceptsFollowers: true })
      .where(eq(accounts.id, author.id));
    expect(await visibleIds(follower.id)).toEqual([pFollowers.id]);
    expect(await canSeePost(db(), follower.id, pFriends.id)).toBeNull();
  });

  it("a friend who also follows keeps followers posts when the author stops accepting followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const friend = await makeAccount();
    await befriend(author, friend);
    await follow(friend, author);
    const p = await post(author, { audience: "followers" });
    await db()
      .update(accounts)
      .set({ acceptsFollowers: false })
      .where(eq(accounts.id, author.id));
    expect((await canSeePost(db(), friend.id, p.id))?.id).toBe(p.id);
  });

  it("a friendship row written in canonical order by the database, from either argument order, is seen both ways", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    const z = await makeAccount();
    // Written the way a core function might: least/greatest in SQL.
    await db().execute(
      sql`insert into friendships (a_id, b_id) values (least(${x.id}, ${y.id}), greatest(${x.id}, ${y.id}))`,
    );
    await db().execute(
      sql`insert into friendships (a_id, b_id) values (least(${z.id}, ${x.id}), greatest(${z.id}, ${x.id}))`,
    );
    const px = await post(x);
    const py = await post(y);
    const pz = await post(z);
    expect(await canSeePost(db(), y.id, px.id)).not.toBeNull();
    expect(await canSeePost(db(), x.id, py.id)).not.toBeNull();
    expect(await canSeePost(db(), z.id, px.id)).not.toBeNull();
    expect(await canSeePost(db(), x.id, pz.id)).not.toBeNull();
    expect(await canSeePost(db(), y.id, pz.id)).toBeNull();
    expect(await canSeePost(db(), z.id, py.id)).toBeNull();
  });

  it("orders ids the same way in TypeScript and in the database, so canonical a < b agrees everywhere", async () => {
    // Friendships are canonical (a_id < b_id). Fixtures and core code may
    // order a pair in TypeScript; the check constraint and least/greatest
    // order it in Postgres. For ulids both must agree, under the database's
    // default collation and under ICU collations a hosted Postgres may use.
    const ids = Array.from({ length: 100 }, () => newId());
    // Shuffle so neighbours are not already in creation order.
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const collations = await db().execute(
      sql`select collname from pg_collation where collname in ('und-x-icu', 'en-US-x-icu', 'en_US.UTF-8', 'en_US.utf8', 'C.UTF-8', 'C.utf8')`,
    );
    const names = [null, ...collations.rows.map((r) => String((r as { collname: string }).collname))];
    for (const name of names) {
      const collate = name ? sql.raw(` collate "${name.replace(/"/g, "")}"`) : sql``;
      for (let i = 0; i + 1 < shuffled.length; i += 2) {
        const a = shuffled[i]!;
        const b = shuffled[i + 1]!;
        const result = await db().execute(sql`select (${a}::text${collate} < ${b}::text${collate}) as lt`);
        expect({ collation: name, a, b, lt: (result.rows[0] as { lt: boolean }).lt }).toEqual({
          collation: name,
          a,
          b,
          lt: a < b,
        });
      }
    }
  });

  it("treats a hostile viewer id as data, not SQL", async () => {
    const author = await makeAccount();
    const p = await post(author);
    for (const hostile of ["' or '1'='1", `${author.id}' or 1=1 --`, "", "%", "\\"]) {
      expect(await canSeePost(db(), hostile, p.id)).toBeNull();
      expect(await visibleIds(hostile)).toEqual([]);
    }
  });
});

describe("one source of truth", () => {
  it("the list predicate and canSeePost agree for every viewer and post", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const closed = await makeAccount({ acceptsFollowers: false });
    const friend = await makeAccount();
    const follower = await makeAccount();
    const stranger = await makeAccount();
    const blocker = await makeAccount();
    const suspended = await makeAccount();
    await befriend(author, friend);
    await befriend(closed, friend);
    await follow(follower, author);
    await follow(follower, closed);
    await befriend(author, blocker);
    await block(blocker, author);
    await befriend(suspended, friend);

    const all = [
      await post(author, { audience: "friends" }),
      await post(author, { audience: "followers" }),
      await post(closed, { audience: "friends" }),
      await post(closed, { audience: "followers" }),
      await post(friend, { audience: "friends" }),
      await post(suspended, { audience: "followers" }),
    ];
    const removed = await post(author, { audience: "followers" });
    await removePost(removed.id);
    all.push(removed);
    await suspend(suspended.id);

    const viewers = [author, closed, friend, follower, stranger, blocker, suspended];
    for (const viewer of viewers) {
      const fromList = await visibleIds(viewer.id);
      const fromSingle: string[] = [];
      for (const p of all) {
        if (await canSeePost(db(), viewer.id, p.id)) fromSingle.push(p.id);
      }
      expect(fromList).toEqual([...fromSingle].sort());
    }

    // And the matrix itself, spelled out.
    expect(await visibleIds(follower.id)).toEqual([all[1]!.id]);
    expect(await visibleIds(stranger.id)).toEqual([]);
    expect(await visibleIds(blocker.id)).toEqual([]);
    expect(await visibleIds(friend.id)).toEqual(
      [all[0]!.id, all[1]!.id, all[2]!.id, all[3]!.id, all[4]!.id].sort(),
    );
  });

  it("works for an aliased posts table via explicit columns", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const stranger = await makeAccount();
    const p = await post(author);
    const aliased = alias(posts, "p");
    const forFriend = await db()
      .select({ id: aliased.id })
      .from(aliased)
      .where(visiblePostPredicate(friend.id, aliased));
    expect(forFriend.map((r) => r.id)).toEqual([p.id]);
    const forStranger = await db()
      .select({ id: aliased.id })
      .from(aliased)
      .where(visiblePostPredicate(stranger.id, aliased));
    expect(forStranger).toEqual([]);
  });
});

describe("replies", () => {
  it("hides a reply whose author is blocked either way, or suspended, or that was removed", async () => {
    const author = await makeAccount();
    const viewer = await makeAccount();
    const blockedReplier = await makeAccount();
    const blockingReplier = await makeAccount();
    const suspendedReplier = await makeAccount();
    const friendlyReplier = await makeAccount();
    for (const x of [viewer, blockedReplier, blockingReplier, suspendedReplier, friendlyReplier]) {
      await befriend(author, x);
    }
    await block(viewer, blockedReplier);
    await block(blockingReplier, viewer);
    const p = await post(author);
    const r1 = await reply(p.id, blockedReplier.id);
    const r2 = await reply(p.id, blockingReplier.id);
    const r3 = await reply(p.id, suspendedReplier.id);
    const r4 = await reply(p.id, friendlyReplier.id);
    const r5 = await reply(p.id, friendlyReplier.id);
    await suspend(suspendedReplier.id);
    await db().update(replies).set({ removedAt: new Date() }).where(eq(replies.id, r5.id));

    expect(await canSeeReply(db(), viewer.id, r1.id)).toBeNull();
    expect(await canSeeReply(db(), viewer.id, r2.id)).toBeNull();
    expect(await canSeeReply(db(), viewer.id, r3.id)).toBeNull();
    expect(await canSeeReply(db(), viewer.id, r5.id)).toBeNull();
    expect((await canSeeReply(db(), viewer.id, r4.id))?.id).toBe(r4.id);

    const listed = await db()
      .select({ id: replies.id })
      .from(replies)
      .innerJoin(posts, eq(posts.id, replies.postId))
      .where(
        and(
          eq(replies.postId, p.id),
          visiblePostPredicate(viewer.id),
          visibleReplyPredicate(viewer.id),
        ),
      );
    expect(listed.map((r) => r.id)).toEqual([r4.id]);
  });

  it("hides every reply, even a visible replier's, once the post is removed or its author suspended", async () => {
    const author = await makeAccount();
    const other = await makeAccount();
    const viewer = await makeAccount();
    await befriend(author, viewer);
    await befriend(other, viewer);
    await befriend(author, other);
    const removed = await post(author);
    const r1 = await reply(removed.id, viewer.id);
    const r2 = await reply(removed.id, other.id);
    await removePost(removed.id);
    expect(await canSeeReply(db(), viewer.id, r1.id)).toBeNull();
    expect(await canSeeReply(db(), viewer.id, r2.id)).toBeNull();

    const byOther = await post(other);
    const r3 = await reply(byOther.id, viewer.id);
    expect((await canSeeReply(db(), viewer.id, r3.id))?.id).toBe(r3.id);
    await suspend(other.id);
    expect(await canSeeReply(db(), viewer.id, r3.id)).toBeNull();
  });

  it("hides every reply of a post the viewer cannot see", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    const stranger = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { audience: "friends" });
    const r = await reply(p.id, friend.id);
    expect(await canSeeReply(db(), stranger.id, r.id)).toBeNull();
    expect((await canSeeReply(db(), friend.id, r.id))?.id).toBe(r.id);
  });
});

describe("relationship helpers", () => {
  it("isBlocked sees a block in either direction", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    const z = await makeAccount();
    await block(x, y);
    expect(await isBlocked(db(), x.id, y.id)).toBe(true);
    expect(await isBlocked(db(), y.id, x.id)).toBe(true);
    expect(await isBlocked(db(), x.id, z.id)).toBe(false);
  });

  it("areFriends is false with a block, and never true for oneself", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    await befriend(x, y);
    expect(await areFriends(db(), x.id, y.id)).toBe(true);
    expect(await areFriends(db(), y.id, x.id)).toBe(true);
    expect(await areFriends(db(), x.id, x.id)).toBe(false);
    await block(y, x);
    expect(await areFriends(db(), x.id, y.id)).toBe(false);
  });

  it("isFollowing needs the follow row, accepts_followers and no block", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const closed = await makeAccount({ acceptsFollowers: false });
    const f = await makeAccount();
    await follow(f, author);
    await follow(f, closed);
    expect(await isFollowing(db(), f.id, author.id)).toBe(true);
    expect(await isFollowing(db(), f.id, closed.id)).toBe(false);
    expect(await isFollowing(db(), author.id, f.id)).toBe(false);
    await block(author, f);
    expect(await isFollowing(db(), f.id, author.id)).toBe(false);
  });

  it("isActive and canSeeAccount refuse suspended and blocked people", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    const s = await makeAccount({ suspended: true });
    expect(await isActive(db(), x.id)).toBe(true);
    expect(await isActive(db(), s.id)).toBe(false);
    expect(await isActive(db(), newId())).toBe(false);
    expect(await canSeeAccount(db(), x.id, y.id)).toBe(true);
    expect(await canSeeAccount(db(), x.id, s.id)).toBe(false);
    await block(y, x);
    expect(await canSeeAccount(db(), x.id, y.id)).toBe(false);
    expect(await canSeeAccount(db(), y.id, x.id)).toBe(false);
  });
});

describe("relationship()", () => {
  const now = at("2026-09-01T12:00:00Z");

  it("reports nothing between strangers", async () => {
    const v = await makeAccount();
    const o = await makeAccount();
    expect(await relationship(db(), v.id, o.id, now)).toEqual({
      self: false,
      friends: false,
      requestOut: false,
      requestIn: false,
      following: false,
      followedBy: false,
      blocked: false,
      blockedBy: false,
      muted: false,
      acceptsFollowers: false,
    });
  });

  it("reports self", async () => {
    const v = await makeAccount({ acceptsFollowers: true });
    const r = await relationship(db(), v.id, v.id, now);
    expect(r.self).toBe(true);
    expect(r.friends).toBe(false);
    expect(r.following).toBe(false);
    expect(r.acceptsFollowers).toBe(true);
  });

  it("reports friends, follows both ways, mute and accepts_followers", async () => {
    const v = await makeAccount({ acceptsFollowers: true });
    const o = await makeAccount({ acceptsFollowers: true });
    await befriend(v, o);
    await follow(v, o);
    await follow(o, v);
    await mute(v, o);
    const r = await relationship(db(), v.id, o.id, now);
    expect(r).toMatchObject({
      self: false,
      friends: true,
      following: true,
      followedBy: true,
      muted: true,
      acceptsFollowers: true,
      blocked: false,
      blockedBy: false,
    });
    // Mute is private: the other side does not see it.
    expect((await relationship(db(), o.id, v.id, now)).muted).toBe(false);
  });

  it("does not report following when the other side does not accept followers", async () => {
    const v = await makeAccount({ acceptsFollowers: false });
    const o = await makeAccount({ acceptsFollowers: false });
    await follow(v, o);
    await follow(o, v);
    const r = await relationship(db(), v.id, o.id, now);
    expect(r.following).toBe(false);
    expect(r.followedBy).toBe(false);
  });

  it("reports pending requests in each direction, and not after 30 days", async () => {
    const v = await makeAccount();
    const o = await makeAccount();
    const w = await makeAccount();
    await db().insert(friendRequests).values([
      { id: newId(), fromId: v.id, toId: o.id, status: "pending", createdAt: plus.days(now, -1) },
      { id: newId(), fromId: w.id, toId: v.id, status: "pending", createdAt: plus.days(now, -31) },
    ]);
    const r = await relationship(db(), v.id, o.id, now);
    expect(r.requestOut).toBe(true);
    expect(r.requestIn).toBe(false);
    expect((await relationship(db(), o.id, v.id, now)).requestIn).toBe(true);
    expect((await relationship(db(), v.id, w.id, now)).requestIn).toBe(false);
  });

  it("reports blocked and blockedBy, and a block hides every other connection", async () => {
    const v = await makeAccount({ acceptsFollowers: true });
    const o = await makeAccount({ acceptsFollowers: true });
    await befriend(v, o);
    await follow(v, o);
    await follow(o, v);
    await db().insert(friendRequests).values({
      id: newId(),
      fromId: v.id,
      toId: o.id,
      status: "pending",
      createdAt: now,
    });
    await block(o, v);
    const r = await relationship(db(), v.id, o.id, now);
    expect(r).toMatchObject({
      blocked: false,
      blockedBy: true,
      friends: false,
      following: false,
      followedBy: false,
      requestOut: false,
      requestIn: false,
    });
    const back = await relationship(db(), o.id, v.id, now);
    expect(back.blocked).toBe(true);
    expect(back.blockedBy).toBe(false);
  });
});

describe("notifications (foundation helpers)", () => {
  it("never notifies you about yourself", async () => {
    const x = await makeAccount();
    const id = await notify(db(), { recipientId: x.id, kind: "like", actorId: x.id });
    expect(id).toBeNull();
    expect(await countUnread(db(), x.id)).toBe(0);
  });

  it("skips when there is a block either way", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    const z = await makeAccount();
    await block(x, y);
    await block(z, x);
    expect(await notify(db(), { recipientId: x.id, kind: "like", actorId: y.id })).toBeNull();
    expect(await notify(db(), { recipientId: y.id, kind: "like", actorId: x.id })).toBeNull();
    expect(await notify(db(), { recipientId: x.id, kind: "reply", actorId: z.id })).toBeNull();
    expect(await countUnread(db(), x.id)).toBe(0);
  });

  it("refuses a statement on a kind that does not carry one", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    await expect(
      notify(db(), { recipientId: x.id, kind: "like", actorId: y.id, body: "FICTIONAL" }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("counts unread notifications", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    await notify(db(), { recipientId: x.id, kind: "friend_request", actorId: y.id });
    const second = await notify(db(), {
      recipientId: x.id,
      kind: "content_removed",
      body: "FICTIONAL statement of reasons.",
    });
    expect(second).not.toBeNull();
    expect(await countUnread(db(), x.id)).toBe(2);
    await db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, second!));
    expect(await countUnread(db(), x.id)).toBe(1);
    expect(await countUnread(db(), y.id)).toBe(0);
  });

  it("counts only pending, unexpired requests from active, unblocked people", async () => {
    const now = at("2026-09-01T12:00:00Z");
    const me = await makeAccount();
    const fresh = await makeAccount();
    const old = await makeAccount();
    const suspended = await makeAccount({ suspended: true });
    const blocked = await makeAccount();
    const declined = await makeAccount();
    await block(me, blocked);
    await db().insert(friendRequests).values([
      { id: newId(), fromId: fresh.id, toId: me.id, status: "pending", createdAt: plus.days(now, -2) },
      { id: newId(), fromId: old.id, toId: me.id, status: "pending", createdAt: plus.days(now, -31) },
      { id: newId(), fromId: suspended.id, toId: me.id, status: "pending", createdAt: now },
      { id: newId(), fromId: blocked.id, toId: me.id, status: "pending", createdAt: now },
      { id: newId(), fromId: declined.id, toId: me.id, status: "declined", createdAt: now },
    ]);
    expect(await countIncomingRequests(db(), me.id, now)).toBe(1);
  });
});

describe("the database refuses what the spec does not allow", () => {
  it("allows at most one pending request per unordered pair", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    await db().insert(friendRequests).values({ id: newId(), fromId: x.id, toId: y.id, status: "pending" });
    await expect(
      db().insert(friendRequests).values({ id: newId(), fromId: y.id, toId: x.id, status: "pending" }),
    ).rejects.toThrow();
    // A decided request does not block a new pending one.
    await db()
      .update(friendRequests)
      .set({ status: "declined" })
      .where(inArray(friendRequests.fromId, [x.id]));
    await db().insert(friendRequests).values({ id: newId(), fromId: y.id, toId: x.id, status: "pending" });
  });

  it("refuses an unordered friendship row and a self-follow", async () => {
    const x = await makeAccount();
    const y = await makeAccount();
    const [small, large] = [x.id, y.id].sort();
    await expect(
      db().insert(friendships).values({ aId: large!, bId: small! }),
    ).rejects.toThrow();
    await expect(follow(x, x)).rejects.toThrow();
    await expect(block(x, x)).rejects.toThrow();
  });

  it("refuses a handle outside the format", async () => {
    await expect(makeAccount({ handle: "Not_Lower" })).rejects.toThrow();
    await expect(makeAccount({ handle: "ab" })).rejects.toThrow();
  });
});
