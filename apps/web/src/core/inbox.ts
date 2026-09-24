/**
 * Reading notifications (SPEC §8 "Notifications"). Creating and counting
 * them is core/notifications.ts (the foundation).
 *
 * A notification points at things that may since have become invisible to
 * its recipient: a friendship ended, a post was removed, an actor was
 * suspended or blocked. So the text of a post or reply is included only
 * while the recipient can still see it, through the same predicates as
 * every other read (core/visibility.ts), or when it is the recipient's own.
 */
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Db, withTx } from "./db";
import { accounts, type NotificationKind, notifications, posts, replies } from "./schema";
import { personShownTo } from "./posts";
import { visiblePostPredicate, visibleReplyPredicate } from "./visibility";

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
  /**
   * The post to open for this notification (its post, or its reply's
   * post), only while the recipient may open it: they can see it, or it is
   * their own (an author sees their own removed post). Otherwise null.
   */
  linkPostId: string | null;
  /** The start of that post's text, under the same condition; else null. */
  postSnippet: string | null;
  /** The start of the reply's text, only while the recipient can see it or wrote it. */
  replySnippet: string | null;
};

/** The newest this many (SPEC §8). */
export const NOTIFICATIONS_MAX = 100;
/** Characters of a post or reply shown in a notification. */
export const SNIPPET_MAX = 120;

/** Whitespace collapsed, cut at SNIPPET_MAX characters with an ellipsis. */
export function snippet(text: string | null): string | null {
  if (text === null) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > SNIPPET_MAX
    ? `${chars.slice(0, SNIPPET_MAX - 1).join("").trimEnd()}…`
    : flat;
}

const actor = alias(accounts, "n_actor");
/** The notification's post, or its reply's post. */
const target = alias(posts, "n_post");
const reply = alias(replies, "n_reply");

/** The newest 100. */
export async function listNotifications(
  db: Db,
  accountId: string,
  input?: { limit?: number },
): Promise<NotificationView[]> {
  const limit = Math.max(
    1,
    Math.min(NOTIFICATIONS_MAX, Math.floor(input?.limit ?? NOTIFICATIONS_MAX)),
  );
  const postOpen = sql`(${target.id} is not null and (
    ${target.authorId} = ${accountId} or ${visiblePostPredicate(accountId, target)}
  ))`;
  const replySeen = sql`(${reply.id} is not null and (
    ${reply.authorId} = ${accountId}
    or (${visiblePostPredicate(accountId, target)} and ${visibleReplyPredicate(accountId, reply)})
  ))`;
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      actorId: actor.id,
      actorHandle: actor.handle,
      actorName: actor.displayName,
      postId: notifications.postId,
      replyId: notifications.replyId,
      reportId: notifications.reportId,
      body: notifications.body,
      linkPostId: sql<string | null>`case when ${postOpen} then ${target.id} end`,
      postText: sql<string | null>`case when ${postOpen} then left(${target.body}, 400) end`,
      replyText: sql<string | null>`case when ${replySeen} then left(${reply.body}, 400) end`,
    })
    .from(notifications)
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .leftJoin(reply, eq(reply.id, notifications.replyId))
    .leftJoin(
      target,
      eq(target.id, sql`coalesce(${notifications.postId}, ${reply.postId})`),
    )
    .where(
      and(
        eq(notifications.recipientId, accountId),
        // An actor who has been suspended, or is blocked either way, is
        // hidden from everyone / from each other (SPEC §6).
        or(isNull(notifications.actorId), personShownTo(accountId, notifications.actorId)),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    createdAt: row.createdAt,
    readAt: row.readAt,
    actor:
      row.actorId && row.actorHandle !== null && row.actorName !== null
        ? { id: row.actorId, handle: row.actorHandle, displayName: row.actorName }
        : null,
    postId: row.postId,
    replyId: row.replyId,
    reportId: row.reportId,
    body: row.body,
    linkPostId: row.linkPostId ?? null,
    postSnippet: snippet(row.postText ?? null),
    replySnippet: snippet(row.replyText ?? null),
  }));
}

/** Sets notifications_seen_at and marks all read. */
export async function markAllRead(
  db: Db,
  accountId: string,
  now?: Date,
): Promise<void> {
  const at = now ?? new Date();
  await withTx(db, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(eq(notifications.recipientId, accountId), isNull(notifications.readAt)),
      );
    await tx
      .update(accounts)
      .set({ notificationsSeenAt: at })
      .where(eq(accounts.id, accountId));
  });
}
