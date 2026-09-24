/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M2 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M2 (connections), which
 * replaces the bodies. Requests are addressed by the other person's id:
 * there is at most one pending request per pair (SPEC §5).
 */
import type { Db } from "./db";

const NOT_IMPLEMENTED = "not implemented: M2";

/** A person in one of your lists. */
export type PersonRow = {
  id: string;
  handle: string;
  displayName: string;
  since: Date;
};

export type RequestRow = {
  id: string;
  person: { id: string; handle: string; displayName: string };
  createdAt: Date;
};

export type FriendRequestResult =
  | { status: "requested" }
  | { status: "accepted" }
  | { status: "already_friends" };

/**
 * Ask to be friends. Blocked either way is NOT_FOUND; already friends
 * answers already_friends; a crossed request is accepted; rate-limited to
 * 50 a day.
 */
export async function sendFriendRequest(
  db: Db,
  fromId: string,
  toId: string,
  now?: Date,
): Promise<FriendRequestResult> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Accept the pending request from `fromId` to `accountId`. */
export async function acceptFriendRequest(
  db: Db,
  accountId: string,
  fromId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Decline the pending request from `fromId` to `accountId`. */
export async function declineFriendRequest(
  db: Db,
  accountId: string,
  fromId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Cancel your pending request to `toId`. */
export async function cancelFriendRequest(
  db: Db,
  accountId: string,
  toId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function unfriend(
  db: Db,
  accountId: string,
  otherId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Allowed only if the followee accepts followers, is not you, and no block. */
export async function follow(
  db: Db,
  followerId: string,
  followeeId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function unfollow(
  db: Db,
  followerId: string,
  followeeId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Takes effect at once, in one transaction (SPEC §6). */
export async function block(
  db: Db,
  blockerId: string,
  blockedId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function unblock(
  db: Db,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function mute(
  db: Db,
  muterId: string,
  mutedId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function unmute(
  db: Db,
  muterId: string,
  mutedId: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listFriends(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listRequests(
  db: Db,
  accountId: string,
  now?: Date,
): Promise<{ incoming: RequestRow[]; outgoing: RequestRow[] }> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listFollowing(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listFollowers(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listBlocked(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function listMuted(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  throw new Error(NOT_IMPLEMENTED);
}
