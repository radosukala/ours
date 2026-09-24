/**
 * Reports and moderation (SPEC §8 "Report and moderate", §6).
 *
 * REPORTING. A person can report only what they can already see, decided
 * by the foundation's visibility functions (`canSeePost`, `canSeeReply`,
 * `canSeeAccount`) — no second version of the rule is written here. What
 * they cannot see is NOT_FOUND, exactly like something that does not
 * exist. Nobody reports their own content, and each person may file 20
 * reports a day.
 *
 * MODERATION. Only an active administrator reaches the queue or decides; to
 * anyone else every function here answers NOT_FOUND, as for a missing
 * report. The queue shows the reported item regardless of its audience:
 * that is its purpose, and /rules says so. Every decision records who
 * decided and when.
 *
 * - Remove: sets removed_* on the post or reply, which hides it from
 *   everyone through the one predicate; closes every open report on that
 *   item with the same decision; the author gets the statement of reasons
 *   (`content_removed`), each reporter the outcome (`report_outcome`).
 * - Dismiss: closes this report, with an optional note for the reporter.
 * - Suspend: sets suspended_at on the reported account (or the author of
 *   the reported post or reply), revokes all its sessions and actions this
 *   report.
 *
 * Notifications from a decision carry no actor. The person deciding is not
 * named to the author, and a block between the author and the
 * administrator must not swallow a statement of reasons (`notify` skips
 * notifications whose actor is blocked).
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revokeAllSessions } from "./auth";
import { controller } from "./config";
import { type Db, withTx } from "./db";
import { conflict, forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import { hit, RATE } from "./limits";
import { notify } from "./notifications";
import {
  accounts,
  type Audience,
  posts,
  replies,
  REPORT_CATEGORIES,
  REPORT_TARGET_KINDS,
  type Report,
  type ReportCategory,
  type ReportTargetKind,
  reports,
} from "./schema";
import { charCount, validReportDetails } from "./validate";
import {
  canSeeAccount,
  canSeePost,
  canSeeReply,
  isActive,
} from "./visibility";

/* ------------------------------------------------------------------ words */

/** A statement of reasons, or a suspension reason: at least this long. */
export const REASON_MIN = 10;
/** And at most this long. */
export const REASON_MAX = 1000;
/** A dismissal note for the reporter: at most this long. */
export const NOTE_MAX = 500;

/** Category names as a person reads them, in statements and in the queue. */
export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: "Spam",
  harassment: "Harassment",
  illegal: "Illegal content",
  other: "Against the rules",
};

/** The label for a stored category; an unknown value is shown as stored. */
export function categoryLabel(category: string | null | undefined): string {
  if (category && isCategory(category)) return REPORT_CATEGORY_LABELS[category];
  return category ?? "";
}

export function isCategory(value: unknown): value is ReportCategory {
  return (
    typeof value === "string" &&
    (REPORT_CATEGORIES as readonly string[]).includes(value)
  );
}

export function isTargetKind(value: unknown): value is ReportTargetKind {
  return (
    typeof value === "string" &&
    (REPORT_TARGET_KINDS as readonly string[]).includes(value)
  );
}

function withStop(sentence: string): string {
  return /[.!?…]["')\]]?$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * What the author of removed content reads (SPEC §8): "Removed: <category>.
 * <reason>. If you think this is wrong, write to <controller email>."
 *
 * The address is the data controller's. While none is named, the sentence
 * says so instead of inventing one (SPEC §2 rule 6). The notification
 * stores the statement as it was when the decision was made; a post or
 * reply page can build the same text from `removal_category` and
 * `removal_reason` with this function.
 */
export function statementOfReasons(removal: {
  category: string | null;
  reason: string | null;
}): string {
  const label = categoryLabel(removal.category);
  const reason = removal.reason?.trim();
  const email = controller()?.email ?? null;
  const appeal = email
    ? `If you think this is wrong, write to ${email}.`
    : "If you think this is wrong, the address to write to is not named yet.";
  return [
    label ? `Removed: ${withStop(label)}` : "Removed.",
    reason ? withStop(reason) : null,
    appeal,
  ]
    .filter(Boolean)
    .join(" ");
}

const NOUN: Record<ReportTargetKind, string> = {
  post: "post",
  reply: "reply",
  account: "account",
};

function outcomeRemoved(kind: ReportTargetKind, category: ReportCategory): string {
  return `We looked at the ${NOUN[kind]} you reported and removed it. Category: ${REPORT_CATEGORY_LABELS[category]}.`;
}

function outcomeSuspended(kind: ReportTargetKind): string {
  return kind === "account"
    ? "We looked at the account you reported and suspended it."
    : `We looked at the ${NOUN[kind]} you reported and suspended the account that posted it.`;
}

function outcomeDismissed(kind: ReportTargetKind, note: string | null): string {
  const base = `We looked at the ${NOUN[kind]} you reported and didn't remove it.`;
  return note ? `${base} ${withStop(note)}` : base;
}

/* ------------------------------------------------------------------ input */

/** Normalise line endings, drop control characters other than \n and \t, trim. */
function cleanText(input: unknown): string {
  const value = typeof input === "string" ? input : "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function validReason(input: unknown, what: string): string {
  const reason = cleanText(input);
  const n = charCount(reason);
  if (n < REASON_MIN) {
    throw invalid(`Write ${what} of at least ${REASON_MIN} characters.`);
  }
  if (n > REASON_MAX) {
    throw invalid(`Keep ${what} to ${REASON_MAX} characters or fewer.`);
  }
  return reason;
}

function validDismissNote(input: unknown): string | null {
  const note = cleanText(input);
  if (charCount(note) > NOTE_MAX) {
    throw invalid(`A note can be at most ${NOTE_MAX} characters.`);
  }
  return note || null;
}

function idOf(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

/* ----------------------------------------------------------------- targets */

export type ReportAuthor = { id: string; handle: string; displayName: string };

/** The target as the reporter may see it: what the report page shows. */
export type ReportTargetPreview =
  | {
      kind: "post";
      id: string;
      body: string;
      audience: Audience;
      createdAt: Date;
      author: ReportAuthor;
    }
  | {
      kind: "reply";
      id: string;
      postId: string;
      body: string;
      createdAt: Date;
      author: ReportAuthor;
    }
  | {
      kind: "account";
      id: string;
      handle: string;
      displayName: string;
      bio: string;
    };

async function author(db: Db, accountId: string): Promise<ReportAuthor> {
  const [row] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  // The visibility check just found this author active; a row missing now
  // was deleted in between, which is the same as not there.
  if (!row) throw notFound();
  return row;
}

/**
 * The target a person asks to report, if they may report it:
 *
 * - the reporter must be active (a suspended account can do nothing);
 * - a post must pass `canSeePost`; a reply must pass `canSeeReply` (its
 *   post visible, the reply not removed, its author active, no block
 *   either way); an account must pass `canSeeAccount` (active, no block
 *   either way). Otherwise NOT_FOUND, the same as a missing target;
 * - one's own post, reply or account is FORBIDDEN.
 *
 * The report page shows this preview, and `createReport` runs the same
 * check, so the page and the write cannot disagree.
 */
export async function reportTargetPreview(
  db: Db,
  reporterId: string,
  input: { kind: unknown; targetId: unknown },
): Promise<ReportTargetPreview> {
  if (!isTargetKind(input.kind)) throw invalid("Choose what to report.");
  const targetId = idOf(input.targetId);
  if (!(await isActive(db, reporterId))) throw forbidden();
  if (!targetId) throw notFound();

  switch (input.kind) {
    case "post": {
      const post = await canSeePost(db, reporterId, targetId);
      if (!post) throw notFound();
      if (post.authorId === reporterId) {
        throw forbidden("You can't report your own post.");
      }
      return {
        kind: "post",
        id: post.id,
        body: post.body,
        audience: post.audience,
        createdAt: post.createdAt,
        author: await author(db, post.authorId),
      };
    }
    case "reply": {
      const reply = await canSeeReply(db, reporterId, targetId);
      if (!reply) throw notFound();
      if (reply.authorId === reporterId) {
        throw forbidden("You can't report your own reply.");
      }
      return {
        kind: "reply",
        id: reply.id,
        postId: reply.postId,
        body: reply.body,
        createdAt: reply.createdAt,
        author: await author(db, reply.authorId),
      };
    }
    case "account": {
      if (targetId === reporterId) {
        throw forbidden("You can't report yourself.");
      }
      if (!(await canSeeAccount(db, reporterId, targetId))) throw notFound();
      const [row] = await db
        .select({
          id: accounts.id,
          handle: accounts.handle,
          displayName: accounts.displayName,
          bio: accounts.bio,
        })
        .from(accounts)
        .where(eq(accounts.id, targetId))
        .limit(1);
      if (!row) throw notFound();
      return { kind: "account", ...row };
    }
  }
}

/* --------------------------------------------------------------- reporting */

/**
 * Report a post, reply or account. Refused with NOT_FOUND if the reporter
 * cannot see the target, FORBIDDEN for one's own content, INVALID for an
 * unknown category or details over 500 characters, and RATE_LIMITED past
 * 20 reports a day. Only a report that is written counts toward the limit.
 */
export async function createReport(
  db: Db,
  reporterId: string,
  input: {
    kind: ReportTargetKind;
    targetId: string;
    category: ReportCategory;
    details?: string;
    now?: Date;
  },
): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  if (!isCategory(input.category)) {
    throw invalid("Choose why you're reporting this.");
  }
  const details = validReportDetails(input.details ?? "");
  const target = await reportTargetPreview(db, reporterId, {
    kind: input.kind,
    targetId: input.targetId,
  });

  // Outside any transaction of ours, so a refusal is recorded or not on
  // its own (core/limits.hit rolls back with its caller).
  await hit(db, `report:${reporterId}`, { ...RATE.report, now });

  const id = newId();
  await db.insert(reports).values({
    id,
    reporterId,
    targetKind: target.kind,
    targetPostId: target.kind === "post" ? target.id : null,
    targetReplyId: target.kind === "reply" ? target.id : null,
    targetAccountId: target.kind === "account" ? target.id : null,
    category: input.category,
    details,
    status: "open",
    createdAt: now,
  });
  return { id };
}

/* -------------------------------------------------------------- moderation */

/**
 * Anyone who is not an active administrator gets NOT_FOUND, the same as a
 * missing report, before any input is looked at.
 */
async function requireAdmin(db: Db, adminId: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, idOf(adminId)),
        eq(accounts.isAdmin, true),
        isNull(accounts.suspendedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound();
}

/** An open report as the moderation queue shows it. */
export type OpenReport = {
  id: string;
  createdAt: Date;
  category: ReportCategory;
  details: string;
  reporterHandle: string | null;
  target:
    | {
        kind: "post";
        id: string;
        body: string;
        author: { id: string; handle: string; displayName: string; suspended: boolean };
        audience: Audience;
        createdAt: Date;
      }
    | {
        kind: "reply";
        id: string;
        postId: string;
        body: string;
        author: { id: string; handle: string; displayName: string; suspended: boolean };
        createdAt: Date;
      }
    | {
        kind: "account";
        id: string;
        handle: string;
        displayName: string;
        bio: string;
        suspended: boolean;
      }
    | { kind: "gone" };
};

/**
 * Admins only; anyone else gets NOT_FOUND. Open reports, oldest first, each
 * with the reported item regardless of its audience, and the reporter's
 * handle (null once the reporter has deleted their account). A target
 * deleted since the report was filed is `gone`.
 */
export async function listOpenReports(
  db: Db,
  adminId: string,
): Promise<OpenReport[]> {
  await requireAdmin(db, adminId);

  const reporter = alias(accounts, "reporter");
  const postAuthor = alias(accounts, "post_author");
  const replyAuthor = alias(accounts, "reply_author");
  const target = alias(accounts, "target_account");

  const rows = await db
    .select({
      id: reports.id,
      createdAt: reports.createdAt,
      category: reports.category,
      details: reports.details,
      targetKind: reports.targetKind,
      reporterHandle: reporter.handle,

      postId: posts.id,
      postBody: posts.body,
      postAudience: posts.audience,
      postCreatedAt: posts.createdAt,
      postAuthorId: postAuthor.id,
      postAuthorHandle: postAuthor.handle,
      postAuthorName: postAuthor.displayName,
      postAuthorSuspendedAt: postAuthor.suspendedAt,

      replyId: replies.id,
      replyPostId: replies.postId,
      replyBody: replies.body,
      replyCreatedAt: replies.createdAt,
      replyAuthorId: replyAuthor.id,
      replyAuthorHandle: replyAuthor.handle,
      replyAuthorName: replyAuthor.displayName,
      replyAuthorSuspendedAt: replyAuthor.suspendedAt,

      accountId: target.id,
      accountHandle: target.handle,
      accountName: target.displayName,
      accountBio: target.bio,
      accountSuspendedAt: target.suspendedAt,
    })
    .from(reports)
    .leftJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(posts, eq(posts.id, reports.targetPostId))
    .leftJoin(postAuthor, eq(postAuthor.id, posts.authorId))
    .leftJoin(replies, eq(replies.id, reports.targetReplyId))
    .leftJoin(replyAuthor, eq(replyAuthor.id, replies.authorId))
    .leftJoin(target, eq(target.id, reports.targetAccountId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt), asc(reports.id));

  return rows.map((row): OpenReport => {
    let item: OpenReport["target"] = { kind: "gone" };
    if (
      row.targetKind === "post" &&
      row.postId !== null &&
      row.postAuthorId !== null
    ) {
      item = {
        kind: "post",
        id: row.postId,
        body: row.postBody ?? "",
        audience: row.postAudience ?? "friends",
        createdAt: row.postCreatedAt ?? row.createdAt,
        author: {
          id: row.postAuthorId,
          handle: row.postAuthorHandle ?? "",
          displayName: row.postAuthorName ?? "",
          suspended: row.postAuthorSuspendedAt !== null,
        },
      };
    } else if (
      row.targetKind === "reply" &&
      row.replyId !== null &&
      row.replyAuthorId !== null
    ) {
      item = {
        kind: "reply",
        id: row.replyId,
        postId: row.replyPostId ?? "",
        body: row.replyBody ?? "",
        createdAt: row.replyCreatedAt ?? row.createdAt,
        author: {
          id: row.replyAuthorId,
          handle: row.replyAuthorHandle ?? "",
          displayName: row.replyAuthorName ?? "",
          suspended: row.replyAuthorSuspendedAt !== null,
        },
      };
    } else if (row.targetKind === "account" && row.accountId !== null) {
      item = {
        kind: "account",
        id: row.accountId,
        handle: row.accountHandle ?? "",
        displayName: row.accountName ?? "",
        bio: row.accountBio ?? "",
        suspended: row.accountSuspendedAt !== null,
      };
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      category: row.category,
      details: row.details,
      reporterHandle: row.reporterHandle ?? null,
      target: item,
    };
  });
}

/**
 * The report, locked for this decision, if it is still open. Missing is
 * NOT_FOUND; already decided is CONFLICT (two administrators, or a double
 * submit), so a decision is never made twice.
 */
async function lockOpenReport(tx: Db, reportId: string): Promise<Report> {
  const [row] = await tx
    .select()
    .from(reports)
    .where(eq(reports.id, idOf(reportId)))
    .limit(1)
    .for("update");
  if (!row) throw notFound("That report isn't available.");
  if (row.status !== "open") {
    throw conflict("This report has already been decided.");
  }
  return row;
}

/** One `report_outcome` per reporter, however many of their reports closed. */
async function tellReporters(
  tx: Db,
  closed: { id: string; reporterId: string | null }[],
  body: string,
  now: Date,
): Promise<void> {
  const told = new Set<string>();
  for (const report of closed) {
    if (!report.reporterId || told.has(report.reporterId)) continue;
    told.add(report.reporterId);
    await notify(tx, {
      recipientId: report.reporterId,
      kind: "report_outcome",
      reportId: report.id,
      body,
      now,
    });
  }
}

/**
 * Remove the reported post or reply. Requires a category and a statement of
 * reasons of at least 10 characters. Sets removed_* on the item; closes
 * this and every other open report on the same item as actioned, with the
 * same decision; sends the author a `content_removed` notification whose
 * body is the statement of reasons, and each reporter a `report_outcome`.
 */
export async function removeContent(
  db: Db,
  adminId: string,
  reportId: string,
  input: { category: string; reason: string; now?: Date },
): Promise<void> {
  await requireAdmin(db, adminId);
  const now = input.now ?? new Date();
  if (!isCategory(input.category)) {
    throw invalid("Choose a category for the removal.");
  }
  const category = input.category;
  const reason = validReason(input.reason, "a statement of reasons");
  const statement = statementOfReasons({ category, reason });
  const decisionNote = `Removed: ${withStop(REPORT_CATEGORY_LABELS[category])} ${withStop(reason)}`;

  await withTx(db, async (tx) => {
    const report = await lockOpenReport(tx, reportId);
    const decided = {
      status: "actioned" as const,
      decidedBy: adminId,
      decidedAt: now,
      decisionNote,
    };

    if (report.targetKind === "account") {
      throw invalid(
        "An account can't be removed. Suspend it, or dismiss the report.",
      );
    }

    if (report.targetKind === "post") {
      if (!report.targetPostId) throw notFound("The reported post is gone.");
      const [removed] = await tx
        .update(posts)
        .set({
          removedAt: now,
          removalCategory: category,
          removalReason: reason,
        })
        .where(and(eq(posts.id, report.targetPostId), isNull(posts.removedAt)))
        .returning({ id: posts.id, authorId: posts.authorId });
      if (!removed) throw conflict("This post has already been removed.");

      const closed = await tx
        .update(reports)
        .set(decided)
        .where(
          and(
            eq(reports.status, "open"),
            eq(reports.targetKind, "post"),
            eq(reports.targetPostId, removed.id),
          ),
        )
        .returning({ id: reports.id, reporterId: reports.reporterId });

      await notify(tx, {
        recipientId: removed.authorId,
        kind: "content_removed",
        postId: removed.id,
        reportId: report.id,
        body: statement,
        now,
      });
      await tellReporters(tx, closed, outcomeRemoved("post", category), now);
      return;
    }

    if (!report.targetReplyId) throw notFound("The reported reply is gone.");
    const [removed] = await tx
      .update(replies)
      .set({
        removedAt: now,
        removalCategory: category,
        removalReason: reason,
      })
      .where(
        and(eq(replies.id, report.targetReplyId), isNull(replies.removedAt)),
      )
      .returning({
        id: replies.id,
        postId: replies.postId,
        authorId: replies.authorId,
      });
    if (!removed) throw conflict("This reply has already been removed.");

    const closed = await tx
      .update(reports)
      .set(decided)
      .where(
        and(
          eq(reports.status, "open"),
          eq(reports.targetKind, "reply"),
          eq(reports.targetReplyId, removed.id),
        ),
      )
      .returning({ id: reports.id, reporterId: reports.reporterId });

    await notify(tx, {
      recipientId: removed.authorId,
      kind: "content_removed",
      postId: removed.postId,
      replyId: removed.id,
      reportId: report.id,
      body: statement,
      now,
    });
    await tellReporters(tx, closed, outcomeRemoved("reply", category), now);
  });
}

/**
 * Dismiss the report, with an optional note (≤500) that the reporter reads
 * in their `report_outcome`. Only this report is closed.
 */
export async function dismissReport(
  db: Db,
  adminId: string,
  reportId: string,
  input: { note?: string; now?: Date },
): Promise<void> {
  await requireAdmin(db, adminId);
  const now = input.now ?? new Date();
  const note = validDismissNote(input.note);

  await withTx(db, async (tx) => {
    const report = await lockOpenReport(tx, reportId);
    await tx
      .update(reports)
      .set({
        status: "dismissed",
        decidedBy: adminId,
        decidedAt: now,
        decisionNote: note,
      })
      .where(eq(reports.id, report.id));
    await tellReporters(
      tx,
      [report],
      outcomeDismissed(report.targetKind, note),
      now,
    );
  });
}

/** Whose account a report is about: the account, or the content's author. */
async function reportedAccountId(tx: Db, report: Report): Promise<string | null> {
  if (report.targetKind === "account") return report.targetAccountId;
  if (report.targetKind === "post" && report.targetPostId) {
    const [row] = await tx
      .select({ authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, report.targetPostId))
      .limit(1);
    return row?.authorId ?? null;
  }
  if (report.targetKind === "reply" && report.targetReplyId) {
    const [row] = await tx
      .select({ authorId: replies.authorId })
      .from(replies)
      .where(eq(replies.id, report.targetReplyId))
      .limit(1);
    return row?.authorId ?? null;
  }
  return null;
}

/**
 * Suspend the reported account — or the author of the reported post or
 * reply: sets suspended_at (kept if already set), revokes all sessions and
 * actions the report. Requires a reason of at least 10 characters, kept
 * with the decision. An administrator cannot suspend themself.
 */
export async function suspendAccount(
  db: Db,
  adminId: string,
  reportId: string,
  input: { reason: string; now?: Date },
): Promise<void> {
  await requireAdmin(db, adminId);
  const now = input.now ?? new Date();
  const reason = validReason(input.reason, "a reason");

  await withTx(db, async (tx) => {
    const report = await lockOpenReport(tx, reportId);
    const accountId = await reportedAccountId(tx, report);
    if (!accountId) throw notFound("The reported account is gone.");
    if (accountId === adminId) {
      throw forbidden("You can't suspend your own account.");
    }

    const [exists] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1)
      .for("update");
    if (!exists) throw notFound("The reported account is gone.");

    await tx
      .update(accounts)
      .set({ suspendedAt: now })
      .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)));
    await revokeAllSessions(tx, accountId, now);

    await tx
      .update(reports)
      .set({
        status: "actioned",
        decidedBy: adminId,
        decidedAt: now,
        decisionNote: `Suspended: ${withStop(reason)}`,
      })
      .where(eq(reports.id, report.id));
    await tellReporters(tx, [report], outcomeSuspended(report.targetKind), now);
  });
}
