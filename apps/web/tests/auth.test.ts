/**
 * Identity (SPEC §5, §8, §13): emailed tokens, sessions, signed values,
 * plus the foundation's rate limit, mail transport and input validation.
 * Denial paths first. Everyone here is FICTIONAL.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeEmailToken,
  createEmailToken,
  createPendingJoin,
  createSession,
  pendingJoinFromCookie,
  revokeAllSessions,
  revokeSession,
  sessionFromCookie,
  sessionIdFromCookie,
  signValue,
  verifySignedValue,
  viewerAccount,
} from "@/core/auth";
import {
  accountCreationOpen,
  appUrl,
  controller,
  mailTransport,
  sessionSecret,
} from "@/core/config";
import { isCoreError } from "@/core/errors";
import { hmac, newId, sha256 } from "@/core/ids";
import { hit } from "@/core/limits";
import { latestOutbox, sendMail, tokenFromLink } from "@/core/mail";
import { digestEmail, joinEmail, signInEmail } from "@/core/mail-templates";
import {
  accounts,
  emailTokens,
  invites,
  mailLog,
  outbox,
  pendingJoins,
  rateEvents,
  sessions,
} from "@/core/schema";
import {
  normEmail,
  validDisplayName,
  validHandle,
  validPostBody,
} from "@/core/validate";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

async function makeInvite(inviterId: string) {
  const [row] = await db()
    .insert(invites)
    .values({
      id: newId(),
      codeHash: sha256(newId()),
      inviterId,
      expiresAt: plus.days(t0, 30),
    })
    .returning();
  return row!;
}

describe("email tokens", () => {
  it("stores only the sha256 of the token, never the token", async () => {
    const token = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    expect(token.length).toBeGreaterThanOrEqual(43);
    const rows = await db().select().from(emailTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("refuses an unknown token with NOT_FOUND", async () => {
    await expectCode(consumeEmailToken(db(), "not-a-real-token", t0), "NOT_FOUND");
    await expectCode(consumeEmailToken(db(), "", t0), "NOT_FOUND");
    await expectCode(consumeEmailToken(db(), "x".repeat(500), t0), "NOT_FOUND");
    await expectCode(consumeEmailToken(db(), undefined, t0), "NOT_FOUND");
  });

  it("works once: a second use is NOT_FOUND", async () => {
    const token = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    const first = await consumeEmailToken(db(), token, plus.minutes(t0, 1));
    expect(first).toEqual({ email: "anna@example.test", purpose: "sign_in", inviteId: null });
    await expectCode(consumeEmailToken(db(), token, plus.minutes(t0, 2)), "NOT_FOUND");
  });

  it("is single-use even when two uses race", async () => {
    const token = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    const results = await Promise.allSettled([
      consumeEmailToken(db(), token, t0),
      consumeEmailToken(db(), token, t0),
      consumeEmailToken(db(), token, t0),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("expires after 15 minutes", async () => {
    const early = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    const onTime = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    const late = await createEmailToken(db(), {
      email: "anna@example.test",
      purpose: "sign_in",
      now: t0,
    });
    await expectCode(consumeEmailToken(db(), early, plus.minutes(t0, 15)), "NOT_FOUND");
    await expectCode(consumeEmailToken(db(), late, plus.minutes(t0, 16)), "NOT_FOUND");
    const ok = await consumeEmailToken(db(), onTime, new Date(t0.getTime() + 15 * 60_000 - 1000));
    expect(ok.email).toBe("anna@example.test");
  });

  it("normalises the address, and a join token carries its invite", async () => {
    const inviter = await makeAccount();
    const invite = await makeInvite(inviter.id);
    const token = await createEmailToken(db(), {
      email: "  Petr@Example.TEST ",
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    expect(await consumeEmailToken(db(), token, t0)).toEqual({
      email: "petr@example.test",
      purpose: "join",
      inviteId: invite.id,
    });
  });

  it("refuses a join token without an invite and a sign-in token with one", async () => {
    const inviter = await makeAccount();
    const invite = await makeInvite(inviter.id);
    await expectCode(
      createEmailToken(db(), { email: "a@example.test", purpose: "join", now: t0 }),
      "INVALID",
    );
    await expectCode(
      createEmailToken(db(), {
        email: "a@example.test",
        purpose: "sign_in",
        inviteId: invite.id,
        now: t0,
      }),
      "INVALID",
    );
    await expectCode(
      createEmailToken(db(), { email: "not an email", purpose: "sign_in", now: t0 }),
      "INVALID",
    );
  });
});

describe("sessions", () => {
  it("round-trips a session cookie for an active account", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    expect(s.cookieValue).toBe(`${s.id}.${hmac(sessionSecret(), s.id)}`);
    expect(s.expiresAt.getTime()).toBe(plus.days(t0, 60).getTime());
    expect(await sessionFromCookie(db(), s.cookieValue, plus.days(t0, 1))).toBe(a.id);
    expect(sessionIdFromCookie(s.cookieValue)).toBe(s.id);
  });

  it("refuses a cookie whose HMAC was tampered with", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    const [id, mac] = s.cookieValue.split(".") as [string, string];
    const flipped = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    expect(await sessionFromCookie(db(), `${id}.${flipped}`, t0)).toBeNull();
    expect(await sessionFromCookie(db(), `${id}.`, t0)).toBeNull();
    expect(await sessionFromCookie(db(), id, t0)).toBeNull();
    expect(await sessionFromCookie(db(), "", t0)).toBeNull();
    expect(await sessionFromCookie(db(), null, t0)).toBeNull();
  });

  it("refuses a cookie for a session id we signed but never stored", async () => {
    const forged = signValue("never-issued-session-id");
    expect(await sessionFromCookie(db(), forged, t0)).toBeNull();
  });

  it("refuses a cookie signed with a different secret", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    const other = `${s.id}.${hmac("another-secret-that-is-at-least-32-chars-long", s.id)}`;
    expect(await sessionFromCookie(db(), other, t0)).toBeNull();
  });

  it("refuses a revoked session", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    await revokeSession(db(), s.id, plus.minutes(t0, 5));
    expect(await sessionFromCookie(db(), s.cookieValue, plus.minutes(t0, 6))).toBeNull();
  });

  it("refuses an expired session (60 days)", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    expect(await sessionFromCookie(db(), s.cookieValue, plus.days(t0, 59))).toBe(a.id);
    expect(await sessionFromCookie(db(), s.cookieValue, plus.days(t0, 60))).toBeNull();
    expect(await sessionFromCookie(db(), s.cookieValue, plus.days(t0, 61))).toBeNull();
  });

  it("refuses the session of a suspended account, and will not start one", async () => {
    const a = await makeAccount();
    const s = await createSession(db(), a.id, t0);
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, a.id));
    expect(await sessionFromCookie(db(), s.cookieValue, t0)).toBeNull();
    expect(await viewerAccount(db(), a.id)).toBeNull();
    await expectCode(createSession(db(), a.id, t0), "NOT_FOUND");
    await expectCode(createSession(db(), newId(), t0), "NOT_FOUND");
  });

  it("revokeAllSessions ends every session of that account and no other", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const s1 = await createSession(db(), a.id, t0);
    const s2 = await createSession(db(), a.id, t0);
    const s3 = await createSession(db(), b.id, t0);
    expect(await revokeAllSessions(db(), a.id, t0)).toBe(2);
    expect(await sessionFromCookie(db(), s1.cookieValue, t0)).toBeNull();
    expect(await sessionFromCookie(db(), s2.cookieValue, t0)).toBeNull();
    expect(await sessionFromCookie(db(), s3.cookieValue, t0)).toBe(b.id);
  });

  it("stores no IP address or user agent", async () => {
    const a = await makeAccount();
    await createSession(db(), a.id, t0);
    const [row] = await db().select().from(sessions);
    expect(Object.keys(row!).sort()).toEqual(
      ["accountId", "createdAt", "expiresAt", "id", "revokedAt"].sort(),
    );
  });

  it("deleting the account deletes its sessions", async () => {
    const a = await makeAccount();
    await createSession(db(), a.id, t0);
    await db().delete(accounts).where(eq(accounts.id, a.id));
    expect(await db().select().from(sessions)).toHaveLength(0);
  });

  it("viewerAccount returns what the web layer needs", async () => {
    const a = await makeAccount({ handle: "anna_fict", acceptsFollowers: true, isAdmin: true });
    expect(await viewerAccount(db(), a.id)).toEqual({
      id: a.id,
      handle: "anna_fict",
      displayName: a.displayName,
      isAdmin: true,
      acceptsFollowers: true,
      invitesRemaining: 10,
    });
  });
});

describe("signed values", () => {
  it("round-trips and refuses tampering", () => {
    const signed = signValue("abc123");
    expect(verifySignedValue(signed)).toBe("abc123");
    expect(verifySignedValue(signed.replace("abc123", "abc124"))).toBeNull();
    expect(verifySignedValue(`${signed}x`)).toBeNull();
    expect(verifySignedValue("abc123")).toBeNull();
    expect(verifySignedValue(".abc")).toBeNull();
    expect(verifySignedValue(42)).toBeNull();
  });

  it("refuses to sign a value containing a dot", () => {
    expect(() => signValue("a.b")).toThrow();
    expect(() => signValue("")).toThrow();
  });

  it("throws at use, not at import, when the secret is missing or short", () => {
    vi.stubEnv("SESSION_SECRET", "too-short");
    expect(() => sessionSecret()).toThrow(/SESSION_SECRET/);
    expect(() => signValue("abc")).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => verifySignedValue("abc.def")).toThrow(/SESSION_SECRET/);
  });
});

describe("pending joins", () => {
  it("round-trips, expires after 60 minutes, and ends when completed", async () => {
    const inviter = await makeAccount();
    const invite = await makeInvite(inviter.id);
    const pj = await createPendingJoin(db(), {
      email: "Mara@Example.test",
      inviteId: invite.id,
      now: t0,
    });
    const view = await pendingJoinFromCookie(db(), pj.cookieValue, plus.minutes(t0, 59));
    expect(view).toMatchObject({ id: pj.id, email: "mara@example.test", inviteId: invite.id });
    expect(await pendingJoinFromCookie(db(), pj.cookieValue, plus.minutes(t0, 60))).toBeNull();
    expect(await pendingJoinFromCookie(db(), `${pj.id}.forged`, t0)).toBeNull();
    await db()
      .update(pendingJoins)
      .set({ completedAt: t0 })
      .where(eq(pendingJoins.id, pj.id));
    expect(await pendingJoinFromCookie(db(), pj.cookieValue, t0)).toBeNull();
  });

  it("is not accepted as a session, and a session is not accepted as a pending join", async () => {
    const a = await makeAccount();
    const inviter = await makeAccount();
    const invite = await makeInvite(inviter.id);
    const pj = await createPendingJoin(db(), { email: "x@example.test", inviteId: invite.id, now: t0 });
    const s = await createSession(db(), a.id, t0);
    expect(await sessionFromCookie(db(), pj.cookieValue, t0)).toBeNull();
    expect(await pendingJoinFromCookie(db(), s.cookieValue, t0)).toBeNull();
  });
});

describe("rate limits", () => {
  it("allows max events in the window, then refuses with RATE_LIMITED", async () => {
    const key = `signin:email:${sha256("anna@example.test")}`;
    for (let i = 0; i < 5; i++) {
      await hit(db(), key, { max: 5, windowSec: 3600, now: plus.minutes(t0, i) });
    }
    await expectCode(
      hit(db(), key, { max: 5, windowSec: 3600, now: plus.minutes(t0, 10) }),
      "RATE_LIMITED",
    );
    // A refused attempt is not recorded.
    expect(await db().select().from(rateEvents)).toHaveLength(5);
    // Other keys are independent.
    await hit(db(), "signin:email:other", { max: 5, windowSec: 3600, now: t0 });
  });

  it("slides: events leave the window as time passes", async () => {
    const key = "post:FICTIONAL";
    await hit(db(), key, { max: 2, windowSec: 60, now: t0 });
    await hit(db(), key, { max: 2, windowSec: 60, now: plus.minutes(t0, 0.5) });
    await expectCode(hit(db(), key, { max: 2, windowSec: 60, now: plus.minutes(t0, 0.9) }), "RATE_LIMITED");
    await hit(db(), key, { max: 2, windowSec: 60, now: plus.minutes(t0, 1.1) });
  });

  it("prunes every key's rows older than 24 hours, so a key never hit again does not stay", async () => {
    const key = "report:FICTIONAL";
    await hit(db(), key, { max: 10, windowSec: 3600, now: t0 });
    await hit(db(), "report:other", { max: 10, windowSec: 3600, now: t0 });
    await hit(db(), key, { max: 10, windowSec: 3600, now: plus.hours(t0, 25) });
    const rows = await db().select().from(rateEvents);
    expect(rows.filter((r) => r.key === key)).toHaveLength(1);
    expect(rows.filter((r) => r.key === "report:other")).toHaveLength(0);
  });

  it("never prunes rows a window longer than 24 hours still counts", async () => {
    const key = "invite:FICTIONAL-long-window";
    const opts = { max: 2, windowSec: 3 * 24 * 3600 };
    await hit(db(), key, { ...opts, now: t0 });
    await hit(db(), key, { ...opts, now: plus.hours(t0, 30) });
    await expectCode(hit(db(), key, { ...opts, now: plus.hours(t0, 40) }), "RATE_LIMITED");
  });

  it("refuses a limit that could never be met or never expire", async () => {
    await expect(hit(db(), "post:x", { max: 0, windowSec: 60, now: t0 })).rejects.toThrow();
    await expect(hit(db(), "post:x", { max: 1, windowSec: 0, now: t0 })).rejects.toThrow();
    await expect(hit(db(), "", { max: 1, windowSec: 60, now: t0 })).rejects.toThrow();
  });

  it("holds under concurrency: parallel hits never exceed max", async () => {
    const key = "friendreq:FICTIONAL";
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => hit(db(), key, { max: 3, windowSec: 3600, now: t0 })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });
});

describe("mail", () => {
  it("the outbox transport writes the message and a log entry without the address", async () => {
    const a = await makeAccount({ email: "petr@example.test" });
    const content = signInEmail("http://localhost:3000/auth#FICTIONALTOKEN");
    const result = await sendMail(db(), {
      to: "Petr@Example.test",
      ...content,
      kind: "sign_in",
      accountId: a.id,
    });
    expect(result).toEqual({ ok: true });
    const latest = await latestOutbox(db(), "petr@example.test");
    expect(latest?.subject).toBe(content.subject);
    expect(tokenFromLink(latest!.body)).toBe("FICTIONALTOKEN");
    const log = await db().select().from(mailLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "sign_in", status: "sent", accountId: a.id });
    expect(JSON.stringify(log)).not.toContain("petr@example.test");
  });

  it("the resend transport refuses outside production and sends nothing", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_FICTIONAL");
    vi.stubEnv("MAIL_FROM", "OURS <mail@example.test>");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(mailTransport()).toBe("resend");
    const result = await sendMail(db(), {
      to: "petr@example.test",
      subject: "x",
      body: "y",
      kind: "sign_in",
    });
    spy.mockRestore();
    expect(result).toEqual({ ok: false, errorCode: "transport_refused" });
    expect(await db().select().from(outbox)).toHaveLength(0);
    const [log] = await db().select().from(mailLog);
    expect(log).toMatchObject({ status: "failed", errorCode: "transport_refused" });
  });

  it("the resend transport refuses in production without its variables", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await sendMail(db(), { to: "a@example.test", subject: "x", body: "y", kind: "digest" });
    spy.mockRestore();
    expect(result).toEqual({ ok: false, errorCode: "transport_refused" });
  });

  it("any transport name other than resend is the outbox", () => {
    vi.stubEnv("MAIL_TRANSPORT", "Resend ");
    expect(mailTransport()).toBe("outbox");
    vi.stubEnv("MAIL_TRANSPORT", "smtp");
    expect(mailTransport()).toBe("outbox");
  });

  it("templates: the digest names people and never includes post text", () => {
    const lines = [
      { name: "Anna", posts: 3 },
      { name: "Petr", posts: 1 },
      { name: "C", posts: 2 },
      { name: "D", posts: 1 },
      { name: "E", posts: 1 },
      { name: "F", posts: 1 },
      { name: "G", posts: 1 },
    ];
    const mail = digestEmail(lines, "http://localhost:3000/", "http://localhost:3000/unsubscribe#t");
    expect(mail.subject).toBe("This week on OURS");
    expect(mail.body).toContain("Anna posted 3 times.");
    expect(mail.body).toContain("Petr posted once.");
    expect(mail.body).toContain("and 2 others");
    expect(mail.body).not.toContain("F posted");
    expect(mail.body).toContain("Open OURS: http://localhost:3000/home");
    expect(mail.body).toContain("Stop these emails: http://localhost:3000/unsubscribe#t");
    expect(joinEmail("http://x/auth#t", "Anna").subject).toContain("Anna");
  });
});

describe("configuration", () => {
  it("account creation is closed unless both controller variables are set", () => {
    expect(accountCreationOpen()).toBe(true);
    expect(controller()).toEqual({
      name: "FICTIONAL Controller",
      email: "controller@example.test",
    });
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "   ");
    expect(accountCreationOpen()).toBe(false);
    expect(controller()).toBeNull();
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "controller@example.test");
    vi.stubEnv("DATA_CONTROLLER", "");
    expect(accountCreationOpen()).toBe(false);
  });

  it("appUrl drops a trailing slash, and is required in production", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000/");
    expect(appUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => appUrl()).toThrow(/APP_URL/);
  });
});

describe("validation", () => {
  it("handles: lowercased, format enforced, reserved refused", () => {
    expect(validHandle(" @Anna_K ")).toBe("anna_k");
    for (const bad of ["ab", "a".repeat(21), "anna-k", "anna k", "ánna", ""]) {
      expect(() => validHandle(bad)).toThrow();
    }
    for (const reserved of ["admin", "ours", "settings", "null", "undefined", "Support"]) {
      expect(() => validHandle(reserved)).toThrow(/reserved/);
    }
  });

  it("emails are lowercased and trimmed; non-addresses refused", () => {
    expect(normEmail("  Anna@Example.TEST ")).toBe("anna@example.test");
    for (const bad of ["", "anna", "anna@", "@example.test", "a b@example.test", 5]) {
      expect(() => normEmail(bad)).toThrow();
    }
  });

  it("names and posts are trimmed and length-checked in characters", () => {
    expect(validDisplayName("  Anna \n Novak ")).toBe("Anna Novak");
    expect(() => validDisplayName("   ")).toThrow();
    expect(() => validDisplayName("x".repeat(51))).toThrow();
    expect(validPostBody("  line one\r\nline two  ")).toBe("line one\nline two");
    expect(() => validPostBody(" \n ")).toThrow();
    expect(validPostBody("😀".repeat(2000))).toHaveLength(4000);
    expect(() => validPostBody("x".repeat(2001))).toThrow();
  });
});

describe("import safety (SPEC §2 rule 10)", () => {
  it("every core module imports with no environment set, even in production", async () => {
    for (const name of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "APP_URL",
      "MAIL_TRANSPORT",
      "RESEND_API_KEY",
      "MAIL_FROM",
      "DATA_CONTROLLER",
      "DATA_CONTROLLER_EMAIL",
      "CRON_SECRET",
      "OURS_VERSION",
    ]) {
      vi.stubEnv(name, "");
    }
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const dir = fileURLToPath(new URL("../src/core/", import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(12);
    for (const file of files) {
      const loaded = await import(/* @vite-ignore */ `${dir}${file}`);
      expect(Object.keys(loaded).length, file).toBeGreaterThan(0);
    }
  });
});
