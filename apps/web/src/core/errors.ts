/**
 * The one error the core throws on purpose.
 *
 * `message` is a sentence a person can read; the web layer shows it as is.
 * NOT_FOUND is also the answer for things the viewer may not see
 * (SPEC §2 rule 3): a hidden post, a person who blocked you and a used
 * invite are indistinguishable from nothing.
 */
export type CoreErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "CLOSED";

export class CoreError extends Error {
  readonly code: CoreErrorCode;

  constructor(code: CoreErrorCode, message: string) {
    super(message);
    this.name = "CoreError";
    this.code = code;
  }
}

export function isCoreError(value: unknown): value is CoreError {
  if (value instanceof CoreError) return true;
  // Module duplication (for example across a bundler boundary) can break
  // instanceof; fall back to the shape.
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "CoreError" &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** The standard "as if it does not exist" refusal. */
export function notFound(message = "That isn't available."): CoreError {
  return new CoreError("NOT_FOUND", message);
}

export function invalid(message: string): CoreError {
  return new CoreError("INVALID", message);
}

export function forbidden(message = "You can't do that."): CoreError {
  return new CoreError("FORBIDDEN", message);
}

export function conflict(message: string): CoreError {
  return new CoreError("CONFLICT", message);
}

export function closed(
  message = "OURS isn't open for new accounts yet.",
): CoreError {
  return new CoreError("CLOSED", message);
}
