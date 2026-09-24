/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M3 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M3 (posts), which replaces the
 * bodies. Creating notifications and counting them is core/notifications.ts.
 */
import type { Db } from "./db";
import type { NotificationKind } from "./schema";

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  createdAt: Date;
  readAt: Date | null;
  actor: { id: string; handle: string; displayName: string } | null;
  postId: string | null;
  replyId: string | null;
  reportId: string | null;
  /** The statement of reasons, for content_removed and report_outcome. */
  body: string | null;
};

/** The newest 100. */
export async function listNotifications(
  db: Db,
  accountId: string,
  input?: { limit?: number },
): Promise<NotificationView[]> {
  throw new Error("not implemented: M3");
}

/** Sets notifications_seen_at and marks all read. */
export async function markAllRead(
  db: Db,
  accountId: string,
  now?: Date,
): Promise<void> {
  throw new Error("not implemented: M3");
}
