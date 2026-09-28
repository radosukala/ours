/**
 * The counts (SPEC §10 /api/health, §13): how many accounts, friendships
 * and posts in the last 7 days. Numbers only — no names, no ids, no
 * addresses — and whether the database answered, as a yes or no. An error's
 * message is never returned: it can carry a host name or a query.
 */
import { count, gt, isNull } from "drizzle-orm";
import type { Db } from "./db";
import { accounts, friendships, posts } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Counts = {
  accounts: number;
  friendships: number;
  postsLast7Days: number;
};

/** The three counts. Throws if the database cannot be read. */
export async function counts(db: Db, now: Date = new Date()): Promise<Counts> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const [a, f, p] = await Promise.all([
    // The same number as the front page's (D-0012 §B): accounts that exist
    // and are not suspended.
    db.select({ n: count() }).from(accounts).where(isNull(accounts.suspendedAt)),
    db.select({ n: count() }).from(friendships),
    db.select({ n: count() }).from(posts).where(gt(posts.createdAt, since)),
  ]);
  return {
    accounts: Number(a[0]?.n ?? 0),
    friendships: Number(f[0]?.n ?? 0),
    postsLast7Days: Number(p[0]?.n ?? 0),
  };
}

export type Health = {
  /** Whether the database answered. */
  database: boolean;
  /** The counts, or null when the database did not answer. */
  counts: Counts | null;
};

/**
 * Never throws. `open` returns the database handle; it is called inside the
 * guard, so a missing DATABASE_URL is "database: false", not a crash.
 */
export async function health(open: () => Db, now: Date = new Date()): Promise<Health> {
  try {
    const db = open();
    return { database: true, counts: await counts(db, now) };
  } catch (error) {
    console.error(
      "[ours] health: the database did not answer:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { database: false, counts: null };
  }
}
