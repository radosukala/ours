/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M2 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M2 (connections), which
 * replaces the bodies. The signatures follow SPEC §13; M1 imports
 * `useInviteAsExisting` from here.
 */
import type { Db } from "./db";

const NOT_IMPLEMENTED = "not implemented: M2";

export type InviteStatus = "waiting" | "used" | "expired" | "revoked";

/** One of your invites, as /people/invites lists it. The code is never stored. */
export type InviteView = {
  id: string;
  note: string;
  createdAt: Date;
  expiresAt: Date;
  status: InviteStatus;
  usedByHandle: string | null;
};

/**
 * Create an invite: decrements `invites_remaining` (refused at 0),
 * rate-limited to 20 a day. Returns the code, shown to the inviter once.
 */
export async function createInvite(
  db: Db,
  inviterId: string,
  input: { note?: string; now?: Date },
): Promise<{ id: string; code: string; expiresAt: Date }> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Your invites, newest first. Expired unused ones are marked and refunded here. */
export async function listInvites(
  db: Db,
  inviterId: string,
  now?: Date,
): Promise<{ remaining: number; invites: InviteView[] }> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Revoke one of your unused invites; refunds one. */
export async function revokeInvite(
  db: Db,
  inviterId: string,
  inviteId: string,
  now?: Date,
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** What anyone holding the link may see. */
export type PublicInvite = {
  inviteId: string;
  inviter: { id: string; handle: string; displayName: string };
};

/**
 * The invite behind a code, or null when it is not usable (unknown, used,
 * expired, revoked, inviter suspended or gone) — one answer for all.
 */
export async function lookupInvite(
  db: Db,
  code: string,
  now?: Date,
): Promise<PublicInvite | null> {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Send a join link for an invite. Refused with CLOSED while no controller
 * is named. Rate-limited (3/hour per email hash, 10/hour per IP hash).
 */
export async function requestJoin(
  db: Db,
  input: { code: string; email: string; ipHash: string; now?: Date },
): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Finish joining, in one transaction (SPEC §8 step 4). Refused with CLOSED
 * while no controller is named.
 */
export async function completeJoin(
  db: Db,
  input: {
    pendingJoinId: string;
    displayName: string;
    handle: string;
    adultConfirmed: boolean;
    now?: Date;
  },
): Promise<{
  accountId: string;
  session: { id: string; cookieValue: string; expiresAt: Date };
}> {
  throw new Error(NOT_IMPLEMENTED);
}

export type UseInviteResult =
  | { status: "friends" }
  | { status: "already_friends" }
  | { status: "own_invite" };

/**
 * An existing account uses an invite: becomes friends with the inviter.
 * Already friends does not consume the invite. Blocked either way is
 * NOT_FOUND, like an unusable invite.
 */
export async function useInviteAsExisting(
  db: Db,
  input: { accountId: string; inviteId: string; now?: Date },
): Promise<UseInviteResult> {
  throw new Error(NOT_IMPLEMENTED);
}
