/**
 * Independent verification of M-0010, lens: abuse, limits, moderation and
 * the invite economy. Written by a verifier that did not build apps/web.
 *
 * A test named "DEFECT: …" fails on the merged commit (d027c1f) and
 * demonstrates a defect. A test named "closed: …" passes and records a door
 * that was tried and found shut. Both are kept: closed doors are evidence
 * too. Everyone and everything here is FICTIONAL; addresses are
 * example.test and IP addresses are from the documentation range.
 *
 * Races are made deterministic with `interleaved()`: a second connection
 * pool whose connections pause just before one chosen SQL statement while
 * another operation commits on the ordinary pool. That is the schedule two
 * concurrent requests can produce; the pause only fixes the order.
 */
import { and, count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { beforeEach, describe, expect, inject, it, vi } from "vitest";
import {
  changeHandle,
  getAccountByHandle,
  requestSignIn,
  setAcceptsFollowers,
  verifyEmailLink,
} from "@/core/accounts";
import { createEmailToken, createSession, sessionFromCookie } from "@/core/auth";
import * as conn from "@/core/connections";
import type { Db } from "@/core/db";
import { digestFor, digestUnsubscribe, digestUnsubscribeToken, runWeeklyDigest } from "@/core/digest";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { getFeed } from "@/core/feed";
import { listNotifications } from "@/core/inbox";
import {
  createInvite,
  listInvites,
  lookupInvite,
  requestJoin,
  revokeInvite,
  useInviteAsExisting,
} from "@/core/invites";
import { RATE_LIMITED_MESSAGE } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import { countIncomingRequests, countUnread, notify } from "@/core/notifications";
import {
  createPost,
  createReply,
  getPostForViewer,
  listPostsByAuthor,
  listReplies,
  toggleLike,
} from "@/core/posts";
import {
  createReport,
  dismissReport,
  listOpenReports,
  removeContent,
  suspendAccount,
} from "@/core/reports";
import * as schema from "@/core/schema";
import {
  accounts,
  blocks,
  digestDeliveries,
  friendRequests,
  friendships,
  invites,
  likes,
  notifications,
  outbox,
  posts,
  rateEvents,
  replies,
  reports,
  sessions,
} from "@/core/schema";
import { areFriends, isBlocked, isFollowing, relationship } from "@/core/visibility";
import type { Viewer } from "@/web/viewer";
import {
  at,
  befriend,
  block as blockRow,
  db,
  follow as followRow,
  makeAccount,
  mute as muteRow,
  plus,
  post,
  reset,
} from "./helpers";

/* ------------------------------------------------------------------ mocks */
// Only the action-layer tests at the bottom use these; core code imports no
// framework module, so nothing above them is affected.

const web = vi.hoisted(() => ({
  viewer: null as null | {
    id: string;
    handle: string;
    displayName: string;
    isAdmin: boolean;
    acceptsFollowers: boolean;
    invitesRemaining: number;
  },
  xff: null as string | null,
}));

vi.mock("@/web/viewer", () => ({
  requireViewer: vi.fn(async () => {
    if (!web.viewer) throw new Error("test: no viewer set");
    return web.viewer;
  }),
  getViewer: vi.fn(async () => web.viewer),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(web.xff === null ? {} : { "x-forwarded-for": web.xff }),
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
  unstable_rethrow: (error: unknown) => {
    if (error && typeof error === "object" && "digest" in error) throw error;
  },
}));

beforeEach(async () => {
  await reset();
  web.viewer = null;
  web.xff = null;
});

/* ---------------------------------------------------------------- helpers */

/** The CoreError code a promise is refused with. */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
  return "RESOLVED";
}

function viewerOf(a: schema.Account): Viewer {
  return {
    id: a.id,
    handle: a.handle,
    displayName: a.displayName,
    isAdmin: a.isAdmin,
    acceptsFollowers: a.acceptsFollowers,
    invitesRemaining: a.invitesRemaining,
  };
}

async function remainingOf(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ n: accounts.invitesRemaining })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row!.n;
}

async function friendshipRows(x: string, y: string): Promise<number> {
  const [a, b] = [x, y].sort();
  const [row] = await db()
    .select({ n: count() })
    .from(friendships)
    .where(and(eq(friendships.aId, a!), eq(friendships.bId, b!)));
  return row!.n;
}

async function followRows(x: string, y: string): Promise<number> {
  const result = await db().execute(sql`
    select count(*)::int as n from follows
    where (follower_id = ${x} and followee_id = ${y})
       or (follower_id = ${y} and followee_id = ${x})`);
  return Number((result.rows[0] as { n: number }).n);
}

async function notificationCount(recipientId: string, kind?: schema.NotificationKind) {
  const [row] = await db()
    .select({ n: count() })
    .from(notifications)
    .where(
      kind
        ? and(eq(notifications.recipientId, recipientId), eq(notifications.kind, kind))
        : eq(notifications.recipientId, recipientId),
    );
  return row!.n;
}

async function outboxTo(email: string, kind?: string) {
  const rows = await db().select().from(outbox).where(eq(outbox.toAddress, email));
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

/** Seed `n` rate events for a key, a minute ago. */
async function seedRate(key: string, n: number): Promise<void> {
  const when = new Date(Date.now() - 60_000);
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `seed${i.toString().padStart(6, "0")}${Math.random().toString(36).slice(2, 10)}`,
    key,
    createdAt: when,
  }));
  if (rows.length) await db().insert(rateEvents).values(rows);
}

type Hook = { match: RegExp; run: () => Promise<unknown> };

/**
 * A second pool on the test database. `before(match, run)` pauses the
 * first statement whose SQL matches, runs `run` to completion on the
 * ordinary pool (so it commits), then lets the paused statement go on.
 */
function interleaved() {
  const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 4 });
  const hooks: Hook[] = [];
  const fired: string[] = [];
  pool.on("connect", (client) => {
    const original = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (
      ...args: unknown[]
    ) => {
      const first = args[0] as { text?: unknown } | string | undefined;
      const text =
        typeof first === "string" ? first : typeof first?.text === "string" ? first.text : "";
      const index = hooks.findIndex((h) => h.match.test(text));
      if (index < 0) return original(...args);
      const [hook] = hooks.splice(index, 1);
      fired.push(text);
      const callback =
        typeof args[args.length - 1] === "function"
          ? (args.pop() as (error: unknown, result?: unknown) => void)
          : null;
      const result = hook!.run().then(() => original(...args) as Promise<unknown>);
      if (callback) {
        result.then(
          (r) => callback(null, r),
          (e) => callback(e),
        );
        return undefined;
      }
      return result;
    };
  });
  return {
    db: drizzle(pool, { schema }) as unknown as Db,
    before(match: RegExp, run: () => Promise<unknown>) {
      hooks.push({ match, run });
    },
    fired,
    close: () => pool.end(),
  };
}

/* ======================================================= invite economy */

describe("invite economy", () => {
  it("closed: twelve creations racing for three remaining invites make exactly three, and the count never goes below zero", async () => {
    const inviter = await makeAccount({ invitesRemaining: 3 });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => createInvite(db(), inviter.id, {})),
    );
    const made = results.filter((r) => r.status === "fulfilled");
    const codes = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (isCoreError(r.reason) ? r.reason.code : String(r.reason)));
    expect(made).toHaveLength(3);
    expect(new Set(codes)).toEqual(new Set(["FORBIDDEN"]));
    expect(await remainingOf(inviter.id)).toBe(0);
    const rows = await db().select().from(invites).where(eq(invites.inviterId, inviter.id));
    expect(rows).toHaveLength(3);
  });

  it("closed: expired invites are refunded exactly once while listings and revocations race", async () => {
    const t0 = at("2026-08-01T12:00:00Z");
    const inviter = await makeAccount({ invitesRemaining: 2 });
    const a = await createInvite(db(), inviter.id, { now: t0 });
    const b = await createInvite(db(), inviter.id, { now: t0 });
    expect(await remainingOf(inviter.id)).toBe(0);
    const later = plus.days(t0, 31);
    await Promise.all([
      ...Array.from({ length: 6 }, () => listInvites(db(), inviter.id, later)),
      revokeInvite(db(), inviter.id, a.id, later),
      revokeInvite(db(), inviter.id, b.id, later),
      revokeInvite(db(), inviter.id, a.id, later),
    ]);
    expect(await remainingOf(inviter.id)).toBe(2);
    const listed = await listInvites(db(), inviter.id, plus.days(later, 1));
    expect(listed.remaining).toBe(2);
    expect(listed.invites.map((i) => i.status).sort()).toEqual(["expired", "expired"]);
  });

  it("closed: parallel revocations of one waiting invite refund once", async () => {
    const inviter = await makeAccount({ invitesRemaining: 1 });
    const inv = await createInvite(db(), inviter.id, {});
    await Promise.all(
      Array.from({ length: 6 }, () => revokeInvite(db(), inviter.id, inv.id)),
    );
    expect(await remainingOf(inviter.id)).toBe(1);
  });

  it("closed: a create-and-revoke loop is stopped by the limit of 20 creations a day, and the count ends where it began", async () => {
    const inviter = await makeAccount({ invitesRemaining: 1 });
    const now = at("2026-09-24T10:00:00Z");
    let created = 0;
    let stoppedBy = "";
    for (let i = 0; i < 25; i++) {
      try {
        const inv = await createInvite(db(), inviter.id, { now });
        created += 1;
        await revokeInvite(db(), inviter.id, inv.id, now);
      } catch (error) {
        stoppedBy = isCoreError(error) ? error.code : String(error);
        break;
      }
    }
    expect(created).toBe(20);
    expect(stoppedBy).toBe("RATE_LIMITED");
    expect(await remainingOf(inviter.id)).toBe(1);
  });

  it("closed: neither the inviter nor an existing friend can spend an invite, directly or through the emailed join link", async () => {
    const inviter = await makeAccount();
    const friend = await makeAccount();
    await befriend(inviter, friend);
    const { code } = await createInvite(db(), inviter.id, {});
    const inv = await lookupInvite(db(), code);
    expect(inv).not.toBeNull();

    expect(await useInviteAsExisting(db(), { accountId: inviter.id, inviteId: inv!.inviteId }))
      .toEqual({ status: "own_invite" });
    expect(await useInviteAsExisting(db(), { accountId: friend.id, inviteId: inv!.inviteId }))
      .toEqual({ status: "already_friends" });

    for (const person of [inviter, friend]) {
      await requestJoin(db(), { code, email: person.email, ipHash: `h-${person.id}` });
      const mail = await latestOutbox(db(), person.email, "join");
      const token = tokenFromLink(mail!.body);
      const result = await verifyEmailLink(db(), { token: token! });
      expect(result).toEqual({ kind: "signed_in", accountId: person.id });
    }
    expect(await lookupInvite(db(), code)).not.toBeNull();
    const [row] = await db().select().from(invites).where(eq(invites.id, inv!.inviteId));
    expect(row!.usedAt).toBeNull();
    expect(await remainingOf(inviter.id)).toBe(9);
  });

  it("DEFECT: a person who blocked the inviter still receives the inviter's join emails, the inviter's chosen name in the subject", async () => {
    const inviter = await makeAccount({ displayName: "FICTIONAL Blocked Sender" });
    const blocker = await makeAccount({ email: "fictional.blocker@example.test" });
    await conn.block(db(), blocker.id, inviter.id);
    expect(await isBlocked(db(), blocker.id, inviter.id)).toBe(true);

    // Anyone holding the link can ask for a join email to any address:
    // here, the blocked person holds their own link.
    const { code } = await createInvite(db(), inviter.id, {});
    for (let i = 0; i < 3; i++) {
      await requestJoin(db(), { code, email: blocker.email, ipHash: `fictional-ip-${i}` });
    }
    const mails = await outboxTo(blocker.email, "join");
    // A block hides each from the other (SPEC §6), and requestJoin already
    // stays silent for a suspended address with the same answer; a blocker
    // should be sent nothing either.
    expect(
      mails.map((m) => m.subject),
      "join emails reached someone who blocked the inviter",
    ).toEqual([]);
  });

  it("DEFECT: the inviter's invite list (and export) keeps showing the current handle of an invitee who has since blocked them", async () => {
    const inviter = await makeAccount();
    const invitee = await makeAccount();
    const { code } = await createInvite(db(), inviter.id, {});
    const inv = await lookupInvite(db(), code);
    await useInviteAsExisting(db(), { accountId: invitee.id, inviteId: inv!.inviteId });
    await conn.block(db(), invitee.id, inviter.id);
    // The blocker moves on to a new name the blocked person has never seen.
    await changeHandle(db(), invitee.id, "fictional_newname");
    expect(await getAccountByHandle(db(), inviter.id, "fictional_newname")).toBeNull();

    const listed = await listInvites(db(), inviter.id);
    const exported = await exportAccount(db(), inviter.id);
    // SPEC §6: a block hides each from the other; listInvites already hides
    // the handle of a suspended invitee, and /people/invites links it.
    expect({
      listed: listed.invites.map((i) => i.usedByHandle),
      exported: exported.invites.map((i) => i.used_by_handle),
    }).toEqual({ listed: [null], exported: [null] });
  });

  it("DEFECT: an invite used while a block commits leaves a friendship across the block, and unblocking restores it", async () => {
    const inviter = await makeAccount();
    const user = await makeAccount();
    const { code } = await createInvite(db(), inviter.id, {});
    const inv = await lookupInvite(db(), code);

    const race = interleaved();
    try {
      race.before(/^insert into "friendships"/i, () => conn.block(db(), inviter.id, user.id));
      await useInviteAsExisting(race.db, { accountId: user.id, inviteId: inv!.inviteId });
      expect(race.fired).toHaveLength(1);
    } finally {
      await race.close();
    }
    expect(await isBlocked(db(), inviter.id, user.id)).toBe(true);
    const rowsAcrossBlock = await friendshipRows(inviter.id, user.id);
    await conn.unblock(db(), inviter.id, user.id);
    const friendsAfterUnblock = await areFriends(db(), inviter.id, user.id);
    // SPEC §6: a block deletes the friendship; unblocking restores nothing.
    expect({ rowsAcrossBlock, friendsAfterUnblock }).toEqual({
      rowsAcrossBlock: 0,
      friendsAfterUnblock: false,
    });
  });
});

/* ======================================================= friend requests */

describe("friend requests: spam", () => {
  it("closed: re-requesting after every decline is still capped at 50 requests a day", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    const now = at("2026-09-24T10:00:00Z");
    for (let i = 0; i < 50; i++) {
      expect(await conn.sendFriendRequest(db(), pest.id, target.id, now)).toEqual({
        status: "requested",
      });
      await conn.declineFriendRequest(db(), target.id, pest.id, now);
    }
    expect(await refusal(conn.sendFriendRequest(db(), pest.id, target.id, now))).toBe(
      "RATE_LIMITED",
    );
  });

  it("closed: blocking stops a request pest at once (NOT_FOUND), and the requests leave the badge", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    await conn.sendFriendRequest(db(), pest.id, target.id);
    expect(await countIncomingRequests(db(), target.id)).toBe(1);
    await conn.block(db(), target.id, pest.id);
    expect(await countIncomingRequests(db(), target.id)).toBe(0);
    expect(await refusal(conn.sendFriendRequest(db(), pest.id, target.id))).toBe("NOT_FOUND");
  });

  it("DEFECT: cycling send and cancel re-notifies the recipient every time and leaves every notification behind", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    for (let i = 0; i < 20; i++) {
      await conn.sendFriendRequest(db(), pest.id, target.id);
      await conn.cancelFriendRequest(db(), pest.id, target.id);
    }
    const pending = await conn.listRequests(db(), target.id);
    expect(pending.incoming).toHaveLength(0);
    // toggleLike takes its notification back "so toggling cannot flood
    // anyone"; a cancelled request should likewise leave at most one.
    expect(await notificationCount(target.id, "friend_request")).toBeLessThanOrEqual(1);
  });
});

/* =============================================================== follows */

describe("follows", () => {
  it("closed: following someone who does not accept followers is FORBIDDEN and leaves no row and no notification; blocked or suspended is NOT_FOUND", async () => {
    const fan = await makeAccount();
    const closedDoor = await makeAccount({ acceptsFollowers: false });
    const blocker = await makeAccount({ acceptsFollowers: true });
    const gone = await makeAccount({ acceptsFollowers: true, suspended: true });
    await blockRow(blocker, fan);
    expect(await refusal(conn.follow(db(), fan.id, closedDoor.id))).toBe("FORBIDDEN");
    expect(await refusal(conn.follow(db(), fan.id, blocker.id))).toBe("NOT_FOUND");
    expect(await refusal(conn.follow(db(), fan.id, gone.id))).toBe("NOT_FOUND");
    expect(await refusal(conn.follow(db(), fan.id, fan.id))).toBe("INVALID");
    expect(await followRows(fan.id, closedDoor.id)).toBe(0);
    expect(await notificationCount(closedDoor.id)).toBe(0);
  });

  it("DEFECT: toggling follow floods the followee with new_follower notifications, with no limit at all", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    for (let i = 0; i < 60; i++) {
      await conn.follow(db(), fan.id, star.id);
      await conn.unfollow(db(), fan.id, star.id);
    }
    expect(await isFollowing(db(), fan.id, star.id)).toBe(false);
    // 60 is already more than the 50 friend requests a day SPEC §8 allows.
    expect(await notificationCount(star.id, "new_follower")).toBeLessThanOrEqual(1);
  });

  it("DEFECT: a follow that commits just after a block survives it, and unblocking restores the following", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    const race = interleaved();
    try {
      race.before(/^insert into "follows"/i, () => conn.block(db(), star.id, fan.id));
      await conn.follow(race.db, fan.id, star.id);
      expect(race.fired).toHaveLength(1);
    } finally {
      await race.close();
    }
    const rowsAcrossBlock = await followRows(fan.id, star.id);
    await conn.unblock(db(), star.id, fan.id);
    const followingAfterUnblock = await isFollowing(db(), fan.id, star.id);
    // SPEC §6: a block deletes follows both ways; M-0010: a block refuses
    // new follows; unblocking restores nothing.
    expect({ rowsAcrossBlock, followingAfterUnblock }).toEqual({
      rowsAcrossBlock: 0,
      followingAfterUnblock: false,
    });
  });

  it("DEFECT: a follow that commits just after accepts_followers is turned off survives, and turning it back on restores the follower", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    const race = interleaved();
    try {
      race.before(/^insert into "follows"/i, () => setAcceptsFollowers(db(), star.id, false));
      await conn.follow(race.db, fan.id, star.id);
    } finally {
      await race.close();
    }
    const rowsWhileOff = await followRows(fan.id, star.id);
    await setAcceptsFollowers(db(), star.id, true);
    const followerAgain = await isFollowing(db(), fan.id, star.id);
    // SPEC §6: turning accepts_followers off deletes all follows.
    expect({ rowsWhileOff, followerAgain }).toEqual({ rowsWhileOff: 0, followerAgain: false });
  });
});

/* ===================================================== block completeness */

describe("block completeness (SPEC §6)", () => {
  async function connectedPair() {
    const a = await makeAccount({ acceptsFollowers: true });
    const b = await makeAccount({ acceptsFollowers: true });
    const c = await makeAccount({ acceptsFollowers: true });
    await befriend(a, b);
    await befriend(a, c);
    await conn.follow(db(), a.id, b.id);
    await conn.follow(db(), b.id, a.id);
    await conn.follow(db(), c.id, a.id);
    const pa = await post(a);
    const pb = await post(b);
    await toggleLike(db(), b.id, pa.id);
    await toggleLike(db(), a.id, pb.id);
    await toggleLike(db(), c.id, pa.id);
    await createReply(db(), b.id, pa.id, { body: "FICTIONAL reply by b" });
    await createReply(db(), c.id, pa.id, { body: "FICTIONAL reply by c" });
    // A pending request b→a (the table allows it; the block must cancel it).
    await db().insert(friendRequests).values({
      id: `fr${Date.now()}x`,
      fromId: b.id,
      toId: a.id,
      status: "pending",
      createdAt: new Date(),
    });
    return { a, b, c, pa, pb };
  }

  async function snapshot(a: string, b: string, c: string, pa: string, pb: string) {
    const likeRows = await db().select().from(likes);
    const reqs = await db()
      .select({ status: friendRequests.status })
      .from(friendRequests)
      .where(and(eq(friendRequests.fromId, b), eq(friendRequests.toId, a)));
    const pairNotes = await db().execute(sql`
      select count(*)::int as n from notifications
      where (recipient_id = ${a} and actor_id = ${b}) or (recipient_id = ${b} and actor_id = ${a})`);
    const thirdNotes = await db().execute(sql`
      select count(*)::int as n from notifications where recipient_id = ${a} and actor_id = ${c}`);
    return {
      friendsAB: await friendshipRows(a, b),
      friendsAC: await friendshipRows(a, c),
      followsAB: await followRows(a, b),
      followsCA: await followRows(c, a),
      likeBonA: likeRows.filter((l) => l.accountId === b && l.postId === pa).length,
      likeAonB: likeRows.filter((l) => l.accountId === a && l.postId === pb).length,
      likeConA: likeRows.filter((l) => l.accountId === c && l.postId === pa).length,
      requestBA: reqs.map((r) => r.status),
      notesBetween: Number((pairNotes.rows[0] as { n: number }).n),
      notesFromC: Number((thirdNotes.rows[0] as { n: number }).n),
    };
  }

  it("closed: one call removes every effect both ways, touches nobody else, and unblocking restores none of it", async () => {
    const { a, b, c, pa, pb } = await connectedPair();
    const before = await snapshot(a.id, b.id, c.id, pa.id, pb.id);
    expect(before).toMatchObject({
      friendsAB: 1,
      followsAB: 2,
      likeBonA: 1,
      likeAonB: 1,
      requestBA: ["pending"],
    });
    expect(before.notesBetween).toBeGreaterThanOrEqual(4);

    await conn.block(db(), a.id, b.id);
    const after = await snapshot(a.id, b.id, c.id, pa.id, pb.id);
    expect(after).toEqual({
      friendsAB: 0,
      friendsAC: 1,
      followsAB: 0,
      followsCA: 1,
      likeBonA: 0,
      likeAonB: 0,
      likeConA: 1,
      requestBA: ["cancelled"],
      notesBetween: 0,
      notesFromC: before.notesFromC,
    });
    // Replies stay, hidden between the two.
    const seenByA = await listReplies(db(), a.id, pa.id);
    expect(seenByA.map((r) => r.author.id)).toEqual([c.id]);

    await conn.unblock(db(), a.id, b.id);
    expect(await snapshot(a.id, b.id, c.id, pa.id, pb.id)).toEqual(after);
    const rel = await relationship(db(), a.id, b.id);
    expect(rel).toMatchObject({
      friends: false,
      following: false,
      followedBy: false,
      requestIn: false,
      requestOut: false,
      blocked: false,
      blockedBy: false,
    });
  });

  it("closed: a block is all or nothing: a failure at its last step leaves no block and every connection intact", async () => {
    const { a, b, c, pa, pb } = await connectedPair();
    const before = await snapshot(a.id, b.id, c.id, pa.id, pb.id);
    const race = interleaved();
    try {
      race.before(/^delete from "notifications"/i, async () => {
        throw new Error("FICTIONAL failure injected by the verifier");
      });
      const outcome = await conn.block(race.db, a.id, b.id).then(
        () => "resolved",
        (error: unknown) => String((error as { cause?: unknown }).cause ?? error),
      );
      expect(outcome).toMatch(/FICTIONAL failure/);
    } finally {
      await race.close();
    }
    const [n] = await db().select({ n: count() }).from(blocks);
    expect(n!.n).toBe(0);
    expect(await snapshot(a.id, b.id, c.id, pa.id, pb.id)).toEqual(before);
  });

  it("DEFECT: a like that commits just after a block survives it, and after unblocking the blocker sees it again", async () => {
    const author = await makeAccount();
    const liker = await makeAccount();
    await befriend(author, liker);
    const p = await post(author);
    const race = interleaved();
    try {
      race.before(/^insert into "likes"/i, () => conn.block(db(), author.id, liker.id));
      await toggleLike(race.db, liker.id, p.id);
      expect(race.fired).toHaveLength(1);
    } finally {
      await race.close();
    }
    const rowsAcrossBlock = (
      await db().select().from(likes).where(eq(likes.accountId, liker.id))
    ).length;
    await conn.unblock(db(), author.id, liker.id);
    const view = await getPostForViewer(db(), author.id, p.id);
    // SPEC §6: a block deletes likes by each on the other's posts.
    expect({
      rowsAcrossBlock,
      likersAfterUnblock: view!.likers!.map((l) => l.id),
    }).toEqual({ rowsAcrossBlock: 0, likersAfterUnblock: [] });
  });

  it("DEFECT: a friend request that commits just after a block survives it, and after unblocking it waits in the blocker's requests", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    const race = interleaved();
    try {
      race.before(/^insert into "friend_requests"/i, () => conn.block(db(), target.id, pest.id));
      await conn.sendFriendRequest(race.db, pest.id, target.id);
      expect(race.fired).toHaveLength(1);
    } finally {
      await race.close();
    }
    const pendingAcrossBlock = (
      await db()
        .select()
        .from(friendRequests)
        .where(and(eq(friendRequests.fromId, pest.id), eq(friendRequests.status, "pending")))
    ).length;
    await conn.unblock(db(), target.id, pest.id);
    const inbox = await conn.listRequests(db(), target.id);
    // SPEC §6: a block cancels pending requests both ways and refuses new
    // ones; unblocking restores nothing.
    expect({
      pendingAcrossBlock,
      incomingAfterUnblock: inbox.incoming.map((r) => r.person.id),
    }).toEqual({ pendingAcrossBlock: 0, incomingAfterUnblock: [] });
  });
});

/* ================================================================== mute */

describe("mute", () => {
  it("closed: a mute tells the muted person nothing, anywhere", async () => {
    const muter = await makeAccount({ displayName: "FICTIONAL Muter" });
    const muted = await makeAccount();
    await befriend(muter, muted);
    const now = new Date();
    await post(muter, { at: plus.hours(now, -2) });
    await post(muted, { at: plus.hours(now, -2) });
    await conn.mute(db(), muter.id, muted.id);

    expect(await notificationCount(muted.id)).toBe(0);
    const theirView = await relationship(db(), muted.id, muter.id);
    expect(theirView).toMatchObject({ friends: true, muted: false, blocked: false, blockedBy: false });
    const exported = await exportAccount(db(), muted.id);
    expect(exported.muted).toEqual([]);
    expect((await getFeed(db(), muted.id, { now })).items.map((i) => i.author.id)).toContain(
      muter.id,
    );
    expect((await digestFor(db(), muted.id, now)).map((l) => l.authorId)).toEqual([muter.id]);
    // And the muter's own view does leave them out.
    expect((await getFeed(db(), muter.id, { now })).items.map((i) => i.author.id)).not.toContain(
      muted.id,
    );
    expect(await digestFor(db(), muter.id, now)).toEqual([]);
  });
});

/* =============================================================== reports */

describe("reports", () => {
  it("closed: only what you can see and is not yours can be reported", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    const stranger = await makeAccount();
    const blocker = await makeAccount();
    await befriend(me, friend);
    await befriend(me, blocker);
    const friendPost = await post(friend);
    const strangerPost = await post(stranger);
    const blockerPost = await post(blocker);
    const myPost = await post(me);
    const { id: myReply } = await createReply(db(), me.id, friendPost.id, { body: "FICTIONAL mine" });
    const { id: blockerReply } = await createReply(db(), blocker.id, myPost.id, {
      body: "FICTIONAL reply by someone who then blocks me",
    });
    await blockRow(blocker, me);
    const removed = await post(friend);
    const { id: replyOnRemoved } = await createReply(db(), friend.id, removed.id, {
      body: "FICTIONAL reply on a post removed later",
    });
    await db().update(posts).set({ removedAt: new Date() }).where(eq(posts.id, removed.id));

    const attempt = (kind: schema.ReportTargetKind, targetId: string) =>
      refusal(createReport(db(), me.id, { kind, targetId, category: "spam" }));
    expect(await attempt("post", strangerPost.id)).toBe("NOT_FOUND");
    expect(await attempt("post", blockerPost.id)).toBe("NOT_FOUND");
    expect(await attempt("post", removed.id)).toBe("NOT_FOUND");
    expect(await attempt("reply", blockerReply)).toBe("NOT_FOUND");
    expect(await attempt("reply", replyOnRemoved)).toBe("NOT_FOUND");
    expect(await attempt("account", blocker.id)).toBe("NOT_FOUND");
    expect(await attempt("post", myPost.id)).toBe("FORBIDDEN");
    expect(await attempt("reply", myReply)).toBe("FORBIDDEN");
    expect(await attempt("account", me.id)).toBe("FORBIDDEN");
    // A reply id passed as a post, and a post id passed as a reply.
    expect(await attempt("post", myReply)).toBe("NOT_FOUND");
    expect(await attempt("reply", friendPost.id)).toBe("NOT_FOUND");
    const [n] = await db().select({ n: count() }).from(reports);
    expect(n!.n).toBe(0);
    // Refusals do not use up the daily limit.
    const [r] = await db()
      .select({ n: count() })
      .from(rateEvents)
      .where(eq(rateEvents.key, `report:${me.id}`));
    expect(r!.n).toBe(0);
  });

  it("closed: thirty reports fired at once stop at exactly twenty", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    await befriend(me, friend);
    const p = await post(friend);
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        createReport(db(), me.id, { kind: "post", targetId: p.id, category: "spam" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const limited = results.filter(
      (r) => r.status === "rejected" && isCoreError(r.reason) && r.reason.code === "RATE_LIMITED",
    ).length;
    expect({ ok, limited }).toEqual({ ok: 20, limited: 10 });
  });

  it("closed: only an active administrator decides; the reporter, the author, a member and a former or suspended admin are NOT_FOUND and nothing changes", async () => {
    const admin = await makeAccount({ isAdmin: true });
    const reporter = await makeAccount();
    const author = await makeAccount();
    const member = await makeAccount();
    const formerAdmin = await makeAccount({ isAdmin: true });
    const suspendedAdmin = await makeAccount({ isAdmin: true, suspended: true });
    await befriend(reporter, author);
    const p = await post(author);
    const { id: reportId } = await createReport(db(), reporter.id, {
      kind: "post",
      targetId: p.id,
      category: "harassment",
    });
    await db().update(accounts).set({ isAdmin: false }).where(eq(accounts.id, formerAdmin.id));
    for (const who of [reporter, author, member, formerAdmin, suspendedAdmin]) {
      expect(await refusal(listOpenReports(db(), who.id))).toBe("NOT_FOUND");
      expect(
        await refusal(
          removeContent(db(), who.id, reportId, { category: "spam", reason: "FICTIONAL reason text" }),
        ),
      ).toBe("NOT_FOUND");
      expect(await refusal(dismissReport(db(), who.id, reportId, {}))).toBe("NOT_FOUND");
      expect(
        await refusal(suspendAccount(db(), who.id, reportId, { reason: "FICTIONAL reason text" })),
      ).toBe("NOT_FOUND");
    }
    const [row] = await db().select().from(reports).where(eq(reports.id, reportId));
    expect(row!.status).toBe("open");
    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt).toBeNull();
    const [pp] = await db().select().from(posts).where(eq(posts.id, p.id));
    expect(pp!.removedAt).toBeNull();
    expect((await listOpenReports(db(), admin.id)).map((r) => r.id)).toEqual([reportId]);
  });
});

/* =============================================================== removal */

describe("removal effects", () => {
  it("closed: a removed post is gone for everyone else — feed, profile, post page, replies, likes, reports, notification text, digest — and its author keeps the statement", async () => {
    const admin = await makeAccount({ isAdmin: true });
    const author = await makeAccount({ displayName: "FICTIONAL Removed Author" });
    const friend = await makeAccount();
    await befriend(author, friend);
    const now = new Date();
    const p = await post(author, { body: "FICTIONAL removed text MARKER-R", at: plus.hours(now, -3) });
    await createReply(db(), friend.id, p.id, { body: "FICTIONAL reply" });
    await toggleLike(db(), friend.id, p.id);
    const { id: reportId } = await createReport(db(), friend.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
    });
    await removeContent(db(), admin.id, reportId, {
      category: "spam",
      reason: "FICTIONAL statement of reasons",
    });

    expect((await getFeed(db(), friend.id, { now })).items).toEqual([]);
    expect((await listPostsByAuthor(db(), friend.id, author.id)).items).toEqual([]);
    expect(await getPostForViewer(db(), friend.id, p.id)).toBeNull();
    expect(await listReplies(db(), friend.id, p.id)).toEqual([]);
    expect(await refusal(toggleLike(db(), friend.id, p.id))).toBe("NOT_FOUND");
    expect(await refusal(createReply(db(), friend.id, p.id, { body: "FICTIONAL" }))).toBe(
      "NOT_FOUND",
    );
    expect(
      await refusal(createReport(db(), friend.id, { kind: "post", targetId: p.id, category: "spam" })),
    ).toBe("NOT_FOUND");
    expect(await digestFor(db(), friend.id, now)).toEqual([]);
    const friendNotes = await listNotifications(db(), friend.id);
    expect(JSON.stringify(friendNotes)).not.toContain("MARKER-R");

    const own = await getPostForViewer(db(), author.id, p.id);
    expect(own?.removed).toEqual({ category: "spam", reason: "FICTIONAL statement of reasons" });
    const authorNotes = await listNotifications(db(), author.id);
    const removal = authorNotes.find((n) => n.kind === "content_removed");
    expect(removal?.body).toContain("FICTIONAL statement of reasons");
    expect(removal?.body).toContain("controller@example.test");
  });
});

/* ============================================================ suspension */

describe("suspension effects", () => {
  it("closed: a suspension revokes every session, refuses every way back in, and hides the account everywhere", async () => {
    const admin = await makeAccount({ isAdmin: true });
    const x = await makeAccount({ displayName: "FICTIONAL Suspended Person", acceptsFollowers: true });
    const friend = await makeAccount();
    const other = await makeAccount();
    await befriend(x, friend);
    const now = new Date();
    const s1 = await createSession(db(), x.id, now);
    const s2 = await createSession(db(), x.id, now);
    const pre = await createEmailToken(db(), { email: x.email, purpose: "sign_in", now });
    await post(x, { at: plus.hours(now, -1) });
    const fp = await post(friend, { at: plus.hours(now, -1) });
    await createReply(db(), x.id, fp.id, { body: "FICTIONAL reply by x" });
    await toggleLike(db(), x.id, fp.id);
    await conn.follow(db(), friend.id, x.id);
    await conn.sendFriendRequest(db(), x.id, other.id);
    const { code } = await createInvite(db(), friend.id, {});
    const { id: reportId } = await createReport(db(), friend.id, {
      kind: "account",
      targetId: x.id,
      category: "harassment",
    });
    await suspendAccount(db(), admin.id, reportId, { reason: "FICTIONAL suspension reason" });

    expect(await sessionFromCookie(db(), s1.cookieValue)).toBeNull();
    expect(await sessionFromCookie(db(), s2.cookieValue)).toBeNull();
    const live = await db().select().from(sessions).where(eq(sessions.accountId, x.id));
    expect(live.every((s) => s.revokedAt !== null)).toBe(true);
    expect(await refusal(verifyEmailLink(db(), { token: pre }))).toBe("NOT_FOUND");
    const mailsBefore = (await outboxTo(x.email)).length;
    await requestSignIn(db(), { email: x.email, ipHash: "fictional-ip" });
    await requestJoin(db(), { code, email: x.email, ipHash: "fictional-ip-2" });
    expect((await outboxTo(x.email)).length).toBe(mailsBefore);
    expect(await refusal(createPost(db(), x.id, { body: "FICTIONAL", audience: "friends" }))).toBe(
      "FORBIDDEN",
    );

    expect(await getAccountByHandle(db(), friend.id, x.handle)).toBeNull();
    expect((await listPostsByAuthor(db(), friend.id, x.id)).items).toEqual([]);
    expect((await getFeed(db(), friend.id, { now })).items.map((i) => i.author.id)).toEqual([
      friend.id,
    ]);
    expect(await listReplies(db(), friend.id, fp.id)).toEqual([]);
    const fView = await getPostForViewer(db(), friend.id, fp.id);
    expect({ likers: fView!.likers, likeCount: fView!.likeCount, replyCount: fView!.replyCount })
      .toEqual({ likers: [], likeCount: 0, replyCount: 0 });
    expect((await conn.listFriends(db(), friend.id)).map((f) => f.id)).toEqual([]);
    expect((await conn.listFollowing(db(), friend.id)).map((f) => f.id)).toEqual([]);
    expect((await conn.listRequests(db(), other.id)).incoming).toEqual([]);
    expect(await countIncomingRequests(db(), other.id)).toBe(0);
    const notes = await listNotifications(db(), friend.id);
    expect(notes.filter((n) => n.actor?.id === x.id)).toEqual([]);
    expect(await digestFor(db(), friend.id, now)).toEqual([]);
    await runWeeklyDigest(db(), now);
    expect(await outboxTo(x.email, "digest")).toEqual([]);
  });

  it("DEFECT: the unread badge counts notifications the list hides (from an actor suspended since)", async () => {
    const author = await makeAccount();
    const x = await makeAccount();
    await befriend(author, x);
    const p = await post(author);
    await toggleLike(db(), x.id, p.id);
    await createReply(db(), x.id, p.id, { body: "FICTIONAL reply" });
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, x.id));
    const listed = await listNotifications(db(), author.id);
    const badge = await countUnread(db(), author.id);
    // The navigation shows `badge`; /notifications shows `listed`.
    expect({ badge, listed: listed.length }).toEqual({ badge: 0, listed: 0 });
  });
});

/* ========================================================= notifications */

describe("notifications", () => {
  it("closed: notify never writes to yourself, or across a block in either direction", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const c = await makeAccount();
    await blockRow(a, b);
    expect(await notify(db(), { recipientId: a.id, kind: "like", actorId: a.id })).toBeNull();
    expect(await notify(db(), { recipientId: a.id, kind: "like", actorId: b.id })).toBeNull();
    expect(await notify(db(), { recipientId: b.id, kind: "reply", actorId: a.id })).toBeNull();
    expect(await notify(db(), { recipientId: a.id, kind: "like", actorId: c.id })).not.toBeNull();
    const [n] = await db().select({ n: count() }).from(notifications);
    expect(n!.n).toBe(1);
  });

  it("closed: liking and replying to your own post, and unlike/like toggling, do not flood", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await befriend(a, b);
    const p = await post(a);
    await toggleLike(db(), a.id, p.id);
    await createReply(db(), a.id, p.id, { body: "FICTIONAL self reply" });
    expect(await notificationCount(a.id)).toBe(0);
    for (let i = 0; i < 20; i++) await toggleLike(db(), b.id, p.id);
    expect(await notificationCount(a.id, "like")).toBe(0);
    await toggleLike(db(), b.id, p.id);
    expect(await notificationCount(a.id, "like")).toBe(1);
  });
});

/* ================================================================ digest */

describe("weekly digest", () => {
  const now = at("2026-09-24T09:00:00Z");
  const recent = plus.days(now, -1);

  it("closed: names no post text and leaves out blocked (both ways), muted, invisible, removed and suspended authors", async () => {
    const r = await makeAccount({ displayName: "FICTIONAL Recipient" });
    const visible = await makeAccount({ displayName: "FICTIONAL Visible" });
    const iBlocked = await makeAccount({ displayName: "FICTIONAL IBlocked" });
    const blockedMe = await makeAccount({ displayName: "FICTIONAL BlockedMe" });
    const muted = await makeAccount({ displayName: "FICTIONAL Muted" });
    const stranger = await makeAccount({ displayName: "FICTIONAL Stranger" });
    const followee = await makeAccount({ displayName: "FICTIONAL Followee", acceptsFollowers: true });
    const removedAuthor = await makeAccount({ displayName: "FICTIONAL RemovedAuthor" });
    const suspended = await makeAccount({ displayName: "FICTIONAL Suspended", suspended: true });
    for (const f of [visible, iBlocked, blockedMe, muted, removedAuthor, suspended]) {
      await befriend(r, f);
    }
    await blockRow(r, iBlocked);
    await blockRow(blockedMe, r);
    await muteRow(r, muted);
    await followRow(r, followee);
    for (const author of [visible, iBlocked, blockedMe, muted, stranger, removedAuthor, suspended]) {
      await post(author, { body: `FICTIONAL SECRET-TEXT-${author.handle}`, at: recent });
    }
    await post(followee, { body: "FICTIONAL SECRET-TEXT-friends-only", audience: "friends", at: recent });
    const gone = await post(removedAuthor, { body: "FICTIONAL SECRET-TEXT-removed", at: recent });
    await db().update(posts).set({ removedAt: recent }).where(eq(posts.id, gone.id));
    await db().delete(posts).where(and(eq(posts.authorId, removedAuthor.id), sql`${posts.id} <> ${gone.id}`));

    await runWeeklyDigest(db(), now);
    const mail = await outboxTo(r.email, "digest");
    expect(mail).toHaveLength(1);
    expect(mail[0]!.body).toContain("FICTIONAL Visible posted once.");
    for (const name of ["IBlocked", "BlockedMe", "Muted", "Stranger", "Followee", "RemovedAuthor", "Suspended"]) {
      expect(mail[0]!.body).not.toContain(`FICTIONAL ${name}`);
    }
    const all = await db().select().from(outbox);
    for (const m of all) {
      expect(m.body).not.toContain("SECRET-TEXT");
      expect(m.subject).not.toContain("SECRET-TEXT");
    }
  });

  it("closed: three runs at once send one email per person, and a later run in the week sends nothing", async () => {
    const r = await makeAccount();
    const f = await makeAccount();
    await befriend(r, f);
    await post(f, { at: recent });
    await post(r, { at: recent });
    await Promise.all([runWeeklyDigest(db(), now), runWeeklyDigest(db(), now), runWeeklyDigest(db(), now)]);
    await runWeeklyDigest(db(), plus.days(now, 2));
    expect(await outboxTo(r.email, "digest")).toHaveLength(1);
    expect(await outboxTo(f.email, "digest")).toHaveLength(1);
    const rows = await db().select().from(digestDeliveries);
    expect(rows).toHaveLength(2);
  });

  it("closed: skipped when there is nothing to say (nothing is sent)", async () => {
    const lonely = await makeAccount();
    const run = await runWeeklyDigest(db(), now);
    expect(run).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
    expect(await outboxTo(lonely.email)).toEqual([]);
  });

  it("closed: an unsubscribe token cannot be re-pointed at another account or altered", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const [idA, sigA] = digestUnsubscribeToken(a.id).split(".") as [string, string];
    const [idB, sigB] = digestUnsubscribeToken(b.id).split(".") as [string, string];
    const forged = [
      `${idB}.${sigA}`,
      `${idA}.${sigB}`,
      `${idA}.${sigA.toUpperCase()}`,
      `${idA}.${sigA}.${sigB}`,
      `${idA.toLowerCase()}.${sigA}`,
      `${idA}.${sigA.slice(0, -1)}`,
      `.${sigA}`,
      `${idA}.`,
      `${idA}..${sigA}`,
      `${idB}.${sigB}`.replace(idB, idA),
    ];
    for (const token of forged) {
      expect(await refusal(digestUnsubscribe(db(), token)), token).toBe("NOT_FOUND");
    }
    const rows = await db().select({ w: accounts.weeklyEmail }).from(accounts);
    expect(rows.every((row) => row.w)).toBe(true);
  });

  // Leading or trailing spaces are not tried: the Fetch Headers API strips
  // them from every header value, as HTTP does, before the route sees it.
  it("closed: the cron route refuses a same-length wrong secret and extra inner whitespace", async () => {
    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const secret = process.env.CRON_SECRET!;
    const wrong = secret.slice(0, -1) + (secret.endsWith("A") ? "B" : "A");
    for (const authorization of [`Bearer ${wrong}`, `Bearer  ${secret}`, `Bearer\t${secret}`, `Bearer ${secret}${secret}`]) {
      const response = await POST(
        new Request("http://localhost:3000/api/cron/weekly-digest", {
          method: "POST",
          headers: { authorization },
        }),
      );
      expect(response.status, JSON.stringify(authorization)).toBe(401);
    }
    const [n] = await db().select({ n: count() }).from(digestDeliveries);
    expect(n!.n).toBe(0);
  });
});

/* ===================================================== the action layer */

describe("rate limits at the server-action layer", () => {
  it("closed: createPostAction refuses the 51st post of the day", async () => {
    const me = await makeAccount();
    web.viewer = viewerOf(me);
    const { createPostAction } = await import("@/app/(app)/home/actions");
    const form = () => {
      const f = new FormData();
      f.set("body", "FICTIONAL post");
      f.set("audience", "friends");
      return f;
    };
    for (let i = 0; i < 50; i++) {
      expect((await createPostAction(form())).ok).toBe(true);
    }
    expect(await createPostAction(form())).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
    const [n] = await db().select({ n: count() }).from(posts).where(eq(posts.authorId, me.id));
    expect(n!.n).toBe(50);
  });

  it("closed: createReplyAction refuses past 200 replies a day", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    await befriend(me, friend);
    const p = await post(friend);
    await seedRate(`reply:${me.id}`, 199);
    web.viewer = viewerOf(me);
    const { createReplyAction } = await import("@/app/(app)/p/[id]/actions");
    const form = new FormData();
    form.set("body", "FICTIONAL reply");
    expect((await createReplyAction(p.id, form)).ok).toBe(true);
    expect(await createReplyAction(p.id, form)).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
    const [n] = await db().select({ n: count() }).from(replies);
    expect(n!.n).toBe(1);
  });

  it("closed: sendFriendRequestAction refuses the 51st request of the day", async () => {
    const me = await makeAccount();
    const targets = [];
    for (let i = 0; i < 51; i++) targets.push(await makeAccount());
    web.viewer = viewerOf(me);
    const { sendFriendRequestAction } = await import("@/app/(app)/people/actions");
    for (let i = 0; i < 50; i++) {
      expect(await sendFriendRequestAction(targets[i]!.id)).toEqual({ ok: true, status: "requested" });
    }
    expect(await sendFriendRequestAction(targets[50]!.id)).toEqual({
      ok: false,
      error: RATE_LIMITED_MESSAGE,
    });
  });

  it("closed: submitReport refuses the 21st report of the day", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    await befriend(me, friend);
    const p = await post(friend);
    web.viewer = viewerOf(me);
    const { submitReport } = await import("@/app/(app)/report/actions");
    const form = new FormData();
    form.set("kind", "post");
    form.set("id", p.id);
    form.set("category", "spam");
    for (let i = 0; i < 20; i++) expect((await submitReport(null, form)).ok).toBe(true);
    expect(await submitReport(null, form)).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
  });

  it("closed: createInviteAction refuses the 21st invite of the day even with invites left", async () => {
    const me = await makeAccount({ invitesRemaining: 30 });
    web.viewer = viewerOf(me);
    const { createInviteAction } = await import("@/app/(app)/people/actions");
    for (let i = 0; i < 20; i++) {
      expect((await createInviteAction(null, new FormData()))?.ok).toBe(true);
    }
    expect(await createInviteAction(null, new FormData())).toEqual({
      ok: false,
      error: RATE_LIMITED_MESSAGE,
    });
    expect(await remainingOf(me.id)).toBe(10);
  });

  it("closed: moderation actions from a member are refused and change nothing", async () => {
    const reporter = await makeAccount();
    const author = await makeAccount();
    await befriend(reporter, author);
    const p = await post(author);
    const { id: reportId } = await createReport(db(), reporter.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
    });
    web.viewer = viewerOf(reporter);
    const { removeReported, suspendReported, dismissReported } = await import(
      "@/app/(app)/admin/actions"
    );
    const form = new FormData();
    form.set("reportId", reportId);
    form.set("category", "spam");
    form.set("reason", "FICTIONAL reason text");
    for (const act of [removeReported, suspendReported, dismissReported]) {
      const result = await act(null, form);
      expect(result.ok).toBe(false);
    }
    const [row] = await db().select().from(reports).where(eq(reports.id, reportId));
    expect(row!.status).toBe("open");
    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt).toBeNull();
  });

  it("closed (control): with one X-Forwarded-For value, the 11th join request in an hour is refused", async () => {
    const inviter = await makeAccount();
    const { code } = await createInvite(db(), inviter.id, {});
    const { requestJoinAction } = await import("@/app/(public)/i/[code]/actions");
    web.xff = "203.0.113.7";
    const results = [];
    for (let i = 0; i < 11; i++) {
      const form = new FormData();
      form.set("code", code);
      form.set("email", `fictional.joiner${i}@example.test`);
      results.push(await requestJoinAction(null, form));
    }
    expect(results.slice(0, 10).every((r) => r?.ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
  });

  it("DEFECT (spec-level, deployment-dependent): the per-IP join limit is keyed on the client-supplied first X-Forwarded-For value, so rotating it sends unlimited join emails", async () => {
    const inviter = await makeAccount({ displayName: "FICTIONAL Inviter" });
    const { code } = await createInvite(db(), inviter.id, {});
    const { requestJoinAction } = await import("@/app/(public)/i/[code]/actions");
    for (let i = 0; i < 15; i++) {
      // A proxy that appends the real address keeps the client's value first.
      web.xff = `203.0.113.${i + 1}, 198.51.100.1`;
      const form = new FormData();
      form.set("code", code);
      form.set("email", `fictional.spam${i}@example.test`);
      await requestJoinAction(null, form);
    }
    const sent = (await db().select().from(outbox)).filter((m) => m.kind === "join").length;
    // SPEC §8: 10 per hour per IP hash, all from one client here.
    expect(sent).toBeLessThanOrEqual(10);
  });
});
