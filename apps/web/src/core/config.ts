/**
 * Configuration, read at the moment it is needed (SPEC §2 rule 10).
 *
 * Nothing here runs at import. A missing variable becomes an error when a
 * function that needs it is called, and the caller decides what the person
 * sees. A missing human decision (the data controller) switches a feature
 * off; it is never defaulted (SPEC §2 rule 6).
 */

/** Invites each new account starts with. A founder default, recorded on /rules. */
export const DEFAULT_INVITES = 10;
/** The feed shows this many days and then ends. */
export const FEED_WINDOW_DAYS = 14;
/** Items per page in the feed and other lists. */
export const PAGE_SIZE = 30;

/** Lifetimes (SPEC §5). */
export const EMAIL_TOKEN_TTL_MINUTES = 15;
export const PENDING_JOIN_TTL_MINUTES = 60;
/** How long a join link's "Add <Name> as a friend?" stays open (SPEC §17 item 1). */
export const INVITE_OFFER_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 60;
export const INVITE_TTL_DAYS = 30;
export const FRIEND_REQUEST_TTL_DAYS = 30;

const MIN_SECRET_LENGTH = 32;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The public origin, without a trailing slash, used to build links in
 * emails. In development it falls back to the local server; in production
 * it must be set, because a link to localhost in a real email is a broken
 * promise.
 */
export function appUrl(): string {
  const value = env("APP_URL");
  if (value) return value.replace(/\/+$/, "");
  if (isProduction()) {
    throw new Error("APP_URL is not set.");
  }
  return "http://localhost:3000";
}

/**
 * The data controller: the person or body answerable for the data.
 * Null unless both the name and the address are set.
 */
export function controller(): { name: string; email: string } | null {
  const name = env("DATA_CONTROLLER");
  const email = env("DATA_CONTROLLER_EMAIL");
  return name && email ? { name, email } : null;
}

/** New accounts can be created only while a controller is named (SPEC §8). */
export function accountCreationOpen(): boolean {
  return controller() !== null;
}

/** The secret that signs cookies. Throws at use if missing or too short. */
export function sessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return value;
}

/** The bearer secret for the weekly digest route, or null (the route then refuses). */
export function cronSecret(): string | null {
  return env("CRON_SECRET");
}

/**
 * Which mail transport to use. Anything other than exactly "resend" is the
 * outbox, so a typo can never send a real email.
 */
export function mailTransport(): "outbox" | "resend" {
  return env("MAIL_TRANSPORT") === "resend" ? "resend" : "outbox";
}

/** Resend settings, or null when either is missing. */
export function resendSettings(): { apiKey: string; from: string } | null {
  const apiKey = env("RESEND_API_KEY");
  const from = env("MAIL_FROM");
  return apiKey && from ? { apiKey, from } : null;
}

/** What a request header name can be (RFC 9110 token, restricted to what proxies use). */
const HEADER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/;

/**
 * The request header that carries the client's address (SPEC §17 item 3),
 * lowercased, or null when there is none to trust.
 *
 * Each deployment names it in CLIENT_IP_HEADER: a header its own proxy sets
 * and a client cannot write, such as `x-vercel-forwarded-for`. The first
 * value in it is used. In development the default is `x-forwarded-for`. In
 * production a missing name is a missing decision: this returns null, and
 * sign-in and join requests are switched off (CLOSED); it is never
 * defaulted (SPEC §2 rule 6). A value that cannot be a header name counts
 * as missing, in every environment.
 */
export function clientIpHeader(): string | null {
  const value = env("CLIENT_IP_HEADER");
  if (value) return HEADER_NAME.test(value) ? value.toLowerCase() : null;
  return isProduction() ? null : "x-forwarded-for";
}

/**
 * The running version shown on every page (SPEC §17 item 20): OURS_VERSION
 * when a release sets it, otherwise the first 7 characters of the commit
 * the host built (VERCEL_GIT_COMMIT_SHA), otherwise "development build" in
 * development and "unversioned build" in production, so a production build
 * never calls itself a development one.
 */
export function runningVersion(): string {
  const release = env("OURS_VERSION");
  if (release) return release;
  const commit = env("VERCEL_GIT_COMMIT_SHA");
  if (commit) return commit.slice(0, 7);
  return isProduction() ? "unversioned build" : "development build";
}
