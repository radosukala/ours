/**
 * Posts, replies and likes (SPEC §6, §8 "Posts").
 *
 * Every list and single read here filters with `visiblePostPredicate` (and,
 * for replies, `visibleReplyPredicate`) from core/visibility.ts. There is no
 * second version of the rule. The only other path is the one SPEC §6 names:
 * an author sees their own removed post, and a replier their own removed
 * reply, marked removed, with the statement of reasons.
 *
 * Refusals do not leak existence: a post the viewer may not see is
 * NOT_FOUND, exactly like a post that does not exist.
 */
import { and, asc, desc, eq, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { PAGE_SIZE } from "./config";
import { type Db, withTx } from "./db";
import { forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import { hit, RATE } from "./limits";
import { notify } from "./notifications";
import {
  accounts,
  AUDIENCES,
  type Audience,
  likes,
  notifications,
  posts,
  replies,
} from "./schema";
import { validPostBody, validReplyBody } from "./validate";
import {
  canSeePost,
  visiblePostPredicate,
  visibleReplyPredicate,
} from "./visibility";

export type AuthorView = { id: string; handle: string; displayName: string };

/** A removed item as its own author sees it, with the statement of reasons. */
export type RemovalView = { category: string | null; reason: string | null };

export type PostView = {
  id: string;
  body: string;
  audience: Audience;
  createdAt: Date;
  author: AuthorView;
  isOwn: boolean;
  /** Replies the viewer can see; shown to everyone who can see the post. */
  replyCount: number;
  likedByMe: boolean;
  /** Only for the author; undefined for everyone else. */
  likeCount?: number;
  /** Only for the author; undefined for everyone else. */
  likers?: AuthorView[];
  /** Set only on the author's own removed post. */
  removed: RemovalView | null;
};

export type ReplyView = {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  author: AuthorView;
  isOwn: boolean;
  /** The replier, or the post's author. */
  canDelete: boolean;
  /** Set only on the replier's own removed reply. */
  removed: RemovalView | null;
};

/** At most this many likers are listed for the author; the count is exact. */
export const LIKERS_MAX = 100;

/* ------------------------------------------------------------- internals */

/** Ids are opaque strings; anything else cannot name a row. */
function asId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 64) {
    throw notFound();
  }
  return value;
}

/**
 * A suspended or missing account can do nothing (SPEC §6 "Reading and
 * writing"). Checked before anything about the target, so the answer is the
 * same whatever the target is.
 */
async function requireActive(
  db: Db,
  accountId: string,
): Promise<{ id: string; acceptsFollowers: boolean }> {
  const [row] = await db
    .select({ id: accounts.id, acceptsFollowers: accounts.acceptsFollowers })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)))
    .limit(1);
  if (!row) throw forbidden();
  return row;
}

async function isActiveAccount(db: Db, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)))
    .limit(1);
  return row !== undefined;
}

/**
 * A person V may be shown in a list of people (the likers of V's post, the
 * actor of V's notification): active, and no block either way with V
 * (SPEC §6: suspended people are hidden from everyone; a block hides each
 * from the other).
 *
 * Posts never use this: their rule is `visiblePostPredicate` alone.
 * Candidate for core/visibility.ts; see the M3 report.
 */
export function personShownTo(viewerId: string, personId: AnyPgColumn): SQL {
  return sql`(
    exists (
      select 1 from accounts shown_person
      where shown_person.id = ${personId} and shown_person.suspended_at is null
    )
    and not exists (
      select 1 from blocks shown_block
      where (shown_block.blocker_id = ${viewerId} and shown_block.blocked_id = ${personId})
         or (shown_block.blocker_id = ${personId} and shown_block.blocked_id = ${viewerId})
    )
  )`;
}

/* ---------------------------------------------------------------- cursors */

const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CURSOR_ID = /^[0-9A-Za-z]{1,64}$/;

/**
 * The page cursor (SPEC §7): opaque base64url of `created_at|id`. The time
 * carries Postgres's full microsecond precision, so two posts in the same
 * millisecond can never be skipped or repeated.
 */
export function encodeCursor(createdAtUs: string, id: string): string {
  return Buffer.from(`${createdAtUs}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { at: string; id: string } {
  const raw =
    cursor.length <= 200 && /^[A-Za-z0-9_-]+$/.test(cursor)
      ? Buffer.from(cursor, "base64url").toString("utf8")
      : "";
  const [at, id, extra] = raw.split("|");
  if (extra !== undefined || !at || !id || !CURSOR_TS.test(at) || !CURSOR_ID.test(id)) {
    throw invalid("That page link isn't valid. Reload and try again.");
  }
  return { at, id };
}

/** Rows strictly after the cursor in `created_at desc, id desc` order. */
export function afterCursor(cursor: string | null | undefined): SQL | undefined {
  if (cursor === null || cursor === undefined || cursor === "") return undefined;
  if (typeof cursor !== "string") throw invalid("That page link isn't valid.");
  const { at, id } = decodeCursor(cursor);
  return sql`(${posts.createdAt}, ${posts.id}) < (${at}::timestamptz, ${id})`;
}

/* ------------------------------------------------------------ post views */

// Aliases for the correlated subqueries below. Written as `from replies rc`
// and `from likes lc` in the SQL, so their columns render as "rc".… / "lc".….
const rc = alias(replies, "rc");
const lc = alias(likes, "lc");

/**
 * The columns of a post as a viewer sees it. `replyCount` counts only
 * replies visible to the viewer; `likeCount` is computed only when the
 * viewer is the author (null otherwise), and counts likers the author may
 * be shown.
 */
function postViewColumns(viewerId: string) {
  return {
    id: posts.id,
    body: posts.body,
    audience: posts.audience,
    createdAt: posts.createdAt,
    createdAtUs: sql<string>`to_char(${posts.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    removedAt: posts.removedAt,
    removalCategory: posts.removalCategory,
    removalReason: posts.removalReason,
    authorId: accounts.id,
    authorHandle: accounts.handle,
    authorName: accounts.displayName,
    replyCount: sql<number>`(
      select count(*)::int from replies rc
      where ${rc.postId} = ${posts.id}
        and ${visibleReplyPredicate(viewerId, rc)}
    )`,
    likedByMe: sql<boolean>`exists (
      select 1 from likes lm
      where lm.post_id = ${posts.id} and lm.account_id = ${viewerId}
    )`,
    likeCount: sql<number | null>`case when ${posts.authorId} = ${viewerId} then (
      select count(*)::int from likes lc
      where ${lc.postId} = ${posts.id}
        and ${personShownTo(viewerId, lc.accountId)}
    ) end`,
  };
}

type PostViewRow = {
  id: string;
  body: string;
  audience: Audience;
  createdAt: Date;
  createdAtUs: string;
  removedAt: Date | null;
  removalCategory: string | null;
  removalReason: string | null;
  authorId: string;
  authorHandle: string;
  authorName: string;
  replyCount: number;
  likedByMe: boolean;
  likeCount: number | null;
};

function toPostView(row: PostViewRow, viewerId: string): PostView {
  const isOwn = row.authorId === viewerId;
  const view: PostView = {
    id: row.id,
    body: row.body,
    audience: row.audience,
    createdAt: row.createdAt,
    author: { id: row.authorId, handle: row.authorHandle, displayName: row.authorName },
    isOwn,
    // Replies of a removed post are hidden from everyone, its author included.
    replyCount: row.removedAt ? 0 : Number(row.replyCount),
    likedByMe: row.likedByMe === true,
    removed:
      isOwn && row.removedAt
        ? { category: row.removalCategory, reason: row.removalReason }
        : null,
  };
  if (isOwn) view.likeCount = Number(row.likeCount ?? 0);
  return view;
}

/**
 * One page of posts matching `where` (which must include
 * `visiblePostPredicate`), newest first, and the cursor after it.
 */
export async function postPage(
  db: Db,
  viewerId: string,
  where: SQL,
  pageSize: number = PAGE_SIZE,
): Promise<{ items: PostView[]; nextCursor: string | null }> {
  const rows = (await db
    .select(postViewColumns(viewerId))
    .from(posts)
    .innerJoin(accounts, eq(accounts.id, posts.authorId))
    .where(where)
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(pageSize + 1)) as PostViewRow[];
  const more = rows.length > pageSize;
  const page = more ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => toPostView(row, viewerId)),
    nextCursor: more && last ? encodeCursor(last.createdAtUs, last.id) : null,
  };
}

async function likersOf(db: Db, authorId: string, postId: string): Promise<AuthorView[]> {
  return db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
    })
    .from(likes)
    .innerJoin(accounts, eq(accounts.id, likes.accountId))
    .where(and(eq(likes.postId, postId), personShownTo(authorId, likes.accountId)))
    .orderBy(desc(likes.createdAt), desc(likes.accountId))
    .limit(LIKERS_MAX);
}

/* ------------------------------------------------------------------ posts */

/** Rate-limited to 50 a day. Audience 'followers' only if you accept followers. */
export async function createPost(
  db: Db,
  authorId: string,
  input: { body: string; audience: Audience; now?: Date },
): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  const body = validPostBody(input.body);
  if (!(AUDIENCES as readonly unknown[]).includes(input.audience)) {
    throw invalid("Choose who can see this post.");
  }
  const author = await requireActive(db, authorId);
  if (input.audience === "followers" && !author.acceptsFollowers) {
    throw invalid(
      "You don't accept followers, so this post can go to friends only.",
    );
  }
  // Before the insert (SPEC §10): a refused post still counts, and the
  // limit never rolls back with a failed write.
  await hit(db, `post:${authorId}`, { ...RATE.post, now });
  const id = newId();
  await db.insert(posts).values({
    id,
    authorId,
    body,
    audience: input.audience,
    createdAt: now,
  });
  return { id };
}

/** Delete your own post. Anyone else's is NOT_FOUND. */
export async function deletePost(
  db: Db,
  accountId: string,
  postId: string,
): Promise<void> {
  const id = asId(postId);
  await requireActive(db, accountId);
  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.authorId, accountId)))
    .returning({ id: posts.id });
  if (deleted.length === 0) throw notFound();
}

/** The post as the viewer may see it, or null. */
export async function getPostForViewer(
  db: Db,
  viewerId: string,
  postId: string,
): Promise<PostView | null> {
  if (typeof postId !== "string" || postId.length < 1 || postId.length > 64) {
    return null;
  }
  if (!(await isActiveAccount(db, viewerId))) return null;
  const [row] = (await db
    .select(postViewColumns(viewerId))
    .from(posts)
    .innerJoin(accounts, eq(accounts.id, posts.authorId))
    .where(
      and(
        eq(posts.id, postId),
        or(
          visiblePostPredicate(viewerId),
          // SPEC §6: the author's own removed post stays visible to them.
          and(eq(posts.authorId, viewerId), isNotNull(posts.removedAt)),
        ),
      ),
    )
    .limit(1)) as PostViewRow[];
  if (!row) return null;
  const view = toPostView(row, viewerId);
  if (view.isOwn) view.likers = await likersOf(db, viewerId, row.id);
  return view;
}

/** An author's posts that the viewer may see, newest first. */
export async function listPostsByAuthor(
  db: Db,
  viewerId: string,
  authorId: string,
  input?: { cursor?: string | null; now?: Date },
): Promise<{ items: PostView[]; nextCursor: string | null }> {
  if (typeof authorId !== "string" || !(await isActiveAccount(db, viewerId))) {
    return { items: [], nextCursor: null };
  }
  const where = and(
    eq(posts.authorId, authorId),
    visiblePostPredicate(viewerId),
    afterCursor(input?.cursor),
  );
  return postPage(db, viewerId, where!);
}

/* ---------------------------------------------------------------- replies */

/** Requires canReply(V, P). Rate-limited to 200 a day. */
export async function createReply(
  db: Db,
  authorId: string,
  postId: string,
  input: { body: string; now?: Date },
): Promise<{ id: string }> {
  const now = input.now ?? new Date();
  const body = validReplyBody(input.body);
  const id = asId(postId);
  // canReply(V, P) = active(V) and canSeePost(V, P).
  await requireActive(db, authorId);
  const post = await canSeePost(db, authorId, id);
  if (!post) throw notFound();
  await hit(db, `reply:${authorId}`, { ...RATE.reply, now });
  const replyId = newId();
  await withTx(db, async (tx) => {
    await tx.insert(replies).values({
      id: replyId,
      postId: post.id,
      authorId,
      body,
      createdAt: now,
    });
    // notify() never notifies you about yourself and skips across a block.
    await notify(tx, {
      recipientId: post.authorId,
      kind: "reply",
      actorId: authorId,
      postId: post.id,
      replyId,
      now,
    });
  });
  return { id: replyId };
}

/** The replier or the post's author may delete a reply. */
export async function deleteReply(
  db: Db,
  accountId: string,
  replyId: string,
): Promise<void> {
  const id = asId(replyId);
  await requireActive(db, accountId);
  const deleted = await db
    .delete(replies)
    .where(
      and(
        eq(replies.id, id),
        or(
          eq(replies.authorId, accountId),
          sql`exists (
            select 1 from posts owner_post
            where owner_post.id = ${replies.postId} and owner_post.author_id = ${accountId}
          )`,
        ),
      ),
    )
    .returning({ id: replies.id });
  if (deleted.length === 0) throw notFound();
}

/** Replies the viewer may see, oldest first. */
export async function listReplies(
  db: Db,
  viewerId: string,
  postId: string,
): Promise<ReplyView[]> {
  if (typeof postId !== "string" || !(await isActiveAccount(db, viewerId))) {
    return [];
  }
  const rows = await db
    .select({
      id: replies.id,
      postId: replies.postId,
      body: replies.body,
      createdAt: replies.createdAt,
      removedAt: replies.removedAt,
      removalCategory: replies.removalCategory,
      removalReason: replies.removalReason,
      authorId: accounts.id,
      authorHandle: accounts.handle,
      authorName: accounts.displayName,
      postAuthorId: posts.authorId,
    })
    .from(replies)
    .innerJoin(posts, eq(posts.id, replies.postId))
    .innerJoin(accounts, eq(accounts.id, replies.authorId))
    .where(
      and(
        eq(replies.postId, postId),
        visiblePostPredicate(viewerId),
        or(
          visibleReplyPredicate(viewerId),
          // SPEC §6: the replier's own removed reply stays visible to them.
          and(eq(replies.authorId, viewerId), isNotNull(replies.removedAt)),
        ),
      ),
    )
    .orderBy(asc(replies.createdAt), asc(replies.id));
  return rows.map((row) => {
    const isOwn = row.authorId === viewerId;
    return {
      id: row.id,
      postId: row.postId,
      body: row.body,
      createdAt: row.createdAt,
      author: { id: row.authorId, handle: row.authorHandle, displayName: row.authorName },
      isOwn,
      canDelete: isOwn || row.postAuthorId === viewerId,
      removed:
        isOwn && row.removedAt
          ? { category: row.removalCategory, reason: row.removalReason }
          : null,
    };
  });
}

/* ------------------------------------------------------------------ likes */

/**
 * Requires canLike(V, P). Liking notifies the author (never yourself);
 * unliking takes that notification back, so toggling cannot flood anyone.
 */
export async function toggleLike(
  db: Db,
  accountId: string,
  postId: string,
  now?: Date,
): Promise<{ liked: boolean }> {
  const at = now ?? new Date();
  const id = asId(postId);
  // canLike(V, P) = active(V) and canSeePost(V, P).
  await requireActive(db, accountId);
  const post = await canSeePost(db, accountId, id);
  if (!post) throw notFound();
  return withTx(db, async (tx) => {
    const removed = await tx
      .delete(likes)
      .where(and(eq(likes.postId, post.id), eq(likes.accountId, accountId)))
      .returning({ postId: likes.postId });
    if (removed.length > 0) {
      await tx
        .delete(notifications)
        .where(
          and(
            eq(notifications.kind, "like"),
            eq(notifications.postId, post.id),
            eq(notifications.actorId, accountId),
          ),
        );
      return { liked: false };
    }
    const inserted = await tx
      .insert(likes)
      .values({ postId: post.id, accountId, createdAt: at })
      .onConflictDoNothing()
      .returning({ postId: likes.postId });
    if (inserted.length > 0) {
      await notify(tx, {
        recipientId: post.authorId,
        kind: "like",
        actorId: accountId,
        postId: post.id,
        now: at,
      });
    }
    return { liked: true };
  });
}
