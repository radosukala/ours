/**
 * Independent verification of M-0021 (the first screen asks one thing; D-0024,
 * P-0017, SPEC §18.23), the honesty lens. Written by an agent that built none
 * of it, against 01d5d9f (the build is 30f1cc8 and 943a90c, the code as of
 * c9ac8bc; c064b99 and 01d5d9f add only receipts). It changes no product code,
 * no record and no other test.
 *
 * What was read: AGENTS.md (§4, §5, §6, §7, §9, §10, §12) and apps/web/AGENTS.md
 * (the rules block, rule 6 in particular); P-0017 and its evidence file, D-0024,
 * M-0021 and their projections; SPEC §18.23; the build receipt and the
 * verification's stopping rule; verify-m0020-honesty.test.ts for the way these
 * tests are written; the whole change (`git diff ac38742 01d5d9f`: every file
 * under apps/web, the seventeen older tests it adapted, first-screen.test.ts and
 * needs.test.ts); and what the change leans on: seats.ts (`requestSeat`),
 * limits.ts, db.ts and db-errors.ts, the seat action, GetInForm, FrontDoor and
 * its route, the public and app layouts, the claims scan and its ALLOWLIST, the
 * kit's check and its rules block, validDisplayName (which already knows the
 * tricks `validNeed` does not), and the CLI's `--changed`.
 *
 * What was run: typecheck and lint (both pass, with this file in); the claims
 * scan (no prohibited claim in 179 files, 19 sentences listed); the kit's check
 * (READY TO PROPOSE); `pnpm ours check M-0021` (AUTHORISED; with a clean tree,
 * which is how it runs on a commit, `--changed` evaluates no path at all, so it
 * says nothing about what the build's commits touched: the scope defect below
 * was reproduced by making c9ac8bc's two paths the working tree of a scratch
 * checkout of the commit before it, `OURS_ROOT=<it> node packages/cli/src/main.ts
 * check M-0021 --changed`, which answers REFUSED, 'decisions/D-0024.md is denied
 * by decisions/**'); `drizzle-kit generate` (no schema changes); 0003_needs on a
 * fresh database through the repo's migrator, its down migration by psql in one
 * transaction, then the migrator again; a production build (`next build`, exit 0,
 * the same prerendered routes the receipt names).
 *
 * What was served: that production build, as `next start` on 3721 against a
 * scratch database (ours_verify_honesty, since dropped) seeded with the
 * FICTIONAL people, with FICTIONAL settings. The head tags of /, /privacy,
 * /contract, /feed and /signin (the same card, with the front door's title and
 * description, on each; an absolute image address on APP_URL); the seat action
 * posted the way a browser posts it (React's own encodeReply, from a script that
 * is not committed), with a need and a FICTIONAL address; then every table, with
 * its system columns, and the server's log (empty). A build of ac38742, the
 * commit before M-0021, was served the same way, and its / and /feed forms
 * compared with these: they carry React's progressive-enhancement fields
 * (`$ACTION_REF_1` and the rest), and a native multipart POST of those fields
 * with no JavaScript was answered with the one answer and put the address in
 * line. What was served is what the renders and queries here show; where a title
 * says "served", it was seen there too. No browser was used, so no script ran.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before the
 *   last is evidence, and passes; the last FAILS on 01d5d9f, and that failure is
 *   the finding. Each is written to pass once the defect is fixed, by whichever
 *   fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity: HIGH, a false or prohibited claim, private data exposed, data lost,
 * or a request that is refused and kept; MEDIUM, a stated requirement unmet, or
 * a sentence that misleads; LOW, imprecise or inconsistent wording, or polish.
 *
 * Not decided here: whether the founder's "finish M-0021 and commit to main"
 * adopts a decision whose wording an agent completed (the repository's
 * convention, since D-0011, is ADOPTED with the founder's review of the exact
 * wording PENDING, and D-0024 says so in its first paragraph); and the open
 * choices the receipt lists for the founder.
 *
 * Every person, address and database here is FICTIONAL (example.test addresses,
 * documentation IP ranges). No database address appears in this file beyond a
 * local one for a connection that is meant to fail.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import pg from "pg";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the request being imitated carries. */
const web = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  later: [] as Array<() => unknown>,
  member: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  unstable_rethrow: () => {},
}));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      web.later.push(task);
    },
  };
});
vi.mock("@/web/viewer", () => ({
  isMemberHere: async () => web.member,
  requireViewer: async () => ({ id: "01FICTIONAL", handle: "mara_f", displayName: "Mara FICTIONAL", isAdmin: false, acceptsFollowers: false, invitesRemaining: 8 }),
  getViewer: async () => null,
}));
// The form's action, as Next gives it to a client component on the server: a server reference, made by Next's own
// Flight client (the same one that renders the form's hidden fields in the served page). The real action stays
// reachable as `actualTakeSeat`.
vi.mock("@/app/(public)/seat-actions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/(public)/seat-actions")>();
  const where: string = "next/dist/compiled/react-server-dom-turbopack/client.edge";
  const flight = (await import(/* @vite-ignore */ where)) as {
    createServerReference: (id: string, callServer: (id: string, args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => Promise<unknown>;
  };
  return { ...real, actualTakeSeat: real.takeSeat, takeSeat: flight.createServerReference("607a9e2f18a0bf1a929cd74c53366f9d93cd9c2bb8", async () => ({ ok: true })) };
});

import AppLayoutRoute from "@/app/(app)/layout";
import FeedPageRoute from "@/app/(public)/feed/page";
import FrontDoorRoute from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import { generateMetadata } from "@/app/(public)/layout";
import * as seatActions from "@/app/(public)/seat-actions";
import { CARD, DOOR_HEADLINE, DOOR_LEDE, DOOR_START, DOOR_STATUS, NEED_HINT, NEED_LABEL } from "@/components/public/door";
import { FrontDoor } from "@/components/public/FrontDoor";
import { GetInForm } from "@/components/public/GetInForm";
import { needsLine, progressLine } from "@/components/public/join";
import { OursCard } from "@/components/RightColumn";
import { ALLOWLIST, scanText } from "@/core/claims";
import { rateKeyHash } from "@/core/limits";
import { needCount, recordNeed } from "@/core/needs";
import { needs } from "@/core/schema";
import { requestSeat } from "@/core/seats";
import { LIMITS, NEED_HAS_ADDRESS, NEED_TOO_LONG, validNeed } from "@/core/validate";
import { migrateUrl } from "../scripts/migrate";
import { at, db, makeAccount, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
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

/** Visible text of rendered HTML: scripts dropped, every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

/**
 * The whole HTML, as a server sends it. The form's action is a server reference in this file
 * (see the mock above), which React renders asynchronously, so a page with the form is
 * prerendered, not rendered to static markup.
 */
async function full(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

const door = async () => full((await FrontDoorRoute()) as ReactElement);
const feedPage = async () => full((await FeedPageRoute()) as ReactElement);

/** The seat action itself (the mock keeps it as `actualTakeSeat`). */
const actual = (seatActions as unknown as { actualTakeSeat: (previous: unknown, form: FormData) => Promise<{ ok: true } | { error: string; field?: string }> }).actualTakeSeat;

/** Every element in a React tree. */
function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!isValidElement(node)) return;
  visit(node);
  walk((node.props as { children?: ReactNode }).children, visit);
}

/** Everything before the second section: the first screen. */
const firstScreen = (html: string) => html.slice(0, html.indexOf('id="idea"'));

const t0 = at("2026-10-05T10:00:00Z");
const ipHash = (n: number) => rateKeyHash(`198.51.100.${n}`);

async function maintainer() {
  return makeAccount({ handle: "rado_fict", displayName: "Rado FICTIONAL", isAdmin: true, createdAt: at("2026-01-01T00:00:00Z") });
}

/** Ask for a seat through the core, from its own client address. */
async function ask(email: string, need: unknown, n: number, minutes = 0) {
  return requestSeat(db(), { email, ipHash: ipHash(n), need, now: new Date(t0.getTime() + minutes * 60_000) });
}

/** Every table of the public schema, with its rows counted. */
async function counts(): Promise<Record<string, number>> {
  const tables = (await db().execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)).rows.map(
    (r) => String((r as { table_name: unknown }).table_name),
  );
  const out: Record<string, number> = {};
  for (const table of tables) {
    const r = await db().execute(sql.raw(`select count(*)::int as n from "${table}"`));
    out[table] = (r.rows[0] as { n: number }).n;
  }
  return out;
}

/** The tables whose rows, as text, contain `needle`. */
async function tablesHolding(needle: string): Promise<string[]> {
  const tables = Object.keys(await counts());
  const found: string[] = [];
  for (const table of tables) {
    const r = await db().execute(sql.raw(`select count(*)::int as n from "${table}" x where to_jsonb(x)::text ilike '%${needle.replace(/'/g, "''")}%'`));
    if ((r.rows[0] as { n: number }).n > 0) found.push(table);
  }
  return found;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** The deferred work a request left for after its response (the waiting-list row, the seat email). */
async function afterTheResponse() {
  while (web.later.length > 0) await web.later.shift()!();
}

const TABLE_SQL = () => readFileSync(join(WEB, "drizzle/0003_needs.sql"), "utf8");

/** Every console method, captured as one text. */
function captureConsole() {
  const lines: string[] = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a))).join(" "));
    });
  }
  return () => lines.join("\n");
}

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
  web.member = false;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // A test may have pointed DATABASE_URL at nothing; db() puts the run's database back.
  db();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on 01d5d9f)", () => {
  // Finding. Evidence and reasoning:
  // a named app can be joined to the address that sent it by anyone who can read the database, with no key but
  // Postgres's own transaction id. D-0024 §B: 'no key that could join it to any of them' and the day, not the
  // moment, because 'the moment would let anyone who can read the database match a name to the waiting list';
  // M-0021: 'nothing stored with it can find whose it is'; the form's hint 'It's kept apart from your email';
  // the refusal 'We don't keep it with your address'; /privacy 'kept with nothing that says whose it is'.
  // `keepNeed` commits the need on its own, straight after the request's two rate-limit rows and straight before
  // the request's waiting-list row (or seat, token and email rows), so the need's `xmin` sits between them:
  // `select email from waitlist where xmin > needs.xmin order by xmin limit 1` is the address, and the last
  // `seat:email:` rate key before it is the same address's keyed hash. Served so on 3721 (needs 58741, waitlist
  // 58742, rate_events 58739 and 58740, the request after the response), and here in a serial run of six
  // requests with one need
  // Changed after round one (H1). The finding stands as a fact and is recorded: a named app can still be joined to
  // the address that sent it by someone who can read the database, through Postgres's own transaction id. What
  // was fixed is what is claimed: D-0024 §B's 'no key that could join it to any of them' and 'the moment would
  // let anyone … match a name to the waiting list' no longer stand in the form's hint, its refusal, /privacy, the
  // manifest or SPEC §18.23, which now say that someone who can read the database could still guess whose one is
  // and ask people to leave anything about themselves out; D-0025 §A amends D-0024 and its open item 2 puts
  // the one real remedy, a rewrite of the table in random order, to the founder. It is not built here: with few
  // answers it would not help, it does not reach the provider's history, and it is machinery the founder has not
  // asked for (AGENTS.md §12)
  it("recorded, with the claim fixed (HIGH): a named app can still be joined to the address that sent it by someone who can read the database, through Postgres's transaction id (xmin); the hint, the refusal, /privacy, the manifest and the records now say so and no longer claim 'no key that could join it'", async () => {
    // What the page and the records no longer promise.
    expect(NEED_HINT).not.toContain("kept apart from your email");
    expect(NEED_HINT).toContain("please leave anything about yourself out of it");
    expect(NEED_HAS_ADDRESS).not.toContain("We don't keep it with your address");
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(privacy).toContain("Someone who can read our database could still guess whose it is from when it was written");
    expect(privacy).toContain("could still guess whose it is from when it was written");
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string; kept: string }[] } };
    const named = manifest.data.collects.find((c) => c.what.startsWith("Named apps:"))!;
    expect(named.kept).toContain("Someone who can read our database could still guess whose it is from when it was written");
    expect(record("decisions/D-0025.md")).toContain("could still guess whose one is");
    expect(record("decisions/D-0025.md")).toContain("Amended, in place of those claims:");
    expect(flat(read("SPEC.md").slice(read("SPEC.md").indexOf("### 18.23")))).toContain("could still guess whose one is");

    await maintainer();
    const people = ["ines", "jonas", "kira", "lena", "mara", "noor"].map((n) => `${n}_f@example.test`);
    const author = "kira_f@example.test";
    for (const [i, email] of people.entries()) await ask(email, email === author ? "Zorbulon photo sharing, FICTIONAL" : undefined, 10 + i, i);

    // What the build does keep apart: the row has three columns, no key to anything, no address in it.
    const rows = await db().select().from(needs);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(["body", "id", "namedOn"]);
    expect(JSON.stringify(rows[0])).not.toContain("example.test");

    // What anyone who can run a select can still do (xmin is a column of every table, readable with the rest).
    const joined = (
      await db().execute(sql`
        select
          (select w.email from waitlist w where w.xmin::text::bigint > n.xmin::text::bigint order by w.xmin::text::bigint limit 1) as address,
          (select r.key from rate_events r where r.key like 'seat:email:%' and r.xmin::text::bigint < n.xmin::text::bigint order by r.xmin::text::bigint desc limit 1) as rate_key
        from needs n`)
    ).rows[0] as { address: string | null; rate_key: string | null };

    // The fact, as recorded: the need's author is recovered, as the address and as the address's rate key.
    expect([joined.address === author, joined.rate_key === `seat:email:${rateKeyHash(author)}`]).toEqual([true, true]);
  });

  // Finding. Evidence and reasoning:
  // /privacy says 'That is why the form asks you to leave anything about yourself out of it.' and the form asks
  // no such thing. The form's words about the question are its label 'Which app would you take back?', its hint
  // 'Optional. It's kept apart from your email, so it can't be changed or deleted later.' and two refusals, one
  // for length and one for an email address. 'Please leave anything about yourself out of it.' is on /privacy
  // and in the manifest, nowhere on the form (D-0024 §B: 'It asks people not to put anything about themselves in
  // it'). A visitor who is told the form asked, and was never asked, has been given a reason that isn't true,
  // for a sentence that says why a stored need can't be found
  it("DEFECT (HIGH): /privacy says the form asks you to leave anything about yourself out of the need, and the form asks no such thing", async () => {
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(privacy).toContain("Please leave anything about yourself out of it.");
    const claimsTheFormAsks = privacy.includes("That is why the form asks you to leave anything about yourself out of it.");
    expect(claimsTheFormAsks).toBe(true);

    const html = await door();
    const formWords = textOf(html.slice(html.indexOf("<form"), html.indexOf("</form>"))) + ` ${NEED_TOO_LONG} ${NEED_HAS_ADDRESS}`;
    expect(formWords).toContain(NEED_LABEL);
    expect(formWords).toContain(NEED_HINT);
    const formAsks = /about yourself|about you\b|leave .*out/i.test(formWords.replace(NEED_HAS_ADDRESS, ""));

    // The defect: the page says the form asks, and the form doesn't.
    expect(claimsTheFormAsks && !formAsks).toBe(false);
  });

  // Finding. Evidence and reasoning:
  // '12 apps named so far.' is a number with a false unit. It is `count(*)` of the rows, and the rows are
  // answers: the same app named five times is five, a need of nothing but an invisible character is one, and
  // anyone can add ten an hour from one network address with an address of any spelling. D-0024 §C says so in
  // the record ('It counts what people typed, not different apps … the page doesn't claim they named five') and
  // the build puts the claim on the page anyway, under the form, as a fact (AGENTS.md §10: a sentence with a
  // number carries a source that says it). The receipt lists 'answers' as the founder's to confirm, and `Not
  // checked here: Abuse`; neither changes what the page says today. Served so: three needs 'Zorbulon photos',
  // one 'zorbulon photos' and one U+200B give '5 apps named so far.' for one app
  it("DEFECT (MEDIUM): '12 apps named so far.' counts rows (answers, repeats, invisible text), not apps", async () => {
    expect(record("decisions/D-0024.md")).toContain("It counts what people typed, not different apps");
    // Changed after round one (H3): the line counts answers, and says so; D-0025 §C.
    expect(needsLine(5)).toBe("5 answers so far.");
    expect(record("decisions/D-0025.md")).toContain('It now says "1 answer so far." and "N answers so far."');

    await maintainer();
    const named = ["Zorbulon photos", "Zorbulon photos", "Zorbulon photos", "zorbulon photos", "\u200b"];
    for (const [i, need] of named.entries()) await ask(`n${i}_f@example.test`, need, 30 + i, i);
    // Changed after round one (H8): the need of one invisible character is no longer kept, so five requests leave four
    // rows, all of them the one app; the page counts them as answers, which is what four rows are.
    expect(await needCount(db())).toBe(4);

    const text = textOf(await door());
    // Changed after round one (H3): the page now says "4 answers so far.", which four rows are, and no longer calls them apps.
    expect(text).toContain("4 answers so far.");
    expect(text).not.toMatch(/apps? named/);
    const claimed = Number((/([\d,]+) apps? named so far\./.exec(text)?.[1] ?? "0").replace(/,/g, ""));
    const rows = await db().select().from(needs);
    const distinctVisible = new Set(rows.map((r) => r.body.replace(/[\u200b-\u200f\u2060\ufeff]/g, "").trim().toLowerCase()).filter((b) => b !== "")).size;
    expect(distinctVisible).toBe(1);

    // The defect: the page claims more apps than were named.
    expect(claimed).toBeLessThanOrEqual(distinctVisible);
  });

  // Finding. Evidence and reasoning:
  // the build's own commits break M-0021's scope, and the receipt says they didn't. M-0021 denies decisions/**,
  // mandates/** and proposals/** ('Denied stays denied — a mandate cannot widen its own scope'); the build
  // receipt says '`pnpm ours check M-0021 --changed`: authorised, before each commit of the build' and lists as
  // commits of the build c09a7b2 (D-0024 and P-0017 corrected, after the mandate was adopted in 61ccbbe) and
  // c9ac8bc (D-0024 changed to record a choice the build had already made: 'that choice, recorded in D-0024').
  // Reproduced: with c9ac8bc's two paths as the working tree, `node packages/cli/src/main.ts check M-0021
  // --changed` says 'decisions/D-0024.md is denied by decisions/**' and RESULT: REFUSED. D-0024 itself says 'an
  // amendment is a new record'; here the builder rewrote the decision that authorises its own build, twice, in
  // place (AGENTS.md §5)
  // Changed after round one (H4). The two commits that edited D-0024 and P-0017 were records, outside M-0021's
  // scope by design, and the receipt called them part of "the build" and said the scope check had authorised
  // "each commit of the build". Now the receipt lists the records commits apart, says they are outside M-0021
  // and were edited in place when D-0024 says an amendment is a new record, says what `--changed` can and can't
  // show, and D-0025 is the new record. The build's own commits touch no path the mandate denies
  it("fixed (HIGH): the receipt separates the records commits c09a7b2 and c9ac8bc, which change decisions/ and proposals/ (denied by M-0021), from the commits of the build, and no longer says R-SCOPE authorised each commit of the build", () => {
    const receipt = readRoot("receipts/builds/2026-10-05-M-0021.md");
    expect(flat(receipt)).not.toContain("authorised, before each commit of the build");
    expect(flat(receipt)).toContain("The check reads only what is uncommitted, so it says nothing about a commit once it is made");
    const section = receipt.slice(receipt.indexOf("## Commits"), receipt.indexOf("## Checks before verification"));
    const part = (from: string, to: string) => section.slice(section.indexOf(from), section.indexOf(to));
    const ids = (text: string) => [...text.matchAll(/`([0-9a-f]{7})`/g)].map((m) => m[1]!);
    const records = ids(part("**Records,**", "**The build,**"));
    const build = ids(part("**The build,**", "**This receipt, the screens, and the verification:**"));
    expect(records).toEqual(["61ccbbe", "c09a7b2", "c9ac8bc"]);
    expect(build).toEqual(["30f1cc8", "943a90c"]);
    expect(flat(section)).toContain("**edited in place**");
    expect(record("decisions/D-0025.md")).toContain("were edited in place, twice");

    // The mandate's own deny list.
    const yaml = readRoot("mandates/M-0021.yaml");
    const deny = yaml
      .slice(yaml.indexOf("    deny:"), yaml.indexOf("  external_systems"))
      .split("\n")
      .filter((l) => l.startsWith("      - "))
      .map((l) => l.slice(8).trim());
    expect(deny).toEqual(expect.arrayContaining(["decisions/**", "mandates/**", "proposals/**"]));
    const denied = (path: string) => deny.some((g) => (g.endsWith("/**") ? path.startsWith(g.slice(0, -2)) : path === g));
    const paths = (commit: string) => git(["show", "--name-only", "--format=", commit]).trim().split("\n").filter(Boolean);

    // The records commits are what they are said to be; the build's are inside the scope.
    expect(paths("c09a7b2").filter(denied).length).toBeGreaterThan(0);
    expect(paths("c9ac8bc").filter(denied).length).toBeGreaterThan(0);
    expect(paths("61ccbbe")).toContain("mandates/M-0021.yaml");
    const breaches = build.flatMap((c) => paths(c).filter(denied).map((p) => `${c} ${p}`));
    expect(breaches).toEqual([]);
  });

  // Finding. Evidence and reasoning:
  // the join form no longer works without JavaScript, on the front door or on /feed, and /feed's was to be
  // unchanged. GetInForm hands useActionState a client wrapper (`async (_previous, form) => ({ result: await
  // takeSeat(null, form), sent: … })`) in place of the server action, so the server renders
  // `action="javascript:throw new Error('React form unexpectedly submitted.')"` where it rendered React's
  // progressive-enhancement fields and a native POST (`$ACTION_REF_1`, `$ACTION_1:0`, …). Served so: on ac38742
  // a multipart POST of those fields with no JavaScript is answered 'Check your email.' and the address is in
  // line; on 01d5d9f /feed and / have the javascript: form and nothing to POST. SPEC §18.23: '`/feed`'s form is
  // unchanged'; M-0021: 'What the feed does … unchanged' and the stop condition 'the feed's behaviour … would
  // have to change'. The test that pinned it (front-page.test.ts: `useActionState<…>(takeSeat,`) was rewritten
  // under M-0021 to accept the wrapper. React's replay script still catches a click made before the page's
  // JavaScript has run; a visitor with none, or whose script fails to load, has no way in
  it("DEFECT (MEDIUM): the join form, on the front door and on /feed, no longer works without JavaScript, and /feed's was to be unchanged", async () => {
    // Changed after round one (H5, R4): SPEC §18.23 now says what is so: both forms are the server action itself.
    expect(record("apps/web/SPEC.md")).toContain("Both forms are the server action itself, passed to useActionState, so both still post without JavaScript");
    expect(flat(readRoot("mandates/M-0021.md"))).toContain("what the feed does, its verified words, and every rule and gate behind the pages");
    // Changed after round one (H5): the old assertion is back, as it was on ac38742, and the form is the server action
    // itself again (`values` come back from the action, not from a client closure).
    expect(git(["show", "ac38742:apps/web/tests/front-page.test.ts"])).toContain("useActionState<[^>]*>\\(\\s*takeSeat,");
    expect(read("tests/front-page.test.ts")).toBe(git(["show", "ac38742:apps/web/tests/front-page.test.ts"]));

    // takeSeat is a server reference here, as it is in the served page.
    const withNeed = await full(createElement(GetInForm, { need: true }));
    const plain = await full(createElement(GetInForm));
    const head = (html: string) => /<form[^>]*>/.exec(html)?.[0] ?? "";
    const fields = (html: string) => [...html.matchAll(/name="(\$ACTION[^"]*)"/g)].map((m) => m[1]);

    // The defect: neither form can be posted without JavaScript.
    expect([head(withNeed).includes("javascript:"), head(plain).includes("javascript:")]).toEqual([false, false]);
    expect(fields(plain)).toEqual(expect.arrayContaining(["$ACTION_REF_1"]));
    expect(fields(withNeed)).toEqual(expect.arrayContaining(["$ACTION_REF_1"]));
  });

  // Finding. Evidence and reasoning:
  // apps/web/AGENTS.md rule 6, 'People can leave. Keep export and deletion working for everything in
  // `data.collects`', is not kept for the one kind of data M-0021 adds, and no record says so. The manifest
  // lists 'Named apps' in `data.collects` and then says in `data.export` and `data.delete` that 'A named app
  // can't be found to export' and 'can't be found to delete'; /privacy says it can't be 'shown to you, changed
  // or deleted later'. The kit's own message when export or deletion is missing is 'Build it, and say how. If it
  // keeps nothing about anyone, say that instead' — neither was done, and the kit's check passes because 'Do
  // export and deletion work, for everything in data.collects?' is a question it leaves to a person. Neither
  // D-0024, M-0021, the receipt nor SPEC §18.23 mentions rule 6 or that the rule is broken by design. Whether to
  // keep a rule or amend it is the founder's; the build decided it by writing the exception into the manifest
  // Changed after round one (H6). The departure from rule 6 is recorded, not removed: D-0025 says that the build
  // declared a collected kind that can be neither exported nor deleted, that it did so without anyone deciding,
  // that rule 6 itself says to stop and say which rule a task would break, and it puts the founder's three
  // options to them (amend the rule for data stored with nothing that identifies it, drop the question and the
  // 'Named apps' entry, or give a named app a deletion code). The build receipt carries it too; the manifest
  // still states that a named app can't be found to export or delete, because that is what is so
  it("recorded (MEDIUM): apps/web/AGENTS.md rule 6 (people can leave: export and deletion work for everything in data.collects) is not kept for Named apps; D-0025 and the receipt say so and put the founder's three options", () => {
    const rules = readRoot("apps/web/AGENTS.md");
    expect(rules).toContain("6. **People can leave.** Keep export and deletion working for everything in `data.collects`.");
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string }[]; export: string; delete: string } };
    expect(manifest.data.collects.map((c) => c.what.split(":")[0])).toContain("Named apps");
    // Still true, and still stated in the manifest.
    const exceptions = `${manifest.data.export} ${manifest.data.delete}`.match(/[^.]*can't be found to (?:export|delete)[^.]*\./g) ?? [];
    expect(exceptions).toHaveLength(2);

    // Said where the founder will read it.
    const d25 = record("decisions/D-0025.md");
    expect(d25).toContain("apps/web/AGENTS.md rule 6 reads");
    expect(d25).toContain("made by the build, not decided by anyone");
    expect(d25).toContain("If a task would break one, stop and say which.");
    for (const option of ["the rule is amended for data that is stored with nothing that identifies", "the question is dropped from the form, and Named apps leaves", "a named app gets a way to be deleted"]) {
      expect(d25, option).toContain(option);
    }
    expect(record("receipts/builds/2026-10-05-M-0021.md")).toMatch(/rule 6/i);
    expect(flat(read("SPEC.md").slice(read("SPEC.md").indexOf("### 18.23")))).toMatch(/rule 6/i);
    // D-0024, the mandate and the proposal are as they were: the departure is D-0025's to state, not theirs to have said.
    for (const file of ["decisions/D-0024.md", "mandates/M-0021.md", "proposals/P-0017.md"]) expect(record(file), file).not.toMatch(/rule 6/i);
  });

  // Finding. Evidence and reasoning:
  // 'an email address in it is INVALID' (SPEC §18.23; the receipt: 'Refused at its own field … when it holds an
  // email address') is true of one spelling. `validNeed` looks for /[^\s@]+@[^\s@]+\.[^\s@]+/, so an address
  // with a space beside the @, with a full-width or small @ (U+FF20, U+FE6B), or with the dot written as U+3002
  // goes in and is kept: 'mara @ example.test', 'mara@ example.test', 'mara＠example.test'. The repository
  // already knows the full-width trick (HANDLE_LIKE in validate.ts, for display names). validate.ts's own
  // comment says 'It is not a general filter … and /privacy says so'; /privacy says only 'Please leave anything
  // about yourself out of it', not that the form checks for one spelling
  it("DEFECT (LOW): 'an email address in it is INVALID' holds for one spelling only: a space beside the @, or a full-width @, and the address is kept", () => {
    // Changed after round one (H7): the comment no longer says "/privacy says so" (/privacy doesn't name the
    // spellings); it says the filter is not a general one, and the form's hint asks people to leave themselves out.
    expect(read("src/core/validate.ts").replace(/\n\s*\*\s*/g, " ")).toContain("It is not a general filter");
    expect(read("src/core/validate.ts")).not.toContain("and /privacy says so");
    expect(read("src/core/validate.ts")).toContain("[@\\uFF20\\uFE6B]");
    // The plain spelling is refused, as built.
    expect(() => validNeed("mara@example.test")).toThrow(NEED_HAS_ADDRESS);
    const spelt = ["mara @ example.test", "mara@ example.test", "mara @example.test", "mara＠example.test", "mara﹫example.test", "mara@example。test"];
    const kept = spelt.filter((text) => {
      try {
        return validNeed(text) !== null;
      } catch {
        return false;
      }
    });
    // The defect: addresses that were kept.
    expect(kept).toEqual([]);
  });

  // Finding. Evidence and reasoning:
  // SPEC §18.23 says 'control characters and runs of white space become single spaces' and validate.ts 'Empty
  // means nothing was named and nothing is kept: null'. C0 controls and DEL do; the 32 other controls (C1,
  // U+0080–U+009F, among them U+009B, which some terminals take as the start of an escape sequence, and U+0085)
  // pass unchanged, and so do bidi overrides (U+202E) and the invisible characters. A need of nothing but U+200B
  // is kept, counted and shown in the count as an app; it reads as empty. The founder is told to read them with
  // `psql -c 'select named_on, body from needs'` (the down migration's header). validDisplayName in the same
  // file already refuses `\p{Default_Ignorable_Code_Point}` and `\p{Bidi_Control}`
  it("DEFECT (LOW): validNeed passes C1 control characters and bidi overrides, and keeps a need made only of invisible characters, against SPEC §18.23 and its own comment", () => {
    // Changed after round one (H8): SPEC §18.23 now says every control character (C0 and C1), the bidi controls and nothing a reader could see.
    expect(record("apps/web/SPEC.md")).toContain("every control character (C0 and C1) and run of white space becomes a single space, the bidi controls are dropped, a need of nothing a reader could see is null");
    expect(validNeed("a\u0007b\u007fc\u001bd")).toBe("a b c d");
    expect(validNeed("  Messenger\n\n and   WhatsApp\t")).toBe("Messenger and WhatsApp");
    expect(read("src/core/validate.ts")).toContain("FORMAT_CHARACTERS = /(?![\\uFE0E\\uFE0F])[\\p{Default_Ignorable_Code_Point}\\p{Bidi_Control}]/u;");

    const kept = (text: string): string | null => {
      try {
        return validNeed(text);
      } catch {
        return null;
      }
    };
    const odd = ["a\u009b31mb", "a\u009d0;titlel\u009cb", "a\u0085b", "app \u202eelpmaxe\u202c"];
    const passedThrough = odd.filter((text) => kept(text) === text.replace(/\s+/g, " "));
    const keptAsEmpty = ["\u200b", "\u200b\u200b", "\u3164", "\u00ad", "\u200e"].filter((text) => kept(text) !== null);

    // The defect: controls that pass, and "nothing" that is kept.
    expect({ passedThrough, keptAsEmpty }).toEqual({ passedThrough: [], keptAsEmpty: [] });
  });

  // Finding. Evidence and reasoning:
  // D-0024 says the line under the headline is made of sentences that already exist, and P-0017 says it is one
  // sentence; the build uses neither. D-0024 §A: 'these are the last two sentences of the front door's existing
  // description, already held to D-0020 §F', door.ts: '`DOOR_LEDE`'s last two sentences', and the build 'claims
  // no more than they do'. DOOR_LEDE ends 'Starting with a friends feed. Building toward much more.'; the line
  // is 'It starts with a friends feed. Building toward much more.' (the first is the notes' words, rephrased
  // from a plan to a fact). P-0017, 'What is proposed' 1: 'one line ("It starts with a friends feed.")', and its
  // open item 3: D-0024 'chose the shortest true ones'; the shortest is the one sentence the card carries, and
  // the first screen adds 'Building toward much more.', the one clause of the three that promises
  // Changed after round one (H9). D-0024 stays as it is; D-0025 §F gives the account that is true: the line is a
  // rephrasing of DOOR_LEDE's last two sentences ("Starting with" turned into "It starts with"), P-0017 proposed
  // the one sentence, and which the founder wants is theirs to choose
  it("fixed (LOW): D-0025 says the first screen's line is a rephrasing of the existing description's last two sentences, not those sentences, and says where P-0017 proposed one (D-0024's account is amended, not repeated)", () => {
    expect(record("decisions/D-0024.md")).toContain("these are the last two sentences of the front door's existing description, already held to D-0020 §F");
    expect(DOOR_START).toBe("It starts with a friends feed. Building toward much more.");
    expect(record("proposals/P-0017.md")).toContain('one line ("It starts with a friends feed.")');

    const d25 = record("decisions/D-0025.md");
    expect(d25).toContain("They are a rephrasing of them");
    expect(d25).toContain('DOOR_LEDE ends "Starting with a friends feed. Building toward much more."');
    expect(d25).toContain('reads "It starts with a friends feed. Building toward much more."');
    expect(d25).toContain('P-0017 proposed the one sentence "It starts with a friends feed."');
    expect(record("apps/web/SPEC.md").slice(record("apps/web/SPEC.md").indexOf("### 18.23"))).toContain("a rephrasing of DOOR_LEDE's last two sentences");
    // The code's own comment no longer calls them "the last two sentences" without saying it rephrases them.
    expect(flat(read("src/components/public/door.ts"))).toContain("said as the first screen's own");
    expect(DOOR_LEDE.endsWith("Starting with a friends feed. Building toward much more.")).toBe(true);
  });

  // Finding. Evidence and reasoning:
  // D-0024 says every choice the notes left open is marked '(agent's choice)' in it, and three of the build's
  // are not. D-0024's preface: 'Where the notes leave a choice open, this record makes the choice that says
  // least and promises least, and marks it "(agent's choice)".' D-0024.yaml's dissent_note lists eight, 'Each
  // choice the notes left open is marked "(agent's choice)" in the decision', and the receipt lists nine under
  // 'What the notes left open (D-0024; each is the founder's to confirm)'. The decision marks six. Unmarked: the
  // one-form rule (§A: 'There is one form on the page'), the link card's look (§E: the image's design and its
  // description), and, in neither the marked nor the unmarked, any mention at all: a need that holds an email
  // address is refused (receipt item 6; SPEC §18.23; validNeed), a rule that decides who may answer and in what
  // words, which D-0024 §B never says. The founder who is told to confirm D-0024's choices is shown fewer than
  // were made
  // Changed after round one (H10). D-0024 is left as it stands, with its six marks; D-0025 §D lists the three it
  // left out and marks them "agent's choice", and says each is the founder's to confirm: the one-form rule, the
  // link card's look, and the refusal of an email address in a need
  it("fixed (MEDIUM): D-0025 marks the three choices D-0024 left unmarked or unmentioned (the one form, the link card's look, refusing an email address in a need) as the agent's choices, for the founder to confirm", () => {
    const yaml = record("decisions/D-0024.yaml");
    expect(yaml).toContain("is marked \"(agent's choice)\" in the decision");
    const raw = readRoot("decisions/D-0024.md");
    // D-0024 itself is as it was: six marks besides the preface's own, and the three still unmarked there.
    expect([...raw.matchAll(/\(agent's choice/g)]).toHaveLength(7);
    const paragraphs = raw.split(/\n\s*\n/);
    const marked = (anchor: string) => /\(agent's choice/.test(paragraphs.find((p) => p.includes(anchor)) ?? "");
    expect(marked("There is one form on the page.")).toBe(false);
    expect(marked("The image is made by `scripts/card.ts`")).toBe(false);

    const d25 = record("decisions/D-0025.md");
    expect(d25).toContain('D-0024\'s preface says every choice the notes left open is marked "(agent\'s choice)"; three were not. They are agent\'s choices, and they are the founder\'s to confirm:');
    for (const choice of ["One form on the page.", "The link card's look and words:", "An email address in a need is refused,"]) {
      expect(d25, choice).toContain(choice);
    }
    // The refusal is no longer in nothing but the code: the decision that records it says who may answer and in what words.
    expect(d25).toContain("it decides who may answer and in what words");
    expect(flat(readRoot("decisions/D-0025.yaml"))).toContain("the choices of section D");
  });

  // Finding. Evidence and reasoning:
  // between a push to main and the release that applies 0003_needs, /privacy says something the site doesn't do.
  // The build keeps the form honest in that window (no question, no count: 'the form asks for the address
  // alone', tested with the table dropped), but /privacy and the manifest are the same on both sides of the
  // migration: 'They are counted on the front page, and nothing else shows them.' is false while the table isn't
  // there, and while none has been named. D-0020 §F: 'A status stays true on the deployed site and off it'; the
  // receipt: 'Until then the site runs this code on the old schema'. Production applies migrations only in a
  // release build the founder names, so the window is the founder's to leave open, and nothing on /privacy says
  // the question isn't asked yet
  it("DEFECT (LOW): between a push to main and the migration, /privacy says the words are counted on the front page, where there is no count", async () => {
    expect(record("decisions/D-0020.md")).toContain("A status stays true on the deployed site and off it.");
    expect(record("receipts/builds/2026-10-05-M-0021.md")).toContain("Until then the site runs this code on the old schema, and the form asks for the address alone");
    await maintainer();
    await db().execute(sql`drop table needs`);
    let claimsACount = false;
    let doorShowsOne = true;
    let doorAsks = true;
    try {
      const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
      claimsACount = privacy.includes("They are counted on the front page");
      const html = await door();
      doorAsks = html.includes('name="need"');
      doorShowsOne = /apps? named so far/.test(textOf(html));
    } finally {
      await db().execute(sql.raw(TABLE_SQL()));
    }
    // The page is honest about the form in that window: nothing is asked and nothing is counted.
    expect([doorAsks, doorShowsOne]).toEqual([false, false]);

    // The defect: /privacy says the words are counted on the front page, where there is no count.
    expect(claimsACount && !doorShowsOne).toBe(false);
  });

  // Finding. Evidence and reasoning:
  // a new test's title promises what its body can't check. needs.test.ts 'is kept the same for every address:
  // one with an account, one in line, one new, and each gets the same answer' collects `answers` from
  // `requestSeat`, which resolves to nothing for every request, and asserts them `[undefined, undefined,
  // undefined]`: that holds whatever the three requests did, so 'the same answer' is not tested there (the rows
  // it also asserts are). The answer is `takeSeat`'s, and none of the tests the build added calls it for an
  // address with an account or one in line (seat-actions.test.ts, older, does, with no need)
  // Changed after round one (H12). The test now asks `takeSeat`, which is what answers, for the three address
  // states and compares what each is told; the void results of `requestSeat` are no longer what it asserts
  it("fixed (LOW): needs.test.ts 'each gets the same answer' asks takeSeat for the answer of an address with an account, one in line and a new one, so it can fail on the answer", async () => {
    const source = read("tests/needs.test.ts");
    const title = "is kept the same for every address: one with an account, one in line, one new, and each is told the same by takeSeat";
    const at0 = source.indexOf(title);
    expect(at0).toBeGreaterThan(0);
    const body = source.slice(at0, source.indexOf("\n  it(", at0));
    expect(body).toContain("takeSeat(null");
    expect(body).not.toContain("expect(answers).toEqual([undefined, undefined, undefined]);");

    // requestSeat has nothing to answer with; takeSeat does.
    await maintainer();
    const answered = await ask("kira_f@example.test", "Messenger", 1);
    expect(answered).toBeUndefined();
    expect(body).toContain("{ ok: true }");
  });

});

/* --------------------------------------------------------------- closed */

describe("closed (each passes on 01d5d9f)", () => {
  // Closed. Evidence and reasoning:
  // 0003_needs applies on a fresh database through the repo's migrator, its down migration, run as its header
  // says in one transaction, drops the table and forgets that it ran, and the migrator then applies it again;
  // the journal and snapshot agree with schema.ts (`drizzle-kit generate` has nothing to add)
  it("closed: 0003_needs migrates a fresh database, its down migration (one transaction) undoes it, the migrator applies it again, and drizzle-kit generate has nothing to add", async () => {
    const admin = process.env.TEST_DATABASE_ADMIN_URL ?? "postgresql://localhost:5432/postgres";
    const name = `ours_web_test_${randomBytes(6).toString("hex")}`;
    const url = new URL(admin);
    url.pathname = `/${name}`;
    const adminClient = new pg.Client({ connectionString: admin });
    await adminClient.connect();
    await adminClient.query(`create database "${name}"`);
    const client = new pg.Client({ connectionString: url.toString() });
    try {
      await migrateUrl(url.toString());
      await client.connect();
      const migrations = async () => (await client.query("select created_at::text as at from drizzle.__drizzle_migrations order by created_at")).rows.map((r) => r.at as string);
      const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: { tag: string; when: number }[] };
      const entry = journal.entries.find((e) => e.tag === "0003_needs")!;
      expect(journal.entries.map((e) => e.tag)).toEqual(["0000_foundation", "0001_verification_fixes", "0002_seats", "0003_needs"]);
      expect(await migrations()).toHaveLength(4);
      expect((await migrations()).at(-1)).toBe(String(entry.when));
      await client.query("insert into needs (body) values ('Zorbulon FICTIONAL')");
      expect((await client.query("select count(*)::int as n from needs")).rows[0].n).toBe(1);

      // The header's command, `psql --single-transaction -f`: one transaction around the file.
      await client.query("begin");
      await client.query(read("drizzle/down/0003_needs.sql"));
      await client.query("commit");
      expect((await client.query("select to_regclass('public.needs')::text as t")).rows[0].t).toBeNull();
      expect(await migrations()).toHaveLength(3);
      // Nothing else was touched: the other tables are all still there.
      expect((await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows[0].n).toBe(21);

      await migrateUrl(url.toString());
      expect((await client.query("select to_regclass('public.needs')::text as t")).rows[0].t).toBe("needs");
      expect((await client.query("select count(*)::int as n from needs")).rows[0].n).toBe(0);
      expect(await migrations()).toHaveLength(4);
      // The check constraint came back with it.
      await expect(client.query("insert into needs (body) values ('')")).rejects.toThrow();
    } finally {
      await client.end().catch(() => undefined);
      await adminClient.query(`drop database if exists "${name}" with (force)`);
      await adminClient.end();
    }

    // `drizzle-kit generate`, into a copy of the migrations folder: nothing new.
    const dir = mkdtempSync(join(tmpdir(), "our-one-dk-"));
    try {
      cpSync(join(WEB, "drizzle"), join(dir, "out"), { recursive: true });
      writeFileSync(join(dir, "drizzle.config.mjs"), `export default { dialect: "postgresql", schema: ${JSON.stringify(join(WEB, "src/core/schema.ts"))}, out: "./out", strict: true };\n`);
      const run = spawnSync(join(WEB, "node_modules/.bin/drizzle-kit"), ["generate", "--config", "./drizzle.config.mjs"], { cwd: dir, encoding: "utf8", timeout: 120_000 });
      expect(`${run.stdout}${run.stderr}`).toContain("No schema changes, nothing to migrate");
      expect(readdirSync(join(dir, "out")).sort()).toEqual(readdirSync(join(WEB, "drizzle")).sort());
      expect(readdirSync(join(dir, "out/meta")).sort()).toEqual(readdirSync(join(WEB, "drizzle/meta")).sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  // Closed. Evidence and reasoning:
  // the 140-character limit holds in the code and in the database, counted as characters (code points) in both:
  // 140 are kept, 141 are refused by the code with the words the field shows and by the database's own check,
  // and the empty string is refused by the database
  it("closed: the 140-character limit holds in the code and in the database, counted in characters", async () => {
    expect(LIMITS.needMax).toBe(140);
    // 140 emoji are 280 UTF-16 units and 560 bytes: the limit is in characters.
    expect("😀".repeat(140).length).toBe(280);
    expect(validNeed("😀".repeat(140))).toBe("😀".repeat(140));
    expect(() => validNeed("😀".repeat(141))).toThrow(NEED_TOO_LONG);
    expect(() => validNeed("é".repeat(70) + "e")).toThrow(NEED_TOO_LONG);

    await db().execute(sql`insert into needs (body) values (${"😀".repeat(140)})`);
    await expect(db().execute(sql`insert into needs (body) values (${"😀".repeat(141)})`)).rejects.toThrow();
    await expect(db().execute(sql`insert into needs (body) values ('')`)).rejects.toThrow();
    expect(await needCount(db())).toBe(1);
  });

  // Closed. Evidence and reasoning:
  // what is typed is kept as typed and never read as anything else: right-to-left text, emoji joined with ZWJ,
  // combining marks, a 140-character word, SQL, markup and a lone surrogate all go in, come out the same (the
  // surrogate as U+FFFD, as any UTF-8 driver sends it), the table survives, and a NUL or an ESC becomes a space
  it("closed: typed words are kept as typed (right-to-left text, emoji, combining marks, SQL, markup, NUL, ESC) and never read as anything else", async () => {
    await maintainer();
    const kept = [
      "تطبيق المراسلة",
      "👨\u200d👩\u200d👧\u200d👦 family photos",
      "Café app",
      "x".repeat(140),
      "'); drop table needs; --",
      "<script>alert(1)</script>",
      "a\u0000b\u001b[31mc",
    ];
    for (const [i, need] of kept.entries()) await ask(`u${i}_f@example.test`, need, 40 + i, i);
    await ask("u9_f@example.test", "ab\ud800cd", 49, 9);
    const bodies = (await db().select().from(needs)).map((r) => r.body).sort();
    expect(bodies).toEqual([...kept.map((k) => k.replace(/[\u0000-\u001F]/g, " ")), "ab�cd"].sort());
    expect(await needCount(db())).toBe(8);
  });

  // Closed. Evidence and reasoning:
  // the words reach no page: stored with markup in them, the front door and /feed's HTML hold none of it, and
  // what is put back into the form after a refusal is escaped
  it("closed: the words reach no page, are escaped when put back after a refusal, and nothing in the app reads, changes or deletes them", async () => {
    await maintainer();
    const markup = '"><script>alert("Zorbulon")</script>';
    await recordNeed(db(), markup, t0);
    await recordNeed(db(), "Zorbulon photo sharing FICTIONAL", t0);
    for (const html of [await door(), await feedPage(), await full(createElement(FrontDoor, { joining: true, email: null, count: 3, needs: 2, seatsOpen: 1, seatsWaiting: 0 }))]) {
      expect(html).not.toContain("Zorbulon");
      expect(html).not.toContain("alert(");
    }
    // Changed after round one (H3): the line counts answers, and says so ("2 answers so far.").
    expect(textOf(await door())).toContain("2 answers so far.");
    // The refusal's put-back values: through GetInFormView's markup, escaped.
    const { GetInFormView } = await import("@/components/public/GetInForm");
    const refused = renderToStaticMarkup(
      createElement(GetInFormView, {
        state: { error: NEED_HAS_ADDRESS, field: "need" },
        action: () => {},
        pending: false,
        need: true,
        values: { email: "mara_f@example.test", need: markup },
      }),
    );
    expect(refused).toContain("mara_f@example.test");
    // (React's own form-replay script is in the markup; the typed one must not be.)
    expect(refused).not.toContain("<script>alert");
    expect(refused).toContain("&lt;script&gt;alert(");
    // Nothing in the app reads the words: the table is imported by core/needs.ts alone, and that file selects only a count.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(WEB, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(WEB, rel)).isDirectory()) walk(rel);
        else if (/\.(?:ts|tsx)$/.test(name) && /import\s*\{[^}]*\bneeds\b[^}]*\}\s*from\s*["'](?:\.\/|@\/core\/)schema["']/.test(read(rel))) importers.push(rel);
      }
    };
    for (const dir of ["src", "scripts"]) walk(dir);
    expect(importers).toEqual(["src/core/needs.ts"]);
    const core = read("src/core/needs.ts");
    expect(core.match(/\.select\(/g)).toHaveLength(1);
    expect(core).toContain("db.select({ n: count() }).from(needs)");
    // And nothing changes or deletes one, so what the hint says to a visitor ('can't be changed or deleted later') is true of the app.
    expect(core.match(/\.insert\(/g)).toHaveLength(1);
    expect(core).not.toMatch(/\.update\(|\.delete\(|\btruncate\b|\bdelete from\b/i);
  });

  // Closed. Evidence and reasoning:
  // a request with a need adds one row to one table and nothing else, for an address with an account, one in
  // line and a new one, with seats shut and with seats open; the one answer is the same for all three; and
  // neither the log nor any table other than needs holds the words or the address next to them
  it("closed: a need adds one row to one table for an address with an account, in line or new, with seats shut or open; the log and every other table hold neither the words nor the address with them", async () => {
    const run = async (withNeed: boolean, seatsOpen: number) => {
      await reset();
      web.later.length = 0;
      await maintainer();
      await makeAccount({ email: "ines_f@example.test", handle: "ines_fict" });
      await db().execute(sql`insert into waitlist (email, created_at) values ('jonas_f@example.test', ${at("2026-10-01T00:00:00Z").toISOString()})`);
      if (seatsOpen > 0) await db().execute(sql`insert into seat_state (id, open) values ('seats', ${seatsOpen})`);
      const logged = captureConsole();
      const answers: unknown[] = [];
      for (const [i, email] of ["ines_f@example.test", "jonas_f@example.test", "kira_f@example.test"].entries()) {
        web.headers.set("x-forwarded-for", `203.0.113.${60 + i}`);
        const fields: Record<string, string> = { email };
        if (withNeed) fields.need = `Zorbulon marker ${i} FICTIONAL`;
        answers.push(await actual(null, form(fields)));
      }
      await afterTheResponse();
      const out = { answers, counts: await counts(), logged: logged(), holding: withNeed ? await tablesHolding("Zorbulon marker") : [] };
      vi.restoreAllMocks();
      return out;
    };
    for (const seatsOpen of [0, 5]) {
      const without = await run(false, seatsOpen);
      const withIt = await run(true, seatsOpen);
      const diff = Object.fromEntries(Object.entries(withIt.counts).filter(([table, n]) => n !== without.counts[table]));
      expect(diff, `seats open ${seatsOpen}`).toEqual({ needs: 3 });
      expect(withIt.answers).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
      expect(without.answers).toEqual(withIt.answers);
      expect(withIt.holding).toEqual(["needs"]);
      for (const text of [withIt.logged, without.logged]) {
        expect(text).not.toContain("Zorbulon");
        expect(text).not.toContain("example.test");
        expect(text).not.toContain("kira_f");
      }
    }
  });

  // Closed. Evidence and reasoning:
  // a request that is refused keeps nothing and counts nothing, by the action a visitor's form calls: joining
  // closed, an address that isn't one, a need that is too long, a need that holds an address, and a fourth
  // request in the hour for one address (which is refused in the limit's words, with its need not kept)
  it("closed: a refused request keeps and counts nothing (joining closed, a bad address, a bad need, a rate limit)", async () => {
    await maintainer();
    web.headers.set("x-forwarded-for", "203.0.113.70");

    // Too long, or an address in it: refused at the need's field, nothing counted (not even a limit).
    // Changed after round one (H5, R4): a refusal now carries what was typed (`values`), which the form puts back;
    // the rest of each answer is as it was.
    expect(await actual(null, form({ email: "mara_f@example.test", need: "x".repeat(141) }))).toEqual({
      error: NEED_TOO_LONG,
      field: "need",
      values: { email: "mara_f@example.test", need: "x".repeat(141) },
    });
    expect(await actual(null, form({ email: "mara_f@example.test", need: "write to mara_f@example.test" }))).toEqual({
      error: NEED_HAS_ADDRESS,
      field: "need",
      values: { email: "mara_f@example.test", need: "write to mara_f@example.test" },
    });
    // An address that isn't one: refused at the address.
    const bad = await actual(null, form({ email: "not an address", need: "Messenger" }));
    expect("error" in bad && bad.field).toBeFalsy();
    expect(await needCount(db())).toBe(0);
    expect((await counts()).rate_events).toBe(0);

    // The fourth in the hour for one address.
    for (const n of [1, 2, 3]) {
      web.headers.set("x-forwarded-for", `203.0.113.${70 + n}`);
      expect(await actual(null, form({ email: "mara_f@example.test", need: `app ${n}` }))).toEqual({ ok: true });
    }
    await afterTheResponse();
    expect(await needCount(db())).toBe(3);
    web.headers.set("x-forwarded-for", "203.0.113.80");
    const limited = await actual(null, form({ email: "mara_f@example.test", need: "a fourth" }));
    expect("error" in limited && limited.error).toBe("You've done that too many times. Try again later.");
    expect((await db().select().from(needs)).map((r) => r.body)).not.toContain("a fourth");

    // Joining closed: no controller named.
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    expect(await actual(null, form({ email: "noor_f@example.test", need: "Messenger" }))).toEqual({
      error: "Joining opens soon.",
      values: { email: "noor_f@example.test", need: "Messenger" },
    });
    expect(await needCount(db())).toBe(3);
  });

  // Closed. Evidence and reasoning:
  // a need that can't be kept never refuses the seat: with the table gone (a release before its migration) the
  // action still answers the one answer, the address is still taken in line, the log names the cause by its code
  // and holds neither the words nor the address; and the front door then asks for the address alone, with no
  // question and no count of named apps
  it("closed: a need that can't be kept (table missing) never refuses the seat, and the front door then asks for the address alone", async () => {
    await maintainer();
    web.headers.set("x-forwarded-for", "203.0.113.90");
    const logged = captureConsole();
    await db().execute(sql`drop table needs`);
    try {
      expect(await actual(null, form({ email: "mara_f@example.test", need: "Private words FICTIONAL" }))).toEqual({ ok: true });
      await afterTheResponse();
      expect((await db().execute(sql`select email from waitlist`)).rows).toEqual([{ email: "mara_f@example.test" }]);
      const html = await door();
      expect(html).toContain('name="email"');
      expect(html).not.toContain('name="need"');
      expect(textOf(html)).not.toContain(NEED_LABEL);
      expect(textOf(html)).not.toMatch(/apps? named so far/);
      expect(textOf(firstScreen(html))).toContain(DOOR_STATUS);
    } finally {
      await db().execute(sql.raw(TABLE_SQL()));
    }
    const text = logged();
    expect(text).toContain("a named app was not kept");
    expect(text).toContain("42P01");
    expect(text).not.toContain("Private words");
    expect(text).not.toContain("mara_f");
    expect(text).not.toContain("example.test");
  });

  // Closed. Evidence and reasoning:
  // with the database down the front door and /feed still render, with the question not offered and no count
  // anywhere, and the log names each failure by its error's name, never its message
  it("closed: with the database down the front door and /feed render, with no question and no count, and the log holds names only", async () => {
    const logged = captureConsole();
    vi.stubEnv("DATABASE_URL", "postgresql://root@127.0.0.1:1/ours_down_fictional");
    const html = await door();
    const feed = await feedPage();
    const text = textOf(html);
    expect(html).toContain('name="email"');
    expect(html).not.toContain('name="need"');
    expect(text).not.toMatch(/apps? named so far|of 100,000 people are in/);
    expect(text).toContain(DOOR_START);
    expect(textOf(feed)).toContain("Rado, maintainer");
    const lines = logged();
    expect(lines).toContain("the number of named apps could not be read");
    expect(lines).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|ours_down_fictional/);
  });

  // Closed. Evidence and reasoning:
  // the first screen is, for a visitor, in the order the mandate names (headline, line, count against 100,000,
  // the pledge, the status line, one form), with one email field and one form on the page and no entrance
  // buttons; for a member 'You're in.' stands in the form's place and the panel beside the feed says 'N of
  // 100,000 people are in.'; and no sentence the build added says a named app will be built, is wanted, or gives
  // a say
  it("closed: the first screen is in the mandate's order with one form and one email field; a member sees 'You're in.' and the panel's count; no added sentence promises, implies demand or a say", async () => {
    await maintainer();
    for (let i = 0; i < 2; i++) await makeAccount({ handle: `p${i}_fict` });
    const html = await door();
    const text = textOf(firstScreen(html));
    const parts = [DOOR_HEADLINE[0], DOOR_START, progressLine(3), "When 100,000 people have joined, I hand over its domain", "Rado, maintainer", DOOR_STATUS, "Your email", NEED_LABEL];
    const found = parts.map((p) => text.indexOf(p));
    expect(found.every((i) => i >= 0), JSON.stringify(parts.map((p, i) => [p, found[i]]))).toBe(true);
    expect(found).toEqual([...found].sort((a, b) => a - b));
    expect(html.match(/name="email"/g)).toHaveLength(1);
    expect(html.match(/type="email"/g)).toHaveLength(1);
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(text).not.toMatch(/I want this to exist|I want to build/);

    web.member = true;
    const member = await door();
    expect(textOf(firstScreen(member))).toContain("You're in.");
    expect(member).not.toContain("<form");
    expect(textOf(renderToStaticMarkup(createElement(OursCard, { email: null, count: 3 })))).toContain("3 of 100,000 people are in.");
    let panelCount: unknown = "not found";
    walk((await AppLayoutRoute({ children: null })) as ReactElement, (element) => {
      const props = element.props as { count?: unknown; invitesRemaining?: unknown };
      if (props.invitesRemaining !== undefined && "count" in props) panelCount = props.count;
    });
    expect(panelCount).toBe(3);

    // What the build added says nothing of demand, a say, or being built (D-0024's prohibitions).
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const named = privacy.slice(privacy.indexOf("Named apps"), privacy.indexOf("Named apps") + 700);
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string; why: string; kept: string }[] } };
    const entry = manifest.data.collects.find((c) => c.what.startsWith("Named apps"))!;
    const added = [NEED_LABEL, NEED_HINT, needsLine(1), needsLine(12), progressLine(12), NEED_TOO_LONG, NEED_HAS_ADDRESS, named, entry.what, entry.why, entry.kept].join(" ");
    expect(added).not.toMatch(/will be built|we(?:'ll| will) (?:build|make)|people want|wanted by|demand|have a say|get a say|your vote|vote on|you decide|promise/i);
  });

  // Closed. Evidence and reasoning:
  // the manifest's Named apps and /privacy's say the same words, field for field, and the manifest says where
  // 'Named apps' belongs among the schema's tables
  it("closed: the manifest's Named apps and /privacy's say the same words, field for field", () => {
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string; why: string; kept: string }[] } };
    const entry = manifest.data.collects.find((c) => c.what.startsWith("Named apps"))!;
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const [title, ...rest] = entry.what.split(": ");
    expect(title).toBe("Named apps");
    for (const words of [rest.join(": "), entry.why, entry.kept]) expect(privacy).toContain(words);
    expect(manifest.data.collects.at(-2)?.what.startsWith("Named apps")).toBe(true);
    expect(manifest.data.collects.at(-1)?.what.startsWith("Seat requests")).toBe(true);
  });

  // Closed. Evidence and reasoning:
  // the claims scan's new listing is exact and goes no further: FrontDoor.tsx has the pledge's one sentence in
  // its two forms and the same two as /feed's file, a changed word in it is flagged, nothing else about the
  // handover is let through there, and no file imports FrontDoor but the front door's route, by any path
  it("closed: the claims scan's listing for FrontDoor.tsx is exact and reachable from the front door's route only", () => {
    const listed = (file: string) => ALLOWLIST.filter((e) => e.file === file).map((e) => e.sentence);
    const pledge = "When 100,000 people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.";
    expect(listed("src/components/public/FrontDoor.tsx")).toEqual(["When {THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.", pledge]);
    for (const sentence of listed("src/components/public/FrontDoor.tsx")) expect(listed("src/components/public/FrontPage.tsx")).toContain(sentence);
    expect(ALLOWLIST).toHaveLength(19);
    const door = "src/components/public/FrontDoor.tsx";
    expect(scanText(pledge, door)).toEqual([]);
    expect(scanText(`${pledge} Until then, I hold all three.`, door)).toEqual([]);
    expect(scanText(pledge.replace(/\.$/, ", and they own it."), door).length).toBeGreaterThan(0);
    expect(scanText(pledge.replace("I hand over", "we hand over"), door).length).toBeGreaterThan(0);
    expect(scanText(pledge.replace("100,000", "10,000"), door).length).toBeGreaterThan(0);
    expect(scanText(pledge, "src/components/public/join.ts").length).toBeGreaterThan(0);
    expect(scanText(pledge, null).length).toBeGreaterThan(0);
    // Importers, by an alias, a relative path or a dynamic import.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(WEB, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(WEB, rel)).isDirectory()) walk(rel);
        else if (/\.(?:ts|tsx)$/.test(name) && rel !== door && /["'](?:[^"']*\/)?FrontDoor["']/.test(read(rel))) importers.push(rel);
      }
    };
    for (const dir of ["src", "scripts"]) walk(dir);
    expect(importers).toEqual(["src/app/(public)/page.tsx"]);
  });

  // Closed. Evidence and reasoning:
  // the root layout imports nothing from the core, directly or through anything it imports; the public layout
  // reads no database and imports only the core's config; no public page sets a card of its own; and the card's
  // image is the PNG the metadata names, 1200 × 630, of the headline
  it("closed: the root layout imports nothing from the core, no public page sets a card of its own, and the card's image is the 1200 × 630 PNG the metadata names", () => {
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? join(dirname(from), spec).replace(/\\/g, "/") : null;
      if (base === null) return null;
      for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
        if (existsSync(join(WEB, candidate)) && statSync(join(WEB, candidate)).isFile()) return candidate;
      }
      return null;
    };
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      if (!/\.(?:ts|tsx)$/.test(file)) return;
      for (const m of read(file).matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
        const next = resolve(file, (m[1] ?? m[2])!);
        if (next) visit(next);
      }
    };
    visit("src/app/layout.tsx");
    expect([...seen].filter((f) => f.startsWith("src/core/"))).toEqual([]);

    const publicLayout = read("src/app/(public)/layout.tsx");
    expect(publicLayout).not.toMatch(/getDb|drizzle|from "pg"/);
    expect(publicLayout.match(/@\/core\/[a-z-]+/g)).toEqual(["@/core/config"]);
    const own: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(WEB, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(WEB, rel)).isDirectory()) walk(rel);
        else if (/\.(?:ts|tsx)$/.test(name) && rel !== "src/app/(public)/layout.tsx" && /openGraph|twitter\s*:/.test(read(rel))) own.push(rel);
      }
    };
    walk("src/app/(public)");
    expect(own).toEqual([]);

    const meta = generateMetadata() as { openGraph: { images: { url: string; width: number; height: number }[] } };
    expect(meta.openGraph.images[0]).toMatchObject({ url: CARD.path, width: 1200, height: 630 });
    const png = readFileSync(join(WEB, "public", CARD.path.slice(1)));
    // Changed after round one (R6): the card was drawn again with the site's own wordmark (the rust dot), so it
    // weighs 48,853 bytes where it weighed 48,428; its size in pixels is the same.
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png.length]).toEqual([1200, 630, 48853]);
    expect(DOOR_HEADLINE.join(" ")).toBe("The software we live in should be ours.");
  });

  // Closed. Evidence and reasoning:
  // the receipt's numbers and statuses that can be measured here hold: 179 files and 19 sentences in the claims
  // scan, the kit's check READY TO PROPOSE, `ours check M-0021` AUTHORISED, 15 screens, 17 older test files
  // adapted each with 'Changed under M-0021' and none with a skip, an only or a todo, no adapted file with fewer
  // assertions than before, 68 test files before this one, and TESTED locally with nothing pushed claimed for
  // the build
  it("closed: the receipt's measurable numbers hold (179 files, 19 sentences, 15 screens, 17 adapted tests, 68 test files before this one, READY TO PROPOSE, AUTHORISED)", () => {
    const scan = spawnSync(join(WEB, "node_modules/.bin/tsx"), ["scripts/claims-scan.ts"], { cwd: WEB, encoding: "utf8", timeout: 120_000 });
    expect(scan.stdout).toContain("no prohibited claim in 179 files (19 allowlisted sentence(s))");
    expect(ALLOWLIST).toHaveLength(19);

    // Run with none of this process's settings (no DATABASE_URL, no secrets), as `env -i` would.
    const bare = { PATH: process.env.PATH ?? "", NODE_ENV: "test" } as NodeJS.ProcessEnv;
    const kit = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], { cwd: ROOT, encoding: "utf8", env: bare, timeout: 120_000 });
    expect(kit.stdout).toContain("RESULT: READY TO PROPOSE.");

    const ours = spawnSync(process.execPath, ["packages/cli/src/main.ts", "check", "M-0021"], { cwd: ROOT, encoding: "utf8", env: bare, timeout: 120_000 });
    expect(ours.stdout).toContain("RESULT: AUTHORISED FOR EXECUTION");

    expect(readdirSync(join(ROOT, "receipts/builds/2026-10-05-M-0021-screens"))).toHaveLength(15);
    expect(readdirSync(join(WEB, "tests")).filter((f) => f.endsWith(".test.ts") && f !== "verify-m0021-honesty.test.ts" && !f.startsWith("verify-m0021-"))).toHaveLength(68);

    const adapted = git(["diff", "--name-only", "ac38742", "01d5d9f", "--", "apps/web/tests"])
      .trim()
      .split("\n")
      .filter((f) => !/first-screen|needs\.test/.test(f));
    expect(adapted).toHaveLength(17);
    const count = (s: string) => (s.match(/expect\(/g) ?? []).length;
    for (const f of adapted) {
      const plus = git(["diff", "--unified=0", "ac38742", "01d5d9f", "--", f]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      expect(plus.some((l) => /(?:Changed|Added|changed|added) under M-0021/.test(l)), f).toBe(true);
      expect(plus.filter((l) => /\.(?:skip|todo|only)\(|skipIf|runIf/.test(l)), f).toEqual([]);
      expect(count(git(["show", `01d5d9f:${f}`])), f).toBeGreaterThanOrEqual(count(git(["show", `ac38742:${f}`])));
    }
    const receipt = record("receipts/builds/2026-10-05-M-0021.md");
    expect(receipt).toContain("Status: TESTED locally, before the independent verification.");
    expect([...receipt.matchAll(/\| ([^|]+) \| (ENFORCED|CHECKED|STRUCTURAL|INTERPRETED|DECLARED) \|/g)].filter((m) => m[2] === "ENFORCED").map((m) => m[1]!.trim())).toEqual(["R-SCOPE"]);
  }, 180_000);

  // Closed. Evidence and reasoning:
  // the records say truthfully what they are: P-0017, D-0024, M-0021 and the receipt each say this is a second
  // draft or a rebuild after a build lost unpushed, the evidence file labels the pasted notes as not the
  // founder's words and not authority, the lost commit e1fc284 is in no object of this repository, D-0024 marks
  // six choices '(agent's choice' beside the sentences they concern (which choices it leaves unmarked is the
  // defect above), and the founder's review of the exact wording is PENDING in D-0024 and not claimed as done
  // anywhere
  it("closed: the records say truthfully that this is a second draft after a lost build, label the notes as not authority, and leave the founder's review PENDING", () => {
    for (const file of ["proposals/P-0017.md", "decisions/D-0024.md", "mandates/M-0021.md", "receipts/builds/2026-10-05-M-0021.md"]) {
      expect(record(file), file).toMatch(/second draft|a second time|rebuild|lost/i);
      expect(record(file), file).toMatch(/lost|not pushed|unpushed|None of it was pushed|none of that was pushed/i);
    }
    const evidence = record("proposals/P-0017.evidence-conversation-2026-10-05.md");
    expect(evidence).toContain("They are not the founder's words, they are not authority (AGENTS.md §4)");
    expect(evidence).toContain("every number in them");
    const lost = spawnSync("git", ["cat-file", "-t", "e1fc284"], { cwd: ROOT, encoding: "utf8" });
    expect(lost.status).not.toBe(0);
    const d0024 = record("decisions/D-0024.md");
    // The six choices D-0024 does mark, each beside the sentence it concerns (the seventh match is its own preface).
    expect(d0024.match(/\(agent's choice/g)).toHaveLength(7);
    expect(d0024).toContain("The founder's review of this exact wording is PENDING");
    expect(record("receipts/builds/2026-10-05-M-0021.md")).toContain("have not been reviewed by the founder");
    expect(record("mandates/M-0021.md")).toContain("A push to main is a deploy on this project, so building is not enough");
  });
});
