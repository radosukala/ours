/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M4 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M4 (safety), which replaces the
 * bodies (SPEC §8 "Report and moderate").
 */
import type { Db } from "./db";
import type { ReportCategory, ReportTargetKind } from "./schema";

const NOT_IMPLEMENTED = "not implemented: M4";

/**
 * Report a post, reply or account. Refused with NOT_FOUND if the reporter
 * cannot see the target. Rate-limited to 20 a day.
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
  throw new Error(NOT_IMPLEMENTED);
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
        author: { id: string; handle: string; displayName: string };
      }
    | {
        kind: "reply";
        id: string;
        postId: string;
        body: string;
        author: { id: string; handle: string; displayName: string };
      }
    | {
        kind: "account";
        id: string;
        handle: string;
        displayName: string;
        bio: string;
      }
    | { kind: "gone" };
};

/** Admins only; anyone else gets NOT_FOUND. Oldest first. */
export async function listOpenReports(
  db: Db,
  adminId: string,
): Promise<OpenReport[]> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Requires a category and a statement of reasons of at least 10 characters. */
export async function removeContent(
  db: Db,
  adminId: string,
  reportId: string,
  input: { category: string; reason: string; now?: Date },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function dismissReport(
  db: Db,
  adminId: string,
  reportId: string,
  input: { note?: string; now?: Date },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Suspend the reported account: sets suspended_at, revokes all sessions and
 * actions the report. Requires a reason of at least 10 characters.
 */
export async function suspendAccount(
  db: Db,
  adminId: string,
  reportId: string,
  input: { reason: string; now?: Date },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}
