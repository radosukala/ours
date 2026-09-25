/**
 * Connections (SPEC §5, §6, §8): friend requests, friendships, follows,
 * blocks and mutes, and the lists on /people.
 *
 * - Requests are addressed by the other person's id: there is at most one
 *   pending request per unordered pair (a partial unique index, SPEC §5).
 * - A pending request older than 30 days counts as expired. It is marked
 *   so lazily, whenever a request between the pair (or the account's
 *   request list) is touched. `relationship()` in visibility.ts applies the
 *   same cut-off, so an unmarked stale request is never shown as pending.
 * - Refusals do not leak existence (SPEC §2 rule 3): a person who blocked
 *   you, a person you blocked, a suspended person and nobody at all are the
 *   same NOT_FOUND, with the same sentence.
 * - A block takes effect at once, in one transaction (SPEC §6). Unblocking
 *   restores nothing.
 * - Every write between two people serializes with a block between them
 *   (SPEC §17 item 10): it takes `pairLock` inside its transaction and
 *   checks for a block again under it.
 * - Blocking or muting someone who does not exist succeeds and writes
 *   nothing, exactly as for someone who blocked you (SPEC §17 item 11).
 */
import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { FRIEND_REQUEST_TTL_DAYS } from "./config";
import { type Db, withTx } from "./db";
import { forbidden, invalid, notFound } from "./errors";
import { newId } from "./ids";
import { hit, RATE } from "./limits";
import { notify } from "./notifications";
import {
  accounts,
  blocks,
  follows,
  friendRequests,
  friendships,
  likes,
  mutes,
  notifications,
  posts,
} from "./schema";
import {
  areFriends,
  canSeeAccount,
  isActive,
  pairLock,
  personShownTo,
} from "./visibility";

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

/** The one sentence for "nobody there", whatever the reason. */
export const PERSON_NOT_FOUND = "That person isn't available.";
export const REQUEST_NOT_FOUND = "That friend request isn't available any more.";

const DAY_MS = 24 * 60 * 60 * 1000;

/* --------------------------------------------------------------- helpers */

/** Requests created at or before this moment count as expired. */
function requestCutoff(now: Date): Date {
  return new Date(now.getTime() - FRIEND_REQUEST_TTL_DAYS * DAY_MS);
}

/**
 * Whether an error is a Postgres unique violation (optionally of one named
 * constraint). Drizzle wraps driver errors, so the cause chain is walked.
 * Exported for core/invites.ts.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (e.code === "23505") {
        return constraint === undefined || e.constraint === constraint;
      }
      current = e.cause;
    } else {
      return false;
    }
  }
  return false;
}

/**
 * The friendship row for a pair (a_id is always the smaller id). Inserting
 * an existing friendship does nothing. Exported for core/invites.ts.
 */
export async function insertFriendship(
  db: Db,
  x: string,
  y: string,
  now: Date,
): Promise<void> {
  if (x === y) throw invalid("You can't be friends with yourself.");
  const [aId, bId] = x < y ? [x, y] : [y, x];
  await db
    .insert(friendships)
    .values({ aId, bId, createdAt: now })
    .onConflictDoNothing();
}

/** SQL: the two accounts are this pair, in either direction. */
function pairOf(
  from: AnyPgColumn,
  to: AnyPgColumn,
  x: string,
  y: string,
): SQL {
  return or(
    and(eq(from, x), eq(to, y)),
    and(eq(from, y), eq(to, x)),
  ) as SQL;
}

/** SQL: no block either way between `x` and `y`. */
function noBlockBetween(x: string | AnyPgColumn, y: string | AnyPgColumn): SQL {
  return sql`not exists (
    select 1 from blocks conn_block
    where (conn_block.blocker_id = ${x} and conn_block.blocked_id = ${y})
       or (conn_block.blocker_id = ${y} and conn_block.blocked_id = ${x})
  )`;
}

/** The expiry moment of a request: created_at + 30 days. */
const EXPIRED_AT = sql`${friendRequests.createdAt} + make_interval(days => ${FRIEND_REQUEST_TTL_DAYS})`;

/** Mark this pair's stale pending requests as expired. */
async function expireStaleForPair(db: Db, x: string, y: string, now: Date) {
  await db
    .update(friendRequests)
    .set({ status: "expired", respondedAt: EXPIRED_AT })
    .where(
      and(
        eq(friendRequests.status, "pending"),
        lte(friendRequests.createdAt, requestCutoff(now)),
        pairOf(friendRequests.fromId, friendRequests.toId, x, y),
      ),
    );
}

/** Mark every stale pending request to or from this account as expired. */
async function expireStaleForAccount(db: Db, accountId: string, now: Date) {
  await db
    .update(friendRequests)
    .set({ status: "expired", respondedAt: EXPIRED_AT })
    .where(
      and(
        eq(friendRequests.status, "pending"),
        lte(friendRequests.createdAt, requestCutoff(now)),
        or(eq(friendRequests.fromId, accountId), eq(friendRequests.toId, accountId)),
      ),
    );
}

/** The pending, unexpired request between a pair, in either direction. */
async function pendingBetween(
  db: Db,
  x: string,
  y: string,
  now: Date,
): Promise<{ id: string; fromId: string; toId: string } | null> {
  const [row] = await db
    .select({
      id: friendRequests.id,
      fromId: friendRequests.fromId,
      toId: friendRequests.toId,
    })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.status, "pending"),
        gt(friendRequests.createdAt, requestCutoff(now)),
        pairOf(friendRequests.fromId, friendRequests.toId, x, y),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** A suspended or missing account can do nothing (SPEC §6). */
async function assertActive(db: Db, accountId: string): Promise<void> {
  if (!(await isActive(db, accountId))) throw forbidden();
}

/**
 * The other account exists (active or not). Inside a transaction, its row
 * is locked `for key share`, so it cannot be deleted before the caller's
 * writes that reference it commit.
 */
async function lockExisting(tx: Db, accountId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .for("key share");
  return Boolean(row);
}

/** Remove the friend_request notification of a request that is no longer pending. */
async function withdrawRequestNotice(
  tx: Db,
  request: { fromId: string; toId: string; createdAt: Date },
): Promise<void> {
  // Created with the request (same moment); none newer can exist while it
  // was pending, because asking again while pending notifies nothing.
  await tx
    .delete(notifications)
    .where(
      and(
        eq(notifications.kind, "friend_request"),
        eq(notifications.recipientId, request.toId),
        eq(notifications.actorId, request.fromId),
        gte(notifications.createdAt, request.createdAt),
      ),
    );
}

/**
 * Accept the pending request requester → accepter, inside `tx`. It takes
 * the pair lock (SPEC §17 item 10), and the update re-checks under it that
 * there is no block, so a block racing with an acceptance either cancels
 * the request first or deletes the friendship after. Returns false when
 * there is no such request.
 */
async function acceptWithin(
  tx: Db,
  requesterId: string,
  accepterId: string,
  now: Date,
): Promise<boolean> {
  await pairLock(tx, requesterId, accepterId);
  const rows = await tx
    .update(friendRequests)
    .set({ status: "accepted", respondedAt: now })
    .where(
      and(
        eq(friendRequests.fromId, requesterId),
        eq(friendRequests.toId, accepterId),
        eq(friendRequests.status, "pending"),
        gt(friendRequests.createdAt, requestCutoff(now)),
        noBlockBetween(requesterId, accepterId),
        sql`exists (select 1 from accounts where id = ${requesterId} and suspended_at is null)`,
      ),
    )
    .returning({ id: friendRequests.id });
  if (rows.length === 0) return false;
  await insertFriendship(tx, requesterId, accepterId, now);
  await notify(tx, {
    recipientId: requesterId,
    kind: "friend_accepted",
    actorId: accepterId,
    now,
  });
  return true;
}

/* ------------------------------------------------------- friend requests */

/**
 * Ask to be friends. Blocked either way is NOT_FOUND; already friends
 * answers already_friends; a crossed request is accepted; rate-limited to
 * 50 a day.
 *
 * Asking again while your request is pending changes nothing and answers
 * `requested` (no second row, no second notification).
 */
export async function sendFriendRequest(
  db: Db,
  fromId: string,
  toId: string,
  now: Date = new Date(),
): Promise<FriendRequestResult> {
  if (fromId === toId) {
    throw invalid("You can't send a friend request to yourself.");
  }
  await assertActive(db, fromId);
  if (!(await canSeeAccount(db, fromId, toId))) {
    throw notFound(PERSON_NOT_FOUND);
  }
  if (await areFriends(db, fromId, toId)) return { status: "already_friends" };

  // Read-only until the lock: pendingBetween already ignores stale
  // requests, and the transaction marks them expired under the pair lock.
  const pending = await pendingBetween(db, fromId, toId, now);
  if (pending?.fromId === fromId) return { status: "requested" };
  if (pending?.fromId === toId) {
    // Crossed requests: they already asked you, so "add" accepts.
    const accepted = await withTx(db, (tx) => acceptWithin(tx, toId, fromId, now));
    if (accepted) return { status: "accepted" };
    throw notFound(PERSON_NOT_FOUND);
  }

  // Before the transaction: a limit hit inside it would roll back with it.
  await hit(db, `friendreq:${fromId}`, { ...RATE.friendRequest, now });

  try {
    const result = await withTx(db, async (tx): Promise<FriendRequestResult> => {
      // Serialize with a block between the two, then look again under the
      // lock (SPEC §17 item 10): whatever committed since the checks above
      // decides the answer.
      await pairLock(tx, fromId, toId);
      if (!(await canSeeAccount(tx, fromId, toId))) {
        throw notFound(PERSON_NOT_FOUND);
      }
      if (await areFriends(tx, fromId, toId)) return { status: "already_friends" };
      await expireStaleForPair(tx, fromId, toId, now);
      const current = await pendingBetween(tx, fromId, toId, now);
      if (current?.fromId === fromId) return { status: "requested" };
      if (current?.fromId === toId) {
        if (await acceptWithin(tx, toId, fromId, now)) return { status: "accepted" };
        throw notFound(PERSON_NOT_FOUND);
      }
      await tx.insert(friendRequests).values({
        id: newId(),
        fromId,
        toId,
        status: "pending",
        createdAt: now,
      });
      await notify(tx, {
        recipientId: toId,
        kind: "friend_request",
        actorId: fromId,
        now,
      });
      return { status: "requested" };
    });
    return result;
  } catch (error) {
    if (!isUniqueViolation(error, "friend_requests_one_pending_per_pair")) {
      throw error;
    }
    // A request between the pair was created while this one was in
    // flight. Answer from the state that won.
    const winner = await pendingBetween(db, fromId, toId, now);
    if (winner?.fromId === toId) {
      const accepted = await withTx(db, (tx) => acceptWithin(tx, toId, fromId, now));
      if (accepted) return { status: "accepted" };
    }
    if (await areFriends(db, fromId, toId)) return { status: "already_friends" };
    return { status: "requested" };
  }
}

/** Accept the pending request from `fromId` to `accountId`. */
export async function acceptFriendRequest(
  db: Db,
  accountId: string,
  fromId: string,
  now: Date = new Date(),
): Promise<void> {
  await assertActive(db, accountId);
  if (accountId === fromId || !(await canSeeAccount(db, accountId, fromId))) {
    throw notFound(REQUEST_NOT_FOUND);
  }
  await expireStaleForPair(db, accountId, fromId, now);
  const accepted = await withTx(db, (tx) => acceptWithin(tx, fromId, accountId, now));
  if (!accepted) throw notFound(REQUEST_NOT_FOUND);
}

/**
 * Decline the pending request from `fromId` to `accountId`, and remove its
 * friend_request notification (SPEC §17 item 13). The sender gets no
 * notification, but can see that the request is no longer pending: that is
 * accepted, and /rules says so.
 */
export async function declineFriendRequest(
  db: Db,
  accountId: string,
  fromId: string,
  now: Date = new Date(),
): Promise<void> {
  await assertActive(db, accountId);
  // A person you may not see is the same NOT_FOUND as a request that is
  // not there, as for accept: a suspension is not told apart from a
  // deletion (the second verification's privacy defect 4).
  if (accountId === fromId || !(await canSeeAccount(db, accountId, fromId))) {
    throw notFound(REQUEST_NOT_FOUND);
  }
  await expireStaleForPair(db, accountId, fromId, now);
  await withTx(db, async (tx) => {
    const rows = await tx
      .update(friendRequests)
      .set({ status: "declined", respondedAt: now })
      .where(
        and(
          eq(friendRequests.fromId, fromId),
          eq(friendRequests.toId, accountId),
          eq(friendRequests.status, "pending"),
          gt(friendRequests.createdAt, requestCutoff(now)),
        ),
      )
      .returning({
        fromId: friendRequests.fromId,
        toId: friendRequests.toId,
        createdAt: friendRequests.createdAt,
      });
    if (rows.length === 0) throw notFound(REQUEST_NOT_FOUND);
    for (const row of rows) await withdrawRequestNotice(tx, row);
  });
}

/**
 * Cancel your pending request to `toId`, and remove its friend_request
 * notification (SPEC §17 item 13), so sending and cancelling again and
 * again leaves the other person nothing.
 */
export async function cancelFriendRequest(
  db: Db,
  accountId: string,
  toId: string,
  now: Date = new Date(),
): Promise<void> {
  await assertActive(db, accountId);
  // As for decline: someone you may not see is a request that is not there.
  if (accountId === toId || !(await canSeeAccount(db, accountId, toId))) {
    throw notFound(REQUEST_NOT_FOUND);
  }
  await expireStaleForPair(db, accountId, toId, now);
  await withTx(db, async (tx) => {
    const rows = await tx
      .update(friendRequests)
      .set({ status: "cancelled", respondedAt: now })
      .where(
        and(
          eq(friendRequests.fromId, accountId),
          eq(friendRequests.toId, toId),
          eq(friendRequests.status, "pending"),
          gt(friendRequests.createdAt, requestCutoff(now)),
        ),
      )
      .returning({
        fromId: friendRequests.fromId,
        toId: friendRequests.toId,
        createdAt: friendRequests.createdAt,
      });
    if (rows.length === 0) throw notFound(REQUEST_NOT_FOUND);
    for (const row of rows) await withdrawRequestNotice(tx, row);
  });
}

/**
 * End a friendship. Takes effect at once: friends-only posts stop being
 * visible through the one visibility predicate. Being friends again needs a
 * new request and a new acceptance. Unfriending someone you are not friends
 * with changes nothing.
 */
export async function unfriend(
  db: Db,
  accountId: string,
  otherId: string,
): Promise<void> {
  await assertActive(db, accountId);
  if (accountId === otherId) return;
  const [aId, bId] = accountId < otherId ? [accountId, otherId] : [otherId, accountId];
  await db
    .delete(friendships)
    .where(and(eq(friendships.aId, aId), eq(friendships.bId, bId)));
}

/* ---------------------------------------------------------------- follows */

/**
 * Allowed only if the followee accepts followers, is not you, and no block.
 * A new follow notifies the followee (new_follower); following again
 * changes nothing. Limited to 100 new follows a day (SPEC §17 item 13).
 *
 * The write serializes with a block between the two (the pair lock) and
 * with the followee switching followers off (their account row, locked
 * `for share`; `setAcceptsFollowers` updates that row before it deletes
 * follows). Both are checked again under those locks (SPEC §17 item 10),
 * so a follow never outlives a block or the switch.
 */
export async function follow(
  db: Db,
  followerId: string,
  followeeId: string,
  now: Date = new Date(),
): Promise<void> {
  if (followerId === followeeId) throw invalid("You can't follow yourself.");
  await assertActive(db, followerId);
  if (!(await canSeeAccount(db, followerId, followeeId))) {
    throw notFound(PERSON_NOT_FOUND);
  }
  const [followee] = await db
    .select({ acceptsFollowers: accounts.acceptsFollowers })
    .from(accounts)
    .where(eq(accounts.id, followeeId))
    .limit(1);
  if (!followee) throw notFound(PERSON_NOT_FOUND);
  if (!followee.acceptsFollowers) {
    throw forbidden("This person doesn't accept followers.");
  }
  // Following again changes nothing, and does not count toward the limit.
  const [already] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .limit(1);
  if (already) return;

  // Before the transaction: a limit hit inside it would roll back with it.
  await hit(db, `follow:${followerId}`, { ...RATE.follow, now });

  await withTx(db, async (tx) => {
    await pairLock(tx, followerId, followeeId);
    const [row] = await tx
      .select({
        acceptsFollowers: accounts.acceptsFollowers,
        suspendedAt: accounts.suspendedAt,
      })
      .from(accounts)
      .where(eq(accounts.id, followeeId))
      .for("share");
    if (!row || row.suspendedAt || !(await canSeeAccount(tx, followerId, followeeId))) {
      throw notFound(PERSON_NOT_FOUND);
    }
    if (!row.acceptsFollowers) {
      throw forbidden("This person doesn't accept followers.");
    }
    const inserted = await tx
      .insert(follows)
      .values({ followerId, followeeId, createdAt: now })
      .onConflictDoNothing()
      .returning({ followerId: follows.followerId });
    if (inserted.length > 0) {
      await notify(tx, {
        recipientId: followeeId,
        kind: "new_follower",
        actorId: followerId,
        now,
      });
    }
  });
}

/**
 * Stop following, and take back the new_follower notification (SPEC §17
 * item 13), so following and unfollowing again and again cannot flood
 * anyone. Unfollowing someone you do not follow changes nothing.
 */
export async function unfollow(
  db: Db,
  followerId: string,
  followeeId: string,
): Promise<void> {
  await assertActive(db, followerId);
  await withTx(db, async (tx) => {
    await tx
      .delete(follows)
      .where(
        and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)),
      );
    await tx
      .delete(notifications)
      .where(
        and(
          eq(notifications.kind, "new_follower"),
          eq(notifications.recipientId, followeeId),
          eq(notifications.actorId, followerId),
        ),
      );
  });
}

/* ----------------------------------------------------------------- blocks */

/**
 * Block, at once and in one transaction (SPEC §6):
 *
 * - it cancels pending friend requests both ways;
 * - it deletes the friendship;
 * - it deletes follows both ways;
 * - it deletes likes by each on the other's posts;
 * - it deletes notifications whose actor is the other person.
 *
 * Replies stay, hidden between the two by the visibility rule. Blocking
 * someone already blocked runs the same effects again, which is harmless.
 * Any existing account can be blocked, including one that blocked you:
 * refusing would tell you that they had. For the same reason, blocking an
 * account that does not exist succeeds and writes nothing (SPEC §17
 * item 11).
 *
 * It takes the pair lock first (SPEC §17 item 10), so every other write
 * between the two either commits before it (and is removed here) or waits
 * for it (and then finds the block and refuses).
 */
export async function block(
  db: Db,
  blockerId: string,
  blockedId: string,
  now: Date = new Date(),
): Promise<void> {
  if (blockerId === blockedId) throw invalid("You can't block yourself.");
  await assertActive(db, blockerId);

  const x = blockerId;
  const y = blockedId;
  await withTx(db, async (tx) => {
    await pairLock(tx, x, y);
    if (!(await lockExisting(tx, y))) return;

    await tx
      .insert(blocks)
      .values({ blockerId: x, blockedId: y, createdAt: now })
      .onConflictDoNothing();

    await tx
      .update(friendRequests)
      .set({ status: "cancelled", respondedAt: now })
      .where(
        and(
          eq(friendRequests.status, "pending"),
          pairOf(friendRequests.fromId, friendRequests.toId, x, y),
        ),
      );

    const [aId, bId] = x < y ? [x, y] : [y, x];
    await tx
      .delete(friendships)
      .where(and(eq(friendships.aId, aId), eq(friendships.bId, bId)));

    await tx
      .delete(follows)
      .where(pairOf(follows.followerId, follows.followeeId, x, y));

    await tx.delete(likes).where(
      or(
        and(
          eq(likes.accountId, x),
          inArray(
            likes.postId,
            tx.select({ id: posts.id }).from(posts).where(eq(posts.authorId, y)),
          ),
        ),
        and(
          eq(likes.accountId, y),
          inArray(
            likes.postId,
            tx.select({ id: posts.id }).from(posts).where(eq(posts.authorId, x)),
          ),
        ),
      ),
    );

    await tx
      .delete(notifications)
      .where(pairOf(notifications.recipientId, notifications.actorId, x, y));
  });
}

/**
 * Remove your block. Nothing that the block removed comes back. Takes the
 * pair lock (SPEC §17 item 10), like every write between the two.
 */
export async function unblock(
  db: Db,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await assertActive(db, blockerId);
  await withTx(db, async (tx) => {
    await pairLock(tx, blockerId, blockedId);
    await tx
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
  });
}

/* ------------------------------------------------------------------ mutes */

/**
 * Mute: hides their posts from your feed only. Private: nobody is told,
 * and nothing else changes. Muting an account that does not exist succeeds
 * and writes nothing, the same answer as for anyone else (SPEC §17
 * item 11).
 */
export async function mute(
  db: Db,
  muterId: string,
  mutedId: string,
  now: Date = new Date(),
): Promise<void> {
  if (muterId === mutedId) throw invalid("You can't mute yourself.");
  await assertActive(db, muterId);
  await withTx(db, async (tx) => {
    if (!(await lockExisting(tx, mutedId))) return;
    await tx
      .insert(mutes)
      .values({ muterId, mutedId, createdAt: now })
      .onConflictDoNothing();
  });
}

export async function unmute(
  db: Db,
  muterId: string,
  mutedId: string,
): Promise<void> {
  await assertActive(db, muterId);
  await db
    .delete(mutes)
    .where(and(eq(mutes.muterId, muterId), eq(mutes.mutedId, mutedId)));
}

/* ------------------------------------------------------------------ lists */

const person = {
  id: accounts.id,
  handle: accounts.handle,
  displayName: accounts.displayName,
};

/** Your friends, newest friendship first. Suspended people and blocks are left out. */
export async function listFriends(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  return db
    .select({ ...person, since: friendships.createdAt })
    .from(friendships)
    .innerJoin(
      accounts,
      or(
        and(eq(friendships.aId, accountId), eq(accounts.id, friendships.bId)),
        and(eq(friendships.bId, accountId), eq(accounts.id, friendships.aId)),
      ),
    )
    .where(and(isNull(accounts.suspendedAt), noBlockBetween(accountId, accounts.id)))
    .orderBy(desc(friendships.createdAt), accounts.handle);
}

/**
 * Pending, unexpired requests to you (incoming) and from you (outgoing),
 * newest first. Stale ones are marked expired here.
 */
export async function listRequests(
  db: Db,
  accountId: string,
  now: Date = new Date(),
): Promise<{ incoming: RequestRow[]; outgoing: RequestRow[] }> {
  await expireStaleForAccount(db, accountId, now);
  const cutoff = requestCutoff(now);
  const select = {
    id: friendRequests.id,
    createdAt: friendRequests.createdAt,
    personId: accounts.id,
    handle: accounts.handle,
    displayName: accounts.displayName,
  };
  const toRow = (r: {
    id: string;
    createdAt: Date;
    personId: string;
    handle: string;
    displayName: string;
  }): RequestRow => ({
    id: r.id,
    person: { id: r.personId, handle: r.handle, displayName: r.displayName },
    createdAt: r.createdAt,
  });
  const [incoming, outgoing] = await Promise.all([
    db
      .select(select)
      .from(friendRequests)
      .innerJoin(accounts, eq(accounts.id, friendRequests.fromId))
      .where(
        and(
          eq(friendRequests.toId, accountId),
          eq(friendRequests.status, "pending"),
          gt(friendRequests.createdAt, cutoff),
          isNull(accounts.suspendedAt),
          noBlockBetween(accountId, accounts.id),
        ),
      )
      .orderBy(desc(friendRequests.createdAt), desc(friendRequests.id)),
    db
      .select(select)
      .from(friendRequests)
      .innerJoin(accounts, eq(accounts.id, friendRequests.toId))
      .where(
        and(
          eq(friendRequests.fromId, accountId),
          eq(friendRequests.status, "pending"),
          gt(friendRequests.createdAt, cutoff),
          isNull(accounts.suspendedAt),
          noBlockBetween(accountId, accounts.id),
        ),
      )
      .orderBy(desc(friendRequests.createdAt), desc(friendRequests.id)),
  ]);
  return { incoming: incoming.map(toRow), outgoing: outgoing.map(toRow) };
}

/**
 * People you follow, newest first: only those who still accept followers,
 * are active, and with no block either way (SPEC §6 follows(V,A)).
 */
export async function listFollowing(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  return db
    .select({ ...person, since: follows.createdAt })
    .from(follows)
    .innerJoin(accounts, eq(accounts.id, follows.followeeId))
    .where(
      and(
        eq(follows.followerId, accountId),
        eq(accounts.acceptsFollowers, true),
        isNull(accounts.suspendedAt),
        noBlockBetween(accountId, accounts.id),
      ),
    )
    .orderBy(desc(follows.createdAt), accounts.handle);
}

/** People who follow you, newest first; empty while you do not accept followers. */
export async function listFollowers(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  return db
    .select({ ...person, since: follows.createdAt })
    .from(follows)
    .innerJoin(accounts, eq(accounts.id, follows.followerId))
    .where(
      and(
        eq(follows.followeeId, accountId),
        sql`exists (select 1 from accounts me where me.id = ${accountId} and me.accepts_followers)`,
        isNull(accounts.suspendedAt),
        noBlockBetween(accountId, accounts.id),
      ),
    )
    .orderBy(desc(follows.createdAt), accounts.handle);
}

/**
 * People you blocked, newest first, as far as they may be shown to you
 * (`personShownTo` besides your own block, SPEC §17 item 11): someone
 * suspended, or who blocked you, drops out like a deleted account, so the
 * list never names a person whose profile is not found to you (the second
 * verification's privacy defect 1). The block row stays and holds: if they
 * unblock you, or are reinstated, they are listed again.
 */
export async function listBlocked(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  return db
    .select({ ...person, since: blocks.createdAt })
    .from(blocks)
    .innerJoin(accounts, eq(accounts.id, blocks.blockedId))
    .where(
      and(
        eq(blocks.blockerId, accountId),
        personShownTo(accountId, blocks.blockedId, { besidesOwnBlock: true }),
      ),
    )
    .orderBy(desc(blocks.createdAt), accounts.handle);
}

/**
 * People you muted, newest first, as far as they may be shown to you
 * (`personShownTo`, SPEC §17 item 11): someone suspended, or with a block
 * either way, drops out like a deleted account. The mute row stays; it has
 * no effect while a block stands.
 */
export async function listMuted(
  db: Db,
  accountId: string,
): Promise<PersonRow[]> {
  return db
    .select({ ...person, since: mutes.createdAt })
    .from(mutes)
    .innerJoin(accounts, eq(accounts.id, mutes.mutedId))
    .where(and(eq(mutes.muterId, accountId), personShownTo(accountId, mutes.mutedId)))
    .orderBy(desc(mutes.createdAt), accounts.handle);
}
