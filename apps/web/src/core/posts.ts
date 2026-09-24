/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M3 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M3 (posts), which replaces the
 * bodies. Every list here filters with `visiblePostPredicate` from
 * core/visibility.ts; there is no second version of the rule.
 */
import type { Db } from "./db";
import type { Audience } from "./schema";

const NOT_IMPLEMENTED = "not implemented: M3";

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

/** Rate-limited to 50 a day. Audience 'followers' only if you accept followers. */
export async function createPost(
  db: Db,
  authorId: string,
  input: { body: string; audience: Audience; now?: Date },
): Promise<{ id: string }> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Delete your own post. Anyone else's is NOT_FOUND. */
export async function deletePost(
  db: Db,
  accountId: string,
  postId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** The post as the viewer may see it, or null. */
export async function getPostForViewer(
  db: Db,
  viewerId: string,
  postId: string,
): Promise<PostView | null> {
  throw new Error(NOT_IMPLEMENTED);
}

/** An author's posts that the viewer may see, newest first. */
export async function listPostsByAuthor(
  db: Db,
  viewerId: string,
  authorId: string,
  input?: { cursor?: string | null; now?: Date },
): Promise<{ items: PostView[]; nextCursor: string | null }> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Requires canReply(V, P). Rate-limited to 200 a day. */
export async function createReply(
  db: Db,
  authorId: string,
  postId: string,
  input: { body: string; now?: Date },
): Promise<{ id: string }> {
  throw new Error(NOT_IMPLEMENTED);
}

/** The replier or the post's author may delete a reply. */
export async function deleteReply(
  db: Db,
  accountId: string,
  replyId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Replies the viewer may see, oldest first. */
export async function listReplies(
  db: Db,
  viewerId: string,
  postId: string,
): Promise<ReplyView[]> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Requires canLike(V, P). */
export async function toggleLike(
  db: Db,
  accountId: string,
  postId: string,
  now?: Date,
): Promise<{ liked: boolean }> {
  throw new Error(NOT_IMPLEMENTED);
}
