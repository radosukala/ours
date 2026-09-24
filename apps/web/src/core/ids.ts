import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { monotonicFactory } from "ulid";

const nextUlid = monotonicFactory();

/** A new ulid: sortable by creation, strictly increasing within a process. */
export function newId(): string {
  return nextUlid();
}

/** Random bytes as base64url. 32 bytes gives a 43-character token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** sha256 as lowercase hex. */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** HMAC-SHA256 as base64url. */
export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

/** Constant-time string comparison; false for different lengths. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
