/**
 * Needs named on the front door (D-0024 §C, SPEC §18.23): the answer to
 * "Which app would you take back?", written beside the address in the
 * same form. The words and the rule are in need-words.ts; this module is
 * what touches the database.
 *
 * - A need is kept without the address, and nothing here takes one: the
 *   table has no column for it, and this module never sees it. Its time
 *   is kept to the day, not the moment it came (the verification of
 *   M-0021, H1), so the words and the day are all that is kept.
 * - It rides on the seat request's gates and rate limits: the action calls
 *   `requestSeat` first, and only then `nameNeed`. This module adds no gate
 *   of its own, so it is never called on its own in production code.
 * - It is read by the founder, counted in public, and never shown to a
 *   visitor or a member under M-0021. Kept for 12 months, or until a
 *   decision publishes or deletes them; nothing removes them automatically
 *   yet, and the privacy notice says so.
 */
import { countDistinct, sql } from "drizzle-orm";
import type { Db } from "./db";
import { invalid } from "./errors";
import { newId } from "./ids";
import { normalizeNeed } from "./need-words";
import { needs } from "./schema";

export { NEED_KEPT_MONTHS, NEED_LABEL, NEED_MAX, NEED_TOO_LONG, needsLine, normalizeNeed } from "./need-words";

/** The day a moment falls on, in UTC: what is kept of "when". */
export function dayOf(moment: Date): Date {
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));
}

/** Keep a need: its words and the day. Returns the row's id. */
export async function nameNeed(db: Db, input: { text: string; now?: Date }): Promise<string> {
  const text = normalizeNeed(input.text);
  if (text === null) throw invalid("Write the app's name, or leave it empty.");
  const id = newId();
  await db.insert(needs).values({ id, text, createdAt: dayOf(input.now ?? new Date()) });
  return id;
}

/**
 * How many apps have been named: the distinct texts, read without regard
 * to case, so one app named three times is one. The public count beside
 * the form.
 */
export async function needsCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: countDistinct(sql`lower(${needs.text})`) }).from(needs);
  return Number(row?.n ?? 0);
}
