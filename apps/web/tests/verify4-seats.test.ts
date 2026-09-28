/**
 * Verification 4 of M-0011 (seats, the waiting list, privacy, authorization
 * and abuse), by an agent that did not build it.
 *
 * Stopping rule, declared before the first test was written: every door in
 * the brief is tried at least once, and each try ends here either as a
 * failing "DEFECT: …" test or as a passing "closed: …" test. Nothing in the
 * product code is changed by this file.
 *
 * Everyone here is FICTIONAL, with example.test addresses; client addresses
 * are keyed hashes of the documentation ranges (RFC 5737). Server actions
 * are called directly: next/headers is an in-memory cookie jar and header
 * map, and Next's `after` is a queue this file runs by hand. Sessions are
 * real rows, so /admin's actions check them the way a request would.
 */
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  headers: new Map<string, string>(),
  later: [] as Array<() => unknown>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (web.jar.has(name) ? { name, value: web.jar.get(name)! } : undefined),
    set: (name: string, value: string, options?: { expires?: Date }) => {
      if (!value || (options?.expires && options.expires.getTime() <= Date.now())) web.jar.delete(name);
      else web.jar.set(name, value);
    },
    delete: (name: string) => void web.jar.delete(name),
  }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    web.later.push(task);
  },
  // /join waits for a request with `connection()`; here there is none to wait for.
  connection: async () => undefined,
}));

import { forgetAction, openSeatsAction } from "@/app/(app)/admin/actions";
import { openEmailLinkAction } from "@/app/(public)/auth/actions";
import { addInviterAction } from "@/app/(public)/join/confirm/actions";
import ConfirmInvitePage from "@/app/(public)/join/confirm/page";
import JoinPage from "@/app/(public)/join/page";
import FrontPageRoute from "@/app/(public)/page";
import { takeSeat } from "@/app/(public)/seat-actions";
import { GET as healthRoute } from "@/app/api/health/route";
import { deleteAccount, openEmailLink } from "@/core/accounts";
import { createSession, revokeSession } from "@/core/auth";
import { listFriends, listRequests } from "@/core/connections";
import type { Db } from "@/core/db";
import { digestFor } from "@/core/digest";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import {
  completeJoin,
  createInvite,
  INVITE_UNUSABLE,
  inviteForViewer,
  listInvites,
  lookupInvite,
  NOTE_RESERVED,
  requestJoin,
  SEAT_NOTE,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { type Defer, latestOutbox, tokenFromLink } from "@/core/mail";
import { countUnread } from "@/core/notifications";
import * as schema from "@/core/schema";
import {
  accounts,
  emailTokens,
  friendRequests,
  friendships,
  invites,
  notifications,
  outbox,
  pendingJoins,
  seatState as seatRow,
  waitlist,
} from "@/core/schema";
import {
  forgetWaitlistAddress,
  memberCount,
  openSeats,
  requestSeat,
  SEATS_CLOSED,
  SEATS_OFF,
  seatState,
} from "@/core/seats";
import { areFriends } from "@/core/visibility";
import { SESSION_COOKIE } from "@/web/session";
import { at, db, makeAccount, plus, post, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  web.jar.clear();
  web.headers.clear();
  web.later.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const t0 = at("2026-09-28T10:00:00Z");
/** A different client address for each n. */
const ipOf = (n: number) => rateKeyHash(`198.51.100.${n % 250}`);
let nextIp = 0;

/* ---------------------------------------------------------------- helpers */

/** The maintainer: the oldest active administrator. */
async function maintainer() {
  return makeAccount({
    handle: "rado_fict",
    displayName: "Rado FICTIONAL",
    email: "rado_fict@example.test",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
  });
}

/** Ask for a seat, from a new client address unless one is given. */
async function ask(
  email: string,
  options: { now?: Date; ipHash?: string; defer?: Defer; on?: Db } = {},
): Promise<void> {
  nextIp += 1;
  return requestSeat(options.on ?? db(), {
    email,
    ipHash: options.ipHash ?? ipOf(nextIp),
    now: options.now ?? t0,
    defer: options.defer,
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function openNow(): Promise<number> {
  return (await seatState(db())).open;
}

async function line(): Promise<string[]> {
  const rows = await db()
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((row) => row.email);
}

async function inLine(entries: [string, Date][]): Promise<void> {
  await db()
    .insert(waitlist)
    .values(entries.map(([email, createdAt]) => ({ email, createdAt })));
}

async function mailTo(email: string) {
  return db().select().from(outbox).where(eq(outbox.toAddress, email));
}

async function linkTo(email: string): Promise<string> {
  const mail = await latestOutbox(db(), email, "join");
  if (!mail) throw new Error(`no join mail to ${email}`);
  return tokenFromLink(mail.body)!;
}

async function seatInvites() {
  return db().select().from(invites).where(eq(invites.note, SEAT_NOTE));
}

/** The usable seat invites an address holds: those a link to it was made for. */
async function seatsHeldBy(email: string, now: Date): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ id: invites.id })
    .from(emailTokens)
    .innerJoin(invites, eq(invites.id, emailTokens.inviteId))
    .where(
      and(
        eq(emailTokens.email, email),
        eq(invites.note, SEAT_NOTE),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
      ),
    );
  return rows.map((row) => row.id);
}

/** The Resend transport chosen but not configured: every send returns ok: false. */
function transportRefuses(): void {
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

/**
 * The database, except that writing a message for `fails(address)` to the
 * outbox throws, as a dropped connection would at that moment. Everything
 * else, transactions included, is the real database.
 */
function outboxWriteThrows(real: Db, fails: (to: string) => boolean): Db {
  return new Proxy(real, {
    get(target, property) {
      if (property === "insert") {
        return (table: Parameters<Db["insert"]>[0]) => {
          const builder = target.insert(table);
          if (table !== outbox) return builder;
          return {
            values: (row: { toAddress: string }) =>
              fails(row.toAddress)
                ? Promise.reject(new Error("FICTIONAL: the outbox write failed"))
                : builder.values(row as never),
          };
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/** Join through a friend's ordinary invite, by the product's own path. */
async function joinThroughFriend(
  email: string,
  inviterId: string,
  handle: string,
  now: Date,
): Promise<string> {
  const { code } = await createInvite(db(), inviterId, { note: "FICTIONAL", now });
  await requestJoin(db(), { code, email, ipHash: ipOf(240), now });
  const opened = await openEmailLink(db(), { token: await linkTo(email), now: plus.minutes(now, 1) });
  if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
  const joined = await completeJoin(db(), {
    pendingJoinId: opened.pendingJoinId,
    displayName: `FICTIONAL ${handle}`,
    handle,
    adultConfirmed: true,
    now: plus.minutes(now, 2),
  });
  return joined.accountId;
}

async function signInAs(accountId: string): Promise<string> {
  const session = await createSession(db(), accountId);
  web.jar.set(SESSION_COOKIE, session.cookieValue);
  return session.id;
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runLater(): Promise<void> {
  while (web.later.length > 0) await web.later.shift()!();
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/* ======================================================= DEFECTS: seats */

describe("a failed email and the seat (SPEC §18.12 item 3: nobody loses a seat to a failed email)", () => {
  it("fixed (SPEC §18.12): a seat given back after a failed email goes to the next newcomer, not to the address that waits in line for it (MEDIUM)", async () => {
    const rado = await maintainer();
    await inLine([["ida_f@example.test", plus.days(t0, -3)]]);
    transportRefuses();
    expect(await openSeats(db(), rado.id, 1, { now: t0 })).toEqual({ opened: 1, invited: 1 });
    vi.unstubAllEnvs();

    // Ida's email failed: her seat reopened and she is back at her place in
    // line, both at once. The front page told her "No seats open right now.
    // Leave your address and you'll get the next one."
    expect(await openNow()).toBe(1);
    expect(await line()).toEqual(["ida_f@example.test"]);

    // Zoe asks a minute later and takes that seat.
    await ask("zoe_f@example.test", { now: plus.minutes(t0, 1) });
    const zoeHoldsASeat = (await mailTo("zoe_f@example.test")).length > 0;
    const idaStillWaits = (await line()).includes("ida_f@example.test");
    expect(
      zoeHoldsASeat && idaStillWaits,
      "Zoe, who asked three days after Ida, holds a seat while Ida still waits in line",
    ).toBe(false);
  });

  it("recorded (SPEC §18.12): a wave's seat emails wait for one task after the response; if it never runs, those addresses hold seats they were not told of, and asking again on the front page sends a link to the seat each holds (MEDIUM)", async () => {
    const rado = await maintainer();
    await inLine([
      ["ana_f@example.test", plus.days(t0, -3)],
      ["ben_f@example.test", plus.days(t0, -2)],
    ]);
    // The function stops after the response (a time limit, a crash, a
    // deploy): the task handed to `defer` never runs. A wave may be 10,000
    // emails sent one after another in that one task.
    const lost: Array<() => Promise<void>> = [];
    const result = await openSeats(db(), rado.id, 2, {
      now: t0,
      defer: (task) => void lost.push(task),
    });
    expect(result).toEqual({ opened: 2, invited: 2 });
    expect(lost).toHaveLength(1);

    // Recorded, not fixed: a durable queue of owed seat emails is a later
    // build. What holds today: each address holds its seat, and asking again
    // sends a link to it.
    for (const email of ["ana_f@example.test", "ben_f@example.test"]) {
      expect((await line()).includes(email)).toBe(false);
      expect(await mailTo(email)).toEqual([]);
      await ask(email, { now: plus.hours(t0, 1) });
      expect((await mailTo(email)).length, `${email} gets a link to the seat it holds`).toBe(1);
    }
  });

  it("fixed (SPEC §18.12): a wave whose seat email throws logs it without the address, gives the seat back and keeps the address's place (LOW)", async () => {
    const rado = await maintainer();
    await inLine([["ivo_f@example.test", plus.days(t0, -2)]]);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await openSeats(outboxWriteThrows(db(), (to) => to === "ivo_f@example.test"), rado.id, 1, { now: t0 });
    expect(quiet).toHaveBeenCalled();

    expect(await mailTo("ivo_f@example.test")).toEqual([]);
    // What a failed email does when it returns false (tests/seats.test.ts):
    // the seat reopens and the address keeps its place.
    expect(
      { open: await openNow(), waiting: await line() },
      "the failure was logged and the seat was not given back",
    ).toEqual({ open: 1, waiting: ["ivo_f@example.test"] });
  });

  it("fixed (SPEC §18.12): a request whose seat email throws, instead of returning false, keeps the seat taken and the address out of the line (LOW)", async () => {
    await maintainer();
    await inLine([["leo_f@example.test", plus.days(t0, -4)]]);
    await setOpen(1);
    await ask("leo_f@example.test", {
      on: outboxWriteThrows(db(), (to) => to === "leo_f@example.test"),
    }).catch(() => undefined);

    expect(await mailTo("leo_f@example.test")).toEqual([]);
    expect(
      { open: await openNow(), waiting: await line() },
      "the task died after the seat was taken; the seat was not given back",
    ).toEqual({ open: 1, waiting: ["leo_f@example.test"] });
  });
});

/* ================================================ DEFECTS: the waiting list */

describe("the waiting list keeps an address after it has joined, or after its account is deleted", () => {
  it("fixed (SPEC §18.12): an address that joins through a friend's invite stays in the waiting list (LOW)", async () => {
    await maintainer();
    const ben = await makeAccount({ handle: "ben_f" });
    await inLine([["mia_f@example.test", plus.days(t0, -5)]]);
    await joinThroughFriend("mia_f@example.test", ben.id, "mia_f", t0);

    // M-0011: the waiting list "deletes an address when it is invited". Mia
    // was invited and has joined; her address still waits, and the
    // administrator's "In line" counts her.
    expect(await line(), "a member's address is kept in the waiting list").toEqual([]);
  });

  it("fixed (SPEC §18.12): deleting an account leaves its address in the waiting list, and the next wave sends a seat link to it (MEDIUM)", async () => {
    const rado = await maintainer();
    const ben = await makeAccount({ handle: "ben_f" });
    await inLine([["mia_f@example.test", plus.days(t0, -5)]]);
    const mia = await joinThroughFriend("mia_f@example.test", ben.id, "mia_f", t0);
    await deleteAccount(db(), mia, "mia_f");
    expect(await mailTo("mia_f@example.test")).toEqual([]); // deletion removed her mail

    await openSeats(db(), rado.id, 1, { now: plus.days(t0, 2) });
    expect(
      (await mailTo("mia_f@example.test")).map((m) => m.subject),
      "a person who deleted their account is mailed a seat link",
    ).toEqual([]);
  });

  it("fixed (SPEC §18.12): removing a seat holder at their request loses the seat: its invite stays usable with no link, and the seat never reopens (LOW)", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("eva_f@example.test");
    expect(await openNow()).toBe(0);

    await forgetWaitlistAddress(db(), rado.id, "eva_f@example.test");
    expect(await db().select().from(emailTokens).where(eq(emailTokens.email, "eva_f@example.test"))).toEqual([]);
    const [seat] = await seatInvites();
    expect(
      { open: await openNow(), seatWithdrawn: seat!.revokedAt !== null },
      "the seat was neither withdrawn nor reopened",
    ).toEqual({ open: 1, seatWithdrawn: true });
  });
});

/* ======================================== DEFECTS: friendship and the count */

describe("a seat is not an offer of friendship (SPEC §18.12 item 2)", () => {
  it("fixed (SPEC §18.12 item 12): /join tells a person joining through a seat that it is a seat, not a friendship; joining makes none (MEDIUM)", async () => {
    const rado = await maintainer();
    await setOpen(1);
    const now = new Date();
    await ask("lea_f@example.test", { now });
    expect(await openEmailLinkAction(await linkTo("lea_f@example.test"))).toEqual({ ok: true, next: "/join" });

    const page = textOf(renderToStaticMarkup((await JoinPage()) as ReactElement));
    expect(page).toContain("You took a seat on our.one.");

    const [pending] = await db().select().from(pendingJoins);
    const joined = await completeJoin(db(), {
      pendingJoinId: pending!.id,
      displayName: "Lea FICTIONAL",
      handle: "lea_f",
      adultConfirmed: true,
      now: new Date(),
    });
    expect(await areFriends(db(), rado.id, joined.accountId)).toBe(false);
    expect(page, "the page promised a friendship that the join did not make").not.toContain("you're friends");
  });

  it("fixed (SPEC §18.12): an old seat link opened by an account holder offers \"Add Rado as a friend?\" instead of being refused as unusable (LOW)", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("noa_f@example.test", { now: new Date() });
    const seatLink = await linkTo("noa_f@example.test");
    // Noa joins another way, then opens the seat link.
    const noa = await makeAccount({ handle: "noa_f", email: "noa_f@example.test" });

    const opened = await openEmailLinkAction(seatLink);
    const page = textOf(renderToStaticMarkup((await ConfirmInvitePage()) as ReactElement));
    // The Add itself is refused, and no friendship is made...
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await areFriends(db(), rado.id, noa.id)).toBe(false);
    // ...but the seat link was offered as a friendship with the maintainer.
    expect(page, "the page offers friendship with the maintainer").not.toContain("as a friend?");
    expect(opened, "the seat link goes to /join/confirm's offer").toEqual({ ok: true, next: "/home" });
  });
});

describe("the public count (D-0012 §B, SPEC §18.1)", () => {
  it("fixed (SPEC §18.12): /api/health publishes a second count of accounts that includes suspended ones; its difference from the front page's count is how many are suspended (LOW)", async () => {
    await makeAccount({ handle: "amy_f" });
    await makeAccount({ handle: "bo_f", suspended: true });
    const body = (await (await healthRoute()).json()) as { counts: { accounts: number } | null };
    expect(await memberCount(db())).toBe(1);
    // A suspended account reads like a deleted one everywhere else (SPEC §17
    // item 11). Two public numbers apart by exactly the suspended accounts
    // tell a watcher whether a profile that vanished was suspended.
    expect(body.counts?.accounts, "/api/health counts the suspended account").toBe(await memberCount(db()));
  });
});

/* ============================================ closed: what an address shows */

describe("closed doors: nothing tells whether an address is a member, in line, or holds a seat", () => {
  async function fiveKinds() {
    await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await makeAccount({ handle: "sam_f", email: "sam_f@example.test", suspended: true });
    await setOpen(1);
    await ask("holder_f@example.test", { now: plus.minutes(t0, -30) });
    await inLine([["listed_f@example.test", plus.days(t0, -1)]]);
    return [
      "vera_f@example.test", // a member
      "sam_f@example.test", // a suspended member
      "listed_f@example.test", // in line
      "holder_f@example.test", // holds a seat
      "new_f@example.test", // a newcomer
    ];
  }

  for (const open of [10, 0]) {
    it(`closed: with ${open} seats open, a member, a suspended member, an address in line, a seat holder and a newcomer get the same answer, the same statements before the response, and move the public number the same`, async () => {
      const emails = await fiveKinds();
      await setOpen(open);
      const statements: { query: string; params: unknown[] }[] = [];
      const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 2 });
      const logged = drizzle(pool, {
        schema,
        logger: { logQuery: (query, params) => void statements.push({ query, params }) },
      }) as unknown as Db;
      const later: Array<() => Promise<void>> = [];
      const seen: { answer: unknown; queries: string[]; moved: number }[] = [];
      try {
        for (const [i, email] of emails.entries()) {
          const before = await openNow();
          statements.length = 0;
          const answer = await requestSeat(logged, {
            email,
            ipHash: ipOf(100 + i),
            now: t0,
            defer: (task) => void later.push(task),
          });
          const queries = statements.map((s) => s.query);
          const local = email.slice(0, email.indexOf("@"));
          expect(JSON.stringify(statements.map((s) => s.params)), email).not.toContain(local);
          await later.pop()!();
          seen.push({ answer, queries, moved: before - (await openNow()) });
        }
      } finally {
        await pool.end();
      }
      for (const [i, run] of seen.entries()) {
        expect(run, emails[i]).toEqual({ answer: undefined, queries: seen[0]!.queries, moved: open > 0 ? 1 : 0 });
      }
    });
  }

  it("closed: the rate-limit answer comes at the same request for a member and a stranger, and a refused request uses no seat", async () => {
    await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(10);
    const codes = async (email: string) => {
      const out: string[] = [];
      for (let i = 0; i < 4; i++) out.push(await codeOf(ask(email, { now: plus.minutes(t0, i) })));
      return out;
    };
    expect(await codes("vera_f@example.test")).toEqual(["OK", "OK", "OK", "RATE_LIMITED"]);
    expect(await codes("stranger_f@example.test")).toEqual(["OK", "OK", "OK", "RATE_LIMITED"]);
    expect(await openNow()).toBe(4);
  });

  it("closed: the email a seat holder gets on asking again is word for word a newcomer's, apart from the link", async () => {
    await maintainer();
    await setOpen(2);
    await ask("holder_f@example.test", { now: t0 });
    await ask("holder_f@example.test", { now: plus.minutes(t0, 20) });
    const mails = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.toAddress, "holder_f@example.test"))
      .orderBy(asc(outbox.createdAt), asc(outbox.id));
    expect(mails).toHaveLength(2);
    const shape = (body: string) => body.replace(/\/auth#[A-Za-z0-9_.-]+/, "/auth#LINK");
    expect(new Set(mails.map((m) => m.subject))).toEqual(new Set(["Your seat on our.one"]));
    expect(shape(mails[1]!.body)).toBe(shape(mails[0]!.body));
    expect(tokenFromLink(mails[1]!.body)).not.toBe(tokenFromLink(mails[0]!.body));
  });

  it("closed: the Get in answer is the same words for a member and a newcomer, and every lookup waits for after the response", async () => {
    await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(2);
    web.headers.set("x-forwarded-for", "203.0.113.7");
    const a = await takeSeat(null, form({ email: "vera_f@example.test" }));
    web.headers.set("x-forwarded-for", "203.0.113.8");
    const b = await takeSeat(null, form({ email: "new_f@example.test" }));
    expect([a, b]).toEqual([{ ok: true }, { ok: true }]);
    expect(await openNow()).toBe(2);
    expect(web.later).toHaveLength(2);
    await runLater();
    expect(await openNow()).toBe(0);
  });
});

/* ================================================= closed: seats and races */

describe("closed doors: more than one seat, a count below zero, races", () => {
  it("closed: one address asking twice at once, with seats open, holds one seat invite", async () => {
    await maintainer();
    await setOpen(5);
    await Promise.all([ask("twin_f@example.test"), ask("twin_f@example.test")]);
    expect(await seatsHeldBy("twin_f@example.test", t0)).toHaveLength(1);
    expect(await line()).toEqual([]);
  });

  it("closed: requests, a wave and a removal racing never drive the count below zero, never give one address two seats, and never leave a holder in line", async () => {
    const rado = await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(3);
    await inLine([
      ["l1_f@example.test", plus.days(t0, -3)],
      ["l2_f@example.test", plus.days(t0, -2)],
      ["l3_f@example.test", plus.days(t0, -1)],
    ]);
    const addresses = ["n1_f@example.test", "n2_f@example.test", "l1_f@example.test", "vera_f@example.test"];
    const results = await Promise.allSettled([
      openSeats(db(), rado.id, 2, { now: t0 }),
      ...addresses.flatMap((email) => [ask(email), ask(email)]),
      forgetWaitlistAddress(db(), rado.id, "l2_f@example.test"),
      openSeats(db(), rado.id, 1, { now: t0 }),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await openNow()).toBeGreaterThanOrEqual(0);
    const waiting = await line();
    for (const email of [...addresses, "l2_f@example.test", "l3_f@example.test"]) {
      const held = await seatsHeldBy(email, t0);
      expect(held.length, email).toBeLessThanOrEqual(1);
      if (held.length > 0) expect(waiting, email).not.toContain(email);
    }
    expect(await seatsHeldBy("vera_f@example.test", t0)).toEqual([]);
  });

  it("closed: a failed email to an address that already holds a seat does not cost it that seat", async () => {
    await maintainer();
    await setOpen(1);
    await ask("hana_f@example.test", { now: t0 });
    const [seat] = await seatInvites();
    transportRefuses();
    await ask("hana_f@example.test", { now: plus.minutes(t0, 20) });
    vi.unstubAllEnvs();
    expect(await seatsHeldBy("hana_f@example.test", plus.minutes(t0, 21))).toEqual([seat!.id]);
    await ask("hana_f@example.test", { now: plus.minutes(t0, 30) });
    const token = await linkTo("hana_f@example.test");
    const opened = await openEmailLink(db(), { token, now: plus.minutes(t0, 31) });
    expect(opened.kind).toBe("join_pending");
  });
});

/* ============================================== closed: who may open seats */

describe("closed doors: openSeats and forgetWaitlistAddress without being an active administrator", () => {
  it("closed: the core refuses a demoted administrator, a suspended one, a member, an unknown id and injected text; nothing changes", async () => {
    await maintainer();
    const demoted = await makeAccount({ handle: "ex_admin_f", isAdmin: false, createdAt: at("2025-12-01T00:00:00Z") });
    const suspended = await makeAccount({ handle: "sus_admin_f", isAdmin: true, suspended: true });
    const member = await makeAccount({ handle: "vera_f" });
    await inLine([["mara_f@example.test", t0]]);
    for (const id of [demoted.id, suspended.id, member.id, "01FICTIONALMISSING00000000", "' or 1=1 --", " "]) {
      expect(await codeOf(openSeats(db(), id, 5, { now: t0 })), id).toBe("NOT_FOUND");
      expect(await codeOf(forgetWaitlistAddress(db(), id, "mara_f@example.test")), id).toBe("NOT_FOUND");
    }
    expect(await db().select().from(seatRow)).toEqual([]);
    expect(await line()).toEqual(["mara_f@example.test"]);
    expect(await db().select().from(outbox)).toEqual([]);
  });

  it("closed: /admin's actions refuse a signed-out caller, a revoked session and a suspended administrator's session (to /signin), and a member's session (not found)", async () => {
    await maintainer();
    const ida = await makeAccount({ handle: "ida_admin_f", isAdmin: true, createdAt: at("2026-02-01T00:00:00Z") });
    const member = await makeAccount({ handle: "vera_f" });
    await inLine([["mara_f@example.test", t0]]);
    const toSignIn = { digest: expect.stringContaining("NEXT_REDIRECT") };

    await expect(openSeatsAction(null, form({ count: "5" }))).rejects.toMatchObject(toSignIn);
    await expect(forgetAction(null, form({ email: "mara_f@example.test" }))).rejects.toMatchObject(toSignIn);

    const revoked = await signInAs(ida.id);
    await revokeSession(db(), revoked);
    await expect(openSeatsAction(null, form({ count: "5" }))).rejects.toMatchObject(toSignIn);

    await signInAs(ida.id);
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, ida.id));
    await expect(openSeatsAction(null, form({ count: "5" }))).rejects.toMatchObject(toSignIn);

    await signInAs(member.id);
    const refused = { ok: false, error: "That isn't available." };
    expect(await openSeatsAction(null, form({ count: "5" }))).toEqual(refused);
    expect(await forgetAction(null, form({ email: "mara_f@example.test" }))).toEqual(refused);

    await runLater();
    expect(await db().select().from(seatRow)).toEqual([]);
    expect(await line()).toEqual(["mara_f@example.test"]);
  });
});

/* ===================================== closed: no controller, no seats */

describe("closed doors: a seat or a place in line while no data controller is named", () => {
  const missing: Record<string, string>[] = [
    { DATA_CONTROLLER: "" },
    { DATA_CONTROLLER: "   " },
    { DATA_CONTROLLER_EMAIL: "" },
    { DATA_CONTROLLER_EMAIL: "controller" },
    { DATA_CONTROLLER_EMAIL: "[ confirm ] controller@example.test" },
  ];

  it("closed: every path is refused, even with seats opened and a link sent while one was named", async () => {
    const rado = await maintainer();
    await setOpen(3);
    await ask("held_f@example.test", { now: new Date() });
    const heldLink = await linkTo("held_f@example.test");
    await inLine([["mara_f@example.test", t0]]);
    const mailBefore = (await db().select().from(outbox)).length;

    for (const env of missing) {
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const label = JSON.stringify(env);
      web.jar.clear();

      expect(await codeOf(ask("new_f@example.test", { now: new Date() })), label).toBe("CLOSED");
      web.headers.set("x-forwarded-for", "203.0.113.9");
      expect(await takeSeat(null, form({ email: "new2_f@example.test" })), label).toEqual({ error: SEATS_CLOSED });
      const front = renderToStaticMarkup((await FrontPageRoute()) as ReactElement);
      expect(front, label).not.toContain('name="email"');
      expect(await codeOf(openEmailLink(db(), { token: heldLink, now: new Date() })), label).toBe("CLOSED");

      await signInAs(rado.id);
      expect(await openSeatsAction(null, form({ count: "5" })), label).toEqual({ ok: false, error: SEATS_OFF });
      await runLater();
    }
    vi.unstubAllEnvs();
    expect(await openNow()).toBe(2);
    expect(await line()).toEqual(["mara_f@example.test"]);
    expect(await db().select().from(outbox)).toHaveLength(mailBefore);
    // The link was not used up by the refusals.
    expect((await openEmailLink(db(), { token: heldLink, now: new Date() })).kind).toBe("join_pending");
  });
});

/* ============================================ closed: the public count */

describe("closed doors: the public count", () => {
  // Changed after the build (SPEC §18.14): the first version asked at the
  // real clock, with the line stamped at t0. Before 10:00 UTC on 28
  // September 2026, the clock was earlier than t0, so kai joined the line
  // ahead of w2 and took the second seat. From 10:00 UTC the line went
  // first, as it should, and the test failed. It now runs at a fixed time
  // after the line formed, and joins through a seat the line received.
  it("closed: it leaves out suspended accounts, the waiting list, seats not yet used and joins not finished; a seat joiner counts once joined, and not once suspended", async () => {
    await maintainer();
    await makeAccount({ handle: "sus_f", suspended: true });
    await inLine([
      ["w1_f@example.test", t0],
      ["w2_f@example.test", t0],
    ]);
    await setOpen(2);
    const now = plus.minutes(t0, 5);
    await ask("kai_f@example.test", { now });
    await ask("una_f@example.test", { now });
    expect(await memberCount(db())).toBe(1);
    // The line went first: the two seats went to w1 and w2.
    expect(await line()).toEqual(["kai_f@example.test", "una_f@example.test"]);

    const opened = await openEmailLink(db(), { token: await linkTo("w1_f@example.test"), now });
    if (opened.kind !== "join_pending") throw new Error(opened.kind);
    expect(await memberCount(db())).toBe(1); // a join not finished
    const w1 = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "Wren FICTIONAL",
      handle: "w1_f",
      adultConfirmed: true,
      now,
    });
    expect(await memberCount(db())).toBe(2);
    await db().update(accounts).set({ suspendedAt: now }).where(eq(accounts.id, w1.accountId));
    expect(await memberCount(db())).toBe(1);
  });
});

/* ================================ closed: the maintainer and seat joiners */

describe("closed doors: joining through a seat makes no friend and shows the joiner to nobody", () => {
  it("closed: the maintainer's friends, requests, notifications, invites, export and weekly email never name a seat joiner", async () => {
    const rado = await maintainer();
    await setOpen(1);
    const now = new Date();
    await ask("tia_f@example.test", { now });
    const opened = await openEmailLink(db(), { token: await linkTo("tia_f@example.test"), now });
    if (opened.kind !== "join_pending") throw new Error(opened.kind);
    const tia = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "Tia FICTIONAL",
      handle: "tia_f",
      adultConfirmed: true,
      now,
    });
    await post(tia.accountId, { audience: "friends", at: now });
    await post(tia.accountId, { audience: "followers", at: now });

    expect(await db().select().from(friendships)).toEqual([]);
    expect(await db().select().from(friendRequests)).toEqual([]);
    expect(await db().select().from(notifications)).toEqual([]);
    expect(await areFriends(db(), rado.id, tia.accountId)).toBe(false);
    expect(await listFriends(db(), rado.id)).toEqual([]);
    expect(await listRequests(db(), rado.id, now)).toEqual({ incoming: [], outgoing: [] });
    expect(await countUnread(db(), rado.id)).toBe(0);
    expect((await listInvites(db(), rado.id, now)).invites).toEqual([]);
    const exported = JSON.stringify(await exportAccount(db(), rado.id, now));
    expect(exported).not.toContain("tia_f");
    expect(exported).not.toContain("Tia FICTIONAL");
    expect(await digestFor(db(), rado.id, plus.minutes(now, 1))).toEqual([]);
  });

  it("closed: nothing sent to anyone opens a seat invite as an invite code, and no note of a person's own marks an invite as a seat", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("gil_f@example.test");
    const token = await linkTo("gil_f@example.test");
    expect(await lookupInvite(db(), token, t0)).toBeNull();
    expect(await inviteForViewer(db(), { code: token, viewerId: null, now: t0 })).toEqual({ kind: "unusable" });

    for (const note of ["seat", " seat ", "seat ", "\tseat\n"]) {
      expect(await codeOf(createInvite(db(), rado.id, { note, now: t0 })), JSON.stringify(note)).toBe("INVALID");
    }
    await expect(createInvite(db(), rado.id, { note: "seat ", now: t0 })).rejects.toThrow(NOTE_RESERVED);
    // Other spellings are ordinary invites: listed, and theirs to revoke.
    await createInvite(db(), rado.id, { note: "SEAT", now: t0 });
    expect((await listInvites(db(), rado.id, t0)).invites.map((i) => i.note)).toEqual(["SEAT"]);
  });
});
