/**
 * Connections (SPEC §5, §6, §8): friend requests, friendships, follows and
 * mutes, and the /people lists. Denial paths first. Blocks have their own
 * file (blocks.test.ts). Everyone here is FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  follow,
  listFollowers,
  listFollowing,
  listFriends,
  listMuted,
  listRequests,
  mute,
  PERSON_NOT_FOUND,
  sendFriendRequest,
  unfollow,
  unfriend,
  unmute,
} from "@/core/connections";
import { isCoreError } from "@/core/errors";
import { newId } from "@/core/ids";
import {
  accounts,
  follows,
  friendRequests,
  friendships,
  mutes,
  notifications,
  rateEvents,
} from "@/core/schema";
import { areFriends, canSeePost, relationship } from "@/core/visibility";
import * as fx from "./helpers";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);

const t0 = at("2026-09-01T12:00:00Z");

/** Resolves to the CoreError, after asserting its code. */
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

async function requestsBetween(x: string, y: string) {
  const all = await db().select().from(friendRequests);
  return all.filter(
    (r) => (r.fromId === x && r.toId === y) || (r.fromId === y && r.toId === x),
  );
}

async function notificationsFor(recipientId: string) {
  return db()
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, recipientId));
}

/* ---------------------------------------------------- refusals first */

describe("friend requests: refusals", () => {
  it("refuses a request to yourself (INVALID) and stores nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(sendFriendRequest(db(), anna.id, anna.id, t0), "INVALID");
    expect(await db().select().from(friendRequests)).toHaveLength(0);
  });

  it("refuses a request to nobody with NOT_FOUND", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const error = await expectCode(
      sendFriendRequest(db(), anna.id, newId(), t0),
      "NOT_FOUND",
    );
    expect(error.message).toBe(PERSON_NOT_FOUND);
  });

  it("refuses a request to a blocked person, either way, with the same NOT_FOUND as nobody", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await fx.block(ben, anna); // ben blocked anna
    await fx.block(anna, cleo); // anna blocked cleo

    const nobody = await expectCode(sendFriendRequest(db(), anna.id, newId(), t0), "NOT_FOUND");
    const blockedBy = await expectCode(sendFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    const blocking = await expectCode(sendFriendRequest(db(), anna.id, cleo.id, t0), "NOT_FOUND");
    const reverse = await expectCode(sendFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
    expect(blockedBy.message).toBe(nobody.message);
    expect(blocking.message).toBe(nobody.message);
    expect(reverse.message).toBe(nobody.message);
    expect(await db().select().from(friendRequests)).toHaveLength(0);
    expect(await notificationsFor(ben.id)).toHaveLength(0);
    expect(await notificationsFor(cleo.id)).toHaveLength(0);
  });

  it("refuses a request to a suspended person with the same NOT_FOUND", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const sam = await makeAccount({ handle: "sam", suspended: true });
    const error = await expectCode(sendFriendRequest(db(), anna.id, sam.id, t0), "NOT_FOUND");
    expect(error.message).toBe(PERSON_NOT_FOUND);
  });

  it("refuses a suspended sender (FORBIDDEN)", async () => {
    const sam = await makeAccount({ handle: "sam", suspended: true });
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(sendFriendRequest(db(), sam.id, anna.id, t0), "FORBIDDEN");
  });

  it("rate-limits to 50 requests a day", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const people = [];
    for (let i = 0; i < 51; i++) people.push(await makeAccount());
    for (let i = 0; i < 50; i++) {
      await sendFriendRequest(db(), anna.id, people[i]!.id, plus.minutes(t0, i));
    }
    await expectCode(
      sendFriendRequest(db(), anna.id, people[50]!.id, plus.minutes(t0, 51)),
      "RATE_LIMITED",
    );
    expect(await requestsBetween(anna.id, people[50]!.id)).toHaveLength(0);
    // A day later it works again.
    await expect(
      sendFriendRequest(db(), anna.id, people[50]!.id, plus.hours(t0, 25)),
    ).resolves.toEqual({ status: "requested" });
  });

  it("accepting, declining or cancelling a request that isn't there is NOT_FOUND", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await expectCode(acceptFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    await expectCode(declineFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    await expectCode(cancelFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
  });

  it("only the recipient can accept or decline; only the sender can cancel", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    // anna cannot accept her own request to ben
    await expectCode(acceptFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    await expectCode(declineFriendRequest(db(), anna.id, ben.id, t0), "NOT_FOUND");
    // ben cannot cancel a request he did not send
    await expectCode(cancelFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row!.status).toBe("pending");
  });

  it("a third person cannot accept someone else's request", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await expectCode(acceptFriendRequest(db(), cleo.id, anna.id, t0), "NOT_FOUND");
    expect(await areFriends(db(), anna.id, cleo.id)).toBe(false);
  });

  it("a request older than 30 days has expired: it cannot be accepted, and is marked so lazily", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await expectCode(
      acceptFriendRequest(db(), ben.id, anna.id, plus.days(t0, 30)),
      "NOT_FOUND",
    );
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row!.status).toBe("expired");
    expect(row!.respondedAt?.toISOString()).toBe(plus.days(t0, 30).toISOString());
  });

  it("a request accepted by someone suspended since is refused", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, anna.id));
    await expectCode(acceptFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
    expect(await db().select().from(friendships)).toHaveLength(0);
  });
});

describe("friend requests: the partial unique index", () => {
  it("allows at most one pending request per unordered pair, whatever the direction", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await db().insert(friendRequests).values({
      id: newId(),
      fromId: anna.id,
      toId: ben.id,
      status: "pending",
      createdAt: t0,
    });
    await expect(
      db().insert(friendRequests).values({
        id: newId(),
        fromId: ben.id,
        toId: anna.id,
        status: "pending",
        createdAt: t0,
      }),
    ).rejects.toThrow();
    await expect(
      db().insert(friendRequests).values({
        id: newId(),
        fromId: anna.id,
        toId: ben.id,
        status: "pending",
        createdAt: t0,
      }),
    ).rejects.toThrow();
    // Non-pending rows for the pair are fine.
    await db().insert(friendRequests).values({
      id: newId(),
      fromId: anna.id,
      toId: ben.id,
      status: "declined",
      createdAt: t0,
    });
  });

  it("an expired request does not stop a new one (it is marked expired first)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    const later = plus.days(t0, 31);
    await expect(sendFriendRequest(db(), anna.id, ben.id, later)).resolves.toEqual({
      status: "requested",
    });
    const rows = await requestsBetween(anna.id, ben.id);
    expect(rows.map((r) => r.status).sort()).toEqual(["expired", "pending"]);
  });
});

/* ------------------------------------------------------ the lifecycle */

describe("friend requests: the lifecycle", () => {
  it("a request is pending and notifies the recipient (friend_request)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await expect(sendFriendRequest(db(), anna.id, ben.id, t0)).resolves.toEqual({
      status: "requested",
    });
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row).toMatchObject({ fromId: anna.id, toId: ben.id, status: "pending" });
    const notes = await notificationsFor(ben.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "friend_request", actorId: anna.id });
    const rel = await relationship(db(), anna.id, ben.id, t0);
    expect(rel.requestOut).toBe(true);
    expect(rel.friends).toBe(false);
  });

  it("asking twice is idempotent: one request, one notification, one rate event", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await expect(sendFriendRequest(db(), anna.id, ben.id, plus.minutes(t0, 1))).resolves.toEqual({
      status: "requested",
    });
    expect(await requestsBetween(anna.id, ben.id)).toHaveLength(1);
    expect(await notificationsFor(ben.id)).toHaveLength(1);
    expect(
      await db().select().from(rateEvents).where(eq(rateEvents.key, `friendreq:${anna.id}`)),
    ).toHaveLength(1);
  });

  it("two requests racing for the same pair leave one pending request", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const results = await Promise.all([
      sendFriendRequest(db(), anna.id, ben.id, t0),
      sendFriendRequest(db(), anna.id, ben.id, t0),
      sendFriendRequest(db(), anna.id, ben.id, t0),
    ]);
    for (const r of results) expect(r.status).toBe("requested");
    const rows = await requestsBetween(anna.id, ben.id);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("already friends answers already_friends and creates nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await fx.befriend(anna, ben);
    await expect(sendFriendRequest(db(), anna.id, ben.id, t0)).resolves.toEqual({
      status: "already_friends",
    });
    expect(await requestsBetween(anna.id, ben.id)).toHaveLength(0);
    expect(await notificationsFor(ben.id)).toHaveLength(0);
  });

  it("crossed requests: adding someone who already asked you accepts their request", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await expect(sendFriendRequest(db(), ben.id, anna.id, plus.minutes(t0, 5))).resolves.toEqual({
      status: "accepted",
    });
    expect(await areFriends(db(), anna.id, ben.id)).toBe(true);
    const rows = await requestsBetween(anna.id, ben.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("accepted");
    const annaNotes = await notificationsFor(anna.id);
    expect(annaNotes.map((n) => n.kind)).toEqual(["friend_accepted"]);
    expect(annaNotes[0]!.actorId).toBe(ben.id);
  });

  it("accept makes friends and tells the sender (friend_accepted)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await acceptFriendRequest(db(), ben.id, anna.id, plus.hours(t0, 1));
    expect(await areFriends(db(), anna.id, ben.id)).toBe(true);
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row).toMatchObject({ status: "accepted" });
    expect(row!.respondedAt?.toISOString()).toBe(plus.hours(t0, 1).toISOString());
    const notes = await notificationsFor(anna.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "friend_accepted", actorId: ben.id });
    // accepting again is NOT_FOUND: there is no pending request any more
    await expectCode(acceptFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
  });

  it("decline: no friendship, and the sender is not told", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await declineFriendRequest(db(), ben.id, anna.id, plus.hours(t0, 1));
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row!.status).toBe("declined");
    expect(await notificationsFor(anna.id)).toHaveLength(0);
    const rel = await relationship(db(), ben.id, anna.id, t0);
    expect(rel.requestIn).toBe(false);
  });

  it("cancel: the request is gone from both lists", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await cancelFriendRequest(db(), anna.id, ben.id, plus.hours(t0, 1));
    const [row] = await requestsBetween(anna.id, ben.id);
    expect(row!.status).toBe("cancelled");
    expect((await listRequests(db(), ben.id, t0)).incoming).toHaveLength(0);
    expect((await listRequests(db(), anna.id, t0)).outgoing).toHaveLength(0);
    // It can no longer be accepted.
    await expectCode(acceptFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
  });
});

describe("unfriend", () => {
  it("removes access to friends-only posts at once (through the one predicate)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await acceptFriendRequest(db(), ben.id, anna.id, t0);
    const secret = await fx.post(anna, { audience: "friends", at: t0 });
    expect(await canSeePost(db(), ben.id, secret.id)).not.toBeNull();

    await unfriend(db(), ben.id, anna.id);
    expect(await canSeePost(db(), ben.id, secret.id)).toBeNull();
    expect(await canSeePost(db(), anna.id, secret.id)).not.toBeNull();
    expect(await db().select().from(friendships)).toHaveLength(0);
  });

  it("reconnecting needs a new request and a new acceptance", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), anna.id, ben.id, t0);
    await acceptFriendRequest(db(), ben.id, anna.id, t0);
    await unfriend(db(), anna.id, ben.id);

    // The old accepted request does not come back to life.
    await expectCode(acceptFriendRequest(db(), ben.id, anna.id, t0), "NOT_FOUND");
    await expect(sendFriendRequest(db(), anna.id, ben.id, plus.hours(t0, 1))).resolves.toEqual({
      status: "requested",
    });
    expect(await areFriends(db(), anna.id, ben.id)).toBe(false);
    await acceptFriendRequest(db(), ben.id, anna.id, plus.hours(t0, 2));
    expect(await areFriends(db(), anna.id, ben.id)).toBe(true);
  });

  it("unfriending someone you are not friends with changes nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await fx.befriend(ben, cleo);
    await unfriend(db(), anna.id, ben.id);
    expect(await areFriends(db(), ben.id, cleo.id)).toBe(true);
  });
});

/* ---------------------------------------------------------------- follows */

describe("follow", () => {
  it("is refused unless the person accepts followers (FORBIDDEN), and stores nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: false });
    await expectCode(follow(db(), anna.id, ben.id, t0), "FORBIDDEN");
    expect(await db().select().from(follows)).toHaveLength(0);
    expect(await notificationsFor(ben.id)).toHaveLength(0);
  });

  it("is refused toward yourself (INVALID)", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    await expectCode(follow(db(), anna.id, anna.id, t0), "INVALID");
  });

  it("is refused toward nobody, a suspended person, or across a block, all the same NOT_FOUND", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const sam = await makeAccount({ handle: "sam", acceptsFollowers: true, suspended: true });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
    const cleo = await makeAccount({ handle: "cleo", acceptsFollowers: true });
    await fx.block(ben, anna);
    await fx.block(anna, cleo);
    const nobody = await expectCode(follow(db(), anna.id, newId(), t0), "NOT_FOUND");
    const suspended = await expectCode(follow(db(), anna.id, sam.id, t0), "NOT_FOUND");
    const blockedBy = await expectCode(follow(db(), anna.id, ben.id, t0), "NOT_FOUND");
    const blocking = await expectCode(follow(db(), anna.id, cleo.id, t0), "NOT_FOUND");
    expect(suspended.message).toBe(nobody.message);
    expect(blockedBy.message).toBe(nobody.message);
    expect(blocking.message).toBe(nobody.message);
    expect(await db().select().from(follows)).toHaveLength(0);
  });

  it("follows, notifies once (new_follower), and gives followers posts only", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
    const open = await fx.post(ben, { audience: "followers", at: t0 });
    const closed = await fx.post(ben, { audience: "friends", at: t0 });
    expect(await canSeePost(db(), anna.id, open.id)).toBeNull();

    await follow(db(), anna.id, ben.id, t0);
    await follow(db(), anna.id, ben.id, plus.minutes(t0, 1)); // again: nothing new
    expect(await db().select().from(follows)).toHaveLength(1);
    const notes = await notificationsFor(ben.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "new_follower", actorId: anna.id });

    expect(await canSeePost(db(), anna.id, open.id)).not.toBeNull();
    expect(await canSeePost(db(), anna.id, closed.id)).toBeNull();

    await unfollow(db(), anna.id, ben.id);
    expect(await canSeePost(db(), anna.id, open.id)).toBeNull();
    expect(await db().select().from(follows)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ mutes */

describe("mute", () => {
  it("is refused toward yourself (INVALID) and toward nobody (NOT_FOUND)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(mute(db(), anna.id, anna.id, t0), "INVALID");
    await expectCode(mute(db(), anna.id, newId(), t0), "NOT_FOUND");
  });

  it("is private: no notification, and nothing else changes", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
    await fx.befriend(anna, ben);
    await fx.follow(anna, ben);
    const p = await fx.post(ben, { audience: "friends", at: t0 });

    await mute(db(), anna.id, ben.id, t0);
    await mute(db(), anna.id, ben.id, t0); // again: harmless
    expect(await db().select().from(notifications)).toHaveLength(0);
    expect(await db().select().from(mutes)).toHaveLength(1);
    expect(await areFriends(db(), anna.id, ben.id)).toBe(true);
    expect(await db().select().from(follows)).toHaveLength(1);
    // Mute hides from the feed only; the post itself is still visible.
    expect(await canSeePost(db(), anna.id, p.id)).not.toBeNull();
    // Ben cannot tell.
    const fromBen = await relationship(db(), ben.id, anna.id, t0);
    expect(fromBen.muted).toBe(false);
    const fromAnna = await relationship(db(), anna.id, ben.id, t0);
    expect(fromAnna.muted).toBe(true);

    expect((await listMuted(db(), anna.id)).map((p) => p.handle)).toEqual(["ben"]);
    await unmute(db(), anna.id, ben.id);
    expect(await listMuted(db(), anna.id)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ lists */

describe("lists", () => {
  it("listFriends shows friends only, leaving out the suspended and the blocked", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    const sam = await makeAccount({ handle: "sam", suspended: true });
    const dan = await makeAccount({ handle: "dan" });
    const eve = await makeAccount({ handle: "eve" });
    await fx.befriend(anna, ben, t0);
    await fx.befriend(cleo, anna, plus.hours(t0, 1));
    await fx.befriend(anna, sam, t0);
    await fx.befriend(anna, dan, t0);
    await fx.block(dan, anna); // fixture: block row only
    await fx.befriend(ben, eve, t0); // not anna's
    const friends = await listFriends(db(), anna.id);
    expect(friends.map((f) => f.handle)).toEqual(["cleo", "ben"]);
    expect(friends[0]).toMatchObject({ id: cleo.id, displayName: "FICTIONAL cleo" });
    expect(friends[0]!.since.toISOString()).toBe(plus.hours(t0, 1).toISOString());
  });

  it("listRequests shows pending incoming and outgoing, not expired, blocked or suspended", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    const dan = await makeAccount({ handle: "dan" });
    const old = await makeAccount({ handle: "old" });
    const now = plus.days(t0, 40);
    await sendFriendRequest(db(), ben.id, anna.id, now);
    await sendFriendRequest(db(), anna.id, cleo.id, now);
    await sendFriendRequest(db(), dan.id, anna.id, now);
    await fx.block(anna, dan);
    await sendFriendRequest(db(), old.id, anna.id, t0); // 40 days old

    const lists = await listRequests(db(), anna.id, now);
    expect(lists.incoming.map((r) => r.person.handle)).toEqual(["ben"]);
    expect(lists.outgoing.map((r) => r.person.handle)).toEqual(["cleo"]);
    expect(lists.incoming[0]!.person.id).toBe(ben.id);

    const [stale] = await db()
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.fromId, old.id), eq(friendRequests.toId, anna.id)));
    expect(stale!.status).toBe("expired");
  });

  it("listFollowing and listFollowers respect accepts_followers, suspension and blocks", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    const ben = await makeAccount({ handle: "ben", acceptsFollowers: true });
    const cleo = await makeAccount({ handle: "cleo", acceptsFollowers: false });
    const sam = await makeAccount({ handle: "sam", acceptsFollowers: true, suspended: true });
    const dan = await makeAccount({ handle: "dan", acceptsFollowers: true });
    await fx.follow(anna, ben);
    await fx.follow(anna, cleo); // stale: cleo no longer accepts followers
    await fx.follow(anna, sam);
    await fx.follow(anna, dan);
    await fx.block(anna, dan);
    await fx.follow(ben, anna);
    await fx.follow(sam, anna);
    expect((await listFollowing(db(), anna.id)).map((p) => p.handle)).toEqual(["ben"]);
    expect((await listFollowers(db(), anna.id)).map((p) => p.handle)).toEqual(["ben"]);
    expect((await listFollowers(db(), ben.id)).map((p) => p.handle)).toEqual(["anna"]);
  });

  it("listFollowers is empty while you do not accept followers", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: false });
    const ben = await makeAccount({ handle: "ben" });
    await fx.follow(ben, anna);
    expect(await listFollowers(db(), anna.id)).toHaveLength(0);
  });
});
