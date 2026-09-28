/**
 * Seats, the waiting list and the public count (SPEC §18.4, and §18.8's
 * list for Builder B). Denial paths first. Everyone here is FICTIONAL, with
 * example.test addresses; client addresses are keyed hashes of the
 * documentation ranges (RFC 5737).
 *
 * The race harness at the end follows SPEC §17's verification tests: many
 * requests at once for few seats, and requests held behind the seat lock
 * while the count changes under them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { openEmailLink } from "@/core/accounts";
import { consumeEmailToken, createEmailToken, createPendingJoin } from "@/core/auth";
import { scanText } from "@/core/claims";
import { EMAIL_TOKEN_TTL_MINUTES, INVITE_TTL_DAYS } from "@/core/config";
import type { Db } from "@/core/db";
import { isCoreError } from "@/core/errors";
import {
  completeJoin,
  createInvite,
  listInvites,
  NOTE_RESERVED,
  revokeInvite,
  SEAT_NOTE,
} from "@/core/invites";
import { RATE_LIMITED_MESSAGE, rateKeyHash } from "@/core/limits";
import { type Defer, latestOutbox, sendMail, tokenFromLink } from "@/core/mail";
import { seatEmail } from "@/core/mail-templates";
import * as schema from "@/core/schema";
import {
  accounts,
  emailTokens,
  invites,
  outbox,
  pendingJoins,
  rateEvents,
  seatState as seatRow,
  waitlist,
} from "@/core/schema";
import {
  forgetWaitlistAddress,
  maintainerId,
  memberCount,
  OPEN_SEATS_INVALID,
  openSeats,
  requestSeat,
  SEATS_CLOSED,
  SEATS_OFF,
  seatState,
} from "@/core/seats";
import { areFriends } from "@/core/visibility";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-28T10:00:00Z");
const IP = rateKeyHash("203.0.113.10");
/** A different client address for each n. */
const ip = (n: number) => rateKeyHash(`198.51.100.${n}`);
let nextIp = 0;

/* ---------------------------------------------------------------- helpers */

async function refusalOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (isCoreError(error)) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected a refusal, but it resolved");
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

/** The maintainer: the first administrator, made before anyone else. */
async function maintainer(options: { invitesRemaining?: number } = {}) {
  return makeAccount({
    handle: "rado_fict",
    displayName: "Rado FICTIONAL",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
    invitesRemaining: options.invitesRemaining ?? 10,
  });
}

/** Ask for a seat, from a new client address unless one is given. */
async function ask(
  email: string,
  options: { ipHash?: string; now?: Date; defer?: Defer } = {},
): Promise<void> {
  nextIp += 1;
  return requestSeat(db(), {
    email,
    ipHash: options.ipHash ?? ip(nextIp % 250),
    now: options.now ?? t0,
    defer: options.defer,
  });
}

async function openNow(): Promise<number> {
  return (await seatState(db())).open;
}

/** The line, oldest first. */
async function line(): Promise<string[]> {
  const rows = await db()
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((row) => row.email);
}

async function seatInvites() {
  return db().select().from(invites).where(eq(invites.note, SEAT_NOTE));
}

async function mailTo(email: string) {
  return db().select().from(outbox).where(eq(outbox.toAddress, email));
}

async function remaining(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ n: accounts.invitesRemaining })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row!.n;
}

/** Fixture: this many seats open. */
async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

/** Fixture: these addresses in line, since these times. */
async function inLine(entries: [string, Date][]): Promise<void> {
  await db()
    .insert(waitlist)
    .values(entries.map(([email, createdAt]) => ({ email, createdAt })));
}

async function linkTo(email: string): Promise<string> {
  const mail = await latestOutbox(db(), email, "join");
  if (!mail) throw new Error(`no join mail to ${email}`);
  return tokenFromLink(mail.body)!;
}

/* ================================================================= count */

describe("memberCount: the public count (SPEC §18.1)", () => {
  it("counts accounts that exist and are not suspended; never the waiting list, never a deleted account", async () => {
    expect(await memberCount(db())).toBe(0);
    const anna = await makeAccount();
    await makeAccount();
    await makeAccount({ suspended: true });
    await inLine([
      ["waiting1_f@example.test", t0],
      ["waiting2_f@example.test", t0],
    ]);
    expect(await memberCount(db())).toBe(2);
    await db().delete(accounts).where(eq(accounts.id, anna.id));
    expect(await memberCount(db())).toBe(1);
  });
});

/* ============================================== requestSeat: refusals */

describe("requestSeat: off, and refused (SPEC §18.4)", () => {
  async function nothingRecorded() {
    expect(await db().select().from(rateEvents)).toEqual([]);
    expect(await line()).toEqual([]);
    expect(await db().select().from(outbox)).toEqual([]);
    expect(await db().select().from(emailTokens)).toEqual([]);
    expect(await seatInvites()).toEqual([]);
  }

  it("is CLOSED while no data controller is named, however it is missing, and records nothing", async () => {
    await maintainer();
    await setOpen(5);
    const cases: [string, string][] = [
      ["", ""],
      ["FICTIONAL Controller", ""],
      ["", "controller@example.test"],
      ["FICTIONAL Controller", "[CONFIRM]"],
    ];
    for (const [name, email] of cases) {
      vi.stubEnv("DATA_CONTROLLER", name);
      vi.stubEnv("DATA_CONTROLLER_EMAIL", email);
      expect(await refusalOf(ask("mara_f@example.test")), `${name} / ${email}`).toEqual({
        code: "CLOSED",
        message: SEATS_CLOSED,
      });
    }
    await nothingRecorded();
    expect(await openNow()).toBe(5);
  });

  it("is CLOSED in production while no client-address header is named, and opens when one is", async () => {
    await maintainer();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    expect(await refusalOf(ask("mara_f@example.test"))).toEqual({
      code: "CLOSED",
      message: SEATS_CLOSED,
    });
    await nothingRecorded();
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    expect(await codeOf(ask("mara_f@example.test"))).toBe("OK");
  });

  it("is CLOSED while there is no maintainer: no administrator, or only a suspended one", async () => {
    await makeAccount({ handle: "vera_f" });
    expect(await codeOf(ask("mara_f@example.test"))).toBe("CLOSED");
    await makeAccount({ handle: "sam_f", isAdmin: true, suspended: true });
    expect(await codeOf(ask("mara_f@example.test"))).toBe("CLOSED");
    await nothingRecorded();
  });

  it("refuses a malformed address (INVALID) before anything is counted", async () => {
    await maintainer();
    await setOpen(1);
    for (const bad of ["", "   ", "not an email", "mara@localhost", `${"x".repeat(250)}@example.test`]) {
      expect(await codeOf(ask(bad)), JSON.stringify(bad)).toBe("INVALID");
    }
    await nothingRecorded();
    expect(await openNow()).toBe(1);
  });
});

describe("requestSeat: rate limits (SPEC §18.4)", () => {
  it("3 an hour for one address, whatever the client address; keyed by HMAC, never the address", async () => {
    await maintainer();
    for (let i = 0; i < 3; i++) {
      await ask("Mara_F@Example.test", { ipHash: ip(i), now: plus.minutes(t0, i) });
    }
    expect(await refusalOf(ask("mara_f@example.test", { ipHash: ip(9), now: plus.minutes(t0, 10) }))).toEqual({
      code: "RATE_LIMITED",
      message: RATE_LIMITED_MESSAGE,
    });
    const keys = (await db().select({ key: rateEvents.key }).from(rateEvents)).map((r) => r.key);
    expect(keys.filter((k) => k === `seat:email:${rateKeyHash("mara_f@example.test")}`)).toHaveLength(3);
    expect(keys.join(" ")).not.toContain("mara");
    expect(keys.every((k) => k.startsWith("seat:"))).toBe(true);
    // An hour later it is let through again.
    expect(await codeOf(ask("mara_f@example.test", { ipHash: ip(9), now: plus.minutes(t0, 61) }))).toBe("OK");
  });

  it("10 an hour from one client address, across addresses; another client address is not affected", async () => {
    await maintainer();
    for (let i = 0; i < 10; i++) {
      await ask(`p${i}_f@example.test`, { ipHash: IP });
    }
    expect(await codeOf(ask("p10_f@example.test", { ipHash: IP }))).toBe("RATE_LIMITED");
    const keys = (await db().select({ key: rateEvents.key }).from(rateEvents)).map((r) => r.key);
    expect(keys.filter((k) => k === `seat:ip:${IP}`)).toHaveLength(10);
    expect(await codeOf(ask("p10_f@example.test", { ipHash: ip(1) }))).toBe("OK");
  });

  it("counts both limits before the work that is left for after the response", async () => {
    await maintainer();
    await setOpen(1);
    const later: Array<() => Promise<void>> = [];
    await ask("mara_f@example.test", { ipHash: IP, defer: (task) => void later.push(task) });
    const keys = (await db().select({ key: rateEvents.key }).from(rateEvents)).map((r) => r.key).sort();
    expect(keys).toEqual([`seat:email:${rateKeyHash("mara_f@example.test")}`, `seat:ip:${IP}`].sort());
    expect(await openNow()).toBe(1);
    expect(later).toHaveLength(1);
  });
});

/* ======================================= requestSeat: after the answer */

describe("requestSeat: what happens after the answer (SPEC §18.4)", () => {
  it("an address that has an account gets no mail and no row, active or suspended; while a seat is open its request uses one, like any other (SPEC §18.12)", async () => {
    const rado = await maintainer();
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    const sam = await makeAccount({ handle: "sam_f", email: "sam_f@example.test", suspended: true });
    await setOpen(2);
    // Vera waited in line, then joined through a friend's invite.
    await inLine([[vera.email, plus.days(t0, -1)]]);
    for (const email of [vera.email, sam.email, rado.email, "VERA_F@example.test"]) {
      await ask(email);
    }
    expect(await db().select().from(outbox)).toEqual([]);
    expect(await line()).toEqual([]);
    expect(await seatInvites()).toEqual([]);
    expect(await db().select().from(emailTokens)).toEqual([]);
    // Every valid request uses an open seat, whoever sends it: the public
    // number of open seats moves the same for a member as for a stranger.
    expect(await openNow()).toBe(0);
  });

  it("with a seat open: the join mail goes at once, the count goes down, and the invite is the maintainer's, taking none of theirs", async () => {
    const rado = await maintainer({ invitesRemaining: 7 });
    await setOpen(2);
    await ask("mara_f@example.test", { now: t0 });

    const mail = await latestOutbox(db(), "mara_f@example.test", "join");
    expect(mail?.subject).toBe("Your seat on our.one");
    expect(mail?.body).toContain("http://localhost:3000/auth#");
    expect(await openNow()).toBe(1);

    const seats = await seatInvites();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({ inviterId: rado.id, note: "seat", usedAt: null, revokedAt: null });
    expect(seats[0]!.expiresAt.toISOString()).toBe(plus.days(t0, 30).toISOString());
    expect(await remaining(rado.id)).toBe(7);
    expect((await listInvites(db(), rado.id, t0)).invites).toEqual([]);

    const used = await consumeEmailToken(db(), await linkTo("mara_f@example.test"), plus.minutes(t0, 1));
    expect(used).toEqual({ email: "mara_f@example.test", purpose: "join", inviteId: seats[0]!.id });
    expect(await line()).toEqual([]);
  });

  it("taking a seat removes the address from the line", async () => {
    await maintainer();
    await inLine([["mara_f@example.test", plus.days(t0, -2)]]);
    await setOpen(1);
    await ask("mara_f@example.test");
    expect(await line()).toEqual([]);
    expect(await seatInvites()).toHaveLength(1);
    expect(await openNow()).toBe(0);
  });

  it("with no seat open: the address waits in line; asking again adds nothing and keeps its place", async () => {
    await maintainer();
    await ask("mara_f@example.test", { now: t0 });
    await ask("anna_f@example.test", { now: plus.minutes(t0, 1) });
    await ask("MARA_F@example.test", { now: plus.minutes(t0, 5) });
    expect(await db().select().from(waitlist).orderBy(asc(waitlist.createdAt))).toEqual([
      { email: "mara_f@example.test", createdAt: t0 },
      { email: "anna_f@example.test", createdAt: plus.minutes(t0, 1) },
    ]);
    expect(await db().select().from(outbox)).toEqual([]);
    expect(await seatInvites()).toEqual([]);
    expect(await openNow()).toBe(0);
  });

  it("an address that holds a seat gets a new link to it, not a second seat, even after its link expired and no seat is open", async () => {
    await maintainer();
    await setOpen(1);
    await ask("mara_f@example.test", { now: t0 });
    const [seat] = await seatInvites();
    const first = await linkTo("mara_f@example.test");

    const later = plus.minutes(t0, EMAIL_TOKEN_TTL_MINUTES + 5);
    expect(await codeOf(consumeEmailToken(db(), first, later))).toBe("NOT_FOUND"); // expired
    await ask("mara_f@example.test", { now: later });

    expect(await seatInvites()).toHaveLength(1);
    expect(await openNow()).toBe(0);
    expect(await line()).toEqual([]);
    expect(await mailTo("mara_f@example.test")).toHaveLength(2);
    const second = await linkTo("mara_f@example.test");
    expect(second).not.toBe(first);
    expect((await consumeEmailToken(db(), second, plus.minutes(later, 1))).inviteId).toBe(seat!.id);
  });

  it("a seat that has expired is not held: asking again with none open waits in line", async () => {
    await maintainer();
    await setOpen(1);
    await ask("mara_f@example.test", { now: t0 });
    await ask("mara_f@example.test", { now: plus.days(t0, 31) });
    expect(await line()).toEqual(["mara_f@example.test"]);
    expect(await mailTo("mara_f@example.test")).toHaveLength(1);
  });
});

describe("requestSeat: the same answer, and the same work in the request, for every address", () => {
  it("a member, a new address, a listed address and another new one: identical statements until the response, different outcomes after", async () => {
    await maintainer();
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    // Two seats: the member's request uses one (SPEC §18.12), the first new address the other.
    await setOpen(2);
    await inLine([["listed_f@example.test", plus.days(t0, -1)]]);

    const statements: { query: string; params: unknown[] }[] = [];
    const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 2 });
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (query, params) => void statements.push({ query, params }) },
    }) as unknown as Db;
    const later: Array<() => Promise<void>> = [];
    const defer: Defer = (task) => void later.push(task);
    try {
      const seen: string[][] = [];
      const answers: unknown[] = [];
      const emails = [vera.email, "new_f@example.test", "listed_f@example.test", "other_f@example.test"];
      for (const [i, email] of emails.entries()) {
        statements.length = 0;
        answers.push(await requestSeat(logged, { email, ipHash: ip(i), now: t0, defer }));
        seen.push(statements.map((s) => s.query));
        // The request never looks the address up: only its keyed hash, for the limit.
        const local = email.slice(0, email.indexOf("@"));
        expect(JSON.stringify(statements.map((s) => s.params)), email).not.toContain(local);
        // And every request leaves the same one task for after the response.
        expect(later).toHaveLength(i + 1);
      }
      expect(answers).toEqual([undefined, undefined, undefined, undefined]);
      expect(seen[0]!.length).toBeGreaterThan(0);
      for (const run of seen) expect(run).toEqual(seen[0]);

      // Until the response is out: the limits' rows, and nothing else.
      expect(await db().select().from(rateEvents)).toHaveLength(8);
      expect(await db().select().from(outbox)).toEqual([]);
      expect(await db().select().from(emailTokens)).toEqual([]);
      expect(await line()).toEqual(["listed_f@example.test"]);
      expect(await openNow()).toBe(2);

      for (const task of later) await task();
      // The line goes first for every request (SPEC §18.12 item 27): the
      // member's request gave its seat to the address already waiting; the
      // first newcomer took the other; the listed address's own request sent
      // her a new link to the seat she held. The last newcomer waits.
      expect((await db().select().from(outbox)).map((m) => m.toAddress)).toEqual([
        "listed_f@example.test",
        "new_f@example.test",
        "listed_f@example.test",
      ]);
      expect(await line()).toEqual(["other_f@example.test"]);
      expect(await openNow()).toBe(0);
    } finally {
      await pool.end();
    }
  });
});

/* ============================================================ openSeats */

describe("openSeats: only an administrator, and only while seats are on (SPEC §18.4)", () => {
  it("is NOT_FOUND for a member, a missing account, a suspended administrator and no id; nothing changes", async () => {
    await maintainer();
    const vera = await makeAccount({ handle: "vera_f" });
    const sam = await makeAccount({ handle: "sam_f", isAdmin: true, suspended: true });
    await inLine([["mara_f@example.test", t0]]);
    for (const id of [vera.id, "01FICTIONALMISSING00000000", sam.id, "", "   "]) {
      expect(await codeOf(openSeats(db(), id, 5, { now: t0 })), id).toBe("NOT_FOUND");
    }
    expect(await db().select().from(seatRow)).toEqual([]);
    expect(await line()).toEqual(["mara_f@example.test"]);
    expect(await db().select().from(outbox)).toEqual([]);
  });

  it("refuses a count that is not a whole number from 1 to 10,000 (INVALID); 10,000 is allowed", async () => {
    const rado = await maintainer();
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001]) {
      expect(await refusalOf(openSeats(db(), rado.id, bad, { now: t0 })), String(bad)).toEqual({
        code: "INVALID",
        message: OPEN_SEATS_INVALID,
      });
    }
    expect(await openNow()).toBe(0);
    expect(await openSeats(db(), rado.id, 10_000, { now: t0 })).toEqual({ opened: 10_000, invited: 0 });
    expect(await openNow()).toBe(10_000);
  });

  it("is CLOSED while no data controller is named, and invites nobody", async () => {
    const rado = await maintainer();
    await inLine([["mara_f@example.test", t0]]);
    vi.stubEnv("DATA_CONTROLLER", "");
    expect(await refusalOf(openSeats(db(), rado.id, 5, { now: t0 }))).toEqual({
      code: "CLOSED",
      message: SEATS_OFF,
    });
    expect(await line()).toEqual(["mara_f@example.test"]);
    expect(await openNow()).toBe(0);
    expect(await db().select().from(outbox)).toEqual([]);
  });
});

describe("openSeats: a wave invites the oldest in line first (SPEC §18.4)", () => {
  it("invites the oldest, removes them from the line, and passes over an address that has an account without a seat or an email", async () => {
    const rado = await maintainer({ invitesRemaining: 4 });
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    // Written out of order: the line's order is when each arrived.
    await inLine([
      ["e_f@example.test", plus.minutes(t0, 5)],
      ["a_f@example.test", plus.minutes(t0, 1)],
      ["d_f@example.test", plus.minutes(t0, 4)],
      [vera.email, plus.minutes(t0, 2)], // joined another way since
      ["c_f@example.test", plus.minutes(t0, 3)],
    ]);
    const now = plus.hours(t0, 1);
    expect(await openSeats(db(), rado.id, 3, { now })).toEqual({ opened: 3, invited: 3 });

    expect(await line()).toEqual(["e_f@example.test"]);
    expect(await openNow()).toBe(0);
    expect(await mailTo(vera.email)).toEqual([]);
    expect(await mailTo("e_f@example.test")).toEqual([]);

    const seats = await seatInvites();
    expect(seats).toHaveLength(3);
    expect(new Set(seats.map((s) => s.inviterId))).toEqual(new Set([rado.id]));
    expect(await remaining(rado.id)).toBe(4);

    // Each invited address has its own link, to its own seat.
    const reached = new Set<string>();
    for (const email of ["a_f@example.test", "c_f@example.test", "d_f@example.test"]) {
      const mail = await latestOutbox(db(), email, "join");
      expect(mail?.subject).toBe("Your seat on our.one");
      const used = await consumeEmailToken(db(), await linkTo(email), plus.minutes(now, 1));
      expect(used.email).toBe(email);
      reached.add(used.inviteId!);
    }
    expect(reached).toEqual(new Set(seats.map((s) => s.id)));
  });

  it("two addresses that arrived at the same moment go in the order of the address, so the order never depends on the database", async () => {
    const rado = await maintainer();
    await inLine([
      ["zed_f@example.test", t0],
      ["amy_f@example.test", t0],
    ]);
    await openSeats(db(), rado.id, 1, { now: plus.minutes(t0, 1) });
    expect(await line()).toEqual(["zed_f@example.test"]);
    expect(await latestOutbox(db(), "amy_f@example.test", "join")).not.toBeNull();
  });

  it("seats left over stay open, the next visitor takes one at once, and opening more adds to them", async () => {
    const rado = await maintainer();
    await inLine([["a_f@example.test", t0]]);
    expect(await openSeats(db(), rado.id, 5, { now: plus.minutes(t0, 1) })).toEqual({ opened: 5, invited: 1 });
    expect(await openNow()).toBe(4);
    await ask("b_f@example.test", { now: plus.minutes(t0, 2) });
    expect(await openNow()).toBe(3);
    expect(await latestOutbox(db(), "b_f@example.test", "join")).not.toBeNull();
    expect(await openSeats(db(), rado.id, 2, { now: plus.minutes(t0, 3) })).toEqual({ opened: 2, invited: 0 });
    expect(await openNow()).toBe(5);
  });

  it("with `defer`, the seats are taken before the answer and the emails go after it", async () => {
    const rado = await maintainer();
    await inLine([
      ["a_f@example.test", t0],
      ["b_f@example.test", plus.minutes(t0, 1)],
    ]);
    const later: Array<() => Promise<void>> = [];
    const result = await openSeats(db(), rado.id, 2, {
      now: plus.minutes(t0, 5),
      defer: (task) => void later.push(task),
    });
    expect(result).toEqual({ opened: 2, invited: 2 });
    expect(await line()).toEqual([]);
    expect(await seatInvites()).toHaveLength(2);
    expect(await db().select().from(outbox)).toEqual([]);
    expect(later).toHaveLength(1);
    await later[0]!();
    expect((await db().select().from(outbox)).map((m) => m.toAddress).sort()).toEqual([
      "a_f@example.test",
      "b_f@example.test",
    ]);
  });
});

/* ======================================================== forgetting one */

describe("forgetWaitlistAddress: an owner's request to be deleted (SPEC §18.4)", () => {
  it("is NOT_FOUND for anyone but an active administrator, and INVALID for a malformed address", async () => {
    const rado = await maintainer();
    const vera = await makeAccount({ handle: "vera_f" });
    await inLine([["mara_f@example.test", t0]]);
    expect(await codeOf(forgetWaitlistAddress(db(), vera.id, "mara_f@example.test"))).toBe("NOT_FOUND");
    expect(await codeOf(forgetWaitlistAddress(db(), "", "mara_f@example.test"))).toBe("NOT_FOUND");
    expect(await codeOf(forgetWaitlistAddress(db(), rado.id, "not an email"))).toBe("INVALID");
    expect(await line()).toEqual(["mara_f@example.test"]);
  });

  it("removes the address from the line, whatever its case; the next wave passes it by", async () => {
    const rado = await maintainer();
    await inLine([
      ["mara_f@example.test", t0],
      ["anna_f@example.test", plus.minutes(t0, 1)],
    ]);
    await forgetWaitlistAddress(db(), rado.id, " Mara_F@Example.test ");
    expect(await line()).toEqual(["anna_f@example.test"]);
    expect(await openSeats(db(), rado.id, 2, { now: plus.minutes(t0, 2) })).toEqual({ opened: 2, invited: 1 });
    expect(await mailTo("mara_f@example.test")).toEqual([]);
    // Removing an address that is not there is not an error.
    await expect(forgetWaitlistAddress(db(), rado.id, "nobody_f@example.test")).resolves.toBeUndefined();
  });

  it("for an address with no account, also deletes its links, an unfinished join and development mail; an account holder's are kept", async () => {
    const rado = await maintainer();
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(1);
    await ask("mara_f@example.test", { now: t0 });
    const [seat] = await seatInvites();
    await createPendingJoin(db(), { email: "mara_f@example.test", inviteId: seat!.id, now: t0 });
    await createEmailToken(db(), { email: vera.email, purpose: "sign_in", now: t0 });
    await sendMail(db(), { to: vera.email, subject: "FICTIONAL", body: "FICTIONAL", kind: "sign_in" });
    await inLine([[vera.email, t0]]);

    await forgetWaitlistAddress(db(), rado.id, "mara_f@example.test");
    await forgetWaitlistAddress(db(), rado.id, vera.email);

    expect(await db().select().from(emailTokens).where(eq(emailTokens.email, "mara_f@example.test"))).toEqual([]);
    expect(await db().select().from(pendingJoins)).toEqual([]);
    expect(await mailTo("mara_f@example.test")).toEqual([]);
    expect(await db().select().from(emailTokens).where(eq(emailTokens.email, vera.email))).toHaveLength(1);
    expect(await mailTo(vera.email)).toHaveLength(1);
    expect(await line()).toEqual([]);
  });

  it("is carried out even while seats are off: a request to be deleted is never refused", async () => {
    const rado = await maintainer();
    await inLine([["mara_f@example.test", t0]]);
    vi.stubEnv("DATA_CONTROLLER", "");
    await forgetWaitlistAddress(db(), rado.id, "mara_f@example.test");
    expect(await line()).toEqual([]);
  });
});

/* =================================================== joining through one */

describe("joining through a seat (SPEC §18.4, §18.8)", () => {
  it("goes through /auth and /join unchanged, and records the maintainer as the inviter", async () => {
    const rado = await maintainer({ invitesRemaining: 3 });
    await setOpen(1);
    const before = await memberCount(db());
    await ask("mara_f@example.test", { now: t0 });

    const opened = await openEmailLink(db(), {
      token: await linkTo("mara_f@example.test"),
      now: plus.minutes(t0, 2),
    });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
    const joined = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "Mara FICTIONAL",
      handle: "mara_f",
      adultConfirmed: true,
      now: plus.minutes(t0, 3),
    });

    const [mara] = await db().select().from(accounts).where(eq(accounts.id, joined.accountId));
    expect(mara).toMatchObject({ email: "mara_f@example.test", invitedBy: rado.id });
    const [seat] = await seatInvites();
    expect(seat).toMatchObject({ inviterId: rado.id, usedBy: joined.accountId });
    expect(await remaining(rado.id)).toBe(3);
    // A seat is an invitation from the maintainer, not an offer of
    // friendship (SPEC §18.12): no friendship, and no notification to the maintainer.
    expect(await areFriends(db(), rado.id, joined.accountId)).toBe(false);
    expect(await memberCount(db())).toBe(before + 1);

    // Asking again now: an account, so nothing.
    await ask("mara_f@example.test", { now: plus.minutes(t0, 10) });
    expect(await mailTo("mara_f@example.test")).toHaveLength(1);
    expect(await line()).toEqual([]);
  });

  it("the maintainer is the oldest active administrator", async () => {
    const first = await maintainer();
    const second = await makeAccount({ handle: "ida_f", isAdmin: true, createdAt: at("2026-02-01T00:00:00Z") });
    await makeAccount({ handle: "old_f", createdAt: at("2025-01-01T00:00:00Z") });
    expect(await maintainerId(db())).toBe(first.id);
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, first.id));
    expect(await maintainerId(db())).toBe(second.id);
    await setOpen(1);
    await ask("mara_f@example.test");
    const [seat] = await seatInvites();
    expect(seat?.inviterId).toBe(second.id);
  });
});

describe("a seat invite is not one of the maintainer's own invites", () => {
  it("is never listed, never refunded when it expires, and can't be revoked as theirs", async () => {
    const rado = await maintainer({ invitesRemaining: 2 });
    const own = await createInvite(db(), rado.id, { note: "for Ben", now: t0 });
    expect(await remaining(rado.id)).toBe(1);
    await setOpen(1);
    await ask("mara_f@example.test", { now: t0 });
    const [seat] = await seatInvites();

    expect(await codeOf(revokeInvite(db(), rado.id, seat!.id, t0))).toBe("NOT_FOUND");
    const later = plus.days(t0, 31); // both expired unused
    const list = await listInvites(db(), rado.id, later);
    expect(list.invites.map((i) => [i.id, i.status])).toEqual([[own.id, "expired"]]);
    expect(list.remaining).toBe(2); // theirs came back; the seat took nothing, so gives nothing
    const [row] = await db().select().from(invites).where(eq(invites.id, seat!.id));
    expect(row?.revokedAt).toBeNull();
  });

  it("no invite of a person's own may carry the note 'seat'", async () => {
    const vera = await makeAccount({ handle: "vera_f" });
    expect(await refusalOf(createInvite(db(), vera.id, { note: " seat ", now: t0 }))).toEqual({
      code: "INVALID",
      message: NOTE_RESERVED,
    });
    expect(await db().select().from(invites)).toEqual([]);
    expect(await remaining(vera.id)).toBe(10);
    await expect(createInvite(db(), vera.id, { note: "Seat for Mara", now: t0 })).resolves.toBeTruthy();
  });
});

/* ============================================================ the email */

describe("the seat email (SPEC §18.4)", () => {
  it("says what the spec says, with the join link's own lifetime", () => {
    const mail = seatEmail("http://localhost:3000/auth#FICTIONAL");
    expect(mail.subject).toBe("Your seat on our.one");
    expect(mail.body).toBe(
      [
        `You asked for a seat on our.one. Here is your link to join. It works once and expires in ${EMAIL_TOKEN_TTL_MINUTES} minutes.`,
        "",
        "http://localhost:3000/auth#FICTIONAL",
        "",
        `If the link expires, ask again on the front page: your seat is kept for ${INVITE_TTL_DAYS} days. If you didn't ask, ignore this email.`,
      ].join("\n"),
    );
    expect(mail.body).toContain("expires in 15 minutes.");
    expect(`${mail.subject}\n${mail.body}`).not.toMatch(/OURS/);
    expect(scanText(`${mail.subject}\n${mail.body}`)).toEqual([]);
  });

  it("the link in it stops working when that lifetime is over", async () => {
    await maintainer();
    await setOpen(2);
    await ask("mara_f@example.test", { now: t0 });
    await ask("anna_f@example.test", { now: t0 });
    const expired = plus.minutes(t0, EMAIL_TOKEN_TTL_MINUTES);
    expect(await codeOf(consumeEmailToken(db(), await linkTo("mara_f@example.test"), expired))).toBe("NOT_FOUND");
    const inTime = plus.minutes(t0, EMAIL_TOKEN_TTL_MINUTES - 1);
    expect(await codeOf(consumeEmailToken(db(), await linkTo("anna_f@example.test"), inTime))).toBe("OK");
  });
});

/* ======================================================== race harness */

/** How many sessions on the test database wait on a lock. */
async function lockWaiters(monitor: pg.Client): Promise<number> {
  const result = await monitor.query(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
  );
  return Number((result.rows[0] as { n: number }).n);
}

describe("seats never go below zero (a race harness, as in SPEC §17)", () => {
  it("twelve requests racing for three seats: exactly three are taken, once each, and nine wait", async () => {
    await maintainer();
    await setOpen(3);
    const emails = Array.from({ length: 12 }, (_, i) => `racer${i}_f@example.test`);
    const results = await Promise.allSettled(emails.map((email, i) => ask(email, { ipHash: ip(i) })));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);

    expect(await openNow()).toBe(0);
    expect(await seatInvites()).toHaveLength(3);
    const mailed = (await db().select().from(outbox)).map((m) => m.toAddress);
    expect(new Set(mailed).size).toBe(3);
    expect(mailed).toHaveLength(3);
    const waiting = await line();
    expect(waiting).toHaveLength(9);
    expect([...mailed, ...waiting].sort()).toEqual([...emails].sort());
  });

  it("requests held behind the seat lock read the count only once it is theirs: two seats opened under five waiting requests make two seats taken", async () => {
    await maintainer();
    await setOpen(0);
    const holder = new pg.Client({ connectionString: inject("databaseUrl") });
    const monitor = new pg.Client({ connectionString: inject("databaseUrl") });
    await holder.connect();
    await monitor.connect();
    try {
      await holder.query("begin");
      await holder.query("select open from seat_state where id = 'seats' for update");
      const racers = Array.from({ length: 5 }, (_, i) =>
        ask(`held${i}_f@example.test`, { ipHash: ip(i) }).then(
          () => "OK",
          (error: unknown) => (isCoreError(error) ? error.code : String(error)),
        ),
      );
      let waiting = 0;
      for (let i = 0; i < 500 && waiting < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        waiting = await lockWaiters(monitor);
      }
      expect(waiting).toBe(5);
      await holder.query("update seat_state set open = 2 where id = 'seats'");
      await holder.query("commit");
      expect(await Promise.all(racers)).toEqual(["OK", "OK", "OK", "OK", "OK"]);
    } finally {
      await holder.end();
      await monitor.end();
    }
    expect(await openNow()).toBe(0);
    expect(await seatInvites()).toHaveLength(2);
    expect(await db().select().from(outbox)).toHaveLength(2);
    expect(await line()).toHaveLength(3);
  });

  it("a wave racing new requests: the oldest in line get the seats, and the count ends at zero", async () => {
    const rado = await maintainer();
    const old = [0, 1, 2, 3].map((i) => `old${i}_f@example.test`);
    await inLine(old.map((email, i): [string, Date] => [email, plus.minutes(t0, -60 + i)]));
    const fresh = Array.from({ length: 6 }, (_, i) => `new${i}_f@example.test`);
    const [wave, ...asked] = await Promise.allSettled([
      openSeats(db(), rado.id, 3, { now: t0 }),
      ...fresh.map((email, i) => ask(email, { ipHash: ip(i), now: t0 })),
    ]);
    expect(wave).toEqual({ status: "fulfilled", value: { opened: 3, invited: 3 } });
    expect(asked.every((r) => r.status === "fulfilled")).toBe(true);

    expect(await openNow()).toBe(0);
    expect((await db().select().from(outbox)).map((m) => m.toAddress).sort()).toEqual(old.slice(0, 3).sort());
    expect((await line()).sort()).toEqual([old[3]!, ...fresh].sort());
    expect(await seatInvites()).toHaveLength(3);
  });

  it("the database itself refuses a negative count, and a second seat row", async () => {
    await setOpen(0);
    await expect(db().execute(sql`update seat_state set open = -1 where id = 'seats'`)).rejects.toThrow();
    await expect(db().execute(sql`insert into seat_state (id, open) values ('more', 5)`)).rejects.toThrow();
    expect(await openNow()).toBe(0);
  });
});

/* ======================================================== the rollback */

describe("the down migration (M-0011's rollback)", () => {
  it("drops both tables, revokes unused seat invites and forgets that 0002 ran: shown in a transaction that is rolled back", async () => {
    await maintainer();
    await setOpen(2);
    await ask("mara_f@example.test");
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const down = read("../drizzle/down/0002_seats.sql");
    const journal = JSON.parse(read("../drizzle/meta/_journal.json")) as {
      entries: { tag: string; when: number }[];
    };
    const when = journal.entries.find((e) => e.tag === "0002_seats")?.when;
    expect(when).toBeDefined();
    expect(down).toContain(String(when));

    const client = new pg.Client({ connectionString: inject("databaseUrl") });
    await client.connect();
    try {
      await client.query("begin");
      const ran = "select count(*)::int as n from drizzle.__drizzle_migrations where created_at = $1";
      expect((await client.query(ran, [when])).rows[0]).toEqual({ n: 1 });
      await client.query(down);
      expect(
        (await client.query("select to_regclass('public.waitlist') as w, to_regclass('public.seat_state') as s")).rows[0],
      ).toEqual({ w: null, s: null });
      const seat = await client.query("select revoked_at from invites where note = 'seat'");
      expect(seat.rows).toHaveLength(1);
      expect((seat.rows[0] as { revoked_at: unknown }).revoked_at).not.toBeNull();
      expect((await client.query(ran, [when])).rows[0]).toEqual({ n: 0 });
    } finally {
      await client.query("rollback");
      await client.end();
    }
    expect(await openNow()).toBe(1);
  });
});

/* ======================================== after the build (SPEC §18.12) */

describe("the architect's amendments after the build (SPEC §18.12)", () => {
  it("a seat email that cannot be sent gives the seat back and keeps the address's place in line", async () => {
    await maintainer();
    await setOpen(1);
    await inLine([["mara_f@example.test", plus.days(t0, -3)]]);
    // Resend chosen but not configured: the transport refuses, and sendMail
    // records the failure without throwing.
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    await ask("mara_f@example.test");
    vi.unstubAllEnvs();

    expect(await openNow()).toBe(1);
    expect(await line()).toEqual(["mara_f@example.test"]);
    const [row] = await db().select().from(waitlist).where(eq(waitlist.email, "mara_f@example.test"));
    expect(row?.createdAt.toISOString()).toBe(plus.days(t0, -3).toISOString());
    const seats = await seatInvites();
    expect(seats).toHaveLength(1);
    expect(seats[0]!.revokedAt).not.toBeNull();
    expect(await db().select().from(emailTokens)).toEqual([]);
  });

  it("a wave whose email cannot be sent gives that seat back, too", async () => {
    const rado = await maintainer();
    await inLine([["ivo_f@example.test", plus.days(t0, -2)]]);
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    await openSeats(db(), rado.id, 1, { now: t0 });
    vi.unstubAllEnvs();

    expect(await openNow()).toBe(1);
    expect(await line()).toEqual(["ivo_f@example.test"]);
  });

  it("joining through a seat tells the maintainer nothing", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("lea_f@example.test");
    const link = (await latestOutbox(db(), "lea_f@example.test"))?.body ?? "";
    const opened = await openEmailLink(db(), {
      token: tokenFromLink(link) ?? "",
      now: plus.minutes(t0, 1),
    });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
    const joined = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "Lea FICTIONAL",
      handle: "lea_f",
      adultConfirmed: true,
      now: plus.minutes(t0, 2),
    });
    expect(await areFriends(db(), rado.id, joined.accountId)).toBe(false);
    const told = await db().select().from(schema.notifications).where(eq(schema.notifications.recipientId, rado.id));
    expect(told).toEqual([]);
  });
});

describe("seats never offer friendship, and stay out of the maintainer's export (SPEC §18.12)", () => {
  it("an account holder who opens an old seat link cannot use it to befriend the maintainer", async () => {
    const { applyInviteAsExisting } = await import("@/core/invites");
    const rado = await maintainer();
    await setOpen(1);
    await ask("noa_f@example.test");
    const [seat] = await seatInvites();
    // Noa then joins another way, and later opens the old seat link.
    const noa = await makeAccount({ handle: "noa_f", email: "noa_f@example.test" });
    expect(
      await codeOf(applyInviteAsExisting(db(), { accountId: noa.id, inviteId: seat!.id, now: plus.minutes(t0, 5) })),
    ).toBe("NOT_FOUND");
    expect(await areFriends(db(), rado.id, noa.id)).toBe(false);
  });

  it("the maintainer's export lists their own invites, not the seats", async () => {
    const { exportAccount } = await import("@/core/export");
    const rado = await maintainer();
    await createInvite(db(), rado.id, { note: "for Ida", now: t0 });
    await setOpen(2);
    await ask("ema_f@example.test");
    await ask("oto_f@example.test");
    expect(await seatInvites()).toHaveLength(2);
    const data = await exportAccount(db(), rado.id, plus.minutes(t0, 1));
    expect(data.invites).toHaveLength(1);
    expect(JSON.stringify(data.invites)).not.toContain(SEAT_NOTE);
  });
});

describe("/join tells a seat joiner the truth (SPEC §18.12)", () => {
  it("a pending join through a seat is marked as a seat, so /join doesn't promise a friendship", async () => {
    const { describePendingJoin } = await import("@/core/invites");
    await maintainer();
    await setOpen(1);
    await ask("uma_f@example.test");
    const link = (await latestOutbox(db(), "uma_f@example.test"))?.body ?? "";
    const opened = await openEmailLink(db(), { token: tokenFromLink(link) ?? "", now: plus.minutes(t0, 1) });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
    const { signValue } = await import("@/core/auth");
    const details = await describePendingJoin(db(), signValue(opened.pendingJoinId), plus.minutes(t0, 2));
    expect(details?.seat).toBe(true);
  });

  it("the /join page's seat line says a seat, not a friendship", () => {
    const source = readFileSync(fileURLToPath(new URL("../src/app/(public)/join/page.tsx", import.meta.url)), "utf8");
    expect(source).toContain("You took a seat on our.one.");
    expect(source).toMatch(/pending\.seat \?/);
  });
});
