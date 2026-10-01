/**
 * The re-check of M-0014 (the reason, and the invitation): step 4 of the
 * verification M-0014.md declares, written by an agent that built nothing
 * and fixed nothing, against 6bbf256. Two verifiers checked dcff190
 * (verify-m0014-honesty.test.ts and verify-m0014-render.test.ts, committed
 * as written in dcd57d0 and d56f8fc); the architect recorded D-0016 §N
 * (962b3f6) and fixed what they found (6bbf256; SPEC §18.16, "Decisions
 * after the verification"). Nothing in the product, the records or another
 * test is changed by this file.
 *
 * Stopping rule, declared before the first test was written. Each of the
 * ten items D-0016 §N records is read in the code and tried, once each,
 * where it can fail; and the verifiers' adapted tests are read against what
 * they were:
 *
 * - Items 1 and 2, the button: on the product's own paths in seats.ts, with
 *   the route rendered each time — nothing open; one waiting; a seat open
 *   and nobody waiting; a seat given back by a failed seat email; two open
 *   and one waiting; a seat reopened by a removal from the line; a
 *   member's address; an address that holds a seat; the address at the
 *   front of the line; the seats unreadable (the database down).
 * - Items 3, 4 and 8: the records' exact text (D-0016 §N) against the
 *   rendered pages and against the sources the records cite.
 * - Item 5: the exception for a suspended account, against
 *   src/core/export.ts, /settings/delete, /settings/export and /contract's
 *   promise 4.
 * - Item 6: the invite page's line in production with and without
 *   CLIENT_IP_HEADER, in development with none and with one that is not a
 *   header name, and with no controller, against the front page and what
 *   requestJoin does.
 * - Item 7: the new scan rule with neighbouring forms that should be caught,
 *   and with every true sentence: the scan over the real files and over the
 *   rendered pages, the invite page and the mails among them.
 * - Items 9 and 10: the link and the polish in the rendered markup and the
 *   CSS, and in Chrome 154 (headless, on the development server at
 *   http://localhost:3310, serving 6bbf256's tree; the invite page, which
 *   needs an invite in that server's database, was rendered here and laid
 *   out in the server's own stylesheets): contrast in both themes; the tap
 *   target with touch emulation; the card at every width from 340 to
 *   412px; the not-found footer from 1024 to 2560px; the status line every
 *   2px from 320 to 1480px on /, /power, /costs, /rules, /privacy and the
 *   not-found page.
 * - The adaptation: git diff d56f8fc..6bbf256 and dcd57d0..6bbf256 of the
 *   two verifiers' files, and dcd57d0..6bbf256 of the other test files the
 *   fixes changed (claims, contract, front-page, verify-m0013-honesty),
 *   read assertion by assertion.
 *
 * Each try ends here as a test:
 *
 * - "DEFECT (SEVERITY): …" asserts what should be true. It FAILS on
 *   6bbf256, and the failure is the evidence. HIGH: a false or misleading
 *   statement to a visitor, a handover or ownership claim, broken content;
 *   MEDIUM: an overstatement, a weakened test hiding something, a fix that
 *   does not hold on some path; LOW: imprecision, polish.
 * - "closed: …" is a check that was tried and held. It passes. "closed (for
 *   a person …)" pins what holds today where only a person can judge it.
 *
 * What only a browser can measure is in the titles, as the verifiers wrote
 * theirs. Everyone here is FICTIONAL, with an example.test address; client
 * addresses are keyed hashes of the documentation ranges (RFC 5737).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
// The phone's post rows and the app's header ask for the router; nothing navigates here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    prefetch: () => undefined,
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
// Server actions are rendered as form targets, never called: the paths below call the core.
vi.mock("@/app/(public)/seat-actions", () => ({ takeSeat: vi.fn(async () => ({ ok: true })) }));

import AppNotFound from "@/app/(app)/not-found";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import InvitePage from "@/app/(public)/i/[code]/page";
import PublicLayout from "@/app/(public)/layout";
import FrontPageRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import NotFound from "@/app/not-found";
import { FrontPage, type FrontPageProps } from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { MAINTAINER, NOTICE_DAYS } from "@/components/public/handover";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { JOIN_LABEL, joinLabel, WAITING_LIST_LABEL } from "@/components/public/join";
import { RightColumn, SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { deleteAccount } from "@/core/accounts";
import { ALLOWLIST, formatHit, PROHIBITED, publicTextFiles, scanRepoPublicText, scanText } from "@/core/claims";
import { DEFAULT_INVITES, HANDOVER_THRESHOLD } from "@/core/config";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { createInvite, JOIN_REQUESTS_OFF, requestJoin } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import * as mailTemplates from "@/core/mail-templates";
import { type Account, outbox, waitlist } from "@/core/schema";
import { forgetWaitlistAddress, openSeats, requestSeat, seatState } from "@/core/seats";
import { at, db, makeAccount, plus, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
const FRONT = "src/components/public/FrontPage.tsx";
const CONTRACT = "src/app/(public)/contract/page.tsx";
const RULES_FILE = "src/components/public/floorRules.ts";
const INVITE_PAGE = "src/app/(public)/i/[code]/page.tsx";
/** A public page in the scan's reach with no ALLOWLIST entry. */
const ANOTHER_PAGE = "src/app/(public)/signin/page.tsx";

const SEAT_LINE = "No seats are open right now. Seats go to whoever has waited longest.";
const SETTINGS_SENTENCE = "In Settings, you can download your profile, posts, replies and connections, and delete it all.";
const SUSPENDED_SENTENCE = "If your account is suspended, write to us and we will do it for you.";
const NEVER_QUESTION = `What if it never gets to ${T}?`;
const CARD_HANDOVER = `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`;
const PROMISE = `When ${T} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`;

/* ================================================================ helpers */

/** Visible text of rendered HTML: scripts dropped, every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

/** A page's sentences, block by block (a heading never runs into the paragraph after it). */
function sentencesOf(html: string): string[] {
  return textOf(html.replace(/<\/(?:h[1-6]|p|li|dt|dd|div|section|header|footer|nav|figcaption|blockquote)>/g, "\u0001"))
    .split("\u0001")
    .flatMap((block) => block.trim().split(/(?<=[.?!])\s+(?=[A-Z0-9"“])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function render(props: FrontPageProps): string {
  return renderToStaticMarkup(createElement(FrontPage, props));
}

async function renderRoute(): Promise<string> {
  return renderToStaticMarkup((await FrontPageRoute()) as ReactElement);
}

/** A component rendered with no props, as a page or a footer is. */
function rendered(component: (props: never) => unknown): string {
  return renderToStaticMarkup(createElement(component as unknown as () => ReactElement));
}

async function invitePage(code: string): Promise<string> {
  return renderToStaticMarkup((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement);
}

/** A record as one line of text: blockquote markers, emphasis and code ticks dropped, whitespace collapsed. */
function asRecord(raw: string): string {
  return raw
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ");
}

function readRecord(path: string): string {
  return asRecord(readFileSync(join(REPO_ROOT, path), "utf8"));
}

/** D-0016 §N, "Corrections made after the verification", as one line. */
function sectionN(): string {
  const raw = readFileSync(join(REPO_ROOT, "decisions/D-0016.md"), "utf8");
  const from = raw.indexOf("### N. Corrections made after the verification");
  const to = raw.indexOf("## Prohibited under this decision");
  if (from < 0 || to < from) throw new Error("D-0016 §N not found");
  return asRecord(raw.slice(from, to));
}

/** A rendered sentence written as the records write it, with their placeholders. */
function withPlaceholders(sentence: string): string {
  return sentence
    .replaceAll(T, "[threshold]")
    .replace(`${MAINTAINER}, maintainer`, "[maintainer], maintainer")
    .replace(`me, ${MAINTAINER}.`, "me, [maintainer].")
    .replace(`${NOTICE_DAYS} days' notice`, "[notice] days' notice")
    .replace(`${DEFAULT_INVITES} invites`, "[invites] invites");
}

/** The words on the front page's join button, or null when there is no form. */
function buttonOf(html: string): string | null {
  return html.match(/<button type="submit"[^>]*>([^<]*)<\/button>/)?.[1] ?? null;
}

/** The words on the close's link to the form, or null when there is no close. */
function closeOf(html: string): string | null {
  return html.match(/<a href="#front-get-in" class="btn btn--primary btn--large">([^<]*)<\/a>/)?.[1] ?? null;
}

/** A client address: a keyed hash of a documentation range (RFC 5737). */
const ip = (n: number) => rateKeyHash(`198.51.100.${n % 250}`);

/** The maintainer: the oldest active administrator (FICTIONAL). */
async function maintainer(): Promise<Account> {
  return makeAccount({
    handle: "rado_rc14",
    displayName: "Rado FICTIONAL",
    email: "rado_rc14@example.test",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
  });
}

async function mailsTo(email: string): Promise<number> {
  return (await db().select().from(outbox).where(eq(outbox.toAddress, email))).length;
}

async function line(): Promise<string[]> {
  const rows = await db().select({ email: waitlist.email }).from(waitlist).orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((row) => row.email);
}

/** What the form did with one address, in the words the two labels use. */
async function outcomeFor(email: string, mailsBefore: number): Promise<"a join link" | "a place in line" | "nothing"> {
  if ((await mailsTo(email)) > mailsBefore) return "a join link";
  if ((await line()).includes(email)) return "a place in line";
  return "nothing";
}

/** What each label tells the visitor the form will do. */
function promisedBy(label: string | null): string {
  if (label === JOIN_LABEL) return "a join link";
  if (label === WAITING_LIST_LABEL) return "a place in line";
  return `no form (${String(label)})`;
}

/** The Resend transport chosen but not configured: every send returns ok: false. */
function transportRefuses(): void {
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
}

/** What a core call answered: "OK", or the refusal's code and message. */
async function refusal(attempt: () => Promise<unknown>): Promise<string> {
  try {
    await attempt();
    return "OK";
  } catch (error) {
    return isCoreError(error) ? `${error.code}: ${error.message}` : String(error);
  }
}

/** The front page as the route renders it now, with the seats it read. */
async function frontPageNow(): Promise<{ state: string; open: number; button: string | null; close: string | null; seatLine: boolean }> {
  const { open, waiting } = await seatState(db());
  const html = await renderRoute();
  return {
    state: `${open} open, ${waiting} waiting`,
    open,
    button: buttonOf(html),
    close: closeOf(html),
    seatLine: textOf(html).includes(SEAT_LINE),
  };
}

/** The label D-0016 §N gives: "Join our.one" only with a seat open and nobody waiting. */
function labelFor(state: string): string {
  const [open, waiting] = state.match(/\d+/g)!.map(Number);
  return open! > 0 && waiting === 0 ? JOIN_LABEL : WAITING_LIST_LABEL;
}

/** The claims in a rendered page, read two ways: through the scan's own normalization, and as plain text. */
function renderedHits(html: string, file: string | null = null): string[] {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  return [...scanText(html, file), ...scanText(plain, file)].map(formatHit);
}

/* ---------------------------------------------- markup and CSS (from the rendering verifier) */

const GLOBALS = readFileSync(join(WEB_ROOT, "src/app/globals.css"), "utf8");
const PUBLIC_CSS = readFileSync(join(WEB_ROOT, "src/components/public/public.module.css"), "utf8");

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

type El = { tag: string; attrs: Record<string, string>; children: (El | string)[]; parent: El | null };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [], parent: null };
  let current = root;
  const token = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const m of markup.matchAll(token)) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let el: El | null = current;
      while (el && el.tag !== tag) el = el.parent;
      if (el?.parent) current = el.parent;
    } else if (m[2]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[3] ?? "").matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]!] = decode(a[2] ?? "");
      const el: El = { tag: m[2].toLowerCase(), attrs, children: [], parent: current };
      current.children.push(el);
      if (!m[4] && !VOID.has(el.tag)) current = el;
    } else if (m[5]) {
      current.children.push(decode(m[5]));
    }
  }
  return root;
}

function text(el: El): string {
  const parts: string[] = [];
  const walk = (n: El | string) => (typeof n === "string" ? parts.push(n) : n.children.forEach(walk));
  walk(el);
  return parts.join(" ").replace(/\s+/g, " ").replace(/ ([.,:;?!])/g, "$1").trim();
}

function findAll(el: El, test: (e: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: El) => {
    for (const c of n.children) {
      if (typeof c === "string") continue;
      if (test(c)) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** An element's classes as written in the source: a CSS module's `_fold_73fd6d` is "fold". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-f]{6}$/, "$1"))
    .join(" ");
}

const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);

type CssRule = { media: string | null; selectors: string[]; body: string; order: number };

function cssRules(css: string, start = 0): CssRule[] {
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
      else if (!head.startsWith("@")) out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner, order: start + out.length });
      i = j;
    }
  };
  walk(source, null);
  return out;
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/!important/, "").trim()]),
  );
}

/** Module CSS loads after the global sheet, so it comes later in the cascade. */
const RULES: CssRule[] = [...cssRules(GLOBALS), ...cssRules(PUBLIC_CSS, 100_000)];
/** The rules that apply at every width, on any pointer, in either theme (the themes only swap tokens). */
const BASE = RULES.filter((r) => r.media === null);

function compoundMatches(el: El, compound: string): boolean {
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)$/i.exec(compound);
  if (!m || (!m[1] && !m[2])) return false;
  if (m[1] && el.tag !== m[1].toLowerCase()) return false;
  const own = moduleClass(el).split(" ");
  return (m[2] ?? "").split(".").filter(Boolean).every((c) => own.includes(c));
}

function selectorMatches(el: El, selector: string): boolean {
  const parts = selector.trim().split(/\s+/);
  if (parts.some((p) => /[>+~:[\]*]/.test(p))) return false;
  if (!compoundMatches(el, parts[parts.length - 1]!)) return false;
  let ancestor = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (ancestor && !compoundMatches(ancestor, parts[i]!)) ancestor = ancestor.parent;
    if (!ancestor) return false;
    ancestor = ancestor.parent;
  }
  return true;
}

const specificity = (selector: string) =>
  (selector.match(/\./g)?.length ?? 0) * 10 + (selector.match(/(?:^|\s)[a-z]/gi)?.length ?? 0);

/** The value the cascade gives this element for one property, from these rules. */
function declared(el: El, property: string, rules: CssRule[] = BASE): string | undefined {
  let found: { value: string; spec: number; order: number } | undefined;
  for (const r of rules) {
    const value = declarations(r.body)[property];
    if (value === undefined) continue;
    for (const s of r.selectors) {
      if (!selectorMatches(el, s)) continue;
      const spec = specificity(s);
      if (!found || spec > found.spec || (spec === found.spec && r.order >= found.order)) found = { value, spec, order: r.order };
    }
  }
  return found?.value;
}

/** An inherited property: the element's own value, or the nearest ancestor's. */
function inherited(el: El, property: string, rules: CssRule[] = BASE): string | undefined {
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) {
    const value = declared(e, property, rules);
    if (value !== undefined && value !== "inherit") return value;
  }
  return undefined;
}

/** body's own declarations, which every page inherits. */
const BODY = declarations(BASE.find((r) => r.selectors.includes("body"))!.body);

function tokens(scheme: "light" | "dark"): Record<string, string> {
  const from = scheme === "light" ? 0 : GLOBALS.indexOf("@media (prefers-color-scheme: dark)");
  const start = GLOBALS.indexOf(":root {", from);
  const block = GLOBALS.slice(start, GLOBALS.indexOf("}", start));
  const own = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  return scheme === "light" ? own : { ...tokens("light"), ...own };
}

function resolveColour(value: string, scheme: "light" | "dark"): string {
  const v = /^var\((--[\w-]+)\)$/.exec(value.trim());
  const out = v ? tokens(scheme)[v[1]!] : value.trim();
  if (!out || !/^#[0-9a-f]{6}$/i.test(out)) throw new Error(`not a colour: ${value} (${scheme})`);
  return out.toLowerCase();
}

function colourOf(el: El, scheme: "light" | "dark"): string {
  return resolveColour(inherited(el, "color") ?? "var(--text)", scheme);
}

function backgroundOf(el: El, scheme: "light" | "dark"): string {
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) {
    const value = declared(e, "background-color") ?? declared(e, "background");
    if (value && value !== "transparent" && value !== "none") return resolveColour(value, scheme);
  }
  return resolveColour("var(--bg)", scheme);
}

const underlined = (el: El) => /underline/.test(declared(el, "text-decoration") ?? declared(el, "text-decoration-line") ?? "");

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio, to two decimals. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/* ============================================================== hooks */

let errors: MockInstance<typeof console.error>;

beforeEach(() => {
  // Expected noise: a seat email refused, a database that can't be reached.
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ====================================================================== */
/* Items 1 and 2. The button, on every path of seats.ts                   */
/* ====================================================================== */

describe("the button's words on the paths of seats.ts, the route rendered each time (D-0016 §N items 1 and 2)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: for a newcomer the words now match what the form does on every combination the product reaches — nothing open and nobody waiting; nothing open and one waiting; a seat open and nobody waiting; a seat given back by a failed seat email, its address still waiting; two open after a failed email and one waiting; a seat reopened by a removal at its holder's request, one waiting. The button and the close carry the same label, the seat line shows only with none open, and with an address waiting the newcomer goes in line behind it, whatever is open", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const pia = "pia_rc14@example.test";
    const scenarios: [string, (rado: Account) => Promise<void>][] = [
      ["nothing open, nobody waiting", async () => {}],
      ["nothing open, one waiting", async () => {
        await requestSeat(db(), { email: pia, ipHash: ip(11), now: plus.days(t0, -2) });
      }],
      ["a seat open, nobody waiting", async (rado) => {
        await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
      }],
      ["a seat given back by a failed seat email", async (rado) => {
        await requestSeat(db(), { email: pia, ipHash: ip(11), now: plus.days(t0, -2) });
        transportRefuses();
        await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
        vi.unstubAllEnvs();
      }],
      ["two given back by a failed seat email", async (rado) => {
        await requestSeat(db(), { email: pia, ipHash: ip(11), now: plus.days(t0, -2) });
        transportRefuses();
        expect(await openSeats(db(), rado.id, 2, { now: plus.days(t0, -1) })).toEqual({ opened: 2, invited: 1 });
        vi.unstubAllEnvs();
      }],
      ["a seat reopened by a removal", async (rado) => {
        await openSeats(db(), rado.id, 1, { now: plus.days(t0, -3) });
        await requestSeat(db(), { email: "ana_rc14@example.test", ipHash: ip(12), now: plus.minutes(plus.days(t0, -3), 1) });
        await requestSeat(db(), { email: "ben_rc14@example.test", ipHash: ip(13), now: plus.days(t0, -2) });
        await forgetWaitlistAddress(db(), rado.id, "ana_rc14@example.test");
      }],
    ];
    const seen: Record<string, unknown>[] = [];
    const expected: Record<string, unknown>[] = [];
    for (const [name, arrange] of scenarios) {
      await reset();
      await arrange(await maintainer());
      const page = await frontPageNow();
      await requestSeat(db(), { email: "stan_rc14@example.test", ipHash: ip(40), now: plus.minutes(t0, 1) });
      const label = labelFor(page.state);
      seen.push({ name, state: page.state, button: page.button, close: page.close, seatLine: page.seatLine, stan: await outcomeFor("stan_rc14@example.test", 0) });
      expected.push({ name, state: page.state, button: label, close: label, seatLine: page.open === 0, stan: promisedBy(label) });
    }
    expect(seen.map((s) => `${String(s.name)}: ${String(s.state)}`)).toEqual([
      "nothing open, nobody waiting: 0 open, 0 waiting",
      "nothing open, one waiting: 0 open, 1 waiting",
      "a seat open, nobody waiting: 1 open, 0 waiting",
      "a seat given back by a failed seat email: 1 open, 1 waiting",
      "two given back by a failed seat email: 2 open, 1 waiting",
      "a seat reopened by a removal: 1 open, 1 waiting",
    ]);
    expect(seen).toEqual(expected);
  });

  it("closed: a member's address gets nothing and no place in line under either label, and its request gives an open seat to the oldest address waiting; the unchanged answer covers it ('If this address already has an account, just sign in.')", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const seen: Record<string, unknown>[] = [];
    for (const waiting of [false, true]) {
      await reset();
      const rado = await maintainer();
      await makeAccount({ handle: "mia_rc14", email: "mia_rc14@example.test" });
      if (waiting) await requestSeat(db(), { email: "pia_rc14@example.test", ipHash: ip(11), now: plus.days(t0, -2) });
      if (waiting) transportRefuses();
      await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
      vi.unstubAllEnvs();
      const page = await frontPageNow();
      await requestSeat(db(), { email: "mia_rc14@example.test", ipHash: ip(14), now: plus.minutes(t0, 1) });
      seen.push({
        state: page.state,
        button: page.button,
        mia: await outcomeFor("mia_rc14@example.test", 0),
        pia: waiting ? await outcomeFor("pia_rc14@example.test", 0) : "not waiting",
      });
    }
    expect(seen).toEqual([
      { state: "1 open, 0 waiting", button: JOIN_LABEL, mia: "nothing", pia: "not waiting" },
      { state: "1 open, 1 waiting", button: WAITING_LIST_LABEL, mia: "nothing", pia: "a join link" },
    ]);
    expect(CHECK_YOUR_EMAIL).toContain("If this address already has an account, just sign in.");
  });

  it("closed (D-0016 §N's accepted case, re-checked on the new states): an address that holds a seat reads 'Join the waiting list' with none open (and the seat line) and also with a seat open while another waits (no seat line), and 'Join our.one' with a seat open and nobody waiting; each time asking again sends a new link to its seat — better than the first two labels say, as D-0016 §N and SPEC §18.16 record it, and the answer says 'If a seat was open, your link is there.'", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const lea = "lea_rc14@example.test";
    const seen: Record<string, unknown>[] = [];
    for (const then of ["none open", "a seat open, nobody waiting", "a seat open, another waiting"]) {
      await reset();
      const rado = await maintainer();
      await openSeats(db(), rado.id, 1, { now: plus.days(t0, -3) });
      await requestSeat(db(), { email: lea, ipHash: ip(21), now: plus.minutes(plus.days(t0, -3), 1) });
      if (then === "a seat open, nobody waiting") await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
      if (then === "a seat open, another waiting") {
        await requestSeat(db(), { email: "pia_rc14@example.test", ipHash: ip(11), now: plus.days(t0, -2) });
        transportRefuses();
        await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
        vi.unstubAllEnvs();
      }
      const page = await frontPageNow();
      const before = await mailsTo(lea);
      await requestSeat(db(), { email: lea, ipHash: ip(21), now: plus.minutes(t0, 1) });
      seen.push({ then, state: page.state, button: page.button, seatLine: page.seatLine, lea: await outcomeFor(lea, before) });
    }
    expect(seen).toEqual([
      { then: "none open", state: "0 open, 0 waiting", button: WAITING_LIST_LABEL, seatLine: true, lea: "a join link" },
      { then: "a seat open, nobody waiting", state: "1 open, 0 waiting", button: JOIN_LABEL, seatLine: false, lea: "a join link" },
      { then: "a seat open, another waiting", state: "1 open, 1 waiting", button: WAITING_LIST_LABEL, seatLine: false, lea: "a join link" },
    ]);
    const n = sectionN();
    expect(n).toContain("Accepted, not fixed,");
    expect(n).toContain("An address that already holds a seat. When its link expires, its seat email sends it back to the front page.");
    expect(n).toContain("asking again sends a new link to its seat");
    expect(readRecord("apps/web/SPEC.md")).toContain('a seat holder sent back by its expired link reads "Join the waiting list" and is sent a new link to its seat');
    expect(CHECK_YOUR_EMAIL).toContain("If a seat was open, your link is there.");
  });

  it("DEFECT (LOW): the address at the front of the line reads 'Join the waiting list' and is sent a join link. With a seat open and only that address waiting, the line goes first for it too (seats.ts, requestSeat: `seatOpen && !seat` gives it the seat): Pia, whose seat email failed so the seat came back, asks again; Ben, first in line when a removal reopened a seat, asks. The fix's rule (join.ts, `joinLabel(open, waiting)`) is right for every newcomer but wrong here, where dcff190's ('Join our.one' while a seat is open) was right. M-0014's constraint: 'The button's words match what the form will do with the address'; D-0016 §N accepts only 'An address that already holds a seat.'", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const pia = "pia_rc14@example.test";
    const ben = "ben_rc14@example.test";

    // Pia waits; a seat opens; its email to her fails, so the seat comes back and she keeps her place.
    let rado = await maintainer();
    await requestSeat(db(), { email: pia, ipHash: ip(11), now: plus.days(t0, -2) });
    transportRefuses();
    await openSeats(db(), rado.id, 1, { now: plus.days(t0, -1) });
    vi.unstubAllEnvs();
    const piaPage = await frontPageNow();
    expect([piaPage.state, piaPage.seatLine, await mailsTo(pia)]).toEqual(["1 open, 1 waiting", false, 0]);
    await requestSeat(db(), { email: pia, ipHash: ip(11), now: plus.minutes(t0, 1) });
    const piaGot = await outcomeFor(pia, 0);

    // Ana holds a seat and asks to be removed; her seat reopens with Ben first in line.
    await reset();
    rado = await maintainer();
    await openSeats(db(), rado.id, 1, { now: plus.days(t0, -3) });
    await requestSeat(db(), { email: "ana_rc14@example.test", ipHash: ip(12), now: plus.minutes(plus.days(t0, -3), 1) });
    await requestSeat(db(), { email: ben, ipHash: ip(13), now: plus.days(t0, -2) });
    await forgetWaitlistAddress(db(), rado.id, "ana_rc14@example.test");
    const benPage = await frontPageNow();
    expect([benPage.state, benPage.seatLine]).toEqual(["1 open, 1 waiting", false]);
    await requestSeat(db(), { email: ben, ipHash: ip(13), now: plus.minutes(t0, 1) });
    const benGot = await outcomeFor(ben, 0);

    // On dcff190 the label read only the seats open: "Join our.one" here, which matched what happens.
    expect(promisedBy(joinLabel(1))).toBe("a join link");
    expect(sectionN()).not.toMatch(/front of the line|first in line|oldest address waiting/);
    expect(
      { pia: { button: piaPage.button, got: piaGot }, ben: { button: benPage.button, got: benGot } },
      "the button's words against what the form did with the address that waited longest",
    ).toEqual({
      pia: { button: piaPage.button, got: promisedBy(piaPage.button) },
      ben: { button: benPage.button, got: promisedBy(benPage.button) },
    });
  });

  it("closed (for a person, the first of D-0016 §N's five readings): with the database unreachable the route still renders — no count line, the button and the close 'Join our.one', no seat line — and logs both reads by name only; a seat may then be open or not, and the unchanged answer covers either", async () => {
    await maintainer();
    const good = process.env.DATABASE_URL!;
    let html = "";
    process.env.DATABASE_URL = "postgresql://localhost:1/ours_web_test_fictional_down";
    try {
      html = await renderRoute();
    } finally {
      process.env.DATABASE_URL = good;
      db();
    }
    const text = textOf(html);
    expect({
      button: buttonOf(html),
      close: closeOf(html),
      seatLine: text.includes(SEAT_LINE),
      count: /Nobody is in yet|person is in|people are in/.test(text),
    }).toEqual({ button: JOIN_LABEL, close: JOIN_LABEL, seatLine: false, count: false });
    expect(errors.mock.calls.map((call) => String(call[0])).sort()).toEqual([
      "[ours] front page: the count could not be read:",
      "[ours] front page: the seats could not be read:",
    ]);
    expect(sectionN()).toContain(`"Join our.one" when the seats can't be read (§B chose it);`);
    expect(CHECK_YOUR_EMAIL).toContain("If a seat was open, your link is there. If not, you're in line");
  });

  it("closed (for a person): M-0014's acceptance test still reads 'The button and the close say \"Join our.one\" when a seat is open or the seats can't be read'; the build now says 'Join the waiting list' with a seat open and an address waiting, as D-0016 §N says, whose exact wording the founder has not yet reviewed. A decision ranks above a mandate (AGENTS.md §3, items 5 and 7), and mandates were not amended after M-0013's verification either; whether M-0014's receipt must say acceptance test 2 was superseded is a person's call", () => {
    const mandate = readRecord("mandates/M-0014.yaml");
    expect(mandate).toContain(
      `The button and the close say "Join our.one" when a seat is open or the seats can't be read, and "Join the waiting list" when none is open;`,
    );
    expect([joinLabel(1, 1), joinLabel(1, 0), joinLabel(0, 0), joinLabel(null, null)]).toEqual([
      WAITING_LIST_LABEL,
      JOIN_LABEL,
      WAITING_LIST_LABEL,
      JOIN_LABEL,
    ]);
    const n = sectionN();
    expect(n).toContain(`"Join our.one" only when a seat is open and no address waits; otherwise "Join the waiting list"`);
    expect(n).toContain("The founder's review of this record's exact wording, this section included, is pending.");
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents.indexOf("5. valid decisions")).toBeLessThan(agents.indexOf("7. the implementation Mandate"));
  });
});

/* ====================================================================== */
/* Item 5. A suspended account                                            */
/* ====================================================================== */

describe("what a suspended account can do (D-0016 §N item 5)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: the paragraph about the maintainer now ends with /contract's promise 4 exception, word for word, right after the Settings sentence; it holds against the code — a suspended account's export and deletion are refused (NOT_FOUND), and /settings/export and /settings/delete need a signed-in viewer — and 'write to us' has an address for the one person it is for: the suspension email names the controller, and so does /privacy", async () => {
    const front = parse(render({ joining: true, count: null, seatsOpen: null }));
    const paragraph = findAll(front, (e) => e.tag === "p" && text(e).includes("In Settings"))[0]!;
    expect(text(paragraph).endsWith(`${SETTINGS_SENTENCE} ${SUSPENDED_SENTENCE}`)).toBe(true);
    expect(textOf(rendered(ContractPage))).toContain(
      `You can leave with everything: download your profile, posts, replies and connections, and delete it all, whenever you want. For anything else we hold about you, write to us. ${SUSPENDED_SENTENCE}`,
    );

    const sam = await makeAccount({ handle: "sam_rc14", email: "sam_rc14@example.test", suspended: true });
    expect({
      download: await refusal(() => exportAccount(db(), sam.id)),
      remove: await refusal(() => deleteAccount(db(), sam.id, "sam_rc14")),
    }).toEqual({ download: "NOT_FOUND: That isn't available.", remove: "NOT_FOUND: That isn't available." });
    for (const file of ["src/app/(app)/settings/delete/page.tsx", "src/app/(app)/settings/export/route.ts"]) {
      expect(readFileSync(join(WEB_ROOT, file), "utf8"), file).toContain("await requireViewer()");
    }
    expect(mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", "controller@example.test").body).toContain(
      "To get a copy or have it deleted, write to controller@example.test.",
    );
    expect(textOf(rendered(PrivacyPage))).toContain(
      "If your account is suspended, you can't sign in to do either: write to the controller at controller@example.test to get a copy or have it deleted.",
    );
  });

  it(`DEFECT (LOW): the answer to '${NEVER_QUESTION}' still says '…and you can still download your profile, posts, replies and connections, and delete it all.' with no exception: untrue for a suspended account, whose export and deletion are refused. The finding named 'the front page's two sentences' (D-0016 §G and §H); D-0016 §N's table changes only §G's, and the adapted test passes because its check reads the whole page (/suspended|write to us/ matches the one added sentence)`, async () => {
    const front = parse(render({ joining: true, count: null, seatsOpen: null }));
    const question = findAll(front, (e) => e.tag === "dt" && text(e) === NEVER_QUESTION)[0]!;
    const holder = question.parent!;
    const answer = text(findAll(holder, (e) => e.tag === "dd")[0]!);
    expect(answer).toBe(
      "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.",
    );
    const sam = await makeAccount({ handle: "sam_rc14", email: "sam_rc14@example.test", suspended: true });
    const download = await refusal(() => exportAccount(db(), sam.id));
    const remove = await refusal(() => deleteAccount(db(), sam.id, "sam_rc14"));
    // The adapted check, as the fixed test runs it: the whole page.
    expect(/suspended|write to us/i.test(textOf(render({ joining: true, count: null, seatsOpen: null })))).toBe(true);
    expect(sectionN()).not.toContain("What if it never gets to [threshold]?");
    expect(
      (download === "OK" && remove === "OK") || /suspended|write to us/i.test(answer),
      `a suspended account: download ${download}, delete ${remove}; the answer says "${answer}" and names no exception`,
    ).toBe(true);
  });
});

/* ====================================================================== */
/* Item 6. The invite page's line, and joining as the front page counts it */
/* ====================================================================== */

describe("the invite page's 'Free to join.' (D-0016 §N item 6)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: 'Free to join.' and its link show exactly when the front page shows its form and an invite's join request is accepted — in development with no CLIENT_IP_HEADER (x-forwarded-for by default) and in production with one named — and nowhere when it is not: production with none, development with a name that is not a header name, and no controller. The link is the card's (pledgeLink) each time it shows. For a person (D-0016 §I left the forms unchanged): with no header named the invite page still shows its email form, which refuses with JOIN_REQUESTS_OFF, while the front page says 'Joining opens soon.'", async () => {
    const configs: [string, Record<string, string>][] = [
      ["the tests' configuration", {}],
      ["development, no CLIENT_IP_HEADER", { NODE_ENV: "development", CLIENT_IP_HEADER: "" }],
      ["development, CLIENT_IP_HEADER not a header name", { NODE_ENV: "development", CLIENT_IP_HEADER: "x forwarded for" }],
      ["production, CLIENT_IP_HEADER named", { NODE_ENV: "production", CLIENT_IP_HEADER: "x-vercel-forwarded-for" }],
      ["production, no CLIENT_IP_HEADER", { NODE_ENV: "production", CLIENT_IP_HEADER: "" }],
      ["production, no data controller", { NODE_ENV: "production", CLIENT_IP_HEADER: "x-vercel-forwarded-for", DATA_CONTROLLER: "", DATA_CONTROLLER_EMAIL: "" }],
    ];
    const seen: Record<string, unknown> = {};
    let n = 0;
    for (const [name, env] of configs) {
      n += 1;
      await reset();
      const anna = await makeAccount({ handle: `anna_rc14_${n}`, displayName: "Anna FICTIONAL", email: `anna_rc14_${n}@example.test` });
      const { code } = await createInvite(db(), anna.id, {});
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const html = await invitePage(code);
      const front = await renderRoute();
      const asked = await refusal(() => requestJoin(db(), { code, email: `nia_rc14_${n}@example.test`, ipHash: ip(60 + n) }));
      vi.unstubAllEnvs();
      const shown = textOf(html).includes("Free to join. The promise behind our.one");
      seen[name] = {
        line: shown,
        cardLink: shown ? /<a class="[^"]*pledgeLink[^"]*" href="\/#front-runs">The promise behind our\.one<\/a>/.test(html) : null,
        frontForm: buttonOf(front) !== null,
        joinRequest: asked === "OK" ? "OK" : asked === `CLOSED: ${JOIN_REQUESTS_OFF}` ? "CLOSED: JOIN_REQUESTS_OFF" : asked,
        inviteForm: html.includes(">Send me a link</button>"),
      };
    }
    expect(seen).toEqual({
      "the tests' configuration": { line: true, cardLink: true, frontForm: true, joinRequest: "OK", inviteForm: true },
      "development, no CLIENT_IP_HEADER": { line: true, cardLink: true, frontForm: true, joinRequest: "OK", inviteForm: true },
      "development, CLIENT_IP_HEADER not a header name": { line: false, cardLink: null, frontForm: false, joinRequest: "CLOSED: JOIN_REQUESTS_OFF", inviteForm: true },
      "production, CLIENT_IP_HEADER named": { line: true, cardLink: true, frontForm: true, joinRequest: "OK", inviteForm: true },
      "production, no CLIENT_IP_HEADER": { line: false, cardLink: null, frontForm: false, joinRequest: "CLOSED: JOIN_REQUESTS_OFF", inviteForm: true },
      "production, no data controller": { line: false, cardLink: null, frontForm: false, joinRequest: "CLOSED: our.one isn't open for new accounts yet.", inviteForm: false },
    });
  });
});

/* ====================================================================== */
/* Item 7. The new scan rule                                              */
/* ====================================================================== */

/** The rule 6bbf256 added: the handover told as done in other verbs. */
const DONE_RULE = PROHIBITED.find((rule) => rule.pattern.source.includes("maintained by"))!;

describe("the claims scan's new rule (D-0016 §N item 7; CHECKED, not ENFORCED)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: every form D-0016 §N names is caught on a page with no ALLOWLIST entry; no true sentence is — the status line's 'go to', the present state's 'has not been formed', its denial in other words; and nothing is caught, by this rule or any, in the real files (scanRepoPublicText) or on any rendered page: the front page in every state with addresses waiting or not, the route, the invite page while joining is open, closed and off in production, /contract, /rules, /privacy, /power, /costs, both not-found pages, the footers, the right column, and every mail", async () => {
    const named = [
      "Its domain went to a not-for-profit body of its members.",
      "Its data has gone to its members.",
      `Passed to its members at ${T}.`,
      `Given to its members at ${T}.`,
      "Transferred to its members.",
      "Maintained by its members.",
      "The members' body has been formed.",
      "Its members now hold the domain.",
      "The handover is over.",
    ];
    expect(named.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0)).toEqual([]);
    for (const truth of [
      STATUS_LINE,
      "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
      "The members' body is not formed yet.",
      CARD_HANDOVER,
      PROMISE,
    ]) {
      expect(DONE_RULE.pattern.test(truth), truth).toBe(false);
    }

    const { files, hits } = scanRepoPublicText(WEB_ROOT);
    expect(files.length).toBeGreaterThan(20);
    expect(hits.map(formatHit)).toEqual([]);

    const anna = await makeAccount({ handle: "anna_rc14", displayName: "Anna FICTIONAL", email: "anna_rc14@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    const inLayout = (page: ReactElement) => renderToStaticMarkup(createElement(PublicLayout, null, page));
    const pages: [string, string, string | null][] = [];
    for (const joining of [true, false]) {
      for (const count of [null, 0, 1, 1284]) {
        for (const [seatsOpen, seatsWaiting] of [[null, null], [0, 0], [0, 3], [5, 0], [1, 1]] as const) {
          const state = { joining, count, seatsOpen, seatsWaiting };
          pages.push([`/ ${JSON.stringify(state)}`, inLayout(createElement(FrontPage, state)), FRONT]);
        }
      }
    }
    pages.push(["/ (the route)", await renderRoute(), FRONT]);
    pages.push(["/i/[code], joining open", inLayout((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement), INVITE_PAGE]);
    vi.stubEnv("DATA_CONTROLLER", "");
    pages.push(["/i/[code], joining closed", inLayout((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement), INVITE_PAGE]);
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    pages.push(["/i/[code], production with no header", inLayout((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement), INVITE_PAGE]);
    vi.unstubAllEnvs();
    pages.push(
      ["/contract", rendered(ContractPage), CONTRACT],
      ["/rules", rendered(RulesPage), RULES_FILE],
      ["/privacy", rendered(PrivacyPage), null],
      ["/power", rendered(PowerPage), null],
      ["/costs", rendered(CostsPage), null],
      ["not-found", rendered(NotFound), null],
      ["not-found in the app", rendered(AppNotFound), null],
      ["the footer", rendered(SiteFooter), null],
      ["the in-app footer", rendered(InAppSiteFooter), null],
      ["the right column", renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 })), null],
    );
    const url = "http://localhost:3000/auth#FICTIONAL";
    for (const mail of [
      mailTemplates.signInEmail(url),
      mailTemplates.joinEmail(url, "FICTIONAL Anna", "anna_f"),
      mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", "controller@example.test"),
      mailTemplates.seatEmail(url),
      mailTemplates.digestEmail([{ name: "FICTIONAL Person", posts: 2 }], "http://localhost:3000", "http://localhost:3000/unsubscribe#FICTIONAL"),
    ]) {
      pages.push([`mail: ${mail.subject}`, `${mail.subject}\n${mail.body}`, null]);
    }
    expect(pages.length).toBeGreaterThan(50);
    const caught = pages.flatMap(([page, html, file]) => renderedHits(html, file).map((hit) => `${page}: ${hit}`));
    expect(caught).toEqual([]);
    const byTheNewRule = pages.filter(([, html]) => new RegExp(DONE_RULE.pattern.source, "i").test(textOf(html))).map(([page]) => page);
    expect(byTheNewRule).toEqual([]);
  });

  it("DEFECT (LOW): close neighbours of the forms the rule names pass on every page: the status line's own recipient with 'the' ('went to', 'have gone to', 'transferred to' or 'passed to' the not-for-profit body of its members) — the rule's optional words cover 'a not-for-profit body of', 'a body of' and 'the body of', not this; 'Maintained by' that body, the status line's first sentence told as done with its own recipient; 'its members hold' without 'now'; 'the members' body now holds'; 'the members' body has formed'; the handover promise's own words told as done ('A not-for-profit body of its members was founded by their vote.'); and 'Run by its members.'. No page says these today; the scan is CHECKED, not ENFORCED", () => {
    const neighbours = [
      "Its domain, its data and the right to replace the maintainer went to the not-for-profit body of its members.",
      "Its domain, its data and the right to replace the maintainer have gone to the not-for-profit body of its members.",
      `Transferred to the not-for-profit body of its members at ${T}.`,
      `Passed to the not-for-profit body of its members at ${T}.`,
      "Maintained by a not-for-profit body of its members.",
      "Maintained by the not-for-profit body of its members.",
      "Its members hold the domain, the data and the right to replace the maintainer.",
      "The members' body now holds the domain, the data and the keys.",
      "The members' body has formed.",
      "A not-for-profit body of its members was founded by their vote.",
      "Run by its members.",
    ];
    // The reading is sound: the forms the rule names, and the line with 'a', are caught.
    expect(scanText("Its domain, its data and the right to replace the maintainer went to a not-for-profit body of its members.", ANOTHER_PAGE).length).toBeGreaterThan(0);
    expect(
      neighbours.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0),
      "told as done, and let through on any page",
    ).toEqual([]);
  });
});

/* ====================================================================== */
/* Items 3, 4 and 8. The records against the pages and their sources      */
/* ====================================================================== */

describe("the records' exact text, against the pages and the sources they cite (D-0016 §N items 3, 4 and 8)", () => {
  it("closed (item 3): D-0016 §N's new source for 'Until then, I hold all three.' says what §N says — AGENTS.md §2 'AUTHORITY FOUNDER BOOTSTRAP', and FOUNDING-AUTHORITY.md: 'The founder is the sole source of authority in this project today.' (§2) and the founder may 'appoint and remove stewards and operators' (§5); /contract names 'the domain, the data and the keys'; the card's words are unchanged; and §C's old citation is kept beside the correction, not rewritten", () => {
    const n = sectionN();
    expect(n).toContain(
      "For the right to replace the maintainer, the source is the founder's bootstrap authority (AGENTS.md §2, authority/FOUNDING-AUTHORITY.md): nobody else holds it today.",
    );
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents).toMatch(/AUTHORITY\s+FOUNDER BOOTSTRAP/);
    const authority = readRecord("authority/FOUNDING-AUTHORITY.md");
    expect(authority).toContain("The founder is the sole source of authority in this project today.");
    expect(authority).toContain("appoint and remove stewards and operators;");
    expect(textOf(rendered(ContractPage))).toContain(`Until ${T} members I also hold the domain, the data and the keys, and I'm not paid.`);
    const card = findAll(parse(render({ joining: true, count: null, seatsOpen: null })), (e) => e.tag === "blockquote")[0]!;
    expect(text(card)).toBe(`I'll never sell our.one. ${CARD_HANDOVER} Until then, I hold all three.`);
    expect(readRecord("decisions/D-0016.md")).toContain(
      "The contract hands over three things (promise 2, /contract), and says the maintainer holds them until then.",
    );
  });

  it("closed (item 4, open for the founder): 'have joined' is in exactly the three sentences D-0016 §N names — the card, the handover promise and the status line — in the public text (two in FrontPage.tsx, one in RightColumn.tsx, none in a mail) and on the rendered front page; the same page counts 'people are in', and /contract's trigger is the count of 'accounts that exist and are not suspended'; the question is recorded in §N with 'are in' proposed, in SPEC §18.16, and in D-0016.yaml as pending", () => {
    const counts: Record<string, number> = {};
    for (const file of publicTextFiles(WEB_ROOT)) {
      const found = readFileSync(join(WEB_ROOT, file), "utf8").match(/have joined/g)?.length ?? 0;
      if (found > 0) counts[file] = found;
    }
    expect(counts).toEqual({ [FRONT]: 2, "src/components/RightColumn.tsx": 1 });
    const page = renderToStaticMarkup(createElement(PublicLayout, null, createElement(FrontPage, { joining: true, count: 1284, seatsOpen: 5 })));
    expect(sentencesOf(page).filter((sentence) => sentence.includes("have joined"))).toEqual([
      CARD_HANDOVER,
      PROMISE,
      STATUS_LINE.replace("Maintained by its founder. ", ""),
    ]);
    expect(textOf(page)).toContain("1,284 people are in. You'd be #1,285.");
    expect(textOf(rendered(ContractPage))).toContain("The count is the number on the front page: accounts that exist and are not suspended.");
    const n = sectionN();
    expect(n).toContain('The card, the handover promise and the status line say "when [threshold] people have joined".');
    expect(n).toContain('The agent proposes "when [threshold] people are in", the words of the count on the same page.');
    expect(readRecord("apps/web/SPEC.md")).toContain('the trigger\'s words. "When [threshold] people have joined" is not the contract\'s count; "are in" is proposed;');
    expect(readRecord("decisions/D-0016.yaml")).toContain("so is the founder's choice of words for the handover's trigger (§N)");
  });

  it("closed (item 8): the eight sentences D-0016 §N lists 'unchanged' are in §N by exact text and on their pages word for word — three on the front page, five on /contract — and FrontPage.tsx's header says where each handover sentence is listed", () => {
    const n = sectionN();
    const front = textOf(render({ joining: true, count: null, seatsOpen: null }));
    const contract = textOf(rendered(ContractPage));
    const eight: [string, string][] = [
      ["A maintainer does the job, or is replaced.", front],
      ["Two of its promises can never be changed: no sale, and the handover.", front],
      ["Today that's me, and today I also hold everything.", front],
      [`Until ${T} members I also hold the domain, the data and the keys, and I'm not paid.`, contract],
      ["Promises 1 and 2 can't be changed at all.", contract],
      [`If it never gets to ${T}`, contract],
      ["Promise 1 still holds, the code stays open, and you can leave with everything.", contract],
      [`Until ${T}, these are my promises, written into the terms you join under.`, contract],
    ];
    const missing = eight.flatMap(([sentence, page]) => [
      ...(n.includes(`"${withPlaceholders(sentence)}"`) ? [] : [`§N: ${withPlaceholders(sentence)}`]),
      ...(page.includes(sentence) ? [] : [`page: ${sentence}`]),
    ]);
    expect(missing).toEqual([]);
    const header = readFileSync(join(WEB_ROOT, FRONT), "utf8").replace(/\s*\*\s*/g, " ");
    expect(header).toContain(
      "listed by exact text in D-0016 or in the claims scan's ALLOWLIST (src/core/claims.ts), which holds every one its rules catch (D-0016 §N).",
    );
  });

  it("DEFECT (LOW) (item 8): two more sentences about the handover on /contract are listed neither in D-0016 nor in the claims scan's list — only in SPEC §18.3 — the class of the eight §N lists: promise 2's own lock, 'This promise can never be changed.' (§N lists promise 8's 'Promises 1 and 2 can't be changed at all.'), and the handover's trigger, 'The count is the number on the front page: accounts that exist and are not suspended.' (§N's open question turns on it). The verifier's heuristic for 'about the handover' did not match them, so the list built from it missed them", () => {
    const html = rendered(ContractPage);
    const promise2 = findAll(parse(html), (e) => e.tag === "li" && text(e).includes("I hand over the domain"))[0]!;
    const two = ["This promise can never be changed.", "The count is the number on the front page: accounts that exist and are not suspended."];
    const spec = readRecord("apps/web/SPEC.md");
    for (const sentence of two) {
      expect(text(promise2), sentence).toContain(sentence);
      expect(spec, sentence).toContain(sentence);
    }
    const d16 = readRecord("decisions/D-0016.md");
    expect(
      two.filter((sentence) => !d16.includes(withPlaceholders(sentence)) && !ALLOWLIST.some((entry) => entry.sentence === sentence)),
      "sentences about the handover on /contract, listed neither in D-0016 nor in ALLOWLIST",
    ).toEqual([]);
  });
});

/* ====================================================================== */
/* Items 9 and 10. The link and the polish                                */
/* ====================================================================== */

describe("the invite page's link, and the polish (D-0016 §N items 9 and 10)", () => {
  beforeEach(async () => {
    await reset();
  });

  /** The invite page for a fresh invite from Anna, inside the public layout, as a tree. */
  async function inviteTree(): Promise<El> {
    const anna = await makeAccount({ handle: "anna_rc14", displayName: "Anna FICTIONAL", email: "anna_rc14@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    const page = (await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement;
    return parse(renderToStaticMarkup(createElement(PublicLayout, null, page)));
  }

  const promiseLink = (tree: El) => findAll(tree, (e) => e.tag === "a" && text(e) === "The promise behind our.one")[0]!;

  it("closed (item 9, contrast): the link is the card's (pledgeLink): the text colour and underlined — 18.51:1 on the page in light and 17.24:1 in dark, and 3.02:1 and 3.76:1 against 'Free to join.' beside it, told apart by luminance and by the underline (measured the same in Chrome 154 at 320, 390, 768 and 1280px in both themes; the underline itself is faint, #cfd9de at 1.44:1 in light and #2f3336 at 1.65:1 in dark, as on the front page's own links)", async () => {
    const link = promiseLink(await inviteTree());
    expect(moduleClass(link)).toBe("pledgeLink");
    const words = link.parent!;
    const seen: Record<string, unknown> = {};
    for (const scheme of ["light", "dark"] as const) {
      seen[scheme] = {
        onPage: contrast(colourOf(link, scheme), backgroundOf(link, scheme)),
        besideWords: contrast(colourOf(link, scheme), colourOf(words, scheme)),
        underlined: underlined(link),
      };
    }
    expect(seen).toEqual({
      light: { onPage: 18.51, besideWords: 3.02, underlined: true },
      dark: { onPage: 17.24, besideWords: 3.76, underlined: true },
    });
  });

  it("DEFECT (LOW) (item 9, the tap target): D-0016 §N and SPEC §18.16 say the link is '44px tall on touch screens'; it is 41.55px — the card's rule makes it an inline-block with 12px above and below a 13px line of 1.35 (17.55px) — measured in Chrome 154 with touch emulation at 320, 390 and 768px, both themes: 168.97 × 41.55px. The adapted render test passes on a heuristic that counts any 12px padding as 44px; the card's own 'How that works', at 14px, is 42.89px, older than this build", async () => {
    const link = promiseLink(await inviteTree());
    expect(readRecord("decisions/D-0016.md")).toContain("the card's link: the text colour, underlined, 44px tall on touch screens");
    const coarse = RULES.filter((r) => r.media !== null && /pointer:\s*coarse/.test(r.media) && r.selectors.includes(".pledgeLink"));
    expect(coarse).toHaveLength(1);
    const touch = declarations(coarse[0]!.body);
    expect(touch).toEqual({ display: "inline-block", "padding-block": "12px", "margin-block": "-12px" });
    const fontSize = parseFloat(inherited(link, "font-size") ?? BODY["font-size"]!);
    const lineHeight = parseFloat(inherited(link, "line-height") ?? BODY["line-height"]!);
    expect([fontSize, lineHeight]).toEqual([13, 1.35]);
    const height = Math.round((fontSize * lineHeight + 2 * parseFloat(touch["padding-block"]!)) * 100) / 100;
    expect(height, `${fontSize}px × ${lineHeight} + 2 × ${touch["padding-block"]} on a coarse pointer`).toBeGreaterThanOrEqual(44);
  });

  it("closed (item 10): 'not-for-profit' is one unbreakable span in the card, and the card's sentence still passes the scan only in FrontPage.tsx; text-wrap 'pretty' reaches the lede, the card, the seat line, the reason, the close's line and the footer's status line, and 'balance' the reason's first line and the close's heading (measured in Chrome 154 at every width from 340 to 412px: 'not-for-profit' on one line, the card never overflows, no sideways scroll, no lone last word — at 375px '…the right to replace me to / a not-for-profit body of its / members. Until then, I hold / all three.')", () => {
    const tree = parse(renderToStaticMarkup(createElement(PublicLayout, null, createElement(FrontPage, { joining: true, count: 12, seatsOpen: 0 }))));
    const span = findAll(tree, (e) => e.tag === "span" && hasClass(e, "nowrap"))[0]!;
    expect([text(span), declared(span, "white-space"), text(span.parent!)]).toEqual([
      "not-for-profit",
      "nowrap",
      `I'll never sell our.one. ${CARD_HANDOVER} Until then, I hold all three.`,
    ]);
    expect(scanText(readFileSync(join(WEB_ROOT, FRONT), "utf8"), FRONT)).toEqual([]);
    expect(scanText(CARD_HANDOVER, ANOTHER_PAGE).length).toBeGreaterThan(0);
    const one = (test: (e: El) => boolean) => findAll(tree, test)[0]!;
    const wraps = {
      lede: inherited(one((e) => hasClass(e, "frontLede")), "text-wrap"),
      card: inherited(span.parent!, "text-wrap"),
      seatLine: inherited(one((e) => hasClass(e, "seats")), "text-wrap"),
      reasonLead: inherited(one((e) => hasClass(e, "reasonLead")), "text-wrap"),
      reasonText: inherited(one((e) => hasClass(e, "reasonText")), "text-wrap"),
      closeHeading: inherited(one((e) => e.attrs.id === "front-close"), "text-wrap"),
      closeLine: inherited(one((e) => hasClass(e, "closeLine")), "text-wrap"),
      statusLine: inherited(one((e) => e.tag === "p" && text(e) === STATUS_LINE), "text-wrap"),
    };
    expect(wraps).toEqual({
      lede: "pretty",
      card: "pretty",
      seatLine: "pretty",
      reasonLead: "balance",
      reasonText: "pretty",
      closeHeading: "balance",
      closeLine: "pretty",
      statusLine: "pretty",
    });
  });

  it("DEFECT (LOW) (item 10): on /costs and /rules the status line is a plain muted paragraph that no text-wrap rule reaches, though SPEC §18.16 puts 'text-wrap: pretty' on 'the status line' and D-0016 §N says lone last words are avoided where the browser can: Chrome 154 leaves 'members.' alone on its last line on both pages at 408–432px (4 lines) and 598–622px (3 lines), measured every 2px from 320 to 1480px; never on /, /power, /privacy or the not-found page", () => {
    const places: [string, string][] = [
      ["the footer", rendered(SiteFooter)],
      ["the in-app footer", rendered(InAppSiteFooter)],
      ["the right column", renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 }))],
      ["the not-found page", rendered(NotFound)],
      ["/power", rendered(PowerPage)],
      ["/costs", rendered(CostsPage)],
      ["/rules", rendered(RulesPage)],
    ];
    const wraps = Object.fromEntries(
      places.map(([place, html]) => {
        const status = findAll(parse(html), (e) => e.tag === "p" && text(e) === STATUS_LINE);
        expect(status, place).toHaveLength(1);
        return [place, `${moduleClass(status[0]!)}: ${inherited(status[0]!, "text-wrap") ?? "auto"}`];
      }),
    );
    expect(readRecord("apps/web/SPEC.md")).toContain("text-wrap: pretty on the lede, the card, the seat line, the reason, the close's line, every .lede and the status line");
    expect(wraps).toEqual({
      "the footer": "site-footer__status: pretty",
      "the in-app footer": "site-footer__status: pretty",
      "the right column": "site-footer__status: pretty",
      "the not-found page": "site-footer__status: pretty",
      "/power": "lede: pretty",
      "/costs": "muted: pretty",
      "/rules": "muted: pretty",
    });
  });

  it("closed (item 10): the not-found page's footer is at most 40em, which at the body's 15px is 600px, the site's centre column (--center-w) — measured in Chrome 154 at 1024, 1280, 1366, 1440, 1600, 1920 and 2560px in both themes: 600px wide and centred, the status line on two lines, no sideways scroll; the other parts of the page are at most 281px wide", () => {
    const tree = parse(rendered(NotFound));
    const main = findAll(tree, (e) => e.tag === "main")[0]!;
    const footer = main.children.find((c): c is El => typeof c !== "string" && c.tag === "footer")!;
    expect(hasClass(main, "plain-page")).toBe(true);
    expect(declared(footer, "max-width")).toBe("40em");
    const fontSize = parseFloat(inherited(footer, "font-size") ?? BODY["font-size"]!);
    expect(fontSize * parseFloat(declared(footer, "max-width")!)).toBe(600);
    expect(tokens("light")["--center-w"]).toBe("600px");
    expect(findAll(footer, (e) => e.tag === "p" && text(e) === STATUS_LINE)).toHaveLength(1);
  });
});

/* ====================================================================== */
/* The adaptation                                                         */
/* ====================================================================== */

/** The handover told as done, as claims.test.ts samples the new rule. */
const RULE_SAMPLES = [
  "Its domain went to a not-for-profit body of its members.",
  "The data has gone to its members.",
  "Passed to its members at 100,000.",
  "Given to the members at 100,000.",
  "Transferred to its members.",
  "Maintained by its members.",
  "The members' body has been formed.",
  "The members’ body was formed last year.",
  "Its members now hold the domain.",
  "The handover is over.",
];

describe("how the verifiers' tests were adapted (git diff d56f8fc..6bbf256 and dcd57d0..6bbf256 -- apps/web/tests/)", () => {
  const read = (file: string) => readFileSync(join(WEB_ROOT, "tests", file), "utf8").replace(/\s+/g, " ");

  it("closed: no DEFECT is left in either verifier's file; every one was renamed as its record says — render: 2 'fixed'; honesty: 7 'fixed', 1 'accepted', 1 'open' — and its assertion kept (the contrast, the touch rule, the outcome against the label, the suspended check, the invite line, the scan's done forms, both 'listed' checks), pointed at the fixed words (the class pledgeLink, 'Join the waiting list' while Pia waits, the header's new sentence, the expected page and the records' list with the suspended sentence), or, for 'accepted' and 'open', turned to say what holds today and checked against the record it names; nothing loosened (the check that the old status line is in contract.test's list now reads the list, not its last line). The fixed tests keep the verifiers' present-tense titles ('it is the shared link blue'), as both headers say. The other four files lose no assertion: they gain claims.test's samples for the rule, contract.test's forms, front-page.test's two-argument labels, its route with a seat open and one waiting, and its span; and they follow the fixed words (the Settings paragraph in front-page.test and verify-m0013-honesty, and a pronoun in one front-page.test title)", () => {
    const render = read("verify-m0014-render.test.ts");
    const honesty = read("verify-m0014-honesty.test.ts");
    expect([render.match(/\bit\("DEFECT/g) ?? [], honesty.match(/\bit\("DEFECT/g) ?? []]).toEqual([[], []]);
    const renamed = (file: string, kind: RegExp) => file.match(kind)?.length ?? 0;
    expect({
      renderFixed: renamed(render, /it\("fixed \(D-0016 §N, after the verification; was DEFECT \((?:MEDIUM|LOW)\)\)/g),
      honestyFixed: renamed(honesty, /it\("fixed \(D-0016 §N, after the verification; was DEFECT \((?:MEDIUM|LOW)\)\)/g),
      honestyAccepted: renamed(honesty, /it\("accepted \(D-0016 §N, after the verification; was DEFECT \(LOW\)\)/g),
      honestyOpen: renamed(honesty, /it\("open \(for the founder, D-0016 §N; was DEFECT \(MEDIUM\)\)/g),
    }).toEqual({ renderFixed: 2, honestyFixed: 7, honestyAccepted: 1, honestyOpen: 1 });

    // Kept as the verifiers wrote them.
    for (const kept of [
      'expect([scheme, "on the page", onPage >= 4.5], found.join("; ")).toEqual([scheme, "on the page", true]);',
      'expect([scheme, "told apart", underlined(link) || besideWords >= 3], found.join("; ")).toEqual([scheme, "told apart", true]);',
      'expect(touchTarget(link), "a (pointer: coarse) rule that gives the link 44px").not.toBeNull();',
    ]) {
      expect(render, kept).toContain(kept);
    }
    for (const kept of [
      "await outcomeFor(\"stan_m14@example.test\", 0), `the button said \"${label}\"; the answer then reads: \"${CHECK_YOUR_EMAIL}\"`, ).toBe(promisedBy(label));",
      "trueForEveryAccount || saysTheException,",
      ").toBe(visitorCanJoin);",
      '"told as done, and let through on any page", ).toEqual([]);',
      "`of ${seen.size} sentences about the handover on the front page and in its footer`, ).toEqual([]);",
      "expect(unlisted, `of ${seen.length} sentences about the handover on /contract`).toEqual([]);",
    ]) {
      expect(honesty, kept).toContain(kept);
    }
    // Pointed at the fixed words.
    expect(render).toContain('expect(moduleClass(link)).toBe("pledgeLink");');
    expect(render).toContain('expect(touchTarget(link)).toBe(".pledgeLink { padding: 12px }");');
    expect(honesty).toContain("const label = buttonOf(page); expect(label).toBe(WAITING_LIST_LABEL);");
    expect(honesty).toContain("which holds every one its rules catch (D-0016 §N).");
    expect(honesty).toContain(`delete it all. ${SUSPENDED_SENTENCE}",`);
    expect(honesty).toContain(`["${SUSPENDED_SENTENCE}", open],`);
    // Turned, and checked against the record each names.
    expect(honesty).toContain('expect(await outcomeFor("lea_m14@example.test", 1), `the button said "${label}"`).toBe("a join link");');
    expect(honesty).toContain('expect(readRecord("decisions/D-0016.md")).toContain("An address that already holds a seat.");');
    expect(honesty).toContain("toEqual({ statusLine: 3, card: 3, handoverPromise: 3, contract: 1 });");
    expect(honesty).toContain('expect(d16).toContain("The trigger\'s words.");');
    expect(honesty).toContain('expect(held.includes("right to replace")).toBe(false);');
    expect(readRecord("decisions/D-0016.md")).toContain("An address that already holds a seat.");
    expect(readRecord("decisions/D-0016.md")).toContain("The trigger's words.");
    // The one changed position check, which now reads the list.
    expect(honesty).toContain("expect(mustCatch).toContain(\"`Maintained by its founder. Handed to its members at ${THRESHOLD}.`,\");");

    // The other files the fixes changed only gain.
    expect(read("claims.test.ts")).toContain(JSON.stringify(DONE_RULE.pattern.source));
    for (const sample of RULE_SAMPLES) expect(read("claims.test.ts"), sample).toContain(JSON.stringify(sample));
    const front = read("front-page.test.ts");
    for (const gained of [
      "expect(joinLabel(5, 2)).toBe(WAITING_LIST_LABEL);",
      "[() => seats.seatState.mockResolvedValue({ open: 1, waiting: 1 }), WAITING_LIST_LABEL],",
      "for (const open of [0, -1]) expect(joinLabel(open), String(open)).toBe(WAITING_LIST_LABEL);",
      "nowrap",
    ]) {
      expect(front, gained).toContain(gained);
    }
    expect(read("verify-m0013-honesty.test.ts")).toContain(`delete it all. ${SUSPENDED_SENTENCE}\``);
  });

  it("DEFECT (LOW): contract.test.ts's handoverTold, which guards 'no page says the handover has happened' over the rendered pages and which 6bbf256's message says 'learns the same forms', misses one the scan rule catches and claims.test samples for it: 'The members’ body was formed last year.' — the rule's '(is|was) (now)? (formed|founded)' alternative was not copied (the claims scan, run over the same pages, still catches it)", () => {
    const source = readFileSync(join(WEB_ROOT, "tests/contract.test.ts"), "utf8");
    const body = source.slice(source.indexOf("function handoverTold("), source.indexOf('describe("no page says the handover has happened'));
    const patterns = [...body.matchAll(/matchAll\(\s*\/((?:[^/\\\n]|\\.)+)\/([a-z]*)/g)].map((m) => new RegExp(m[1]!, m[2]!.replace("g", "")));
    expect(patterns).toHaveLength(4);
    const told = (claim: string) => patterns.some((pattern) => pattern.test(claim));
    // The reading is sound: the forms its list names are caught.
    expect(told("Maintained by its members.") && told("The members' body has been formed.") && told("The handover is over.")).toBe(true);
    expect(RULE_SAMPLES.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0)).toEqual([]);
    expect(RULE_SAMPLES.filter((claim) => !told(claim)), "caught by the scan rule, missed by handoverTold").toEqual([]);
  });
});
