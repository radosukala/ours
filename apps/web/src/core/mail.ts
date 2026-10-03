/**
 * Sending mail.
 *
 * Under M-0010 no email reaches a real address: the transport is `outbox`,
 * which writes the message to a table. The `resend` transport exists for a
 * later release and refuses to run unless NODE_ENV is production and both
 * RESEND_API_KEY and MAIL_FROM are set (SPEC §2 rule 5). Resend is imported
 * only inside that path, so nothing loads it in development or tests.
 *
 * Every attempt is written to mail_log, which stores no address.
 */
import { and, desc, eq } from "drizzle-orm";
import { isProduction, mailTransport, resendSettings } from "./config";
import type { Db } from "./db";
import { newId } from "./ids";
import { mailLog, type MailKind, outbox, type OutboxMessage } from "./schema";

export type MailInput = {
  to: string;
  subject: string;
  body: string;
  kind: MailKind;
  accountId?: string | null;
};

export type MailResult = { ok: true } | { ok: false; errorCode: string };

/**
 * Where a caller can hand work to run after the response (SPEC §17 item
 * 4): server actions pass Next's `after`, through `afterResponse` in
 * src/web/actions.ts. It may return a promise, which is awaited: that is
 * how work runs inline when there is no response to wait for.
 */
export type Defer = (task: () => Promise<void>) => void | Promise<void>;

/**
 * Run `task` now, or give it to `defer` to run after the response. Tests
 * and scripts pass nothing, and the work (and the mail) happens inline.
 */
export async function nowOrDeferred(
  task: () => Promise<void>,
  defer?: Defer,
): Promise<void> {
  if (defer) await defer(task);
  else await task();
}

async function log(
  db: Db,
  kind: MailKind,
  accountId: string | null,
  result: MailResult,
): Promise<void> {
  await db.insert(mailLog).values({
    id: newId(),
    kind,
    accountId,
    status: result.ok ? "sent" : "failed",
    errorCode: result.ok ? null : result.errorCode,
  });
}

async function sendThroughResend(input: MailInput): Promise<MailResult> {
  const settings = resendSettings();
  if (!isProduction() || !settings) {
    // Refuse rather than fall back: a misconfigured transport must not
    // quietly become a different one.
    console.error(
      "[ours] mail refused: the resend transport runs only with NODE_ENV=production, RESEND_API_KEY and MAIL_FROM.",
    );
    return { ok: false, errorCode: "transport_refused" };
  }
  try {
    const { Resend } = await import("resend");
    const client = new Resend(settings.apiKey);
    const result = await client.emails.send({
      from: settings.from,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });
    if (result.error) {
      console.error("[ours] resend refused the message:", result.error.name);
      return { ok: false, errorCode: `resend_${result.error.name}` };
    }
    return { ok: true };
  } catch (error) {
    console.error(
      "[ours] sending through resend failed:",
      // Never the message: it can carry an address (the verification of M-0018).
      error instanceof Error ? error.name : "unknown error",
    );
    return { ok: false, errorCode: "resend_exception" };
  }
}

/**
 * Send one plain-text message. Returns whether it was sent; never throws
 * for a transport failure (database errors still throw).
 */
export async function sendMail(db: Db, input: MailInput): Promise<MailResult> {
  const accountId = input.accountId ?? null;
  let result: MailResult;
  if (mailTransport() === "resend") {
    result = await sendThroughResend(input);
  } else {
    await db.insert(outbox).values({
      id: newId(),
      toAddress: input.to.trim().toLowerCase(),
      subject: input.subject,
      body: input.body,
      kind: input.kind,
    });
    result = { ok: true };
  }
  await log(db, input.kind, accountId, result);
  return result;
}

/** The newest outbox message to an address, for tests and local development. */
export async function latestOutbox(
  db: Db,
  to: string,
  kind?: MailKind,
): Promise<OutboxMessage | null> {
  const address = to.trim().toLowerCase();
  const rows = await db
    .select()
    .from(outbox)
    .where(
      kind
        ? and(eq(outbox.toAddress, address), eq(outbox.kind, kind))
        : eq(outbox.toAddress, address),
    )
    .orderBy(desc(outbox.createdAt), desc(outbox.id))
    .limit(1);
  return rows[0] ?? null;
}

/** The raw token in a link of the form `<APP_URL>/auth#<token>`, or null. */
export function tokenFromLink(body: string): string | null {
  const match = /\/(?:auth|unsubscribe)#([A-Za-z0-9_.-]+)/.exec(body);
  return match?.[1] ?? null;
}
