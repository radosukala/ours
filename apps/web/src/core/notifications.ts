/**
 * Creating and counting notifications. Listing them and marking them read
 * belong to core/inbox.ts (M3).
 */
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { FRIEND_REQUEST_TTL_DAYS } from "./config";
import type { Db } from "./db";
import { invalid } from "./errors";
import { newId } from "./ids";
import {
  accounts,
  friendRequests,
  type NotificationKind,
  notifications,
} from "./schema";
import { isBlocked } from "./visibility";

const KINDS_WITH_BODY: ReadonlySet<NotificationKind> = new Set([
  "content_removed",
  "report_outcome",
]);

export type NotifyInput = {
  recipientId: string;
  kind: NotificationKind;
  actorId?: string | null;
  postId?: string | null;
  replyId?: string | null;
  reportId?: string | null;
  /** Only for content_removed and report_outcome: the statement of reasons. */
  body?: string | null;
  now?: Date;
};

/**
 * Create a notification. Never notifies you about yourself, and skips
 * silently when there is a block either way between recipient and actor.
 * Returns the new id, or null when skipped.
 */
export async function notify(db: Db, input: NotifyInput): Promise<string | null> {
  const actorId = input.actorId ?? null;
  const body = input.body ?? null;
  if (body !== null && !KINDS_WITH_BODY.has(input.kind)) {
    throw invalid("Only a removal or a report outcome carries a statement.");
  }
  if (actorId !== null) {
    if (actorId === input.recipientId) return null;
    if (await isBlocked(db, input.recipientId, actorId)) return null;
  }
  const id = newId();
  await db.insert(notifications).values({
    id,
    recipientId: input.recipientId,
    kind: input.kind,
    actorId,
    postId: input.postId ?? null,
    replyId: input.replyId ?? null,
    reportId: input.reportId ?? null,
    body,
    createdAt: input.now ?? new Date(),
  });
  return id;
}

/** Unread notifications for the navigation badge. */
export async function countUnread(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, accountId), isNull(notifications.readAt)),
    );
  return row?.n ?? 0;
}

/**
 * Pending, unexpired friend requests to this account from active people
 * with no block either way, for the People badge.
 */
export async function countIncomingRequests(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - FRIEND_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const [row] = await db
    .select({ n: count() })
    .from(friendRequests)
    .innerJoin(accounts, eq(accounts.id, friendRequests.fromId))
    .where(
      and(
        eq(friendRequests.toId, accountId),
        eq(friendRequests.status, "pending"),
        gt(friendRequests.createdAt, cutoff),
        isNull(accounts.suspendedAt),
        sql`not exists (
          select 1 from blocks
          where (blocker_id = ${friendRequests.toId} and blocked_id = ${friendRequests.fromId})
             or (blocker_id = ${friendRequests.fromId} and blocked_id = ${friendRequests.toId})
        )`,
      ),
    );
  return row?.n ?? 0;
}
