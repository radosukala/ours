/**
 * Who may see what (SPEC §6). This file is the only place a visibility rule
 * is written down in code.
 *
 * ONE SOURCE OF TRUTH. `canSeePost` and every list of posts use the same
 * SQL predicate, `visiblePostPredicate(viewerId)`, built once below. No
 * second, hand-written version exists anywhere. A list query uses it as:
 *
 *   db.select().from(posts).where(and(visiblePostPredicate(viewerId), …))
 *
 * It refers to the `posts` table by name (or to the columns you pass for an
 * aliased posts table), and brings its own subqueries for the author, the
 * blocks, the friendship and the follow, so it needs nothing else joined.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { FRIEND_REQUEST_TTL_DAYS } from "./config";
import type { Db } from "./db";
import { type Post, posts, replies, type Reply } from "./schema";

/* ------------------------------------------------------------- predicates */

/** The posts columns the predicate reads. Defaults to the `posts` table. */
export type PostColumns = {
  authorId: AnyPgColumn;
  audience: AnyPgColumn;
  removedAt: AnyPgColumn;
};

/**
 * canSeePost(V, P) as SQL, exactly SPEC §6/§13:
 *
 *   p.removed_at is null
 *   and author.suspended_at is null
 *   and not exists (block viewer→author or author→viewer)
 *   and (
 *     p.author_id = :viewer
 *     or exists (friendship)
 *     or (p.audience = 'followers' and exists (follow viewer→author)
 *         and author.accepts_followers)
 *   )
 *
 * The author's own removed post is NOT matched: an author sees their
 * removed post through a separate path that shows the statement of reasons.
 */
export function visiblePostPredicate(
  viewerId: string,
  p: PostColumns = posts,
): SQL {
  return sql`(
    ${p.removedAt} is null
    and exists (
      select 1 from accounts vis_author
      where vis_author.id = ${p.authorId} and vis_author.suspended_at is null
    )
    and not exists (
      select 1 from blocks vis_block
      where (vis_block.blocker_id = ${viewerId} and vis_block.blocked_id = ${p.authorId})
         or (vis_block.blocker_id = ${p.authorId} and vis_block.blocked_id = ${viewerId})
    )
    and (
      ${p.authorId} = ${viewerId}
      or exists (
        select 1 from friendships vis_friend
        where vis_friend.a_id = least(${viewerId}, ${p.authorId})
          and vis_friend.b_id = greatest(${viewerId}, ${p.authorId})
      )
      or (
        ${p.audience} = 'followers'
        and exists (
          select 1 from follows vis_follow
          where vis_follow.follower_id = ${viewerId} and vis_follow.followee_id = ${p.authorId}
        )
        and exists (
          select 1 from accounts vis_followee
          where vis_followee.id = ${p.authorId} and vis_followee.accepts_followers
        )
      )
    )
  )`;
}

/** The replies columns the reply predicate reads. Defaults to the `replies` table. */
export type ReplyColumns = { authorId: AnyPgColumn; removedAt: AnyPgColumn };

/**
 * A reply's own conditions (SPEC §6): not removed, its author active, and
 * no block between the viewer and its author. A reply is visible when this
 * holds AND its post passes `visiblePostPredicate`; use both together.
 * The replier's own removed reply is shown to them through a separate path.
 */
export function visibleReplyPredicate(
  viewerId: string,
  r: ReplyColumns = replies,
): SQL {
  return sql`(
    ${r.removedAt} is null
    and exists (
      select 1 from accounts vis_replier
      where vis_replier.id = ${r.authorId} and vis_replier.suspended_at is null
    )
    and not exists (
      select 1 from blocks vis_rblock
      where (vis_rblock.blocker_id = ${viewerId} and vis_rblock.blocked_id = ${r.authorId})
         or (vis_rblock.blocker_id = ${r.authorId} and vis_rblock.blocked_id = ${viewerId})
    )
  )`;
}

/**
 * ONE RULE FOR SHOWING A PERSON (SPEC §17 item 11): the person is active,
 * and there is no block either way with the viewer. Every list of people
 * that is not the viewer's own act uses it: the likers of a post, the actor
 * of a notification, who used an invite (the list and the export), who
 * invited the viewer and whose posts they liked (the export), and the muted
 * list. A person it hides is indistinguishable from a deleted one (SPEC §2
 * rule 3).
 *
 * The blocked list (the page and the export) uses it with
 * `besidesOwnBlock`: the viewer's own block of that person is what the list
 * is made of, so only a block from the other person hides them. Their block
 * row stays either way, and holds if the other person later unblocks.
 *
 * Posts never use this: their rule is `visiblePostPredicate` alone.
 */
export function personShownTo(
  viewerId: string,
  personId: AnyPgColumn,
  options: { besidesOwnBlock?: boolean } = {},
): SQL {
  const ownBlock = options.besidesOwnBlock
    ? sql`false`
    : sql`(shown_block.blocker_id = ${viewerId} and shown_block.blocked_id = ${personId})`;
  return sql`(
    exists (
      select 1 from accounts shown_person
      where shown_person.id = ${personId} and shown_person.suspended_at is null
    )
    and not exists (
      select 1 from blocks shown_block
      where ${ownBlock}
         or (shown_block.blocker_id = ${personId} and shown_block.blocked_id = ${viewerId})
    )
  )`;
}

/* ------------------------------------------------------------------ locks */

/**
 * Serialize every write between the same two people (SPEC §17 item 10):
 * a transaction-scoped advisory lock on the unordered pair, released when
 * the transaction ends.
 *
 * `block`, `unblock`, `useInviteAsExisting`, `sendFriendRequest`,
 * `acceptFriendRequest`, `follow`, `toggleLike` (liker and author) and
 * `createReply` (replier and author) take it first inside their
 * transaction and then re-check the block, so a block either commits
 * before the write (which then sees it and refuses) or after it (and then
 * removes what the write made). Neither order leaves a connection across a
 * block.
 *
 * Only meaningful inside a transaction: outside one the lock would be
 * released as soon as it was taken, so that is refused as a programming
 * error.
 */
export async function pairLock(tx: Db, a: string, b: string): Promise<void> {
  if (!isTransaction(tx)) {
    throw new Error("pairLock must be taken inside a transaction.");
  }
  const [low, high] = a < b ? [a, b] : [b, a];
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`pair:${low}:${high}`}, 0))`,
  );
}

/**
 * Whether `db` is a transaction rather than the root database, told by its
 * shape and never by its class: a production build bundles more than one
 * copy of drizzle-orm, and one process shares a single database handle, so
 * a transaction made by one copy is not an instance of another copy's
 * `PgTransaction` (the second verification's HIGH defect). Of the two, only
 * a transaction has `rollback()`.
 */
export function isTransaction(db: Db): boolean {
  return typeof (db as { rollback?: unknown }).rollback === "function";
}

/* ------------------------------------------------------------ single rows */

/** The post if V may see it (SPEC §6 canSeePost), else null. */
export async function canSeePost(
  db: Db,
  viewerId: string,
  postId: string,
): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), visiblePostPredicate(viewerId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The reply if V may see it and its post, else null. */
export async function canSeeReply(
  db: Db,
  viewerId: string,
  replyId: string,
): Promise<Reply | null> {
  const rows = await db
    .select({ reply: replies })
    .from(replies)
    .innerJoin(posts, eq(posts.id, replies.postId))
    .where(
      and(
        eq(replies.id, replyId),
        visiblePostPredicate(viewerId),
        visibleReplyPredicate(viewerId),
      ),
    )
    .limit(1);
  return rows[0]?.reply ?? null;
}

/* ---------------------------------------------------------- relationships */

async function bool(db: Db, query: SQL): Promise<boolean> {
  const result = await db.execute(sql`select (${query}) as v`);
  return result.rows[0]?.v === true;
}

/** A block exists x→y or y→x. */
export async function isBlocked(db: Db, x: string, y: string): Promise<boolean> {
  return bool(
    db,
    sql`exists (
      select 1 from blocks
      where (blocker_id = ${x} and blocked_id = ${y})
         or (blocker_id = ${y} and blocked_id = ${x})
    )`,
  );
}

/** A friendship row exists for the pair, and there is no block either way. */
export async function areFriends(db: Db, x: string, y: string): Promise<boolean> {
  if (x === y) return false;
  return bool(
    db,
    sql`exists (
      select 1 from friendships
      where a_id = least(${x}, ${y}) and b_id = greatest(${x}, ${y})
    )
    and not exists (
      select 1 from blocks
      where (blocker_id = ${x} and blocked_id = ${y})
         or (blocker_id = ${y} and blocked_id = ${x})
    )`,
  );
}

/**
 * follows(V, A): a follow V→A exists, A accepts followers, and there is no
 * block either way.
 */
export async function isFollowing(
  db: Db,
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  if (followerId === followeeId) return false;
  return bool(
    db,
    sql`exists (
      select 1 from follows
      where follower_id = ${followerId} and followee_id = ${followeeId}
    )
    and exists (
      select 1 from accounts where id = ${followeeId} and accepts_followers
    )
    and not exists (
      select 1 from blocks
      where (blocker_id = ${followerId} and blocked_id = ${followeeId})
         or (blocker_id = ${followeeId} and blocked_id = ${followerId})
    )`,
  );
}

/** active(X): the account exists and is not suspended. */
export async function isActive(db: Db, accountId: string): Promise<boolean> {
  return bool(
    db,
    sql`exists (select 1 from accounts where id = ${accountId} and suspended_at is null)`,
  );
}

/**
 * Whether V may see A's profile (SPEC §6): A is active and there is no
 * block either way. Anything else is NOT_FOUND to the caller.
 */
export async function canSeeAccount(
  db: Db,
  viewerId: string,
  accountId: string,
): Promise<boolean> {
  return bool(
    db,
    sql`exists (select 1 from accounts where id = ${accountId} and suspended_at is null)
    and not exists (
      select 1 from blocks
      where (blocker_id = ${viewerId} and blocked_id = ${accountId})
         or (blocker_id = ${accountId} and blocked_id = ${viewerId})
    )`,
  );
}

export type Relationship = {
  /** V and A are the same account. */
  self: boolean;
  /** friends(V, A): a friendship exists and there is no block either way. */
  friends: boolean;
  /** A pending, unexpired friend request V→A. */
  requestOut: boolean;
  /** A pending, unexpired friend request A→V. */
  requestIn: boolean;
  /** follows(V, A). */
  following: boolean;
  /** follows(A, V). */
  followedBy: boolean;
  /** V blocked A. */
  blocked: boolean;
  /** A blocked V. Core use only: the UI never shows this (SPEC §2 rule 3). */
  blockedBy: boolean;
  /** V muted A. */
  muted: boolean;
  /** A accepts followers. */
  acceptsFollowers: boolean;
};

/** Everything between V and A, in one query. */
export async function relationship(
  db: Db,
  viewerId: string,
  otherId: string,
  now: Date = new Date(),
): Promise<Relationship> {
  const requestCutoff = new Date(
    now.getTime() - FRIEND_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const v = viewerId;
  const o = otherId;
  const result = await db.execute(sql`
    select
      exists (select 1 from blocks where blocker_id = ${v} and blocked_id = ${o}) as blocked,
      exists (select 1 from blocks where blocker_id = ${o} and blocked_id = ${v}) as blocked_by,
      exists (
        select 1 from friendships
        where a_id = least(${v}, ${o}) and b_id = greatest(${v}, ${o})
      ) as friendship,
      exists (
        select 1 from friend_requests
        where from_id = ${v} and to_id = ${o} and status = 'pending'
          and created_at > ${requestCutoff}
      ) as request_out,
      exists (
        select 1 from friend_requests
        where from_id = ${o} and to_id = ${v} and status = 'pending'
          and created_at > ${requestCutoff}
      ) as request_in,
      exists (select 1 from follows where follower_id = ${v} and followee_id = ${o}) as follow_out,
      exists (select 1 from follows where follower_id = ${o} and followee_id = ${v}) as follow_in,
      exists (select 1 from mutes where muter_id = ${v} and muted_id = ${o}) as muted,
      coalesce((select accepts_followers from accounts where id = ${o}), false) as other_accepts,
      coalesce((select accepts_followers from accounts where id = ${v}), false) as viewer_accepts
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const self = v === o;
  const blocked = row.blocked === true;
  const blockedBy = row.blocked_by === true;
  const anyBlock = blocked || blockedBy;
  const otherAccepts = row.other_accepts === true;
  const viewerAccepts = row.viewer_accepts === true;
  return {
    self,
    friends: !self && row.friendship === true && !anyBlock,
    requestOut: !self && row.request_out === true && !anyBlock,
    requestIn: !self && row.request_in === true && !anyBlock,
    following: !self && row.follow_out === true && otherAccepts && !anyBlock,
    followedBy: !self && row.follow_in === true && viewerAccepts && !anyBlock,
    blocked,
    blockedBy,
    muted: row.muted === true,
    acceptsFollowers: otherAccepts,
  };
}

