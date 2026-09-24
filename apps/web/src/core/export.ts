/**
 * Export (M1; SPEC §8 "Export and delete"): everything a person may take
 * out, as JSON, and nothing else.
 *
 * What the export holds is the owner's own record. Another person appears
 * in it only by handle (and display name, for connections): never their
 * address, never their posts or replies, never a private invite note.
 *
 * - Connections (friends, following, followers) are listed as the owner
 *   sees them now: people who are active and with no block either way,
 *   and followers only while the owner accepts followers (SPEC §6).
 * - Records of the owner's own acts (likes, blocks, mutes, invites, who
 *   invited them) name the other person's handle as recorded.
 *
 * The function takes the owner's id from the session; there is no way to
 * ask it for someone else.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { Db } from "./db";
import { notFound } from "./errors";
import {
  accounts,
  blocks,
  follows,
  friendships,
  invites,
  likes,
  mutes,
  posts,
  replies,
} from "./schema";

type Person = { handle: string; display_name: string; since: string };

export type AccountExport = {
  exported_at: string;
  account: {
    handle: string;
    display_name: string;
    bio: string;
    email: string;
    created_at: string;
    invited_by_handle: string | null;
  };
  /** Yours, including removed ones with their reasons. */
  posts: {
    id: string;
    body: string;
    audience: "friends" | "followers";
    created_at: string;
    removed_at: string | null;
    removal_category: string | null;
    removal_reason: string | null;
  }[];
  replies: {
    id: string;
    post_id: string;
    body: string;
    created_at: string;
    removed_at: string | null;
    removal_category: string | null;
    removal_reason: string | null;
  }[];
  /** Post ids and author handles of posts you liked. */
  likes: { post_id: string; author_handle: string; created_at: string }[];
  friends: Person[];
  following: Person[];
  followers: Person[];
  blocked: { handle: string; since: string }[];
  muted: { handle: string; since: string }[];
  invites: {
    created_at: string;
    status: "waiting" | "used" | "expired" | "revoked";
    used_by_handle: string | null;
  }[];
};

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/** `ours-export-<handle>-<yyyy-mm-dd>.json`, the date in UTC. */
export function exportFilename(handle: string, now: Date = new Date()): string {
  return `ours-export-${handle}-${now.toISOString().slice(0, 10)}.json`;
}

/** No block either way between the owner and `other`. */
function noBlock(ownerId: string, other: AnyPgColumn) {
  return sql`not exists (
    select 1 from blocks exp_block
    where (exp_block.blocker_id = ${ownerId} and exp_block.blocked_id = ${other})
       or (exp_block.blocker_id = ${other} and exp_block.blocked_id = ${ownerId})
  )`;
}

function inviteStatus(
  invite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): AccountExport["invites"][number]["status"] {
  if (invite.usedAt) return "used";
  // An invite that expired unused is marked with revoked_at = expires_at
  // (SPEC §5); one not yet marked is expired all the same.
  if (invite.revokedAt) {
    return invite.revokedAt.getTime() === invite.expiresAt.getTime()
      ? "expired"
      : "revoked";
  }
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "waiting";
}

export async function exportAccount(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<AccountExport> {
  const inviter = alias(accounts, "exp_inviter");
  const [me] = await db
    .select({
      id: accounts.id,
      handle: accounts.handle,
      displayName: accounts.displayName,
      bio: accounts.bio,
      email: accounts.email,
      acceptsFollowers: accounts.acceptsFollowers,
      createdAt: accounts.createdAt,
      invitedByHandle: inviter.handle,
    })
    .from(accounts)
    .leftJoin(inviter, eq(inviter.id, accounts.invitedBy))
    .where(and(eq(accounts.id, accountId), isNull(accounts.suspendedAt)))
    .limit(1);
  if (!me) throw notFound();

  const other = alias(accounts, "exp_other");

  const [
    myPosts,
    myReplies,
    myLikes,
    friendRows,
    followingRows,
    followerRows,
    blockedRows,
    mutedRows,
    inviteRows,
  ] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(eq(posts.authorId, me.id))
      .orderBy(asc(posts.createdAt), asc(posts.id)),
    db
      .select()
      .from(replies)
      .where(eq(replies.authorId, me.id))
      .orderBy(asc(replies.createdAt), asc(replies.id)),
    db
      .select({
        postId: likes.postId,
        authorHandle: other.handle,
        createdAt: likes.createdAt,
      })
      .from(likes)
      .innerJoin(posts, eq(posts.id, likes.postId))
      .innerJoin(other, eq(other.id, posts.authorId))
      .where(eq(likes.accountId, me.id))
      .orderBy(asc(likes.createdAt), asc(likes.postId)),
    db
      .select({
        handle: other.handle,
        displayName: other.displayName,
        since: friendships.createdAt,
      })
      .from(friendships)
      .innerJoin(
        other,
        or(
          and(eq(friendships.aId, me.id), eq(other.id, friendships.bId)),
          and(eq(friendships.bId, me.id), eq(other.id, friendships.aId)),
        ),
      )
      .where(and(isNull(other.suspendedAt), noBlock(me.id, other.id)))
      .orderBy(asc(friendships.createdAt), asc(other.handle)),
    db
      .select({
        handle: other.handle,
        displayName: other.displayName,
        since: follows.createdAt,
      })
      .from(follows)
      .innerJoin(other, eq(other.id, follows.followeeId))
      .where(
        and(
          eq(follows.followerId, me.id),
          isNull(other.suspendedAt),
          eq(other.acceptsFollowers, true),
          noBlock(me.id, other.id),
        ),
      )
      .orderBy(asc(follows.createdAt), asc(other.handle)),
    me.acceptsFollowers
      ? db
          .select({
            handle: other.handle,
            displayName: other.displayName,
            since: follows.createdAt,
          })
          .from(follows)
          .innerJoin(other, eq(other.id, follows.followerId))
          .where(
            and(
              eq(follows.followeeId, me.id),
              isNull(other.suspendedAt),
              noBlock(me.id, other.id),
            ),
          )
          .orderBy(asc(follows.createdAt), asc(other.handle))
      : Promise.resolve([]),
    db
      .select({ handle: other.handle, since: blocks.createdAt })
      .from(blocks)
      .innerJoin(other, eq(other.id, blocks.blockedId))
      .where(eq(blocks.blockerId, me.id))
      .orderBy(asc(blocks.createdAt), asc(other.handle)),
    db
      .select({ handle: other.handle, since: mutes.createdAt })
      .from(mutes)
      .innerJoin(other, eq(other.id, mutes.mutedId))
      .where(eq(mutes.muterId, me.id))
      .orderBy(asc(mutes.createdAt), asc(other.handle)),
    db
      .select({
        createdAt: invites.createdAt,
        expiresAt: invites.expiresAt,
        usedAt: invites.usedAt,
        revokedAt: invites.revokedAt,
        usedByHandle: other.handle,
      })
      .from(invites)
      .leftJoin(other, eq(other.id, invites.usedBy))
      .where(eq(invites.inviterId, me.id))
      .orderBy(asc(invites.createdAt), asc(invites.id)),
  ]);

  const person = (row: { handle: string; displayName: string; since: Date }): Person => ({
    handle: row.handle,
    display_name: row.displayName,
    since: iso(row.since),
  });

  return {
    exported_at: iso(now),
    account: {
      handle: me.handle,
      display_name: me.displayName,
      bio: me.bio,
      email: me.email,
      created_at: iso(me.createdAt),
      invited_by_handle: me.invitedByHandle ?? null,
    },
    posts: myPosts.map((p) => ({
      id: p.id,
      body: p.body,
      audience: p.audience,
      created_at: iso(p.createdAt),
      removed_at: isoOrNull(p.removedAt),
      removal_category: p.removalCategory,
      removal_reason: p.removalReason,
    })),
    replies: myReplies.map((r) => ({
      id: r.id,
      post_id: r.postId,
      body: r.body,
      created_at: iso(r.createdAt),
      removed_at: isoOrNull(r.removedAt),
      removal_category: r.removalCategory,
      removal_reason: r.removalReason,
    })),
    likes: myLikes.map((l) => ({
      post_id: l.postId,
      author_handle: l.authorHandle,
      created_at: iso(l.createdAt),
    })),
    friends: friendRows.map(person),
    following: followingRows.map(person),
    followers: followerRows.map(person),
    blocked: blockedRows.map((b) => ({ handle: b.handle, since: iso(b.since) })),
    muted: mutedRows.map((m) => ({ handle: m.handle, since: iso(m.since) })),
    invites: inviteRows.map((i) => ({
      created_at: iso(i.createdAt),
      status: inviteStatus(i, now),
      used_by_handle: i.usedAt ? (i.usedByHandle ?? null) : null,
    })),
  };
}
