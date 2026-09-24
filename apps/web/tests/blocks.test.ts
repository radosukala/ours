/**
 * Blocking (SPEC §6): a block takes effect at once, in one transaction,
 * in either direction; afterwards the two cannot reach each other; and
 * unblocking restores nothing. Everyone here is FICTIONAL.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  block,
  follow,
  listBlocked,
  listFriends,
  PERSON_NOT_FOUND,
  sendFriendRequest,
  unblock,
} from "@/core/connections";
import { isCoreError } from "@/core/errors";
import { newId, sha256 } from "@/core/ids";
import { applyInviteAsExisting } from "@/core/invites";
import {
  blocks,
  follows,
  friendRequests,
  friendships,
  invites,
  likes,
  notifications,
} from "@/core/schema";
import {
  areFriends,
  canSeePost,
  isFollowing,
  relationship,
} from "@/core/visibility";
import * as fx from "./helpers";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);

const t0 = at("2026-09-01T12:00:00Z");

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return error as Error & { code: string };
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

async function like(postId: string, accountId: string) {
  await db().insert(likes).values({ postId, accountId, createdAt: t0 });
}

async function note(recipientId: string, actorId: string | null, kind: "like" | "reply" | "friend_request" | "new_follower" = "like") {
  await db().insert(notifications).values({
    id: newId(),
    recipientId,
    actorId,
    kind,
    createdAt: t0,
  });
}

/**
 * Anna and Ben are friends, follow each other, liked each other's posts,
 * and have notifications caused by each other. Cleo is a bystander with
 * the same kinds of ties to both, which a block between Anna and Ben must
 * not touch.
 */
async function entangled() {
  const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
  const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
  const cleo = await makeAccount({ handle: "cleo", acceptsFollowers: true });
  await fx.befriend(anna, ben);
  await fx.befriend(anna, cleo);
  await fx.befriend(ben, cleo);
  await fx.follow(anna, ben);
  await fx.follow(ben, anna);
  await fx.follow(cleo, anna);
  await fx.follow(cleo, ben);
  const annaPost = await fx.post(anna, { audience: "followers", at: t0 });
  const benPost = await fx.post(ben, { audience: "friends", at: t0 });
  await like(annaPost.id, ben.id);
  await like(benPost.id, anna.id);
  await like(annaPost.id, cleo.id);
  await like(benPost.id, cleo.id);
  await like(annaPost.id, anna.id); // her own like on her own post stays
  await note(anna.id, ben.id, "like");
  await note(ben.id, anna.id, "like");
  await note(anna.id, cleo.id, "like");
  await note(ben.id, cleo.id, "reply");
  await note(anna.id, null, "like");
  return { anna, ben, cleo, annaPost, benPost };
}

/* ---------------------------------------------------------------- denials */

describe("block: refusals", () => {
  it("refuses blocking yourself (INVALID)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(block(db(), anna.id, anna.id, t0), "INVALID");
    expect(await db().select().from(blocks)).toHaveLength(0);
  });

  it("refuses blocking nobody (NOT_FOUND)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(block(db(), anna.id, newId(), t0), "NOT_FOUND");
  });

  it("refuses a suspended blocker (FORBIDDEN)", async () => {
    const sam = await makeAccount({ handle: "sam", suspended: true });
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(block(db(), sam.id, anna.id, t0), "FORBIDDEN");
  });

  it("after a block, in either direction, requests and follows are the same NOT_FOUND as nobody", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
    await block(db(), anna.id, ben.id, t0);
    const nobody = await expectCode(sendFriendRequest(db(), ben.id, newId(), t0), "NOT_FOUND");
    for (const [x, y] of [
      [anna.id, ben.id],
      [ben.id, anna.id],
    ] as const) {
      const req = await expectCode(sendFriendRequest(db(), x, y, t0), "NOT_FOUND");
      const fol = await expectCode(follow(db(), x, y, t0), "NOT_FOUND");
      expect(req.message).toBe(nobody.message);
      expect(fol.message).toBe(PERSON_NOT_FOUND);
    }
    expect(await db().select().from(friendRequests)).toHaveLength(0);
    expect(await db().select().from(follows)).toHaveLength(0);
  });

  it("after a block, an invite from the other person is the generic NOT_FOUND and is not consumed", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const [invite] = await db()
      .insert(invites)
      .values({ id: newId(), codeHash: sha256(newId()), inviterId: anna.id, expiresAt: plus.days(t0, 30) })
      .returning();
    await block(db(), ben.id, anna.id, t0);
    await expectCode(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite!.id, now: t0 }),
      "NOT_FOUND",
    );
    const [after] = await db().select().from(invites).where(eq(invites.id, invite!.id));
    expect(after!.usedAt).toBeNull();
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
  });
});

/* ------------------------------------------------------ the transaction */

describe("block: effects, at once and both ways", () => {
  it("deletes the friendship, follows both ways, likes both ways and notifications by the other", async () => {
    const { anna, ben, cleo, annaPost, benPost } = await entangled();

    await block(db(), anna.id, ben.id, plus.hours(t0, 1));

    // friendship
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    const pairs = await db().select().from(friendships);
    expect(pairs).toHaveLength(2); // anna–cleo and ben–cleo stay
    expect(await areFriends(db(), anna.id, cleo.id)).toBe(true);
    expect(await areFriends(db(), ben.id, cleo.id)).toBe(true);

    // follows both ways gone; cleo's follows stay
    const f = await db().select().from(follows);
    expect(f.map((r) => `${r.followerId}>${r.followeeId}`).sort()).toEqual(
      [`${cleo.id}>${anna.id}`, `${cleo.id}>${ben.id}`].sort(),
    );

    // likes by each on the other's posts gone; others stay
    const l = await db().select().from(likes);
    expect(l.map((r) => `${r.accountId}@${r.postId}`).sort()).toEqual(
      [
        `${cleo.id}@${annaPost.id}`,
        `${cleo.id}@${benPost.id}`,
        `${anna.id}@${annaPost.id}`,
      ].sort(),
    );

    // notifications whose actor is the other person gone, both ways
    const n = await db().select().from(notifications);
    expect(n.map((r) => `${r.recipientId}<${r.actorId}`).sort()).toEqual(
      [`${anna.id}<${cleo.id}`, `${ben.id}<${cleo.id}`, `${anna.id}<null`].sort(),
    );

    // the block row
    const b = await db().select().from(blocks);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ blockerId: anna.id, blockedId: ben.id });
  });

  it("cancels pending friend requests both ways", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await sendFriendRequest(db(), cleo.id, ben.id, t0);
    await block(db(), ben.id, anna.id, plus.hours(t0, 1));
    const rows = await db().select().from(friendRequests);
    const annaBen = rows.find((r) => r.fromId === anna.id)!;
    const cleoBen = rows.find((r) => r.fromId === cleo.id)!;
    expect(annaBen.status).toBe("cancelled");
    expect(annaBen.respondedAt?.toISOString()).toBe(plus.hours(t0, 1).toISOString());
    expect(cleoBen.status).toBe("pending");
    // the friend_request notification from anna to ben is gone too
    const n = await db().select().from(notifications).where(eq(notifications.recipientId, ben.id));
    expect(n.map((r) => r.actorId)).toEqual([cleo.id]);
  });

  it("hides each from the other: posts through the one predicate, in both directions", async () => {
    const { anna, ben, annaPost, benPost } = await entangled();
    expect(await canSeePost(db(), ben.id, annaPost.id)).not.toBeNull();
    expect(await canSeePost(db(), anna.id, benPost.id)).not.toBeNull();
    await block(db(), ben.id, anna.id, t0); // ben blocks anna
    expect(await canSeePost(db(), ben.id, annaPost.id)).toBeNull();
    expect(await canSeePost(db(), anna.id, benPost.id)).toBeNull();
    const rel = await relationship(db(), ben.id, anna.id, t0);
    expect(rel).toMatchObject({ blocked: true, friends: false, following: false, followedBy: false });
    const other = await relationship(db(), anna.id, ben.id, t0);
    expect(other).toMatchObject({ blocked: false, blockedBy: true, friends: false });
  });

  it("blocking again is harmless", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await block(db(), anna.id, ben.id, t0);
    await block(db(), anna.id, ben.id, plus.minutes(t0, 1));
    expect(await db().select().from(blocks)).toHaveLength(1);
  });

  it("you can block someone who blocked you (refusing would tell you they had)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await block(db(), ben.id, anna.id, t0);
    await block(db(), anna.id, ben.id, t0);
    expect(await db().select().from(blocks)).toHaveLength(2);
  });

  it("listBlocked lists the people you blocked, and only yours", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await block(db(), anna.id, ben.id, t0);
    await block(db(), cleo.id, anna.id, t0);
    expect((await listBlocked(db(), anna.id)).map((p) => p.handle)).toEqual(["ben"]);
    expect((await listBlocked(db(), cleo.id)).map((p) => p.handle)).toEqual(["anna"]);
    expect(await listBlocked(db(), ben.id)).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- unblock */

describe("unblock", () => {
  it("restores nothing: no friendship, follows, requests, likes or notifications come back", async () => {
    const { anna, ben, annaPost, benPost } = await entangled();
    await sendFriendRequest(db(), anna.id, (await makeAccount()).id, t0); // unrelated
    const before = {
      likes: (await db().select().from(likes)).length,
      notes: (await db().select().from(notifications)).length,
    };
    await block(db(), anna.id, ben.id, t0);
    await unblock(db(), anna.id, ben.id);

    expect(await db().select().from(blocks)).toHaveLength(0);
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    expect(await isFollowing(db(), anna.id, ben.id)).toBe(false);
    expect(await isFollowing(db(), ben.id, anna.id)).toBe(false);
    expect((await db().select().from(likes)).length).toBe(before.likes - 2);
    expect((await db().select().from(notifications)).length).toBe(before.notes - 2);
    expect((await listFriends(db(), anna.id)).map((p) => p.handle)).toEqual(["cleo"]);
    // Anna's followers post is visible to Ben again only if he follows again;
    // Ben's friends-only post is not visible to Anna without a new friendship.
    expect(await canSeePost(db(), ben.id, annaPost.id)).toBeNull();
    expect(await canSeePost(db(), anna.id, benPost.id)).toBeNull();
  });

  it("after unblocking, a new request and a new acceptance are needed", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await fx.befriend(anna, ben);
    await block(db(), anna.id, ben.id, t0);
    await unblock(db(), anna.id, ben.id);
    await expect(sendFriendRequest(db(), ben.id, anna.id, t0)).resolves.toEqual({
      status: "requested",
    });
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
  });

  it("only removes your own block: the other person's block stays", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await block(db(), anna.id, ben.id, t0);
    await block(db(), ben.id, anna.id, t0);
    await unblock(db(), anna.id, ben.id);
    const rows = await db().select().from(blocks);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ blockerId: ben.id, blockedId: anna.id });
    // Ben's block still stands, so Anna still cannot reach him.
    await expectCode(sendFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
  });
});
