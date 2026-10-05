/**
 * Needs named on the front door (D-0024 §C, SPEC §18.23): the answer to
 * "Which app would you take back?", written beside the address in the
 * same form.
 *
 * - A need is kept without the address, and nothing here takes one: the
 *   table has no column for it, and this module never sees it.
 * - It rides on the seat request's gates and rate limits: the action calls
 *   `requestSeat` first, and only then `nameNeed`. This module adds no gate
 *   of its own, so it is never called on its own in production code.
 * - It is read by the founder, counted in public, and never shown to a
 *   visitor or a member under M-0021. Kept for 12 months, or until a
 *   decision publishes or deletes them; nothing removes them automatically
 *   yet, and the privacy notice says so.
 */
import { count } from "drizzle-orm";
import type { Db } from "./db";
import { invalid } from "./errors";
import { newId } from "./ids";
import { needs } from "./schema";

/** The most a need may hold, in characters, as the table checks it. */
export const NEED_MAX = 140;

/** How long a need is kept (D-0024 §C), as the privacy notice says it. */
export const NEED_KEPT_MONTHS = 12;

/** The question, as the form asks it. */
export const NEED_LABEL = "Which app would you take back?";

/** The refusal for a need that is too long, shown at the field. */
export const NEED_TOO_LONG = `Keep it to ${NEED_MAX} characters.`;

/**
 * The need as it is kept: whitespace collapsed to single spaces, ends
 * trimmed, no control characters. Empty (nothing written, or only spaces)
 * is null: the form's field is optional. Longer than `NEED_MAX` is
 * refused (INVALID), so the person can shorten it; the browser's own
 * `maxLength` makes that rare.
 */
export function normalizeNeed(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (text === "") return null;
  if ([...text].length > NEED_MAX) throw invalid(NEED_TOO_LONG);
  return text;
}

/** Keep a need: its words and when. Returns the row's id. */
export async function nameNeed(db: Db, input: { text: string; now?: Date }): Promise<string> {
  const text = normalizeNeed(input.text);
  if (text === null) throw invalid("Write the app's name, or leave it empty.");
  const id = newId();
  await db.insert(needs).values({ id, text, createdAt: input.now ?? new Date() });
  return id;
}

/** How many needs have been named: the public count beside the form. */
export async function needsCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(needs);
  return Number(row?.n ?? 0);
}

/** The public count's line: "1 app named so far.", "37 apps named so far." */
export function needsLine(n: number): string {
  if (n === 1) return "1 app named so far.";
  return `${n.toLocaleString("en-US")} apps named so far.`;
}
