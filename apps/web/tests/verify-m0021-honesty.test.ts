/**
 * Independent verification of M-0021 (the first screen, for people who come
 * from a post; D-0024, SPEC §18.23), the honesty lens. Written by an agent
 * that built none of it, against 089cbcd (the build is e1fc284; 0376b3e holds
 * the records, and 089cbcd adds only the stopping rule). It changes no
 * product code, no record and no other test.
 *
 * What was read: AGENTS.md (§2–§12), D-0024 and its projection, M-0021 and
 * its acceptance criteria one by one, P-0017 and its evidence file, D-0012
 * §B, D-0016 §B and §C, D-0020 (§A, §E, §F and its reasons), D-0023 §C–§D;
 * SPEC §18.4, §18.19, §18.22 and §18.23; the stopping rule and, for method,
 * the M-0020 verification's receipt and its honesty tests; the build receipt
 * and its screens, committed on branch m-0021 (565efca) after this
 * worktree's base; the whole change (`git diff 0376b3e 089cbcd`, every file,
 * and `git diff ac38742 0376b3e`, the records), the three commit messages;
 * and what the change leans on: seats.ts, handover.ts, join.ts, door.ts,
 * claims.ts, needs.ts, the schema, the migration with its journal, snapshot
 * and down file, seat-actions.ts, FirstScreenForm, FrontDoor, FrontPage,
 * GetInForm, Field, RightColumn, the front door's route, the root and app
 * layouts, the privacy page, the manifest, our.one.json, scripts/card.html
 * and card.ts, config.ts, db.ts, actions.ts, request.ts, ids.ts, limits.ts,
 * tests/helpers.ts, tests/setup.ts and tests/first-screen.test.ts.
 *
 * What was rendered: the front door through its route, with a real database
 * (the suite's own, migrated by scripts/migrate.ts) in every state of the
 * count (no account, one, many with one suspended, a waiting list of 40, a
 * member, the database's port closed); FrontDoor and FirstScreenFormView in
 * each state as props; FrontPage; OursCard with and without the count; the
 * privacy page; the root metadata. The action, takeSeat, is called as
 * tests/first-screen.test.ts calls it: next/headers replaced by a header
 * map, Next's `after` by a queue this file runs by hand, and isMemberHere by
 * a flag; everything else, the gates, the rate limits, the seats and the
 * needs, is real and in the database.
 *
 * What was run, each under `env -i` with only what it needs: the whole suite
 * on 089cbcd before this file existed (67 files, 1,701 pass and 2 skipped, as
 * the receipt says of e1fc284); the claims scan (no prohibited claim in 180
 * files, 19 allowlisted sentences); the kit's check (READY TO PROPOSE, 15
 * kinds of personal data); `next build` in production mode with no
 * DATABASE_URL (passed: the build touches no database); scripts/migrate.ts
 * and scripts/seed-fictional.ts on a database made for this (ours_m0021_vh,
 * dropped afterwards); and `ours check M-0021 --changed` with this file in
 * the working tree (AUTHORISED).
 *
 * What was served: that production build, run with `next start` on
 * localhost:3741 with FICTIONAL settings (a FICTIONAL controller, a FICTIONAL
 * secret, the outbox transport, APP_URL=http://localhost:3741) and that
 * database, and a preload that refused any connection or name lookup leaving
 * the machine (its log stayed empty: none was attempted). Fetched as
 * Twitterbot/1.0, facebookexternalhit/1.1 and Slackbot-LinkExpanding 1.0: /,
 * /feed and /contract, and /card.png (image/png, 53,558 bytes, byte for byte
 * the committed file); and as a browser's user agent, / and /privacy. Then
 * the server was restarted with the database's port closed (5999) and no
 * APP_URL, and / and /feed fetched again. Nobody was signed in on it, so the
 * panel beside a member's feed was rendered here and read in the receipt's
 * screen, not served. No browser was used, so no script ran: the served HTML
 * is what a server sends.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on 089cbcd, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity: HIGH, a false or prohibited claim about authority, ownership,
 * control or status, or private data exposed (a need kept with an address,
 * or shown); MEDIUM, a stated requirement unmet, or a sentence that
 * misleads; LOW, imprecise or inconsistent wording, or polish.
 *
 * Not decided here: D-0024 §A lists what the first screen says "and nothing
 * else", and the eyebrow stands above the headline and the picture beside
 * the text, as before, which SPEC §18.23 names and the decision doesn't; the
 * order holds, so a closed check states it and leaves it to the founder.
 * Not checked here: whether four screens went to the founder, and that
 * nothing was pushed (no network was used).
 *
 * Every person, address and database here is FICTIONAL. No database address
 * with a password appears in this file; the only address it writes points
 * at a closed port on this machine.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The request this file imitates: its headers, the work Next would run after the response, and whether a member is reading. */
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
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      web.later.push(task);
    },
  };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
// Whether a member is reading, which the route asks the session; the rest of viewer.ts is real.
vi.mock("@/web/viewer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/web/viewer")>()),
  isMemberHere: async () => web.member,
}));

import { metadata as rootMetadata } from "@/app/layout";
import FeedPageRoute from "@/app/(public)/feed/page";
import FrontDoorRoute, { metadata as doorMetadata } from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import { takeSeat } from "@/app/(public)/seat-actions";
import manifest from "@/app/manifest";
import { OursCard } from "@/components/RightColumn";
import { DOOR_EYEBROW, DOOR_LEDE, DOOR_STATUS, DOOR_TITLE, DOOR_WHAT, ENTRANCES, MEMBER_JOIN, TAGLINE } from "@/components/public/door";
import { FirstScreenFormView, NEED_HINT } from "@/components/public/FirstScreenForm";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { FrontPage } from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import { FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, joinLabel, ofThreshold, WAITING_LIST_LABEL } from "@/components/public/join";
import { ALLOWLIST, publicTextFiles, scanKitText, scanRepoPublicText, scanText } from "@/core/claims";
import { HANDOVER_THRESHOLD } from "@/core/config";
import { RATE_LIMITED_MESSAGE } from "@/core/limits";
import { NEED_KEPT_MONTHS, NEED_LABEL, NEED_MAX, NEED_TOO_LONG, needsCount, needsLine, normalizeNeed } from "@/core/needs";
import { needs, outbox, rateEvents, seatState as seatRow, waitlist } from "@/core/schema";
import { SEATS_CLOSED } from "@/core/seats";
import { at, db, makeAccount, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DOOR_FILE = "src/components/public/FrontDoor.tsx";
const RECEIPT = "receipts/builds/2026-10-05-M-0021.md";
const SCREENS = "receipts/builds/2026-10-05-M-0021-screens";
/** The pledge's sentence, as D-0016 §C has it and /feed's card shows it, with the threshold filled in. */
const PLEDGE = `I'll never sell our.one. When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three.`;
/** The line under the feed's join form (D-0016 §B: "the privacy note"), on /feed and in the front door's feed panel. */
const PRIVACY_NOTE = "We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.";

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
const asRecord = (s: string) => s.replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
const record = (path: string) => asRecord(readRoot(path));

/** SPEC.md as a reader reads it. */
const spec = () => flat(read("SPEC.md")).replace(/[*`]/g, "");

/** A source file read as prose: comment markers at the start of a line dropped, whitespace collapsed. */
const prose = (rel: string) => flat(read(rel).replace(/^\s*(?:\/\*\*?|\*\/|\*(?!\/)|\/\/)[ \t]?/gm, ""));

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/**
 * A file of the build receipt's commit: from the tree when it is there, else
 * from branch m-0021, where it was committed after this worktree's base.
 */
function receiptFile(rel: string): Buffer {
  const path = join(ROOT, rel);
  if (existsSync(path)) return readFileSync(path);
  const r = spawnSync("git", ["show", `m-0021:${rel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${rel} is neither in the tree nor on branch m-0021`);
  return r.stdout;
}
const receipt = () => asRecord(receiptFile(RECEIPT).toString("utf8"));

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

const render = (component: unknown, props: object | null = null) =>
  renderToStaticMarkup(createElement(component as () => null, props));

const door = (props: Partial<FrontDoorProps> = {}) =>
  render(FrontDoor, { joining: true, email: null, count: 1, seatsOpen: 0, seatsWaiting: 0, needs: 0, ...props });

/** The front door through its route, for the request `web` describes, with the real database. */
async function route(): Promise<string> {
  return renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
}

/** The first screen's markup: the hero section. */
function hero(html: string): string {
  const start = html.indexOf('aria-labelledby="door-title"');
  const from = html.lastIndexOf("<section", start);
  return html.slice(from, html.indexOf("</section>", from) + "</section>".length);
}

/** The one <input> named so, as rendered. */
function inputTag(html: string, name: string): string {
  const tags = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`name="${name}"`));
  expect(tags, name).toHaveLength(1);
  return tags[0]!;
}

/** [text, href] of every link in the markup. */
function links(html: string): [string, string][] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [textOf(m[2]!), m[1]!]);
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runLater(): Promise<void> {
  while (web.later.length > 0) await web.later.shift()!();
}

async function maintainer() {
  return makeAccount({ handle: "rado_fict", isAdmin: true, createdAt: at("2026-01-01T00:00:00Z") });
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function storedNeeds(): Promise<string[]> {
  return (await db().select({ text: needs.text }).from(needs).orderBy(needs.createdAt, needs.id)).map((r) => r.text);
}

/** Run `fn` with DATABASE_URL pointing at a closed port on this machine, then put the suite's database back. */
async function withClosedDb<T>(fn: () => Promise<T>): Promise<T> {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost:5999/ours_nowhere_fictional");
  try {
    return await fn();
  } finally {
    vi.unstubAllEnvs();
    db();
  }
}

/** Every file under a directory of apps/web, relative to apps/web, with forward slashes. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(WEB, rel))) {
      const next = `${rel}/${name}`;
      if (statSync(join(WEB, next)).isDirectory()) walk(next);
      else out.push(next);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The older tests the build adapted: each it() whose body carries "Changed
 * under M-0021", found as a reader finds it (the nearest it( above the
 * marker, unless a describe( or a module-level line comes first).
 */
function adaptedTests(): string[] {
  const found = new Set<string>();
  for (const file of filesUnder("tests").filter((f) => f.endsWith(".test.ts") && !f.includes("verify-m0021"))) {
    const lines = read(file).split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("Changed under M-0021")) return;
      for (let i = index; i >= 0; i -= 1) {
        const l = lines[i]!;
        if (/^\s*it(?:\.\w+)?\(/.test(l)) {
          found.add(`${file}:${i + 1}`);
          return;
        }
        if (/^\s*describe\(/.test(l) || /^(?:const|function|import|export|\/\*\*|\*\/)/.test(l)) return;
      }
    });
  }
  return [...found].sort();
}

const logged = () => vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(" "));

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
  web.member = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  db();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on 089cbcd)", () => {
  it("fixed (MEDIUM): 'Not your address: nothing links a need to you.' isn't so for the one reader the records name. The need's row holds no address (true), but its time is kept to the millisecond, and the same submit writes the address with its time into the waiting list (or, with a seat open, into the join link's record) and the address's keyed hash with its time into the limits; so whoever reads the database, the founder, who D-0024 §C says reads the needs there, can match a need to the address that came with it: in a test, one need and one address, the pair is made by a one-minute window. The privacy notice (/privacy, 'Apps you name'), our.one.json's row, the schema's comment ('Nothing links it to an address'), SPEC §18.23 ('nothing links a need to one') and M-0021 ('nothing links a need to an address') all say more than the code keeps; D-0024 §C asks for 'its words, and when', so it is the sentence, or the precision of 'when', that has to give. P-0017 rejected linking needs to addresses because it 'makes the free text personal data twice over'; kept to the millisecond beside the seat request, it is", async () => {
    // Changed after the verification of M-0021 (H1): the notice, the manifest, the schema's comment and SPEC say
    // what is kept of "when": the day, not the moment. The records (M-0021.md, D-0024) are unchanged: "nothing
    // links a need to an address" there means no stored link; the founder's reading of a quiet day is recorded
    // in the verification receipt.
    const CLAIM = "Not your address: a need is kept apart from it, with the day and not the time.";
    expect(textOf(render(PrivacyPage))).toContain(CLAIM);
    expect(read("our.one.json")).toContain(CLAIM);
    expect(prose("src/core/schema.ts")).toContain("the day it was written");
    expect(spec()).toContain("kept to the day, not the moment");
    expect(record("mandates/M-0021.md")).toContain("nothing links a need to an address");
    expect(record("decisions/D-0024.md")).toContain("A need named is kept in a table of its own, without the address: its words, and when.");
    expect(record("decisions/D-0024.md")).toContain("Read by the founder.");
    expect(record("proposals/P-0017.md")).toContain("it makes the free text personal data twice over");

    // One submit from the first screen: a visitor, no seat open.
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.40");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ ok: true });
    await runLater();
    expect(await storedNeeds()).toEqual(["the calendar app"]);
    // The need's row holds no address, as the records say.
    const [need] = await db().select().from(needs);
    expect(Object.keys(need!).sort()).toEqual(["createdAt", "id", "text"]);
    expect(JSON.stringify(need)).not.toMatch(/mara|example\.test/);

    // Changed after the verification of M-0021 (H1): the address, with its time, is still in the waiting list;
    // the need's time is the day's start (UTC), so what is kept of "when" no longer pairs a need with the
    // address that came with it to the minute.
    const waiting = await db().execute(sql`select email from waitlist`);
    expect(waiting.rows).toEqual([{ email: "mara_f@example.test" }]);
    const day = await db().execute(
      sql`select (n.created_at at time zone 'UTC') = date_trunc('day', n.created_at at time zone 'UTC') as is_day from needs n`,
    );
    const keptToTheDay = (day.rows[0] as { is_day: boolean }).is_day;
    expect(keptToTheDay).toBe(true);

    // The defect: the notice says "the day and not the time" only if the time isn't kept.
    const saysDay = textOf(render(PrivacyPage)).includes("with the day and not the time");
    expect(saysDay && !keptToTheDay).toBe(false);
  });

  it("fixed (MEDIUM): the first screen's form takes the address, and the need, with no word on what is done with the address and no way to the notice from there. The feed's join form carries the privacy note under its lines ('We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.'), which D-0016 §B keeps 'unchanged', on /feed and in the feed panel two sections down the same page; the new form, which takes more than the feed's, has the seat line, the free line, the needs' count and 'Optional. Kept without your address.' for the need, and nothing for the address: not the join link, not the weekly email, not a link to /privacy, whose nearest link is the feed panel's note some 370 words below the form, inside a tab, and the footer's about 1,400 words below it (served on 3741: 1,584 words on the page, the need's field after 121, the two links after 493 and 1,552). D-0024 §C: 'The privacy notice says what is kept, why, and for how long, before the form takes anything'; and 'The seat line and the free line under it are unchanged', which names the two lines and leaves the third out. Served so on 3741 (the hero's text ends 'Free to join. You get 10 invites to bring your people. I want to build'), and so in the receipt's screen 04", () => {
    expect(record("decisions/D-0016.md")).toContain(
      "Unchanged: the answer after a valid submission (D-0015 §H); the free line; the privacy note; the two lines while joining is closed.",
    );
    expect(record("decisions/D-0024.md")).toContain("The privacy notice says what is kept, why, and for how long, before the form takes anything.");
    expect(record("decisions/D-0024.md")).toContain("The seat line and the free line under it are unchanged.");

    // The feed's form has the note: on /feed, and in the feed panel further down the front door.
    const html = door();
    expect(textOf(html)).toContain(PRIVACY_NOTE);
    expect(textOf(render(FrontPage, { joining: true, count: 1, seatsOpen: 0 }))).toContain(PRIVACY_NOTE);

    // The first screen's form takes the address and the need; under it the seat line and the free line.
    const h = hero(html);
    expect(inputTag(h, "email")).toMatch(/\brequired\b/);
    expect(inputTag(h, "need")).toContain(`maxLength="${NEED_MAX}"`);
    expect(textOf(h)).toContain(NEED_HINT);
    expect(textOf(h)).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    expect(textOf(h)).toContain(FREE_LINE);

    // The defect: nothing on the first screen says what is done with the address, and no link leads to the notice from there.
    const toPrivacy = links(h).filter(([, href]) => href === "/privacy");
    expect(textOf(h).includes("What we keep, and for how long") || toPrivacy.length > 0).toBe(true);
  });

  it("fixed (LOW): 'N apps named so far.' counts answers, not apps. needsCount counts the rows, one per submit with a need, so one app named three times is told as '3 apps named so far.', and an answer that names no app counts as one too; within the limits (3 an hour for an address, 10 for a client address) one person can raise it by 10 an hour. The sentence is D-0024 §C's own ('37 apps named so far.'), whose exact wording the founder hasn't reviewed, so the fix is the founder's: the count's words ('N answers so far.'), or what it counts", async () => {
    expect(record("decisions/D-0024.md")).toContain('Counted in public: "37 apps named so far." beside the form, from the first one.');
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.41");
    for (const email of ["mara_f@example.test", "tomas_f@example.test", "nora_f@example.test"]) {
      expect(await takeSeat(null, form({ email, need: "the calendar app" }))).toEqual({ ok: true });
    }
    await runLater();
    expect(await storedNeeds()).toEqual(["the calendar app", "the calendar app", "the calendar app"]);
    const line = needsLine(await needsCount(db()));
    // The defect: one app, named three times, is told as three apps.
    expect(line === "1 app named so far." || !/\bapps? named\b/.test(line)).toBe(true);
  });

  it("fixed (LOW): SPEC §18.23 says a need is read with its 'control characters dropped'; normalizeNeed drops the C0 controls and DEL (U+0000–U+001F, U+007F) and keeps the C1 controls (U+0080–U+009F), which are control characters too (Unicode's Cc), so a need can carry them, and they count towards the 140 ('Keep it to 140 characters.' for 139 visible ones). Its comment says 'no control characters'", () => {
    // Changed after the verification of M-0021 (H4): SPEC and the comment say Unicode's Cc, the C1 set included, and
    // the function moved to need-words.ts (H8).
    // Changed after the re-check of M-0021 (RC5): SPEC and the comment say all twelve bidirectional controls.
    expect(spec()).toContain("control characters dropped (Unicode's Cc, the C1 set included, and all twelve bidirectional controls)");
    expect(prose("src/core/need-words.ts")).toContain("every control character (Unicode's Cc, the C1 set included)");
    expect(normalizeNeed("the\u0000calendar\u0007 app\u007f")).toBe("thecalendar app");
    const kept = normalizeNeed("the\u0085calendar\u009bapp")!;
    expect(kept).toContain("calendar");
    // The defect: the C1 controls stay.
    expect([...kept].filter((ch) => /\p{Cc}/u.test(ch))).toEqual([]);
  });

  it("fixed (LOW): the card's alt names the headline alone, where the image carries the eyebrow, the headline and the status line. og:image:alt is what a reader of a card gets instead of the picture; it reads 'The software we live in should be ours.' and not 'Founder-led today. User control isn't built yet.', which the picture says under it, as the first screen does, and which D-0020's fourth reason wants everywhere: 'The bigger message comes with its status everywhere: founder-led today, user control not built.' Served so on 3741 for all three crawlers", () => {
    const card = read("scripts/card.html");
    for (const sentence of [DOOR_EYEBROW, DOOR_STATUS]) expect(card).toContain(sentence);
    expect(record("decisions/D-0020.md")).toContain("The bigger message comes with its status everywhere: founder-led today, user control not built.");
    const images = (rootMetadata.openGraph as unknown as { images?: { alt?: string }[] } | undefined)?.images ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toContain(TAGLINE);
    // The defect: the status line the picture carries isn't in its alt.
    expect(images[0]?.alt ?? "").toContain(DOOR_STATUS);
  });

  it("fixed (LOW): three comments state what isn't so. FrontDoor.tsx's header still orders the page 'the message, the two entrances, and what holds today', where the first screen has one entrance, the form, and a text link, and the promise with its count between (its inner comment was updated, its header wasn't). seat-actions.ts says of a need that wasn't kept 'the seat email is on its way, and a second submit would only hit the limits': with no seat open no seat email goes at all, the address waits in line, and a second submit within the limits goes through and keeps the need (shown so in the database below). app/layout.tsx says that without APP_URL 'the image's path is left relative, and the platform's own address stands in': served on 3741 with no APP_URL, Next wrote the absolute http://localhost:3741/card.png; the platform's address stands in on Vercel only, and the path is never left relative", async () => {
    const stale: string[] = [];
    const head = read(DOOR_FILE).slice(0, 1200);
    if (head.includes("the message, the two entrances, and what holds today")) stale.push("FrontDoor.tsx: 'the message, the two entrances, and what holds today'");

    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.42");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ ok: true });
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the group chat" }))).toEqual({ ok: true });
    await runLater();
    // Changed after the re-check of M-0021 (RC1): the rows have no insertion order (a day and a random id).
    expect((await storedNeeds()).sort()).toEqual(["the calendar app", "the group chat"]);
    expect(await db().select().from(outbox)).toEqual([]);
    expect((await db().select().from(waitlist)).map((r) => r.email)).toEqual(["mara_f@example.test"]);
    if (prose("src/app/(public)/seat-actions.ts").includes("the seat email is on its way, and a second submit would only hit the limits")) {
      stale.push("seat-actions.ts: 'the seat email is on its way, and a second submit would only hit the limits'");
    }
    if (prose("src/app/layout.tsx").includes("the image's path is left relative")) stale.push("layout.tsx: 'the image's path is left relative'");

    // The defect: each is still there.
    expect(stale).toEqual([]);
  });

  it("fixed (LOW): the build receipt counts 'eighteen' older tests adapted, 'each with \"Changed under M-0021\" and its reason'; nineteen it() blocks carry the marker (claims.test.ts 1, front-door.test.ts 3, verify-honesty 1, verify-m0014-recheck 1, verify-m0015-honesty 1, verify-m0016-honesty 1, verify-m0017-honesty 2, verify-m0017-recheck 2, verify-m0018-recheck 1, verify-m0018-release 1, verify-m0020-honesty 2, verify-m0020-recheck 1, verify-m0020-rendering 1, verify5-recheck 1). AGENTS.md §10: a number is a factual claim. The commit message of e1fc284 says the same ('eighteen older checks adapted'); history isn't rewritten, so the receipt is what can be corrected", () => {
    const marked = adaptedTests();
    expect(marked).toHaveLength(19);
    expect(new Set(marked.map((m) => m.split(":")[0])).size).toBe(14);
    expect(git(["log", "-1", "--format=%B", "e1fc284"])).toContain("eighteen older checks adapted");
    const said = /Older tests adapted, (\w+) of them, each with "Changed under M-0021" and its reason/.exec(receipt())?.[1];
    expect(said).toBeTruthy();
    const WORDS: Record<string, number> = { seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
    // The defect: the receipt's number isn't the count.
    expect(WORDS[said!] ?? Number(said)).toBe(marked.length);
  });

  it("fixed (LOW), found beside the lens: the first screen's form, a client component on the public pages, takes its three words (NEED_LABEL, NEED_MAX, needsLine) from @/core/needs, which imports the schema, drizzle-orm and ids (node:crypto); built, the front door loads a 494KB chunk that /feed doesn't, carrying drizzle's table classes, the needs table's check and a crypto polyfill, on the page D-0024 wrote for 'people from a post [who] give the site ten seconds'. join.ts says how the feed does it: 'A plain module, so the feed's page and the front door (server components) and the form (a client component) all read the same words'. (The app's own client components already import @/core/posts and @/core/inbox, older than M-0021; the public pages didn't.) Built and served so on 3741: 30zah92bg3r1b.js, 493,730 bytes, referenced by / and not by /feed", () => {
    const formFile = "src/components/public/FirstScreenForm.tsx";
    expect(read(formFile)).toMatch(/^"use client";/);
    // Changed after the verification of M-0021 (H8): the form takes its words from need-words.ts, a plain module
    // that imports only the error helpers; needs.ts, which touches the database, is the server's.
    expect(read(formFile)).toContain('from "@/core/need-words"');
    expect(read(formFile)).not.toContain('from "@/core/needs"');
    expect(read("src/core/need-words.ts")).not.toMatch(/from "\.\/(?:schema|db|ids)"|from "drizzle-orm/);
    expect(read("src/core/needs.ts")).toMatch(/from "\.\/schema"/);
    expect(read("src/core/needs.ts")).toMatch(/from "\.\/ids"/);
    expect(read("src/core/ids.ts")).toContain('from "node:crypto"');
    expect(prose("src/components/public/join.ts")).toContain(
      "A plain module, so the feed's page and the front door (server components) and the form (a client component) all read the same words",
    );
    // The defect: on the public pages, a client component reaches the core's database layer.
    const reaches = (rel: string) => existsSync(join(WEB, rel)) && /from "(?:\.\/|@\/core\/)(?:schema|db|ids)"|from "drizzle-orm/.test(read(rel));
    const offenders = filesUnder("src/components/public")
      .filter((f) => /\.tsx?$/.test(f) && /^"use client"/.test(read(f)))
      .filter((f) => [...read(f).matchAll(/from "@\/core\/([\w-]+)"/g)].some((m) => reaches(`src/core/${m[1]}.ts`)));
    expect(offenders).toEqual([]);
  });
});

/* -------------------------------------------------------------- closed */

describe("closed (each passes on 089cbcd)", () => {
  it("closed: M-0021's first criterion, through the route with a real database — the first screen says, in order, the eyebrow, the headline, what it is in one line (D-0024 §A's own words), '1 of 100,000', the pledge's three sentences, 'Rado, maintainer · How that works' to /contract, the status line with 'See where it stands.' to #open, the form (the address, the need with its hint, D-0016 §B's button, the seat line, the free line) and 'I want to build' to /build; D-0020 §A's lede and 'I want this to exist' are gone from it; one h1; the claims scan finds nothing in it; and the six sections follow in their order. Beside D-0024 §A's list, the eyebrow stands above the headline and the picture beside the text, as before, which SPEC §18.23 names and the decision's 'nothing else' doesn't: the order holds, and whether the picture stays is the founder's. Served so on 3741", async () => {
    await maintainer();
    const html = await route();
    const h = hero(html);
    const text = textOf(h);
    const order = [
      DOOR_EYEBROW,
      TAGLINE,
      DOOR_WHAT,
      ofThreshold(1),
      PLEDGE,
      `${MAINTAINER}, maintainer · How that works`,
      DOOR_STATUS,
      "See where it stands.",
      "Your email",
      NEED_LABEL,
      NEED_HINT,
      WAITING_LIST_LABEL,
      "No seats are open right now. Seats go to whoever has waited longest.",
      FREE_LINE,
      ENTRANCES.builders,
    ];
    let last = -1;
    for (const part of order) {
      const next = text.indexOf(part, last + 1);
      expect(next, part).toBeGreaterThan(last);
      last = next;
    }
    expect(record("decisions/D-0024.md")).toContain(DOOR_WHAT);
    expect(record("mandates/M-0021.md")).toContain(DOOR_WHAT);
    expect(DOOR_WHAT).toBe("It starts with a friends feed: your people, newest first, and then it ends. No ads.");
    expect(record("decisions/D-0020.md")).toContain(DOOR_STATUS);
    expect(text).not.toContain(DOOR_LEDE);
    expect(text).not.toContain("I want this to exist");
    expect(text).not.toMatch(/named so far/);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(scanText(text, DOOR_FILE)).toEqual([]);
    expect(links(h)).toEqual(
      expect.arrayContaining([
        [`${ENTRANCES.builders} ↗`, "/build"],
        ["How that works", "/contract"],
        ["See where it stands.", "#open"],
      ]),
    );
    expect(links(h).map(([, href]) => href)).not.toContain("#part");
    // The picture, beside the text, in the same section; the strip and the six sections after it.
    expect(h).toContain('aria-labelledby="orbit-title orbit-desc"');
    expect(spec()).toContain("the eyebrow and the headline, as before;");
    expect(record("decisions/D-0024.md")).toContain("In this order, and nothing else: the headline; what it is; the promise, with the count against its threshold; the status; one form.");
    expect([...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual(["idea", "projects", "ours", "build", "open", "part"]);
  });

  it("closed: the count is 'N of 100,000' from memberCount, in every state, through the route with a real database — no account: '0 of 100,000'; one: '1 of 100,000'; twelve accounts with one suspended and forty addresses waiting: '11 of 100,000' (the waiting list changes nothing, the suspended one isn't counted); a member: the same number, with 'You're in.' and 'Open your feed' in place of the form; the database's port closed: the pledge stands alone, no 'of 100,000', no needs' count, the seats unread so the button says 'Join our.one', the page renders, and the failure is logged by name with no host or port in it; a number with its separators, never a bar, the threshold from the one constant; and the panel beside a member's feed says 'N of 100,000 people are in.' from the same count, read in the app's layout with the failure caught. Served so on 3741: '10 of 100,000' with the FICTIONAL seed, and the sentence alone with the port closed", async () => {
    expect(textOf(hero(await route()))).toContain(`0 of ${THRESHOLD}`);
    const rado = await maintainer();
    expect(rado.isAdmin).toBe(true);
    expect(textOf(hero(await route()))).toContain(`1 of ${THRESHOLD}`);

    for (let i = 0; i < 11; i += 1) await makeAccount({ suspended: i === 0 });
    await db()
      .insert(waitlist)
      .values(Array.from({ length: 40 }, (_, i) => ({ email: `waiting${i}_f@example.test`, createdAt: at("2026-10-01T00:00:00Z") })));
    const manyHtml = await route();
    const many = textOf(hero(manyHtml));
    expect(many).toContain(`11 of ${THRESHOLD}`);
    expect(many).not.toMatch(/\b(?:12|51) of /);
    expect(many).toContain(WAITING_LIST_LABEL);
    expect(manyHtml).not.toMatch(/<progress|role="progressbar"|aria-valuenow/);

    web.member = true;
    const member = hero(await route());
    expect(textOf(member)).toContain(`11 of ${THRESHOLD}`);
    expect(textOf(member)).toContain(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link}`);
    expect(member).not.toContain('name="email"');
    expect(textOf(member)).not.toContain("named so far");
    web.member = false;

    const down = textOf(hero(await withClosedDb(() => route())));
    expect(down).not.toContain(`of ${THRESHOLD}`);
    expect(down).toContain(PLEDGE);
    expect(down).toContain(DOOR_STATUS);
    expect(down).toContain(JOIN_LABEL);
    expect(down).not.toContain("named so far");
    const lines = logged();
    expect(lines.filter((l) => l.startsWith("[ours] front door: the count could not be read:"))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith("[ours] front door: the needs could not be counted:"))).toHaveLength(1);
    for (const l of lines) expect(l).not.toMatch(/5999|localhost|nowhere|ECONNREFUSED/);

    expect(ofThreshold(1284)).toBe("1,284 of 100,000");
    expect(THRESHOLD).toBe(HANDOVER_THRESHOLD.toLocaleString("en-US"));
    expect(record("decisions/D-0012.md")).toContain("the public count, meaning accounts that exist and are not suspended.");
    expect(read("src/core/seats.ts")).toMatch(/\.from\(accounts\)\s*\.where\(isNull\(accounts\.suspendedAt\)\)/);

    expect(textOf(render(OursCard, { email: null, count: 11 }))).toContain(`11 of ${THRESHOLD} people are in.`);
    expect(textOf(render(OursCard, { email: null, count: null }))).not.toContain(THRESHOLD);
    expect(read("src/app/(app)/layout.tsx")).toMatch(/memberCount\(db\)\.catch\(/);
    expect(read("src/app/(app)/layout.tsx")).toContain("count={count}");
  });

  it("closed: the form's words and states — the address required, the need optional with maxLength 140, autocomplete off and its hint tied to it; 'Which app would you take back?' is D-0024 §C's question and the one the founder's video asks (P-0017's evidence); the button follows D-0016 §B: 'Join the waiting list' with no seat open, or with seats open and someone waiting, 'Join our.one' with a seat open and nobody waiting, or when the seats can't be read; the seat line only with none open; joining closed shows 'Joining opens soon.' with the invite line, no form and no count of needs; a refusal is shown at its field, the need's with 'Keep it to 140 characters.' and aria-invalid, the address's at the address; and after a valid submission the one answer, which says nothing of the need", () => {
    const closedSeats = hero(door({ seatsOpen: 0, seatsWaiting: 0, needs: 2 }));
    const email = inputTag(closedSeats, "email");
    expect(email).toMatch(/\brequired\b/);
    expect(email).toContain('type="email"');
    expect(email).toContain('maxLength="254"');
    const need = inputTag(closedSeats, "need");
    expect(need).not.toMatch(/\brequired\b/);
    expect(need).toContain(`maxLength="${NEED_MAX}"`);
    expect(need).toContain('autoComplete="off"');
    // Changed after the verification of M-0021 (R3): the first screen's fields have ids of their own.
    expect(need).toContain('aria-describedby="first-screen-need-hint"');
    expect(NEED_LABEL).toBe("Which app would you take back?");
    expect(record("decisions/D-0024.md")).toContain(`an optional line, "${NEED_LABEL}"`);
    expect(record("proposals/P-0017.evidence-conversation-2026-10-05.md")).toContain(`The question "${NEED_LABEL}" is the one the founder's video asks`);
    expect(NEED_HINT).toBe("Optional. Kept without your address.");
    const text = textOf(closedSeats);
    expect(text).toContain(WAITING_LIST_LABEL);
    expect(text).toContain("No seats are open right now.");
    expect(text).toContain("2 apps named so far.");

    expect(joinLabel(3, 0)).toBe(JOIN_LABEL);
    expect(joinLabel(3, 2)).toBe(WAITING_LIST_LABEL);
    expect(joinLabel(0, 0)).toBe(WAITING_LIST_LABEL);
    expect(joinLabel(null)).toBe(JOIN_LABEL);
    const open = textOf(hero(door({ seatsOpen: 3, seatsWaiting: 0 })));
    expect(open).toContain(JOIN_LABEL);
    expect(open).not.toContain("No seats are open right now.");
    expect(textOf(hero(door({ seatsOpen: 3, seatsWaiting: 2 })))).toContain(WAITING_LIST_LABEL);
    expect(textOf(hero(door({ seatsOpen: null, seatsWaiting: null })))).toContain(JOIN_LABEL);

    const closedJoining = hero(door({ joining: false, seatsOpen: null, seatsWaiting: null, needs: 5 }));
    expect(textOf(closedJoining)).toContain("Joining opens soon.");
    expect(textOf(closedJoining)).toContain(INVITE_CLOSED_LINE);
    expect(closedJoining).not.toContain("<form");
    expect(textOf(closedJoining)).not.toContain("named so far");

    const view = (state: Parameters<typeof FirstScreenFormView>[0]["state"]) =>
      renderToStaticMarkup(createElement(FirstScreenFormView, { state, action: () => {}, pending: false, lines: [FREE_LINE], needs: null }));
    const atNeed = view({ error: NEED_TOO_LONG, field: "need" });
    expect(NEED_TOO_LONG).toBe("Keep it to 140 characters.");
    expect(atNeed).toMatch(/id="first-screen-need-error"[^>]*>[^<]*Keep it to 140 characters\./);
    expect(inputTag(atNeed, "need")).toContain('aria-invalid="true"');
    expect(inputTag(atNeed, "email")).not.toContain("aria-invalid");
    const atEmail = view({ error: SEATS_CLOSED });
    expect(atEmail).toMatch(/id="first-screen-email-error"[^>]*>[^<]*Joining opens soon\./);
    expect(atEmail).not.toContain('id="first-screen-need-error"');
    expect(textOf(view({ ok: true }))).toContain(CHECK_YOUR_EMAIL);
    expect(CHECK_YOUR_EMAIL).not.toMatch(/\bneed\b|\bapp\b/i);
  });

  it("closed: the need's denial paths, in the database — 141 characters, 141 'é' and 141 '𝄞' are refused at the need before anything is counted or kept, and no address is kept with them; an empty need, one of spaces only and one of control characters only go through as none; with joining closed (no controller), in production with no client-address header named, with a malformed address, past the rate limit (the fourth in an hour for one address) and with no maintainer, the request is refused and no need is kept; and the core adds no gate: nameNeed is called from keepNeed alone, after requestSeat let the request through", async () => {
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.50");
    const nothingKept = async () => expect(await storedNeeds()).toEqual([]);

    for (const long of ["x".repeat(NEED_MAX + 1), "é".repeat(NEED_MAX + 1), "\u{1d11e}".repeat(NEED_MAX + 1)]) {
      expect(await takeSeat(null, form({ email: "mara_f@example.test", need: long }))).toEqual({ error: NEED_TOO_LONG, field: "need" });
    }
    await runLater();
    expect(await db().select().from(rateEvents)).toEqual([]);
    expect(await db().select().from(waitlist)).toEqual([]);
    await nothingKept();

    for (const [i, empty] of ["", "   \n\t ", "\u0000\u0007"].entries()) {
      expect(await takeSeat(null, form({ email: `empty${i}_f@example.test`, need: empty }))).toEqual({ ok: true });
    }
    await runLater();
    await nothingKept();
    expect((await db().select().from(waitlist)).map((r) => r.email).sort()).toEqual(["empty0_f@example.test", "empty1_f@example.test", "empty2_f@example.test"]);

    vi.stubEnv("DATA_CONTROLLER", "");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ error: SEATS_CLOSED });
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ error: SEATS_CLOSED });
    vi.unstubAllEnvs();
    expect(await takeSeat(null, form({ email: "not an address", need: "the calendar app" }))).toEqual({ error: "Enter a valid email address." });
    for (let i = 0; i < 3; i += 1) expect(await takeSeat(null, form({ email: "tomas_f@example.test" }))).toEqual({ ok: true });
    expect(await takeSeat(null, form({ email: "tomas_f@example.test", need: "the calendar app" }))).toEqual({ error: RATE_LIMITED_MESSAGE });
    await runLater();
    await nothingKept();

    await reset();
    web.headers.set("x-forwarded-for", "203.0.113.51");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ error: SEATS_CLOSED });
    await runLater();
    await nothingKept();

    const callers = filesUnder("src").filter((f) => /\.tsx?$/.test(f) && /\bnameNeed\(/.test(read(f)));
    expect(callers).toEqual(["src/app/(public)/seat-actions.ts", "src/core/needs.ts"]);
    expect(read("src/app/(public)/seat-actions.ts")).toMatch(/await requestSeat\([\s\S]*?\}\);\s*if \(need !== null\) await keepNeed\(need\);/);
    expect(prose("src/core/needs.ts")).toContain("This module adds no gate of its own, so it is never called on its own in production code.");
  });

  it("closed: a need is kept as the words and when, nothing else — 140 'é' and 140 '𝄞' are kept whole and the table counts characters as the code does (char_length 140); whitespace is collapsed; each row has id, text and created_at and no address; the table has those three columns and no foreign key, in the migration, the snapshot and the database (as the receipt's browser check says); the count is right from the first and the route shows it; no file under src/app or src/components reads the words, the core lists nothing, and the words are on neither / nor /feed", async () => {
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.52");
    expect(textOf(hero(await route()))).not.toContain("named so far");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "é".repeat(NEED_MAX) }))).toEqual({ ok: true });
    await runLater();
    expect(textOf(hero(await route()))).toContain("1 app named so far.");
    expect(await takeSeat(null, form({ email: "tomas_f@example.test", need: "\u{1d11e}".repeat(NEED_MAX) }))).toEqual({ ok: true });
    expect(await takeSeat(null, form({ email: "nora_f@example.test", need: "  the\tgroup   chat  " }))).toEqual({ ok: true });
    await runLater();

    // Changed after the re-check of M-0021 (RC1): the rows carry the day and a random id, so they have no
    // insertion order to read back; they are compared as a set.
    const rows = await db().select().from(needs);
    expect(rows.map((r) => r.text).sort()).toEqual(["é".repeat(NEED_MAX), "\u{1d11e}".repeat(NEED_MAX), "the group chat"].sort());
    const lengths = await db().execute(sql`select char_length(text)::int as n from needs order by n desc`);
    expect(lengths.rows).toEqual([{ n: 140 }, { n: 140 }, { n: 14 }]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "text"]);
      expect(JSON.stringify(row)).not.toMatch(/example\.test|mara|tomas|nora/);
    }
    const columns = await db().execute(sql`select column_name from information_schema.columns where table_name = 'needs' order by ordinal_position`);
    expect(columns.rows.map((r) => (r as { column_name: string }).column_name)).toEqual(["id", "text", "created_at"]);
    const foreign = await db().execute(sql`select count(*)::int as n from information_schema.table_constraints where table_name = 'needs' and constraint_type = 'FOREIGN KEY'`);
    expect(foreign.rows).toEqual([{ n: 0 }]);
    expect(receipt()).toContain("in the database the row holds id, text and created_at, and the table has no other column");

    expect(await needsCount(db())).toBe(3);
    expect(needsLine(3)).toBe("3 apps named so far.");
    expect(needsLine(1284)).toBe("1,284 apps named so far.");
    const html = await route();
    expect(textOf(hero(html))).toContain("3 apps named so far.");
    expect(html).not.toContain("the group chat");
    expect(renderToStaticMarkup((await FeedPageRoute()) as ReactElement)).not.toContain("the group chat");
    const readers = [...filesUnder("src/app"), ...filesUnder("src/components")].filter(
      (f) => /\.tsx?$/.test(f) && /\bneeds\.text\b|from\(needs\)|select\(\)\.from\(needs/.test(read(f)),
    );
    expect(readers).toEqual([]);
    expect(read("src/core/needs.ts")).not.toMatch(/export (?:async )?function list/);
    expect(filesUnder("src").filter((f) => /\.tsx?$/.test(f) && /from\(needs\)/.test(read(f)))).toEqual(["src/core/needs.ts"]);
  });

  it("closed: when keeping the need fails, the request stands, as SPEC §18.23 says — with the needs table out of reach, a submit with a need gets the one answer, the address goes in line, nothing is kept, and the failure is logged by name with nothing of the table or the address in it; the person reads the one answer, which says nothing of the need either way", async () => {
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.60");
    await db().execute(sql`alter table needs rename to needs_away_fictional`);
    try {
      expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ ok: true });
      await runLater();
    } finally {
      await db().execute(sql`alter table needs_away_fictional rename to needs`);
    }
    expect((await db().select().from(waitlist)).map((r) => r.email)).toEqual(["mara_f@example.test"]);
    expect(await storedNeeds()).toEqual([]);
    const lines = logged();
    expect(lines.filter((l) => l.startsWith("[ours] a need wasn't kept:"))).toHaveLength(1);
    for (const l of lines) expect(l).not.toMatch(/needs_away|relation|does not exist|example\.test|mara/);
    expect(spec()).toContain("If keeping it fails, the request stands and the failure is logged by name.");
    expect(textOf(render(FirstScreenFormView, { state: { ok: true }, action: () => {}, pending: false, lines: [FREE_LINE], needs: 3 }))).toContain(CHECK_YOUR_EMAIL);
  });

  it("closed: the privacy notice's row 'Apps you name' names the need, its purpose and 12 months (NEED_KEPT_MONTHS), and says they aren't removed automatically yet, which is so: nothing under src or scripts deletes from the table, and no cron names it; our.one.json's row is the page's word for word; 12 months is D-0024 §C's number, marked there as the draft's and the founder's to review; the seat paragraph is unchanged; and the 'what Neon receives' line stays true, the needs being in the same database", () => {
    const text = textOf(render(PrivacyPage));
    expect(NEED_KEPT_MONTHS).toBe(12);
    expect(text).toContain(
      `Apps you name What What you write in "${NEED_LABEL}" on the front door, and the day you wrote it. Not your address: a need is kept apart from it, with the day and not the time. Why To see what people want made theirs, and to count it in public. How long For 12 months, or until a decision publishes or deletes them. They are not removed automatically yet.`,
    );
    const m = JSON.parse(read("our.one.json")) as { data: { collects: { what: string; why: string; kept: string }[] } };
    const row = m.data.collects.find((c) => c.what.startsWith("Apps you name:"));
    expect(row).toEqual({
      what: `Apps you name: What you write in "${NEED_LABEL}" on the front door, and the day you wrote it. Not your address: a need is kept apart from it, with the day and not the time.`,
      why: "To see what people want made theirs, and to count it in public.",
      kept: "For 12 months, or until a decision publishes or deletes them. They are not removed automatically yet.",
    });
    expect(m.data.collects).toHaveLength(15);
    const deleters = [...filesUnder("src"), ...filesUnder("scripts")].filter(
      (f) => /\.(?:ts|tsx|sql)$/.test(f) && /delete\(needs\)|delete from "?needs|drop table "?needs|truncate "?needs/i.test(read(f)),
    );
    expect(deleters).toEqual([]);
    expect(readRoot("vercel.json")).not.toMatch(/need/i);
    expect(record("decisions/D-0024.md")).toContain("Kept for 12 months, or until a decision publishes or deletes them. Interpretation: the founder named no time; 12 months is the draft's.");
    expect(text).toContain("If you ask for a seat, we keep your email address to send you the join link.");
    expect(read("src/app/(public)/privacy/page.tsx")).toContain('const NEON_KEEPS = "everything this notice says is kept on our.one is stored there.";');
    expect(scanText(text, "src/app/(public)/privacy/page.tsx")).toEqual([]);
  });

  it("closed: every public page carries the link card — the root metadata's openGraph (the site's name, the type, one image 1200 by 630 with the headline as alt) and twitter (the large card, the same image), with no title or description of their own, so each page's flow in (/ its own title and the front door's lede, /contract 'The contract · our.one'); metadataBase from APP_URL, read in the layout without a core import; public/card.png is a PNG of 1200 by 630 and 53,558 bytes, the receipt's screen 08 is that file byte for byte, and scripts/card.html draws the site's own sentences (the eyebrow, the headline with 'ours.' set apart, the status line, the wordmark with its dot) in the identity's colours and loads nothing from anywhere; the manifest keeps the front door's lede. Served so on 3741 to Twitterbot/1.0, facebookexternalhit/1.1 and Slackbot-LinkExpanding 1.0 on /, /feed and /contract: og:title, og:description, og:site_name, og:image http://localhost:3741/card.png with its width, height and alt, og:type, twitter:card summary_large_image, twitter:title, twitter:description, twitter:image; and /card.png as image/png, byte for byte the committed file", () => {
    // Changed after the verification of M-0021 (H5): the alt carries the status line the picture does.
    expect(rootMetadata.openGraph).toEqual({ siteName: "our.one", type: "website", images: [{ url: "/card.png", width: 1200, height: 630, alt: `${TAGLINE} ${DOOR_STATUS}` }] });
    expect(rootMetadata.twitter).toEqual({ card: "summary_large_image", images: ["/card.png"] });
    expect(rootMetadata.description).toBe(DOOR_LEDE);
    expect(String(rootMetadata.metadataBase)).toBe(`${process.env.APP_URL}/`);
    expect(read("src/app/layout.tsx")).toContain('process.env.APP_URL?.replace(/\\/+$/, "")');
    expect(read("src/app/layout.tsx")).not.toMatch(/from "@\/core\//);
    expect(doorMetadata).toEqual({ title: { absolute: DOOR_TITLE }, description: DOOR_LEDE });
    expect(manifest().description).toBe(DOOR_LEDE);

    const png = readFileSync(join(WEB, "public/card.png"));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png.length).toBe(53558);
    expect(receiptFile(`${SCREENS}/08-link-card.png`).equals(png)).toBe(true);

    const card = read("scripts/card.html");
    expect(card).toContain(`<p class="eyebrow">${DOOR_EYEBROW}</p>`);
    expect(card).toContain('<h1 class="headline">The software we live in should be <span class="ours">ours.</span></h1>');
    expect(TAGLINE).toBe("The software we live in should be ours.");
    expect(card).toContain(`<p class="status">${DOOR_STATUS}</p>`);
    expect(card).toContain('<div class="wordmark">our<span class="dot">.</span>one</div>');
    expect(card).not.toMatch(/https?:\/\/|<script|<link/);
    const tokens = read("src/app/globals.css");
    for (const hex of ["#f5f3eb", "#222b24", "#bf411d", "#586157", "#e1f28b"]) {
      expect(card).toContain(hex);
      expect(tokens).toContain(hex);
    }
    expect(read("scripts/card.ts")).toContain("process.env.CHROME_HEADLESS_SHELL");
    expect(read("package.json")).toContain('"card": "tsx scripts/card.ts"');
  });

  it("closed: /feed's verified words, the contract, the agreement, the drafts, the feed's form and the seats' rules are byte for byte as deployed at ac38742; of src, the build changed exactly fifteen files; join.ts gained ofThreshold and lost nothing; the privacy page gained its row and lost no line; the pledge on the first screen is /feed's card's sentence and signature, word for word, and D-0016 §C's; and the feed's form never sends a need", () => {
    for (const file of [
      "src/components/public/FrontPage.tsx",
      "src/app/(public)/feed/page.tsx",
      "src/app/(public)/contract/page.tsx",
      "src/app/(public)/agreement/page.tsx",
      "src/components/public/drafts.ts",
      "src/components/public/Draft.tsx",
      "src/components/public/GetInForm.tsx",
      "src/components/public/lede.ts",
      "src/core/seats.ts",
      "src/core/limits.ts",
      "src/core/invites.ts",
      "src/core/mail-templates.ts",
    ]) {
      expect(git(["diff", "--name-only", "ac38742", "089cbcd", "--", `apps/web/${file}`]).trim(), file).toBe("");
    }
    expect(git(["diff", "--name-only", "0376b3e", "089cbcd", "--", "apps/web/src"]).trim().split("\n").map((p) => p.replace(/^apps\/web\//, ""))).toEqual([
      "src/app/(app)/layout.tsx",
      "src/app/(public)/page.tsx",
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/seat-actions.ts",
      "src/app/globals.css",
      "src/app/layout.tsx",
      "src/components/RightColumn.tsx",
      "src/components/public/FirstScreenForm.tsx",
      "src/components/public/FrontDoor.tsx",
      "src/components/public/door.module.css",
      "src/components/public/door.ts",
      "src/components/public/join.ts",
      "src/core/claims.ts",
      "src/core/needs.ts",
      "src/core/schema.ts",
    ]);
    const removed = (file: string) =>
      git(["diff", "-U0", "0376b3e", "089cbcd", "--", `apps/web/${file}`])
        .split("\n")
        .filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(removed("src/components/public/join.ts")).toEqual(['-import { formatCount } from "./handover";']);
    expect(removed("src/app/(public)/privacy/page.tsx")).toEqual([]);

    const signed = `${PLEDGE} ${MAINTAINER}, maintainer · How that works`;
    expect(textOf(hero(door()))).toContain(signed);
    expect(textOf(render(FrontPage, { joining: true, count: 1, seatsOpen: 0 }))).toContain(signed);
    expect(record("decisions/D-0016.md")).toContain(PLEDGE.replace(THRESHOLD, "[threshold]"));
    expect(record("decisions/D-0016.md")).toContain('Signed as before: "[maintainer], maintainer · How that works".');
    expect(read("src/components/public/GetInForm.tsx")).not.toMatch(/\bneed\b/i);
  });

  it("closed: the pledge's sentence is listed for FrontDoor.tsx by exact text, in both forms, and lets nothing through elsewhere; its other two sentences ('I'll never sell our.one.', 'Until then, I hold all three.') are no claim the scan refuses, as on /feed since M-0014; the handover list holds 14 sentences; the scan reads every source file the build added or changed and the kit's text: no prohibited claim in 180 files with 19 allowlisted sentences, as the receipt says; and the kit's check passes, READY TO PROPOSE, declaring 15 kinds of personal data", () => {
    const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
    const listed = ALLOWLIST.filter((e) => e.file === DOOR_FILE).map((e) => e.sentence);
    expect(listed).toEqual([
      "When {THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.",
      `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`,
    ]);
    expect(scanText(listed[1]!, DOOR_FILE)).toEqual([]);
    expect(scanText(listed[1]!, "src/components/public/door.ts").length).toBeGreaterThan(0);
    expect(scanText(listed[1]!, null).length).toBeGreaterThan(0);
    expect(scanText("I'll never sell our.one. Until then, I hold all three.", null)).toEqual([]);
    expect(ALLOWLIST.filter((e) => /hand|give it away/i.test(e.sentence))).toHaveLength(14);
    expect(ALLOWLIST).toHaveLength(19);

    const files = publicTextFiles(WEB);
    for (const file of [
      "src/core/needs.ts",
      "src/components/public/FirstScreenForm.tsx",
      DOOR_FILE,
      "src/components/public/door.ts",
      "src/components/public/join.ts",
      "src/components/RightColumn.tsx",
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/page.tsx",
      "src/app/(public)/seat-actions.ts",
      "src/app/layout.tsx",
      "src/app/(app)/layout.tsx",
    ]) {
      expect(files, file).toContain(file);
    }
    const pages = scanRepoPublicText(WEB);
    const kit = scanKitText(WEB);
    expect([...pages.hits, ...kit.hits]).toEqual([]);
    // Changed after the verification of M-0021 (H8): need-words.ts added.
    expect(pages.files.length + kit.files.length).toBe(181);
    expect(receipt()).toContain("| Claims scan | CHECKED | no prohibited claim in 180 files; 19 sentences listed |");

    const check = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], {
      cwd: ROOT,
      encoding: "utf8",
      // Only what it needs: nothing of this process's environment reaches the kit.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    });
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("RESULT: READY TO PROPOSE.");
    expect(check.stdout).toContain("It declares 15 kinds of personal data");
    expect(receipt()).toContain("| The feed under the kit's check | CHECKED | READY TO PROPOSE |");
  });

  it("closed: the migration 0003_needs — the table with its check (1 to 140 characters) and its index, no column for an address; the journal's fourth entry, 5 October 2026; the snapshot chained to 0002's (22 tables, the needs table with the check and no foreign key); the down file's created_at is the journal's when, it drops the table and forgets the run, and tells the operator to export first; scripts/migrate.ts applied it to a fresh database, the suite's own (four runs recorded, each the journal's time) and ours_m0021_vh by hand; and the database refuses 141 characters and an empty need on its own", async () => {
    const up = read("drizzle/0003_needs.sql");
    expect(up).toBe(
      'CREATE TABLE "needs" (\n\t"id" text PRIMARY KEY NOT NULL,\n\t"text" text NOT NULL,\n\t"created_at" timestamp with time zone DEFAULT now() NOT NULL,\n\tCONSTRAINT "needs_text_length" CHECK (char_length("needs"."text") BETWEEN 1 AND 140)\n);\n--> statement-breakpoint\nCREATE INDEX "needs_created_idx" ON "needs" USING btree ("created_at");',
    );
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: { idx: number; tag: string; when: number }[] };
    expect(journal.entries.map((e) => e.tag)).toEqual(["0000_foundation", "0001_verification_fixes", "0002_seats", "0003_needs"]);
    const when = journal.entries[3]!.when;
    expect(when).toBe(1791198402886);
    expect(new Date(when).toISOString().slice(0, 10)).toBe("2026-10-05");
    const down = read("drizzle/down/0003_needs.sql");
    expect(down).toContain('DROP TABLE "needs";');
    expect(down).toContain(`DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = ${when};`);
    expect(down).toContain("\\copy needs to 'needs.csv' csv header");
    expect(down).toContain("scripts/migrate.ts never runs this file");

    type Snapshot = { id: string; prevId: string; tables: Record<string, { columns: Record<string, unknown>; foreignKeys: Record<string, unknown>; checkConstraints: Record<string, { value: string }> }> };
    const s3 = JSON.parse(read("drizzle/meta/0003_snapshot.json")) as Snapshot;
    const s2 = JSON.parse(read("drizzle/meta/0002_snapshot.json")) as Snapshot;
    expect(s3.prevId).toBe(s2.id);
    expect(Object.keys(s3.tables)).toHaveLength(22);
    expect(Object.keys(s2.tables)).toHaveLength(21);
    const table = s3.tables["public.needs"]!;
    expect(Object.keys(table.columns)).toEqual(["id", "text", "created_at"]);
    expect(table.foreignKeys).toEqual({});
    expect(table.checkConstraints["needs_text_length"]?.value).toBe('char_length("needs"."text") BETWEEN 1 AND 140');

    const runs = (await db().execute(sql`select created_at from drizzle.__drizzle_migrations order by created_at`)).rows.map((r) => Number((r as { created_at: string }).created_at));
    expect(runs).toEqual(journal.entries.map((e) => e.when));
    const refusedBy = async (statement: ReturnType<typeof sql>): Promise<string> => {
      try {
        await db().execute(statement);
      } catch (error) {
        const cause = (error as { cause?: { message?: string } }).cause;
        return `${cause?.message ?? ""} ${(error as Error).message}`;
      }
      return "accepted";
    };
    expect(await refusedBy(sql`insert into needs (id, text) values ('FICTIONAL-long', ${"x".repeat(NEED_MAX + 1)})`)).toContain("needs_text_length");
    expect(await refusedBy(sql`insert into needs (id, text) values ('FICTIONAL-empty', '')`)).toContain("needs_text_length");
    expect(await refusedBy(sql`insert into needs (id, text) values ('FICTIONAL-140', ${"\u{1d11e}".repeat(NEED_MAX)})`)).toBe("accepted");
  });

  it("closed: the receipt's numbers and statuses are so, rerun on 089cbcd under env -i — 67 files, 1,701 pass and 2 skipped, the claims scan's 180 files and 19 sentences, READY TO PROPOSE, a production build that passed with no DATABASE_URL; its status is TESTED, one of AGENTS.md §6's states, and it claims no deploy; the three commits it names are what they are, and 089cbcd adds only the stopping rule; D-0024 and M-0021 are ADOPTED, M-0021 a BUILD mandate whose scope allows apps/web/** and the receipts and denies the records; and the new sentences write our.one as AGENTS.md §11 says and claim nothing §9 prohibits", () => {
    const r = receipt();
    // Changed after the verification of M-0021 (round one): the receipt says where the verification stands now,
    // truly. The checks table "before verification" below is kept as it was, with its numbers on e1fc284.
    expect(r).toContain("Status: TESTED locally, after round one of the independent verification (13 findings fixed, one part recorded). The re-check is next. Nothing is pushed or deployed.");
    expect(r).toContain("| Tests (vitest, real Postgres) | CHECKED | 1,701 pass, 2 skipped (M-0020's R12, and one older), in 67 files on e1fc284 |");
    expect(r).toContain("| Typecheck, lint | CHECKED | pass |");
    expect(r).toContain("| Production build | CHECKED | pass |");
    expect(r).not.toMatch(/\b(?:DEPLOYED|OBSERVED)\b/);
    expect(r).toMatch(/Status: TESTED\b/);
    for (const [hash, subject] of [
      ["0376b3e", "P-0017, D-0024, M-0021: the first screen, for people who come from a post"],
      ["e1fc284", "M-0021: the first screen, for people who come from a post"],
      ["089cbcd", "M-0021 verification: the stopping rule, declared before it starts"],
    ]) {
      expect(git(["log", "-1", "--format=%s", hash!]).trim()).toBe(subject);
    }
    expect(git(["diff", "--name-only", "e1fc284", "089cbcd"]).trim()).toBe("receipts/conformance/2026-10-05-M-0021.verification.md");
    expect(git(["diff", "--name-only", "ac38742", "0376b3e"]).trim().split("\n")).toEqual([
      "decisions/D-0024.md",
      "decisions/D-0024.yaml",
      "mandates/M-0021.md",
      "mandates/M-0021.yaml",
      "proposals/P-0017.evidence-conversation-2026-10-05.md",
      "proposals/P-0017.md",
      "proposals/P-0017.yaml",
    ]);
    expect(record("decisions/D-0024.md")).toContain("Status: ADOPTED by the founder under bootstrap authority on 5 October 2026.");
    expect(record("mandates/M-0021.md")).toContain("Status: ADOPTED, under [D-0024](../decisions/D-0024.md). Class: BUILD");
    const m = flat(readRoot("mandates/M-0021.yaml"));
    expect(m).toContain("status: ADOPTED");
    expect(m).toContain("class: BUILD");
    expect(m).toContain("source_decision: D-0024");
    for (const allowed of ["- apps/web/**", "- receipts/builds/**", "- receipts/conformance/**"]) expect(m).toContain(allowed);
    for (const denied of ["- decisions/**", "- mandates/**", "- kit/**", "- vercel.json"]) expect(m).toContain(denied);
    expect(m).toContain("production_allowed: false");

    // The product files and the records the build changed (not the older tests it adapted, which quote the M-0020 finding "OUR.ONE").
    const changed = git(["diff", "--name-only", "0376b3e", "089cbcd", "--", "apps/web"])
      .trim()
      .split("\n")
      .map((p) => p.replace(/^apps\/web\//, ""))
      .filter((p) => /\.(?:tsx?|json|html|css|md)$/.test(p) && !p.startsWith("drizzle/meta") && !p.startsWith("tests/"));
    expect(changed.length).toBeGreaterThanOrEqual(19);
    for (const file of changed) expect(read(file), file).not.toMatch(/OUR\.ONE|Our\.one|OURS\.ORG|OURS Network|ours\.today|ours\.dev/);
    expect(r).not.toMatch(/OUR\.ONE|Our\.one|OURS\.ORG|OURS Network/);
    const sentences = [DOOR_WHAT, NEED_LABEL, NEED_HINT, NEED_TOO_LONG, needsLine(37), `${ofThreshold(1)} people are in.`, textOf(render(PrivacyPage)), textOf(read("scripts/card.html"))];
    for (const s of sentences) expect(scanText(s, null), s.slice(0, 60)).toEqual([]);
    expect(sentences.join(" ")).not.toMatch(/member-owned|ratified|tamper-proof|non-bypassable|will spread|trademark|members exist/i);
  });

  it("closed: SPEC §18.23's and the receipt's sentences that name code are so — DOOR_LEDE stays the description in the metadata and the manifest; the signature goes to /contract; SeatResult gains field: \"need\"; the panel's line reads 'N of 100,000 people are in.'; pnpm card reads CHROME_HEADLESS_SHELL; the founder's two actions touched no code (the admin's controls and config.ts are unchanged); the receipt's screens are the eight it lists; and the verification receipt is OPEN with the stopping rule, M-0018's, declared before this started", () => {
    const s = spec();
    expect(s).toContain("DOOR_LEDE stays the description in the metadata and the manifest");
    expect(rootMetadata.description).toBe(DOOR_LEDE);
    expect(manifest().description).toBe(DOOR_LEDE);
    expect(s).toContain('signed "Rado, maintainer · How that works", to /contract');
    expect(links(hero(door()))).toEqual(expect.arrayContaining([["How that works", "/contract"]]));
    expect(s).toContain('SeatResult gains field: "need" for a refusal at the need; the feed\'s form never sends one.');
    expect(read("src/app/(public)/seat-actions.ts")).toContain('export type SeatResult = { ok: true } | { error: string; field?: "need" };');
    expect(s).toContain('The panel beside a member\'s feed (OursCard) shows "N of 100,000 people are in." from the same count');
    expect(s).toContain("pnpm card (a headless Chromium, CHROME_HEADLESS_SHELL)");
    expect(s).toContain("The founder's actions, no code: a first wave of seats opened in /admin when the post goes out; PROPOSALS_EMAIL set, so the drafts have a destination.");
    expect(git(["diff", "--name-only", "0376b3e", "089cbcd", "--", "apps/web/src/app/(app)/admin", "apps/web/src/core/config.ts"]).trim()).toBe("");

    const r = receipt();
    expect(r).toContain("01–03: the first screen at 1440px (light, dark) and 375px;");
    expect(r).toContain("08: the link card, public/card.png, as committed.");
    const screens = git(["ls-tree", "-r", "--name-only", "m-0021", "--", SCREENS]).trim().split("\n").map((p) => p.replace(`${SCREENS}/`, ""));
    expect(screens).toEqual([
      "01-first-screen-1440-light.jpg",
      "02-first-screen-1440-dark.jpg",
      "03-first-screen-375-light.jpg",
      "04-first-screen-form-375-light.jpg",
      "05-first-screen-member-1440-light.jpg",
      "06-feed-panel-member-1440-light.jpg",
      "07-first-screen-1000-light.jpg",
      "08-link-card.png",
      // Changed after the verification of M-0021 (round one): the screens taken after the fixes.
      "09-first-screen-1440-light-after-round-one.jpg",
      "10-first-screen-1280x720-light-after-round-one.jpg",
      "11-first-screen-1440-dark-after-round-one.jpg",
      "12-first-screen-375-light-after-round-one.jpg",
      "13-first-screen-member-1440-light-after-round-one.jpg",
    ]);
    const rule = record("receipts/conformance/2026-10-05-M-0021.verification.md");
    expect(rule).toContain("Status of this receipt: OPEN — the stopping rule, declared before the verification starts.");
    expect(rule).toContain("This is the rule M-0018 used, as M-0021 asks.");
    expect(rule).toContain("Classes: every check here is CHECKED (a test reports). Only R-SCOPE is ENFORCED.");
  });
});
