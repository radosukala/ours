/**
 * Independent verification of M-0018 (ready for the first deploy; D-0021,
 * SPEC §18.20), the lens of the release and its security. Written by an
 * agent that built none of it, against d26556a (the build is bee6e3b;
 * d26556a adds only the verification's stopping rule). It changes no
 * product code, no record and no other test.
 *
 * What was looked at:
 *
 * - the release step, scripts/release.ts, and the first-account rule it
 *   shares with the founder script (src/core/founder.ts,
 *   scripts/seed-founder.ts), run in-process and run as Vercel runs it:
 *   `tsx scripts/release.ts` in a child whose environment holds nothing but
 *   PATH and the variables a test names (as `env -i` would), against fresh
 *   local databases this file creates and drops, and against a fake
 *   Postgres on 127.0.0.1 that records every connection and what the client
 *   sends first;
 * - apps/web/vercel.json, package.json's vercel-build, the root vercel.json,
 *   kit/ at build time, and the lockfile under pnpm 10;
 * - the weekly email's route, GET and POST, and what Next.js 16.2.7 does
 *   with the methods it doesn't export;
 * - the records the release answers to: AGENTS.md §7 and §8, D-0021 (§D to
 *   §I), M-0018, the amended M-0012, P-0014 and its evidence.
 *
 * By hand, and recorded here rather than run by the suite (each takes a
 * production build): `pnpm run vercel-build` in apps/web of a clean
 * checkout of d26556a, under `env -i` with PATH, NEXT_TELEMETRY_DISABLED=1
 * and a DATABASE_URL pointing at a TCP tripwire on 127.0.0.1 — once with no
 * VERCEL, once as a preview (VERCEL=1, VERCEL_ENV=preview), once as the
 * production build of a commit OURS_RELEASE doesn't name. Each printed
 * "Release step: nothing done, because …", built (Next.js 16.2.7, every
 * route that reaches the database ƒ, dynamic), and the tripwire saw no
 * connection. The production build of the named commit, against the same
 * tripwire, made one connection, failed the release with exit status 1 and
 * never started `next build`.
 *
 * Vercel's public documentation (vercel.com/docs, read 3 October 2026)
 * confirms what D-0021 relies on: a new project's functions run in iad1
 * unless a region is set; a Hobby project may set one region; the
 * scheduler calls the production deployment's path by GET, with
 * CRON_SECRET as `Authorization: Bearer …`; Hobby crons run at most once a
 * day, in UTC, anywhere in the hour; "Auto-assign Custom Production
 * Domains" exists, and with it off a production build is staged until
 * promoted — and runs, staged, with the Production variables. It also
 * says the gate's inputs (VERCEL, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA) are
 * exposed only while "Enable access to System Environment Variables" is
 * on, and that Production variables reach the build as well as the
 * functions. Not confirmed there: which deployment's cron runs while one
 * is staged, and whether vercel.json's installCommand override gets pnpm
 * 10 (its package-managers page says an override install command runs the
 * oldest pnpm, 6; the founder's first build ran the same command with
 * pnpm 10, but its log doesn't say whether that command was an override).
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on d26556a, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity, as earlier rounds used it: HIGH, something stated as in force,
 * built or approved that isn't; MEDIUM, a statement the code or the records
 * contradict, a layer of checking that silently doesn't hold; LOW, wording,
 * polish, small gaps.
 *
 * Every person, address and key here is FICTIONAL, and so is the commit the
 * gate is given (the repository's own commits are cited as themselves). No
 * network: the only servers are the local test Postgres and the fake on
 * 127.0.0.1, which an address at 0.0.0.0 — a host src/core/db.ts treats as
 * remote — reaches without leaving this machine. A database address with a
 * password is assembled at run time, never written whole (the kit's rule 8).
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { autoImplementMethods } from "next/dist/server/route-modules/app-route/helpers/auto-implement-methods";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import * as cronRoute from "@/app/api/cron/weekly-digest/route";
import { GET as cronGET, POST as cronPOST } from "@/app/api/cron/weekly-digest/route";
import { DEFAULT_INVITES } from "@/core/config";
import type { Env } from "@/core/hosting";
import * as schema from "@/core/schema";
import { accounts, outbox } from "@/core/schema";
import { releaseGate, runRelease } from "../scripts/release";
import { befriend, db, makeAccount, post, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TSX = join(WEB, "node_modules", ".bin", "tsx");

/** The build, the receipt that opens its verification, and the commit before the build. */
const BUILD = "bee6e3b";
const BEFORE = "ec6eebc";

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
/** Source text as a reader reads its comments: each line's leading " * " dropped, whitespace collapsed. */
const prose = (s: string) => flat(s.replace(/\n\s*\* ?/g, " "));

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** The text from `start` up to `end`. */
function between(text: string, start: string, end: string): string {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a === -1 || b === -1) throw new Error(`between: "${start}" … "${end}" not found`);
  return text.slice(a, b);
}

/** A FICTIONAL database address, assembled at run time (the kit's rule 8 reads this file). */
const pgAddress = (userinfo: string, host: string, rest: string) => ["postgresql:", "//", userinfo, "@", host, rest].join("");
const FICT_PASS = ["fict", "pass", "m0018", "7c1"].join("_");

/** A FICTIONAL commit the platform reports, chosen so that no part of it but its start is also its prefix. */
const SHA = "3f9c2e71b0a84d56e1c7f02a9b4d8e63c5a1f709";

/** Vercel's production build of the commit OURS_RELEASE names, imitated. */
const OPEN = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, OURS_RELEASE: SHA.slice(0, 7) } as const;

const FOUNDER = {
  FOUNDER_EMAIL: "founder_fict@example.test",
  FOUNDER_HANDLE: "founder_fict",
  FOUNDER_NAME: "Founder (FICTIONAL)",
} as const;
const CONTROLLER = { DATA_CONTROLLER: "FICTIONAL Controller", DATA_CONTROLLER_EMAIL: "controller@example.test" } as const;

/** PATH with node's folder and the system's only: nothing else from this shell reaches a child (as `env -i`). */
const BARE_PATH = [dirname(process.execPath), "/usr/bin", "/bin"].join(":");

type Ran = { code: number | null; out: string; err: string };

/** A script run as Vercel's build runs it, `tsx <script>`, with only the variables given. */
function tsx(script: string, args: string[], env: Record<string, string | undefined>, cwd = WEB): Promise<Ran> {
  const clean: Record<string, string> = { PATH: BARE_PATH };
  for (const [key, value] of Object.entries(env)) if (value !== undefined) clean[key] = value;
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [script, ...args], { cwd, env: clean as NodeJS.ProcessEnv });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

type Fake = { port: number; seen: string[]; close: () => Promise<void> };

/**
 * A fake Postgres on 127.0.0.1. It records each connection and what the
 * client sends first: an SSLRequest (answered "N", no TLS here), or a plain
 * StartupMessage, to which it answers "send your password in clear text",
 * recording the password if one comes. It never answers a query.
 */
async function fakePostgres(): Promise<Fake> {
  const seen: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    seen.push("connection");
    let asked = false;
    socket.on("data", (d: Buffer) => {
      if (!asked && d.length >= 8 && d.readUInt32BE(0) === 8 && d.readUInt32BE(4) === 80877103) {
        seen.push("SSLRequest");
        socket.write("N");
        return;
      }
      if (!asked) {
        seen.push("StartupMessage");
        const ask = Buffer.alloc(9);
        ask.write("R", 0);
        ask.writeUInt32BE(8, 1);
        ask.writeUInt32BE(3, 5); // AuthenticationCleartextPassword
        socket.write(ask);
        asked = true;
        return;
      }
      if (d[0] === 0x70) {
        seen.push(`password:${d.subarray(5).toString("utf8").replace(/\0/g, "")}`);
        socket.destroy();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    port,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgresql://localhost:5432/postgres";

async function onAdmin(statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/** An address with a user name in it, so a child with no USER in its environment can use it. */
function withUser(url: string): string {
  const u = new URL(url);
  if (!u.username) u.username = userInfo().username;
  return u.toString();
}

type Fresh = { name: string; url: string; db: ReturnType<typeof drizzle<typeof schema>>; drop: () => Promise<void> };

/** A fresh, empty database on the local test server, for one test; the caller drops it. */
async function freshDatabase(): Promise<Fresh> {
  const name = `ours_web_verify_m0018_${randomBytes(5).toString("hex")}`;
  await onAdmin(`create database "${name}"`);
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  const url = withUser(u.toString());
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  return {
    name,
    url,
    db: drizzle(pool, { schema }),
    drop: async () => {
      await pool.end();
      await onAdmin(`drop database if exists "${name}" with (force)`);
    },
  };
}

async function query<T>(url: string, sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Every table in a database, as schema.table. */
async function tablesIn(url: string): Promise<string[]> {
  const rows = await query<{ t: string }>(
    url,
    "select table_schema || '.' || table_name as t from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') order by 1",
  );
  return rows.map((r) => r.t);
}

/** The tables the migrations make: every table in the schema, and drizzle's own. */
const MIGRATED_TABLES = [
  "drizzle.__drizzle_migrations",
  ...[...readFileSync(join(WEB, "src/core/schema.ts"), "utf8").matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => `public.${m[1]}`),
].sort();

const ACCOUNT_COLUMNS =
  "email, handle, display_name, bio, invited_by, invites_remaining, is_admin, suspended_at, accepts_followers, weekly_email, (adult_confirmed_at = created_at) as adult_when_created";

const URL_CRON = "http://localhost:3000/api/cron/weekly-digest";
const bearer = (value: string) => ({ headers: { authorization: value } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on d26556a; the build is bee6e3b)", () => {
  beforeEach(reset);

  // R1
  it("fixed (MEDIUM): nothing keeps a local run from touching the real database, though D-0021 §D says local runs don't, and P-0014 records that the founder put the real keys in apps/web/.env.local — every local script (seed:founder, db:migrate, seed:fictional, digest) reads that file and connects to whatever host DATABASE_URL names. The sharpest case: the founder script, fictional-only by address but not by database, would make a FICTIONAL administrator the first account of the real database, and the release would then make no founder account and still pass ('an account exists already'), leaving our.one administered by an address nobody can sign in with. The script should refuse a database that isn't on this machine before connecting to it", async () => {
    expect(record("decisions/D-0021.md")).toContain("Nothing else touches the database: other commits' builds, preview builds and local runs don't.");
    expect(record("proposals/P-0014.md")).toContain("the real keys the founder put in apps/web/.env.local, which belong in Vercel only;");
    for (const script of ["scripts/seed-founder.ts", "scripts/migrate.ts", "scripts/seed-fictional.ts", "scripts/digest.ts"]) {
      expect(read(script), script).toContain('config({ path: [".env.local", ".env"], quiet: true });');
    }

    // What a FICTIONAL founder run does to the database it is given, here the local test database.
    const local = withUser(inject("databaseUrl"));
    const seeded = await tsx("scripts/seed-founder.ts", ["--email", "seed_fict@example.test", "--handle", "seed_fict", "--name", "Seed (FICTIONAL)"], {
      DATABASE_URL: local,
      ...CONTROLLER,
    });
    expect(seeded.code, seeded.err).toBe(0);
    const release = await runRelease({ DATABASE_URL: local, ...FOUNDER }, db());
    expect(release).toEqual({
      ok: true,
      lines: ["Release step: the migrations are applied.", "Release step: an account exists already, so no account was made."],
    });
    const admins = await db().select({ email: accounts.email }).from(accounts).where(eq(accounts.isAdmin, true));
    expect(admins).toEqual([{ email: "seed_fict@example.test" }]);

    // The defect: given a database elsewhere (0.0.0.0, which src/core/db.ts's own rule treats as remote,
    // reaching a fake on 127.0.0.1), the founder script connects to it.
    expect(read("src/core/db.ts")).toContain('return host === "localhost" || host === "127.0.0.1" || host === "::1";');
    const fake = await fakePostgres();
    try {
      const remote = pgAddress(`fict_user:${FICT_PASS}`, `0.0.0.0:${fake.port}`, "/neondb");
      const ran = await tsx("scripts/seed-founder.ts", ["--email", "ada_fict@example.test", "--handle", "ada_fict", "--name", "Ada (FICTIONAL)"], {
        DATABASE_URL: remote,
        ...CONTROLLER,
      });
      expect(ran.code).not.toBe(0);
      expect(fake.seen).toEqual([]);
    } finally {
      await fake.close();
    }
  }, 60_000);

  // R2
  it("fixed (MEDIUM): the rule that only the named production build touches the database doesn't say how it is held (AGENTS.md §7 requires ENFORCED, CHECKED, STRUCTURAL, INTERPRETED or DECLARED), and it is held only by the code of the commit being built: Vercel runs the pushed commit's vercel.json, its vercel-build and its release.ts, and M-0012 puts DATABASE_URL in every production build — every push to main, since Vercel gives production variables to the build as well as to the functions — so a pushed commit whose build reaches the database (a changed vercel-build, a page prerendered from it) touches the real one with no commit named. D-0021 §D states 'A push alone touches no database' with no qualification, and M-0012 doesn't tell the founder that every push to main is a production build holding the real database's address, whose staged deployment runs with the production variables at its own address, behind Deployment Protection only (BUILD and DEPLOY are kept apart by the build's own code, AGENTS.md §8)", () => {
    const d21 = record("decisions/D-0021.md");
    expect(d21).toContain("A push alone touches no database: BUILD never becomes DEPLOY by itself (AGENTS.md §8).");
    const m12 = record("mandates/M-0012.md");
    expect(m12).toMatch(/DATABASE_URL, for production only/);
    // The gate is the commit's own code, from vercel.json to the script.
    expect(JSON.parse(read("vercel.json")).buildCommand).toBe("pnpm run vercel-build");
    expect(JSON.parse(read("package.json")).scripts["vercel-build"]).toBe("tsx scripts/release.ts && next build");
    expect(read("scripts/release.ts")).toContain("const gate = releaseGate(process.env);");
    // The defect: no record says how the rule is held, and nothing takes production builds off main.
    const spec = flat(between(read("SPEC.md"), "**The release step**", "**The weekly email:**"));
    const d21D = between(d21, "D. A release Vercel runs", "E. The weekly email runs on Vercel's schedule");
    const held = /\b(?:ENFORCED|CHECKED|STRUCTURAL|INTERPRETED|DECLARED)\b/.test(`${spec} ${d21D}`);
    const offMain = /production branch/i.test(m12);
    expect({ held, offMain }).not.toEqual({ held: false, offMain: false });
  });

  // R3
  it("fixed (LOW): a build that fails on the founder's settings — one of the three set, a value that isn't valid, no data controller — has already migrated the database: the release applies the migrations first and checks the settings after, so a failed build leaves the database changed (on a later release, ahead of the deployment our.one still serves). The settings can be checked before the database is touched", async () => {
    const touched: Record<string, number> = {};
    const cases: [string, Env, RegExp][] = [
      ["one of the three", { FOUNDER_EMAIL: FOUNDER.FOUNDER_EMAIL }, /set all three of FOUNDER_EMAIL, FOUNDER_HANDLE and FOUNDER_NAME, or none/],
      ["a reserved handle", { ...FOUNDER, FOUNDER_HANDLE: "admin" }, /the founder's account settings aren't valid: That username is reserved/],
      ["no data controller", { ...FOUNDER }, /no data controller is named/],
    ];
    for (const [name, settings, why] of cases) {
      if (name === "no data controller") vi.stubEnv("DATA_CONTROLLER", "");
      const fresh = await freshDatabase();
      try {
        const outcome = await runRelease({ DATABASE_URL: fresh.url, ...settings }, fresh.db);
        expect(outcome.ok, name).toBe(false);
        expect(outcome.lines.join("\n"), name).toMatch(why);
        touched[name] = (await tablesIn(fresh.url)).length;
      } finally {
        await fresh.drop();
      }
    }
    // The defect: each failed build left the whole schema behind.
    expect(touched).toEqual({ "one of the three": 0, "a reserved handle": 0, "no data controller": 0 });
  }, 60_000);

  // R4
  it("fixed (LOW): two releases at once on a database that isn't migrated yet — the first release's case — fail one of the two builds: both read 'no migrations', both run them, and the second dies on a duplicate type ('pg_type_typname_nsp_index'). The account is still made once and the schema is whole, so nothing is lost; but deploy-ready.test.ts's 'two releases at once make one account', which expects both to succeed, runs on a database tests/setup.ts has already migrated and never meets the race. A lock around the migrations, as around the account, would let both pass", async () => {
    const fresh = await freshDatabase();
    try {
      const env = { DATABASE_URL: fresh.url, ...FOUNDER };
      const [a, b] = await Promise.all([runRelease(env, fresh.db), runRelease(env, fresh.db)]);
      // What holds: one account, the whole schema, each migration once, no address in either log.
      expect(await query(fresh.url, "select handle from accounts")).toEqual([{ handle: "founder_fict" }]);
      expect(await tablesIn(fresh.url)).toEqual(MIGRATED_TABLES);
      expect(await query(fresh.url, "select count(*)::int as n from drizzle.__drizzle_migrations")).toEqual([{ n: 3 }]);
      for (const line of [...a.lines, ...b.lines]) expect(line).not.toMatch(/localhost|ours_web_verify|example\.test/);
      // The defect: one of the two builds failed.
      expect([a.ok, b.ok]).toEqual([true, true]);
    } finally {
      await fresh.drop();
    }
  }, 60_000);

  // R5
  it("fixed (LOW): an error from the database still names parts of its address in the build log — the database's name ('database \"…\" does not exist'), and a user name or password shorter than 3 characters, which withoutAddress() leaves in ('role \"xy\" does not exist') — while SPEC §18.20 says the log 'names no address, link, key or part of the database's address'; only the host, and a user or password of 3 or more characters, are taken out. (For a host that resolves to several addresses, a refused connection prints no reason at all: 'the migrations failed: Failed query: CREATE SCHEMA IF NOT EXISTS \"drizzle\"'.)", async () => {
    expect(flat(read("SPEC.md"))).toContain("**Its log** names no address, link, key or part of the database's address;");
    const absent = `ours_fict_absent_${randomBytes(4).toString("hex")}`;
    const missing = new URL(ADMIN_URL);
    missing.pathname = `/${absent}`;
    const short = new URL(ADMIN_URL);
    short.username = "xy";
    short.password = "zz";
    short.pathname = "/postgres";
    const outcomes = [await runRelease({ DATABASE_URL: missing.toString(), ...FOUNDER }, db()), await runRelease({ DATABASE_URL: short.toString(), ...FOUNDER }, db())];
    for (const outcome of outcomes) expect(outcome.ok).toBe(false);
    const log = outcomes.flatMap((o) => o.lines).join("\n");
    expect(log).toContain("Release step: the migrations failed:");
    expect(log).not.toContain(new URL(ADMIN_URL).hostname);
    // The defect.
    expect(log).not.toContain(absent);
    expect(log).not.toContain('"xy"');
  });

  // R6
  it("fixed (LOW): the migrations take their TLS from the address alone: with no sslmode in it, the release's first connection to a host src/core/db.ts treats as remote is plain TCP, and the release sends the database's password in clear text to whoever answers there — while the account step, through getDb(), insists on TLS with the certificate checked for any host but localhost, 127.0.0.1 and ::1. Neon's addresses carry sslmode=require, so this needs an address edited by hand; the two steps of one release should hold the same rule", async () => {
    expect(read("src/core/db.ts")).toContain("ssl: isLocal(url) ? false : { rejectUnauthorized: true },");
    const fake = await fakePostgres();
    try {
      const url = pgAddress(`fict_user:${FICT_PASS}`, `0.0.0.0:${fake.port}`, "/neondb");
      const outcome = await runRelease({ DATABASE_URL: url, ...FOUNDER }, db());
      expect(outcome.ok).toBe(false);
      expect(outcome.lines.join("\n")).not.toContain(FICT_PASS);
      // The defect: the password reached the fake in clear text, before any TLS.
      expect(fake.seen).not.toContain(`password:${FICT_PASS}`);
      expect(fake.seen.slice(0, 2)).toEqual(["connection", "SSLRequest"]);
    } finally {
      await fake.close();
    }
  });

  // R7
  it("fixed (LOW): with a Neon address (sslmode=require, as Neon writes it), every release prints pg-connection-string's nine-line process warning, 'SECURITY WARNING: The SSL modes … are treated as aliases for verify-full', with a link to postgresql.org, ahead of its own lines — D-0021 §D: 'The build log says only what was done'; M-0018: the release 'prints nothing that holds an address, a link, a key or the database's address'", async () => {
    const fake = await fakePostgres();
    try {
      const url = pgAddress(`fict_user:${FICT_PASS}`, `127.0.0.1:${fake.port}`, "/neondb?sslmode=require&channel_binding=require");
      const ran = await tsx("scripts/release.ts", [], { ...OPEN, ...FOUNDER, ...CONTROLLER, DATABASE_URL: url });
      expect(ran.code).toBe(1);
      const log = `${ran.out}${ran.err}`;
      expect(log).toContain("Release step: the migrations failed:");
      expect(fake.seen).toContain("SSLRequest");
      expect(log).not.toContain(FICT_PASS);
      // The defect.
      expect(log).not.toMatch(/SECURITY WARNING|https?:\/\//);
    } finally {
      await fake.close();
    }
  }, 60_000);

  // R8
  it("fixed (LOW): the weekly email's route says 'Both methods are the same handler, and any other method is refused by the framework', but since it exports GET, Next.js 16 answers HEAD by running GET — a HEAD with the secret runs the weekly email — and answers OPTIONS itself (204, 'Allow: GET, HEAD, OPTIONS, POST'). No one without CRON_SECRET gets further, so nothing is opened; the route's own account of what it refuses is wrong since this build", async () => {
    // What Next.js 16.2.7 serves for this module's exports, as its route module builds it.
    const methods = autoImplementMethods(cronRoute as unknown as Parameters<typeof autoImplementMethods>[0]);
    expect(methods.POST).toBe(cronPOST);
    const options = (await methods.OPTIONS(new Request(URL_CRON, { method: "OPTIONS" }) as never, { params: Promise.resolve({}) } as never)) as Response;
    expect(options.status).toBe(204);
    // Changed after the re-check of M-0018 (RC11): the route answers OPTIONS
    // itself, listing what it allows; HEAD isn't among them.
    expect(options.headers.get("allow")).toBe("GET, POST, OPTIONS");
    // The defect: HEAD runs GET (and so the weekly email), while the route's comment says any other method is refused.
    const source = prose(read("src/app/api/cron/weekly-digest/route.ts"));
    expect({ headRunsGet: methods.HEAD === cronGET, commentSaysRefused: source.includes("any other method is refused by the framework") }).not.toEqual({
      headRunsGet: true,
      commentSaysRefused: true,
    });
  });
});

/* -------------------------------------------------------------- closed */

describe("closed: the release gate (each passes on d26556a)", () => {
  it("closed: the gate opens only for Vercel's production build of the commit OURS_RELEASE names — 7 to 40 hexadecimal characters, in any case and with spaces around, that begin VERCEL_GIT_COMMIT_SHA — and stays shut, saying why, for every other form tried: no VERCEL or VERCEL set to 'true', ' 1', '0' or '1\\n'; VERCEL_ENV preview, development, 'Production', 'production ' or none; OURS_RELEASE unset, empty, blank, 6 or 41 characters, a branch name, a ref, HEAD, 0x-prefixed, with a space or a line break inside, a wildcard, a pattern, full-width digits, another commit, a later part of the commit, its end, a list; VERCEL_GIT_COMMIT_SHA unset, empty, short, 39 or 41 characters, or not hexadecimal. It never repeats a value that isn't shaped like a commit", () => {
    const base = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA };
    for (const named of [SHA.slice(0, 7), SHA, SHA.toUpperCase(), ` ${SHA.slice(0, 12)}\n`]) {
      expect(releaseGate({ ...base, OURS_RELEASE: named }), named).toEqual({ run: true });
    }
    expect(releaseGate({ ...base, VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(), OURS_RELEASE: SHA.slice(0, 7) })).toEqual({ run: true });

    const named = { ...base, OURS_RELEASE: SHA.slice(0, 7) };
    const shut: [string, Env][] = [
      ["nothing", {}],
      ["no VERCEL", { ...named, VERCEL: undefined }],
      ...["true", " 1", "0", "1\n", "yes"].map((v): [string, Env] => [`VERCEL=${JSON.stringify(v)}`, { ...named, VERCEL: v }]),
      ...["preview", "development", "Production", "production ", ""].map((v): [string, Env] => [`VERCEL_ENV=${JSON.stringify(v)}`, { ...named, VERCEL_ENV: v }]),
      ["no VERCEL_ENV", { ...named, VERCEL_ENV: undefined }],
      ["no OURS_RELEASE", { ...named, OURS_RELEASE: undefined }],
      ...[
        "",
        "   ",
        SHA.slice(0, 6),
        `${SHA}0`,
        "main",
        "refs/heads/main",
        "HEAD",
        `0x${SHA.slice(0, 10)}`,
        `${SHA.slice(0, 4)} ${SHA.slice(4, 9)}`,
        `${SHA.slice(0, 7)}\n${SHA.slice(7, 9)}`,
        `${SHA.slice(0, 7)}*`,
        ".*",
        "３ｆ９ｃ２ｅ７",
        "fedcba9",
        SHA.slice(1, 9),
        SHA.slice(-8),
        `fedcba9,${SHA.slice(0, 7)}`,
      ].map((v): [string, Env] => [`OURS_RELEASE=${JSON.stringify(v)}`, { ...named, OURS_RELEASE: v }]),
      ["no VERCEL_GIT_COMMIT_SHA", { ...named, VERCEL_GIT_COMMIT_SHA: undefined }],
      ...["", SHA.slice(0, 7), SHA.slice(0, 39), `${SHA}0`, `${SHA.slice(0, 39)}g`].map((v): [string, Env] => [
        `VERCEL_GIT_COMMIT_SHA=${JSON.stringify(v)}`,
        { ...named, VERCEL_GIT_COMMIT_SHA: v },
      ]),
    ];
    for (const [name, env] of shut) {
      const gate = releaseGate(env);
      expect(gate.run, name).toBe(false);
      expect(gate.run ? "" : gate.why, name).not.toBe("");
    }

    // A value that isn't a commit is never repeated, even one that looks like a secret or an address.
    for (const value of [pgAddress("fict_user", "db.example.test", "/x"), "re_FICTIONAL", "main", "x".repeat(41), "0123 4567", SHA.slice(0, 6)]) {
      const gate = releaseGate({ ...base, OURS_RELEASE: value });
      expect(gate.run ? "" : gate.why, value).not.toContain(value.trim());
    }
  });

  it("closed: run as Vercel runs it — tsx, an environment with nothing else in it — every build but the named one exits 0, prints only 'Release step: nothing done, because …', and touches no database: a fake Postgres saw no connection and a fresh database stayed empty across a local run, VERCEL=true, a preview, development, no OURS_RELEASE, a branch name, another commit and no commit from the platform; the named build, pointed at the same fake, connected once and failed with exit status 1 (so the fake would have seen any other)", async () => {
    const fake = await fakePostgres();
    const fresh = await freshDatabase();
    try {
      const fakeUrl = pgAddress(`fict_user:${FICT_PASS}`, `127.0.0.1:${fake.port}`, "/neondb");
      const shut: [string, Record<string, string | undefined>, string][] = [
        ["a local run", { VERCEL: undefined, VERCEL_ENV: undefined, VERCEL_GIT_COMMIT_SHA: undefined }, "this isn't a Vercel build"],
        ["VERCEL=true", { VERCEL: "true" }, "this isn't a Vercel build"],
        ["a preview", { VERCEL_ENV: "preview" }, "this isn't Vercel's production build"],
        ["development", { VERCEL_ENV: "development" }, "this isn't Vercel's production build"],
        ["no OURS_RELEASE", { OURS_RELEASE: undefined }, "OURS_RELEASE isn't set, so no commit is named for release (M-0012)"],
        ["a branch name", { OURS_RELEASE: "main" }, "OURS_RELEASE isn't a commit: it must be 7 to 40 hexadecimal characters"],
        ["another commit", { OURS_RELEASE: "fedcba98" }, `this build is commit ${SHA.slice(0, 12)}, and OURS_RELEASE names fedcba98`],
        ["no commit from the platform", { VERCEL_GIT_COMMIT_SHA: undefined }, "the platform doesn't say which commit this build is"],
      ];
      for (const [name, change, why] of shut) {
        for (const url of [fakeUrl, fresh.url]) {
          const ran = await tsx("scripts/release.ts", [], { ...OPEN, ...FOUNDER, ...CONTROLLER, ...change, DATABASE_URL: url });
          expect({ name, ran }).toEqual({ name, ran: { code: 0, out: `Release step: nothing done, because ${why}.\n`, err: "" } });
        }
      }
      expect(fake.seen).toEqual([]);
      expect(await tablesIn(fresh.url)).toEqual([]);

      const namedRun = await tsx("scripts/release.ts", [], { ...OPEN, ...FOUNDER, ...CONTROLLER, DATABASE_URL: fakeUrl });
      expect(namedRun.code).toBe(1);
      expect(fake.seen.filter((s) => s === "connection")).toHaveLength(1);
    } finally {
      await fake.close();
      await fresh.drop();
    }
  }, 120_000);
});

describe("closed: the release itself (each passes on d26556a)", () => {
  beforeEach(reset);

  it("closed: in the named build without DATABASE_URL, or with a blank one, the release exits 1 and says only 'Release step: DATABASE_URL isn't set for production. Nothing was done.', and vercel-build's '&&' then never starts next build (by hand: pnpm's exit status 1, no Next.js output)", async () => {
    for (const DATABASE_URL of [undefined, "   "]) {
      const ran = await tsx("scripts/release.ts", [], { ...OPEN, ...FOUNDER, ...CONTROLLER, DATABASE_URL });
      expect(ran).toEqual({ code: 1, out: "", err: "Release step: DATABASE_URL isn't set for production. Nothing was done.\n" });
    }
    expect(JSON.parse(read("package.json")).scripts["vercel-build"]).toBe("tsx scripts/release.ts && next build");
  }, 60_000);

  it("closed: on a fresh database, as Vercel runs it, the named build applies every migration, makes the founder's account — the administrator, no inviter, 10 invites, the settings normalised as the sign-up form would ('  Founder_Fict@Example.TEST ', '@Founder_Fict', 'Founder   (FICTIONAL)') — makes no sign-in link, exits 0 and prints two lines naming no one; a second run, and a third with other founder settings, say 'an account exists already', exit 0 and make nothing", async () => {
    const fresh = await freshDatabase();
    try {
      const messy = { FOUNDER_EMAIL: "  Founder_Fict@Example.TEST ", FOUNDER_HANDLE: "@Founder_Fict", FOUNDER_NAME: "  Founder   (FICTIONAL) " };
      const first = await tsx("scripts/release.ts", [], { ...OPEN, ...CONTROLLER, ...messy, DATABASE_URL: fresh.url });
      expect(first).toEqual({
        code: 0,
        out: `Release step: the migrations are applied.\nRelease step: the founder's account is made, as the one administrator, with ${DEFAULT_INVITES} invites. Sign in at /signin.\n`,
        err: "",
      });
      expect(await tablesIn(fresh.url)).toEqual(MIGRATED_TABLES);
      expect(await query(fresh.url, `select ${ACCOUNT_COLUMNS} from accounts`)).toEqual([
        {
          email: "founder_fict@example.test",
          handle: "founder_fict",
          display_name: "Founder (FICTIONAL)",
          bio: "",
          invited_by: null,
          invites_remaining: DEFAULT_INVITES,
          is_admin: true,
          suspended_at: null,
          accepts_followers: false,
          weekly_email: true,
          adult_when_created: true,
        },
      ]);
      expect(await query(fresh.url, "select count(*)::int as n from email_tokens")).toEqual([{ n: 0 }]);

      const again = await tsx("scripts/release.ts", [], { ...OPEN, ...CONTROLLER, ...messy, DATABASE_URL: fresh.url });
      const other = await tsx("scripts/release.ts", [], {
        ...OPEN,
        ...CONTROLLER,
        FOUNDER_EMAIL: "other_fict@example.test",
        FOUNDER_HANDLE: "other_fict",
        FOUNDER_NAME: "Other (FICTIONAL)",
        DATABASE_URL: fresh.url,
      });
      for (const ran of [again, other]) {
        expect(ran).toEqual({ code: 0, out: "Release step: the migrations are applied.\nRelease step: an account exists already, so no account was made.\n", err: "" });
      }
      expect(await query(fresh.url, "select handle from accounts")).toEqual([{ handle: "founder_fict" }]);

      const log = [first, again, other].map((r) => r.out + r.err).join("\n");
      for (const part of ["founder_fict", "Founder_Fict", "example", "FICTIONAL", "other_fict", "http", "#", "token", "localhost", fresh.name, userInfo().username]) {
        expect(log, part).not.toContain(part);
      }
    } finally {
      await fresh.drop();
    }
  }, 60_000);

  it("closed: the founder's account from the release is the one the founder script makes, column for column (the same inputs, each into its own fresh database): administrator, no inviter, the default invites, the same normalised address, handle and name, weekly email on, followers off, adult as of creation; only the script adds a sign-in link, which the release never makes", async () => {
    const bySeed = await freshDatabase();
    const byRelease = await freshDatabase();
    try {
      const migrate = await tsx("scripts/release.ts", [], { ...OPEN, ...CONTROLLER, DATABASE_URL: bySeed.url });
      expect(migrate.out).toContain("aren't set, so no account was made.");
      const seeded = await tsx("scripts/seed-founder.ts", ["--email", " Ada_Fict@EXAMPLE.TEST", "--handle", "@Ada_Fict", "--name", "  Ada   (FICTIONAL) "], {
        DATABASE_URL: bySeed.url,
        ...CONTROLLER,
      });
      expect(seeded.code, seeded.err).toBe(0);
      const released = await tsx("scripts/release.ts", [], {
        ...OPEN,
        ...CONTROLLER,
        FOUNDER_EMAIL: " Ada_Fict@EXAMPLE.TEST",
        FOUNDER_HANDLE: "@Ada_Fict",
        FOUNDER_NAME: "  Ada   (FICTIONAL) ",
        DATABASE_URL: byRelease.url,
      });
      expect(released.code, released.err).toBe(0);
      const a = await query(bySeed.url, `select ${ACCOUNT_COLUMNS} from accounts`);
      const b = await query(byRelease.url, `select ${ACCOUNT_COLUMNS} from accounts`);
      expect(a).toHaveLength(1);
      expect(b).toEqual(a);
      expect(a[0]).toMatchObject({ email: "ada_fict@example.test", handle: "ada_fict", display_name: "Ada (FICTIONAL)", is_admin: true, invited_by: null });
      expect(await query(bySeed.url, "select purpose from email_tokens")).toEqual([{ purpose: "sign_in" }]);
      expect(await query(byRelease.url, "select count(*)::int as n from email_tokens")).toEqual([{ n: 0 }]);
    } finally {
      await bySeed.drop();
      await byRelease.drop();
    }
  }, 60_000);

  it("closed: a database that refuses, a user it doesn't know, an address that can't be read, or a migration that fails: the release fails and says why without the host, the user or the password, and a failed migration leaves nothing half-made (drizzle runs them in one transaction: only its own bookkeeping table remains)", async () => {
    const refused = await runRelease({ DATABASE_URL: pgAddress(`fict_user:${FICT_PASS}`, "127.0.0.1:1", "/neondb"), ...FOUNDER }, db());
    const stranger = new URL(ADMIN_URL);
    stranger.username = "fict_nobody_m0018";
    stranger.password = FICT_PASS;
    const unknown = await runRelease({ DATABASE_URL: stranger.toString(), ...FOUNDER }, db());
    const unreadable = await runRelease({ DATABASE_URL: "not a database address", ...FOUNDER }, db());
    for (const outcome of [refused, unknown, unreadable]) {
      expect(outcome.ok).toBe(false);
      const log = outcome.lines.join("\n");
      expect(log).toMatch(/^Release step: the migrations failed: /);
      for (const part of ["fict_user", "fict_nobody_m0018", FICT_PASS, "127.0.0.1", new URL(ADMIN_URL).hostname, "postgresql:"]) {
        expect(log, part).not.toContain(part);
      }
    }
    // Changed after the verification of M-0018 (R5): an error is told by what
    // it means and its code, never by its message.
    expect(refused.lines[0]).toBe("Release step: the migrations failed: the database refused the connection (ECONNREFUSED).");
    expect(unknown.lines[0]).toMatch(/^Release step: the migrations failed: the database refused the (?:user \(28000\)|password \(28P01\))\.$/);
    expect(unreadable.lines).toEqual(["Release step: the migrations failed: (an error from a database whose address can't be read)"]);

    const fresh = await freshDatabase();
    try {
      await query(fresh.url, "create table accounts (id integer)");
      const failed = await runRelease({ DATABASE_URL: fresh.url, ...FOUNDER }, fresh.db);
      // Changed after the verification of M-0018 (R5): the code, not the message.
      expect(failed).toEqual({
        ok: false,
        lines: ["Release step: the migrations failed: something the migrations create exists already (42P07)."],
      });
      // Changed after the re-check of M-0018 (RC5): the migrations and their
      // bookkeeping table share one transaction, so a failure leaves nothing.
      expect(await tablesIn(fresh.url)).toEqual(["public.accounts"]);
    } finally {
      await fresh.drop();
    }
  });

  it("closed: when any account exists, the founder's or another person's, the release makes none, says 'an account exists already', and the build goes on; the first-account rule holds under the lock when two releases race on a migrated database", async () => {
    await makeAccount({ handle: "anna_fict" });
    const outcome = await runRelease({ DATABASE_URL: inject("databaseUrl"), ...FOUNDER }, db());
    expect(outcome).toEqual({ ok: true, lines: ["Release step: the migrations are applied.", "Release step: an account exists already, so no account was made."] });
    expect(await db().select({ handle: accounts.handle, isAdmin: accounts.isAdmin }).from(accounts)).toEqual([{ handle: "anna_fict", isAdmin: false }]);

    await reset();
    const racing = await Promise.all([1, 2, 3].map(() => runRelease({ DATABASE_URL: inject("databaseUrl"), ...FOUNDER }, db())));
    expect(racing.every((r) => r.ok)).toBe(true);
    expect(await db().select({ handle: accounts.handle }).from(accounts)).toEqual([{ handle: "founder_fict" }]);
  });

  it("closed: where it runs from changes nothing it reads — from a folder holding a FICTIONAL .env with a DATABASE_URL, the named build still says DATABASE_URL isn't set and connects nowhere (it reads no .env file); and run through a symbolic link to apps/web, it still runs (no silent skip from the check that it was invoked directly)", async () => {
    const fake = await fakePostgres();
    const dir = mkdtempSync(join(tmpdir(), "ours-verify-m0018-"));
    try {
      writeFileSync(join(dir, ".env"), `DATABASE_URL=${pgAddress(`fict_user:${FICT_PASS}`, `127.0.0.1:${fake.port}`, "/neondb")}\n`);
      const fromEnvFolder = await tsx(join(WEB, "scripts", "release.ts"), [], { ...OPEN, ...FOUNDER, ...CONTROLLER }, dir);
      expect(fromEnvFolder).toEqual({ code: 1, out: "", err: "Release step: DATABASE_URL isn't set for production. Nothing was done.\n" });
      expect(fake.seen).toEqual([]);

      symlinkSync(WEB, join(dir, "web"));
      const viaLink = await tsx("scripts/release.ts", [], {}, join(dir, "web"));
      expect(viaLink).toEqual({ code: 0, out: "Release step: nothing done, because this isn't a Vercel build.\n", err: "" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await fake.close();
    }
  }, 60_000);
});

describe("closed: the founder script after the refactor (passes on d26556a)", () => {
  beforeEach(reset);

  it("closed: the founder script still makes only a FICTIONAL first account — it refuses every address not at example.test or below it (example.com, look-alikes before and after it, an address with two @, an address literal), refuses with no data controller, makes the first account, and refuses a second, different or the same; createFirstAccount is the script's old transaction and lock, moved", async () => {
    const local = withUser(inject("databaseUrl"));
    const seed = (email: string, handle = "ada_fict", extra: Record<string, string> = {}) =>
      tsx("scripts/seed-founder.ts", ["--email", email, "--handle", handle, "--name", "Ada (FICTIONAL)"], { DATABASE_URL: local, ...CONTROLLER, ...extra });
    for (const email of ["ada@example.com", "ada@example.test.evil.example", "ada@notexample.test", "ada@xexample.test", "ada@example.testx", "ada@[127.0.0.1]"]) {
      const ran = await seed(email);
      expect({ email, code: ran.code, err: ran.err }).toEqual({
        email,
        code: 1,
        err: "Refused: under M-0010 only fictional accounts exist. Use an address ending in example.test.\n",
      });
    }
    expect((await seed("ada@example.test@evil.example")).err).toBe("Enter a valid email address.\n");
    expect((await seed("ada@example.test", "ada_fict", { DATA_CONTROLLER: "" })).err).toBe(
      "Refused: no data controller is named. Set DATA_CONTROLLER and DATA_CONTROLLER_EMAIL first.\n",
    );
    expect(await db().select().from(accounts)).toHaveLength(0);

    expect((await seed("ada@sub.example.test")).code).toBe(0);
    for (const [email, handle] of [["bob@example.test", "bob_fict"], ["ada@sub.example.test", "ada_fict"]] as const) {
      const ran = await seed(email, handle);
      expect(ran.code).toBe(1);
      expect(ran.err).toBe("Refused: an account already exists. The founder's account is the first one; every other account is invited by a person.\n");
    }
    expect(await db().select({ handle: accounts.handle, isAdmin: accounts.isAdmin }).from(accounts)).toEqual([{ handle: "ada_fict", isAdmin: true }]);

    // The refactor moved the transaction, the lock, the check and the insert, unchanged.
    const before = spawnSync("git", ["show", `${BEFORE}:apps/web/scripts/seed-founder.ts`], { cwd: ROOT, encoding: "utf8" }).stdout;
    const now = read("src/core/founder.ts");
    for (const line of [
      "await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('seed:founder', 0))`);",
      "const existing = await tx.select({ id: accounts.id }).from(accounts).limit(1);",
      "if (existing.length) return false;",
      "invitedBy: null,",
      "isAdmin: true,",
    ]) {
      expect(before, line).toContain(line);
      expect(now, line).toContain(line);
    }
    expect(read("scripts/seed-founder.ts")).toContain("if (!isFictionalAddress(email)) {");
  }, 90_000);
});

describe("closed: how Vercel builds it (each passes on d26556a)", () => {
  it("closed: apps/web/vercel.json holds only keys Vercel's schema has — framework nextjs, no install command (Vercel picks pnpm from the lockfile; retitled after the re-check, RC13), the build command, one region (fra1) and one cron — and the cron is valid: five fields, minute 0, hour 8, any day of the month, any month, day of the week 1 (Monday), on a path whose route exports GET; the root vercel.json, unchanged by the build, builds only the oursorg.com page (pnpm proof into apps/proof/dist) and isn't read for a project whose root directory is apps/web, which M-0012 tells the founder to set, with no overrides", () => {
    const config = JSON.parse(read("vercel.json")) as Record<string, unknown>;
    // Changed after the verification of M-0018 (this file's own note on the
    // install override): no install command, so Vercel picks pnpm from the
    // lockfile instead of the oldest pnpm in its image.
    expect(Object.keys(config).sort()).toEqual(["$schema", "buildCommand", "crons", "framework", "regions"]);
    expect(config).toEqual({
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: "nextjs",
      buildCommand: "pnpm run vercel-build",
      regions: ["fra1"],
      crons: [{ path: "/api/cron/weekly-digest", schedule: "0 8 * * 1" }],
    });
    const [cron] = config.crons as { path: string; schedule: string }[];
    const fields = cron!.schedule.split(" ");
    expect(fields).toEqual(["0", "8", "*", "*", "1"]);
    expect(existsSync(join(WEB, "src/app", cron!.path, "route.ts"))).toBe(true);
    expect(typeof cronGET).toBe("function");

    const rootChanged = spawnSync("git", ["diff", "--name-only", BEFORE, BUILD, "--", "vercel.json"], { cwd: ROOT, encoding: "utf8" });
    expect(rootChanged.status).toBe(0);
    expect(rootChanged.stdout).toBe("");
    expect(JSON.parse(readRoot("vercel.json"))).toMatchObject({ buildCommand: "pnpm proof", outputDirectory: "apps/proof/dist", framework: null });
    // Changed after the verification of M-0018: M-0012 now says vercel.json
    // sets the build command and the region, and Vercel picks pnpm itself.
    expect(record("mandates/M-0012.md")).toContain(
      "with root directory apps/web, and no overrides for its build, install or output commands: apps/web/vercel.json sets the build command and the functions' region, Frankfurt, and Vercel picks pnpm from the lockfile (D-0021 §D, §J).",
    );
  });

  it("closed: next build itself touches no database — the routes it prerenders are only /build.md, /kit/[file], the icon and the manifest, none of which imports anything that reaches one; the layouts around every page that does are dynamic (force-dynamic, or a session read), and so are the three route handlers that do (by hand: three builds with DATABASE_URL at a tripwire, no connection; route table ƒ for all of them)", () => {
    for (const file of ["src/app/build.md/route.ts", "src/app/kit/[file]/route.ts", "src/core/kit.ts", "src/app/manifest.ts", "src/app/layout.tsx"]) {
      expect(read(file), file).not.toMatch(/@\/core\/(?!kit")|from "pg"|drizzle|getDb|\.\.\/core\//);
    }
    for (const file of ["src/app/(public)/layout.tsx", "src/app/not-found.tsx", "src/app/api/cron/weekly-digest/route.ts", "src/app/api/health/route.ts", "src/app/(app)/settings/export/route.ts"]) {
      expect(read(file), file).toContain('export const dynamic = "force-dynamic";');
    }
    expect(read("src/app/(app)/layout.tsx")).toContain("requireViewer");
    expect(read("src/web/viewer.ts")).toContain("const raw = await readSessionCookie();");
    expect(read("src/web/session.ts")).toContain("return (await cookies()).get(cookieName(base))?.value || null;");
  });

  it("closed: kit/ is there when the site is built from apps/web — the two static routes read it once, at build time, from process.cwd()/../../kit, which from apps/web is the repository's kit/ with the three files; M-0012 tells the founder to keep files outside the root directory available to the build; and the founder's first Vercel build installed the whole workspace from ../.. ('Scope: all 7 workspace projects'), so they were", () => {
    expect(read("src/core/kit.ts")).toContain('export const KIT_DIR = join(process.cwd(), "..", "..", "kit");');
    for (const file of ["build.md", "our-one.mjs", "our.one.schema.json"]) expect(existsSync(join(WEB, "..", "..", "kit", file)), file).toBe(true);
    expect(read("src/app/build.md/route.ts")).toContain('export const dynamic = "force-static";');
    expect(read("src/app/kit/[file]/route.ts")).toContain('export const dynamic = "force-static";');
    expect(record("mandates/M-0012.md")).toContain("In Vercel, keep files outside the root directory available to the build: /build.md and /kit/ are read from kit/ when the site is built.");
    expect(readRoot("proposals/P-0014.evidence-conversation-2026-10-03.md")).toContain("Scope: all 7 workspace projects");
  });

  it("closed: tsx runs on Vercel's pnpm 10, which skips esbuild's install script — Vercel chose pnpm 10 for this project (the founder's log), tsx 4.23.13 uses esbuild 0.28.2, and the lockfile holds esbuild's Linux x64 binary for it, which needs no install script; every child in this file runs tsx installed the same way (pnpm 10.19 here, 'Ignored build scripts: esbuild')", () => {
    expect(readRoot("proposals/P-0014.evidence-conversation-2026-10-03.md")).toContain("Using pnpm@10.x based on project creation date");
    const lock = readRoot("pnpm-lock.yaml");
    expect(lock).toContain("lockfileVersion: '9.0'");
    expect(lock).toMatch(/\n {2}tsx@4\.23\.13:\n {4}dependencies:\n {6}esbuild: 0\.28\.2\n/);
    expect(lock).toContain("\n  '@esbuild/linux-x64@0.28.2':\n");
    expect(JSON.parse(read("package.json")).devDependencies.tsx).toBe("4.23.13");
  });
});

describe("closed: the weekly email on Vercel's schedule (each passes on d26556a)", () => {
  beforeEach(reset);

  it("closed: GET is POST, and both refuse every call without the exact 'Bearer <CRON_SECRET>' — none, empty, 'Bearer', 'Bearer ', lower-case 'bearer', a doubled space, the secret alone, Basic, one character short or long — with 401 and no-store (a space after the secret is trimmed by HTTP itself, as by the Fetch Headers here, so it is the same header); with CRON_SECRET unset or blank both answer 503, 'switched off'; with the secret, the first call sends this week's email and answers counts only, and a second and third call, by POST and GET, send nothing new", async () => {
    expect(cronGET).toBe(cronPOST);
    const reader = await makeAccount({ handle: "reader_fict" });
    const friend = await makeAccount({ handle: "friend_fict", displayName: "FICTIONAL Friend" });
    await befriend(reader, friend);
    await post(friend, { at: new Date(Date.now() - 3_600_000) });
    const secret = process.env.CRON_SECRET!;
    const refused = [undefined, "", "Bearer", "Bearer ", `bearer ${secret}`, `Bearer  ${secret}`, secret, `Basic ${secret}`, `Bearer ${secret.slice(0, -1)}`, `Bearer ${secret}x`];
    for (const handler of [cronGET, cronPOST]) {
      for (const value of refused) {
        const res = await handler(new Request(URL_CRON, value === undefined ? {} : bearer(value)));
        expect(res.status, String(value)).toBe(401);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ ok: false, error: "Not allowed." });
      }
    }
    expect(await db().select().from(outbox)).toHaveLength(0);

    const first = await cronGET(new Request(URL_CRON, bearer(`Bearer ${secret}`)));
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const body = (await first.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["failed", "ok", "sent", "skipped", "weekStart"]);
    expect(body).toMatchObject({ ok: true, sent: 1, failed: 0 });
    expect(JSON.stringify(body)).not.toMatch(/fict|example|FICTIONAL/);
    for (const handler of [cronPOST, cronGET]) {
      const again = await handler(new Request(URL_CRON, bearer(`Bearer ${secret}`)));
      expect(await again.json()).toEqual({ ok: true, weekStart: body.weekStart, sent: 0, skipped: 0, failed: 0 });
    }
    expect(await db().select({ to: outbox.toAddress, kind: outbox.kind }).from(outbox)).toEqual([{ to: "reader_fict@example.test", kind: "digest" }]);

    for (const off of ["", "   "]) {
      vi.stubEnv("CRON_SECRET", off);
      for (const handler of [cronGET, cronPOST]) {
        const res = await handler(new Request(URL_CRON, bearer("Bearer ")));
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ ok: false, error: "The weekly email is switched off." });
      }
    }
  });

  it("closed: a weekly run that fails answers 500 with a fixed message and logs only the error's name, never its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("SESSION_SECRET", "");
    const res = await cronGET(new Request(URL_CRON, bearer(`Bearer ${process.env.CRON_SECRET}`)));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "The weekly email run failed." });
    expect(logged.mock.calls).toEqual([["[ours] weekly email run failed:", "Error"]]);
  });
});
