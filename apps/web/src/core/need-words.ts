/**
 * The words and the rule of a need named on the front door (D-0024 §C,
 * SPEC §18.23), in a plain module: the form (a client component), the
 * action and the core read the same ones, and the form pulls in neither
 * the schema nor the database (the verification of M-0021, H8). What
 * touches the database is in needs.ts.
 */
import { invalid } from "./errors";

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
 * trimmed, every control character (Unicode's Cc, the C1 set included)
 * and every one of the twelve bidirectional controls (Unicode's
 * Bidi_Control) dropped. Empty (nothing written, or only
 * spaces) is null: the form's field is optional. Longer than `NEED_MAX`
 * is refused (INVALID), so the person can shorten it; the browser's own
 * `maxLength` makes that rare.
 */
export function normalizeNeed(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return null;
  if ([...text].length > NEED_MAX) throw invalid(NEED_TOO_LONG);
  return text;
}

/**
 * The public count's line: "1 app named so far.", "37 apps named so far."
 * (D-0024 §C's words). It counts apps, not answers: `needsCount` counts
 * the distinct texts, so one app named three times is one.
 */
export function needsLine(n: number): string {
  if (n === 1) return "1 app named so far.";
  return `${n.toLocaleString("en-US")} apps named so far.`;
}
