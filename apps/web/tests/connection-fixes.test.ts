/**
 * Regression tests for the fixes to SPEC §17 items 10–13 (connections,
 * races and showing people), beyond the verifiers' own tests in
 * verify-privacy.test.ts and verify-abuse.test.ts.
 *
 * The verifiers' races start the connection write first and the block
 * second, which proves that the block removes what the write made. The
 * races here start the block (or the switch-off) first and hold it
 * uncommitted: the write must wait for it, then find it and refuse. That
 * is the "re-check the block after the lock" half of item 10, which the
 * verifiers' tests would not notice missing.
 *
 * Everyone here is FICTIONAL, with example.test addresses.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { setAcceptsFollowers } from "@/core/accounts";
import {
  acceptFriendRequest,
  block,
  cancelFriendRequest,
  declineFriendRequest,
  follow,
  listMuted,
  mute,
  sendFriendRequest,
  unblock,
  unfollow,
} from "@/core/connections";
import type { Db } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { listNotifications } from "@/core/inbox";
import { applyInviteAsExisting, createInvite, listInvites } from "@/core/invites";
import { countUnread, notify } from "@/core/notifications";
import { postPage, toggleLike } from "@/core/posts";
import * as schema from "@/core/schema";
import {
  accounts,
  follows,
  friendRequests,
  invites,
  notifications,
} from "@/core/schema";
import { pairLock } from "@/core/visibility";
import * as fx from "./helpers";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);

/* ---------------------------------------------------------------- helpers */

type Outcome = { ok: true } | { ok: false; code: string };

async function outcome(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    await run();
    return { ok: true };
  } catch (error) {
    if (!isCoreError(error)) throw error;
    return { ok: false, code: error.code };
  }
}

/** Whether any session in the test database is waiting on a lock. */
async function someoneWaitsOnALock(): Promise<boolean> {
  const result = await db().execute(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`);
  return Number((result.rows[0] as { n: number }).n) > 0;
}

/**
 * `hold` runs in a transaction on its own connection and is left
 * uncommitted; `racer` starts on the ordinary pool. Once the racer waits on
 * a lock (or has finished), `hold` commits. Returns how the racer ended and
 * whether it had to wait.
 */
async function whileHeld(
  hold: (tx: Db) => Promise<void>,
  racer: () => Promise<unknown>,
): Promise<{ result: Outcome; waited: boolean }> {
  const client = new pg.Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  let settled: Promise<Outcome> | null = null;
  let waited = false;
  try {
    await drizzle(client, { schema }).transaction(async (tx) => {
      await hold(tx as unknown as Db);
      let done = false;
      settled = outcome(racer).finally(() => {
        done = true;
      });
      for (let i = 0; i < 500 && !done; i++) {
        if (await someoneWaitsOnALock()) {
          waited = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
  } finally {
    await client.end();
  }
  return { result: await settled!, waited };
}

async function count(table: "follows" | "likes" | "friendships"): Promise<number> {
  const result = await db().execute(sql.raw(`select count(*)::int as n from ${table}`));
  return Number((result.rows[0] as { n: number }).n);
}

/* ================================================================= locks */

describe("pairLock (SPEC §17 item 10)", () => {
  it("is refused outside a transaction, where it would be released at once", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await expect(pairLock(db(), a.id, b.id)).rejects.toThrow(/inside a transaction/);
  });

  it("is one lock for the unordered pair: unblock waits while the pair is held the other way round", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await fx.block(a, b);
    const { result, waited } = await whileHeld(
      (tx) => pairLock(tx, b.id, a.id),
      () => unblock(db(), a.id, b.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: true }, waited: true });
  });
});

describe("a write that waits for a block in flight finds it and refuses (SPEC §17 item 10)", () => {
  it("follow: NOT_FOUND, no follow and no notification", async () => {
    const star = await makeAccount({ acceptsFollowers: true });
    const fan = await makeAccount();
    const { result, waited } = await whileHeld(
      (tx) => block(tx, star.id, fan.id),
      () => follow(db(), fan.id, star.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "NOT_FOUND" }, waited: true });
    expect(await count("follows")).toBe(0);
    expect(await db().select().from(notifications)).toEqual([]);
  });

  it("toggleLike: NOT_FOUND, no like", async () => {
    const author = await makeAccount();
    const liker = await makeAccount();
    await fx.befriend(author, liker);
    const p = await fx.post(author, { audience: "friends" });
    const { result, waited } = await whileHeld(
      (tx) => block(tx, author.id, liker.id),
      () => toggleLike(db(), liker.id, p.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "NOT_FOUND" }, waited: true });
    expect(await count("likes")).toBe(0);
  });

  it("sendFriendRequest: NOT_FOUND, no pending request", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const { result, waited } = await whileHeld(
      (tx) => block(tx, b.id, a.id),
      () => sendFriendRequest(db(), a.id, b.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "NOT_FOUND" }, waited: true });
    expect(
      await db().select().from(friendRequests).where(eq(friendRequests.status, "pending")),
    ).toEqual([]);
  });

  it("acceptFriendRequest: NOT_FOUND, no friendship", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await sendFriendRequest(db(), b.id, a.id);
    const { result, waited } = await whileHeld(
      (tx) => block(tx, b.id, a.id),
      () => acceptFriendRequest(db(), a.id, b.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "NOT_FOUND" }, waited: true });
    expect(await count("friendships")).toBe(0);
  });

  it("useInviteAsExisting: NOT_FOUND, no friendship, and the invite stays unused", async () => {
    const inviter = await makeAccount();
    const guest = await makeAccount();
    const { id: inviteId } = await createInvite(db(), inviter.id, {});
    const { result, waited } = await whileHeld(
      (tx) => block(tx, inviter.id, guest.id),
      () => applyInviteAsExisting(db(), { accountId: guest.id, inviteId }),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "NOT_FOUND" }, waited: true });
    expect(await count("friendships")).toBe(0);
    const [row] = await db().select().from(invites).where(eq(invites.id, inviteId));
    expect(row!.usedAt).toBeNull();
  });

  it("follow waits for accepts_followers being switched off, then is FORBIDDEN", async () => {
    const star = await makeAccount({ acceptsFollowers: true });
    const fan = await makeAccount();
    const { result, waited } = await whileHeld(
      (tx) => setAcceptsFollowers(tx, star.id, false),
      () => follow(db(), fan.id, star.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: false, code: "FORBIDDEN" }, waited: true });
    expect(await count("follows")).toBe(0);
  });
});

/* ========================================================= notifications */

describe("notifications that were undone are removed (SPEC §17 item 13)", () => {
  it("declining a request removes its friend_request notification", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await sendFriendRequest(db(), a.id, b.id);
    expect((await listNotifications(db(), b.id)).map((n) => n.kind)).toEqual(["friend_request"]);
    await declineFriendRequest(db(), b.id, a.id);
    expect(await listNotifications(db(), b.id)).toEqual([]);
    expect(await countUnread(db(), b.id)).toBe(0);
  });

  it("cancelling removes only that request's notification, not the recipient's others", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const c = await makeAccount();
    await sendFriendRequest(db(), a.id, b.id);
    await sendFriendRequest(db(), c.id, b.id);
    await cancelFriendRequest(db(), a.id, b.id);
    const left = await listNotifications(db(), b.id);
    expect(left.map((n) => [n.kind, n.actor?.id])).toEqual([["friend_request", c.id]]);
  });

  it("unfollowing removes the new_follower notification", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    await follow(db(), fan.id, star.id);
    expect((await listNotifications(db(), star.id)).map((n) => n.kind)).toEqual(["new_follower"]);
    await unfollow(db(), fan.id, star.id);
    expect(await listNotifications(db(), star.id)).toEqual([]);
  });
});

describe("the follow limit (SPEC §17 item 13)", () => {
  it("allows 100 new follows a day and refuses the 101st; following someone again does not count", async () => {
    const now = at("2026-09-24T10:00:00Z");
    const fan = await makeAccount();
    const stars: schema.Account[] = [];
    for (let i = 0; i < 101; i++) stars.push(await makeAccount({ acceptsFollowers: true }));
    for (let i = 0; i < 100; i++) await follow(db(), fan.id, stars[i]!.id, now);
    // Following again changes nothing and is not refused.
    await follow(db(), fan.id, stars[0]!.id, now);
    expect(await outcome(() => follow(db(), fan.id, stars[100]!.id, now))).toEqual({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect(await count("follows")).toBe(100);
    // A day later the limit has room again.
    await follow(db(), fan.id, stars[100]!.id, plus.hours(now, 25));
    expect(await count("follows")).toBe(101);
  });
});

/* ======================================================== showing people */

describe("one rule for showing a person (SPEC §17 item 11)", () => {
  it("the badge counts the unread among exactly what the list shows: the newest 100", async () => {
    const me = await makeAccount();
    const other = await makeAccount();
    const t0 = at("2026-09-24T10:00:00Z");
    for (let i = 0; i < 105; i++) {
      await notify(db(), {
        recipientId: me.id,
        kind: "friend_accepted",
        actorId: other.id,
        now: plus.minutes(t0, i),
      });
    }
    const listed = await listNotifications(db(), me.id);
    expect(await countUnread(db(), me.id)).toBe(listed.filter((n) => !n.readAt).length);
    expect(await countUnread(db(), me.id)).toBe(100);
  });

  it("the badge leaves out an actor who is suspended, like the list", async () => {
    const me = await makeAccount();
    const other = await makeAccount();
    const third = await makeAccount();
    await notify(db(), { recipientId: me.id, kind: "friend_accepted", actorId: other.id });
    await notify(db(), { recipientId: me.id, kind: "friend_accepted", actorId: third.id });
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, third.id));
    expect(await countUnread(db(), me.id)).toBe(1);
    expect((await listNotifications(db(), me.id)).map((n) => n.actor?.id)).toEqual([other.id]);
  });

  it("an invitee the inviter blocked is not named, in the list or the export", async () => {
    const inviter = await makeAccount();
    const guest = await makeAccount();
    const inv = await createInvite(db(), inviter.id, {});
    await applyInviteAsExisting(db(), { accountId: guest.id, inviteId: inv.id });
    expect((await listInvites(db(), inviter.id)).invites[0]!.usedByHandle).toBe(guest.handle);
    await block(db(), inviter.id, guest.id);
    expect((await listInvites(db(), inviter.id)).invites[0]!.usedByHandle).toBeNull();
    expect((await exportAccount(db(), inviter.id)).invites[0]!.used_by_handle).toBeNull();
    // The invite is still counted as used.
    expect((await listInvites(db(), inviter.id)).invites[0]!.status).toBe("used");
  });

  it("the export's muted list follows listMuted: a blocker or a suspended person drops out", async () => {
    const me = await makeAccount();
    const blocker = await makeAccount();
    const banned = await makeAccount();
    const plain = await makeAccount();
    await fx.mute(me, blocker);
    await fx.mute(me, banned);
    await fx.mute(me, plain);
    await block(db(), blocker.id, me.id);
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, banned.id));
    expect((await listMuted(db(), me.id)).map((p) => p.handle)).toEqual([plain.handle]);
    expect((await exportAccount(db(), me.id)).muted.map((m) => m.handle)).toEqual([plain.handle]);
  });

  it("mute and block of a missing account write nothing and answer like any other", async () => {
    const me = await makeAccount();
    const missing = "01ZZZZZZZZZZZZZZZZZZZZZZZZ";
    await block(db(), me.id, missing);
    await mute(db(), me.id, missing);
    const rows = await db().execute(
      sql`select (select count(*) from blocks)::int as b, (select count(*) from mutes)::int as m`,
    );
    expect(rows.rows[0]).toEqual({ b: 0, m: 0 });
  });
});

describe("postPage applies the visibility rule itself (SPEC §17 item 12)", () => {
  it("with no condition at all it returns only what the viewer may see", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    const stranger = await makeAccount();
    await fx.befriend(me, friend);
    const seen = await fx.post(friend, { audience: "friends" });
    await fx.post(stranger, { audience: "friends" });
    const page = await postPage(db(), me.id, undefined);
    expect(page.items.map((p) => p.id)).toEqual([seen.id]);
  });
});

/* A sanity check that the block-first harness sees no lock without the lock. */
describe("the harness", () => {
  it("does not report a wait when nothing is held", async () => {
    const a = await makeAccount();
    const b = await makeAccount({ acceptsFollowers: true });
    const { result, waited } = await whileHeld(
      async () => undefined,
      () => follow(db(), a.id, b.id),
    );
    expect({ result, waited }).toEqual({ result: { ok: true }, waited: false });
    expect(
      await db()
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, a.id), eq(follows.followeeId, b.id))),
    ).toHaveLength(1);
  });
});
