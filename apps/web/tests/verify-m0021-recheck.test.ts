/**
 * The re-check of M-0021 (the first screen, for people who come from a post;
 * D-0024; SPEC §18.23), step 4 of the verification's stopping rule: one
 * agent that built none of it and verified none of it, after round one's
 * fixes (1625db6) and their receipts (34ef203). Both lenses: honesty, and
 * rendering and use. It changes no product code, no record, no receipt and
 * no other test.
 *
 * What was read: AGENTS.md (§6, §7, §9–§12 closely); D-0024; M-0021 (.md and
 * .yaml); P-0017; SPEC §18.23, with §9's accessibility lines; the
 * verification receipt (the stopping rule, round one's rows and what was
 * done with each) and the build receipt, with its thirteen screens; the two
 * verifiers' files as written (34304d8, 5509fdd) and as adapted, with every
 * "Changed after the verification of M-0021" comment (24 of them) and what
 * each adaptation kept of its check; `git diff 089cbcd 34ef203` (every
 * product file and every test it changed), `git diff 0376b3e 34ef203` (58
 * files: the scope, and the feed's, the contract's, the agreement's and the
 * drafts' files); the messages of 1625db6, 34ef203, 565efca and 089cbcd; and
 * what the fixes lean on: FirstScreenForm, Field, FrontDoor, the hero's
 * stylesheet and its media queries, the root layout and next.config.ts,
 * seat-actions, needs, need-words, the schema, ids, requestSeat, hit(), the
 * privacy page, the manifest, error.tsx, not-found.tsx, session.ts, config.ts
 * and Next's own resolve-url.js. For method: the M-0020 re-check and its
 * receipt's round two.
 *
 * What was run, each under `env -i` with only what it needs: the whole suite
 * on 34ef203 before this file existed (69 files; 1,743 passed, 3 skipped and
 * 1 failed: tests/verify-abuse.test.ts "closed: thirty reports fired at once
 * stop at exactly twenty", which failed again in 8 of 13 reruns of that test
 * alone and is not M-0021's; see the receipts' numbers below), typecheck and
 * lint (pass), the claims scan (no prohibited claim in 181 files, 19
 * sentences listed), the kit's check (READY TO PROPOSE), a production `next
 * build` (pass), and `node packages/cli/src/main.ts check M-0021 --changed`
 * (AUTHORISED, on a clean tree, and again with this file in the tree). With
 * this file added the whole suite ran again: 70 files, 1,768 passed, 3
 * skipped, and only this file's seven DEFECT tests failed.
 *
 * What was served: that build, by `next start`, under `env -i` with
 * FICTIONAL settings only (DATA_CONTROLLER="FICTIONAL Controller",
 * DATA_CONTROLLER_EMAIL=controller@example.test, a FICTIONAL
 * SESSION_SECRET, MAIL_TRANSPORT=outbox, CLIENT_IP_HEADER=x-forwarded-for,
 * telemetry off) on a database of its own (ours_m0021_rc: made with
 * createdb, migrated and seeded with the app's own scripts, ten FICTIONAL
 * people, dropped afterwards): localhost:3743 with APP_URL set; :3746 with
 * no data controller (joining closed); :3747 with DATABASE_URL on a closed
 * port; :3748 with no APP_URL; and `next dev` on :3745, for React's own
 * warnings. A session for the FICTIONAL @bruno_varnell was started with the
 * app's createSession and handed to the browser as `__Host-ours_session`
 * from a file only its owner could read; no cookie, session id or secret was
 * printed. Fetched as Twitterbot/1.0, facebookexternalhit/1.1 and
 * Slackbot-LinkExpanding 1.0: /, /feed and /contract, and /card.png; as
 * Twitterbot/1.0: twelve more pages, an address with no route, and a
 * member's /home with the database port closed. A local server on :3799
 * logged the Referer of what left :3743's origin (stopped afterwards).
 *
 * What was seen: chrome-headless-shell 153, driven over the DevTools protocol
 * by the re-checker's own scripts, with a fresh profile deleted afterwards
 * and nothing resolving but localhost:
 * - the first screen at 31 widths from 320 to 1920 (760, 761, 899, 900, 901,
 *   1050, 1051, 1449 and 1450 among them), light and dark, with and without
 *   touch below 1024, as a visitor; as a member, with joining closed and with
 *   the database down at seven of them: scroll, boxes past an edge, overlaps
 *   among the hero's blocks, words broken mid-word, text outside its box,
 *   the strip, the sections below, the picture; layout shift and paint with
 *   Fast 3G and a CPU 4x slower; text contrast; touch targets;
 * - the four forms that post natively with scripts disabled (the first
 *   screen's, with and without a query string, the feed's, the Projects
 *   panel's, sign-in), their Origin and answer; the first screen's refusal
 *   with scripts disabled, and a submit before the script had run;
 * - the first screen's form with scripts on: typing, a paste, autofill-like
 *   input events, an IME composition, a refusal and a correction and an
 *   answer, an over-long need, a refusal after an answer, three quick clicks,
 *   the pending state on a slow network, Enter and Tab by keyboard, focus
 *   afterwards, offline; the same on a development server, for the console;
 *   text typed before the script had run (with its requests held, and on
 *   Fast 3G with a CPU 4x slower), then after;
 * - the Tab order and the accessibility tree of the hero, the ids, labels
 *   and aria references of the whole page (with each draft dialog open), the
 *   draft dialogs (opened, Escape), the Projects panel's form;
 * - a member's / and /home (the panel's count) at 1440, 1000 and 375px;
 * - the link card's tags on sixteen pages, as three crawlers, the 404 page
 *   and the error page; /card.png's bytes; the built chunks the front door
 *   and /feed load, and what is in them; what a cross-origin navigation,
 *   fetch and image from /i/<code> carry or are refused.
 *
 * Each finding is a "DEFECT (SEVERITY): …" test that FAILS on 34ef203 and
 * passes once fixed, by whichever fix the finding allows; where only a
 * browser shows it, the title says what was measured and the test pins the
 * cause in the source, the stylesheet or the words. Any assertion before the
 * last is evidence, and passes; evidence about a file a fix would change is
 * read from 34ef203 itself (`git show`), so it holds after the fix. Each
 * check that held is a "closed: …" test that passes. Before this file was
 * committed it was run in a scratch clone of 34ef203, outside the worktree,
 * with a plausible fix for each finding, in two ways: every DEFECT test
 * passed there. The closed checks that pin a mechanism a fix replaces (the
 * controlled state; the notice's words) are the ones such a fix adapts.
 * That clone is not part of this file, and nothing in it is a decision about
 * how to fix anything.
 *
 * Severity: HIGH, a false claim about authority, ownership, control or
 * status, private data exposed, or a page or form that fails; MEDIUM, a
 * stated requirement unmet, a sentence that misleads, or a real usability or
 * accessibility failure; LOW, a stale or imprecise sentence, a weak guard, or
 * polish.
 *
 * Noticed, not filed: the headline's accessible name in Chrome reads
 * "should beours." (the space before the italic word is dropped; the markup
 * is older than M-0021); non-ASCII case in the public count is Postgres's lower() in
 * the database's ctype (C here; the deployed database's could not be
 * checked); the card has no twitter:image:alt; on a tablet's portrait width
 * (761–900px) the form's button is 992–1,014px down and the picture is 665
 * to 804px wide, which the receipts' recorded part (a phone) doesn't name;
 * putting the form first on a phone, by CSS order, would make the keyboard
 * and reading order differ from the screen's; the race that
 * tests/verify-abuse.test.ts catches now and then in limits.ts's hit(); and
 * OursCard's two stacked doc comments.
 *
 * Every person, address and database here is FICTIONAL. Nothing here
 * connects anywhere: the database is the suite's own, on this machine.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decodeTime } from "ulid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The request this file imitates: its headers, and the work Next would run after the response. */
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
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

import { metadata as rootMetadata } from "@/app/layout";
import PrivacyPage from "@/app/(public)/privacy/page";
import { takeSeat } from "@/app/(public)/seat-actions";
import { OursCard } from "@/components/RightColumn";
import { DOOR_EYEBROW, DOOR_STATUS, DOOR_WHAT, ENTRANCES, MEMBER_JOIN, TAGLINE } from "@/components/public/door";
import { FirstScreenFormView } from "@/components/public/FirstScreenForm";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, WAITING_LIST_LABEL } from "@/components/public/join";
import { scanKitText, scanRepoPublicText, ALLOWLIST } from "@/core/claims";
import { dayOf, nameNeed, NEED_MAX, NEED_TOO_LONG, needsCount, normalizeNeed } from "@/core/needs";
import { needs, seatState as seatRow, waitlist } from "@/core/schema";
import { SEATS_CLOSED } from "@/core/seats";
import { at, db, makeAccount, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
/** The commit this re-check is of: round one's fixes (1625db6) and their receipts. */
const BUILT = "34ef203";
const FORM_FILE = "src/components/public/FirstScreenForm.tsx";

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** A git command's output (local history only). */
function git(args: string[]): { status: number; out: string } {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? -1, out: r.stdout ?? "" };
}
function gitOut(args: string[]): string {
  const r = git(args);
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return r.out;
}
/** A file as 34ef203 has it, so evidence about a file a fix would change holds after the fix. */
const then = (rel: string) => gitOut(["show", `${BUILT}:${rel}`]);

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
const asRecord = (s: string) => s.replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
/** SPEC.md as a reader reads it. */
const specOf = (md: string) => flat(md).replace(/[*`]/g, "");
const spec = () => specOf(read("SPEC.md"));
/** A source file read as prose: comment markers at the start of a line dropped, whitespace collapsed. */
const proseOf = (src: string) => flat(src.replace(/^\s*(?:\/\*\*?|\*\/|\*(?!\/)|\/\/)[ \t]?/gm, ""));
const prose = (rel: string) => proseOf(read(rel));
/** A source file without its comments. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

const render = (component: unknown, props: object | null = null) => renderToStaticMarkup(createElement(component as () => null, props));
const door = (props: Partial<FrontDoorProps> = {}) =>
  render(FrontDoor, { joining: true, email: null, count: 10, seatsOpen: 0, seatsWaiting: 0, needs: 0, ...props });

/** The first screen's markup: the hero section. */
function hero(html: string): string {
  const start = html.indexOf('aria-labelledby="door-title"');
  const from = html.lastIndexOf("<section", start);
  return html.slice(from, html.indexOf("</section>", from) + "</section>".length);
}

/** What takes focus, in the order the markup has it: links by their words, fields by name, buttons by their words. */
function focusOrder(html: string): string[] {
  const found: [number, string][] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) found.push([m.index!, textOf(m[1]!)]);
  for (const m of html.matchAll(/<input\b[^>]*\bname="([^"]*)"[^>]*>/g)) if (!/type="hidden"/.test(m[0])) found.push([m.index!, `input ${m[1]}`]);
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) found.push([m.index!, textOf(m[1]!)]);
  return found.sort((a, b) => a[0] - b[0]).map(([, label]) => label);
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

/* ------------------------------------------------------------------ CSS */

type CssRule = { media: string | null; selectors: string[]; body: string };

/** The rules of a stylesheet in source order, each with the media query it sits in. */
function cssRules(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: CssRule[] = [];
  const walk = (s: string, media: string | null) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{", i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;
        j++;
      }
      const inner = s.slice(open + 1, j - 1);
      if (head.startsWith("@media")) walk(inner, head.replace(/^@media\s*/, ""));
      else if (!head.startsWith("@")) out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner });
      i = j;
    }
  };
  walk(source, null);
  return out;
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/!important/, "").trim().replace(/\s+/g, " ")]));
}

/** Whether a media query holds for a width and a pointer; a query on anything else (colour scheme, motion, scripting) is not this context. */
function mediaApplies(media: string | null, width: number, coarse: boolean): boolean {
  if (media === null) return true;
  return media.split(",").some((query) =>
    query.split(/\s+and\s+/).every((f) => {
      const m = /^\(?\s*([\w-]+)\s*:\s*([^)]+?)\s*\)?$/.exec(f.trim());
      if (!m) return false;
      const [, name, v] = m as unknown as [string, string, string];
      if (name === "max-width") return width <= parseFloat(v);
      if (name === "min-width") return width >= parseFloat(v);
      if (name === "pointer") return (v === "coarse") === coarse;
      return false;
    }),
  );
}

const DOOR_CSS = read("src/components/public/door.module.css");
const GLOBALS = read("src/app/globals.css");
const DOOR_RULES = cssRules(DOOR_CSS);

/** The value of `prop` for exactly `selector` at a width: the last rule in source order that applies. */
function valueAt(selector: string, prop: string, width: number, coarse = false): string | undefined {
  let found: string | undefined;
  for (const r of DOOR_RULES) {
    if (!mediaApplies(r.media, width, coarse) || !r.selectors.includes(selector)) continue;
    const v = declarations(r.body)[prop];
    if (v !== undefined) found = v;
  }
  return found;
}

/* ------------------------------------------------------------------ setup */

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  db();
});

/* ============================================================== findings */

describe("findings (each FAILS on 34ef203, and passes once fixed)", () => {
  it("DEFECT (MEDIUM): H1's fix is not what its row says: a need keeps the day in created_at, but its id is newId(), a ULID, whose first ten characters are the time to the millisecond, so the pairing H1 reported is one decode away, on every day and not only on a quiet one. Through takeSeat, one need with one address: the need's id decodes to 8–13 ms from the address's row in the waiting list (served on 3743, Chromium 153, scripts on and off: the id 01M46G562R… is 17:00:36.312Z against the address's 17:00:36.299Z, and 01M46GRZ30… is 17:11:24.512Z against 17:11:24.504Z), the manifest's own row 'Seat requests: your email address, and when you asked for a seat' keeps that time beside the address, and twelve needs in a row come out in id order. The words that say otherwise: the privacy notice and our.one.json ('Not your address: a need is kept apart from it, with the day and not the time.'), SPEC §18.23 ('so a need isn't paired with a seat request by the time it came'), needs.ts ('so the words and the day are all that is kept'), 1625db6's message ('so it is no longer paired with a seat request to the minute'), the verification receipt's residual ('A need's day can still pair it with an address on a quiet day'), and the comment of the adapted honesty test ('no longer pairs a need with the address that came with it to the minute'); AGENTS.md §10, M-0021 ('nothing links a need to an address') and D-0024 ('Prohibited under this decision: keeping a need with its address'). The adapted test checked created_at alone and dropped the pairing assertions the verifier wrote. Rated MEDIUM, as H1 was. Either the id carries no time (a random token) or the sentence stops saying so", async () => {
    const NOTICE = "Not your address: a need is kept apart from it, with the day and not the time.";
    // Evidence: the words, as 34ef203 has them (read from git, so they hold after a fix).
    expect(then("apps/web/our.one.json")).toContain(NOTICE);
    expect(proseOf(then("apps/web/src/app/(public)/privacy/page.tsx"))).toContain("with the day and not the time.");
    expect(specOf(then("apps/web/SPEC.md"))).toContain("so a need isn't paired with a seat request by the time it came");
    expect(proseOf(then("apps/web/src/core/needs.ts"))).toContain("so the words and the day are all that is kept");
    expect(flat(gitOut(["log", "-1", "--format=%B", "1625db6"]))).toContain("so it is no longer paired with a seat request to the minute");
    expect(asRecord(then("receipts/conformance/2026-10-05-M-0021.verification.md"))).toContain("A need's day can still pair it with an address on a quiet day (H1).");
    expect(proseOf(then("apps/web/tests/verify-m0021-honesty.test.ts"))).toContain("no longer pairs a need with the address that came with it to the minute");
    expect(then("apps/web/our.one.json")).toContain("Seat requests: your email address, and when you asked for a seat.");

    // One submit from the first screen: a visitor, no seat open, an address and a need.
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.50");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar app" }))).toEqual({ ok: true });
    await runLater();
    const [need] = await db().select().from(needs);
    const [waiting] = await db().select().from(waitlist);
    expect(waiting?.email).toBe("mara_f@example.test");
    // What the fix did, and holds: created_at is the start of the UTC day.
    expect(need!.createdAt.toISOString()).toBe(dayOf(need!.createdAt).toISOString());

    // What it left: the id.
    let gapMs = Number.POSITIVE_INFINITY;
    try {
      gapMs = Math.abs(decodeTime(need!.id) - waiting!.createdAt.getTime());
    } catch {
      // not a ULID: it carries no time
    }
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) ids.push(await nameNeed(db(), { text: `app number ${i}` }));
    const inOrder = ids.every((id, i) => i === 0 || id > ids[i - 1]!);

    // The defect: the notice says 'the day and not the time' while the row's id is the time and pairs the need with the address.
    const claimsDay = textOf(render(PrivacyPage)).includes("with the day and not the time");
    expect(claimsDay && (gapMs < 60_000 || inOrder), `the notice says the day and not the time: ${claimsDay}; the need's id decodes to ${gapMs} ms from the address's row; twelve needs' ids are in order: ${inOrder}`).toBe(false);
  });

  it("DEFECT (MEDIUM): R4's controlled fields lose what was typed before the page's script has run. FirstScreenForm starts its state at { email: '', need: '' } and each onChange writes { ...typed, <field>: value }, so text already in the DOM when React hydrates (typed on a slow connection before the script ran, the case R1 made work) is not in the state, and the first keystroke in either field afterwards sets the other to ''. Measured on the production build on 3743, Chromium 153: with the script requests held 3 s, the address typed before the script and the need after it left the address field empty; with nothing held, only 'Fast 3G' and a CPU 4x slower, the form is in the page at 642 ms, the address was typed at 818 ms, the script had run at 2,597 ms, and typing the need emptied the address; and with both typed before the script and the form submitted after it, a refusal ('Enter a valid email address.') returned both fields empty. Before R4's fix the fields were uncontrolled, so only the browser held their words. R4's row and 1625db6's message ('the fields are controlled, so a refusal keeps the address and the need'); SPEC §18.23's R4 bullet; D-0024 §C ('the form is the entrance') and M-0021 ('one thing to do that works'); the people the first screen is for come from a post, on phones. Pins the cause: controlled fields whose state starts empty, with no read of the DOM and no values from the action's answer", () => {
    // Evidence: how the fields are controlled at 34ef203 (read from git, so it holds after a fix).
    const was = then(`apps/web/${FORM_FILE}`);
    expect(was).toContain("useState<Typed>(NOTHING_TYPED)");
    expect(was).toContain("onType({ ...typed, email: event.target.value })");
    expect(was).toContain("onType({ ...typed, need: event.target.value })");
    expect(was).not.toMatch(/\b(?:useEffect|useLayoutEffect|useRef)\b/);

    // The defect: fields controlled from a state that starts empty, and nothing puts the DOM's words into it.
    const now = code(read(FORM_FILE));
    const controlled = /\bvalue=\{/.test(now);
    const readsTheDom = /\b(?:useEffect|useLayoutEffect|useRef|useSyncExternalStore)\b|new FormData\(|\.elements\b/.test(now);
    expect({ controlled, readsTheDom, fine: !controlled || readsTheDom }).toEqual({ controlled, readsTheDom, fine: true });
  });

  it("DEFECT (LOW): R4's claim is unconditional, and holds only while the page's script runs. SPEC §18.23's R4 bullet ('the fields are controlled, so after a refusal the address and the need stay'), 1625db6's message and the receipt's row say a refusal keeps what was typed; with scripts disabled in Chromium 153 (a native POST, which R1 made work: 200, the error shown) a refusal comes back with both fields empty, and so it does for a submit made before the script has run (the script requests held 6 s, the form posted natively: 200, the error shown, both fields empty), because the words live only in client state and the refusal carries none (SeatResult is { ok: true } | { error; field? }). AGENTS.md §10 (a claim carries its condition). Return the typed words with the refusal and render them as defaultValue (which also closes the finding above), or say 'with JavaScript'", () => {
    // Evidence: the sentence as 34ef203 words it, and what a refusal carries.
    expect(specOf(then("apps/web/SPEC.md"))).toContain("the fields are controlled, so after a refusal the address and the need stay (R4)");
    expect(then("apps/web/src/app/(public)/seat-actions.ts")).toContain('export type SeatResult = { ok: true } | { error: string; field?: "need" };');

    // The defect: the sentence names no condition, and the refusal returns no words.
    const sentence = spec().match(/the fields are controlled[^;]*\(R4\)/)?.[0] ?? "";
    const qualified = /with JavaScript|without JavaScript|while the page'?s script|once the page'?s script|after the page'?s script|native/i.test(sentence);
    const resultType = read("src/app/(public)/seat-actions.ts").match(/export type SeatResult =[\s\S]*?(?=\n\s*\n)/)?.[0] ?? "";
    const carriesWords = /\b(?:email|need|values|typed)\??:/.test(resultType);
    expect({ sentence, qualified, carriesWords, fine: qualified || carriesWords }).toEqual({ sentence, qualified, carriesWords, fine: true });
  });

  it("DEFECT (LOW): a request that never arrives replaces the whole front door with the app's error page, and takes the typed words with it. Measured on the production build on 3743, Chromium 153 at 375×812: the address and the need typed, the network set offline, the button pressed: after 3 s the page held 'Something went wrong on our side. Nothing you did caused this. Try again in a moment.' and a 'Try again' button, the headline, the pledge, the count and the form were gone, and so were the typed words; the feed's form and the Projects panel's do the same (older than M-0021). The action's server side catches everything and answers in the form (the database down gives 'Something went wrong. Please try again.' at the address, which the verifiers checked); a rejected action (offline, a dropped connection, a 502 from the edge) reaches React's nearest error boundary, which is src/app/error.tsx, and its sentence ('on our side', 'Nothing you did caused this') is untrue of the phone's own connection. D-0024 §C ('one thing to do, and it should work') and M-0021's human outcome ('one thing to do that works') for people who come from a post, on mobile networks; AGENTS.md §10 for the sentence. Noted as LOW because the older forms share it; a boundary around the form (or a catch that keeps the form's answer inline) closes it for the first screen", () => {
    // Evidence: the app's one boundary, and its sentence.
    expect(then("apps/web/src/app/error.tsx")).toContain("Something went wrong on our side");
    expect(proseOf(then("apps/web/src/app/error.tsx"))).toContain("Nothing you did caused this. Try again in a moment.");
    const wasFiles = gitOut(["ls-tree", "-r", "--name-only", BUILT, "apps/web/src"]).trim().split("\n").filter((f) => /\.tsx?$/.test(f));
    expect(wasFiles.length).toBeGreaterThan(100);
    expect(wasFiles.filter((f) => /getDerivedStateFromError|componentDidCatch/.test(then(f)))).toEqual([]);

    // The defect: nothing between the form and the app's boundary catches a rejected action.
    const nearTheForm = filesUnder("src/components").filter((f) => /getDerivedStateFromError|componentDidCatch/.test(read(f)));
    const catchesItself = /\bcatch\b/.test(code(read(FORM_FILE)));
    expect({ nearTheForm, catchesItself, fine: nearTheForm.length > 0 || catchesItself }).toEqual({ nearTheForm, catchesItself, fine: true });
  });

  it("DEFECT (LOW): H4's fix says more than it does. SPEC §18.23 and need-words.ts say the bidirectional controls are dropped; normalizeNeed drops nine (U+202A–U+202E, U+2066–U+2069) and keeps three of Unicode's twelve Bidi_Control characters: U+200E and U+200F (the left-to-right and right-to-left marks) and U+061C (the Arabic letter mark), so 'a<LRM>b' is kept as it is (tried through normalizeNeed, and in tsx on the same file). AGENTS.md §10; 1625db6's message ('and the bidirectional controls'). Either the function drops the three or the sentence names the nine", () => {
    // Evidence: the claim as 34ef203 has it, and what the function does with each of the twelve.
    expect(specOf(then("apps/web/SPEC.md"))).toContain("control characters dropped (Unicode's Cc, the C1 set included, and the bidirectional controls)");
    expect(proseOf(then("apps/web/src/core/need-words.ts"))).toContain("and the bidirectional controls dropped");
    for (const c of ["\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"]) expect(normalizeNeed(`a${c}b`)).toBe("ab");
    const twelve = [...Array(0x10000).keys()].map((n) => String.fromCharCode(n)).filter((c) => /\p{Bidi_Control}/u.test(c));
    expect(twelve).toHaveLength(12);

    // The defect: the sentence claims them all, and three are kept.
    const claims = spec().includes("and the bidirectional controls") || prose("src/core/need-words.ts").includes("and the bidirectional controls");
    const kept = twelve.filter((c) => normalizeNeed(`a${c}b`)?.includes(c)).map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
    expect({ claims, kept: claims ? kept : [] }).toEqual({ claims, kept: [] });
  });

  it("DEFECT (LOW): H6's corrected comment in app/layout.tsx is wrong again. It says that without APP_URL 'Next writes the image's address from the platform's own (on Vercel) or from the request's host'; served from the production build with APP_URL unset (port 3748), a request with Host: localhost:3748 and one with Host: our-fictional.example.test were both given http://localhost:3748/card.png in og:image and twitter:image: Next's fallback is localhost with the server's own port, or the Vercel deployment's address (next/dist/lib/metadata/resolvers/resolve-url.js, getSocialImageMetadataBaseFallback), and it reads no header. H6's finding was the old sentence (the path 'left relative'); the new one is untrue in its second half, and the test that closed H6 checks that the old sentence is gone, not that the new one is so. AGENTS.md §10", () => {
    // Evidence: the sentence as 34ef203 has it, and what Next does (its own source, as installed).
    expect(proseOf(then("apps/web/src/app/layout.tsx"))).toContain("Without one, Next writes the image's address from the platform's own (on Vercel) or from the request's host.");
    const resolver = join(WEB, "node_modules/next/dist/lib/metadata/resolvers/resolve-url.js");
    if (existsSync(resolver)) {
      const source = readFileSync(resolver, "utf8");
      expect(source).toMatch(/localhost:\$\{process\.env\.PORT \|\| 3000\}/);
      expect(source).not.toMatch(/\bheaders\b|x-forwarded-host/);
    }

    // The defect: the layout still says the request's host.
    expect(prose("src/app/layout.tsx")).not.toMatch(/from the request'?s host/);
  });

  it("DEFECT (LOW): the guard for the architect's own catch pins one spelling. A wrapper around takeSeat made the server render the form's action as 'javascript:throw …', so the form did nothing without JavaScript (1625db6's message; the verification receipt); tests/first-screen.test.ts guards it by requiring the text useActionState<SeatResult | null, FormData>(takeSeat, null) and forbidding an async function there. Run in a scratch copy of apps/web on 34ef203 with the wrapper put back as the first attempt wrote it, the guard fails (1 of 23); with the same wrapper at the other end, action={(form: FormData) => formAction(form)} in FirstScreenForm, or a local function handed to FirstScreenFormView in its place, the whole file passes (23 of 23), though react-dom/server renders 'javascript:throw …' for either wrapper and a proper form for the dispatch itself (tried with a stand-in for a server action reference, in the closed check below, which fails for all three wrappers). Nothing in the guard looks at what reaches <form action>", () => {
    const tests = read("tests/first-screen.test.ts");
    const blocks = tests.split(/\n {2}it\(/).filter((b) => b.includes("takeSeat, null"));
    expect(blocks.length).toBeGreaterThan(0);
    const guard = code(blocks.join("\n"));
    // Evidence: it pins the argument of useActionState.
    expect(guard).toContain("(takeSeat, null)");
    expect(guard).toMatch(/useActionState<\[\^>\]\*>/);
    // The defect: it does not pin the attribute the dispatch has to reach unwrapped.
    expect(/action=\\?\{/.test(guard), "no assertion in the guard names the form's action={…}").toBe(true);
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: R1 holds, on every form that posts the same way, and no page leaks across origins what it didn't before — Chromium 153 on the production build (3743) with scripts disabled: the first screen's form, the feed's, the Projects panel's and the sign-in form each posted natively with Origin http://localhost:3743 and got 200 (the first screen's with 'Check your email' and its need kept, with a query string as a post's link carries one too); from /i/<code> a cross-origin navigation carried no Referer, a cross-origin fetch and a cross-origin image were refused by the content security policy, and a same-origin fetch carried the full address to this server alone. The meta tag and the header both say same-origin, the policy lets no other origin in, every link that leaves the site says noreferrer, and the invite page's note is so", () => {
    expect(rootMetadata.referrer).toBe("same-origin");
    const config = read("next.config.ts");
    expect(config).toContain('{ key: "Referrer-Policy", value: "same-origin" }');
    for (const directive of ["default-src 'self'", "connect-src 'self'", "img-src 'self' data:", "form-action 'self'", "frame-ancestors 'none'"]) expect(config).toContain(directive);
    const offenders: string[] = [];
    for (const file of filesUnder("src").filter((f) => f.endsWith(".tsx"))) {
      for (const m of read(file).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/noreferrer/.test(m[0])) offenders.push(`${file}: ${m[0].slice(0, 90)}`);
    }
    expect(offenders).toEqual([]);
    expect(prose("src/app/(public)/i/[code]/page.tsx")).toContain("the referrer policy (next.config.ts) keeps it from leaking to other sites");
    // The four forms that post natively are the ones that use a server action.
    for (const file of [FORM_FILE, "src/components/public/GetInForm.tsx", "src/app/(public)/signin/SignInForm.tsx"]) expect(code(read(file)), file).toMatch(/useActionState/);
    // Nothing reads the Referer, so the full same-origin address is seen by no code of ours.
    expect(filesUnder("src").filter((f) => /referer\b/i.test(read(f)))).toEqual([]);
  });

  it("closed: R2's layout holds at every width, light and dark, in every state — Chromium 153 on 3743: 31 widths from 320 to 1920 (including 760, 761, 899, 900, 901, 1050, 1051, 1449 and 1450) as a visitor, light and dark, with and without touch below 1024, and on 3743 as a member, on 3746 (no data controller, joining closed) and on 3747 (database port closed) at 320, 375, 761, 900, 901, 1450 and 1920, light and dark: scrollWidth equal to clientWidth, no box past an edge, no two of the first screen's blocks intersecting, no word broken mid-word, the strip below the hero; a layout shift of 0 at 1440 and, with Fast 3G and a CPU 4x slower, at 375; the button's bottom at 671 for 1200 to 1449 (the 1280, 1366 and 1440 windows), 695 to 739 for 901 to 1100, 992 to 1014 for 761 to 900, 1,020 at 375 and 1,165 at 320. Pinned in the stylesheet: two tracks from 901 (1.12fr and 1fr, 1.4fr and 1fr from 1450, both minmax(0, …) so content can't widen a track), one column from 900 down and a flex column from 760, the same five areas the markup assigns, in the markup's order", () => {
    const areas = (w: number) => valueAt(".hero", "grid-template-areas", w);
    const columns = (w: number) => valueAt(".hero", "grid-template-columns", w);
    const TWO = '"eyebrow eyebrow" "title act" "what act" "picture act"';
    const ONE = '"eyebrow" "title" "what" "act" "picture"';
    for (const w of [901, 960, 1000, 1050, 1051, 1280, 1449]) {
      expect([w, columns(w), areas(w), valueAt(".hero", "display", w)]).toEqual([w, "minmax(0, 1.12fr) minmax(0, 1fr)", TWO, "grid"]);
    }
    for (const w of [1450, 1536, 1920]) expect([w, columns(w), areas(w)]).toEqual([w, "minmax(0, 1.4fr) minmax(0, 1fr)", TWO]);
    for (const w of [761, 800, 820, 899, 900]) expect([w, columns(w), areas(w), valueAt(".hero", "display", w)]).toEqual([w, "minmax(0, 1fr)", ONE, "grid"]);
    for (const w of [320, 375, 760]) expect([w, valueAt(".hero", "display", w), valueAt(".hero", "flex-direction", w)]).toEqual([w, "flex", "column"]);
    // The two rules meet at 900/901 with no width left out.
    expect(DOOR_CSS).toMatch(/@media \(max-width: 900px\) \{\s*\.hero \{/);
    // Each area the grid names has one element, and the markup has the elements in the grid's one-column order.
    const assigned: [string, string][] = [[".hero > .eyebrow", "eyebrow"], [".headline", "title"], [".heroWhat", "what"], [".heroAct", "act"], [".diagram", "picture"]];
    for (const [selector, area] of assigned) expect(valueAt(selector, "grid-area", 1440), selector).toBe(area);
    expect(valueAt(".heroAct", "max-width", 1440)).toBe("590px");
    const states: Partial<FrontDoorProps>[] = [{}, { member: true }, { joining: false, seatsOpen: null, seatsWaiting: null, needs: null }, { count: null, seatsOpen: null, seatsWaiting: null, needs: null }, { seatsOpen: 5, seatsWaiting: 0, needs: 37 }];
    for (const state of states) {
      const h = hero(door(state));
      const positions = ["eyebrow", "<h1", "heroWhat", "heroAct", "diagram"].map((token) => h.indexOf(token));
      expect(positions.every((p) => p > 0), JSON.stringify(state)).toBe(true);
      expect([...positions].sort((a, b) => a - b), JSON.stringify(state)).toEqual(positions);
    }
    // The type: the sizes the sweep measured.
    expect([1440, 1450, 1050, 761, 400, 375].map((w) => valueAt(".headline", "font-size", w))).toEqual([
      "clamp(56px, 7.2vw, 102px)",
      "111px",
      "76px",
      "76px",
      "clamp(54px, 13.4vw, 88px)",
      "52px",
    ]);
    // The overflow guard that turns a too-wide word into a break rather than a sideways scroll.
    expect(/\.public \{[^}]*overflow-wrap: break-word/.test(GLOBALS)).toBe(true);
  });

  it("closed: R3 holds — no id appears twice on the front door, the first screen's labels point at its own two fields (first-screen-email, first-screen-need), the Projects panel's at field-email, and every aria-describedby, aria-labelledby and aria-controls resolves (Chromium 153 on 3743: 41 ids as a visitor and 37 as a member, none repeated, before and with each of the three draft dialogs open; a label bound to its own form's field)", () => {
    const html = door();
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toEqual(expect.arrayContaining(["first-screen-email", "first-screen-need", "field-email"]));
    for (const m of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) expect(ids, `label for=${m[1]}`).toContain(m[1]);
    for (const m of html.matchAll(/\baria-(?:describedby|labelledby|controls)="([^"]+)"/g)) for (const id of m[1]!.split(/\s+/)) expect(ids, `aria ref ${id}`).toContain(id);
    expect([...hero(html).matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1])).toEqual(["first-screen-email", "first-screen-need"]);
    expect(ids.filter((id) => id.startsWith("field-"))).toEqual(["field-email"]);
  });

  it("closed: R4 holds while the script runs, and the 'adjust state while rendering' pattern neither loops nor warns — Chromium 153 on 3743 (production) and on a development server (3745, React's warnings on): a malformed address with a need refused at the address and both kept; an over-long need (past maxLength by script) refused at the need with the address kept, then corrected by select-all and a new need, then answered with both fields empty and the need kept; a refusal after an answer drops the answer; autofill-like events (the native setter, input and change, in one tick) kept both fields, and so did a keystroke after them; an IME composition ended at the typed words; a 200-character paste stopped at the maxLength 140; three quick clicks sent one request and kept one need; the button was disabled while the request was pending, the address stayed editable; the console held only the HMR line", () => {
    const src = code(read(FORM_FILE));
    expect(src).toContain("disabled={pending}");
    // The mechanism as 34ef203 has it; these three apply while the fields are controlled, and a fix that returns the words with the refusal replaces them.
    if (/\bvalue=\{typed\./.test(src)) {
      const refused = renderToStaticMarkup(
        createElement(FirstScreenFormView, { state: { error: NEED_TOO_LONG, field: "need" }, action: () => {}, pending: false, lines: [], needs: null, typed: { email: "mara_f@example.test", need: "the calendar" } }),
      );
      expect(refused).toContain('value="mara_f@example.test"');
      expect(refused).toContain('value="the calendar"');
      expect(src).toContain('if (state !== null && !("error" in state)) setTyped(NOTHING_TYPED);');
      expect([...src.matchAll(/setTyped\(NOTHING_TYPED\)/g)]).toHaveLength(1);
      expect(src).toMatch(/if \(state !== seen\) \{\s*setSeen\(state\);/);
    }
  });

  it("closed: R5 holds — 'How that works' is 44px tall on a touch screen (Chromium 153 with touch at 320, 375, 820 and 1024: 98×44; the build link 44; the two fields 48.1 and the button 52; 'See where it stands.' and the new 'Privacy' link are inline links in a sentence, a line tall, which WCAG 2.5.8 excepts), and the rule is the stylesheet's under (pointer: coarse) only", () => {
    expect(valueAt(".heroPledgeLink", "min-height", 375, true)).toBe("44px");
    expect(valueAt(".heroPledgeLink", "display", 375, true)).toBe("inline-flex");
    expect(valueAt(".heroPledgeLink", "align-items", 375, true)).toBe("center");
    expect(valueAt(".heroPledgeLink", "min-height", 1440, false)).toBeUndefined();
    expect(valueAt(".textLink", "min-height", 375, true)).toBe("44px");
    expect(hero(door())).toMatch(/<a\b[^>]*class="[^"]*heroPledgeLink[^"]*"[^>]*href="\/contract"|<a\b[^>]*href="\/contract"[^>]*class="[^"]*heroPledgeLink/);
  });

  it("closed: H1 holds as far as it goes — a need's created_at is the start of the UTC day (2026-10-05T17:42:09Z is kept as 2026-10-05T00:00:00Z, 23:59:59.999 the same, the next midnight the next day), its row has three columns and no address, the migration, its journal entry, its snapshot and its down file are byte for byte what 089cbcd had, and the privacy page and the manifest carry the same sentence for the row", async () => {
    await nameNeed(db(), { text: "the calendar app", now: at("2026-10-05T17:42:09Z") });
    const [row] = await db().select().from(needs);
    expect(row!.createdAt.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(Object.keys(row!).sort()).toEqual(["createdAt", "id", "text"]);
    expect(dayOf(at("2026-10-05T23:59:59.999Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(dayOf(at("2026-10-06T00:00:00Z")).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(git(["diff", "--quiet", "089cbcd", BUILT, "--", "apps/web/drizzle"]).status).toBe(0);
    const page = textOf(render(PrivacyPage));
    const what = /Apps you name What (.*?) Why /.exec(page)?.[1];
    expect(what).toBeTruthy();
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string }[] } };
    expect(manifest.data.collects.find((c) => c.what.startsWith("Apps you name:"))?.what).toBe(`Apps you name: ${what}`);
  });

  it("closed: H2 holds — the feed's own privacy note, with its link to /privacy, closes the first screen's form block when the form shows (Chromium 153: 'Privacy' is the sixth of the first screen's seven Tab stops, after the button; 5.79:1 on the paper, 7.93 dark), is the same words as the feed panel's two sections down, and is absent for a member and while joining is closed", () => {
    const NOTE = "We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.";
    const h = hero(door({ needs: 2 }));
    expect(textOf(h)).toContain(NOTE);
    const toPrivacy = [...h.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => m[1] === "/privacy").map((m) => textOf(m[2]!));
    expect(toPrivacy).toEqual(["Privacy"]);
    expect(textOf(door({ needs: 2 })).split(NOTE)).toHaveLength(3);
    const text = textOf(h);
    const order = ["Join the waiting list", "No seats are open right now.", "Free to join.", "2 apps named so far.", NOTE, ENTRANCES.builders];
    let last = -1;
    for (const part of order) {
      const next = text.indexOf(part, last + 1);
      expect(next, part).toBeGreaterThan(last);
      last = next;
    }
    expect(textOf(hero(door({ member: true })))).not.toContain(NOTE);
    expect(textOf(hero(door({ joining: false, seatsOpen: null, seatsWaiting: null, needs: null })))).not.toContain(NOTE);
  });

  it("closed: H3 holds for case and whitespace — 'The calendar app', 'the calendar app' and '  the  CALENDAR<tab>app ' are one app and 'the group chat' another, so the public count reads 2 (Chromium 153 on 3743 after the form tests: the page read '5 apps named so far.' with six rows, two of them the same text). The case is Postgres's lower(), which folds what the database's ctype folds: this suite's database has ctype C, where 'École' and 'école' are two, and the deployed database's ctype could not be checked here, so non-ASCII case is noted and not filed", async () => {
    const t = at("2026-10-05T17:42:09Z");
    for (const text of ["The calendar app", "the calendar app", "  the  CALENDAR\tapp ", "the group chat"]) await nameNeed(db(), { text, now: t });
    expect(await needsCount(db())).toBe(2);
  });

  it("closed: H4 holds for the controls it names — tabs, newlines and carriage returns collapse to one space; the C1 controls (U+0085, U+009B) and the C0 ones and DEL are dropped; a need made only of controls is none; the nine embeddings, overrides and isolates are dropped; a need of 140 characters is kept and one of 141 refused, counting characters and not UTF-16 units (140 emoji are kept); and the database's check counts the same way", async () => {
    expect(normalizeNeed("the\tcalendar\napp\r\nplease")).toBe("the calendar app please");
    expect(normalizeNeed("the\u0085calendar\u009bapp")).toBe("thecalendarapp");
    expect(normalizeNeed("\u0000\u0007\u001b\u007f\u009b")).toBeNull();
    expect(normalizeNeed("   ")).toBeNull();
    expect(normalizeNeed("a‪b‫c‬d‭e‮f⁦g⁧h⁨i⁩j")).toBe("abcdefghij");
    expect(normalizeNeed("x".repeat(NEED_MAX))).toHaveLength(NEED_MAX);
    expect(() => normalizeNeed("x".repeat(NEED_MAX + 1))).toThrow(NEED_TOO_LONG);
    const emoji = "😀".repeat(NEED_MAX);
    expect(normalizeNeed(emoji)).toBe(emoji);
    expect(() => normalizeNeed(`${emoji}x`)).toThrow(NEED_TOO_LONG);
    await nameNeed(db(), { text: emoji });
    expect((await db().select().from(needs)).map((r) => [...r.text].length)).toEqual([NEED_MAX]);
  });

  it("closed: H5 holds — og:image:alt is the headline and the status line, which is what the picture says (Chromium 153: the 1200×630 card.png shows the wordmark, the eyebrow, the headline and 'Founder-led today. User control isn't built yet.'), the tag is served so on /, /feed and /contract to Twitterbot/1.0, facebookexternalhit/1.1 and Slackbot-LinkExpanding 1.0, and /card.png comes back image/png, 53,558 bytes, byte for byte the committed file", () => {
    const images = (rootMetadata.openGraph as unknown as { images?: { url: string; alt?: string; width?: number; height?: number }[] } | undefined)?.images ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ url: "/card.png", width: 1200, height: 630, alt: `${TAGLINE} ${DOOR_STATUS}` });
    expect(images[0]!.alt).toBe("The software we live in should be ours. Founder-led today. User control isn't built yet.");
    const card = read("scripts/card.html");
    for (const sentence of [DOOR_EYEBROW, DOOR_STATUS]) expect(card).toContain(sentence);
    const png = readFileSync(join(WEB, "public/card.png"));
    expect(png.length).toBe(53_558);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(rootMetadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/card.png"] });
  });

  it("closed: H8 holds, down the whole import chain — nothing the first screen's form imports, directly or through another module, reaches the schema, the database layer, drizzle, pg, ulid, node:crypto or the ids (a 'use server' module stops the chain, as Next makes it a reference), and the built front door loads one chunk /feed doesn't, 15,802 bytes (1h0js1x-cy5vy.js), where it was 493,730; no built chunk holds needs_text_length or PgTable", () => {
    const files = new Set<string>();
    const packages = new Set<string>();
    const boundaries = new Set<string>();
    const queue = [join(WEB, FORM_FILE)];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (files.has(file)) continue;
      files.add(file);
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use server["']/.test(src)) {
        boundaries.add(file.slice(WEB.length));
        continue;
      }
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
        const spec = (m[1] ?? m[2])!;
        if (spec.endsWith(".css")) continue;
        if (spec.startsWith("@/") || spec.startsWith(".")) {
          const base = spec.startsWith("@/") ? join(WEB, "src", spec.slice(2)) : join(dirname(file), spec);
          const hit = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((e) => base + e).find((p) => existsSync(p) && statSync(p).isFile());
          if (hit) queue.push(hit);
        } else packages.add(spec);
      }
    }
    const reached = [...files].map((f) => f.slice(WEB.length));
    expect(reached).toContain("src/core/need-words.ts");
    expect([...boundaries]).toEqual(["src/app/(public)/seat-actions.ts"]);
    for (const forbidden of ["src/core/schema.ts", "src/core/db.ts", "src/core/ids.ts", "src/core/needs.ts", "src/core/seats.ts"]) expect(reached, forbidden).not.toContain(forbidden);
    expect([...packages].filter((p) => /^(?:drizzle-orm|pg|ulid|resend|node:)/.test(p))).toEqual([]);
  });

  it("closed: the link card is on every page and on the two pages that share the layout — Chromium 153 and curl on 3743: /, /feed, /contract, /agreement, /build, /costs, /maintainers, /power, /privacy, /projects, /rules, /signin, /join, /unsubscribe, /i/<code> and an address with no route (404) each served og:title, og:description, og:site_name, og:image (absolute, from APP_URL), its width, height and alt, og:type, twitter:card summary_large_image, twitter:title, twitter:description and twitter:image; the app's error page (a member's /home with the database port closed, 500) served the same; only the root layout sets openGraph or twitter, and the not-found and error pages set no metadata of their own", () => {
    expect(rootMetadata.openGraph).toMatchObject({ siteName: "our.one", type: "website" });
    expect(rootMetadata.twitter).toMatchObject({ card: "summary_large_image" });
    const setters = filesUnder("src/app").filter((f) => /\bopenGraph\b|\btwitter\s*:/.test(code(read(f))));
    expect(setters).toEqual(["src/app/layout.tsx"]);
    for (const file of ["src/app/not-found.tsx", "src/app/error.tsx"]) expect(code(read(file)), file).not.toMatch(/export (?:const metadata|async function generateMetadata)/);
    expect(String(rootMetadata.metadataBase)).toBe(`${process.env.APP_URL}/`);
  });

  it("closed: the change stayed inside M-0021's scope and left the feed, the contract, the agreement and the drafts alone — the 58 files changed from 0376b3e to 34ef203 are all under apps/web/**, receipts/builds/** or receipts/conformance/** and none under a denied path; /feed's page and form, the contract, the agreement, the drafts, the lede and the handover's words are byte for byte what 0376b3e had; join.ts lost only its import line and gained ofThreshold", () => {
    const yaml = readRoot("mandates/M-0021.yaml");
    const list = (name: string) => [...(new RegExp(`\\n\\s+${name}:\\n((?:\\s+- .*\\n)+)`).exec(yaml)?.[1] ?? "").matchAll(/- (.+)/g)].map((m) => m[1]!.trim());
    const toRegExp = (glob: string) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
    const allow = list("allow").map(toRegExp);
    const deny = list("deny").map(toRegExp);
    expect(list("allow")).toEqual(["apps/web/**", "receipts/builds/**", "receipts/conformance/**"]);
    expect(deny.length).toBeGreaterThan(10);
    const changed = gitOut(["diff", "--name-only", "0376b3e", BUILT]).trim().split("\n");
    expect(changed).toHaveLength(58);
    expect(changed.filter((p) => !allow.some((r) => r.test(p)))).toEqual([]);
    expect(changed.filter((p) => deny.some((r) => r.test(p)))).toEqual([]);
    const unchanged = [
      "apps/web/src/components/public/FrontPage.tsx",
      "apps/web/src/components/public/GetInForm.tsx",
      "apps/web/src/components/public/Draft.tsx",
      "apps/web/src/components/public/drafts.ts",
      "apps/web/src/components/public/lede.ts",
      "apps/web/src/components/public/handover.ts",
      "apps/web/src/app/(public)/feed/page.tsx",
      "apps/web/src/app/(public)/contract/page.tsx",
      "apps/web/src/app/(public)/agreement/page.tsx",
    ];
    for (const path of unchanged) expect(git(["diff", "--quiet", "0376b3e", BUILT, "--", path]).status, path).toBe(0);
    const removed = gitOut(["diff", "-U0", "0376b3e", BUILT, "--", "apps/web/src/components/public/join.ts"]).split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(removed).toEqual(['-import { formatCount } from "./handover";']);
    expect(read("src/components/public/join.ts")).toContain("export function ofThreshold(n: number): string");
  });

  it("closed: the receipts' numbers and statuses are true, rerun on 34ef203 under env -i — 69 test files and three it.skip (M-0018's recorded one, M-0020's R12, R2's phone part); the claims scan: no prohibited claim in 181 files, 19 sentences listed; the kit's check READY TO PROPOSE; typecheck, lint and a production build passed; the whole suite ran 1,743 passed, 3 skipped and 1 failed — tests/verify-abuse.test.ts 'closed: thirty reports fired at once stop at exactly twenty', which failed in the full run and in 8 of 13 reruns of that test alone, is not M-0021's, and was not investigated beyond reading limits.ts's hit() (21 reports were allowed where 20 are expected; hit() counts only rows up to its own start time, so concurrent calls may miss each other's row) — the receipts' 1,744 passed is what the suite gives when that race goes the other way; both receipts carry one state, TESTED, and no claim of a deploy; round one's 8 and 5 findings are the verifiers' 8 and 5 'fixed (' titles, and no DEFECT title remains in either verifier file", () => {
    const tests = gitOut(["ls-tree", "--name-only", BUILT, "apps/web/tests/"]).trim().split("\n").filter((f) => f.endsWith(".test.ts"));
    expect(tests).toHaveLength(69);
    const skipped = tests.flatMap((f) => (then(f).match(/^\s*it\.skip\(/gm) ?? []).map(() => f)).sort();
    expect(skipped).toEqual(["apps/web/tests/verify-m0018-honesty.test.ts", "apps/web/tests/verify-m0020-rendering.test.ts", "apps/web/tests/verify-m0021-rendering.test.ts"]);
    const build = asRecord(then("receipts/builds/2026-10-05-M-0021.md"));
    expect(build).toContain("Status: TESTED locally, after round one of the independent verification (13 findings fixed, one part recorded). The re-check is next. Nothing is pushed or deployed.");
    expect(build).toContain("| Tests (vitest, real Postgres) | CHECKED | 1,744 pass, 3 skipped (M-0020's R12, one older, and the phone's part of R2), in 69 files on 1625db6 |");
    expect(build).toContain("| Claims scan | CHECKED | no prohibited claim in 181 files; 19 sentences listed |");
    expect(asRecord(then("receipts/conformance/2026-10-05-M-0021.verification.md"))).toContain("1,744 tests pass and 3 are skipped");
    expect(build).not.toMatch(/\bDEPLOYED\b|\bOBSERVED\b/);
    const pages = scanRepoPublicText(WEB);
    const kit = scanKitText(WEB);
    expect([...pages.hits, ...kit.hits]).toEqual([]);
    expect(pages.files.length + kit.files.length).toBe(181);
    expect(ALLOWLIST).toHaveLength(19);
    const check = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } });
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("RESULT: READY TO PROPOSE.");
    const honesty = read("tests/verify-m0021-honesty.test.ts");
    const rendering = read("tests/verify-m0021-rendering.test.ts");
    expect([...honesty.matchAll(/^\s*it\("fixed \(/gm)]).toHaveLength(8);
    expect([...rendering.matchAll(/^\s*it\("fixed \(/gm)]).toHaveLength(5);
    expect([...rendering.matchAll(/^\s*it\.skip\("recorded, not fixed \(/gm)]).toHaveLength(1);
    expect(honesty + rendering).not.toMatch(/\bit\("DEFECT/);
  });

  it("closed: the real FirstScreenForm renders a form that posts without JavaScript, and any wrapper between the server action and <form action> would break it — rendered here (react-dom/server) with a stand-in for the server action reference Next hands a client component (a function with $$FORM_ACTION whose bind keeps it): the form is action=\"\" method=\"POST\" with the hidden $ACTION_ID field, and not action=\"javascript:throw …\"; the same stand-in wrapped in an async function inside useActionState, or in an arrow function at <form action>, gives 'javascript:throw …' (the three wirings, rendered). This is the behaviour the architect's guard stands in for, and it fails for either wrapper where the guard fails for one", async () => {
    const FunctionBind = Function.prototype.bind;
    type Reference = ((...args: unknown[]) => Promise<{ ok: true }>) & { $$FORM_ACTION?: () => object };
    const reference: Reference = async () => ({ ok: true });
    reference.$$FORM_ACTION = () => ({ name: "$ACTION_ID_fictional", method: "POST", encType: "multipart/form-data", data: null });
    reference.bind = function (this: Reference, ...args: unknown[]) {
      const bound = FunctionBind.apply(this, args as [unknown, ...unknown[]]) as Reference;
      bound.$$FORM_ACTION = this.$$FORM_ACTION;
      return bound;
    } as typeof reference.bind;

    vi.resetModules();
    vi.doMock("@/app/(public)/seat-actions", () => ({ takeSeat: reference }));
    try {
      const { createElement: h, useActionState } = await import("react");
      const { renderToStaticMarkup: renderHtml } = await import("react-dom/server");
      const { FirstScreenForm } = await import("@/components/public/FirstScreenForm");
      const real = renderHtml(h(FirstScreenForm, { lines: [], needs: null }));
      const formTag = /<form\b[^>]*>/.exec(real)?.[0] ?? "";
      expect(formTag).toContain('action=""');
      expect(formTag).toContain('method="POST"');
      expect(real).toContain('name="$ACTION_ID_fictional"');
      expect(real).not.toContain("javascript:throw");
      // The three wirings, for the record.
      type Answer = { ok: true } | null;
      const action = reference as unknown as (previous: Answer, form: FormData) => Promise<Answer>;
      const WrappedInState = () => {
        const [, dispatch] = useActionState<Answer, FormData>(async (previous, form) => action(previous, form), null);
        return h("form", { action: dispatch });
      };
      const WrappedAtForm = () => {
        const [, dispatch] = useActionState<Answer, FormData>(action, null);
        return h("form", { action: (form: FormData) => dispatch(form) });
      };
      expect(renderHtml(h(WrappedInState))).toContain("javascript:throw");
      expect(renderHtml(h(WrappedAtForm))).toContain("javascript:throw");
    } finally {
      vi.doUnmock("@/app/(public)/seat-actions");
      vi.resetModules();
    }
  });

  it("closed: the architect's guard catches the first attempt's wrapper — the guard in tests/first-screen.test.ts requires useActionState<SeatResult | null, FormData>(takeSeat, null) and forbids an async function as its first argument; run in a scratch copy of apps/web on 34ef203 with the wrapper put back as the first attempt wrote it ('async (previous, form) => takeSeat(previous, form)'), exactly that test failed (1 of 23), and with the guard's own text restored all 23 passed", () => {
    const guard = code(read("tests/first-screen.test.ts").split(/\n {2}it\(/).filter((b) => b.includes("takeSeat, null")).join("\n"));
    expect(guard).toContain('toContain("useActionState<SeatResult | null, FormData>(takeSeat, null)")');
    expect(guard).toContain("not.toMatch(/useActionState<[^>]*>\\(\\s*async/)");
    expect(guard).toContain('expect(rootMetadata.referrer).toBe("same-origin")');
    // The same two assertions, run on the source as it is, and on the source with the first attempt's wrapper put back.
    const accepts = (src: string) => src.includes("useActionState<SeatResult | null, FormData>(takeSeat, null)") && !/useActionState<[^>]*>\(\s*async/.test(src);
    const source = read(FORM_FILE);
    expect(accepts(source)).toBe(true);
    expect(accepts(source.replace("(takeSeat, null)", "(async (previous: SeatResult | null, form: FormData) => takeSeat(previous, form), null)"))).toBe(false);
  });

  it("closed: the recorded part is put to the founder truthfully, and its options are what the code can do — the form's button is about 1,020px down at 375×812 (1,019.9 measured on 3743; 1,050 with touch emulation's taller link; 1,165 at 320×568), 1,020 over 812 is a screen and a quarter, SPEC §18.23 and both receipts say so, and the skipped test keeps the finding as written; of the three options, a different order on a phone is CSS (order, inside the act block) and a way to the form from the top is an id and a link, and nothing in the markup stands in the way of either (the form's block has no id at 34ef203, read from git). The picture is on the first screen at every width, which D-0024 §A's list doesn't name, and the build receipt says that too", () => {
    expect(1020 / 812).toBeGreaterThan(1.2);
    expect(1020 / 812).toBeLessThan(1.3);
    expect(spec()).toContain("so the button is about 1,020px down at 375×812: recorded for the founder, not changed");
    const verification = asRecord(readRoot("receipts/conformance/2026-10-05-M-0021.verification.md"));
    const build = asRecord(readRoot("receipts/builds/2026-10-05-M-0021.md"));
    for (const receipt of [verification, build]) {
      expect(receipt).toContain("a screen and a quarter");
      expect(receipt).toContain('a "Join the waiting list" link under the headline');
    }
    expect(read("tests/verify-m0021-rendering.test.ts")).toContain('it.skip("recorded, not fixed (MEDIUM, phones):');
    expect(then(`apps/web/${FORM_FILE}`)).toMatch(/<div className=\{styles\.heroJoin\}>/);
    expect(then(`apps/web/${FORM_FILE}`)).not.toMatch(/heroJoin\}\s+id=/);
    expect(asRecord(readRoot("decisions/D-0024.md"))).toContain("In this order, and nothing else: the headline; what it is; the promise, with the count against its threshold; the status; one form.");
    expect(build).toContain("D-0024 §A's list doesn't name it");
  });

  it("closed: the hero reads and tabs in the decided order — the markup has the eyebrow, the headline, what it is, the promise, the status, the form, the builders' link, then the picture, which holds nothing focusable; the Tab order is 'How that works', 'See where it stands.', the address, the need, the button, 'Privacy', 'I want to build' (Chromium 153 at 1440×900 and 375×812: the same stops, in the same order, each of them in the act block, from the skip link through the header's six stops to the strip's three; the accessibility tree reads the heading, the line, the promise's figure with its link, the status with its link, the form with both fields' names and the button, then the picture); a member's stops are 'How that works', 'See where it stands.', 'Open your feed', 'I want to build'", () => {
    const h = hero(door({ needs: 2 }));
    expect(focusOrder(h)).toEqual(["How that works", "See where it stands.", "input email", "input need", "Join the waiting list", "Privacy", `${ENTRANCES.builders} ↗`]);
    expect(focusOrder(hero(door({ member: true })))).toEqual(["How that works", "See where it stands.", "Open your feed", `${ENTRANCES.builders} ↗`]);
    const pictureStart = h.indexOf('aria-labelledby="orbit-title orbit-desc"');
    expect(pictureStart).toBeGreaterThan(h.indexOf("heroAct"));
    expect(focusOrder(h.slice(pictureStart))).toEqual([]);
    const text = textOf(h);
    let last = -1;
    for (const part of [DOOR_EYEBROW, TAGLINE, DOOR_WHAT, "10 of 100,000", "How that works", DOOR_STATUS, "Your email", "Which app would you take back?", "Join the waiting list", "Privacy", ENTRANCES.builders]) {
      const next = text.indexOf(part, last + 1);
      expect(next, part).toBeGreaterThan(last);
      last = next;
    }
  });

  it("closed: the new line's colours — the privacy note and its link are --sub on the paper, 5.79:1 in the light and 7.93:1 in the dark (Chromium 153: every text run on the first screen at 4.5:1 or more in both schemes, the lowest 5.79 light and 7.15 dark)", () => {
    const hex = (block: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i").exec(block)?.[1];
    const light = /\n\.public \{([\s\S]*?)\n\}/.exec(GLOBALS)?.[1] ?? "";
    const dark = /@media \(prefers-color-scheme: dark\) \{\s*\.public \{([\s\S]*?)\n  \}/.exec(GLOBALS)?.[1] ?? "";
    const lum = (h: string) => {
      const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
    };
    expect(valueAt(".joinSmall", "color", 1440)).toBe("var(--sub)");
    expect(ratio(hex(light, "--sub")!, hex(light, "--paper")!)).toBe(5.79);
    expect(ratio(hex(dark, "--sub")!, hex(dark, "--paper")!)).toBe(7.93);
  });

  it("closed: the member's first screen and the panel beside a member's feed — Chromium 153 on 3743 as the FICTIONAL @bruno_varnell: 'You're in.' and 'Open your feed' (to /home) stand in the form's place, with the count ('10 of 100,000') and no field, at 320, 375, 761, 900, 901, 1450 and 1920px, light and dark; /home's panel read '10 of 100,000 people are in.' between the panel's text and its two buttons, beside the column at 1440 and 1000px and after it at 375, light and dark at 1440, nothing scrolled sideways; the panel's count is read in the app's layout with its failure caught, and left out when it can't be read", () => {
    const member = hero(door({ member: true, needs: 6 }));
    expect(textOf(member)).toContain(MEMBER_JOIN.line);
    expect(textOf(member)).toContain("10 of 100,000");
    expect([...member.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].filter((m) => textOf(m[2]!) === MEMBER_JOIN.link).map((m) => m[1])).toEqual(["/home"]);
    expect(member).not.toContain("<form");
    expect(member).not.toContain("<input");
    expect(textOf(member)).not.toContain("named so far");
    expect(textOf(render(OursCard, { email: null, count: 11 }))).toContain("11 of 100,000 people are in.");
    expect(textOf(render(OursCard, { email: null, count: null }))).not.toContain("100,000");
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toMatch(/memberCount\(db\)\.catch\(/);
    expect(layout).toContain("count={count}");
  });

  it("closed: the seats' states — none open: 'Join the waiting list', the seat line ('No seats are open right now. Seats go to whoever has waited longest.') and the free line; some open and nobody waiting: 'Join our.one' and the free line alone; some open with addresses waiting: 'Join the waiting list' without the seat line; unreadable: 'Join our.one'; joining closed: 'Joining opens soon.' and the invite line, no form, the count still read (Chromium 153 on 3743 with seat_state at 0 and at 5, with 11 addresses waiting and with none, and on 3746 and 3747: the same words, and the layout's invariants held in each)", () => {
    const SEAT_LINE = "No seats are open right now. Seats go to whoever has waited longest.";
    const none = textOf(hero(door({ seatsOpen: 0, seatsWaiting: 0 })));
    expect(none).toContain(WAITING_LIST_LABEL);
    expect(none).toContain(SEAT_LINE);
    expect(none).toContain(FREE_LINE);
    const some = textOf(hero(door({ seatsOpen: 5, seatsWaiting: 0 })));
    expect(some).toContain(JOIN_LABEL);
    expect(some).not.toContain(SEAT_LINE);
    expect(some).toContain(FREE_LINE);
    const waiting = textOf(hero(door({ seatsOpen: 5, seatsWaiting: 11 })));
    expect(waiting).toContain(WAITING_LIST_LABEL);
    expect(waiting).not.toContain(SEAT_LINE);
    const unread = textOf(hero(door({ seatsOpen: null, seatsWaiting: null })));
    expect(unread).toContain(JOIN_LABEL);
    expect(unread).not.toContain(SEAT_LINE);
    const closed = hero(door({ joining: false, seatsOpen: null, seatsWaiting: null, needs: null }));
    expect(textOf(closed)).toContain(SEATS_CLOSED);
    expect(textOf(closed)).toContain(INVITE_CLOSED_LINE);
    expect(textOf(closed)).toContain("10 of 100,000");
    expect(closed).not.toContain("<form");
  });

  it("closed: the other forms and the drafts on the same page work beside the first screen's — Chromium 153 on 3743: the Projects panel's form (field-email, 'Join the waiting list') answered a FICTIONAL address with the one answer while the first screen's form showed nothing, with scripts on and off; 'Draft an idea first', 'Draft a need' and 'Draft an idea' each opened a modal dialog with focus in its field, and Escape closed it with focus back on the button, with no id repeated before or after; the three draft buttons, the feed panel's form and its words are the markup and source 0376b3e had", () => {
    const html = door();
    for (const label of ["Draft an idea first", "Draft a need", "Draft an idea"]) expect([...html.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/g)].some((m) => textOf(m[1]!).startsWith(label)), label).toBe(true);
    const projects = html.slice(html.indexOf('id="projects"'));
    expect(projects).toContain('id="field-email"');
    expect(textOf(projects)).toContain(WAITING_LIST_LABEL);
    expect(hero(html)).not.toContain('id="field-email"');
    for (const path of ["apps/web/src/components/public/GetInForm.tsx", "apps/web/src/components/public/Draft.tsx", "apps/web/src/components/public/drafts.ts"]) expect(git(["diff", "--quiet", "0376b3e", BUILT, "--", path]).status, path).toBe(0);
  });

  it("closed: H6's other two comments and H7's count are so — FrontDoor.tsx's header orders the page as the first screen has it (the message, what it is, the promise with the count against its threshold, what holds today, the form, the builders' entrance as a text link), seat-actions.ts says a need that isn't kept is logged by name and the log line is there, and the receipt's 'nineteen' older tests adapted is the number of it() blocks that carry 'Changed under M-0021' (nineteen, in fourteen files, outside the two verifiers' own)", () => {
    expect(prose("src/components/public/FrontDoor.tsx").slice(0, 900)).toContain("the first screen (D-0024 §A): the message, what it is, the promise with the count against its threshold, what holds today, the form, and the builders' entrance as a text link");
    expect(prose("src/app/(public)/seat-actions.ts")).toContain("the failure is logged by name");
    expect(code(read("src/app/(public)/seat-actions.ts"))).toContain("[ours] a need wasn't kept:");
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
    expect(found.size).toBe(19);
    expect(new Set([...found].map((f) => f.split(":")[0])).size).toBe(14);
    expect(asRecord(then("receipts/builds/2026-10-05-M-0021.md"))).toContain('Older tests adapted, nineteen of them, each with "Changed under M-0021" and its reason');
  });

  it("closed: a need is read by no code but the count — the needs table is imported only by core/needs.ts and the schema's own tests, the words are never rendered (no component or page reads a need's text), and the front door asks only for the number", () => {
    const readers = filesUnder("src").filter((f) => /import\s*\{[^}]*\bneeds\b[^}]*\}\s*from\s*"(?:@\/core\/schema|\.\/schema)"/.test(read(f)));
    expect(readers).toEqual(["src/core/needs.ts"]);
    const importers = filesUnder("src").filter((f) => /from "(?:@\/core\/needs|\.\/needs)"/.test(read(f)));
    expect(importers).toEqual(["src/app/(public)/page.tsx", "src/app/(public)/seat-actions.ts"]);
    expect(code(read("src/app/(public)/page.tsx"))).toContain("needsCount(getDb())");
    expect(code(read("src/app/(public)/seat-actions.ts"))).toContain("nameNeed(getDb(), { text })");
  });
});
