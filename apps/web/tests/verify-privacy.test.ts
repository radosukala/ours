/**
 * INDEPENDENT VERIFICATION — lens: privacy and authorization (M-0010).
 *
 * Written by a verifier that did not build apps/web. Every test here tries
 * to see, reach or take something SPEC §6 denies.
 *
 *   "DEFECT: …"  a test that FAILS on the merged commit: the door is open.
 *   "closed: …"  a test that PASSES: a door that was tried and found shut.
 *
 * Both are kept: a closed door is evidence too. Everyone here is FICTIONAL,
 * with example.test addresses. The factories in ./helpers set up state;
 * the behaviour under test is always a core function.
 *
 * The race tests make an interleaving deterministic instead of hoping for
 * it: a second connection takes a table lock, the racing core call starts
 * and waits on that lock, the block starts while the racer is paused, and
 * then the racer finishes. Any serial order of the two operations leaves the
 * pair without the connection; the tests check that the interleaved one
 * does too.
 *
 * Harness change by the fixer (SPEC §17 item 10), assertions unchanged: the
 * verifier ran the block inside the table-lock holder's transaction, so it
 * committed while the racer was mid-transaction. The fix makes exactly that
 * impossible: the racer holds the pair lock (or the followee's row lock)
 * from the start of its transaction, so the block must wait for it, and a
 * block inside the lock holder would deadlock with the racer. The block now
 * runs on its own connection; the harness waits until it is waiting on a
 * lock (or has finished, as it would without the fix), then releases the
 * table and lets both finish.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { beforeEach, describe, expect, inject, it } from "vitest";
import {
  changeHandle,
  deleteAccount,
  getAccountByHandle,
  requestSignIn,
  setAcceptsFollowers,
} from "@/core/accounts";
import {
  block,
  follow,
  listMuted,
  listRequests,
  mute,
  sendFriendRequest,
  unblock,
  unfollow,
  unfriend,
} from "@/core/connections";
import type { Db } from "@/core/db";
import { digestFor } from "@/core/digest";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { getFeed } from "@/core/feed";
import { newId } from "@/core/ids";
import { listNotifications } from "@/core/inbox";
import {
  applyInviteAsExisting,
  createInvite,
  inviteForViewer,
  listInvites,
  requestJoin,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { countUnread } from "@/core/notifications";
import {
  createReply,
  deletePost,
  deleteReply,
  encodeCursor,
  getPostForViewer,
  listPostsByAuthor,
  listReplies,
  postPage,
  toggleLike,
} from "@/core/posts";
import {
  createReport,
  dismissReport,
  listOpenReports,
  removeContent,
  reportTargetPreview,
} from "@/core/reports";
import * as schema from "@/core/schema";
import {
  accounts,
  follows,
  friendRequests,
  friendships,
  invites,
  likes,
  outbox,
} from "@/core/schema";
import { canSeePost, canSeeReply } from "@/core/visibility";
import * as fx from "./helpers";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);

/* ---------------------------------------------------------------- helpers */

type Outcome = { ok: true } | { ok: false; code: string; message: string };

/** What a caller learns from a core call: success, or the code and the sentence. */
async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    if (!isCoreError(error)) throw error;
    return { ok: false, code: error.code, message: error.message };
  }
}

async function suspend(accountId: string): Promise<void> {
  await db()
    .update(accounts)
    .set({ suspendedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

function pair(x: string, y: string) {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

async function friendshipRows(x: string, y: string): Promise<number> {
  const { a, b } = pair(x, y);
  const rows = await db()
    .select()
    .from(friendships)
    .where(and(eq(friendships.aId, a), eq(friendships.bId, b)));
  return rows.length;
}

/** Wait until some statement in this database is waiting for a lock on `table`. */
async function waitForLockWaiter(table: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    const result = await db().execute(sql`
      select count(*)::int as n
      from pg_locks l
      join pg_database d on d.oid = l.database
      where not l.granted
        and d.datname = current_database()
        and l.relation = to_regclass(${table})
    `);
    if (Number((result.rows[0] as { n: number }).n) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`the racing call never waited on a lock on ${table}`);
}

/**
 * Wait until the backend `pid` is waiting on a lock, or `work` has settled
 * (without the fix, the competing operation may not wait at all).
 */
async function waitForBackendWaiting(pid: number, work: Promise<unknown>): Promise<void> {
  let settled = false;
  work.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 500; i++) {
    if (settled) return;
    const result = await db().execute(sql`
      select count(*)::int as n from pg_stat_activity
      where pid = ${pid} and wait_event_type = 'Lock'
    `);
    if (Number((result.rows[0] as { n: number }).n) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the competing operation neither finished nor waited on a lock");
}

/**
 * Deterministic race: a second connection locks `table`; `racer` starts and
 * blocks on its first write to `table`; `during` starts on its own
 * connection while the racer is paused, and runs until it waits on a lock
 * (or finishes); then the table is released and both finish. Returns how
 * the racer ended.
 */
async function race(
  table: "follows" | "friendships" | "likes" | "friend_requests",
  racer: () => Promise<unknown>,
  during: (db: Db) => Promise<void>,
): Promise<Outcome> {
  const holder = new pg.Client({ connectionString: inject("databaseUrl") });
  const competitor = new pg.Client({ connectionString: inject("databaseUrl") });
  await holder.connect();
  await competitor.connect();
  const competitorPid = Number(
    (await competitor.query("select pg_backend_pid() as pid")).rows[0].pid,
  );
  let settled: Promise<Outcome> | null = null;
  let finished: Promise<void> | null = null;
  try {
    await drizzle(holder, { schema }).transaction(async (tx) => {
      await tx.execute(sql.raw(`lock table ${table} in share row exclusive mode`));
      settled = outcome(racer);
      await waitForLockWaiter(table);
      finished = during(drizzle(competitor, { schema }) as unknown as Db);
      await waitForBackendWaiting(competitorPid, finished);
    });
    await finished;
  } finally {
    await holder.end();
    await competitor.end();
  }
  return settled!;
}

/* ===================================================== DEFECTS: races */

describe("a block racing a connection write (SPEC §6: a block takes effect at once, in one transaction)", () => {
  it("fixed: an invite used while a block commits leaves the friendship standing, and unblocking restores friends-only access without a new acceptance", async () => {
    const inviter = await makeAccount({ handle: "race_inviter" });
    const guest = await makeAccount({ handle: "race_guest" });
    const secret = await fx.post(inviter, {
      audience: "friends",
      body: "FICTIONAL friends-only text",
    });
    const { id: inviteId } = await createInvite(db(), inviter.id, {});

    const racer = await race(
      "friendships",
      () => applyInviteAsExisting(db(), { accountId: guest.id, inviteId }),
      async (other) => {
        await block(other, inviter.id, guest.id);
      },
    );
    expect(racer).toEqual({ ok: true }); // the invite use started before the block

    const rowsAfterBlock = await friendshipRows(inviter.id, guest.id);
    await unblock(db(), inviter.id, guest.id);
    const seesAfterUnblock = (await canSeePost(db(), guest.id, secret.id)) !== null;

    // Serially: invite-then-block deletes the friendship; block-then-invite
    // refuses the invite. Neither leaves a friendship behind.
    expect({ rowsAfterBlock, seesAfterUnblock }).toEqual({
      rowsAfterBlock: 0,
      seesAfterUnblock: false,
    });
  });

  it("fixed: a follow made while a block commits survives the block, and unblocking restores the follower's reach", async () => {
    const author = await makeAccount({ handle: "race_author", acceptsFollowers: true });
    const fan = await makeAccount({ handle: "race_fan" });
    const forFollowers = await fx.post(author, { audience: "followers" });

    const racer = await race(
      "follows",
      () => follow(db(), fan.id, author.id),
      async (other) => {
        await block(other, author.id, fan.id);
      },
    );
    expect(racer).toEqual({ ok: true });

    const followRows = (
      await db()
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, fan.id), eq(follows.followeeId, author.id)))
    ).length;
    await unblock(db(), author.id, fan.id);
    const seesAfterUnblock = (await canSeePost(db(), fan.id, forFollowers.id)) !== null;

    expect({ followRows, seesAfterUnblock }).toEqual({
      followRows: 0,
      seesAfterUnblock: false,
    });
  });

  it("fixed: a follow made while accepts_followers is switched off survives, and reaches followers posts again when it is switched back on", async () => {
    const author = await makeAccount({ handle: "race_author2", acceptsFollowers: true });
    const fan = await makeAccount({ handle: "race_fan2" });
    const forFollowers = await fx.post(author, { audience: "followers" });

    const racer = await race(
      "follows",
      () => follow(db(), fan.id, author.id),
      async (other) => {
        await setAcceptsFollowers(other, author.id, false);
      },
    );
    expect(racer).toEqual({ ok: true });

    const followRows = (
      await db()
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, fan.id), eq(follows.followeeId, author.id)))
    ).length;
    await setAcceptsFollowers(db(), author.id, true);
    const seesAfterReenable = (await canSeePost(db(), fan.id, forFollowers.id)) !== null;

    // SPEC §6: turning accepts_followers off deletes all follows of that account.
    expect({ followRows, seesAfterReenable }).toEqual({
      followRows: 0,
      seesAfterReenable: false,
    });
  });

  it("fixed: a like made while a block commits survives the block, and the author sees the blocked person among the likers after unblocking", async () => {
    const author = await makeAccount({ handle: "race_liked" });
    const liker = await makeAccount({ handle: "race_liker" });
    await fx.befriend(author, liker);
    const p = await fx.post(author, { audience: "friends" });

    const racer = await race(
      "likes",
      () => toggleLike(db(), liker.id, p.id),
      async (other) => {
        await block(other, author.id, liker.id);
      },
    );
    expect(racer).toEqual({ ok: true });

    const likeRows = (
      await db()
        .select()
        .from(likes)
        .where(and(eq(likes.postId, p.id), eq(likes.accountId, liker.id)))
    ).length;
    await unblock(db(), author.id, liker.id);
    const view = await getPostForViewer(db(), author.id, p.id);
    const likerShown = (view?.likers ?? []).some((l) => l.id === liker.id);

    // SPEC §6: a block deletes likes by each on the other's posts.
    expect({ likeRows, likerShown }).toEqual({ likeRows: 0, likerShown: false });
  });

  it("fixed: a friend request sent while a block commits survives as pending, and reappears to the blocker after unblocking", async () => {
    const a = await makeAccount({ handle: "race_req_a" });
    const b = await makeAccount({ handle: "race_req_b" });

    const racer = await race(
      "friend_requests",
      () => sendFriendRequest(db(), a.id, b.id),
      async (other) => {
        await block(other, b.id, a.id);
      },
    );
    expect(racer.ok).toBe(true);

    const pendingRows = (
      await db()
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.fromId, a.id),
            eq(friendRequests.toId, b.id),
            eq(friendRequests.status, "pending"),
          ),
        )
    ).length;
    await unblock(db(), b.id, a.id);
    const { incoming } = await listRequests(db(), b.id);

    // SPEC §6: a block cancels pending friend requests both ways.
    expect({ pendingRows, incomingAfterUnblock: incoming.length }).toEqual({
      pendingRows: 0,
      incomingAfterUnblock: 0,
    });
  });
});

/* =========================================== DEFECTS: direct, no race */

describe("exported core functions that skip the one predicate", () => {
  it("fixed: postPage (exported from core/posts) hands a stranger a friends-only post when its caller forgets the predicate", async () => {
    const author = await makeAccount({ handle: "pp_author" });
    const stranger = await makeAccount({ handle: "pp_stranger" });
    const secret = await fx.post(author, {
      audience: "friends",
      body: "FICTIONAL friends-only text",
    });

    // M-0010 acceptance: "cannot see a friends-only post ... through any
    // page or core function". postPage is an exported core function whose
    // only guard is a comment asking the caller to include the predicate.
    const page = await postPage(db(), stranger.id, eq(schema.posts.id, secret.id));
    expect(page.items.map((p) => p.body)).toEqual([]);
  });
});

describe("a person who blocked you, or was suspended, must be indistinguishable from nothing (SPEC §2 rule 3, §6)", () => {
  it("fixed: /people/invites (listInvites) names an invitee who has since blocked you — even their new handle — while a deleted invitee shows nothing", async () => {
    const inviter = await makeAccount({ handle: "inv_owner" });
    const guest = await makeAccount({ handle: "inv_guest" });
    const gone = await makeAccount({ handle: "inv_gone" });
    const one = await createInvite(db(), inviter.id, { note: "FICTIONAL a" });
    const two = await createInvite(db(), inviter.id, { note: "FICTIONAL b" });
    await applyInviteAsExisting(db(), { accountId: guest.id, inviteId: one.id });
    await applyInviteAsExisting(db(), { accountId: gone.id, inviteId: two.id });

    await block(db(), guest.id, inviter.id);
    await changeHandle(db(), guest.id, "inv_hidden_now");
    await deleteAccount(db(), gone.id, "inv_gone");

    // To the inviter, the blocked-by person is "not found"...
    expect(await getAccountByHandle(db(), inviter.id, "inv_hidden_now")).toBeNull();

    const { invites: list } = await listInvites(db(), inviter.id);
    const byId = new Map(list.map((i) => [i.id, i.usedByHandle]));
    // ...so the list must not name them either: it should read like the
    // deleted invitee's row (the code already hides a suspended invitee).
    expect({ blockedBy: byId.get(one.id), deleted: byId.get(two.id) }).toEqual({
      blockedBy: null,
      deleted: null,
    });
  });

  it("fixed: the export names a suspended invitee (used_by_handle) that /people/invites hides", async () => {
    const inviter = await makeAccount({ handle: "exp_owner" });
    const guest = await makeAccount({ handle: "exp_guest" });
    const inv = await createInvite(db(), inviter.id, {});
    await applyInviteAsExisting(db(), { accountId: guest.id, inviteId: inv.id });
    await suspend(guest.id);

    const listed = (await listInvites(db(), inviter.id)).invites[0]!.usedByHandle;
    const exported = (await exportAccount(db(), inviter.id)).invites[0]!.used_by_handle;
    expect(listed).toBeNull(); // the page hides a suspended account (SPEC §6)
    expect(exported).toBeNull(); // the export should not be a way around it
  });

  it("fixed: /settings/blocked (listMuted) keeps showing someone who blocked you, with their new name, while a deleted account drops out", async () => {
    const me = await makeAccount({ handle: "mute_me" });
    const blocker = await makeAccount({ handle: "mute_blocker" });
    const leaver = await makeAccount({ handle: "mute_leaver" });
    await mute(db(), me.id, blocker.id);
    await mute(db(), me.id, leaver.id);

    await block(db(), blocker.id, me.id);
    await changeHandle(db(), blocker.id, "mute_renamed");
    await deleteAccount(db(), leaver.id, "mute_leaver");

    const handles = (await listMuted(db(), me.id)).map((p) => p.handle);
    // Both are "not found" to me now; the list tells them apart.
    expect(handles).toEqual([]);
  });

  it("fixed: mute() and block() by id answer differently for a person who blocked you (ok) and a deleted account (NOT_FOUND)", async () => {
    const me = await makeAccount({ handle: "oracle_me" });
    const blocker = await makeAccount({ handle: "oracle_blocker" });
    const leaver = await makeAccount({ handle: "oracle_leaver" });
    await block(db(), blocker.id, me.id);
    await deleteAccount(db(), leaver.id, "oracle_leaver");

    const muteBlocker = await outcome(() => mute(db(), me.id, blocker.id));
    const muteLeaver = await outcome(() => mute(db(), me.id, leaver.id));
    const blockBlocker = await outcome(() => block(db(), me.id, blocker.id));
    const blockLeaver = await outcome(() => block(db(), me.id, leaver.id));

    // block()'s own comment: refusing "would tell you that they had" blocked
    // you. Refusing the deleted account tells you the same thing by contrast.
    expect({ mute: muteBlocker, block: blockBlocker }).toEqual({
      mute: muteLeaver,
      block: blockLeaver,
    });
  });

  it("fixed: the unread badge (countUnread) counts notifications that /notifications (listNotifications) hides, so it signals activity by a suspended account", async () => {
    const me = await makeAccount({ handle: "badge_me" });
    const friend = await makeAccount({ handle: "badge_friend" });
    await fx.befriend(me, friend);
    const p = await fx.post(me, { audience: "friends" });
    await toggleLike(db(), friend.id, p.id);
    await suspend(friend.id);

    const listedUnread = (await listNotifications(db(), me.id)).filter(
      (n) => n.readAt === null,
    ).length;
    const badge = await countUnread(db(), me.id);
    expect(badge).toBe(listedUnread);
  });

  it("accepted (spec tension): changing your username tells you a handle is held by someone who blocked you, or by a suspended account, though their profile is not found — usernames are unique; tries are limited to 5 a day (SPEC §17 item 9)", async () => {
    // Fixer: SPEC §17 item 9 accepts this (it cannot be closed while
    // usernames are unique, and /rules says so) and limits username changes
    // to 5 a day (`handle:<accountId>`). The final assertion is rewritten to
    // the decision: the answer is still CONFLICT, and a prober runs out of
    // tries after five, whatever the names.
    const me = await makeAccount({ handle: "handle_me" });
    const blocker = await makeAccount({ handle: "handle_blocker" });
    const banned = await makeAccount({ handle: "handle_banned" });
    await block(db(), blocker.id, me.id);
    await suspend(banned.id);

    const results: Record<string, { profile: boolean; change: Outcome }> = {};
    for (const handle of ["handle_blocker", "handle_banned"]) {
      results[handle] = {
        profile: (await getAccountByHandle(db(), me.id, handle)) !== null,
        change: await outcome(() => changeHandle(db(), me.id, handle)),
      };
    }
    for (const r of Object.values(results)) {
      expect(r.profile).toBe(false);
      expect(r.change).toMatchObject({ ok: false, code: "CONFLICT" });
    }
    // Three more probes use up the day (the two above counted too)…
    for (const handle of ["handle_probe1", "handle_probe2", "handle_blocker"]) {
      await outcome(() => changeHandle(db(), me.id, handle));
    }
    // …and the sixth is refused before the name is looked at.
    for (const handle of ["handle_banned", "handle_nobody"]) {
      expect(await outcome(() => changeHandle(db(), me.id, handle))).toMatchObject({
        ok: false,
        code: "RATE_LIMITED",
      });
    }
  });
});

/* ========================================================= closed doors */

const MISSING = "01ZZZZZZZZZZZZZZZZZZZZZZZZ";

describe("closed doors: friends-only posts, replies and likes", () => {
  it("closed: a friends-only post, its replies and its likes reach no stranger through any post, feed, report or digest function, and every refusal equals a missing id's", async () => {
    const t = at("2026-09-20T12:00:00Z");
    const author = await makeAccount({ handle: "fo_author", acceptsFollowers: true });
    const friend = await makeAccount({ handle: "fo_friend" });
    const stranger = await makeAccount({ handle: "fo_stranger" });
    const follower = await makeAccount({ handle: "fo_follower" });
    await fx.befriend(author, friend);
    await fx.follow(follower, author);
    const secret = await fx.post(author, { audience: "friends", at: t, body: "FICTIONAL secret" });
    const { id: replyId } = await createReply(db(), friend.id, secret.id, { body: "FICTIONAL reply", now: t });
    await toggleLike(db(), friend.id, secret.id, t);

    for (const viewer of [stranger, follower]) {
      expect(await getPostForViewer(db(), viewer.id, secret.id)).toBeNull();
      expect(await listReplies(db(), viewer.id, secret.id)).toEqual([]);
      expect(await canSeeReply(db(), viewer.id, replyId)).toBeNull();
      expect((await listPostsByAuthor(db(), viewer.id, author.id)).items).toEqual([]);
      expect((await getFeed(db(), viewer.id, { now: plus.hours(t, 1) })).items).toEqual([]);
      expect(await digestFor(db(), viewer.id, plus.hours(t, 1))).toEqual([]);

      const hidden = [
        await outcome(() => toggleLike(db(), viewer.id, secret.id)),
        await outcome(() => createReply(db(), viewer.id, secret.id, { body: "x" })),
        await outcome(() => deletePost(db(), viewer.id, secret.id)),
        await outcome(() => deleteReply(db(), viewer.id, replyId)),
        await outcome(() => reportTargetPreview(db(), viewer.id, { kind: "post", targetId: secret.id })),
        await outcome(() => reportTargetPreview(db(), viewer.id, { kind: "reply", targetId: replyId })),
      ];
      const missing = [
        await outcome(() => toggleLike(db(), viewer.id, MISSING)),
        await outcome(() => createReply(db(), viewer.id, MISSING, { body: "x" })),
        await outcome(() => deletePost(db(), viewer.id, MISSING)),
        await outcome(() => deleteReply(db(), viewer.id, MISSING)),
        await outcome(() => reportTargetPreview(db(), viewer.id, { kind: "post", targetId: MISSING })),
        await outcome(() => reportTargetPreview(db(), viewer.id, { kind: "reply", targetId: MISSING })),
      ];
      expect(hidden).toEqual(missing);
    }
  });

  it("closed: only the author gets a like count or likers, in every list and on the post", async () => {
    const t = at("2026-09-20T12:00:00Z");
    const author = await makeAccount({ handle: "lk_author" });
    const f1 = await makeAccount({ handle: "lk_f1" });
    const f2 = await makeAccount({ handle: "lk_f2" });
    await fx.befriend(author, f1);
    await fx.befriend(author, f2);
    const p = await fx.post(author, { audience: "friends", at: t });
    await toggleLike(db(), f1.id, p.id, t);
    await toggleLike(db(), f2.id, p.id, t);

    const views = [
      await getPostForViewer(db(), f1.id, p.id),
      ...(await getFeed(db(), f1.id, { now: plus.hours(t, 1) })).items,
      ...(await listPostsByAuthor(db(), f1.id, author.id)).items,
    ];
    for (const v of views) {
      expect(v).not.toBeNull();
      expect(v!.likeCount).toBeUndefined();
      expect(v!.likers).toBeUndefined();
      expect(JSON.stringify(v)).not.toContain(f2.id);
    }
    const own = await getPostForViewer(db(), author.id, p.id);
    expect(own!.likeCount).toBe(2);
    // a like notification goes to the author only
    expect(await listNotifications(db(), f2.id)).toEqual([]);
  });

  it("closed: replies across a block — hidden from each other in lists, counts, single reads and reports", async () => {
    const author = await makeAccount({ handle: "rb_author" });
    const f1 = await makeAccount({ handle: "rb_f1" });
    const f2 = await makeAccount({ handle: "rb_f2" });
    await fx.befriend(author, f1);
    await fx.befriend(author, f2);
    const p = await fx.post(author, { audience: "friends" });
    const r1 = await createReply(db(), f1.id, p.id, { body: "FICTIONAL from f1" });
    const r2 = await createReply(db(), f2.id, p.id, { body: "FICTIONAL from f2" });
    await block(db(), f2.id, f1.id);

    expect((await listReplies(db(), f2.id, p.id)).map((r) => r.id)).toEqual([r2.id]);
    expect((await listReplies(db(), f1.id, p.id)).map((r) => r.id)).toEqual([r1.id]);
    expect((await getPostForViewer(db(), f2.id, p.id))!.replyCount).toBe(1);
    expect(await canSeeReply(db(), f2.id, r1.id)).toBeNull();
    expect(
      await outcome(() => reportTargetPreview(db(), f2.id, { kind: "reply", targetId: r1.id })),
    ).toEqual(
      await outcome(() => reportTargetPreview(db(), f2.id, { kind: "reply", targetId: MISSING })),
    );
    // the author, unblocked with both, still sees both
    expect((await listReplies(db(), author.id, p.id)).length).toBe(2);
  });
});

describe("closed doors: followers posts end with the follow", () => {
  it("closed: after unfollow, after accepts_followers is switched off (and on again), and after a block, the follower sees no followers post anywhere", async () => {
    const t = at("2026-09-20T12:00:00Z");
    const later = plus.hours(t, 1);
    const cases = ["unfollow", "switch_off", "block"] as const;
    for (const how of cases) {
      await reset();
      const author = await makeAccount({ handle: `fl_a_${how}`.slice(0, 20), acceptsFollowers: true });
      const fan = await makeAccount({ handle: `fl_f_${how}`.slice(0, 20) });
      await follow(db(), fan.id, author.id, t);
      const p = await fx.post(author, { audience: "followers", at: t });
      expect(await canSeePost(db(), fan.id, p.id)).not.toBeNull();

      if (how === "unfollow") await unfollow(db(), fan.id, author.id);
      if (how === "switch_off") {
        await setAcceptsFollowers(db(), author.id, false);
        await setAcceptsFollowers(db(), author.id, true);
      }
      if (how === "block") {
        await block(db(), author.id, fan.id);
        await unblock(db(), author.id, fan.id);
      }

      expect(await canSeePost(db(), fan.id, p.id), how).toBeNull();
      expect(await getPostForViewer(db(), fan.id, p.id), how).toBeNull();
      expect((await getFeed(db(), fan.id, { now: later })).items, how).toEqual([]);
      expect((await listPostsByAuthor(db(), fan.id, author.id)).items, how).toEqual([]);
      expect(await digestFor(db(), fan.id, later), how).toEqual([]);
      expect(
        await outcome(() => createReply(db(), fan.id, p.id, { body: "x" })),
        how,
      ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
  });
});

describe("closed doors: notifications", () => {
  it("closed: a content_removed notice for a reply loses the parent post's text when the replier loses the post, but keeps their own reply", async () => {
    const author = await makeAccount({ handle: "nr_author" });
    const replier = await makeAccount({ handle: "nr_replier" });
    const admin = await makeAccount({ handle: "nr_admin", isAdmin: true });
    await fx.befriend(author, replier);
    const p = await fx.post(author, { audience: "friends", body: "FICTIONAL parent text" });
    const r = await createReply(db(), replier.id, p.id, { body: "FICTIONAL reply text" });
    const { id: reportId } = await createReport(db(), author.id, {
      kind: "reply",
      targetId: r.id,
      category: "spam",
    });
    await removeContent(db(), admin.id, reportId, { category: "spam", reason: "FICTIONAL reason text" });

    const before = (await listNotifications(db(), replier.id)).find((n) => n.kind === "content_removed")!;
    expect(before.postSnippet).toBe("FICTIONAL parent text");

    await unfriend(db(), author.id, replier.id);
    const after = (await listNotifications(db(), replier.id)).find((n) => n.kind === "content_removed")!;
    expect(after.postSnippet).toBeNull();
    expect(after.linkPostId).toBeNull();
    expect(after.replySnippet).toBe("FICTIONAL reply text");
  });

  it("closed: nobody lists or marks anyone else's notifications", async () => {
    const a = await makeAccount({ handle: "nn_a" });
    const b = await makeAccount({ handle: "nn_b" });
    await fx.befriend(a, b);
    const p = await fx.post(a, { audience: "friends" });
    await toggleLike(db(), b.id, p.id);
    expect(await listNotifications(db(), b.id)).toEqual([]);
    expect((await listNotifications(db(), a.id)).length).toBe(1);
  });
});

describe("closed doors: the feed", () => {
  it("closed: a cursor forged at a hidden post's position, in the future, or before the window only positions — it never shows a hidden, muted or out-of-window post", async () => {
    const now = at("2026-09-20T12:00:00Z");
    const me = await makeAccount({ handle: "fd_me" });
    const friend = await makeAccount({ handle: "fd_friend" });
    const muted = await makeAccount({ handle: "fd_muted" });
    const stranger = await makeAccount({ handle: "fd_stranger" });
    await fx.befriend(me, friend);
    await fx.befriend(me, muted);
    await fx.mute(me, muted);
    const visible = await fx.post(friend, { at: plus.hours(now, -2) });
    const hidden = await fx.post(stranger, { at: plus.hours(now, -1) });
    await fx.post(muted, { at: plus.hours(now, -3) });
    const old = await fx.post(friend, { at: new Date(now.getTime() - 14 * 86_400_000 - 1) });

    const cursors = [
      encodeCursor(hidden.createdAt.toISOString().replace("Z", "000Z"), hidden.id),
      encodeCursor("2099-01-01T00:00:00.000000Z", "ZZZZZZZZZZ"),
      encodeCursor(old.createdAt.toISOString().replace("Z", "000Z"), "ZZZZZZZZZZ"),
    ];
    const seen = new Set<string>();
    for (const cursor of cursors) {
      const page = await getFeed(db(), me.id, { cursor, now });
      for (const item of page.items) seen.add(item.id);
    }
    expect([...seen]).toEqual([visible.id]);
    const sqlish = Buffer.from(`2026-09-20T00:00:00.000000Z|x' or 1=1--`).toString("base64url");
    expect(await outcome(() => getFeed(db(), me.id, { cursor: sqlish, now }))).toMatchObject({
      ok: false,
      code: "INVALID",
    });
  });
});

describe("closed doors: profiles and people", () => {
  it("closed: a person who blocked you, a person you blocked, and a suspended person are the same as a missing handle to every profile and connection call", async () => {
    const me = await makeAccount({ handle: "pr_me" });
    const blocker = await makeAccount({ handle: "pr_blocker", acceptsFollowers: true });
    const blockee = await makeAccount({ handle: "pr_blockee", acceptsFollowers: true });
    const banned = await makeAccount({ handle: "pr_banned", acceptsFollowers: true });
    const leaver = await makeAccount({ handle: "pr_leaver", acceptsFollowers: true });
    await block(db(), blocker.id, me.id);
    await block(db(), me.id, blockee.id);
    await suspend(banned.id);
    await deleteAccount(db(), leaver.id, "pr_leaver");

    const probe = async (id: string, handle: string) => ({
      profile: await getAccountByHandle(db(), me.id, handle),
      posts: (await listPostsByAuthor(db(), me.id, id)).items,
      request: await outcome(() => sendFriendRequest(db(), me.id, id)),
      follow: await outcome(() => follow(db(), me.id, id)),
      report: await outcome(() => reportTargetPreview(db(), me.id, { kind: "account", targetId: id })),
    });
    const nothing = await probe(leaver.id, "pr_leaver");
    expect(nothing.profile).toBeNull();
    for (const [id, handle] of [
      [blocker.id, "pr_blocker"],
      [blockee.id, "pr_blockee"],
      [banned.id, "pr_banned"],
    ] as const) {
      expect(await probe(id, handle), handle).toEqual(nothing);
    }
  });
});

describe("closed doors: moderation queue", () => {
  it("closed: a member, a suspended admin and a missing account get the same NOT_FOUND from the queue and every decision, for a real and a missing report", async () => {
    const author = await makeAccount({ handle: "mq_author" });
    const friend = await makeAccount({ handle: "mq_friend" });
    const admin = await makeAccount({ handle: "mq_admin", isAdmin: true });
    const exAdmin = await makeAccount({ handle: "mq_exadmin", isAdmin: true });
    await suspend(exAdmin.id);
    await fx.befriend(author, friend);
    const p = await fx.post(author, { audience: "friends", body: "FICTIONAL reported" });
    const { id: reportId } = await createReport(db(), friend.id, {
      kind: "post",
      targetId: p.id,
      category: "other",
    });

    for (const who of [friend.id, author.id, exAdmin.id, newId()]) {
      const tries = [
        await outcome(() => listOpenReports(db(), who)),
        await outcome(() => removeContent(db(), who, reportId, { category: "spam", reason: "FICTIONAL reason" })),
        await outcome(() => dismissReport(db(), who, reportId, {})),
        await outcome(() => removeContent(db(), who, MISSING, { category: "spam", reason: "FICTIONAL reason" })),
      ];
      for (const t of tries) expect(t).toEqual(tries[3]);
      expect(tries[0]).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    expect((await listOpenReports(db(), admin.id)).length).toBe(1);
    expect(await getPostForViewer(db(), author.id, p.id)).not.toBeNull();
  });
});

describe("closed doors: invites and sign-in", () => {
  it("closed: the invite page state never carries the note or the status to anyone but the inviter, and a used, revoked or expired invite is one answer", async () => {
    const now = at("2026-09-20T12:00:00Z");
    const inviter = await makeAccount({ handle: "iv_owner" });
    const stranger = await makeAccount({ handle: "iv_stranger" });
    const used = await makeAccount({ handle: "iv_used" });
    const live = await createInvite(db(), inviter.id, { note: "FICTIONAL note A", now });
    const spent = await createInvite(db(), inviter.id, { note: "FICTIONAL note B", now });
    await applyInviteAsExisting(db(), { accountId: used.id, inviteId: spent.id, now });

    for (const viewerId of [null, stranger.id]) {
      const state = await inviteForViewer(db(), { code: live.code, viewerId, now });
      expect(JSON.stringify(state)).not.toContain("FICTIONAL note");
    }
    for (const viewerId of [null, stranger.id, used.id, inviter.id]) {
      expect(await inviteForViewer(db(), { code: spent.code, viewerId, now })).toEqual({
        kind: "unusable",
      });
      expect(
        await inviteForViewer(db(), { code: live.code, viewerId, now: plus.days(now, 31) }),
      ).toEqual({ kind: "unusable" });
    }
    const own = await inviteForViewer(db(), { code: live.code, viewerId: inviter.id, now });
    expect(own).toMatchObject({ kind: "own", note: "FICTIONAL note A" });
    expect(
      await db().select({ id: invites.id }).from(invites).where(eq(invites.usedBy, stranger.id)),
    ).toEqual([]);
  });

  it("closed: sign-in and join requests answer the same for an active, a suspended and an unknown address, and mail only the active one", async () => {
    const now = at("2026-09-20T12:00:00Z");
    const active = await makeAccount({ handle: "si_active" });
    const banned = await makeAccount({ handle: "si_banned" });
    await suspend(banned.id);
    const inviter = await makeAccount({ handle: "si_inviter" });
    const inv = await createInvite(db(), inviter.id, { now });

    const emails = [active.email, banned.email, "nobody_here@example.test"];
    const signIn = [];
    for (const email of emails) {
      signIn.push(await outcome(() => requestSignIn(db(), { email, ipHash: rateKeyHash("t1"), now })));
    }
    expect(signIn).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    const mailed = (await db().select({ to: outbox.toAddress }).from(outbox)).map((r) => r.to);
    expect(mailed).toEqual([active.email]);

    await db().delete(outbox);
    const join = [];
    for (const email of emails) {
      join.push(
        await outcome(() => requestJoin(db(), { code: inv.code, email, ipHash: rateKeyHash("t2"), now })),
      );
    }
    expect(join).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    const joinMailed = (await db().select({ to: outbox.toAddress }).from(outbox)).map((r) => r.to).sort();
    expect(joinMailed).toEqual([active.email, "nobody_here@example.test"].sort());
  });
});

describe("closed doors: export", () => {
  it("closed: the export holds the owner's own acts only — no text of a post they liked or replied to, no other address, no other person's invite note", async () => {
    const me = await makeAccount({ handle: "ex_me" });
    const friend = await makeAccount({ handle: "ex_friend" });
    await fx.befriend(me, friend);
    const theirs = await fx.post(friend, { audience: "friends", body: "FICTIONAL their words" });
    await toggleLike(db(), me.id, theirs.id);
    await createReply(db(), me.id, theirs.id, { body: "FICTIONAL my reply" });
    await createInvite(db(), friend.id, { note: "FICTIONAL their note" });

    const text = JSON.stringify(await exportAccount(db(), me.id));
    expect(text).not.toContain("FICTIONAL their words");
    expect(text).not.toContain("FICTIONAL their note");
    expect(text).not.toContain(friend.email);
    expect(text).toContain("FICTIONAL my reply");
  });
});
