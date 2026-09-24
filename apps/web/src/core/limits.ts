/**
 * Rate limits, counted in the database so they hold across processes.
 *
 * `hit` takes a transaction-scoped advisory lock on the key, so two
 * concurrent requests cannot both pass the last free slot.
 */
import { and, count, eq, gt, lt, lte, sql } from "drizzle-orm";
import { type Db, withTx } from "./db";
import { CoreError } from "./errors";
import { hmac, newId } from "./ids";
import { sessionSecret } from "./config";
import { rateEvents } from "./schema";

const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export const RATE_LIMITED_MESSAGE =
  "You've done that too many times. Try again later.";

/**
 * The keyed hash every rate-limit key built from a person's email or IP
 * address must use. A plain sha256 of an IPv4 address can be reversed by
 * trying all of them; an HMAC under the server's secret cannot. Purpose-
 * tagged so it can never equal a session or cookie signature.
 */
export function rateKeyHash(value: string): string {
  return hmac(sessionSecret(), `rate:${value}`);
}

/**
 * Record one event for `key`, or throw RATE_LIMITED when `max` events
 * already fall within the last `windowSec` seconds. Rows of every key older
 * than 24 hours (or the window, if longer) are pruned on every call.
 */
export async function hit(
  db: Db,
  key: string,
  {
    max,
    windowSec,
    now = new Date(),
  }: { max: number; windowSec: number; now?: Date },
): Promise<void> {
  if (!key) throw new Error("rate limit key is empty");
  if (!(max >= 1 && windowSec > 0)) {
    throw new Error("rate limit needs max >= 1 and a positive window");
  }
  // SPEC §8's windows are all 24 hours or less, so this prunes at 24 hours.
  // A longer window keeps its own rows, so pruning can never undercount.
  const pruneBefore = new Date(
    now.getTime() - Math.max(PRUNE_AFTER_MS, windowSec * 1000),
  );
  await withTx(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

    // Prune every key, not only this one: a key that is never hit again
    // (one IP address, one email) must not stay in the table for ever.
    await tx.delete(rateEvents).where(lt(rateEvents.createdAt, pruneBefore));

    const since = new Date(now.getTime() - windowSec * 1000);
    const [row] = await tx
      .select({ n: count() })
      .from(rateEvents)
      .where(
        and(
          eq(rateEvents.key, key),
          gt(rateEvents.createdAt, since),
          lte(rateEvents.createdAt, now),
        ),
      );
    if ((row?.n ?? 0) >= max) {
      throw new CoreError("RATE_LIMITED", RATE_LIMITED_MESSAGE);
    }

    await tx.insert(rateEvents).values({ id: newId(), key, createdAt: now });
  });
}

/** The rate limits SPEC §8 and §17 set, in one place. */
export const RATE = {
  signinEmail: { max: 5, windowSec: 60 * 60 },
  signinIp: { max: 20, windowSec: 60 * 60 },
  joinEmail: { max: 3, windowSec: 60 * 60 },
  joinIp: { max: 10, windowSec: 60 * 60 },
  /** `join:invite:<inviteId>`: join links one invite can send, SPEC §17 item 3. */
  joinInvite: { max: 10, windowSec: 24 * 60 * 60 },
  post: { max: 50, windowSec: 24 * 60 * 60 },
  reply: { max: 200, windowSec: 24 * 60 * 60 },
  friendRequest: { max: 50, windowSec: 24 * 60 * 60 },
  /** `follow:<accountId>`, SPEC §17 item 13. */
  follow: { max: 100, windowSec: 24 * 60 * 60 },
  report: { max: 20, windowSec: 24 * 60 * 60 },
  invite: { max: 20, windowSec: 24 * 60 * 60 },
  /**
   * `handle:<accountId>`: tries at a new username, SPEC §17 item 9. A taken
   * name answers CONFLICT, so every try counts, whether or not it succeeds.
   */
  handle: { max: 5, windowSec: 24 * 60 * 60 },
} as const;
