/**
 * Reporting (SPEC §8 "Report and moderate", §6). Denial paths first: a
 * person can report only what they can already see, never their own
 * content, and not more than 20 times a day. Everyone here is FICTIONAL.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { isCoreError } from "@/core/errors";
import { newId } from "@/core/ids";
import {
  createReport,
  reportTargetPreview,
} from "@/core/reports";
import { accounts, posts, rateEvents, replies, reports } from "@/core/schema";
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

const t0 = at("2026-09-01T12:00:00Z");

async function refusal(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    const e = error as { code: string; message: string };
    return { code: e.code, message: e.message };
  }
  throw new Error("expected a CoreError, but it resolved");
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect((await refusal(promise)).code).toBe(code);
}

async function reply(postId: string, authorId: string, body = "A FICTIONAL reply.") {
  const [row] = await db()
    .insert(replies)
    .values({ id: newId(), postId, authorId, body, createdAt: t0 })
    .returning();
  return row!;
}

async function suspend(accountId: string) {
  await db()
    .update(accounts)
    .set({ suspendedAt: t0 })
    .where(eq(accounts.id, accountId));
}

async function reportCount(): Promise<number> {
  return (await db().select({ id: reports.id }).from(reports)).length;
}

/** The refusal for a target that does not exist at all. */
async function missingRefusal(reporterId: string, kind: "post" | "reply" | "account") {
  return refusal(
    createReport(db(), reporterId, {
      kind,
      targetId: newId(),
      category: "spam",
      now: t0,
    }),
  );
}

/* ------------------------------------------- cannot report what you cannot see */

describe("createReport refuses what the reporter cannot see, exactly as if it were missing", () => {
  it("a stranger's friends-only post is NOT_FOUND, with the same message as a missing post", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends", at: t0 });

    const hidden = await refusal(
      createReport(db(), stranger.id, { kind: "post", targetId: p.id, category: "spam", now: t0 }),
    );
    const missing = await missingRefusal(stranger.id, "post");

    expect(hidden.code).toBe("NOT_FOUND");
    expect(hidden).toEqual(missing);
    expect(await reportCount()).toBe(0);
  });

  it("a followers post is NOT_FOUND to someone who does not follow, and to a follower of an account that stopped accepting followers", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const outsider = await makeAccount();
    const follower = await makeAccount();
    await follow(follower, author);
    const p = await post(author, { audience: "followers", at: t0 });

    await expectCode(
      createReport(db(), outsider.id, { kind: "post", targetId: p.id, category: "spam", now: t0 }),
      "NOT_FOUND",
    );

    await db()
      .update(accounts)
      .set({ acceptsFollowers: false })
      .where(eq(accounts.id, author.id));
    await expectCode(
      createReport(db(), follower.id, { kind: "post", targetId: p.id, category: "spam", now: t0 }),
      "NOT_FOUND",
    );
    expect(await reportCount()).toBe(0);
  });

  it("a friend's post is NOT_FOUND when a block exists in either direction", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    const other = await makeAccount();
    await befriend(author, friend);
    await befriend(author, other);
    const p = await post(author, { audience: "friends", at: t0 });

    await block(author, friend); // the author blocked the reporter
    await block(other, author); // the reporter blocked the author

    for (const reporter of [friend, other]) {
      const hidden = await refusal(
        createReport(db(), reporter.id, { kind: "post", targetId: p.id, category: "harassment", now: t0 }),
      );
      expect(hidden).toEqual(await missingRefusal(reporter.id, "post"));
    }
    expect(await reportCount()).toBe(0);
  });

  it("a removed post and a suspended author's post are NOT_FOUND", async () => {
    const author = await makeAccount();
    const suspended = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    await befriend(suspended, friend);
    const removed = await post(author, { at: t0 });
    await db()
      .update(posts)
      .set({ removedAt: t0, removalCategory: "spam", removalReason: "FICTIONAL reason." })
      .where(eq(posts.id, removed.id));
    const bySuspended = await post(suspended, { at: t0 });
    await suspend(suspended.id);

    for (const target of [removed, bySuspended]) {
      await expectCode(
        createReport(db(), friend.id, { kind: "post", targetId: target.id, category: "spam", now: t0 }),
        "NOT_FOUND",
      );
    }
    expect(await reportCount()).toBe(0);
  });

  it("a reply is NOT_FOUND when its post is hidden from the reporter", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    const stranger = await makeAccount();
    await befriend(author, replier);
    await befriend(replier, stranger); // a friend of the replier, not of the author
    const p = await post(author, { audience: "friends", at: t0 });
    const r = await reply(p.id, replier.id);

    const hidden = await refusal(
      createReport(db(), stranger.id, { kind: "reply", targetId: r.id, category: "spam", now: t0 }),
    );
    expect(hidden).toEqual(await missingRefusal(stranger.id, "reply"));
  });

  it("a reply is NOT_FOUND when it is removed, its author is suspended, or a block exists with its author", async () => {
    const author = await makeAccount();
    const reporter = await makeAccount();
    const replierA = await makeAccount();
    const replierB = await makeAccount();
    const replierC = await makeAccount();
    const replierD = await makeAccount();
    for (const x of [reporter, replierA, replierB, replierC, replierD]) {
      await befriend(author, x);
    }
    const p = await post(author, { audience: "friends", at: t0 });

    const removed = await reply(p.id, replierA.id);
    await db()
      .update(replies)
      .set({ removedAt: t0, removalCategory: "spam", removalReason: "FICTIONAL reason." })
      .where(eq(replies.id, removed.id));
    const bySuspended = await reply(p.id, replierB.id);
    await suspend(replierB.id);
    const blockedByReporter = await reply(p.id, replierC.id);
    await block(reporter, replierC);
    const blockingReporter = await reply(p.id, replierD.id);
    await block(replierD, reporter);

    for (const r of [removed, bySuspended, blockedByReporter, blockingReporter]) {
      await expectCode(
        createReport(db(), reporter.id, { kind: "reply", targetId: r.id, category: "spam", now: t0 }),
        "NOT_FOUND",
      );
    }
    expect(await reportCount()).toBe(0);
  });

  it("an account is NOT_FOUND when missing, suspended, or blocked in either direction", async () => {
    const reporter = await makeAccount();
    const suspended = await makeAccount({ suspended: true });
    const blockedByReporter = await makeAccount();
    const blockingReporter = await makeAccount();
    await block(reporter, blockedByReporter);
    await block(blockingReporter, reporter);

    const missing = await missingRefusal(reporter.id, "account");
    expect(missing.code).toBe("NOT_FOUND");
    for (const target of [suspended, blockedByReporter, blockingReporter]) {
      const hidden = await refusal(
        createReport(db(), reporter.id, { kind: "account", targetId: target.id, category: "harassment", now: t0 }),
      );
      expect(hidden).toEqual(missing);
    }
    expect(await reportCount()).toBe(0);
  });

  it("the report page's preview is refused the same way", async () => {
    const author = await makeAccount();
    const stranger = await makeAccount();
    const p = await post(author, { audience: "friends", at: t0 });

    const hidden = await refusal(
      reportTargetPreview(db(), stranger.id, { kind: "post", targetId: p.id }),
    );
    const missing = await refusal(
      reportTargetPreview(db(), stranger.id, { kind: "post", targetId: newId() }),
    );
    expect(hidden.code).toBe("NOT_FOUND");
    expect(hidden).toEqual(missing);
  });
});

/* ------------------------------------------------- cannot report own content */

describe("createReport refuses your own content", () => {
  it("your own post, your own reply and your own account are FORBIDDEN", async () => {
    const me = await makeAccount();
    const friend = await makeAccount();
    await befriend(me, friend);
    const mine = await post(me, { at: t0 });
    const theirs = await post(friend, { at: t0 });
    const myReply = await reply(theirs.id, me.id);

    await expectCode(
      createReport(db(), me.id, { kind: "post", targetId: mine.id, category: "spam", now: t0 }),
      "FORBIDDEN",
    );
    await expectCode(
      createReport(db(), me.id, { kind: "reply", targetId: myReply.id, category: "spam", now: t0 }),
      "FORBIDDEN",
    );
    await expectCode(
      createReport(db(), me.id, { kind: "account", targetId: me.id, category: "spam", now: t0 }),
      "FORBIDDEN",
    );
    await expectCode(
      reportTargetPreview(db(), me.id, { kind: "post", targetId: mine.id }),
      "FORBIDDEN",
    );
    expect(await reportCount()).toBe(0);
  });
});

/* ---------------------------------------------------------------- the input */

describe("createReport checks its input", () => {
  it("refuses an unknown category or kind, and details over 500 characters, with INVALID", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { at: t0 });

    await expectCode(
      createReport(db(), friend.id, {
        kind: "post",
        targetId: p.id,
        category: "boring" as never,
        now: t0,
      }),
      "INVALID",
    );
    await expectCode(
      createReport(db(), friend.id, {
        kind: "comment" as never,
        targetId: p.id,
        category: "spam",
        now: t0,
      }),
      "INVALID",
    );
    await expectCode(
      createReport(db(), friend.id, {
        kind: "post",
        targetId: p.id,
        category: "spam",
        details: "x".repeat(501),
        now: t0,
      }),
      "INVALID",
    );
    expect(await reportCount()).toBe(0);

    // Exactly 500 is allowed.
    await createReport(db(), friend.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
      details: "x".repeat(500),
      now: t0,
    });
    expect(await reportCount()).toBe(1);
  });

  it("refuses a suspended or missing reporter", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { at: t0 });
    await suspend(friend.id);

    await expectCode(
      createReport(db(), friend.id, { kind: "post", targetId: p.id, category: "spam", now: t0 }),
      "FORBIDDEN",
    );
    await expectCode(
      createReport(db(), newId(), { kind: "account", targetId: author.id, category: "spam", now: t0 }),
      "FORBIDDEN",
    );
    expect(await reportCount()).toBe(0);
  });
});

/* --------------------------------------------------------------- rate limit */

describe("createReport is rate-limited to 20 a day", () => {
  it("refuses the 21st report within 24 hours with RATE_LIMITED, and allows one again after", async () => {
    const author = await makeAccount();
    const reporter = await makeAccount();
    await befriend(author, reporter);
    const p = await post(author, { at: t0 });

    for (let i = 0; i < 20; i++) {
      await createReport(db(), reporter.id, {
        kind: "post",
        targetId: p.id,
        category: "spam",
        now: plus.minutes(t0, i),
      });
    }
    await expectCode(
      createReport(db(), reporter.id, {
        kind: "post",
        targetId: p.id,
        category: "spam",
        now: plus.hours(t0, 23),
      }),
      "RATE_LIMITED",
    );
    expect(await reportCount()).toBe(20);

    // Another person is not affected by this reporter's limit.
    const other = await makeAccount();
    await befriend(author, other);
    await createReport(db(), other.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
      now: plus.hours(t0, 23),
    });

    // A day after the first ones, the window has moved on.
    await createReport(db(), reporter.id, {
      kind: "post",
      targetId: p.id,
      category: "spam",
      now: plus.hours(t0, 24),
    });
    expect(await reportCount()).toBe(22);
  });

  it("counts under the key report:<accountId>", async () => {
    const author = await makeAccount();
    const reporter = await makeAccount();
    await befriend(author, reporter);
    const p = await post(author, { at: t0 });
    await createReport(db(), reporter.id, { kind: "post", targetId: p.id, category: "spam", now: t0 });

    const keys = await db().select({ key: rateEvents.key }).from(rateEvents);
    expect(keys.map((k) => k.key)).toEqual([`report:${reporter.id}`]);
  });
});

/* ---------------------------------------------------------------- happy path */

describe("createReport records what can be seen", () => {
  it("a friend reports a friends-only post: an open report naming the post", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { audience: "friends", at: t0 });

    const { id } = await createReport(db(), friend.id, {
      kind: "post",
      targetId: p.id,
      category: "harassment",
      details: "  FICTIONAL details.  ",
      now: t0,
    });
    const [row] = await db().select().from(reports).where(eq(reports.id, id));
    expect(row).toMatchObject({
      reporterId: friend.id,
      targetKind: "post",
      targetPostId: p.id,
      targetReplyId: null,
      // The author is recorded too, so deleting the post before review does
      // not remove the account from moderation (architect decision).
      targetAccountId: author.id,
      category: "harassment",
      details: "FICTIONAL details.",
      status: "open",
      decidedBy: null,
      decidedAt: null,
    });
    expect(row!.createdAt.toISOString()).toBe(t0.toISOString());
  });

  it("a follower reports a followers post; a visible reply and a visible account can be reported", async () => {
    const author = await makeAccount({ acceptsFollowers: true });
    const follower = await makeAccount();
    const replier = await makeAccount();
    await follow(follower, author);
    await befriend(author, replier);
    const p = await post(author, { audience: "followers", at: t0 });
    const r = await reply(p.id, replier.id);

    const a = await createReport(db(), follower.id, { kind: "post", targetId: p.id, category: "spam", now: t0 });
    const b = await createReport(db(), follower.id, { kind: "reply", targetId: r.id, category: "other", now: t0 });
    const c = await createReport(db(), follower.id, { kind: "account", targetId: replier.id, category: "illegal", now: t0 });

    const rows = await db().select().from(reports);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(a.id)).toMatchObject({ targetKind: "post", targetPostId: p.id });
    expect(byId.get(b.id)).toMatchObject({ targetKind: "reply", targetReplyId: r.id, targetPostId: null });
    expect(byId.get(c.id)).toMatchObject({ targetKind: "account", targetAccountId: replier.id });
  });

  it("the preview shows the target as the reporter may see it", async () => {
    const author = await makeAccount({ displayName: "FICTIONAL Nora Vell" });
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author, { body: "A FICTIONAL post to report.", at: t0 });

    const preview = await reportTargetPreview(db(), friend.id, { kind: "post", targetId: p.id });
    expect(preview).toMatchObject({
      kind: "post",
      id: p.id,
      body: "A FICTIONAL post to report.",
      author: { id: author.id, handle: author.handle, displayName: "FICTIONAL Nora Vell" },
    });
  });
});

/* ---------------------------------------------------------- reporter deleted */

describe("a reporter who deletes their account", () => {
  it("leaves the report in place with the reporter set to null", async () => {
    const author = await makeAccount();
    const reporter = await makeAccount();
    await befriend(author, reporter);
    const p = await post(author, { at: t0 });
    const reportId = newId();
    await db().insert(reports).values({
      id: reportId,
      reporterId: reporter.id,
      targetKind: "post",
      targetPostId: p.id,
      category: "spam",
      createdAt: t0,
    });

    await db().delete(accounts).where(eq(accounts.id, reporter.id));

    const [row] = await db().select().from(reports).where(eq(reports.id, reportId));
    expect(row).toMatchObject({ reporterId: null, status: "open", targetPostId: p.id });
  });
});
