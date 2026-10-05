/**
 * The re-check of M-0018 (ready for the first deploy; D-0021, SPEC §18.20),
 * step 4 of the verification's stopping rule
 * (receipts/conformance/2026-10-03-M-0018.verification.md): one agent that
 * built none of it and verified none of it, after the fixes (aebde1d). It
 * changes no product code, no record, no receipt and no other test.
 *
 * What was asked: do the 21 fixes hold, in the case each finding names and
 * in close variants; did the fixes break anything, the adapted tests
 * included; and did they bring anything new.
 *
 * What was read: AGENTS.md; D-0021 (§I and §J included), M-0018, the
 * amended M-0012 (.md and .yaml), SPEC §18.20 with "After the
 * verification", the stopping rule, the two verifiers' files and
 * `git diff 39fd6ce aebde1d`; src/core/db.ts, hosting.ts, transparency.ts,
 * claims.ts, mail.ts, reports.ts, src/web/actions.ts, the /privacy and
 * /power pages, the weekly email's route, scripts/release.ts, migrate.ts,
 * seed-founder.ts, seed-fictional.ts and digest.ts; and, in node_modules,
 * pg 8.23's ConnectionParameters and Client error handling,
 * pg-connection-string 2.14's parse, Next.js 16.2.7's autoImplementMethods
 * and @next/env's list of env files.
 *
 * What was run, here: the pages rendered with renderToStaticMarkup under
 * vi.stubEnv; the release, the TLS rule and the development server's
 * refusal in-process; every local script as Vercel and a person run it,
 * `tsx <script>` in a child whose environment holds only PATH and what a
 * test names; against fresh local databases this file creates and drops, a
 * fake Postgres on 127.0.0.1 that records what a client sends (reached at
 * 0.0.0.0, which src/core/db.ts treats as another machine), and a
 * transaction-mode pooler written for this file, which hands a client a
 * server connection for one transaction at a time, as PgBouncer does in
 * front of Neon's pooled address. It is a stand-in: no PgBouncer and no
 * Neon were used.
 *
 * What was served, by hand: `next build` of this worktree at aebde1d (every
 * public page ƒ), then `next start` on port 3631, each time with FICTIONAL
 * settings (SESSION_SECRET, DATA_CONTROLLER="FICTIONAL Controller",
 * DATA_CONTROLLER_EMAIL=controller@example.test, MAIL_TRANSPORT=outbox) and
 * a preload that refused any connection or DNS lookup leaving the machine
 * (none was attempted), in six states: Vercel's production deployment
 * imitated (VERCEL=1, VERCEL_ENV=production, VERCEL_REGION=fra1, a
 * Neon-shaped FICTIONAL DATABASE_URL with sslmode and channel_binding), a
 * preview, a preview with that address, `vercel dev` imitated
 * (VERCEL_ENV=development), a local copy with that address, and a plain
 * local copy. /privacy, /power and /rules said what the renders here show,
 * and no part of the address appeared. Then `next start` with DATABASE_URL
 * at the fake on 0.0.0.0 and no VERCEL: /api/health reached it (RC1). Then
 * `next dev` on 3632: with the fake, /api/health said database false and
 * the fake saw nothing; with a scratch local database migrated by
 * `db:migrate`, database true; with the Neon-shaped address, /privacy and
 * /power named Neon while /api/health said database false (RC3). Next.js
 * warned that it inferred the parent checkout as the workspace root (this
 * worktree is nested in it); it reads env files from apps/web of this
 * worktree only, which has none.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on aebde1d, and that
 *   failure is the finding. Each is written to pass once fixed, by
 *   whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity, as the rounds before used it: HIGH, something stated as in
 * force, built or approved that isn't; MEDIUM, a statement the code or the
 * records contradict, or a layer of checking that silently doesn't hold;
 * LOW, wording, polish, small gaps.
 *
 * Every person, address, key and commit here is FICTIONAL. A database
 * address with a password is put together at run time, never written whole
 * (the kit's rule 8 reads this file). No network: the only servers are the
 * local test Postgres, the fake and the pooler, all on this machine.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect, createServer, type Server, type Socket } from "node:net";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { autoImplementMethods } from "next/dist/server/route-modules/app-route/helpers/auto-implement-methods";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import * as cronRoute from "@/app/api/cron/weekly-digest/route";
import { GET as cronGET, POST as cronPOST } from "@/app/api/cron/weekly-digest/route";
import { scanKitText, scanRepoPublicText, scanText } from "@/core/claims";
import { closeDb, connectionOptions, getDb, isLocal } from "@/core/db";
import { HOSTING_FILE, loadControl, type ControlRow } from "@/core/transparency";
import { outbox } from "@/core/schema";
import { runRelease } from "../scripts/release";
import { befriend, db, makeAccount, post, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TSX = join(WEB, "node_modules", ".bin", "tsx");

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
/** Source text as a reader reads its comments: each line's leading " * " or "//" dropped, whitespace collapsed. */
const prose = (s: string) => flat(s.replace(/\n\s*(?:\*|\/\/) ?/g, " "));

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** The text from `start` up to `end` (or to the end). */
function between(text: string, start: string, end?: string): string {
  const a = text.indexOf(start);
  if (a === -1) throw new Error(`between: "${start}" not found`);
  if (end === undefined) return text.slice(a);
  const b = text.indexOf(end, a + start.length);
  if (b === -1) throw new Error(`between: "${end}" not found after "${start}"`);
  return text.slice(a, b);
}

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

/** A FICTIONAL database address, put together at run time (the kit's rule 8 reads this file). */
const pgAddress = (userinfo: string, host: string, rest: string) => ["postgresql:", "//", userinfo, "@", host, rest].join("");
const FICT_PASS = ["fict", "pass", "recheck", "m0018"].join("_");
const FICT_USERINFO = `fict_user:${FICT_PASS}`;
const NEON_EU = pgAddress(FICT_USERINFO, "ep-fictional-pond-123456-pooler.eu-central-1.aws.neon.tech", "/neondb?sslmode=require&channel_binding=require");

/** Every part of a database address a page must never show; a region label is the one part it may name. */
const ADDRESS_PARTS = ["fict_user", FICT_PASS, "ep-fictional-pond", "pooler", "neondb", "sslmode", "channel_binding", "neon.tech", "c-2.", "db-fict-host", "fict-socket"];

/** The variables the pages read about where they run, their email, and proposals. */
const KEYS = ["VERCEL", "VERCEL_ENV", "VERCEL_REGION", "DATABASE_URL", "MAIL_TRANSPORT", "RESEND_API_KEY", "MAIL_FROM", "PROPOSALS_EMAIL"] as const;

/** Exactly these settings, and none of the others in KEYS; NODE_ENV stays "test" unless given. */
function setEnv(vars: Record<string, string | undefined>): void {
  for (const key of KEYS) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "test");
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

/** Vercel's production deployment, imitated: the platform's own variables. */
const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_REGION: "fra1" } as const;
const PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" } as const;

/** A <dt>'s <dd> on /privacy, as a reader reads it. */
function privacyLine(label: string, html = render(PrivacyPage)): string {
  const m = new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`).exec(html);
  return m ? textOf(m[1]!) : "";
}

/** /power's hosting row, as this server shows it. */
function hostingRow(): ControlRow {
  const row = loadControl().find((r) => r.asset === "Hosting, database, email sending");
  if (!row) throw new Error("no hosting row");
  return row;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A FICTIONAL commit the platform reports, and Vercel's production build of it, named in OURS_RELEASE. */
const SHA = "5e0c9a7d31b84f26a0d9e1c47b3f8a2d6c105e98";
const OPEN = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA, OURS_RELEASE: SHA.slice(0, 8) } as const;
const FOUNDER = { FOUNDER_EMAIL: "founder_rc@example.test", FOUNDER_HANDLE: "founder_rc", FOUNDER_NAME: "Founder (FICTIONAL)" } as const;
const CONTROLLER = { DATA_CONTROLLER: "FICTIONAL Controller", DATA_CONTROLLER_EMAIL: "controller@example.test" } as const;

/** PATH with node's folder and the system's only: nothing else from this shell reaches a child. */
const BARE_PATH = [dirname(process.execPath), "/usr/bin", "/bin"].join(":");

type Ran = { code: number | null; out: string; err: string };

/** A script run as Vercel's build and a person run it, `tsx <script>`, with only the variables given. */
function tsx(script: string, args: string[], env: Record<string, string | undefined>): Promise<Ran> {
  const clean: Record<string, string> = { PATH: BARE_PATH };
  for (const [key, value] of Object.entries(env)) if (value !== undefined) clean[key] = value;
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [script, ...args], { cwd: WEB, env: clean as NodeJS.ProcessEnv });
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
 * A fake Postgres on 127.0.0.1: it records each connection and what the
 * client sends first, an SSLRequest (answered "N", no TLS here) or a plain
 * StartupMessage, to which it answers "send your password in clear text",
 * recording the password if one comes. It never answers a query. With
 * `hangUp`, it closes each connection as soon as it opens.
 */
async function fakePostgres(hangUp = false): Promise<Fake> {
  const seen: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    seen.push("connection");
    if (hangUp) {
      socket.destroy();
      return;
    }
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
  return {
    port: typeof address === "object" && address !== null ? address.port : 0,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgresql://localhost:5432/postgres";
const LOCAL_USER = new URL(ADMIN_URL).username || userInfo().username;

async function onAdmin<T = Record<string, unknown>>(statement: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return (await client.query(statement, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** An address with a user name in it, so a child with no USER in its environment can use it. */
function withUser(url: string): string {
  const u = new URL(url);
  if (!u.username) u.username = LOCAL_USER;
  return u.toString();
}

type Fresh = { name: string; url: string; drop: () => Promise<void> };

/** A fresh, empty database on the local test server; the caller drops it. */
async function freshDatabase(): Promise<Fresh> {
  const name = `ours_web_recheck_m0018_${randomBytes(5).toString("hex")}`;
  await onAdmin(`create database "${name}"`);
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  return { name, url: withUser(u.toString()), drop: () => onAdmin(`drop database if exists "${name}" with (force)`).then(() => undefined) };
}

async function query<T>(url: string, statement: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(statement)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Every advisory lock in a database, held or waited for. */
function advisoryLocks(database: string): Promise<{ pid: number; granted: boolean }[]> {
  return onAdmin(
    "select l.pid, l.granted from pg_locks l join pg_database d on d.oid = l.database where l.locktype = 'advisory' and d.datname = $1 order by l.granted desc",
    [database],
  );
}

/** The migration lock's key, as scripts/migrate.ts takes it. */
const MIGRATION_LOCK = "select pg_advisory_lock(hashtextextended('ours:migrations', 0))";

/* ------------------------------------------- a transaction-mode pooler */

type Pooler = { port: number; close: () => Promise<void> };

/** One protocol message from a buffer, or null while it is incomplete. */
function takeMessage(buf: Buffer): { type: string; msg: Buffer; rest: Buffer } | null {
  if (buf.length < 5) return null;
  const len = buf.readUInt32BE(1);
  if (buf.length < 1 + len) return null;
  return { type: String.fromCharCode(buf[0]!), msg: buf.subarray(0, 1 + len), rest: buf.subarray(1 + len) };
}

function protocolMessage(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.write(type, 0);
  head.writeUInt32BE(4 + body.length, 1);
  return Buffer.concat([head, body]);
}

/**
 * A transaction-mode pooler, as PgBouncer runs in front of Neon's pooled
 * address: it answers a client's startup itself, then lends it a server
 * connection for one transaction at a time (until ReadyForQuery says
 * idle), reusing the last one returned first, as PgBouncer does by default.
 * A server connection, and its session, outlive the clients that used it.
 * The test server must let the local user in without a password.
 */
async function transactionPooler(database: string): Promise<Pooler> {
  const target = new URL(ADMIN_URL);
  type Srv = { socket: Socket; buf: Buffer; client: Cli | null };
  type Cli = { socket: Socket; buf: Buffer; started: boolean; server: Srv | null; pending: Buffer[]; waiting: boolean };
  const idle: Srv[] = [];
  const all = new Set<Srv>();
  const clients = new Set<Socket>();

  const openServer = () =>
    new Promise<Srv>((resolve, reject) => {
      const socket = connect(Number(target.port || 5432), target.hostname || "localhost");
      const srv: Srv = { socket, buf: Buffer.alloc(0), client: null };
      let ready = false;
      socket.on("error", (e) => (ready ? undefined : reject(e)));
      socket.on("close", () => {
        all.delete(srv);
        const at = idle.indexOf(srv);
        if (at !== -1) idle.splice(at, 1);
        if (srv.client) srv.client.socket.destroy();
      });
      socket.on("connect", () => {
        const params = Buffer.from(`user\0${LOCAL_USER}\0database\0${database}\0\0`);
        const startup = Buffer.alloc(8 + params.length);
        startup.writeUInt32BE(8 + params.length, 0);
        startup.writeUInt32BE(196608, 4);
        params.copy(startup, 8);
        socket.write(startup);
      });
      socket.on("data", (d: Buffer) => {
        srv.buf = Buffer.concat([srv.buf, d]);
        for (let m = takeMessage(srv.buf); m; m = takeMessage(srv.buf)) {
          srv.buf = m.rest;
          if (!ready) {
            if (m.type === "R" && m.msg.readUInt32BE(5) !== 0) reject(new Error("the test server asks the pooler for a password"));
            if (m.type === "E") reject(new Error("the test server refused the pooler"));
            if (m.type === "Z") {
              ready = true;
              all.add(srv);
              resolve(srv);
            }
            continue;
          }
          const cli = srv.client;
          if (cli) cli.socket.write(m.msg);
          if (m.type === "Z" && m.msg[5] === 0x49 /* idle */ && cli) {
            cli.server = null;
            srv.client = null;
            idle.push(srv);
          }
        }
      });
    });

  const serve = async (cli: Cli) => {
    if (cli.waiting) return;
    while (cli.pending.length) {
      if (!cli.server) {
        cli.waiting = true;
        const srv = idle.pop() ?? (await openServer());
        cli.waiting = false;
        srv.client = cli;
        cli.server = srv;
      }
      cli.server.socket.write(cli.pending.shift()!);
    }
  };

  const server: Server = createServer((socket) => {
    clients.add(socket);
    const cli: Cli = { socket, buf: Buffer.alloc(0), started: false, server: null, pending: [], waiting: false };
    socket.on("error", () => undefined);
    socket.on("close", () => {
      clients.delete(socket);
      if (cli.server) cli.server.socket.destroy();
    });
    socket.on("data", (d: Buffer) => {
      cli.buf = Buffer.concat([cli.buf, d]);
      while (!cli.started && cli.buf.length >= 8) {
        const len = cli.buf.readUInt32BE(0);
        if (cli.buf.length < len) return;
        const code = cli.buf.readUInt32BE(4);
        cli.buf = cli.buf.subarray(len);
        if (code === 80877103) {
          socket.write("N");
          continue;
        }
        cli.started = true;
        const status = (k: string, v: string) => protocolMessage("S", Buffer.from(`${k}\0${v}\0`));
        socket.write(
          Buffer.concat([
            protocolMessage("R", Buffer.from([0, 0, 0, 0])),
            status("client_encoding", "UTF8"),
            status("standard_conforming_strings", "on"),
            protocolMessage("K", Buffer.from([0, 0, 0, 1, 0, 0, 0, 2])),
            protocolMessage("Z", Buffer.from("I")),
          ]),
        );
      }
      for (let m = takeMessage(cli.buf); m; m = takeMessage(cli.buf)) {
        cli.buf = m.rest;
        if (m.type === "X") {
          socket.end();
          return;
        }
        cli.pending.push(m.msg);
      }
      void serve(cli);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address !== null ? address.port : 0,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of clients) s.destroy();
        for (const s of all) s.socket.destroy();
        server.close(() => resolve());
      }),
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on aebde1d)", () => {
  // RC1
  it("fixed (MEDIUM): a local `next start` still reaches a database that isn't on this machine. D-0021 §J says a key left in apps/web/.env.local 'then reaches no local run', and SPEC §18.20 'A local run never reaches a remote database', but only NODE_ENV=development is refused: Next.js reads .env.local for `next start` as well (it skips the file only in test), and getDb() under NODE_ENV=production connects to whatever host DATABASE_URL names (served on 3631: /api/health of a local production server reached the fake at 0.0.0.0). The founder's main checkout, whose .env.local held the real keys (P-0014; D-0021 §F, §H), is the case these sentences were written for (a variant of R1)", async () => {
    expect(record("decisions/D-0021.md")).toContain("A key left in apps/web/.env.local then reaches no local run");
    const spec = flat(read("SPEC.md")).replace(/[*`]/g, "");
    expect(JSON.parse(read("package.json")).scripts.start).toBe("next start");
    // Next's own list of env files: .env.local in every mode but test.
    const nextEnv = readFileSync(createRequire(join(WEB, "node_modules", "next", "package.json")).resolve("@next/env"), "utf8");
    expect(nextEnv).toMatch(/!==\s*"test"\s*&&\s*`\.env\.local`/);

    // A local production server: NODE_ENV=production, no VERCEL variables.
    const fake = await fakePostgres();
    let reached: boolean;
    try {
      setEnv({ NODE_ENV: "production", DATABASE_URL: pgAddress(FICT_USERINFO, `0.0.0.0:${fake.port}`, "/neondb") });
      expect(isLocal(process.env.DATABASE_URL!)).toBe(false);
      let refused = false;
      try {
        await getDb().execute(sql`select 1`);
      } catch (error) {
        refused = /only a database on this machine/.test(error instanceof Error ? error.message : "");
      }
      reached = fake.seen.includes("connection");
      expect(refused || reached).toBe(true);
    } finally {
      await closeDb();
      await fake.close();
    }
    // The defect: the records say no local run reaches it, and a local production server does.
    expect({ reached, recordsSayNoLocalRun: spec.includes("A local run never reaches a remote database") }).not.toEqual({
      reached: true,
      recordsSayNoLocalRun: true,
    });
  });

  // RC2
  it("fixed (MEDIUM): M-0012 and D-0021 §J say pushes to main build previews 'which hold no production setting', but M-0012 scopes only DATABASE_URL (and the Neon integration's variables) to production: step 5's settings — SESSION_SECRET, CRON_SECRET, RESEND_API_KEY with MAIL_TRANSPORT=resend, FOUNDER_EMAIL (the one real address), OURS_RELEASE — are given no environment, and Vercel's form puts a new variable in Production, Preview and Development unless told otherwise (as the re-checker knows it; not checked over the network). Followed as written, every preview of a pushed commit runs with the real email key, and `vercel env pull` writes the keys into .env.local, which D-0021 §F keeps FICTIONAL (a variant of R2)", () => {
    const m12 = record("mandates/M-0012.md");
    const d21 = record("decisions/D-0021.md");
    const claim = "Pushes to main then build previews, which hold no production setting.";
    expect(m12).toContain("Its connection URL goes into Vercel as DATABASE_URL, for production only, so that no preview build can reach it.");
    expect(m12).toContain("If Neon is added through Vercel's integration, every variable it adds is for production only too.");
    expect(d21).toContain("apps/web/.env.local holds local, FICTIONAL settings.");
    const step5 = between(m12, "5. In Vercel's environment settings", "6. The domain:");
    for (const name of ["SESSION_SECRET", "CRON_SECRET", "RESEND_API_KEY", "MAIL_TRANSPORT=resend", "FOUNDER_EMAIL", "OURS_RELEASE"]) expect(step5, name).toContain(name);
    // The defect: step 5 says nothing of which environments these go in, while step 6 says previews hold none of them.
    const scoped = /production only|only (?:for|in|to) (?:the )?production|production environment|scoped to production|not (?:for|in|to) (?:the )?previews?/i.test(step5);
    expect(scoped || !m12.includes(claim)).toBe(true);
  });

  // RC3
  it("fixed (LOW): in development with a Neon address — the founder's own .env.local (P-0014), or `vercel dev` after `vercel env pull` — /privacy says 'Neon keeps its database …: everything this notice says is kept is stored there' and /power names Neon, while the same server refuses that database (getDb(): 'In development, our.one uses only a database on this machine'), so nothing is kept there: H1's fix and R1's disagree (served so by `next dev` on 3632: the pages named Neon, /api/health said database false, no connection was tried)", () => {
    const states: [string, Record<string, string>][] = [
      ["pnpm dev", { NODE_ENV: "development", DATABASE_URL: NEON_EU }],
      ["vercel dev", { NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "development", DATABASE_URL: NEON_EU }],
    ];
    const named: Record<string, { privacy: boolean; power: boolean }> = {};
    for (const [name, vars] of states) {
      setEnv(vars);
      expect(() => getDb(), name).toThrow(/only a database on this machine/);
      named[name] = { privacy: /Neon keeps/.test(privacyLine("Hosting")), power: /Neon keeps/.test(hostingRow().who) };
    }
    // The defect: both pages name a database this server refuses to use.
    expect(named).toEqual({ "pnpm dev": { privacy: false, power: false }, "vercel dev": { privacy: false, power: false } });
  });

  // RC4
  it("fixed (LOW): deployed with PROPOSALS_EMAIL set, as M-0012 requires, /privacy says of an emailed proposal 'we keep your address and your message … They aren't stored on our.one itself.', and then that Neon keeps the database and 'everything this notice says is kept is stored there': H11's new words take in the proposals' mailbox, which isn't Neon; the feed's manifest says Neon holds 'everything in data.collects', which lists no proposals (a variant of H11)", () => {
    expect(record("mandates/M-0012.md")).toContain("choose the address and set PROPOSALS_EMAIL in Vercel");
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string }[]; sharedWith: { who: string; what: string }[] } };
    expect(manifest.data.sharedWith.find((s) => s.who === "Neon")?.what).toBe("The database, which holds everything in data.collects, while it is kept there.");
    expect(manifest.data.collects.filter((c) => /proposal/i.test(c.what))).toEqual([]);
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU, PROPOSALS_EMAIL: "ideas@example.test" });
    const html = render(PrivacyPage);
    const text = textOf(html);
    expect(text).toContain("If you email a proposal or a need to ideas@example.test, we keep your address and your message");
    const hostingLine = privacyLine("Hosting", html);
    expect(hostingLine).toContain("Neon keeps our.one's database");
    // The defect: the notice says both.
    expect(text.includes("They aren't stored on our.one itself.") && hostingLine.includes("everything this notice says is kept is stored there")).toBe(false);
  });

  // RC5
  it("fixed (LOW): R4's lock doesn't hold through a transaction pooler, which is what Neon's pooled address is (PgBouncer in transaction mode, as the re-checker knows Neon; the `-pooler` host the deploy tests use as the deployed address). The lock is session-wide, on a connection of its own: through the pooler it is taken by a server connection that outlives the release ('Ending the session releases the lock' isn't so there), and two releases at once on a fresh database — R4's case — leave one waiting, with no end, for a lock nobody will release (so in three rounds by hand and in this one, through a pooler written for this test); SPEC §18.20 says 'so two releases at once both pass'. The lock taken with pg_advisory_xact_lock in the migrations' own transaction passes this test", async () => {
    expect(read("tests/deploy-ready.test.ts")).toContain('"ep-fictional-pond-123456-pooler.eu-central-1.aws.neon.tech"');

    const fresh = await freshDatabase();
    let pooler: Pooler | null = null;
    let outcome: unknown;
    let left: { pid: number; granted: boolean }[] = [];
    try {
      pooler = await transactionPooler(fresh.name);
      const through = `postgresql://${LOCAL_USER}@127.0.0.1:${pooler.port}/${fresh.name}`;
      const both = Promise.all([runRelease({ DATABASE_URL: through }), runRelease({ DATABASE_URL: through })]);
      outcome = await Promise.race([both.then((o) => o.map((r) => r.ok)), sleep(8_000).then(() => "a release still waiting after 8 s")]);
      left = await advisoryLocks(fresh.name);
      // Let a waiting release finish: end the server session that kept the lock.
      for (const lock of left) if (lock.granted) await onAdmin("select pg_terminate_backend($1)", [lock.pid]);
      await Promise.race([both.catch(() => undefined), sleep(10_000)]);
    } finally {
      await pooler?.close();
      await fresh.drop();
    }
    // The defect: one release waits on a lock left behind by the other.
    expect({ outcome, left }).toEqual({ outcome: [true, true], left: [] });
  }, 60_000);

  // RC6
  it("fixed (LOW): the lock's own connection has no error handler: when it drops while the migrations run (here its session is ended with pg_terminate_backend while the migrations wait on a table lock), the release dies on Node's \"Unhandled 'error' event\" and prints the database's own message ('terminating connection due to administrator command'), the error's fields and a stack trace with the build machine's paths, instead of a 'Release step:' line. SPEC §18.20: a database error in the log is 'what it means and its code, never its message' (a variant of R4 and R5)", async () => {
    const fresh = await freshDatabase();
    const holder = new pg.Client({ connectionString: fresh.url });
    holder.on("error", () => undefined);
    await holder.connect();
    let ran: Ran = { code: null, out: "", err: "" };
    try {
      await holder.query('create schema if not exists "drizzle"');
      await holder.query('create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)');
      await holder.query("begin");
      await holder.query('lock table "drizzle"."__drizzle_migrations" in access exclusive mode');
      const child = tsx("scripts/release.ts", [], { ...OPEN, DATABASE_URL: fresh.url });
      let pid: number | null = null;
      for (let i = 0; i < 150 && pid === null; i++) {
        const held = (await advisoryLocks(fresh.name)).filter((l) => l.granted);
        if (held.length) pid = held[0]!.pid;
        else await sleep(100);
      }
      expect(pid).not.toBeNull();
      await onAdmin("select pg_terminate_backend($1)", [pid]);
      await sleep(500);
      await holder.query("commit");
      ran = await child;
    } finally {
      await holder.end().catch(() => undefined);
      await fresh.drop();
    }
    const lines = `${ran.out}${ran.err}`.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    // The defect: what the build log would show is Node's dump, not the release's lines.
    expect(lines.filter((l) => !l.startsWith("Release step:"))).toEqual([]);
  }, 60_000);

  // RC7
  it("fixed (LOW): the TLS rule and the local-only rule read the host from new URL(…).hostname, but pg reads more of the address (pg-connection-string 2.14, pg 8.23): a `host` parameter wins over it, `ssl=0` turns TLS off, `ssl=no-verify` stops the certificate check. So an address whose host is localhost but whose `host` parameter names another machine passes isLocal — the founder script and the development server connect there without TLS and send the password in clear text — and a remote address with `ssl=0` makes the release do the same: R6's case by another parameter, and R1's guard passed by one. Each needs an address edited by hand, as R6 did", async () => {
    const script = await fakePostgres();
    const dev = await fakePostgres();
    const release = await fakePostgres();
    let seen: { script: string[]; dev: string[]; release: string[] };
    try {
      // The founder script, given localhost with a `host` parameter that names 0.0.0.0, which db.ts treats as another machine.
      const viaHostParam = (port: number) => pgAddress(FICT_USERINFO, "localhost:1", `/neondb?host=0.0.0.0&port=${port}`);
      expect(isLocal(pgAddress(FICT_USERINFO, `0.0.0.0:${script.port}`, "/neondb"))).toBe(false);
      await tsx("scripts/seed-founder.ts", ["--email", "ada_rc@example.test", "--handle", "ada_rc", "--name", "Ada (FICTIONAL)"], {
        DATABASE_URL: viaHostParam(script.port),
        ...CONTROLLER,
      });
      // The development server, given the same.
      setEnv({ NODE_ENV: "development", DATABASE_URL: viaHostParam(dev.port) });
      // Changed after the re-check of M-0018 (RC1, RC7): getDb() now refuses
      // this address itself, before any query, so the refusal is a throw.
      try {
        await getDb().execute(sql`select 1`);
      } catch {
        // refused, or failed: either way, nothing reached the fake
      }
      await closeDb();
      // The release, given a remote address with ssl=0.
      const outcome = await runRelease({ DATABASE_URL: pgAddress(FICT_USERINFO, `0.0.0.0:${release.port}`, "/neondb?ssl=0") });
      expect(outcome.ok).toBe(false);
      expect(outcome.lines.join("\n")).not.toContain(FICT_PASS);
      seen = { script: [...script.seen], dev: [...dev.seen], release: [...release.seen] };
    } finally {
      await closeDb();
      await Promise.all([script.close(), dev.close(), release.close()]);
    }
    const noVerify = new pg.Client(connectionOptions(pgAddress(FICT_USERINFO, "db-fict-host.example.test", "/neondb?ssl=no-verify"))) as unknown as {
      connectionParameters: { ssl: unknown };
    };
    // The defect: the local ones reach another machine, and they and the release send the password in clear; a certificate goes unchecked.
    expect({
      scriptReached: seen.script.length > 0,
      scriptInClear: seen.script.includes(`password:${FICT_PASS}`),
      devReached: seen.dev.length > 0,
      devInClear: seen.dev.includes(`password:${FICT_PASS}`),
      releaseInClear: seen.release.includes(`password:${FICT_PASS}`),
      certificateChecked: noVerify.connectionParameters.ssl,
    }).toEqual({
      scriptReached: false,
      scriptInClear: false,
      devReached: false,
      devInClear: false,
      releaseInClear: false,
      certificateChecked: { rejectUnauthorized: true },
    });
  }, 60_000);

  // RC8
  it("fixed (LOW): the claims scan's new rule misses the very status H9 cited from the M-0017 verification — kit/README's 'Not deployed yet.' — and close forms of the ones it catches: 'our.one isn't live yet.' (it reads \"isn't\" only before 'deployed', though 'our.one is not live' is caught), 'It's not deployed yet.' and 'our.one has been deployed.' (a variant of H9)", () => {
    expect(prose(read("tests/verify-m0018-honesty.test.ts"))).toContain("kit/README's 'Not deployed yet.'");
    const caught = (s: string) => scanText(s, null).length > 0;
    for (const s of ["our.one is not live.", "our.one is not deployed yet.", "The site isn't deployed."]) expect(caught(s), s).toBe(true);
    // The defect.
    expect(["Not deployed yet.", "our.one isn't live yet.", "It's not deployed yet.", "our.one has been deployed."].filter((s) => !caught(s))).toEqual([]);
  });

  // RC9
  it("fixed (LOW): H9 is marked fixed, but its last part still holds: `pnpm claims` reads neither apps/web/README.md — where H2's '**Nothing is deployed.**' stood, which the new rule would now catch — nor the root README, whose first section is for visitors from our.one; a status written back into either passes the scan (a variant of H9)", () => {
    expect(git(["show", "39fd6ce:apps/web/README.md"])).toContain("**Nothing is deployed.**");
    expect(scanText("Nothing is deployed.", null).length).toBeGreaterThan(0);
    // What `pnpm claims` (scripts/claims-scan.ts) reads: the public text and the kit's.
    const scanned = [...scanRepoPublicText(WEB).files, ...scanKitText(WEB).files];
    // The defect.
    expect({ appsWebReadme: scanned.includes("README.md"), rootReadme: scanned.includes("../../README.md") }).toEqual({ appsWebReadme: true, rootReadme: true });
  });

  // RC10
  it("fixed (LOW): D-0021 §J says 'Errors are logged by name everywhere in the application', and SPEC §18.20 'never by message', but three local scripts still print the message — db:migrate's and seed:founder's 'database \"…\" does not exist', seed:fictional's 'Failed query: select count(*) from \"accounts\" params:' — and db:migrate prints the address it migrated, with its user, host and database name ('Migrations applied to postgresql://…'). digest.ts was changed; these weren't. They refuse any other machine now, so what they print is this machine's (a variant of R5)", async () => {
    expect(record("decisions/D-0021.md")).toContain("Errors are logged by name everywhere in the application.");
    expect(read("scripts/digest.ts")).toContain('error instanceof Error ? error.name : "unknown error"');
    const fresh = await freshDatabase();
    const absent = `ours_fict_absent_${randomBytes(4).toString("hex")}`;
    const missing = new URL(fresh.url);
    missing.pathname = `/${absent}`;
    let logs: Record<string, string>;
    try {
      const applied = await tsx("scripts/migrate.ts", [], { DATABASE_URL: fresh.url });
      expect(applied.code, applied.err).toBe(0);
      const failed = await tsx("scripts/migrate.ts", [], { DATABASE_URL: missing.toString() });
      expect(failed.code).toBe(1);
      const founder = await tsx("scripts/seed-founder.ts", ["--email", "ada_rc@example.test", "--handle", "ada_rc", "--name", "Ada (FICTIONAL)"], {
        DATABASE_URL: missing.toString(),
        ...CONTROLLER,
      });
      expect(founder.code).toBe(1);
      const fictional = await tsx("scripts/seed-fictional.ts", [], { DATABASE_URL: missing.toString(), ...CONTROLLER });
      expect(fictional.code).toBe(1);
      logs = {
        applied: applied.out + applied.err,
        failed: failed.out + failed.err,
        founder: founder.out + founder.err,
        fictional: fictional.out + fictional.err,
      };
    } finally {
      await fresh.drop();
    }
    // A part of the address, or a database's own words: its message ('… does not exist'), or drizzle's ('Failed query: …', with its params).
    const parts = [fresh.name, absent, LOCAL_USER, "localhost", "postgresql:", "does not exist", "Failed query", "params:"];
    const shown = Object.fromEntries(Object.entries(logs).map(([k, v]) => [k, parts.filter((p) => v.includes(p)).length > 0]));
    // The defect.
    expect(shown).toEqual({ applied: false, failed: false, founder: false, fictional: false });
  }, 60_000);

  // RC11
  it("fixed (LOW): the weekly email's route says OPTIONS 'is answered by the framework with the methods allowed', but the framework's list has HEAD ('Allow: GET, HEAD, OPTIONS, POST'), which the route now refuses with 405, and that 405's own Allow ('GET, POST') leaves out OPTIONS, which is answered: the two answers disagree about what the route allows (a variant of R8)", async () => {
    const methods = autoImplementMethods(cronRoute as unknown as Parameters<typeof autoImplementMethods>[0]);
    const ctx = { params: Promise.resolve({}) } as never;
    const options = (await methods.OPTIONS(new Request("http://localhost:3000/api/cron/weekly-digest", { method: "OPTIONS" }) as never, ctx)) as Response;
    const head = (await methods.HEAD(new Request("http://localhost:3000/api/cron/weekly-digest", { method: "HEAD" }) as never, ctx)) as Response;
    expect([options.status, head.status]).toEqual([204, 405]);
    const listed = (options.headers.get("allow") ?? "").split(", ").sort();
    const headAllow = (head.headers.get("allow") ?? "").split(", ").sort();
    const agree = !listed.includes("HEAD") && listed.join(", ") === headAllow.join(", ");
    const saysAllowed = prose(read("src/app/api/cron/weekly-digest/route.ts")).includes("OPTIONS is answered by the framework with the methods allowed");
    // The defect: the route says OPTIONS lists the methods allowed, and the two answers disagree.
    expect({ agree, saysAllowed }).not.toEqual({ agree: false, saysAllowed: true });
  });

  // RC12
  it("fixed (LOW): R2's fix rests the gate on the production branch — 'a branch named release, which only a deploy moves' (D-0021 §J; M-0012 step 6) — a rule given no class (AGENTS.md §7) and no mechanism: nothing asks GitHub to keep anyone but the founder from moving release, and any push to it is a production build with the production settings, gated only by that commit's own code. As written it is DECLARED, and the records state it as a fact (a variant of R2)", () => {
    expect(readRoot("AGENTS.md")).toContain("Every rule in this repository declares how it is actually held");
    const d21J = between(record("decisions/D-0021.md"), "J. After the verification", "Prohibited under this decision");
    const m12 = record("mandates/M-0012.md");
    const spec = flat(between(read("SPEC.md"), "**After the verification**")).replace(/[*`]/g, "");
    expect(d21J).toContain("How the release gate is held (AGENTS.md §7): ENFORCED by scripts/release.ts, in the commit being built.");
    expect(m12).toMatch(/set the production branch to release/);
    const text = `${d21J} ${m12} ${spec}`;
    const statesTheRule = /which only a deploy moves/.test(text);
    // The defect: the branch rule's class isn't said, and no mechanism holds it.
    const classed = /\b(?:DECLARED|INTERPRETED)\b/.test(text) || /branch protection|ruleset|protected branch|restricts? (?:who can )?push/i.test(text);
    expect(!statesTheRule || classed).toBe(true);
  });

  // RC13
  it("fixed (LOW): H13's kind again — an adapted test's title says the opposite of what it checks: verify-m0018-release.test.ts's 'closed: apps/web/vercel.json holds only keys … the install command with the frozen lockfile …' now asserts that there is no install command (its comment says 'Changed after the verification of M-0018'), and the title is what a run and a receipt show (a variant of H13)", () => {
    const source = read("tests/verify-m0018-release.test.ts");
    const at = source.indexOf('expect(Object.keys(config).sort()).toEqual(["$schema", "buildCommand", "crons", "framework", "regions"]);');
    expect(at).toBeGreaterThan(-1);
    const titleAt = source.lastIndexOf('\n  it("', at);
    const title = source.slice(titleAt, source.indexOf('", () => {', titleAt));
    expect(title).toContain("closed: apps/web/vercel.json holds only keys");
    expect(JSON.parse(read("vercel.json"))).not.toHaveProperty("installCommand");
    // The defect.
    expect(title).not.toMatch(/install command with the frozen lockfile/);
  });
});

/* -------------------------------------------------------------- closed */

describe("closed: where it runs, off the deployed site (each passes on aebde1d)", () => {
  it("closed: off Vercel's production deployment every hosting sentence is true and /privacy and /power agree (H1, H5) — a preview names Vercel with its region (or none), a copy whose database is Neon's names Neon with its region, a preview with a Neon address names both ('Both as stated'), and 'None' stays only where neither is true: no VERCEL variables, VERCEL=1 alone, VERCEL_ENV=preview without VERCEL=1, `vercel dev` (VERCEL_ENV=development) and VERCEL='true'; each says it isn't the deployed site, under NODE_ENV test or production (as `next start`), with every email setting (served the same on 3631)", () => {
    const NEON_WORDS = "Neon keeps its database, in Frankfurt, Germany (eu-central-1)";
    const states: { name: string; vars: Record<string, string>; vercel: string | null; neon: boolean }[] = [
      { name: "a preview", vars: { ...PREVIEW }, vercel: "Frankfurt, Germany (fra1)", neon: false },
      { name: "a preview, no region", vars: { VERCEL: "1", VERCEL_ENV: "preview" }, vercel: "", neon: false },
      { name: "a preview, an unknown region", vars: { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "hkg1" }, vercel: "region hkg1", neon: false },
      { name: "a preview with a Neon address", vars: { ...PREVIEW, DATABASE_URL: NEON_EU }, vercel: "Frankfurt, Germany (fra1)", neon: true },
      { name: "a local copy with a Neon address", vars: { DATABASE_URL: NEON_EU }, vercel: null, neon: true },
      // Changed after the re-check of M-0018 (RC1, RC3): off Vercel's
      // deployments a server refuses a database on another machine, so
      // `next start` with a Neon address names none.
      { name: "next start with a Neon address", vars: { NODE_ENV: "production", DATABASE_URL: NEON_EU }, vercel: null, neon: false },
      { name: "no VERCEL variables", vars: {}, vercel: null, neon: false },
      { name: "VERCEL=1 alone", vars: { VERCEL: "1" }, vercel: null, neon: false },
      { name: "VERCEL_ENV=preview without VERCEL=1", vars: { VERCEL_ENV: "preview", VERCEL_REGION: "fra1" }, vercel: null, neon: false },
      { name: "vercel dev", vars: { VERCEL: "1", VERCEL_ENV: "development", VERCEL_REGION: "dev1" }, vercel: null, neon: false },
      { name: "VERCEL='true'", vars: { VERCEL: "true", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" }, vercel: null, neon: false },
    ];
    const sending: Record<string, string>[] = [{}, { MAIL_TRANSPORT: "resend" }, { NODE_ENV: "production", MAIL_TRANSPORT: "resend", RESEND_API_KEY: "FICTIONAL-key", MAIL_FROM: "ours@example.test" }];
    for (const s of states) {
      for (const mail of sending) {
        setEnv({ ...s.vars, ...mail, ...(s.vars.NODE_ENV ? { NODE_ENV: s.vars.NODE_ENV } : {}) });
        const where = `${s.name} × ${JSON.stringify(mail)}`;
        const html = render(PrivacyPage);
        const privacy = textOf(html);
        const line = privacyLine("Hosting", html);
        const row = hostingRow();
        expect(privacy, where).toContain("This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.");
        expect(row.who, where).toContain("isn't the deployed site");
        // Changed after the re-check of M-0018 (RC1, RC3): a server off
        // Vercel's deployments refuses a database elsewhere, so a copy run in
        // production mode there (here with Resend's settings) names none.
        const neon = s.neon && (s.vars.VERCEL === "1" || process.env.NODE_ENV !== "production");
        for (const text of [line, row.who]) {
          expect(text.includes("Vercel runs"), where).toBe(s.vercel !== null);
          expect(text.includes(NEON_WORDS), where).toBe(neon);
          if (s.vercel) expect(text, where).toContain(`as a preview, in ${s.vercel}`);
          if (s.vercel === "") expect(text, where).toMatch(/as a preview[.:]/);
          expect(/\bnone\b/i.test(text), where).toBe(s.vercel === null && !neon);
        }
        if (s.vercel !== null || neon) {
          expect(line, where).toMatch(s.vercel !== null && neon ? /\. Both as stated in this server's configuration\.$/ : /\. As stated in this server's configuration\.$/);
          expect(row, where).toMatchObject({ status: "STATED", statedBy: "configuration" });
        } else {
          expect(line, where).toBe(HOSTING_FILE);
        }
        expect(textOf(render(PowerPage)), where).toContain("The rows stated in this server's configuration come from its settings, and change with them;");
      }
    }
  });

  it("closed: no page shows any part of a database address (H3) — user, password, endpoint, pooler, cell label, database name, query, another host, a socket path — on /privacy, /power or /rules, deployed, in a preview, in `vercel dev`, on a local copy under test, production or development, for a pooled Neon address with sslmode and channel_binding, a four-label one, one with a cell and no region, Azure, an upper-case host, a look-alike, an address with a host parameter, a socket address and an IPv6 one; and a region is named only when the label is a region code (served the same on 3631)", () => {
    const addresses: { name: string; url: string; region: string | null | false }[] = [
      { name: "pooled, eu-central-1", url: NEON_EU, region: "Frankfurt, Germany (eu-central-1)" },
      { name: "four labels", url: pgAddress(FICT_USERINFO, "ep-fictional-pond-123456.aws.neon.tech", "/neondb"), region: null },
      { name: "a cell, no region", url: pgAddress(FICT_USERINFO, "ep-fictional-pond-123456-pooler.c-2.aws.neon.tech", "/neondb"), region: null },
      { name: "a cell and a region", url: pgAddress(FICT_USERINFO, "ep-fictional-pond-123456-pooler.c-2.us-east-2.aws.neon.tech", "/neondb"), region: "Ohio, United States (us-east-2)" },
      { name: "Azure", url: pgAddress(FICT_USERINFO, "ep-fictional-pond-123456.germanywestcentral.azure.neon.tech", "/neondb"), region: "Frankfurt, Germany (germanywestcentral)" },
      { name: "upper case", url: pgAddress(FICT_USERINFO, "EP-FICTIONAL-POND-123456.EU-CENTRAL-1.AWS.NEON.TECH", "/neondb"), region: "Frankfurt, Germany (eu-central-1)" },
      { name: "a look-alike", url: pgAddress(FICT_USERINFO, "ep-fictional-pond-123456.eu-central-1.aws.neon.tech.db-fict-host.example.test", "/neondb"), region: false },
      { name: "a host parameter", url: pgAddress(FICT_USERINFO, "localhost", "/neondb?host=ep-fictional-pond-123456.eu-central-1.aws.neon.tech"), region: false },
      { name: "a socket", url: "postgresql:///neondb?host=/tmp/fict-socket", region: false },
      { name: "IPv6", url: pgAddress(FICT_USERINFO, "[::1]:5432", "/neondb"), region: false },
    ];
    const states: [string, Record<string, string>][] = [
      ["deployed", { ...PRODUCTION }],
      ["a preview", { ...PREVIEW }],
      ["vercel dev", { VERCEL: "1", VERCEL_ENV: "development" }],
      ["a local copy", {}],
      ["next start", { NODE_ENV: "production" }],
      ["pnpm dev", { NODE_ENV: "development" }],
    ];
    for (const a of addresses) {
      for (const [state, vars] of states) {
        setEnv({ ...vars, DATABASE_URL: a.url });
        const where = `${a.name}, ${state}`;
        for (const page of [PrivacyPage, PowerPage, RulesPage]) {
          const html = render(page);
          for (const part of ADDRESS_PARTS) expect(html.toLowerCase().includes(part.toLowerCase()), `${part}: ${where}`).toBe(false);
        }
        // The region's words, where the server would use the database (development is RC3's).
        // Changed after the re-check of M-0018 (RC1): `next start` off Vercel refuses it too.
        if (vars.NODE_ENV === "development" || vars.NODE_ENV === "production" || vars.VERCEL_ENV === "development") continue;
        const row = hostingRow().who;
        if (a.region === false) expect(row, where).not.toContain("Neon");
        else if (a.region === null) expect(row, where).toMatch(/Neon keeps its database\./);
        else expect(row, where).toContain(`Neon keeps its database, in ${a.region}.`);
      }
    }
  });
});

describe("closed: the release and the database (each passes on aebde1d)", () => {
  it("closed: one TLS rule, as pg itself applies it (R6, R7) — on this machine (localhost, 127.0.0.1, [::1], a socket) no TLS, unless the address asks for it with sslmode require or verify-full, and sslmode=disable keeps it off; on any other host TLS with the certificate checked, whatever sslmode says (disable, allow, prefer, require, no-verify, none); channel_binding=require turns channel binding on; sslmode and channel_binding never reach pg, so it prints no warning; and over the wire, the release and the site both ask for TLS before anything else from a host that isn't this machine, and send no password to one that refuses it, which the release reports in its own words", async () => {
    type Params = { ssl: unknown; host: string };
    const pgSees = (url: string) => {
      const options = connectionOptions(url);
      const client = new pg.Client(options) as unknown as { connectionParameters: Params };
      return { ssl: client.connectionParameters.ssl, channelBinding: options.enableChannelBinding === true, string: options.connectionString };
    };
    const checked = { rejectUnauthorized: true };
    const cases: [string, string, unknown][] = [
      ["localhost", pgAddress(FICT_USERINFO, "localhost:5432", "/neondb"), false],
      ["127.0.0.1", pgAddress(FICT_USERINFO, "127.0.0.1:5432", "/neondb"), false],
      ["[::1]", pgAddress(FICT_USERINFO, "[::1]:5432", "/neondb"), false],
      ["a socket", "postgresql:///neondb?host=/tmp", false],
      ["localhost, sslmode=disable", pgAddress(FICT_USERINFO, "localhost", "/neondb?sslmode=disable"), false],
      ["localhost, sslmode=require", pgAddress(FICT_USERINFO, "localhost", "/neondb?sslmode=require"), checked],
      ["localhost, sslmode=verify-full", pgAddress(FICT_USERINFO, "localhost", "/neondb?sslmode=verify-full"), checked],
      ["remote, no sslmode", pgAddress(FICT_USERINFO, "db-fict-host.example.test", "/neondb"), checked],
      ...["disable", "allow", "prefer", "require", "no-verify", "verify-ca"].map((mode): [string, string, unknown] => [
        `remote, sslmode=${mode}`,
        pgAddress(FICT_USERINFO, "db-fict-host.example.test", `/neondb?sslmode=${mode}`),
        checked,
      ]),
      ["Neon's own address", NEON_EU, checked],
    ];
    for (const [name, url, ssl] of cases) {
      const seen = pgSees(url);
      expect(seen.ssl, name).toEqual(ssl);
      expect(seen.string, name).not.toMatch(/sslmode|channel_binding/);
    }
    expect(pgSees(NEON_EU).channelBinding).toBe(true);
    expect(pgSees(pgAddress(FICT_USERINFO, "db-fict-host.example.test", "/neondb?channel_binding=prefer")).channelBinding).toBe(false);
    expect(read("scripts/migrate.ts")).toMatch(/connectionOptions\(url\)/);
    expect(read("src/core/db.ts")).toMatch(/new Pool\(\{\s*\.\.\.connectionOptions\(url\),/);

    // Over the wire: the release (migrations) and the site (getDb), to a host that isn't this machine, with sslmode=disable.
    const forRelease = await fakePostgres();
    const forSite = await fakePostgres();
    const local = await fakePostgres();
    try {
      const outcome = await runRelease({ DATABASE_URL: pgAddress(FICT_USERINFO, `0.0.0.0:${forRelease.port}`, "/neondb?sslmode=disable") });
      expect(outcome).toEqual({ ok: false, lines: ["Release step: the migrations failed: the database doesn't offer TLS, which the release requires."] });
      // Changed after the re-check of M-0018 (RC1): the site is the deployed
      // one, on Vercel; off it, a server refuses a database elsewhere first.
      setEnv({ ...PRODUCTION, NODE_ENV: "production", DATABASE_URL: pgAddress(FICT_USERINFO, `0.0.0.0:${forSite.port}`, "/neondb?sslmode=disable") });
      await getDb()
        .execute(sql`select 1`)
        .catch(() => undefined);
      await closeDb();
      // This machine, with sslmode=require: TLS is asked for, as the address says.
      const asked = await runRelease({ DATABASE_URL: pgAddress(FICT_USERINFO, `127.0.0.1:${local.port}`, "/neondb?sslmode=require&channel_binding=require") });
      expect(asked.ok).toBe(false);
      for (const fake of [forRelease, forSite, local]) {
        expect(fake.seen.slice(0, 2)).toEqual(["connection", "SSLRequest"]);
        expect(fake.seen.filter((s) => s.startsWith("password:"))).toEqual([]);
      }
    } finally {
      await closeDb();
      await Promise.all([forRelease.close(), forSite.close(), local.close()]);
    }
  });

  it("closed: on a direct connection the migration lock holds (R4) — a release waits while another session holds the lock and goes on when it is let go; two releases at once on a database whose migrations will fail (a table they create exists already) both fail with the same line, the lock is let go after each, and nothing is left half-made; and two at once on a fresh database both pass, with each migration applied once", async () => {
    const fresh = await freshDatabase();
    const holder = new pg.Client({ connectionString: fresh.url });
    holder.on("error", () => undefined);
    await holder.connect();
    try {
      await holder.query(MIGRATION_LOCK);
      let done = false;
      const waiting = runRelease({ DATABASE_URL: fresh.url }).then((o) => {
        done = true;
        return o;
      });
      await sleep(1_500);
      expect(done).toBe(false);
      expect((await advisoryLocks(fresh.name)).map((l) => l.granted)).toEqual([true, false]);
      await holder.query("select pg_advisory_unlock(hashtextextended('ours:migrations', 0))");
      expect((await Promise.race([waiting, sleep(15_000).then(() => null)]))?.ok).toBe(true);
      expect(await advisoryLocks(fresh.name)).toEqual([]);
    } finally {
      await holder.end();
      await fresh.drop();
    }

    const failing = await freshDatabase();
    try {
      await query(failing.url, "create table accounts (id integer)");
      const both = await Promise.all([runRelease({ DATABASE_URL: failing.url }), runRelease({ DATABASE_URL: failing.url })]);
      for (const outcome of both) {
        expect(outcome).toEqual({ ok: false, lines: ["Release step: the migrations failed: something the migrations create exists already (42P07)."] });
      }
      expect(await advisoryLocks(failing.name)).toEqual([]);
      // Nothing half-made: the one table that was there is the only one.
      expect(await query(failing.url, "select table_name as t from information_schema.tables where table_schema = 'public'")).toEqual([{ t: "accounts" }]);
    } finally {
      await failing.drop();
    }

    const twice = await freshDatabase();
    try {
      const both = await Promise.all([runRelease({ DATABASE_URL: twice.url }), runRelease({ DATABASE_URL: twice.url })]);
      expect(both.map((o) => o.ok)).toEqual([true, true]);
      // Changed under M-0021 (D-0024 §B): a fourth migration, 0003_needs; each is still applied once.
      expect(await query(twice.url, "select count(*)::int as n from drizzle.__drizzle_migrations")).toEqual([{ n: 4 }]);
      expect(await advisoryLocks(twice.name)).toEqual([]);
    } finally {
      await twice.drop();
    }
  }, 90_000);

  it("closed: the release's log is its own lines, meaning and code (R5) — a server that hangs up, one that offers no TLS, an address with a short user and password, a database that doesn't exist, and, run as Vercel runs it, a database that refuses — every line starts 'Release step:', and none holds the host, the port, the user, the password or the database's name; the settings are checked first, so a bad founder setting with a bad address names only the setting (R3)", async () => {
    const hangUp = await fakePostgres(true);
    const noTls = await fakePostgres();
    const absent = `ours_fict_absent_${randomBytes(4).toString("hex")}`;
    try {
      const missing = new URL(ADMIN_URL);
      missing.pathname = `/${absent}`;
      const short = new URL(ADMIN_URL);
      short.username = "zq";
      short.password = "qz";
      const outcomes = {
        hangUp: await runRelease({ DATABASE_URL: pgAddress(FICT_USERINFO, `127.0.0.1:${hangUp.port}`, "/neondb") }),
        noTls: await runRelease({ DATABASE_URL: pgAddress(FICT_USERINFO, `0.0.0.0:${noTls.port}`, "/neondb") }),
        short: await runRelease({ DATABASE_URL: short.toString() }),
        missing: await runRelease({ DATABASE_URL: withUser(missing.toString()) }),
        badSetting: await runRelease({ DATABASE_URL: "not an address", ...FOUNDER, FOUNDER_HANDLE: "admin" }),
      };
      // Which of the two a hang-up gives depends on when the socket closes.
      expect(outcomes.hangUp.lines).toHaveLength(1);
      expect(outcomes.hangUp.lines[0]).toMatch(/^Release step: the migrations failed: (?:the database closed the connection \(ECONNRESET\)|Error, with no code)\.$/);
      expect(outcomes.noTls.lines).toEqual(["Release step: the migrations failed: the database doesn't offer TLS, which the release requires."]);
      expect(outcomes.short.lines[0]).toMatch(/^Release step: the migrations failed: the database refused the (?:user \(28000\)|password \(28P01\))\.$/);
      expect(outcomes.missing.lines).toEqual(["Release step: the migrations failed: the database the address names doesn't exist (3D000)."]);
      expect(outcomes.badSetting.lines).toEqual(["Release step: the founder's account settings aren't valid: That username is reserved. Choose another. No account was made."]);
      const child = await tsx("scripts/release.ts", [], { ...OPEN, ...FOUNDER, ...CONTROLLER, DATABASE_URL: pgAddress(FICT_USERINFO, "127.0.0.1:1", "/neondb") });
      expect(child).toEqual({ code: 1, out: "", err: "Release step: the migrations failed: the database refused the connection (ECONNREFUSED).\n" });
      const log = [...Object.values(outcomes).flatMap((o) => o.lines), child.err].join("\n");
      for (const line of log.trim().split("\n")) expect(line).toMatch(/^Release step: /);
      for (const part of [FICT_PASS, "fict_user", "zq", "qz", absent, "127.0.0.1", "0.0.0.0", String(hangUp.port), String(noTls.port), new URL(ADMIN_URL).hostname, LOCAL_USER]) {
        expect(log, part).not.toContain(part);
      }
    } finally {
      await Promise.all([hangUp.close(), noTls.close()]);
    }
  }, 60_000);
});

describe("closed: local runs (each passes on aebde1d)", () => {
  it("closed: the local scripts and the development server refuse a database that isn't on this machine before connecting (R1) — db:migrate, seed:fictional and digest, run as a person runs them, exit 1 with their refusal and the fake saw nothing (seed:founder is R1's own test); getDb() under NODE_ENV=development refuses a remote address, a Neon one included, and opens no connection (served the same by `next dev` on 3632: database false, the fake saw nothing)", async () => {
    const fake = await fakePostgres();
    try {
      const remote = pgAddress(FICT_USERINFO, `0.0.0.0:${fake.port}`, "/neondb");
      const refusals: [string, string[], string][] = [
        ["scripts/migrate.ts", [], "Refused: db:migrate runs only against a database on this machine. The deployed site's database is migrated by Vercel's production build (D-0021 §D, §F).\n"],
        ["scripts/seed-fictional.ts", [], "Refused: this script runs only against a database on this machine (D-0021 §F).\n"],
        ["scripts/digest.ts", [], "Refused: this script runs only against a database on this machine (D-0021 §F).\n"],
      ];
      for (const [script, args, refusal] of refusals) {
        const ran = await tsx(script, args, { DATABASE_URL: remote, ...CONTROLLER });
        expect({ script, ran }).toEqual({ script, ran: { code: 1, out: "", err: refusal } });
      }
      for (const url of [remote, NEON_EU, pgAddress(FICT_USERINFO, `db-fict-host.example.test:${fake.port}`, "/neondb")]) {
        setEnv({ NODE_ENV: "development", DATABASE_URL: url });
        expect(() => getDb()).toThrow(/only a database on this machine/);
      }
      expect(globalThis.__oursWebDb?.url).not.toBe(remote);
      expect(fake.seen).toEqual([]);
    } finally {
      await fake.close();
    }
  }, 60_000);

  it("closed: the local workflow the README documents still works (R1's refusals break none of it) — db:migrate, seed:fictional and digest on a fresh local database by localhost; db:migrate and the development server's getDb() over the Unix socket too (an address with no host); and the test suite's own databases, which tests/setup.ts migrates with the same migrateUrl", async () => {
    const fresh = await freshDatabase();
    try {
      const migrated = await tsx("scripts/migrate.ts", [], { DATABASE_URL: fresh.url });
      expect(migrated.code, migrated.err).toBe(0);
      const seeded = await tsx("scripts/seed-fictional.ts", [], { DATABASE_URL: fresh.url, ...CONTROLLER, SESSION_SECRET: "recheck-FICTIONAL-0123456789abcdef0123456789abcdef" });
      expect(seeded.code, seeded.err).toBe(0);
      expect(seeded.out).toContain("Seeded ");
      const digest = await tsx("scripts/digest.ts", [], { DATABASE_URL: fresh.url, ...CONTROLLER, SESSION_SECRET: "recheck-FICTIONAL-0123456789abcdef0123456789abcdef", APP_URL: "http://localhost:3000" });
      expect(digest.code, digest.err).toBe(0);

      const [socketDirs] = await onAdmin<{ unix_socket_directories: string }>("show unix_socket_directories");
      const dir = socketDirs?.unix_socket_directories.split(",")[0]?.trim();
      if (dir) {
        const socket = `postgresql:///${fresh.name}?host=${encodeURIComponent(dir)}&user=${encodeURIComponent(LOCAL_USER)}`;
        expect(isLocal(socket)).toBe(true);
        const again = await tsx("scripts/migrate.ts", [], { DATABASE_URL: socket });
        expect(again.code, again.err).toBe(0);
        setEnv({ NODE_ENV: "development", DATABASE_URL: socket });
        const rows = await getDb().execute(sql`select current_database() as name`);
        expect((rows.rows[0] as { name: string }).name).toBe(fresh.name);
        await closeDb();
      }
      setEnv({ NODE_ENV: "development", DATABASE_URL: fresh.url });
      expect(((await getDb().execute(sql`select 1 as one`)).rows[0] as { one: number }).one).toBe(1);
    } finally {
      await closeDb();
      await fresh.drop();
    }
    expect(read("tests/setup.ts")).toContain("await migrateUrl(databaseUrl);");
  }, 90_000);
});

describe("closed: the weekly email's route (passes on aebde1d)", () => {
  beforeEach(reset);

  it("closed: HEAD runs nothing (R8) — 405 with no-store, even with the secret, and no email is written; OPTIONS answers 204 and runs nothing; PUT, PATCH and DELETE are refused by the framework; GET and POST are the one handler, refuse without the secret, and with it send this week's email once", async () => {
    const reader = await makeAccount({ handle: "reader_rc" });
    const friend = await makeAccount({ handle: "friend_rc", displayName: "FICTIONAL Friend" });
    await befriend(reader, friend);
    await post(friend, { at: new Date(Date.now() - 3_600_000) });
    const secret = process.env.CRON_SECRET!;
    const url = "http://localhost:3000/api/cron/weekly-digest";
    const withSecret = (method: string) => new Request(url, { method, headers: { authorization: `Bearer ${secret}` } });
    const methods = autoImplementMethods(cronRoute as unknown as Parameters<typeof autoImplementMethods>[0]);
    const ctx = { params: Promise.resolve({}) } as never;

    const head = (await methods.HEAD(withSecret("HEAD") as never, ctx)) as Response;
    expect([head.status, head.headers.get("cache-control")]).toEqual([405, "no-store"]);
    expect(((await methods.OPTIONS(withSecret("OPTIONS") as never, ctx)) as Response).status).toBe(204);
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      expect(((await methods[method](withSecret(method) as never, ctx)) as Response).status, method).toBe(405);
    }
    expect(await db().select().from(outbox)).toHaveLength(0);

    expect(cronGET).toBe(cronPOST);
    expect(methods.GET).toBe(cronGET);
    expect((await cronGET(new Request(url))).status).toBe(401);
    const first = await cronGET(withSecret("GET"));
    expect(await first.json()).toMatchObject({ ok: true, sent: 1, failed: 0 });
    const second = await cronPOST(withSecret("POST"));
    expect(await second.json()).toMatchObject({ ok: true, sent: 0 });
    expect(await db().select({ kind: outbox.kind }).from(outbox)).toEqual([{ kind: "digest" }]);
  });
});

describe("closed: the claims scan and the records (each passes on aebde1d)", () => {
  it("closed: the new rule catches what it was made for, with straight and curly apostrophes, and lets a condition through (H9); it refuses nothing in today's public text, the kit's text, either README, or /privacy, /power and /rules rendered as a preview, a preview with a Neon address, a local copy with one, and deployed", () => {
    const caught = (s: string) => scanText(s, null).length > 0;
    for (const s of ["our.one is deployed.", "our.one is live.", "Nothing is deployed.", "our.one is not deployed yet.", "The site isn’t deployed.", "our.one’s live.", "The feed is now live."]) {
      expect(caught(s), s).toBe(true);
    }
    for (const s of ["Once our.one is deployed, it says so.", "Whether or not the site is deployed, the rules hold.", "Until our.one is live, seats stay closed.", "This copy of our.one isn't the deployed site."]) {
      expect(caught(s), s).toBe(false);
    }
    expect(scanRepoPublicText(WEB).hits).toEqual([]);
    expect(scanKitText(WEB).hits).toEqual([]);
    const statusRule = /deployed|live/;
    for (const readme of [read("README.md"), readRoot("README.md")]) {
      expect(scanText(readme, null).filter((h) => statusRule.test(h.match))).toEqual([]);
    }
    const states: Record<string, string>[] = [{ ...PREVIEW }, { ...PREVIEW, DATABASE_URL: NEON_EU }, { DATABASE_URL: NEON_EU }, { ...PRODUCTION, DATABASE_URL: NEON_EU }];
    for (const vars of states) {
      setEnv(vars);
      for (const [page, file] of [
        [PrivacyPage, null],
        [PowerPage, null],
        [RulesPage, "src/components/public/floorRules.ts"],
      ] as const) {
        const html = render(page);
        expect([...scanText(html, file), ...scanText(textOf(html), file)].map((h) => h.match), JSON.stringify(vars)).toEqual([]);
      }
    }
  });

  it("closed: D-0021 §J, the amended M-0012 and SPEC §18.20 say what the code does — the settings before the database, the migrations under a lock, the site's TLS rule in the release, a database error by meaning and code, HEAD refused, no install command, the local refusals; and M-0012 tells the founder, in this order, to name the commit in OURS_RELEASE and then move release, to give DATABASE_URL and every Neon integration variable to production only, to keep the System Environment Variables on (the gate reads VERCEL, VERCEL_ENV and VERCEL_GIT_COMMIT_SHA), to turn off the automatic domain assignment, to build production from release, and to keep Deployment Protection on for previews; H10 is recorded for the founder", () => {
    const d21J = between(record("decisions/D-0021.md"), "J. After the verification", "Prohibited under this decision");
    for (const said of [
      "it checks the founder's settings before it touches the database;",
      "it runs the migrations one at a time;",
      "it uses the site's TLS rule;",
      "its log gives a database error's meaning and code, never its message.",
      "The weekly email's route refuses HEAD.",
      "apps/web/vercel.json sets no install command, so Vercel picks pnpm from the lockfile.",
      "the local scripts and the development server refuse a database that isn't on this machine.",
      "authority/FOUNDING-AUTHORITY.md §4 says",
    ]) {
      expect(d21J, said).toContain(said);
    }
    const release = read("scripts/release.ts");
    const run = release.slice(release.indexOf("export async function runRelease"));
    expect(run.indexOf("founderSettings(env)")).toBeLessThan(run.indexOf("await migrateUrl(url)"));
    expect(read("scripts/migrate.ts")).toMatch(/pg_advisory(?:_xact)?_lock\(hashtextextended\('ours:migrations', 0\)\)/);
    expect(release).toContain("never its message");
    expect(read("src/app/api/cron/weekly-digest/route.ts")).toMatch(/export function HEAD\(\): Response \{\s*return new Response\(null, \{ status: 405/);
    expect(JSON.parse(read("vercel.json"))).not.toHaveProperty("installCommand");
    for (const gateReads of ["env.VERCEL !==", "env.VERCEL_ENV !==", "env.VERCEL_GIT_COMMIT_SHA"]) expect(release).toContain(gateReads);

    const m12 = record("mandates/M-0012.md");
    const go = between(m12, "Then, on the founder's go", "The agent:");
    expect(go).toContain("The founder names the verified commit in OURS_RELEASE, and release is moved to it");
    expect(go.indexOf("OURS_RELEASE")).toBeLessThan(go.indexOf("release is moved"));
    for (const step of [
      "Its connection URL goes into Vercel as DATABASE_URL, for production only, so that no preview build can reach it.",
      "If Neon is added through Vercel's integration, every variable it adds is for production only too.",
      "Keep \"Enable access to System Environment Variables\" on: the release gate reads them.",
      "turn off the automatic assignment of custom production domains",
      "set the production branch to release",
      "Keep Deployment Protection on for previews",
      "After the deploy, the founder records the production infrastructure in authority/FOUNDING-AUTHORITY.md §4, by a record (D-0021 §J).",
      "Its price goes in the ledger in a later commit, verified the same way, before the public launch (D-0021 §J).",
    ]) {
      expect(m12.replace(/[“”]/g, '"'), step).toContain(step);
    }
    const yaml = readRoot("mandates/M-0012.yaml");
    expect(yaml).toContain("its URL entered by the founder in Vercel for production only, with every variable a Vercel integration adds for production only too");
    expect(yaml).toContain("the production branch set to release");
  });

  it("closed: the tests adapted to the fixes kept their force — in every test file 39fd6ce..aebde1d changed, no expect( or toThrow( was lost; the only skip added is H10's 'recorded, not fixed'; each round-one DEFECT was renamed 'fixed (' or 'recorded, not fixed (' with the rest of its title unchanged; and every test that lost an assertion says 'Changed after the verification of M-0018' (one title is RC13)", () => {
    const files = git(["diff", "--name-only", "39fd6ce", "aebde1d", "--", "apps/web/tests"]).split("\n").filter(Boolean).sort();
    expect(files).toEqual(
      ["claims", "deploy-ready", "transparency", "verify-m0016-honesty", "verify-m0017-honesty", "verify-m0018-honesty", "verify-m0018-release"].map((f) => `apps/web/tests/${f}.test.ts`),
    );
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    const renamedFrom: string[] = [];
    const renamedTo: string[] = [];
    for (const file of files) {
      const before = git(["show", `39fd6ce:${file}`]);
      const after = git(["show", `aebde1d:${file}`]);
      expect(count(after, /expect\(/g), file).toBeGreaterThanOrEqual(count(before, /expect\(/g));
      expect(count(after, /toThrow\(/g), file).toBeGreaterThanOrEqual(count(before, /toThrow\(/g));
      const diff = git(["diff", "-U0", "39fd6ce", "aebde1d", "--", file]);
      const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      const removed = diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
      const skips = added.filter((l) => /\b(?:it|describe|test)\.(?:skip|only|todo)\(|skipIf|runIf/.test(l));
      expect(skips.map((l) => l.slice(0, 40)), file).toEqual(file.endsWith("verify-m0018-honesty.test.ts") ? ['+  it.skip("recorded, not fixed (LOW): /'] : []);
      for (const l of removed) {
        const m = /^-\s+it\("DEFECT (\([A-Z]+\): .*)$/.exec(l);
        if (m) renamedFrom.push(m[1]!);
      }
      for (const l of added) {
        const m = /^\+\s+it(?:\.skip)?\("(?:fixed|recorded, not fixed) (\([A-Z]+\): .*)$/.exec(l);
        if (m) renamedTo.push(m[1]!);
      }
      // Each hunk that drops an assertion lies in a test that says why.
      const lines = after.split("\n");
      for (const hunk of diff.split("\n@@ ").slice(1)) {
        const header = /^-\d+(?:,\d+)? \+(\d+)/.exec(hunk);
        const dropped = hunk.split("\n").filter((l) => l.startsWith("-") && /expect\(|toEqual|toContain|toBe\(/.test(l));
        if (!header || dropped.length === 0) continue;
        const at = Number(header[1]) - 1;
        let start = at;
        while (start > 0 && !/^\s+it(?:\.skip)?\(/.test(lines[start]!)) start--;
        let end = at;
        while (end < lines.length - 1 && !/^\s+it(?:\.skip)?\(/.test(lines[end + 1]!)) end++;
        const test = lines.slice(Math.max(0, start - 4), end + 1).join("\n");
        expect(test, `${file} at line ${at + 1}`).toMatch(/Changed after the verification of M-0018/);
      }
    }
    expect(renamedFrom.length).toBe(21);
    expect(renamedTo.sort()).toEqual(renamedFrom.sort());
  });
});
