/**
 * Moderation (SPEC §8 "Report and moderate", §6 "Suspension"). Denial
 * paths first: only an active administrator reaches the queue or decides,
 * and anyone else gets the same NOT_FOUND as a missing report. Then what a
 * decision does: removal hides the item from everyone through the one
 * visibility predicate while its author keeps the statement of reasons;
 * suspension revokes every session and hides the account. Everyone here is
 * FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, sessionFromCookie } from "@/core/auth";
import { isCoreError } from "@/core/errors";
import { newId } from "@/core/ids";
import { createReport } from "@/core/reports";
import {
  dismissReport,
  listOpenReports,
  removeContent,
  statementOfReasons,
  suspendAccount,
} from "@/core/reports";
import {
  accounts,
  notifications,
  posts,
  replies,
  type ReportCategory,
  type ReportTargetKind,
  reports,
  sessions,
} from "@/core/schema";
import {
  canSeeAccount,
  canSeePost,
  canSeeReply,
  visiblePostPredicate,
} from "@/core/visibility";
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
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");
const t1 = plus.hours(t0, 2);
const REASON = "FICTIONAL: repeated unwanted advertising.";

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

/** A report fixture, inserted directly (the product's path is createReport). */
async function report(input: {
  reporter: { id: string } | null;
  kind: ReportTargetKind;
  targetId: string;
  category?: ReportCategory;
  details?: string;
  at?: Date;
}): Promise<string> {
  const id = newId();
  await db()
    .insert(reports)
    .values({
      id,
      reporterId: input.reporter?.id ?? null,
      targetKind: input.kind,
      targetPostId: input.kind === "post" ? input.targetId : null,
      targetReplyId: input.kind === "reply" ? input.targetId : null,
      targetAccountId: input.kind === "account" ? input.targetId : null,
      category: input.category ?? "spam",
      details: input.details ?? "",
      createdAt: input.at ?? t0,
    });
  return id;
}

async function reportRow(id: string) {
  const [row] = await db().select().from(reports).where(eq(reports.id, id));
  return row!;
}

async function notificationsFor(accountId: string) {
  return db()
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, accountId));
}

/** A small world: an admin, an author with a friend and a follower, a friends-only post. */
async function world() {
  const admin = await makeAccount({ isAdmin: true, handle: "fic_admin" });
  const author = await makeAccount({ acceptsFollowers: true, handle: "fic_author" });
  const friend = await makeAccount({ handle: "fic_friend" });
  const follower = await makeAccount({ handle: "fic_follower" });
  await befriend(author, friend);
  await follow(follower, author);
  const p = await post(author, {
    audience: "friends",
    body: "A FICTIONAL friends-only post.",
    at: t0,
  });
  return { admin, author, friend, follower, p };
}

/* ------------------------------------------- only an administrator decides */

describe("only an active administrator reaches the moderation queue", () => {
  it("listOpenReports is NOT_FOUND for a member, a missing account and a suspended administrator", async () => {
    const { author, friend, p } = await world();
    await report({ reporter: friend, kind: "post", targetId: p.id });
    const suspendedAdmin = await makeAccount({ isAdmin: true, suspended: true });

    for (const id of [friend.id, author.id, newId(), suspendedAdmin.id]) {
      await expectCode(listOpenReports(db(), id), "NOT_FOUND");
    }
  });

  it("a member cannot remove, dismiss or suspend: NOT_FOUND, the same as a missing report, and nothing changes", async () => {
    const { author, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });
    await createSession(db(), author.id, t0);

    const asMember = [
      () => removeContent(db(), friend.id, reportId, { category: "spam", reason: REASON, now: t1 }),
      () => dismissReport(db(), friend.id, reportId, { note: "FICTIONAL", now: t1 }),
      () => suspendAccount(db(), friend.id, reportId, { reason: REASON, now: t1 }),
      // Invalid input does not reveal the function either: still NOT_FOUND.
      () => removeContent(db(), friend.id, reportId, { category: "nonsense", reason: "short", now: t1 }),
      () => suspendAccount(db(), friend.id, reportId, { reason: "", now: t1 }),
    ];
    for (const attempt of asMember) {
      await expectCode(attempt(), "NOT_FOUND");
    }

    // The report is still open, the post still visible, the author still active.
    expect(await reportRow(reportId)).toMatchObject({
      status: "open",
      decidedBy: null,
      decidedAt: null,
    });
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt).toBeNull();
    const live = await db()
      .select()
      .from(sessions)
      .where(eq(sessions.accountId, author.id));
    expect(live.every((s) => s.revokedAt === null)).toBe(true);
    expect(await notificationsFor(author.id)).toHaveLength(0);
  });

  it("an unknown report is NOT_FOUND, and a decided one is CONFLICT", async () => {
    const { admin, friend, p } = await world();
    for (const attempt of [
      () => removeContent(db(), admin.id, newId(), { category: "spam", reason: REASON, now: t1 }),
      () => dismissReport(db(), admin.id, newId(), { now: t1 }),
      () => suspendAccount(db(), admin.id, newId(), { reason: REASON, now: t1 }),
    ]) {
      await expectCode(attempt(), "NOT_FOUND");
    }

    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });
    await dismissReport(db(), admin.id, reportId, { now: t1 });
    await expectCode(
      removeContent(db(), admin.id, reportId, { category: "spam", reason: REASON, now: t1 }),
      "CONFLICT",
    );
    await expectCode(
      suspendAccount(db(), admin.id, reportId, { reason: REASON, now: t1 }),
      "CONFLICT",
    );
    await expectCode(dismissReport(db(), admin.id, reportId, { now: t1 }), "CONFLICT");
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
  });
});

/* -------------------------------------------------------------- the queue */

describe("listOpenReports", () => {
  it("shows open reports oldest first, with the reported item whatever its audience, and the reporter's handle", async () => {
    const { admin, author, friend, follower, p } = await world();
    // The admin is not the author's friend: the post is hidden from them
    // everywhere else.
    expect(await canSeePost(db(), admin.id, p.id)).toBeNull();

    const r = await reply(p.id, friend.id, "A FICTIONAL reply to report.");
    const newer = await report({
      reporter: follower,
      kind: "account",
      targetId: author.id,
      category: "harassment",
      at: plus.minutes(t0, 30),
    });
    const oldest = await report({
      reporter: friend,
      kind: "post",
      targetId: p.id,
      details: "FICTIONAL details.",
      at: plus.minutes(t0, 10),
    });
    const middle = await report({
      reporter: author,
      kind: "reply",
      targetId: r.id,
      category: "other",
      at: plus.minutes(t0, 20),
    });
    const decided = await report({ reporter: friend, kind: "post", targetId: p.id, at: t0 });
    await db()
      .update(reports)
      .set({ status: "dismissed", decidedBy: admin.id, decidedAt: t0 })
      .where(eq(reports.id, decided));

    const queue = await listOpenReports(db(), admin.id);
    expect(queue.map((q) => q.id)).toEqual([oldest, middle, newer]);

    expect(queue[0]).toMatchObject({
      category: "spam",
      details: "FICTIONAL details.",
      reporterHandle: "fic_friend",
      target: {
        kind: "post",
        id: p.id,
        body: "A FICTIONAL friends-only post.",
        author: { id: author.id, handle: "fic_author" },
      },
    });
    expect(queue[1]).toMatchObject({
      reporterHandle: "fic_author",
      target: {
        kind: "reply",
        id: r.id,
        postId: p.id,
        body: "A FICTIONAL reply to report.",
        author: { id: friend.id, handle: "fic_friend" },
      },
    });
    expect(queue[2]).toMatchObject({
      category: "harassment",
      reporterHandle: "fic_follower",
      target: { kind: "account", id: author.id, handle: "fic_author" },
    });
  });

  it("shows a deleted target as gone, and a deleted reporter as null", async () => {
    const { admin, author, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });

    await db().delete(posts).where(eq(posts.id, p.id));
    await db().delete(accounts).where(eq(accounts.id, friend.id));

    const queue = await listOpenReports(db(), admin.id);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: reportId,
      reporterHandle: null,
      target: { kind: "gone" },
    });
    expect(await reportRow(reportId)).toMatchObject({
      reporterId: null,
      targetPostId: null,
      status: "open",
    });
    // The author is untouched by either deletion.
    expect(await canSeeAccount(db(), admin.id, author.id)).toBe(true);
  });
});

/* ---------------------------------------------------------------- removal */

describe("removeContent", () => {
  it("refuses a statement of reasons shorter than 10 characters, and an unknown category, with INVALID", async () => {
    const { admin, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });

    await expectCode(
      removeContent(db(), admin.id, reportId, { category: "spam", reason: "   too short   ", now: t1 }),
      "INVALID",
    );
    await expectCode(
      removeContent(db(), admin.id, reportId, { category: "spam", reason: "123456789", now: t1 }),
      "INVALID",
    );
    await expectCode(
      removeContent(db(), admin.id, reportId, { category: "rude", reason: REASON, now: t1 }),
      "INVALID",
    );
    await expectCode(
      removeContent(db(), admin.id, reportId, { category: "", reason: REASON, now: t1 }),
      "INVALID",
    );

    expect(await reportRow(reportId)).toMatchObject({ status: "open", decidedBy: null });
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
    expect(await notificationsFor(p.authorId)).toHaveLength(0);
  });

  it("refuses to remove an account (INVALID) and a deleted target (NOT_FOUND)", async () => {
    const { admin, author, friend, p } = await world();
    const accountReport = await report({ reporter: friend, kind: "account", targetId: author.id });
    await expectCode(
      removeContent(db(), admin.id, accountReport, { category: "spam", reason: REASON, now: t1 }),
      "INVALID",
    );

    const postReport = await report({ reporter: friend, kind: "post", targetId: p.id });
    await db().delete(posts).where(eq(posts.id, p.id));
    await expectCode(
      removeContent(db(), admin.id, postReport, { category: "spam", reason: REASON, now: t1 }),
      "NOT_FOUND",
    );
    expect(await reportRow(postReport)).toMatchObject({ status: "open" });
  });

  it("hides the post from everyone through the one predicate, and its author keeps the statement of reasons", async () => {
    const { admin, author, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });

    await removeContent(db(), admin.id, reportId, {
      category: "spam",
      reason: `  ${REASON}  `,
      now: t1,
    });

    // Nobody sees it any more: not a friend, not the author, not the admin.
    for (const viewer of [friend, author, admin]) {
      expect(await canSeePost(db(), viewer.id, p.id)).toBeNull();
      const listed = await db()
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.id, p.id), visiblePostPredicate(viewer.id)));
      expect(listed).toHaveLength(0);
    }

    const [row] = await db().select().from(posts).where(eq(posts.id, p.id));
    expect(row).toMatchObject({ removalCategory: "spam", removalReason: REASON });
    expect(row!.removedAt!.toISOString()).toBe(t1.toISOString());

    // Every decision records who decided and when.
    const decided = await reportRow(reportId);
    expect(decided).toMatchObject({ status: "actioned", decidedBy: admin.id });
    expect(decided.decidedAt!.toISOString()).toBe(t1.toISOString());

    // The author reads the statement in the notification body.
    const toAuthor = await notificationsFor(author.id);
    expect(toAuthor).toHaveLength(1);
    const statement = statementOfReasons({ category: "spam", reason: REASON });
    expect(toAuthor[0]).toMatchObject({
      kind: "content_removed",
      postId: p.id,
      reportId,
      actorId: null,
      body: statement,
    });
    expect(statement).toBe(
      `Removed: Spam. ${REASON} If you think this is wrong, write to controller@example.test.`,
    );

    // The reporter hears the outcome.
    const toReporter = await notificationsFor(friend.id);
    expect(toReporter).toHaveLength(1);
    expect(toReporter[0]).toMatchObject({
      kind: "report_outcome",
      reportId,
      actorId: null,
      postId: null,
    });
    expect(toReporter[0]!.body).toMatch(/removed/i);

    // And the report has left the queue.
    expect(await listOpenReports(db(), admin.id)).toHaveLength(0);
  });

  it("closes every other open report on the same item with the same decision", async () => {
    const { admin, author, friend, follower, p } = await world();
    const third = await makeAccount();
    await befriend(author, third);
    const otherPost = await post(author, { at: t0 });

    const first = await report({ reporter: friend, kind: "post", targetId: p.id, at: t0 });
    const second = await report({ reporter: third, kind: "post", targetId: p.id, at: plus.minutes(t0, 1) });
    const sameReporterAgain = await report({ reporter: third, kind: "post", targetId: p.id, at: plus.minutes(t0, 2) });
    const alreadyDismissed = await report({ reporter: follower, kind: "post", targetId: p.id, at: plus.minutes(t0, 3) });
    await db()
      .update(reports)
      .set({ status: "dismissed", decidedBy: admin.id, decidedAt: t0, decisionNote: "earlier" })
      .where(eq(reports.id, alreadyDismissed));
    const unrelated = await report({ reporter: friend, kind: "post", targetId: otherPost.id });
    const aboutTheAuthor = await report({ reporter: friend, kind: "account", targetId: author.id });

    await removeContent(db(), admin.id, second, { category: "harassment", reason: REASON, now: t1 });

    const closed = await Promise.all([first, second, sameReporterAgain].map(reportRow));
    for (const row of closed) {
      expect(row).toMatchObject({
        status: "actioned",
        decidedBy: admin.id,
        decisionNote: closed[1]!.decisionNote,
      });
      expect(row.decidedAt!.toISOString()).toBe(t1.toISOString());
    }
    expect(await reportRow(alreadyDismissed)).toMatchObject({
      status: "dismissed",
      decisionNote: "earlier",
    });
    expect(await reportRow(unrelated)).toMatchObject({ status: "open" });
    expect(await reportRow(aboutTheAuthor)).toMatchObject({ status: "open" });

    // One outcome per reporter, and one statement to the author.
    expect(await notificationsFor(friend.id)).toHaveLength(1);
    expect(await notificationsFor(third.id)).toHaveLength(1);
    expect(await notificationsFor(follower.id)).toHaveLength(0);
    expect(await notificationsFor(author.id)).toHaveLength(1);

    expect((await listOpenReports(db(), admin.id)).map((q) => q.id).sort()).toEqual(
      [unrelated, aboutTheAuthor].sort(),
    );
  });

  it("removes a reply: hidden from everyone, its author notified with the statement", async () => {
    const { admin, author, friend, p } = await world();
    const r = await reply(p.id, friend.id);
    const reportId = await report({ reporter: author, kind: "reply", targetId: r.id });
    const duplicate = await report({ reporter: author, kind: "reply", targetId: r.id });
    const aboutThePost = await report({ reporter: friend, kind: "post", targetId: p.id });

    await removeContent(db(), admin.id, reportId, { category: "harassment", reason: REASON, now: t1 });

    for (const viewer of [author, friend]) {
      expect(await canSeeReply(db(), viewer.id, r.id)).toBeNull();
    }
    // The post itself is untouched.
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();

    const [row] = await db().select().from(replies).where(eq(replies.id, r.id));
    expect(row).toMatchObject({ removalCategory: "harassment", removalReason: REASON });

    const toReplier = await notificationsFor(friend.id);
    expect(toReplier).toHaveLength(1);
    expect(toReplier[0]).toMatchObject({
      kind: "content_removed",
      replyId: r.id,
      postId: p.id,
      body: statementOfReasons({ category: "harassment", reason: REASON }),
    });
    expect(await reportRow(duplicate)).toMatchObject({ status: "actioned", decidedBy: admin.id });
    expect(await reportRow(aboutThePost)).toMatchObject({ status: "open" });
  });

  it("reaches an author who has blocked the administrator", async () => {
    const { admin, author, friend, p } = await world();
    await block(author, admin);
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });

    await removeContent(db(), admin.id, reportId, { category: "spam", reason: REASON, now: t1 });

    const toAuthor = await notificationsFor(author.id);
    expect(toAuthor).toHaveLength(1);
    expect(toAuthor[0]!.kind).toBe("content_removed");
  });

  it("says plainly when no address for appeals is named, instead of inventing one", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const statement = statementOfReasons({ category: "illegal", reason: "FICTIONAL reason" });
    expect(statement).toMatch(/^Removed: Illegal content\. FICTIONAL reason\. /);
    expect(statement).not.toMatch(/@/);
    expect(statement).toMatch(/not named yet/);
  });
});

/* ---------------------------------------------------------------- dismiss */

describe("dismissReport", () => {
  it("dismisses with an optional note, records who and when, tells the reporter, and leaves the content", async () => {
    const { admin, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });
    const duplicate = await report({ reporter: friend, kind: "post", targetId: p.id });

    await dismissReport(db(), admin.id, reportId, {
      note: "  FICTIONAL: this is within the rules.  ",
      now: t1,
    });

    const row = await reportRow(reportId);
    expect(row).toMatchObject({
      status: "dismissed",
      decidedBy: admin.id,
      decisionNote: "FICTIONAL: this is within the rules.",
    });
    expect(row.decidedAt!.toISOString()).toBe(t1.toISOString());
    // Only this report: a dismissal does not decide anyone else's.
    expect(await reportRow(duplicate)).toMatchObject({ status: "open" });
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();

    const toReporter = await notificationsFor(friend.id);
    expect(toReporter).toHaveLength(1);
    expect(toReporter[0]).toMatchObject({ kind: "report_outcome", reportId });
    expect(toReporter[0]!.body).toContain("FICTIONAL: this is within the rules.");
    expect(await notificationsFor(p.authorId)).toHaveLength(0);
  });

  it("works without a note, and refuses a note over 500 characters", async () => {
    const { admin, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });

    await expectCode(
      dismissReport(db(), admin.id, reportId, { note: "x".repeat(501), now: t1 }),
      "INVALID",
    );
    expect(await reportRow(reportId)).toMatchObject({ status: "open" });

    await dismissReport(db(), admin.id, reportId, { now: t1 });
    expect(await reportRow(reportId)).toMatchObject({
      status: "dismissed",
      decidedBy: admin.id,
      decisionNote: null,
    });
  });

  it("decides a report whose reporter has deleted their account, notifying nobody", async () => {
    const { admin, friend, p } = await world();
    const reportId = await report({ reporter: friend, kind: "post", targetId: p.id });
    await db().delete(accounts).where(eq(accounts.id, friend.id));

    await dismissReport(db(), admin.id, reportId, { now: t1 });
    expect(await reportRow(reportId)).toMatchObject({
      status: "dismissed",
      reporterId: null,
      decidedBy: admin.id,
    });
    expect(await db().select().from(notifications)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- suspension */

describe("suspendAccount", () => {
  it("refuses a reason shorter than 10 characters with INVALID", async () => {
    const { admin, author, friend } = await world();
    const reportId = await report({ reporter: friend, kind: "account", targetId: author.id });

    await expectCode(
      suspendAccount(db(), admin.id, reportId, { reason: " too short ", now: t1 }),
      "INVALID",
    );
    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt).toBeNull();
    expect(await reportRow(reportId)).toMatchObject({ status: "open" });
  });

  it("sets suspended_at, revokes every session, hides the account and its content, and actions the report", async () => {
    const { admin, author, friend, follower, p } = await world();
    const followersPost = await post(author, { audience: "followers", at: t0 });
    const r = await reply(p.id, author.id, "A FICTIONAL reply by the author.");
    const s1 = await createSession(db(), author.id, t0);
    const s2 = await createSession(db(), author.id, t0);
    const friendSession = await createSession(db(), friend.id, t0);
    const reportId = await report({ reporter: friend, kind: "account", targetId: author.id });

    // Before: all visible.
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
    expect(await canSeePost(db(), follower.id, followersPost.id)).not.toBeNull();

    await suspendAccount(db(), admin.id, reportId, { reason: REASON, now: t1 });

    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt!.toISOString()).toBe(t1.toISOString());

    // Every session of the account is revoked, and none works.
    const rows = await db().select().from(sessions).where(eq(sessions.accountId, author.id));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.revokedAt!.toISOString()).toBe(t1.toISOString());
    expect(await sessionFromCookie(db(), s1.cookieValue, t1)).toBeNull();
    expect(await sessionFromCookie(db(), s2.cookieValue, t1)).toBeNull();
    // Someone else's session is untouched.
    expect(await sessionFromCookie(db(), friendSession.cookieValue, t1)).toBe(friend.id);

    // Posts, replies and profile are hidden from everyone.
    expect(await canSeePost(db(), friend.id, p.id)).toBeNull();
    expect(await canSeePost(db(), follower.id, followersPost.id)).toBeNull();
    expect(await canSeeReply(db(), friend.id, r.id)).toBeNull();
    expect(await canSeeAccount(db(), friend.id, author.id)).toBe(false);

    // The decision is recorded, and the reporter hears the outcome.
    const decided = await reportRow(reportId);
    expect(decided).toMatchObject({ status: "actioned", decidedBy: admin.id });
    expect(decided.decidedAt!.toISOString()).toBe(t1.toISOString());
    expect(decided.decisionNote).toContain(REASON);
    const toReporter = await notificationsFor(friend.id);
    expect(toReporter).toHaveLength(1);
    expect(toReporter[0]).toMatchObject({ kind: "report_outcome", reportId });
  });

  it("from a report on a post or a reply, suspends that content's author", async () => {
    const { admin, author, friend, p } = await world();
    const r = await reply(p.id, friend.id);
    const postReport = await report({ reporter: friend, kind: "post", targetId: p.id });
    const replyReport = await report({ reporter: author, kind: "reply", targetId: r.id });

    await suspendAccount(db(), admin.id, postReport, { reason: REASON, now: t1 });
    await suspendAccount(db(), admin.id, replyReport, { reason: REASON, now: t1 });

    const rows = await db().select().from(accounts);
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(author.id)!.suspendedAt).not.toBeNull();
    expect(byId.get(friend.id)!.suspendedAt).not.toBeNull();
    expect(byId.get(admin.id)!.suspendedAt).toBeNull();
  });

  it("keeps the first suspension time when the account is already suspended", async () => {
    const { admin, author, friend } = await world();
    const first = await report({ reporter: friend, kind: "account", targetId: author.id });
    const second = await report({ reporter: friend, kind: "account", targetId: author.id });

    await suspendAccount(db(), admin.id, first, { reason: REASON, now: t1 });
    await suspendAccount(db(), admin.id, second, { reason: REASON, now: plus.hours(t1, 1) });

    const [a] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(a!.suspendedAt!.toISOString()).toBe(t1.toISOString());
    expect(await reportRow(second)).toMatchObject({ status: "actioned", decidedBy: admin.id });
  });

  it("refuses to suspend the deciding administrator (FORBIDDEN) or a deleted account (NOT_FOUND)", async () => {
    const { admin, friend } = await world();
    const aboutAdmin = await report({ reporter: friend, kind: "account", targetId: admin.id });
    await expectCode(
      suspendAccount(db(), admin.id, aboutAdmin, { reason: REASON, now: t1 }),
      "FORBIDDEN",
    );
    const [a] = await db().select().from(accounts).where(eq(accounts.id, admin.id));
    expect(a!.suspendedAt).toBeNull();

    const gone = await makeAccount();
    const aboutGone = await report({ reporter: friend, kind: "account", targetId: gone.id });
    await db().delete(accounts).where(eq(accounts.id, gone.id));
    await expectCode(
      suspendAccount(db(), admin.id, aboutGone, { reason: REASON, now: t1 }),
      "NOT_FOUND",
    );
    expect(await reportRow(aboutGone)).toMatchObject({ status: "open" });
  });
});

/* ------------------------------ deleting the content does not escape review */

describe("a post deleted before review", () => {
  it("still lets an administrator suspend its author, and the queue names who posted it", async () => {
    const { admin, author, friend, p } = await world();
    const { id } = await createReport(db(), friend.id, {
      kind: "post",
      targetId: p.id,
      category: "harassment",
      now: t0,
    });
    // The author deletes the post before anyone looks.
    await db().delete(posts).where(eq(posts.id, p.id));

    const [open] = await listOpenReports(db(), admin.id);
    expect(open?.target.kind).toBe("gone");
    expect(open?.target.kind === "gone" ? open.target.author?.id : null).toBe(author.id);

    await suspendAccount(db(), admin.id, id, { reason: REASON, now: t1 });
    const [row] = await db().select().from(accounts).where(eq(accounts.id, author.id));
    expect(row?.suspendedAt).not.toBeNull();
    expect((await reportRow(id)).status).toBe("actioned");
  });
});
