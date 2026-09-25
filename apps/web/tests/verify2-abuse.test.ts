/**
 * Re-verification of M-0010 (second and final round, SPEC §17 stopping
 * rule), lens: abuse, limits, moderation and the invite economy. Written by
 * a verifier that did not build apps/web and did not write round one.
 *
 * A test named "DEFECT: …" fails on dafb604 and demonstrates a defect. A
 * test named "closed: …" passes and records a door that was tried and found
 * shut. Both are kept. Everyone and everything here is FICTIONAL; addresses
 * are example.test and network addresses are from the documentation ranges.
 *
 * Races are made deterministic with `paused()`: a second pool whose
 * connections stop before one chosen statement (matched on its text and,
 * where needed, its parameters, e.g. the pair lock's `pair:` key) while a
 * competing operation runs on its own connection until it has finished or
 * is waiting on a lock (checked by that connection's pid). The pause only
 * fixes an order two real requests can produce.
 *
 * Scrutiny of the adapted round-one tests (not a test here; done once on
 * 24 September 2026): the adapted verify-abuse.test.ts and
 * verify-privacy.test.ts (new race harness, renamed "fixed:"/"accepted:")
 * were run unchanged against the pre-fix source (git archive 9c1df35
 * apps/web, same node_modules). Every "fixed:" race test still FAILS there
 * (useInviteAsExisting, follow ×2, toggleLike, sendFriendRequest in both
 * files), so the new harness still detects the original defect; it did not
 * quietly weaken them. What the new harness no longer exercises is the
 * window BEFORE the pair lock (it pauses at the insert, after the lock), so
 * the "window" tests below pause at the pair lock itself and let the block
 * commit first, which is the verifier's original schedule.
 *
 * Also observed (not in this lens, not a product defect): the fixer's test
 * "an expired, tampered or foreign signed value is not an offer"
 * (tests/identity-fixes.test.ts:293) forges `${mac.slice(0, -1)}A`; when
 * the real MAC already ends in "A" (1 run in 16) the forgery is the real
 * value and the test fails. It failed once in the first full run here.
 *
 * Each DEFECT here was checked against the smallest fix named in the
 * report, applied to a scratch copy of dafb604: all 20 tests pass there.
 */
import { and, count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { setAcceptsFollowers } from "@/core/accounts";
import * as conn from "@/core/connections";
import type { Db } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { listNotifications } from "@/core/inbox";
import {
  createInvite,
  listInvites,
  lookupInvite,
  requestJoin,
  useInviteAsExisting,
} from "@/core/invites";
import { RATE_LIMITED_MESSAGE } from "@/core/limits";
import { countUnread } from "@/core/notifications";
import { createReply, listReplies, toggleLike } from "@/core/posts";
import { createReport, suspendAccount } from "@/core/reports";
import * as schema from "@/core/schema";
import {
  accounts,
  follows,
  friendRequests,
  friendships,
  invites,
  likes,
  mailLog,
  notifications,
  outbox,
  rateEvents,
  replies,
} from "@/core/schema";
import { areFriends, isBlocked } from "@/core/visibility";
import type { Viewer } from "@/web/viewer";
import { at, befriend, db, makeAccount, post, reset } from "./helpers";

/* ------------------------------------------------------------------ mocks */
// Only the action-layer tests use these; the core imports no framework.

const web = vi.hoisted(() => ({
  viewer: null as null | {
    id: string;
    handle: string;
    displayName: string;
    isAdmin: boolean;
    acceptsFollowers: boolean;
    invitesRemaining: number;
  },
  headers: {} as Record<string, string>,
}));

vi.mock("@/web/viewer", () => ({
  requireViewer: vi.fn(async () => {
    if (!web.viewer) throw new Error("test: no viewer set");
    return web.viewer;
  }),
  getViewer: vi.fn(async () => web.viewer),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(web.headers),
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
  web.headers = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ---------------------------------------------------------------- helpers */

/** "OK", or the CoreError code a promise is refused with. */
async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
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

async function notificationsFrom(recipientId: string, actorId: string, kind?: string) {
  const rows = await db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientId, recipientId), eq(notifications.actorId, actorId)));
  return kind ? rows.filter((r) => r.kind === kind) : rows;
}

async function seedRate(key: string, n: number): Promise<void> {
  const when = new Date(Date.now() - 60_000);
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `seed${i.toString().padStart(6, "0")}${Math.random().toString(36).slice(2, 10)}`,
    key,
    createdAt: when,
  }));
  if (rows.length) await db().insert(rateEvents).values(rows);
}

type Match = (text: string, values: unknown[]) => boolean;

/** The SQL of a statement matching `re`. */
const statement =
  (re: RegExp): Match =>
  (text) =>
    re.test(text);

/** The pair lock (SPEC §17 item 10), not a rate-limit key's advisory lock. */
const pairLockStatement: Match = (text, values) =>
  /pg_advisory_xact_lock/.test(text) &&
  typeof values[0] === "string" &&
  (values[0] as string).startsWith("pair:");

/**
 * Run `fn` on its own connection until it has finished or that connection
 * is waiting on a lock. Returns the promise of its end (which also closes
 * the connection) and how far it got.
 */
async function competitor(
  fn: (other: Db) => Promise<unknown>,
): Promise<{ state: "done" | "failed" | "waiting"; end: Promise<void> }> {
  const client = new pg.Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  const pid = Number((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
  const status: { state: "running" | "done" | "failed"; failure?: unknown } = {
    state: "running",
  };
  const running = fn(drizzle(client, { schema }) as unknown as Db).then(
    () => void (status.state = "done"),
    (error: unknown) => {
      status.state = "failed";
      status.failure = error;
    },
  );
  const end = running
    .then(() => {
      if (status.state === "failed") throw status.failure;
    })
    .finally(() => client.end());
  for (let i = 0; i < 2000; i++) {
    if (status.state !== "running") return { state: status.state, end };
    const waiting = await db().execute(sql`
      select count(*)::int as n from pg_stat_activity
      where pid = ${pid} and wait_event_type = 'Lock'`);
    if (Number((waiting.rows[0] as { n: number }).n) > 0) return { state: "waiting", end };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("the competing operation neither finished nor waited on a lock");
}

/**
 * A pool whose connections stop before the first statement `match`
 * accepts, run `fn` as a competitor, then go on. `close()` waits for every
 * competitor to end and reports how each one had got when the pause ended.
 */
function paused() {
  const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 4 });
  const hooks: { match: Match; fn: (other: Db) => Promise<unknown> }[] = [];
  const ends: Promise<void>[] = [];
  const states: string[] = [];
  pool.on("connect", (client) => {
    const original = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (
      ...args: unknown[]
    ) => {
      const first = args[0] as { text?: unknown; values?: unknown } | string | undefined;
      const text =
        typeof first === "string" ? first : typeof first?.text === "string" ? first.text : "";
      const values = Array.isArray(args[1])
        ? (args[1] as unknown[])
        : typeof first === "object" && Array.isArray(first?.values)
          ? (first.values as unknown[])
          : [];
      const index = hooks.findIndex((h) => h.match(text, values));
      if (index < 0) return original(...args);
      const [hook] = hooks.splice(index, 1);
      const callback =
        typeof args[args.length - 1] === "function"
          ? (args.pop() as (error: unknown, result?: unknown) => void)
          : null;
      const result = competitor(hook!.fn).then(({ state, end }) => {
        states.push(state);
        ends.push(end);
        return original(...args) as Promise<unknown>;
      });
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
    before(match: Match, fn: (other: Db) => Promise<unknown>) {
      hooks.push({ match, fn });
    },
    states,
    pending: () => hooks.length,
    close: async () => {
      try {
        const results = await Promise.allSettled(ends);
        const failed = results.find((r) => r.status === "rejected");
        if (failed) throw (failed as PromiseRejectedResult).reason;
      } finally {
        await pool.end();
      }
    },
  };
}

/* ============================================ blocks and the pair lock */

describe("a block racing a reply (SPEC §6; M-0010: a block refuses new replies)", () => {
  it("fixed: a reply notification written while a block commits survives the block, and unblocking brings it back to the blocker", async () => {
    // createReply (src/core/posts.ts:370) takes no pair lock: its notify()
    // checks for a block, then inserts. A block that commits in between
    // cannot delete a row that is not there yet.
    const author = await makeAccount({ displayName: "FICTIONAL Author" });
    const pest = await makeAccount({ displayName: "FICTIONAL Replier" });
    await befriend(author, pest);
    const p = await post(author, { body: "A FICTIONAL post." });

    const race = paused();
    let replied = "";
    try {
      race.before(statement(/^insert into "notifications"/i), (other) =>
        conn.block(other, author.id, pest.id),
      );
      replied = await outcome(
        createReply(race.db, pest.id, p.id, { body: "A FICTIONAL reply." }),
      );
      expect(race.pending()).toBe(0);
    } finally {
      await race.close();
    }
    expect(await isBlocked(db(), author.id, pest.id)).toBe(true);
    const acrossBlock = (await notificationsFrom(author.id, pest.id)).length;

    await conn.unblock(db(), author.id, pest.id);
    const shownAfterUnblock = (await listNotifications(db(), author.id)).filter(
      (n) => n.actor?.id === pest.id,
    ).length;
    const badgeAfterUnblock = await countUnread(db(), author.id);

    // SPEC §6: a block "deletes notifications whose actor is the other
    // person"; unblocking restores nothing. Serial in either order, this
    // pair ends with no notification from the replier.
    expect({ replied, acrossBlock, shownAfterUnblock, badgeAfterUnblock }).toEqual({
      replied: "OK",
      acrossBlock: 0,
      shownAfterUnblock: 0,
      badgeAfterUnblock: 0,
    });
  });

  it("fixed: a reply that commits after a block has committed is accepted, and after unblocking the blocker sees it on their post", async () => {
    // The pause is between the permission check and the write (at the
    // reply's rate-limit event): the block has fully committed before the
    // reply's transaction begins. toggleLike re-checks under the pair lock
    // in exactly this window and refuses; createReply does not.
    const author = await makeAccount({ displayName: "FICTIONAL Author" });
    const pest = await makeAccount({ displayName: "FICTIONAL Replier" });
    await befriend(author, pest);
    const p = await post(author, { body: "A FICTIONAL post." });

    const race = paused();
    let replied = "";
    try {
      race.before(statement(/^insert into "rate_events"/i), (other) =>
        conn.block(other, author.id, pest.id),
      );
      replied = await outcome(
        createReply(race.db, pest.id, p.id, { body: "A FICTIONAL reply after the block." }),
      );
      expect(race.states).toEqual(["done"]); // the block committed first
    } finally {
      await race.close();
    }
    const [written] = await db()
      .select({ n: count() })
      .from(replies)
      .where(and(eq(replies.postId, p.id), eq(replies.authorId, pest.id)));

    await conn.unblock(db(), author.id, pest.id);
    const seenAfterUnblock = (await listReplies(db(), author.id, p.id)).filter(
      (r) => r.author.id === pest.id,
    ).length;

    // M-0010: a block "refuses new … replies … between them". The block
    // committed before this reply's write began, so it is a new reply.
    expect({ replied, written: written!.n, seenAfterUnblock }).toEqual({
      replied: "NOT_FOUND",
      written: 0,
      seenAfterUnblock: 0,
    });
  });
});

describe("a moderation removal racing a reply (SPEC §6 canReply = canSeePost and active)", () => {
  it("fixed: a reply whose post is removed between the check and the write lands on the removed post, and its author is notified of it", async () => {
    // Same root cause as above: createReply checks canReply once, before
    // its transaction, and never again.
    const admin = await makeAccount({ isAdmin: true });
    const author = await makeAccount();
    const replier = await makeAccount();
    const reporter = await makeAccount();
    await befriend(author, replier);
    await befriend(author, reporter);
    const p = await post(author, { body: "A FICTIONAL post that will be removed." });
    const report = await createReport(db(), reporter.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
    });
    const { removeContent } = await import("@/core/reports");

    const race = paused();
    let replied = "";
    try {
      race.before(statement(/^insert into "rate_events"/i), (other) =>
        removeContent(other, admin.id, report.id, {
          category: "spam",
          reason: "FICTIONAL statement of reasons.",
        }),
      );
      replied = await outcome(
        createReply(race.db, replier.id, p.id, { body: "A FICTIONAL late reply." }),
      );
      expect(race.states).toEqual(["done"]); // the removal committed first
    } finally {
      await race.close();
    }
    const [written] = await db()
      .select({ n: count() })
      .from(replies)
      .where(eq(replies.postId, p.id));
    const noticed = (await notificationsFrom(author.id, replier.id, "reply")).length;
    expect({ replied, written: written!.n, noticed }).toEqual({
      replied: "NOT_FOUND",
      written: 0,
      noticed: 0,
    });
  });
});

describe("the window before the pair lock (round one's schedule: the block commits between the check and the write)", () => {
  it("closed: an invite use paused at its pair lock while the block commits is refused, and the invite stays unused", async () => {
    const inviter = await makeAccount();
    const user = await makeAccount();
    const { code } = await createInvite(db(), inviter.id, {});
    const inv = await lookupInvite(db(), code);
    const race = paused();
    let used = "";
    try {
      race.before(pairLockStatement, (other) => conn.block(other, inviter.id, user.id));
      used = await outcome(
        useInviteAsExisting(race.db, { accountId: user.id, inviteId: inv!.inviteId }),
      );
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    const [row] = await db().select().from(invites).where(eq(invites.id, inv!.inviteId));
    await conn.unblock(db(), inviter.id, user.id);
    expect({
      used,
      usedAt: row!.usedAt,
      friends: await areFriends(db(), inviter.id, user.id),
    }).toEqual({ used: "NOT_FOUND", usedAt: null, friends: false });
  });

  it("closed: a follow paused at its pair lock while the block commits is refused (NOT_FOUND), with no row and no notification", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    const race = paused();
    let followed = "";
    try {
      race.before(pairLockStatement, (other) => conn.block(other, star.id, fan.id));
      followed = await outcome(conn.follow(race.db, fan.id, star.id));
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    await conn.unblock(db(), star.id, fan.id);
    const rows = await db().select().from(follows).where(eq(follows.followerId, fan.id));
    expect({
      followed,
      rows: rows.length,
      notes: (await notificationsFrom(star.id, fan.id)).length,
    }).toEqual({ followed: "NOT_FOUND", rows: 0, notes: 0 });
  });

  it("closed: a follow paused at its pair lock while followers are switched off is refused (FORBIDDEN), with no row and no notification", async () => {
    const fan = await makeAccount();
    const star = await makeAccount({ acceptsFollowers: true });
    const race = paused();
    let followed = "";
    try {
      race.before(pairLockStatement, (other) => setAcceptsFollowers(other, star.id, false));
      followed = await outcome(conn.follow(race.db, fan.id, star.id));
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    await setAcceptsFollowers(db(), star.id, true);
    const rows = await db().select().from(follows).where(eq(follows.followerId, fan.id));
    expect({
      followed,
      rows: rows.length,
      notes: (await notificationsFrom(star.id, fan.id)).length,
    }).toEqual({ followed: "FORBIDDEN", rows: 0, notes: 0 });
  });

  it("closed: a like paused at its pair lock while the block commits is refused, with no like and no notification", async () => {
    const author = await makeAccount();
    const liker = await makeAccount();
    await befriend(author, liker);
    const p = await post(author);
    const race = paused();
    let liked = "";
    try {
      race.before(pairLockStatement, (other) => conn.block(other, author.id, liker.id));
      liked = await outcome(toggleLike(race.db, liker.id, p.id));
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    await conn.unblock(db(), author.id, liker.id);
    const rows = await db().select().from(likes).where(eq(likes.accountId, liker.id));
    expect({
      liked,
      rows: rows.length,
      notes: (await notificationsFrom(author.id, liker.id)).length,
    }).toEqual({ liked: "NOT_FOUND", rows: 0, notes: 0 });
  });

  it("closed: a friend request paused at its pair lock while the block commits is refused, with no request and no notification", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    const race = paused();
    let asked = "";
    try {
      race.before(pairLockStatement, (other) => conn.block(other, target.id, pest.id));
      asked = await outcome(conn.sendFriendRequest(race.db, pest.id, target.id));
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    await conn.unblock(db(), target.id, pest.id);
    const pending = await db()
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.fromId, pest.id), eq(friendRequests.status, "pending")));
    expect({
      asked,
      pending: pending.length,
      incoming: (await conn.listRequests(db(), target.id)).incoming.length,
      notes: (await notificationsFrom(target.id, pest.id)).length,
    }).toEqual({ asked: "NOT_FOUND", pending: 0, incoming: 0, notes: 0 });
  });

  it("closed: an acceptance paused at its pair lock while the requester blocks is refused, and no friendship exists after unblocking", async () => {
    const requester = await makeAccount();
    const accepter = await makeAccount();
    await conn.sendFriendRequest(db(), requester.id, accepter.id);
    const race = paused();
    let accepted = "";
    try {
      race.before(pairLockStatement, (other) => conn.block(other, requester.id, accepter.id));
      accepted = await outcome(conn.acceptFriendRequest(race.db, accepter.id, requester.id));
      expect(race.states).toEqual(["done"]);
    } finally {
      await race.close();
    }
    await conn.unblock(db(), requester.id, accepter.id);
    const [a, b] = [requester.id, accepter.id].sort();
    const rows = await db()
      .select()
      .from(friendships)
      .where(and(eq(friendships.aId, a!), eq(friendships.bId, b!)));
    expect({ accepted, rows: rows.length }).toEqual({ accepted: "NOT_FOUND", rows: 0 });
  });
});

/* ======================================================= invite economy */

describe("invite economy after SPEC §17 item 1 (/join/confirm)", () => {
  it("closed: a join link opened by an existing account spends nothing; two Adds at once spend the invite once and make one friendship", async () => {
    const inviter = await makeAccount({ invitesRemaining: 1 });
    const member = await makeAccount({ email: "fictional.member@example.test" });
    const { code, id } = await createInvite(db(), inviter.id, {});
    expect((await listInvites(db(), inviter.id)).remaining).toBe(0);

    // The join mail goes out, but nothing is spent until the member says Add.
    await requestJoin(db(), { code, email: member.email, ipHash: "fictional-ip-hash" });
    const [before] = await db().select().from(invites).where(eq(invites.id, id));
    expect(before!.usedAt).toBeNull();

    const results = await Promise.allSettled([
      useInviteAsExisting(db(), { accountId: member.id, inviteId: id }),
      useInviteAsExisting(db(), { accountId: member.id, inviteId: id }),
      useInviteAsExisting(db(), { accountId: member.id, inviteId: id }),
    ]);
    const statuses = results.map((r) =>
      r.status === "fulfilled" ? r.value.status : isCoreError(r.reason) ? r.reason.code : "ERR",
    );
    expect(statuses.filter((s) => s === "friends")).toHaveLength(1);
    const [after] = await db().select().from(invites).where(eq(invites.id, id));
    expect(after!.usedBy).toBe(member.id);
    expect(await areFriends(db(), inviter.id, member.id)).toBe(true);
    // Using an invite is not a refund, and the count never went below zero.
    expect((await listInvites(db(), inviter.id)).remaining).toBe(0);
    expect(
      (await notificationsFrom(inviter.id, member.id, "friend_accepted")).length,
    ).toBe(1);
  });

  it("closed: the per-invite limit holds across many addresses from rotating network addresses (10 join links a day per invite)", async () => {
    const inviter = await makeAccount({ displayName: "FICTIONAL Inviter" });
    const { code } = await createInvite(db(), inviter.id, {});
    const answers: string[] = [];
    for (let i = 0; i < 14; i++) {
      answers.push(
        await outcome(
          requestJoin(db(), {
            code,
            email: `fictional.rcpt${i}@example.test`,
            ipHash: `fictional-ip-${i}`,
          }),
        ),
      );
    }
    const sent = (await db().select().from(outbox)).filter((m) => m.kind === "join").length;
    expect({ sent, refused: answers.filter((a) => a === "RATE_LIMITED").length }).toEqual({
      sent: 10,
      refused: 4,
    });
  });
});

/* ========================================= limits under the decided config */

describe("the client-address header and the CLOSED switch (SPEC §17 item 3), at the action layer", () => {
  function joinForm(code: string, email: string): FormData {
    const form = new FormData();
    form.set("code", code);
    form.set("email", email);
    return form;
  }

  it("closed: in production with no CLIENT_IP_HEADER, join requests are CLOSED and nothing is sent or counted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    const inviter = await makeAccount();
    const { code } = await createInvite(db(), inviter.id, {});
    const { requestJoinAction } = await import("@/app/(public)/i/[code]/actions");
    web.headers = { "x-forwarded-for": "203.0.113.9" };
    const result = await requestJoinAction(null, joinForm(code, "fictional.a@example.test"));
    expect(result).toMatchObject({ ok: false });
    expect(await db().select().from(outbox)).toEqual([]);
    const events = await db().select().from(rateEvents);
    expect(events.filter((e) => e.key.startsWith("join:"))).toEqual([]);
  });

  it("closed: in production with a named header, rotating x-forwarded-for does not escape the per-IP join limit (the 11th in an hour is refused, across two invites)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    const inviter = await makeAccount();
    const one = await createInvite(db(), inviter.id, {});
    const two = await createInvite(db(), inviter.id, {});
    const { requestJoinAction } = await import("@/app/(public)/i/[code]/actions");
    const results: unknown[] = [];
    for (let i = 0; i < 11; i++) {
      web.headers = {
        "x-vercel-forwarded-for": "198.51.100.23",
        "x-forwarded-for": `203.0.113.${i + 1}`,
      };
      const code = i < 6 ? one.code : two.code;
      results.push(
        await requestJoinAction(null, joinForm(code, `fictional.ip${i}@example.test`)),
      );
    }
    expect(results.slice(0, 10).every((r) => (r as { ok: boolean }).ok)).toBe(true);
    expect(results[10]).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
    const sent = (await db().select().from(outbox)).filter((m) => m.kind === "join").length;
    expect(sent).toBe(10);
  });
});

describe("follow limit (SPEC §17 item 13) at the action layer", () => {
  it("closed: followAction refuses the 101st new follow of a day, while following someone already followed again neither counts nor fails", async () => {
    const fan = await makeAccount();
    const known = await makeAccount({ acceptsFollowers: true });
    const fresh = await makeAccount({ acceptsFollowers: true });
    const { followAction } = await import("@/app/(app)/people/actions");
    web.viewer = viewerOf(fan);
    expect(await followAction(known.id)).toEqual({ ok: true });
    await seedRate(`follow:${fan.id}`, 99); // 100 new follows today
    expect(await followAction(known.id)).toEqual({ ok: true }); // already following
    expect(await followAction(fresh.id)).toEqual({ ok: false, error: RATE_LIMITED_MESSAGE });
    const rows = await db().select().from(follows).where(eq(follows.followerId, fan.id));
    expect(rows.map((r) => r.followeeId)).toEqual([known.id]);
    expect((await notificationsFrom(fresh.id, fan.id)).length).toBe(0);
  });
});

/* ====================================================== friend requests */

describe("friend requests: decline and re-request", () => {
  it("closed: request, decline, request again leaves the target one notification and one badge, never a pile", async () => {
    const pest = await makeAccount();
    const target = await makeAccount();
    const now = at("2026-09-24T10:00:00Z");
    for (let i = 0; i < 10; i++) {
      await conn.sendFriendRequest(db(), pest.id, target.id, new Date(now.getTime() + i * 1000));
      await conn.declineFriendRequest(db(), target.id, pest.id, new Date(now.getTime() + i * 1000 + 500));
    }
    await conn.sendFriendRequest(db(), pest.id, target.id, new Date(now.getTime() + 20_000));
    expect((await notificationsFrom(target.id, pest.id, "friend_request")).length).toBe(1);
    expect(await countUnread(db(), target.id)).toBe(1);
  });
});

/* ================================================= the weekly email run */

describe("the weekly email run while accounts change (SPEC §8 'For each active account with weekly_email')", () => {
  /** One author and three recipients, ordered by id as the run takes them. */
  async function week() {
    const now = at("2026-09-24T09:00:00Z");
    const author = await makeAccount({ displayName: "FICTIONAL Poster", weeklyEmail: false });
    const r1 = await makeAccount({ email: "fictional.r1@example.test" });
    const r2 = await makeAccount({ email: "fictional.r2@example.test" });
    const r3 = await makeAccount({ email: "fictional.r3@example.test" });
    for (const r of [r1, r2, r3]) await befriend(author, r);
    await post(author, { at: at("2026-09-23T09:00:00Z"), body: "A FICTIONAL post." });
    expect([r1.id, r2.id, r3.id]).toEqual([r1.id, r2.id, r3.id].sort());
    return { now, author, r1, r2, r3 };
  }

  async function digestsTo(email: string) {
    return (await db().select().from(outbox)).filter(
      (m) => m.kind === "digest" && m.toAddress === email,
    ).length;
  }

  it("fixed: one account deleted while the run is under way aborts the run, and everyone after it gets nothing that week", async () => {
    const { now, r1, r2, r3 } = await week();
    const { deleteAccount } = await import("@/core/accounts");
    const { runWeeklyDigest } = await import("@/core/digest");
    const race = paused();
    let ran = "";
    try {
      // While the run is at its first recipient, the second leaves OURS.
      race.before(statement(/^insert into "digest_deliveries"/i), (other) =>
        deleteAccount(other, r2.id, r2.handle),
      );
      ran = await outcome(runWeeklyDigest(race.db, now)).catch((e: unknown) =>
        e instanceof Error ? `threw: ${e.message.slice(0, 60)}` : "threw",
      );
    } finally {
      await race.close();
    }
    // Serially (delete, then run), r1 and r3 each get one email and the run
    // succeeds. Here the run tries to record a delivery for the deleted
    // account, fails on the foreign key, and never reaches r3.
    expect({ ran, r1: await digestsTo(r1.email), r3: await digestsTo(r3.email) }).toEqual({
      ran: "OK",
      r1: 1,
      r3: 1,
    });
  });

  it("fixed: an account suspended while the run is under way is still sent the weekly email", async () => {
    const { now, r2 } = await week();
    const admin = await makeAccount({ isAdmin: true, weeklyEmail: false });
    const reporter = await makeAccount({ weeklyEmail: false });
    const report = await createReport(db(), reporter.id, {
      kind: "account",
      targetId: r2.id,
      category: "spam",
    });
    const { runWeeklyDigest } = await import("@/core/digest");
    const race = paused();
    try {
      race.before(statement(/^insert into "digest_deliveries"/i), (other) =>
        suspendAccount(other, admin.id, report.id, { reason: "FICTIONAL suspension reason." }),
      );
      await runWeeklyDigest(race.db, now);
    } finally {
      await race.close();
    }
    const [row] = await db().select().from(accounts).where(eq(accounts.id, r2.id));
    expect(row!.suspendedAt).not.toBeNull();
    // SPEC §8: the weekly email goes to active accounts; SPEC §6: a
    // suspended account can do nothing. The run checked who was active once,
    // before its first recipient, and never again.
    expect(await digestsTo(r2.email)).toBe(0);
  });
});

/* ========================================== the suspension notice email */

describe("suspension notice (SPEC §17 item 14)", () => {
  async function reportedAccount() {
    const admin = await makeAccount({ isAdmin: true });
    const admin2 = await makeAccount({ isAdmin: true });
    const x = await makeAccount({ email: "fictional.suspended@example.test" });
    const r1 = await makeAccount();
    const r2 = await makeAccount();
    const one = await createReport(db(), r1.id, {
      kind: "account",
      targetId: x.id,
      category: "harassment",
    });
    const two = await createReport(db(), r2.id, {
      kind: "account",
      targetId: x.id,
      category: "spam",
    });
    return { admin, admin2, x, one, two };
  }

  it("closed: two administrators suspending the same account at once send exactly one notice, with the reason and the controller's address", async () => {
    const { admin, admin2, x, one, two } = await reportedAccount();
    await Promise.all([
      suspendAccount(db(), admin.id, one.id, { reason: "FICTIONAL reason number one." }),
      suspendAccount(db(), admin2.id, two.id, { reason: "FICTIONAL reason number two." }),
    ]);
    const notices = (await db().select().from(outbox)).filter((m) => m.toAddress === x.email);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe("notice");
    expect(notices[0]!.body).toMatch(/FICTIONAL reason number (one|two)\./);
    expect(notices[0]!.body).toContain("controller@example.test");
    const logged = await db().select().from(mailLog).where(eq(mailLog.kind, "notice"));
    expect(logged).toHaveLength(1);
  });

  it("closed: a refused suspension (not an administrator, the administrator themself, a decided report) sends nothing", async () => {
    const { admin, x, one, two } = await reportedAccount();
    const member = await makeAccount();
    expect(
      await outcome(suspendAccount(db(), member.id, one.id, { reason: "FICTIONAL no power here." })),
    ).toBe("NOT_FOUND");
    const self = await createReport(db(), x.id, {
      kind: "account",
      targetId: admin.id,
      category: "other",
    });
    expect(
      await outcome(suspendAccount(db(), admin.id, self.id, { reason: "FICTIONAL self suspend." })),
    ).toBe("FORBIDDEN");
    await suspendAccount(db(), admin.id, one.id, { reason: "FICTIONAL the real one." });
    expect(
      await outcome(suspendAccount(db(), admin.id, one.id, { reason: "FICTIONAL a second time." })),
    ).toBe("CONFLICT");
    // A second report on an account already suspended: actioned, no second notice.
    await suspendAccount(db(), admin.id, two.id, { reason: "FICTIONAL already suspended." });
    const toX = (await db().select().from(outbox)).filter((m) => m.toAddress === x.email);
    const toAdmin = (await db().select().from(outbox)).filter((m) => m.toAddress === admin.email);
    expect({ toX: toX.length, toAdmin: toAdmin.length }).toEqual({ toX: 1, toAdmin: 0 });
    const [row] = await db().select().from(accounts).where(eq(accounts.id, admin.id));
    expect(row!.suspendedAt).toBeNull();
  });

  it("closed: with no controller named, the notice says the address is not named yet and invents none", async () => {
    const { admin, x, one } = await reportedAccount();
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    await suspendAccount(db(), admin.id, one.id, { reason: "FICTIONAL reason for the notice." });
    const [notice] = (await db().select().from(outbox)).filter((m) => m.toAddress === x.email);
    expect(notice!.body).toContain("the address to write to is not named yet");
    expect(notice!.body).not.toMatch(/write to [^\s]+@/);
    expect(notice!.body).toContain("FICTIONAL reason for the notice.");
  });
});
