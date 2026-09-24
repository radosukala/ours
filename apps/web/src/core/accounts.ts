/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M1 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M1 (accounts), which replaces
 * the bodies. The signatures follow SPEC §13; M1 may refine them and
 * reports any change that other modules depend on.
 */
import type { Db } from "./db";

const NOT_IMPLEMENTED = "not implemented: M1";

/** What a viewer may see of another person's account. */
export type PublicProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  acceptsFollowers: boolean;
  createdAt: Date;
};

/**
 * The profile at `handle` as the viewer may see it, or null when it does
 * not exist, is suspended, or there is a block either way (SPEC §6).
 */
export async function getAccountByHandle(
  db: Db,
  viewerId: string,
  handle: string,
): Promise<PublicProfile | null> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function updateProfile(
  db: Db,
  accountId: string,
  input: { displayName: string; bio: string },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Turning it off deletes every follow of this account (SPEC §6). */
export async function setAcceptsFollowers(
  db: Db,
  accountId: string,
  value: boolean,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export async function setWeeklyEmail(
  db: Db,
  accountId: string,
  value: boolean,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Delete the account row; cascades remove sessions, posts, replies, likes,
 * connections, notifications, invites and requests. `confirmHandle` must
 * equal the account's handle.
 */
export async function deleteAccount(
  db: Db,
  accountId: string,
  confirmHandle: string,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Rate-limited (5/hour per email hash, 20/hour per IP hash). Sends a
 * sign-in link only if an active account exists; the caller always shows
 * the same answer.
 */
export async function requestSignIn(
  db: Db,
  input: { email: string; ipHash: string; now?: Date },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

export type VerifyEmailLinkResult =
  | { kind: "signed_in"; accountId: string }
  | { kind: "join_pending"; pendingJoinId: string }
  | { kind: "joined_existing"; accountId: string };

/**
 * Use an emailed link. For an existing account with a join token it calls
 * M2's `useInviteAsExisting` (imported from core/invites.ts).
 */
export async function verifyEmailLink(
  db: Db,
  input: { token: string; now?: Date },
): Promise<VerifyEmailLinkResult> {
  throw new Error(NOT_IMPLEMENTED);
}
