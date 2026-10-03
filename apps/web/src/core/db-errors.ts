/**
 * A database error, told without its message (the verification of M-0018,
 * R5, and its re-check, RC10): what it means and its code. A message from
 * Postgres or drizzle can name the database, a user, a host or a query's
 * parameters; a code names none of them.
 */

/** What a database error means, by its code, in words that name nothing of the address. */
const ERROR_WORDS: Readonly<Record<string, string>> = {
  "57P01": "the database ended the connection",
  "28P01": "the database refused the password",
  "28000": "the database refused the user",
  "3D000": "the database the address names doesn't exist",
  "42P07": "something the migrations create exists already",
  "42710": "something the migrations create exists already",
  "23505": "a row the release adds exists already",
  ECONNREFUSED: "the database refused the connection",
  ECONNRESET: "the database closed the connection",
  ENOTFOUND: "the database's host wasn't found",
  EAI_AGAIN: "the database's host couldn't be looked up",
  ETIMEDOUT: "the connection to the database timed out",
};

/** pg's own words for a server without TLS, which the release requires: they name nothing of the address. */
const NO_TLS = "The server does not support SSL connections";

/** The first code on an error, its cause, or the errors it gathers (a host with several addresses). */
function codeOf(error: unknown, depth = 0): string | null {
  if (depth > 4 || typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && /^[A-Z0-9_]{2,20}$/.test(code)) return code;
  const nested = [(error as { cause?: unknown }).cause, ...(((error as { errors?: unknown }).errors as unknown[]) ?? [])];
  for (const inner of nested) {
    const found = codeOf(inner, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * A database error in a log: what it means and its code, never its
 * message, which can name the database, a user or a host (the verification
 * of M-0018). The release step and the local scripts both print it (the
 * re-check, RC10).
 */
export function describeError(error: unknown): string {
  const code = codeOf(error);
  if (code) return ERROR_WORDS[code] ? `${ERROR_WORDS[code]} (${code}).` : `error code ${code}.`;
  const messages = [error, (error as { cause?: unknown } | null)?.cause].map((e) => (e instanceof Error ? e.message : ""));
  if (messages.some((m) => m.startsWith(NO_TLS))) return "the database doesn't offer TLS, which the release requires.";
  return `${error instanceof Error ? error.name : "an error"}, with no code.`;
}
