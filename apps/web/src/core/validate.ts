/**
 * Input validation. Each function takes what a person typed and returns the
 * value to store, or throws `CoreError('INVALID')` with a sentence that says
 * what to fix. Lengths count characters (code points), the way Postgres's
 * char_length does, so an emoji is one character.
 */
import { invalid } from "./errors";

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "ours",
  "api",
  "home",
  "settings",
  "people",
  "notifications",
  "signin",
  "join",
  "rules",
  "privacy",
  "costs",
  "power",
  "report",
  "about",
  "help",
  "support",
  "official",
  "root",
  "system",
  "null",
  "undefined",
]);

export const LIMITS = {
  emailMax: 254,
  displayNameMax: 50,
  bioMax: 160,
  postMax: 2000,
  replyMax: 1000,
  noteMax: 40,
  reportDetailsMax: 500,
} as const;

/** Length in characters (code points). */
export function charCount(value: string): number {
  let n = 0;
  for (const _ of value) n++;
  return n;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const CONTROL_EXCEPT_NEWLINE_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ANY_CONTROL = /[\u0000-\u001F\u007F]/;

/** Normalise line endings and drop control characters other than \n and \t. */
function cleanText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_EXCEPT_NEWLINE_TAB, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased and trimmed. Throws INVALID if it is not an email address. */
export function normEmail(input: unknown): string {
  const email = asString(input).trim().toLowerCase();
  if (
    !email ||
    email.length > LIMITS.emailMax ||
    !EMAIL_PATTERN.test(email) ||
    ANY_CONTROL.test(email)
  ) {
    throw invalid("Enter a valid email address.");
  }
  return email;
}

/** A handle: lowercased, a leading @ ignored, 3–20 of a–z, 0–9 and _, not reserved. */
export function validHandle(input: unknown): string {
  const handle = asString(input).trim().replace(/^@/, "").toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw invalid(
      "A username is 3–20 characters: letters a–z, numbers and underscores.",
    );
  }
  if (RESERVED_HANDLES.has(handle)) {
    throw invalid("That username is reserved. Choose another.");
  }
  return handle;
}

/**
 * Invisible formatting and text-direction characters: zero-width spaces and
 * joiners, the direction marks, embeddings, overrides and isolates, the
 * word joiner and invisible operators, and the byte-order mark. In a name
 * they can reorder whatever follows it, such as "(@handle)".
 */
// Every default-ignorable (invisible) code point and every bidi control, so
// a soft hyphen or a letter mark cannot break "@handle" apart unseen (the
// re-check's finding). The emoji variation selectors U+FE0E/U+FE0F are
// allowed: they only choose how an emoji is drawn.
const FORMAT_CHARACTERS = /(?![\uFE0E\uFE0F])[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}]/u;
/** An at sign (or its full-width or small form) followed by a letter, digit or underscore. */
const HANDLE_LIKE = /[@\uFF20\uFE6B][\p{L}\p{N}_\uFF3F]/u;

/**
 * 1–50 characters after trimming; runs of whitespace become one space.
 *
 * A name is shown as "Name (@handle)" wherever a person must know who is
 * asking (SPEC §17 items 1–2), and the handle is what cannot be copied. So
 * a name may not carry something that reads as a handle, nor characters
 * that reorder the text after it (the second verification's identity
 * defect 2).
 */
export function validDisplayName(input: unknown): string {
  // Before whitespace is collapsed: JavaScript counts U+FEFF as a space.
  if (FORMAT_CHARACTERS.test(asString(input))) {
    throw invalid("A name can't include invisible or text-direction characters.");
  }
  const name = asString(input)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const n = charCount(name);
  if (n < 1) throw invalid("Enter a name.");
  if (n > LIMITS.displayNameMax) {
    throw invalid(`A name can be at most ${LIMITS.displayNameMax} characters.`);
  }
  if (HANDLE_LIKE.test(name)) {
    throw invalid("A name can't include an @username. Your username is shown next to it.");
  }
  return name;
}

/** Up to 160 characters after trimming; may be empty. */
export function validBio(input: unknown): string {
  const bio = cleanText(asString(input)).trim();
  if (charCount(bio) > LIMITS.bioMax) {
    throw invalid(`A bio can be at most ${LIMITS.bioMax} characters.`);
  }
  return bio;
}

/** 1–2000 characters after trimming. Line breaks are kept. */
export function validPostBody(input: unknown): string {
  const body = cleanText(asString(input)).trim();
  const n = charCount(body);
  if (n < 1) throw invalid("Write something first.");
  if (n > LIMITS.postMax) {
    throw invalid(`A post can be at most ${LIMITS.postMax} characters.`);
  }
  return body;
}

/** 1–1000 characters after trimming. Line breaks are kept. */
export function validReplyBody(input: unknown): string {
  const body = cleanText(asString(input)).trim();
  const n = charCount(body);
  if (n < 1) throw invalid("Write something first.");
  if (n > LIMITS.replyMax) {
    throw invalid(`A reply can be at most ${LIMITS.replyMax} characters.`);
  }
  return body;
}

/** An invite's private note: up to 40 characters, may be empty. */
export function validNote(input: unknown): string {
  const note = asString(input)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (charCount(note) > LIMITS.noteMax) {
    throw invalid(`A note can be at most ${LIMITS.noteMax} characters.`);
  }
  return note;
}

/** A report's details: up to 500 characters, may be empty. */
export function validReportDetails(input: unknown): string {
  const details = cleanText(asString(input)).trim();
  if (charCount(details) > LIMITS.reportDetailsMax) {
    throw invalid(
      `Details can be at most ${LIMITS.reportDetailsMax} characters.`,
    );
  }
  return details;
}
