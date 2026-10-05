/**
 * Named apps (D-0024 §B and §C; SPEC §18.23; M-0021): the optional answer to
 * "Which app would you take back?", kept as its words and the day, counted.
 *
 * Denial paths first. What this file must keep true:
 *
 * - nothing identifies one: the table has three columns and none holds an
 *   address, an account, a network address or a key to them, and a request
 *   that carries a need puts the words nowhere but there;
 * - a request that is refused keeps nothing, and a need that can't be kept
 *   never refuses the seat;
 * - the words are refused at their own field when they are too long or hold
 *   an email address;
 * - the answer, and the work done, are the same for every address.
 *
 * Everyone here is FICTIONAL, with example.test addresses and documentation
 * IP ranges.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  later: [] as Array<() => unknown>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      web.later.push(task);
    },
  };
});

import { takeSeat } from "@/app/(public)/seat-actions";
import { isCoreError } from "@/core/errors";
import { RATE_LIMITED_MESSAGE, rateKeyHash } from "@/core/limits";
import { dayOf, keepNeed, needCount, recordNeed } from "@/core/needs";
import { accounts, needs, outbox, rateEvents, waitlist } from "@/core/schema";
import { requestSeat, SEATS_CLOSED } from "@/core/seats";
import { LIMITS, NEED_HAS_ADDRESS, NEED_TOO_LONG, normEmail, validNeed } from "@/core/validate";
import { at, db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const t0 = at("2026-10-05T10:00:00Z");
const ip = (n: number) => rateKeyHash(`198.51.100.${n}`);

async function maintainer() {
  return makeAccount({ handle: "rado_fict", displayName: "Rado FICTIONAL", isAdmin: true, createdAt: at("2026-01-01T00:00:00Z") });
}

async function refusalOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (isCoreError(error)) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected a refusal, but it resolved");
}

/** Ask for a seat with a need, from a fresh client address unless one is given. */
let nextIp = 0;
async function ask(email: string, need?: unknown, options: { ipHash?: string } = {}) {
  nextIp += 1;
  return requestSeat(db(), { email, ipHash: options.ipHash ?? ip(nextIp % 250), need, now: t0 });
}

async function stored() {
  return db().select().from(needs);
}

async function nothingKept() {
  expect(await stored()).toEqual([]);
}

/* ============================================================ validNeed */

describe("validNeed: what may be named (D-0024 §B)", () => {
  it("is null for nothing named: empty, only white space, only control characters, or not text at all", () => {
    for (const input of ["", "   ", "\n\t \r\n", "\u0000\u0007", undefined, null, 42, {}, ["a"]]) {
      expect(validNeed(input), String(input)).toBeNull();
    }
  });

  it("makes control characters and runs of white space single spaces, and trims", () => {
    expect(validNeed("  Messenger\n\n and   WhatsApp\t")).toBe("Messenger and WhatsApp");
    expect(validNeed("a\u0000b")).toBe("a b");
    expect(validNeed("line break")).toBe("line break");
  });

  it("refuses more than 140 characters, counted as characters and not bytes or UTF-16 units, and allows exactly 140", () => {
    expect(LIMITS.needMax).toBe(140);
    expect(validNeed("x".repeat(140))).toBe("x".repeat(140));
    expect(validNeed("😀".repeat(140))).toBe("😀".repeat(140));
    for (const input of ["x".repeat(141), "😀".repeat(141)]) {
      try {
        validNeed(input);
        throw new Error("expected a refusal");
      } catch (error) {
        expect(isCoreError(error) && error.code).toBe("INVALID");
        expect((error as Error).message).toBe(NEED_TOO_LONG);
      }
    }
  });

  it("refuses an email address in it, in any place and with any text around it, in words that say why", () => {
    for (const input of ["mara_f@example.test", "Write to mara_f@example.test please", "x@y.zz", "ask Mara <mara_f@example.test>"]) {
      try {
        validNeed(input);
        throw new Error(`expected a refusal: ${input}`);
      } catch (error) {
        expect(isCoreError(error) && error.code, input).toBe("INVALID");
        expect((error as Error).message).toBe(NEED_HAS_ADDRESS);
      }
    }
    // An app's name with an @ in it, but no address, is a name.
    expect(validNeed("@Twitter, or X as it is now")).toBe("@Twitter, or X as it is now");
  });
});

/* =========================================================== the table */

describe("the needs table: words and a day, nothing else (D-0024 §B)", () => {
  it("has exactly three columns, and none can hold an address, an account, a network address or a key to them", async () => {
    const result = await db().execute(
      sql`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'needs' order by ordinal_position`,
    );
    expect(result.rows).toEqual([
      { column_name: "id", data_type: "uuid" },
      { column_name: "body", data_type: "text" },
      { column_name: "named_on", data_type: "date" },
    ]);
    const keys = await db().execute(
      sql`select count(*)::int as n from information_schema.table_constraints where table_schema = 'public' and table_name = 'needs' and constraint_type = 'FOREIGN KEY'`,
    );
    expect(keys.rows[0]).toEqual({ n: 0 });
    const indexes = await db().execute(sql`select indexname from pg_indexes where schemaname = 'public' and tablename = 'needs'`);
    expect(indexes.rows).toEqual([{ indexname: "needs_pkey" }]);
  });

  it("refuses, in the database itself, no words and more than 140 characters, whatever the code does", async () => {
    await expect(db().execute(sql`insert into needs (body) values ('')`)).rejects.toThrow();
    await expect(db().execute(sql`insert into needs (body) values (${"x".repeat(141)})`)).rejects.toThrow();
    await db().execute(sql`insert into needs (body) values (${"x".repeat(140)})`);
    expect((await stored()).length).toBe(1);
  });

  it("makes its id at random in the database, not from the time: two made in one millisecond share no prefix", async () => {
    await db().execute(sql`insert into needs (body) select 'n' || g from generate_series(1, 50) g`);
    const ids = (await stored()).map((row) => row.id);
    expect(new Set(ids).size).toBe(50);
    // A ulid's first ten characters are its millisecond; a v4 uuid's are not shared.
    expect(new Set(ids.map((id) => id.slice(0, 8))).size).toBeGreaterThan(40);
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  });

  it("has a down migration that drops it and forgets that it ran, and the journal names it", () => {
    const down = readFileSync(join(WEB_ROOT, "drizzle/down/0003_needs.sql"), "utf8");
    expect(down).toMatch(/^DROP TABLE "needs";$/m);
    const journal = JSON.parse(readFileSync(join(WEB_ROOT, "drizzle/meta/_journal.json"), "utf8")) as {
      entries: { tag: string; when: number }[];
    };
    const entry = journal.entries.find((e) => e.tag === "0003_needs")!;
    expect(down).toContain(`WHERE "created_at" = ${entry.when};`);
    expect(entry.when).toBeGreaterThan(journal.entries.find((e) => e.tag === "0002_seats")!.when);
    expect(readFileSync(join(WEB_ROOT, "drizzle/0003_needs.sql"), "utf8").match(/CREATE TABLE/g)).toHaveLength(1);
  });
});

/* ========================================================== the core */

describe("recordNeed, keepNeed and needCount", () => {
  it("keeps the words and the day in UTC, and counts them", async () => {
    expect(await needCount(db())).toBe(0);
    await recordNeed(db(), "Messenger", at("2026-10-05T23:59:59Z"));
    await recordNeed(db(), "Slack", at("2026-10-06T00:00:00Z"));
    expect((await stored()).map((r) => [r.body, r.namedOn]).sort()).toEqual([
      ["Messenger", "2026-10-05"],
      ["Slack", "2026-10-06"],
    ]);
    expect(await needCount(db())).toBe(2);
    expect(dayOf(at("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
  });

  it("gives recordNeed nothing to keep but words and a time: its signature has no place for an address, an account or a network address", () => {
    expect(recordNeed.length).toBeLessThanOrEqual(3);
    const source = readFileSync(join(WEB_ROOT, "src/core/needs.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function recordNeed"), source.indexOf("/**\n * Keep a named app for a seat request"));
    expect(body).toContain("db.insert(needs).values({ body: words, namedOn: dayOf(now) })");
    expect(body).not.toMatch(/email|account|ip|hash/i);
  });

  it("keepNeed is false, not an error, when the table isn't there, and logs what went wrong by its code, never the words", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db().execute(sql`drop table needs`);
    try {
      expect(await keepNeed(db(), "Private words FICTIONAL", t0)).toBe(false);
    } finally {
      await db().execute(sql.raw(readFileSync(join(WEB_ROOT, "drizzle/0003_needs.sql"), "utf8")));
    }
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("a named app was not kept");
    expect(logged).toContain("42P01");
    expect(logged).not.toContain("Private words FICTIONAL");
  });
});

/* ============================================== the seat request, refused */

describe("a request that is refused keeps nothing (D-0024 §B)", () => {
  it("is CLOSED while no data controller is named, and keeps nothing and counts nothing", async () => {
    await maintainer();
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    expect(await refusalOf(ask("mara_f@example.test", "Messenger"))).toEqual({ code: "CLOSED", message: SEATS_CLOSED });
    await nothingKept();
    expect(await db().select().from(rateEvents)).toEqual([]);
  });

  it("is CLOSED with no maintainer, and an invalid address refuses before anything is kept", async () => {
    expect((await refusalOf(ask("mara_f@example.test", "Messenger"))).code).toBe("CLOSED");
    await maintainer();
    expect((await refusalOf(ask("not an address", "Messenger"))).code).toBe("INVALID");
    await nothingKept();
    expect(await db().select().from(rateEvents)).toEqual([]);
  });

  it("refuses a need that is too long, or holds an address, with nothing kept and no limit used", async () => {
    await maintainer();
    expect(await refusalOf(ask("mara_f@example.test", "x".repeat(141)))).toEqual({ code: "INVALID", message: NEED_TOO_LONG });
    expect(await refusalOf(ask("mara_f@example.test", "mara_f@example.test"))).toEqual({ code: "INVALID", message: NEED_HAS_ADDRESS });
    await nothingKept();
    expect(await db().select().from(rateEvents)).toEqual([]);
    expect(await db().select().from(waitlist)).toEqual([]);
  });

  it("keeps nothing from a request a rate limit refuses, and the refusal is the limit's words", async () => {
    await maintainer();
    for (const n of [1, 2, 3]) await ask("mara_f@example.test", `app ${n}`, { ipHash: ip(100 + n) });
    expect(await needCount(db())).toBe(3);
    expect(await refusalOf(ask("mara_f@example.test", "a fourth", { ipHash: ip(110) }))).toEqual({
      code: "RATE_LIMITED",
      message: RATE_LIMITED_MESSAGE,
    });
    expect(await needCount(db())).toBe(3);
    expect((await stored()).map((r) => r.body)).not.toContain("a fourth");
  });
});

/* ========================================= the seat request, accepted */

describe("a request that carries a need (D-0024 §B)", () => {
  it("keeps its words and the day, and nothing that says whose they are: not in the row, and not anywhere else in the database", async () => {
    await maintainer();
    await ask("mara_f@example.test", "  Zorbulon   photos\n app ", { ipHash: ip(7) });
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe("Zorbulon photos app");
    expect(rows[0]!.namedOn).toBe("2026-10-05");
    expect(Object.keys(rows[0]!).sort()).toEqual(["body", "id", "namedOn"]);
    const row = JSON.stringify(rows[0]);
    for (const value of ["mara_f", "example.test", ip(7), rateKeyHash("mara_f@example.test"), normEmail("mara_f@example.test")]) {
      expect(row).not.toContain(value);
    }
    // The words are in `needs` and in no other table.
    const tables = (
      await db().execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)
    ).rows.map((r) => String((r as { table_name: unknown }).table_name));
    const holding: string[] = [];
    for (const table of tables) {
      const found = await db().execute(sql.raw(`select count(*)::int as n from "${table}" x where to_jsonb(x)::text like '%Zorbulon%'`));
      if ((found.rows[0] as { n: number }).n > 0) holding.push(table);
    }
    expect(holding).toEqual(["needs"]);
  });

  it("keeps nothing when no need, or only blanks, came with the request, and still does the rest", async () => {
    await maintainer();
    await ask("mara_f@example.test");
    await ask("noor_f@example.test", "");
    await ask("omar_f@example.test", "   \n ");
    await ask("pia_f@example.test", undefined);
    await nothingKept();
    expect((await db().select().from(waitlist)).length + (await db().select().from(outbox)).length).toBeGreaterThan(0);
  });

  it("is kept the same for every address: one with an account, one in line, one new, and each is told the same by takeSeat", async () => {
    await maintainer();
    const member = await makeAccount({ email: "ines_f@example.test" });
    await db().insert(waitlist).values({ email: "jonas_f@example.test", createdAt: at("2026-10-01T00:00:00Z") });
    // The answer is takeSeat's, so that is what is asked (requestSeat itself resolves to nothing for every request).
    const form = (email: string, need: string) => {
      const data = new FormData();
      data.set("email", email);
      data.set("need", need);
      return data;
    };
    web.headers.set("x-forwarded-for", "203.0.113.30");
    const answers = [
      await takeSeat(null, form("ines_f@example.test", "one")),
      await takeSeat(null, form("jonas_f@example.test", "two")),
      await takeSeat(null, form("kira_f@example.test", "three")),
    ];
    expect(answers).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect((await stored()).map((r) => r.body).sort()).toEqual(["one", "three", "two"]);
    expect(await db().select({ id: accounts.id }).from(accounts).where(eq(accounts.id, member.id))).toHaveLength(1);
  });

  it("never refuses the seat when the need can't be kept: the table gone, the address still gets its answer and its place, and the log has no words", async () => {
    await maintainer();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db().execute(sql`drop table needs`);
    try {
      await expect(ask("mara_f@example.test", "Private words FICTIONAL")).resolves.toBeUndefined();
    } finally {
      await db().execute(sql.raw(readFileSync(join(WEB_ROOT, "drizzle/0003_needs.sql"), "utf8")));
    }
    // The request was counted and the address was dealt with, as without a need.
    expect((await db().select().from(rateEvents)).length).toBe(2);
    expect((await db().select().from(waitlist)).length + (await db().select().from(outbox)).length).toBeGreaterThan(0);
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain("Private words FICTIONAL");
    expect(logged).not.toContain("mara_f");
    await nothingKept();
  });
});

/* ================================================== the action's answers */

describe("takeSeat with a need: the field a refusal belongs to (D-0024 §B)", () => {
  function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }
  const withClient = () => web.headers.set("x-forwarded-for", "203.0.113.20");

  it("answers ok, keeps the words, and says nothing of them", async () => {
    await maintainer();
    withClient();
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "Messenger" }))).toEqual({ ok: true });
    expect((await stored()).map((r) => r.body)).toEqual(["Messenger"]);
  });

  it("answers the same way with no need field at all, as /feed's form sends none", async () => {
    await maintainer();
    withClient();
    expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({ ok: true });
    await nothingKept();
  });

  it("returns a too-long need, or one with an address, as an error at the need's own field, and keeps and counts nothing", async () => {
    await maintainer();
    withClient();
    // A refusal carries what was typed (`values`), which the form puts back (D-0025 §G).
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "x".repeat(141) }))).toEqual({
      error: NEED_TOO_LONG,
      field: "need",
      values: { email: "mara_f@example.test", need: "x".repeat(141) },
    });
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "call me on mara_f@example.test" }))).toEqual({
      error: NEED_HAS_ADDRESS,
      field: "need",
      values: { email: "mara_f@example.test", need: "call me on mara_f@example.test" },
    });
    await nothingKept();
    expect(await db().select().from(rateEvents)).toEqual([]);
  });

  it("returns an address that isn't one at the address's field (no `field`), whatever the need, and keeps nothing", async () => {
    await maintainer();
    withClient();
    const result = await takeSeat(null, form({ email: "not an address", need: "Messenger" }));
    expect("error" in result && result.field).toBeFalsy();
    expect("error" in result).toBe(true);
    await nothingKept();
  });

  it("says 'Joining opens soon.' while seats are off, at the address's field, and keeps nothing", async () => {
    await maintainer();
    withClient();
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "Messenger" }))).toEqual({
      error: SEATS_CLOSED,
      values: { email: "mara_f@example.test", need: "Messenger" },
    });
    await nothingKept();
  });
});
