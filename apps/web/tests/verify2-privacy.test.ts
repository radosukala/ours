/**
 * INDEPENDENT RE-VERIFICATION (second and final round, SPEC §17 stopping
 * rule) — lens: privacy and authorization (M-0010).
 *
 * Written by a verifier that did not build apps/web and did not write the
 * first round's tests. It re-attacks the code the fixers changed after
 * SPEC §17 (pairLock and the re-checks under it, personShownTo, postPage,
 * /join/confirm and the invite offer, the notifications that are undone)
 * and every place a hidden person or a hidden fact could still come out.
 *
 *   "DEFECT: …"  FAILS on the merged commit: the door is open.
 *   "closed: …"  PASSES: a door that was tried and found shut.
 *
 * Both are kept; a closed door is evidence too. Everyone here is
 * FICTIONAL, with example.test addresses. The factories in ./helpers set up
 * state; the behaviour under test is always a core function, called the
 * way the page or server action named in each test calls it.
 *
 * On the first round's adapted tests (git diff 9c1df35 dafb604 -- tests):
 * the race harnesses in verify-privacy and verify-abuse were re-staged so
 * the block waits for the racer instead of committing inside the racer's
 * pause. Taken alone that would only prove "the block comes second and
 * removes what the write made"; the fixers' connection-fixes.test.ts holds
 * the block first and proves the re-check under the lock, for every write
 * SPEC §17 item 10 names. Together they keep the verifier's meaning. The
 * one write between two people that item 10 does not name, createReply,
 * is attacked below with the same block-first staging.
 *
 * HTTP evidence (not a test; recorded once, 24 September 2026, against
 * `next dev -p 3321` on a throwaway database, outbox transport, FICTIONAL
 * fixtures made with the core functions):
 * - after Vera blocked "me", renamed herself @v2_vera_new, and "me" ran
 *   block(me, veraId) as blockAction does: GET /settings/blocked as "me"
 *   shows @v2_vera_new, while GET /u/v2_vera_new as "me" is 404;
 * - GET /notifications (RSC) as the author of a removed post carries
 *   "reportId":"<the report's ulid>" in the props of NotificationList, a
 *   "use client" component, so it reaches the browser;
 * - GET /i/<code> signed out shows the blocker's new username; the same
 *   URL signed in as the blocked person says the invite can't be used.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { decodeTime } from "ulid";
import { beforeEach, describe, expect, inject, it } from "vitest";
import { changeHandle, deleteAccount } from "@/core/accounts";
import { createPendingJoin } from "@/core/auth";
import {
  acceptFriendRequest,
  block,
  cancelFriendRequest,
  declineFriendRequest,
  listBlocked,
  listRequests,
  sendFriendRequest,
  unblock,
} from "@/core/connections";
import type { Db } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { listNotifications } from "@/core/inbox";
import {
  completeJoin,
  createInvite,
  inviteForViewer,
  inviteOfferForViewer,
  requestJoin,
  revokeInvite,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { countIncomingRequests, countUnread } from "@/core/notifications";
import { createReply, postPage, toggleLike } from "@/core/posts";
import { createReport, removeContent } from "@/core/reports";
import * as schema from "@/core/schema";
import { accounts, emailTokens, notifications, outbox, posts, reports } from "@/core/schema";
import * as fx from "./helpers";
import { db, makeAccount, reset } from "./helpers";

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

/** Whether any session in the test database is waiting on a lock. */
async function someoneWaitsOnALock(): Promise<boolean> {
  const result = await db().execute(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`);
  return Number((result.rows[0] as { n: number }).n) > 0;
}

/**
 * Block-first staging, as in connection-fixes.test.ts: `hold` runs in a
 * transaction on its own connection and is left uncommitted while `racer`
 * starts on the ordinary pool. Once the racer has finished or is waiting on
 * a lock, `hold` commits. Returns how the racer ended and whether it waited.
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

/* ================================================================ DEFECTS */

describe("a person who blocked you must be indistinguishable from nothing (SPEC §2 rule 3, §6, §17 item 11)", () => {
  it("fixed: blocking by id someone who blocked you (or is suspended) puts their current name and handle — even one chosen after the block — in /settings/blocked and the export, while a deleted account leaves nothing", async () => {
    const me = await makeAccount({ handle: "bl_me" });
    const vera = await makeAccount({ handle: "bl_vera_old", displayName: "FICTIONAL Vera" });
    const banned = await makeAccount({ handle: "bl_banned" });
    const leaver = await makeAccount({ handle: "bl_leaver" });
    // I knew all three ids while I could see them (a post's author id, a
    // profile's id bound into its actions).
    await fx.befriend(me, vera);

    // Vera blocks me, then changes her username so I cannot find her.
    await block(db(), vera.id, me.id);
    await changeHandle(db(), vera.id, "bl_vera_new");
    await suspend(banned.id);
    await deleteAccount(db(), leaver.id, "bl_leaver");

    // SPEC §17 item 11: block of a missing account "succeeds and writes
    // nothing, exactly as for someone who blocked you". blockAction takes
    // any id from the browser. The three answers are indeed the same…
    const answers = {
      blocker: await outcome(() => block(db(), me.id, vera.id)),
      suspended: await outcome(() => block(db(), me.id, banned.id)),
      deleted: await outcome(() => block(db(), me.id, leaver.id)),
    };
    expect(answers).toEqual({ blocker: { ok: true }, suspended: { ok: true }, deleted: { ok: true } });

    // …but /settings/blocked (listBlocked) and the export's `blocked` then
    // name the two hidden people, and not the deleted one.
    const page = (await listBlocked(db(), me.id)).map((p) => `${p.displayName} @${p.handle}`);
    const exported = (await exportAccount(db(), me.id)).blocked.map((b) => b.handle);
    expect(
      { page, exported },
      "the blocked list names people whose profile is not found to me, and tells them apart from a deleted account",
    ).toEqual({ page: [], exported: [] });
  });

  it("fixed: the export's invited_by_handle names an inviter who has since blocked you — with the username they chose after the block — or who is suspended, while a deleted inviter is null", async () => {
    const blocker = await makeAccount({ handle: "ib_old", displayName: "FICTIONAL Inviter" });
    const banned = await makeAccount({ handle: "ib_banned" });
    const leaver = await makeAccount({ handle: "ib_leaver" });
    const guestA = await makeAccount({ handle: "ib_guest_a", invitedBy: blocker });
    const guestB = await makeAccount({ handle: "ib_guest_b", invitedBy: banned });
    const guestC = await makeAccount({ handle: "ib_guest_c", invitedBy: leaver });
    await fx.befriend(blocker, guestA);

    await block(db(), blocker.id, guestA.id);
    await changeHandle(db(), blocker.id, "ib_new");
    await suspend(banned.id);
    await deleteAccount(db(), leaver.id, "ib_leaver");

    const invitedBy = {
      blockedMe: (await exportAccount(db(), guestA.id)).account.invited_by_handle,
      suspended: (await exportAccount(db(), guestB.id)).account.invited_by_handle,
      deleted: (await exportAccount(db(), guestC.id)).account.invited_by_handle,
    };
    // SPEC §17 item 11 applies personShownTo to used_by on invites "(list
    // and export)"; the same person seen from the other side is not covered.
    expect(invitedBy).toEqual({ blockedMe: null, suspended: null, deleted: null });
  });

  it("fixed: the export's likes name a suspended author (author_handle), whom every page hides, while a deleted author's likes are gone", async () => {
    const me = await makeAccount({ handle: "lk_me" });
    const banned = await makeAccount({ handle: "lk_banned" });
    await fx.befriend(me, banned);
    const p = await fx.post(banned, { audience: "friends" });
    await toggleLike(db(), me.id, p.id);
    await suspend(banned.id);

    const exported = await exportAccount(db(), me.id);
    // SPEC §6: a suspended account's posts and profile "are hidden from
    // everyone"; §17 item 11 hides a suspended person like a deleted one.
    expect(JSON.stringify(exported.likes)).not.toContain("lk_banned");
  });

  it("fixed: declining or cancelling a friend request answers ok for a suspended person but NOT_FOUND for a deleted one, so it tells a suspension apart from a deletion", async () => {
    const me = await makeAccount({ handle: "rq_me" });
    const banned = await makeAccount({ handle: "rq_banned" });
    const leaver = await makeAccount({ handle: "rq_leaver" });
    const bannedTo = await makeAccount({ handle: "rq_banned_to" });
    const leaverTo = await makeAccount({ handle: "rq_leaver_to" });
    await sendFriendRequest(db(), banned.id, me.id);
    await sendFriendRequest(db(), leaver.id, me.id);
    await sendFriendRequest(db(), me.id, bannedTo.id);
    await sendFriendRequest(db(), me.id, leaverTo.id);
    await suspend(banned.id);
    await suspend(bannedTo.id);
    await deleteAccount(db(), leaver.id, "rq_leaver");
    await deleteAccount(db(), leaverTo.id, "rq_leaver_to");

    // Both requests have left my lists: the two people look the same.
    const lists = await listRequests(db(), me.id);
    expect({ incoming: lists.incoming, outgoing: lists.outgoing }).toEqual({ incoming: [], outgoing: [] });

    // The /people/requests actions take the other person's id.
    const answers = {
      declineSuspended: await outcome(() => declineFriendRequest(db(), me.id, banned.id)),
      declineDeleted: await outcome(() => declineFriendRequest(db(), me.id, leaver.id)),
      cancelSuspended: await outcome(() => cancelFriendRequest(db(), me.id, bannedTo.id)),
      cancelDeleted: await outcome(() => cancelFriendRequest(db(), me.id, leaverTo.id)),
    };
    expect({
      decline: answers.declineSuspended,
      cancel: answers.cancelSuspended,
    }).toEqual({ decline: answers.declineDeleted, cancel: answers.cancelDeleted });
  });

  it("recorded: a person the inviter blocked, holding the inviter's unused invite link, is told 'can't be used' signed in — and signed out sees the inviter's current name and new username, which also proves the block", async () => {
    // RECORDED, not fixed (architect's decision 9). SPEC §8 shows an invite
    // link's inviter to anyone signed out who holds the code; the page
    // cannot know who holds it. The build receipt names this, and the
    // remedy it names is the inviter's own: revoke the unused invite (the
    // last assertion). This test asserts the behaviour as it stands, so a
    // change to it is seen.
    const inviter = await makeAccount({ handle: "iv_old", displayName: "FICTIONAL Inviter" });
    const guest = await makeAccount({ handle: "iv_guest" });
    const { id: inviteId, code } = await createInvite(db(), inviter.id, { note: "FICTIONAL note" });
    // The guest was given the link (a group chat, or before they joined another way).
    await block(db(), inviter.id, guest.id);
    await changeHandle(db(), inviter.id, "iv_new");

    const signedIn = await inviteForViewer(db(), { code, viewerId: guest.id });
    const signedOut = await inviteForViewer(db(), { code, viewerId: null });
    expect(signedIn.kind).toBe("unusable"); // SPEC §8: blocked either way → the generic message
    // The same link in a private window: the one person the block hides the
    // inviter from reads the name and the username chosen after the block.
    expect(
      signedOut.kind === "unusable" ? null : `${signedOut.invite.inviter.displayName} @${signedOut.invite.inviter.handle}`,
    ).toBe("FICTIONAL Inviter @iv_new");
    // The note never leaves the inviter, signed in or out.
    expect(JSON.stringify({ signedIn, signedOut })).not.toContain("FICTIONAL note");

    // The remedy: once the inviter revokes the unused invite, the link shows
    // no one, signed out as well.
    await revokeInvite(db(), inviter.id, inviteId);
    expect((await inviteForViewer(db(), { code, viewerId: null })).kind).toBe("unusable");
  });
});

describe("the username oracle SPEC §17 item 9 accepts, and limits", () => {
  it("fixed: the join form answers 'That username is taken' for any number of tries — the 5-a-day limit on the oracle does not reach completeJoin, so a held handle (a suspended account's too) can be probed without end", async () => {
    // The first round's accepted tests (verify-privacy, verify-identity)
    // were rewritten to assert the limit on changeHandle; the first
    // round's identity report named completeJoin as the oracle's other door.
    const inviter = await makeAccount({ handle: "hp_inviter" });
    const held = [];
    for (let i = 0; i < 7; i++) held.push(await makeAccount({ handle: `hp_held_${i}` }));
    await suspend(held[0]!.id);
    const { id: inviteId } = await createInvite(db(), inviter.id, {});
    const pending = await createPendingJoin(db(), {
      email: "hp_newcomer@example.test",
      inviteId,
    });

    const codes: string[] = [];
    for (const person of held) {
      const r = await outcome(() =>
        completeJoin(db(), {
          pendingJoinId: pending.id,
          displayName: "FICTIONAL Newcomer",
          handle: person.handle,
          adultConfirmed: true,
        }),
      );
      codes.push(r.ok ? "OK" : r.code);
    }
    // Five tries, as for a username change; the sixth and seventh must not
    // say whether the name is held.
    expect(codes.slice(0, 5)).toEqual(["CONFLICT", "CONFLICT", "CONFLICT", "CONFLICT", "CONFLICT"]);
    expect(codes.slice(5), "tries six and seven still answer 'taken'").not.toContain("CONFLICT");
  });
});

describe("the race SPEC §17 item 10 leaves out: a reply and a block", () => {
  it("fixed: a reply written while a block is being made leaves its notification to the blocker behind the block, and unblocking brings it back (createReply takes no pair lock)", async () => {
    const author = await makeAccount({ handle: "rr_author" });
    const replier = await makeAccount({ handle: "rr_replier" });
    await fx.befriend(author, replier);
    const p = await fx.post(author, { audience: "friends", body: "A FICTIONAL post." });

    const { result, waited } = await whileHeld(
      (tx) => block(tx, author.id, replier.id),
      () => createReply(db(), replier.id, p.id, { body: "A FICTIONAL reply." }),
    );
    // Fixed (architect's decision 6): createReply takes the pair lock inside
    // its transaction, so it waits for the block in flight, then checks
    // again under the lock, finds the block and refuses. On the unfixed
    // code the reply passed its check before the block committed and never
    // waited (result ok, waited false).
    expect(result).toEqual({ ok: false, code: "NOT_FOUND", message: "That isn't available." });
    expect(waited, "createReply waits for a block in flight").toBe(true);

    // SPEC §6: the block "deletes notifications whose actor is the other
    // person". Either order, done one after the other, leaves none.
    const acrossTheBlock = await db()
      .select({ kind: notifications.kind })
      .from(notifications)
      .where(and(eq(notifications.recipientId, author.id), eq(notifications.actorId, replier.id)));

    await unblock(db(), author.id, replier.id);
    const afterUnblock = (await listNotifications(db(), author.id)).map(
      (n) => `${n.kind} from @${n.actor?.handle}`,
    );
    expect({ acrossTheBlock, afterUnblock }).toEqual({ acrossTheBlock: [], afterUnblock: [] });
  });
});

describe("postPage's own rule (SPEC §17 item 12)", () => {
  it("fixed: a raw condition with a top-level OR widens postPage past the visibility rule: it is appended without parentheses, so a stranger gets a friends-only post", async () => {
    const author = await makeAccount({ handle: "pw_author" });
    const stranger = await makeAccount({ handle: "pw_stranger" });
    const secret = await fx.post(author, {
      audience: "friends",
      body: "FICTIONAL friends-only text",
    });
    // "Mine, or this author's": a caller narrowing by author the way the
    // feed narrows by mute and window, in raw SQL as feed.ts writes its own.
    const where = sql`${posts.authorId} = ${stranger.id} or ${posts.authorId} = ${author.id}`;
    const page = await postPage(db(), stranger.id, where);
    // The docstring: "`where` can only narrow what the viewer may see, never
    // widen it, so no caller can get a post out of it by forgetting the rule."
    expect(page.items.map((i) => i.body)).not.toContain(secret.body);
  });
});

describe("what the author of removed content receives (reporters are not named to authors)", () => {
  it("fixed: the content_removed notification hands the author the id of the report against them — a ULID that says, to the millisecond, when they were reported", async () => {
    const author = await makeAccount({ handle: "rm_author" });
    const reporter = await makeAccount({ handle: "rm_reporter" });
    const admin = await makeAccount({ handle: "rm_admin", isAdmin: true });
    await fx.befriend(author, reporter);
    const p = await fx.post(author, { audience: "friends" });

    const { id: reportId } = await createReport(db(), reporter.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
    });
    const [filed] = await db().select().from(reports).where(eq(reports.id, reportId));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await removeContent(db(), admin.id, reportId, {
      category: "spam",
      reason: "FICTIONAL statement of reasons.",
    });

    // /notifications passes these views whole to a "use client" component
    // (NotificationList), so every field reaches the author's browser.
    const notice = (await listNotifications(db(), author.id)).find(
      (n) => n.kind === "content_removed",
    )!;
    expect(notice).toBeDefined();
    const leaked = notice.reportId ? decodeTime(notice.reportId) : null;
    expect(
      { reportId: notice.reportId, reportedAtMs: leaked },
      `the report was filed at ${filed!.createdAt.toISOString()}`,
    ).toEqual({ reportId: null, reportedAtMs: null });
  });
});

/* =========================================================== CLOSED DOORS */

describe("closed doors around the changed code", () => {
  it("closed: postPage with drizzle's own or() stays inside the rule (only raw SQL escapes it)", async () => {
    const author = await makeAccount({ handle: "pc_author" });
    const stranger = await makeAccount({ handle: "pc_stranger" });
    await fx.post(author, { audience: "friends", body: "FICTIONAL hidden" });
    const page = await postPage(
      db(),
      stranger.id,
      or(eq(posts.authorId, stranger.id), eq(posts.authorId, author.id)),
    );
    expect(page.items).toEqual([]);
  });

  it("closed: accepting a request from a suspended person is the same NOT_FOUND, word for word, as from a deleted one, and neither is counted in the badge", async () => {
    const me = await makeAccount({ handle: "ac_me" });
    const banned = await makeAccount({ handle: "ac_banned" });
    const leaver = await makeAccount({ handle: "ac_leaver" });
    await sendFriendRequest(db(), banned.id, me.id);
    await sendFriendRequest(db(), leaver.id, me.id);
    await suspend(banned.id);
    await deleteAccount(db(), leaver.id, "ac_leaver");
    expect(await outcome(() => acceptFriendRequest(db(), me.id, banned.id))).toEqual(
      await outcome(() => acceptFriendRequest(db(), me.id, leaver.id)),
    );
    expect(await countIncomingRequests(db(), me.id)).toBe(0);
  });

  it("closed: a join link is never sent to an address whose account the inviter blocked (the other direction of SPEC §17 item 2)", async () => {
    const inviter = await makeAccount({ handle: "jb_inviter" });
    const target = await makeAccount({ handle: "jb_target", email: "jb_target@example.test" });
    const { code } = await createInvite(db(), inviter.id, {});
    await block(db(), inviter.id, target.id);
    await requestJoin(db(), { code, email: "jb_target@example.test", ipHash: rateKeyHash("192.0.2.9") });
    expect(await db().select().from(outbox).where(eq(outbox.toAddress, "jb_target@example.test"))).toEqual([]);
    expect(await db().select().from(emailTokens)).toEqual([]);
  });

  it("closed: the offer behind /join/confirm is the one unusable answer for a blocked viewer, a suspended inviter, a used invite and a foreign id, and never carries the note to anyone but the inviter", async () => {
    const inviter = await makeAccount({ handle: "of_inviter" });
    const guest = await makeAccount({ handle: "of_guest" });
    const blocked = await makeAccount({ handle: "of_blocked" });
    const banned = await makeAccount({ handle: "of_banned" });
    const open = await createInvite(db(), inviter.id, { note: "FICTIONAL secret note" });
    const bannedInvite = await createInvite(db(), banned.id, { note: "FICTIONAL other note" });
    await block(db(), inviter.id, blocked.id);
    await suspend(banned.id);

    const forGuest = await inviteOfferForViewer(db(), { inviteId: open.id, viewerId: guest.id });
    expect(forGuest.kind).toBe("can_add");
    expect(JSON.stringify(forGuest)).not.toContain("FICTIONAL secret note");

    const unusable = [
      await inviteOfferForViewer(db(), { inviteId: open.id, viewerId: blocked.id }),
      await inviteOfferForViewer(db(), { inviteId: bannedInvite.id, viewerId: guest.id }),
      await inviteOfferForViewer(db(), { inviteId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ", viewerId: guest.id }),
      await inviteOfferForViewer(db(), { inviteId: "x' or '1'='1", viewerId: guest.id }),
    ];
    expect(unusable).toEqual([
      { kind: "unusable" },
      { kind: "unusable" },
      { kind: "unusable" },
      { kind: "unusable" },
    ]);
  });

  it("closed: an unlike that meets a block in flight waits for it, finds the post gone, and the like's notification does not come back after unblocking (toggleLike takes the pair lock)", async () => {
    const author = await makeAccount({ handle: "nb_author", acceptsFollowers: true });
    const other = await makeAccount({ handle: "nb_other" });
    await fx.befriend(author, other);
    const p = await fx.post(author, { audience: "friends" });
    await toggleLike(db(), other.id, p.id);
    const { result, waited } = await whileHeld(
      (tx) => block(tx, author.id, other.id),
      () => toggleLike(db(), other.id, p.id),
    );
    // The unlike waits for the block, then finds the post gone.
    expect({ result: result.ok ? "ok" : (result as { code: string }).code, waited }).toEqual({
      result: "NOT_FOUND",
      waited: true,
    });
    await unblock(db(), author.id, other.id);
    expect(await listNotifications(db(), author.id)).toEqual([]);
    expect(await countUnread(db(), author.id)).toBe(0);
  });
});
