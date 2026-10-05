/**
 * Named apps (D-0024 §B, SPEC §18.23, M-0021): what a visitor typed to *"Which
 * app would you take back?"*, kept as its words and the day, and counted.
 *
 * - **Nothing identifies one.** The row holds the words, a day in UTC and a
 *   random id: no address, no account, no network address, no browser
 *   detail. `recordNeed` is given the words and the time and nothing else,
 *   so there is nothing here for it to keep.
 * - **Nothing shows one.** `needCount` is the only thing that reads the
 *   table, and it reads a number. The founder reads the words in the
 *   database; nothing publishes, lists, groups or ranks them.
 * - **It is never a reason to refuse a seat.** The seat request (seats.ts)
 *   keeps a need only after it has passed the same two rate limits a seat
 *   request has, and a need that can't be kept (the table isn't there yet,
 *   the database is unwell) is logged by name and the person is still given
 *   the one answer: `keepNeed`.
 * - **It is not authority.** The count is not a vote, a commission or a
 *   promise (D-0024; AGENTS.md §5).
 */
import { count } from "drizzle-orm";
import type { Db } from "./db";
import { describeError } from "./db-errors";
import { needs } from "./schema";

/** The day, in UTC, as `YYYY-MM-DD`: all the time a named app keeps. */
export function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Keep a named app: its words and the day. `words` is what `validNeed` returned. */
export async function recordNeed(db: Db, words: string, now: Date = new Date()): Promise<void> {
  await db.insert(needs).values({ body: words, namedOn: dayOf(now) });
}

/**
 * Keep a named app for a seat request, without ever failing it. The log
 * says what went wrong and its code, never the message (which can name the
 * database) and never the words.
 */
export async function keepNeed(db: Db, words: string, now: Date = new Date()): Promise<boolean> {
  try {
    await recordNeed(db, words, now);
    return true;
  } catch (error) {
    console.error(`[ours] a named app was not kept: ${describeError(error)}`);
    return false;
  }
}

/** How many have been named: the number the front door shows. */
export async function needCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(needs);
  return Number(row?.n ?? 0);
}
