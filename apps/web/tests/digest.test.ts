/**
 * The weekly email (SPEC §8, D-0011 §D.5): who posted, never what; only
 * people the recipient may see; muted and blocked people left out; once a
 * week; nothing when there is nothing to say; and a stop link that needs
 * no sign-in and cannot be forged. Denial paths first. Everyone here is
 * FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  digestFor,
  digestUnsubscribe,
  digestUnsubscribeToken,
  runWeeklyDigest,
  weekStartOf,
} from "@/core/digest";
import { isCoreError } from "@/core/errors";
import { tokenFromLink } from "@/core/mail";
import {
  accounts,
  digestDeliveries,
  mailLog,
  outbox,
  posts,
} from "@/core/schema";
import {
  at,
  befriend,
  block,
  db,
  follow,
  makeAccount,
  mute,
  plus,
  post,
  reset,
} from "./helpers";

beforeEach(reset);
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Thursday. Its week starts on Monday 21 September 2026. */
const now = at("2026-09-24T09:00:00Z");
const WEEK = "2026-09-21";
const recent = plus.days(now, -1);

/** The CoreError code a promise is refused with. */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
  throw new Error("expected a refusal, but it succeeded");
}

async function mailTo(email: string) {
  return db().select().from(outbox).where(eq(outbox.toAddress, email));
}

async function deliveryOf(accountId: string, week = WEEK) {
  const rows = await db()
    .select()
    .from(digestDeliveries)
    .where(
      and(
        eq(digestDeliveries.accountId, accountId),
        eq(digestDeliveries.weekStart, week),
      ),
    );
  return rows[0] ?? null;
}

async function weeklyEmailOf(accountId: string): Promise<boolean | undefined> {
  const [row] = await db()
    .select({ weeklyEmail: accounts.weeklyEmail })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.weeklyEmail;
}

describe("the weekly email never says what anyone posted", () => {
  it("contains no post text in any email body or subject", async () => {
    const reader = await makeAccount({ displayName: "FICTIONAL Reader" });
    const bodies: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const friend = await makeAccount({ displayName: `FICTIONAL Friend ${i}` });
      await befriend(reader, friend);
      const body = `FICTIONAL-PRIVATE-TEXT-${i} about the allotment`;
      bodies.push(body);
      await post(friend, { audience: i % 2 ? "followers" : "friends", body, at: recent });
    }
    // A reply-like fragment and a URL, to be sure nothing of a post leaks.
    await post(reader, { body: "FICTIONAL-OWN-TEXT https://example.test/x", at: recent });

    // The reader hears about seven friends; each friend hears about the reader.
    const run = await runWeeklyDigest(db(), now);
    expect(run.sent).toBe(8);

    const all = await db().select().from(outbox);
    expect(all).toHaveLength(8);
    for (const message of all) {
      for (const body of [...bodies, "FICTIONAL-OWN-TEXT", "allotment", "example.test/x"]) {
        expect(message.body).not.toContain(body);
        expect(message.subject).not.toContain(body);
      }
    }
  });

  it("digestFor selects names and counts, nothing else", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount({ displayName: "FICTIONAL Anna" });
    await befriend(reader, friend);
    await post(friend, { body: "FICTIONAL secret", at: recent });
    const lines = await digestFor(db(), reader.id, now);
    expect(lines).toEqual([{ authorId: friend.id, name: "FICTIONAL Anna", posts: 1 }]);
  });
});

describe("only people the recipient may see are named", () => {
  it("leaves out a stranger, a friends-only post to a follower, a suspended friend and a removed post", async () => {
    const reader = await makeAccount();
    const stranger = await makeAccount({ displayName: "FICTIONAL Stranger" });
    const followed = await makeAccount({
      displayName: "FICTIONAL Followed",
      acceptsFollowers: true,
    });
    const closed = await makeAccount({
      displayName: "FICTIONAL Closed",
      acceptsFollowers: false,
    });
    const suspended = await makeAccount({
      displayName: "FICTIONAL Suspended",
      suspended: true,
    });
    const remover = await makeAccount({ displayName: "FICTIONAL Removed" });
    const friend = await makeAccount({ displayName: "FICTIONAL Friend" });

    await befriend(reader, friend);
    await befriend(reader, suspended);
    await befriend(reader, remover);
    await follow(reader, followed);
    await follow(reader, closed); // a follow row, but Closed does not accept followers

    await post(stranger, { audience: "followers", at: recent });
    await post(followed, { audience: "friends", at: recent }); // not for followers
    await post(closed, { audience: "followers", at: recent });
    await post(suspended, { audience: "friends", at: recent });
    const removed = await post(remover, { audience: "friends", at: recent });
    await db()
      .update(posts)
      .set({ removedAt: now, removalCategory: "spam", removalReason: "FICTIONAL reason" })
      .where(eq(posts.id, removed.id));
    await post(friend, { audience: "friends", at: recent });

    const lines = await digestFor(db(), reader.id, now);
    expect(lines.map((l) => l.name)).toEqual(["FICTIONAL Friend"]);

    await runWeeklyDigest(db(), now);
    const [message] = await mailTo(reader.email);
    expect(message?.body).toContain("FICTIONAL Friend posted once.");
    for (const hidden of ["Stranger", "Followed", "Closed", "Suspended", "Removed"]) {
      expect(message?.body).not.toContain(`FICTIONAL ${hidden}`);
    }
  });

  it("names a followed author for a followers post", async () => {
    const reader = await makeAccount();
    const followed = await makeAccount({
      displayName: "FICTIONAL Followed",
      acceptsFollowers: true,
    });
    await follow(reader, followed);
    await post(followed, { audience: "followers", at: recent });
    const lines = await digestFor(db(), reader.id, now);
    expect(lines.map((l) => l.name)).toEqual(["FICTIONAL Followed"]);
  });

  it("leaves out a muted friend", async () => {
    const reader = await makeAccount();
    const muted = await makeAccount({ displayName: "FICTIONAL Muted" });
    const friend = await makeAccount({ displayName: "FICTIONAL Friend" });
    await befriend(reader, muted);
    await befriend(reader, friend);
    await mute(reader, muted);
    await post(muted, { at: recent });
    await post(friend, { at: recent });

    await runWeeklyDigest(db(), now);
    const [message] = await mailTo(reader.email);
    expect(message?.body).toContain("FICTIONAL Friend posted once.");
    expect(message?.body).not.toContain("FICTIONAL Muted");
  });

  it("a mute is the muter's alone: the muted person still hears about the muter", async () => {
    const a = await makeAccount({ displayName: "FICTIONAL A" });
    const b = await makeAccount({ displayName: "FICTIONAL B" });
    await befriend(a, b);
    await mute(a, b);
    await post(a, { at: recent });
    await post(b, { at: recent });
    expect(await digestFor(db(), a.id, now)).toEqual([]);
    expect((await digestFor(db(), b.id, now)).map((l) => l.name)).toEqual(["FICTIONAL A"]);
  });

  it("leaves out a friend blocked in either direction", async () => {
    const reader = await makeAccount();
    const blockedByReader = await makeAccount({ displayName: "FICTIONAL Blocked" });
    const blockerOfReader = await makeAccount({ displayName: "FICTIONAL Blocker" });
    await befriend(reader, blockedByReader);
    await befriend(reader, blockerOfReader);
    // Block rows alone: the friendship rows stay, so the block itself must deny.
    await block(reader, blockedByReader);
    await block(blockerOfReader, reader);
    await post(blockedByReader, { audience: "followers", at: recent });
    await post(blockerOfReader, { audience: "followers", at: recent });

    expect(await digestFor(db(), reader.id, now)).toEqual([]);
    const run = await runWeeklyDigest(db(), now);
    expect(await mailTo(reader.email)).toEqual([]);
    expect((await deliveryOf(reader.id))?.status).toBe("skipped");
    // Neither blocker nor blocked hears about the reader either.
    expect(run.sent).toBe(0);
  });

  it("does not count the recipient's own posts, or posts outside the last 7 days", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount({ displayName: "FICTIONAL Friend" });
    await befriend(reader, friend);
    await post(reader, { at: recent });
    await post(friend, { at: plus.days(now, -8) }); // too old
    await post(friend, { at: plus.minutes(now, 5) }); // after the run's clock

    expect(await digestFor(db(), reader.id, now)).toEqual([]);
    await runWeeklyDigest(db(), now);
    expect(await mailTo(reader.email)).toEqual([]);
    expect((await deliveryOf(reader.id))?.status).toBe("skipped");
  });
});

describe("who is sent nothing", () => {
  it("skips an account with weekly_email off: no email and no delivery", async () => {
    const reader = await makeAccount({ weeklyEmail: false });
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });

    const run = await runWeeklyDigest(db(), now);
    // Only the friend was considered (and had nothing to hear about).
    expect(run).toEqual({ weekStart: WEEK, sent: 0, skipped: 1, failed: 0 });
    expect(await mailTo(reader.email)).toEqual([]);
    expect(await deliveryOf(reader.id)).toBeNull();
  });

  it("skips a suspended account", async () => {
    const reader = await makeAccount({ suspended: true });
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });

    await runWeeklyDigest(db(), now);
    expect(await mailTo(reader.email)).toEqual([]);
    expect(await deliveryOf(reader.id)).toBeNull();
  });

  it("sends nothing and records 'skipped' when nobody posted", async () => {
    const reader = await makeAccount();
    const run = await runWeeklyDigest(db(), now);
    expect(run).toEqual({ weekStart: WEEK, sent: 0, skipped: 1, failed: 0 });
    expect(await mailTo(reader.email)).toEqual([]);
    expect((await deliveryOf(reader.id))?.status).toBe("skipped");
    expect(await db().select().from(mailLog)).toEqual([]);
  });
});

describe("once a week", () => {
  it("is idempotent within a week, and sends again the next week", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount({ displayName: "FICTIONAL Friend" });
    await befriend(reader, friend);
    await post(friend, { at: recent });

    const first = await runWeeklyDigest(db(), now);
    expect(first.sent).toBe(1);
    const second = await runWeeklyDigest(db(), now);
    const later = await runWeeklyDigest(db(), plus.days(now, 3)); // Sunday, same week
    expect(second).toEqual({ weekStart: WEEK, sent: 0, skipped: 0, failed: 0 });
    expect(later).toEqual({ weekStart: WEEK, sent: 0, skipped: 0, failed: 0 });
    expect(await mailTo(reader.email)).toHaveLength(1);
    expect((await deliveryOf(reader.id))?.status).toBe("sent");

    // The next Monday is a new week.
    const nextMonday = at("2026-09-28T00:00:00Z");
    await post(friend, { at: plus.hours(nextMonday, -1) });
    const next = await runWeeklyDigest(db(), nextMonday);
    expect(next.weekStart).toBe("2026-09-28");
    expect(next.sent).toBe(1);
    expect(await mailTo(reader.email)).toHaveLength(2);
  });

  it("does not send when the week is already recorded, whatever its status", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });
    await db()
      .insert(digestDeliveries)
      .values({ accountId: reader.id, weekStart: WEEK, status: "failed" });

    const run = await runWeeklyDigest(db(), now);
    expect(run.sent).toBe(0);
    expect(await mailTo(reader.email)).toEqual([]);
  });

  it("records 'failed' when the transport refuses, logs the attempt without an address, and does not retry that week", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend"); // refused outside production
    const reader = await makeAccount();
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const run = await runWeeklyDigest(db(), now);
    expect(run.failed).toBe(1);
    expect((await deliveryOf(reader.id))?.status).toBe("failed");
    const logs = await db().select().from(mailLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      kind: "digest",
      accountId: reader.id,
      status: "failed",
      errorCode: "transport_refused",
    });
    expect(JSON.stringify(logs[0])).not.toContain(reader.email);

    vi.unstubAllEnvs();
    const again = await runWeeklyDigest(db(), now);
    expect(again.sent).toBe(0);
    expect(await mailTo(reader.email)).toEqual([]);
    quiet.mockRestore();
  });

  it("logs a sent email in mail_log with the account and no address", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });
    await runWeeklyDigest(db(), now);
    const logs = await db().select().from(mailLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: "digest", accountId: reader.id, status: "sent" });
  });

  it("computes the week from Monday 00:00 UTC", () => {
    expect(weekStartOf(at("2026-09-21T00:00:00Z"))).toBe("2026-09-21");
    expect(weekStartOf(at("2026-09-20T23:59:59Z"))).toBe("2026-09-14"); // Sunday
    expect(weekStartOf(at("2026-09-27T23:59:59Z"))).toBe("2026-09-21");
    expect(weekStartOf(at("2026-01-01T12:00:00Z"))).toBe("2025-12-29"); // across a year
  });
});

describe("what the email says", () => {
  it("names up to five people, most posts first, then 'and N others', then the two links", async () => {
    const reader = await makeAccount();
    const names = ["Anna", "Petr", "Eva", "Jan", "Olga", "Karel", "Zora"];
    for (const [i, name] of names.entries()) {
      const friend = await makeAccount({ displayName: `FICTIONAL ${name}` });
      await befriend(reader, friend);
      // Anna 3 posts, Petr 2, the rest 1, at distinct times.
      const n = i === 0 ? 3 : i === 1 ? 2 : 1;
      for (let k = 0; k < n; k += 1) {
        await post(friend, { at: plus.minutes(recent, -(i * 10 + k)) });
      }
    }

    await runWeeklyDigest(db(), now);
    const [message] = await mailTo(reader.email);
    expect(message?.subject).toBe("This week on OURS");
    const body = message?.body ?? "";
    expect(body).toContain("FICTIONAL Anna posted 3 times.");
    expect(body).toContain("FICTIONAL Petr posted 2 times.");
    expect(body.indexOf("FICTIONAL Anna")).toBeLessThan(body.indexOf("FICTIONAL Petr"));
    expect(body.match(/ posted /g)).toHaveLength(5);
    expect(body).toContain("and 2 others");
    expect(body).toContain("Open OURS: http://localhost:3000/home");
    expect(body).toMatch(/Stop these emails: http:\/\/localhost:3000\/unsubscribe#\S+/);
  });
});

describe("the cron route", () => {
  const url = "http://localhost:3000/api/cron/weekly-digest";
  const call = async (headers: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    return POST(new Request(url, { method: "POST", headers }));
  };

  async function due() {
    const reader = await makeAccount();
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: new Date(Date.now() - 60 * 60 * 1000) });
    return reader;
  }

  it("refuses every request while CRON_SECRET is unset, and runs nothing", async () => {
    const reader = await due();
    vi.stubEnv("CRON_SECRET", "");
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer " },
      { authorization: "Bearer undefined" },
    ];
    for (const headers of attempts) {
      const response = await call(headers);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: "The weekly email is switched off." });
    }
    expect(await mailTo(reader.email)).toEqual([]);
    expect(await db().select().from(digestDeliveries)).toEqual([]);
  });

  it("refuses a missing or wrong bearer token, and runs nothing", async () => {
    const reader = await due();
    const secret = process.env.CRON_SECRET ?? "";
    expect(secret.length).toBeGreaterThan(0);
    const attempts: Record<string, string>[] = [
      {},
      { authorization: secret },
      { authorization: `Bearer ${secret}x` },
      { authorization: `bearer ${secret}` },
      { authorization: `Basic ${secret}` },
      { authorization: `Bearer ${secret.slice(0, -1)}` },
    ];
    for (const headers of attempts) {
      const response = await call(headers);
      expect(response.status, JSON.stringify(headers)).toBe(401);
    }
    expect(await mailTo(reader.email)).toEqual([]);
    expect(await db().select().from(digestDeliveries)).toEqual([]);
  });

  it("runs with the right token and answers with counts only", async () => {
    const reader = await due();
    const response = await call({ authorization: `Bearer ${process.env.CRON_SECRET}` });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["failed", "ok", "sent", "skipped", "weekStart"]);
    expect(body).toMatchObject({ ok: true, sent: 1, skipped: 1, failed: 0 });
    expect(await mailTo(reader.email)).toHaveLength(1);
  });
});

describe("unsubscribe", () => {
  it("refuses a tampered, forged or malformed token with NOT_FOUND, and changes nothing", async () => {
    const person = await makeAccount();
    const other = await makeAccount();
    const token = digestUnsubscribeToken(person.id);
    const [id, sig] = token.split(".") as [string, string];
    const flipped = `${id}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;

    const bad: unknown[] = [
      flipped,
      `${other.id}.${sig}`, // someone else's id under this signature
      `${id}.`,
      `.${sig}`,
      id,
      "",
      `${id}.${sig}.extra`,
      `${id}.${sig}`.repeat(10), // too long
      null,
      undefined,
      42,
      { token },
    ];
    for (const value of bad) {
      expect(await refusal(digestUnsubscribe(db(), value))).toBe("NOT_FOUND");
    }
    expect(await weeklyEmailOf(person.id)).toBe(true);
    expect(await weeklyEmailOf(other.id)).toBe(true);
  });

  it("is not a session signature: a value signed for another purpose is refused", async () => {
    const person = await makeAccount();
    const { signValue } = await import("@/core/auth");
    expect(await refusal(digestUnsubscribe(db(), signValue(person.id)))).toBe("NOT_FOUND");
    expect(await weeklyEmailOf(person.id)).toBe(true);
  });

  it("sets weekly_email to false for the account the token names, and only that one", async () => {
    const person = await makeAccount();
    const other = await makeAccount();
    await digestUnsubscribe(db(), digestUnsubscribeToken(person.id));
    expect(await weeklyEmailOf(person.id)).toBe(false);
    expect(await weeklyEmailOf(other.id)).toBe(true);
    // Using it again is harmless.
    await digestUnsubscribe(db(), digestUnsubscribeToken(person.id));
    expect(await weeklyEmailOf(person.id)).toBe(false);
  });

  it("the link in the email works, and after it no more weekly emails come", async () => {
    const reader = await makeAccount();
    const friend = await makeAccount();
    await befriend(reader, friend);
    await post(friend, { at: recent });
    await runWeeklyDigest(db(), now);
    const [message] = await mailTo(reader.email);
    const token = tokenFromLink(message?.body ?? "");
    expect(token).toBe(digestUnsubscribeToken(reader.id));

    await digestUnsubscribe(db(), token);
    expect(await weeklyEmailOf(reader.id)).toBe(false);

    const nextMonday = at("2026-09-28T08:00:00Z");
    await post(friend, { at: plus.hours(nextMonday, -1) });
    await runWeeklyDigest(db(), nextMonday);
    expect(await mailTo(reader.email)).toHaveLength(1);
  });

  it("a token signed under a different secret is refused", async () => {
    const person = await makeAccount();
    const token = digestUnsubscribeToken(person.id);
    vi.stubEnv("SESSION_SECRET", "another-FICTIONAL-secret-0123456789abcdef0123456789");
    expect(await refusal(digestUnsubscribe(db(), token))).toBe("NOT_FOUND");
    vi.unstubAllEnvs();
    expect(await weeklyEmailOf(person.id)).toBe(true);
  });
});
