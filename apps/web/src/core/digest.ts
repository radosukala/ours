/**
 * The weekly email (SPEC §8 "Weekly email", D-0011 §D.5): who posted this
 * week, and never what.
 *
 * - Who gets it: active accounts with `weekly_email`, once per week
 *   (Monday 00:00 UTC), recorded in `digest_deliveries`.
 * - What it says: up to five names with how often each posted, then "and N
 *   others". The names are the distinct authors, other than the recipient,
 *   who posted in the last 7 days, counting only posts the recipient may
 *   see — through the one visibility predicate, never a copy of it — and
 *   leaving out anyone the recipient muted. The most recent poster comes
 *   first (SPEC §18.6): ordering by how much someone posted would rank
 *   people by activity.
 * - When there is nothing to say, nothing is sent and the week is recorded
 *   as `skipped`.
 * - The body is built by `digestEmail` in mail-templates.ts from names and
 *   counts only. No post's text is ever read here.
 *
 * Stopping it needs no sign-in: the email carries
 * `accountId.hmac("digest-unsub:" + accountId)`, and `/unsubscribe` hands
 * it to `digestUnsubscribe`.
 */
import { and, asc, count, desc, eq, gt, isNull, lte, max, ne, sql } from "drizzle-orm";
import { appUrl, sessionSecret } from "./config";
import type { Db } from "./db";
import { notFound } from "./errors";
import { hmac, timingSafeEqualStr } from "./ids";
import { sendMail } from "./mail";
import { type DigestLine, digestEmail } from "./mail-templates";
import { accounts, digestDeliveries, posts } from "./schema";
import { visiblePostPredicate } from "./visibility";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The window the email looks back over. */
export const DIGEST_WINDOW_DAYS = 7;

const UNSUB_PURPOSE = "digest-unsub:";
const MAX_TOKEN_LENGTH = 200;
const UNSUB_REFUSED = "This link can't be used.";

/** Monday 00:00 UTC of `now`'s week, as YYYY-MM-DD. */
export function weekStartOf(now: Date): string {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const sinceMonday = (day.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ unsubscribe */

/** `accountId.hmac("digest-unsub:" + accountId)` (SPEC §8). */
export function digestUnsubscribeToken(accountId: string): string {
  if (!accountId || accountId.includes(".")) {
    throw new Error("digestUnsubscribeToken: bad account id");
  }
  return `${accountId}.${hmac(sessionSecret(), UNSUB_PURPOSE + accountId)}`;
}

/** The link in the email: `<APP_URL>/unsubscribe#<token>`. */
export function digestUnsubscribeUrl(accountId: string, base: string = appUrl()): string {
  return `${base.replace(/\/+$/, "")}/unsubscribe#${digestUnsubscribeToken(accountId)}`;
}

/**
 * Stop the weekly email for the account the token names. No sign-in is
 * needed; the signature is the permission. A token that is malformed or
 * whose signature does not match is NOT_FOUND. A valid token for an account
 * that no longer exists changes nothing and is not an error: that person
 * gets no email either way.
 */
export async function digestUnsubscribe(db: Db, token: unknown): Promise<void> {
  if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) {
    throw notFound(UNSUB_REFUSED);
  }
  const cut = token.indexOf(".");
  if (cut < 1 || cut === token.length - 1) throw notFound(UNSUB_REFUSED);
  const accountId = token.slice(0, cut);
  const given = token.slice(cut + 1);
  const expected = hmac(sessionSecret(), UNSUB_PURPOSE + accountId);
  if (!timingSafeEqualStr(given, expected)) throw notFound(UNSUB_REFUSED);
  await db
    .update(accounts)
    .set({ weeklyEmail: false })
    .where(eq(accounts.id, accountId));
}

/* ---------------------------------------------------------------- content */

export type DigestAuthor = DigestLine & { authorId: string };

/**
 * Who posted in the last 7 days that `recipientId` may see: distinct
 * authors other than the recipient, not muted by them, each with the
 * number of their posts the recipient may see. The most recent post first
 * (SPEC §18.6), then by author id so the order is stable; how many times
 * someone posted plays no part in it. Names and counts only; no post text
 * is selected.
 */
export async function digestFor(
  db: Db,
  recipientId: string,
  now: Date = new Date(),
): Promise<DigestAuthor[]> {
  const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * DAY_MS);
  const rows = await db
    .select({
      authorId: posts.authorId,
      name: accounts.displayName,
      posts: count(posts.id),
    })
    .from(posts)
    .innerJoin(accounts, eq(accounts.id, posts.authorId))
    .where(
      and(
        visiblePostPredicate(recipientId),
        ne(posts.authorId, recipientId),
        gt(posts.createdAt, since),
        lte(posts.createdAt, now),
        sql`not exists (
          select 1 from mutes digest_mute
          where digest_mute.muter_id = ${recipientId}
            and digest_mute.muted_id = ${posts.authorId}
        )`,
      ),
    )
    .groupBy(posts.authorId, accounts.displayName)
    .orderBy(desc(max(posts.createdAt)), asc(posts.authorId));
  return rows.map((r) => ({ authorId: r.authorId, name: r.name, posts: Number(r.posts) }));
}

/* -------------------------------------------------------------------- run */

export type DigestRun = {
  weekStart: string;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * Send this week's email to everyone who is due one (SPEC §8).
 *
 * Idempotent per week: an account with a delivery row for this week is not
 * considered again. Before sending, the week is claimed with a row in
 * status `failed`, inserted only if none exists; the row becomes `sent`
 * once the transport confirms. Two runs at once cannot both send, and a
 * run that stops between claim and confirmation leaves a record that says
 * the send was not confirmed, rather than a second email.
 *
 * Accounts change while the run is under way (the second verification's
 * abuse defects 3–4). So each recipient is read again when their turn
 * comes, and skipped unless they are still active with `weekly_email`; and
 * one recipient's error (an account deleted between that read and its
 * delivery row, say) is counted as failed and logged without its message,
 * and the run goes on to the next.
 *
 * The app URL and the secret are resolved first, so a missing setting
 * fails the run before any week is claimed.
 */
export async function runWeeklyDigest(
  db: Db,
  now: Date = new Date(),
): Promise<DigestRun> {
  const base = appUrl();
  sessionSecret();
  const weekStart = weekStartOf(now);
  const run: DigestRun = { weekStart, sent: 0, skipped: 0, failed: 0 };

  const due = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        isNull(accounts.suspendedAt),
        eq(accounts.weeklyEmail, true),
        sql`not exists (
          select 1 from digest_deliveries digest_done
          where digest_done.account_id = ${accounts.id}
            and digest_done.week_start = ${weekStart}
        )`,
      ),
    )
    .orderBy(asc(accounts.id));

  for (const { id } of due) {
    try {
      const outcome = await deliverOne(db, id, { weekStart, base, now });
      if (outcome) run[outcome] += 1;
    } catch (error) {
      run.failed += 1;
      // Never the message: it can carry an address or a query.
      console.error(
        "[ours] weekly email: one account failed:",
        error instanceof Error ? error.name : "unknown error",
      );
    }
  }

  return run;
}

/**
 * This week's email for one account, if it is still due one. Returns what
 * to count, or null when there is nothing to count (the account no longer
 * qualifies, or another run has the week).
 */
async function deliverOne(
  db: Db,
  accountId: string,
  { weekStart, base, now }: { weekStart: string; base: string; now: Date },
): Promise<"sent" | "skipped" | "failed" | null> {
  // Read again at its turn: suspended, deleted or unsubscribed since the
  // run began means no email.
  const [recipient] = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        isNull(accounts.suspendedAt),
        eq(accounts.weeklyEmail, true),
      ),
    )
    .limit(1);
  if (!recipient) return null;

  const lines = await digestFor(db, recipient.id, now);

  if (lines.length === 0) {
    const recorded = await db
      .insert(digestDeliveries)
      .values({ accountId: recipient.id, weekStart, status: "skipped", createdAt: now })
      .onConflictDoNothing()
      .returning({ accountId: digestDeliveries.accountId });
    return recorded.length > 0 ? "skipped" : null;
  }

  const claimed = await db
    .insert(digestDeliveries)
    .values({ accountId: recipient.id, weekStart, status: "failed", createdAt: now })
    .onConflictDoNothing()
    .returning({ accountId: digestDeliveries.accountId });
  if (claimed.length === 0) return null; // another run has this week

  let delivered = false;
  try {
    const mail = digestEmail(
      lines.map(({ name, posts: n }) => ({ name, posts: n })),
      base,
      digestUnsubscribeUrl(recipient.id, base),
    );
    const result = await sendMail(db, {
      to: recipient.email,
      subject: mail.subject,
      body: mail.body,
      kind: "digest",
      accountId: recipient.id,
    });
    delivered = result.ok;
  } catch (error) {
    // Never the message: it can carry an address or a query.
    console.error(
      "[ours] weekly email: sending to one account failed:",
      error instanceof Error ? error.name : "unknown error",
    );
  }

  if (!delivered) return "failed";
  await db
    .update(digestDeliveries)
    .set({ status: "sent" })
    .where(
      and(
        eq(digestDeliveries.accountId, recipient.id),
        eq(digestDeliveries.weekStart, weekStart),
      ),
    );
  return "sent";
}
