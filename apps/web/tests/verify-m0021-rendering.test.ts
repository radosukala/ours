/**
 * Independent verification of M-0021 (the first screen asks one thing;
 * D-0024; SPEC §18.23), the rendering and use lens: what a visitor and a
 * member see and can do on the front door and in the feed's panel, in a
 * browser, at every width, light and dark, by keyboard alone, with scripts
 * off, with the database down, and what the link card serves. Written by an
 * agent that built none of it, against 01d5d9f (the build is 30f1cc8 with
 * 943a90c; c9ac8bc, c064b99 and 01d5d9f add only records). The honesty of
 * the words is the other verifier's. Nothing in the product code, the
 * records or the existing tests is changed by this file.
 *
 * What was read: AGENTS.md and apps/web/AGENTS.md; M-0021 (.md and .yaml);
 * D-0024; SPEC §18.23; the build receipt and its screens; the stopping rule
 * (receipts/conformance/2026-10-05-M-0021.verification.md); the M-0020
 * rendering verification and its test (whose model of the stylesheet this
 * file reuses); `git diff ac38742 01d5d9f -- apps/web`.
 *
 * How it was looked at. A production build of 01d5d9f (`next build`),
 * served by `next start` on localhost:3731 with FICTIONAL settings
 * (DATA_CONTROLLER="FICTIONAL Controller", DATA_CONTROLLER_EMAIL=
 * controller@example.test, MAIL_TRANSPORT=outbox, CLIENT_IP_HEADER=
 * x-forwarded-for with 203.0.113.x addresses, a FICTIONAL SESSION_SECRET)
 * on a scratch database migrated and seeded by the app's own scripts
 * (`seed:fictional`: ten FICTIONAL people). Members were FICTIONAL
 * @ada_quillon and @bruno_varnell, with sessions made by the app's own
 * `createSession`. Other instances of the same build: 3733 with
 * DATA_CONTROLLER unset (joining closed), 3734 with DATABASE_URL on a closed
 * port, 3735 on a copy of the database whose `needs` table was renamed, 3736
 * with APP_URL unset in production, 3737 with APP_URL carrying a path and a
 * trailing slash; and 3732, the commit before M-0021 (ac38742), for what
 * changed. The browser was Playwright's Chromium (headless), a fresh
 * context for every scenario, nothing resolving but localhost:
 *
 * 1. the front door as a visitor and as a member at 320, 375, 539, 540,
 *    541, 600, 820, 1000 and 1440px, light and dark, with a sweep of 56
 *    further widths (320 to 1920px, 224 loads): sideways scroll, boxes past
 *    either edge in the hero and the header, the hero's blocks one by one
 *    (position, size, colour), the form's stacking, the heights of its
 *    fields and button, and where each of them sits against the fold at 16
 *    common screen sizes;
 * 2. WCAG 1.4.3 and 1.4.11 as numbers, from computed styles, for the large
 *    count, the pledge and its caption, the status line, both labels, the
 *    hint, the error, the button, the lines under the form, the fields'
 *    edges and the panel's count, light and dark, visitor and member;
 * 3. keyboard sessions with no pointer: Tab from the top of the page
 *    through the header, the status line's link and the form (every ring's
 *    colour and offset), Enter from the address, from the question and from
 *    the button, with a refusal at each field, a refusal of the rate limit
 *    (the same address four times), the one answer, and the fixes after a
 *    refusal: what was announced (role=alert, role=status), which field was
 *    aria-invalid and described by what, where focus went, what stayed in
 *    the fields; the panel's link up to the form;
 * 2. the same form with scripts off, on `/` and `/feed`, here and on the
 *    commit before M-0021;
 * 4. the member's front door and the panel on /home at 320, 375, 820, 1000
 *    and 1440px, light and dark; the headings, landmarks, skip link and
 *    accessibility tree of both; layout shift (none), requests (one
 *    origin), the console (quiet);
 * 5. the head of /, /privacy, /feed, /agreement, /build, /contract,
 *    /signin, /projects, /maintainers, /costs, /power, /rules, /join, /auth,
 *    /unsubscribe, an invite page and a 404; /card.png (status, type,
 *    headers, 1200 x 630, 48,428 bytes) and the image itself; the card with
 *    APP_URL unset, with a path, with a trailing slash;
 * 6. the public pages with the database down, with `needs` missing, and with
 *    joining closed.
 *
 * Screenshots (not committed) were saved beside the scripts, in the
 * verifier's scratch directory.
 *
 * Each finding ends here as a "DEFECT (SEVERITY): …" test that FAILS on
 * 01d5d9f and would pass once fixed; where only a browser shows it, the test
 * pins the cause in the markup, the stylesheet or the source, and its title
 * says what was measured, where and how. Each check that held is a "closed:
 * …" test that passes. HIGH: a page fails or can't be used; MEDIUM: a stated
 * requirement unmet, or a real usability or accessibility failure (WCAG AA);
 * LOW: polish.
 *
 * Before this file was committed, each DEFECT was run against a scratch
 * copy of the worktree with a plausible fix for it (in GetInForm.tsx, the
 * root and public layouts, door.module.css, scripts/card.ts): every test
 * passed there, the closed checks too. That copy is not part of this file,
 * and nothing in it is a decision about how to fix anything.
 *
 * Every person, address and value here is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import * as reactDomServer from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The request: a member behind it or not; each read the front door makes, working or failing. */
const req = vi.hoisted(() => ({ member: false, memberCount: "ok" as "ok" | "fails", needCount: "ok" as "ok" | "fails", seats: "ok" as "ok" | "fails" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: () => undefined,
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/web/viewer", () => ({
  isMemberHere: async () => req.member,
  requireViewer: async () => ({ id: "01FICTIONAL", handle: "mara_f", displayName: "Mara FICTIONAL", isAdmin: false, acceptsFollowers: false, invitesRemaining: 8 }),
  getViewer: async () => null,
}));
// Nothing here reaches a database: the reads the front door makes are the ones mocked below.
vi.mock("@/core/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => ({}),
}));
vi.mock("@/core/seats", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  memberCount: vi.fn(async () => {
    if (req.memberCount === "fails") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return 10;
  }),
  seatState: vi.fn(async () => {
    if (req.seats === "fails") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return { open: 0, waiting: 2 };
  }),
}));
vi.mock("@/core/needs", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  needCount: vi.fn(async () => {
    if (req.needCount === "fails") throw new Error('FICTIONAL: relation "needs" does not exist');
    return 3;
  }),
}));
/**
 * What Next hands a client component for a "use server" function: a function that carries `$$FORM_ACTION`
 * (the hidden fields that let a form post with no JavaScript) and a `bind` that keeps it, as
 * react-server-dom's server references do.
 */
vi.mock("@/app/(public)/seat-actions", () => {
  const metadata = (prefix: string) => {
    const data = new FormData();
    data.append("$ACTION_ID_FICTIONAL", "");
    return { name: `${prefix}action`, method: "POST", encType: "multipart/form-data", action: "", data };
  };
  const takeSeat = Object.assign(async () => ({ ok: true }), {
    $$FORM_ACTION: (prefix: string) => metadata(prefix),
    bind(this: (...a: unknown[]) => unknown, ...args: unknown[]) {
      return Object.assign(Function.prototype.bind.apply(this, args as never) as (...a: unknown[]) => unknown, {
        $$FORM_ACTION: (prefix: string) => metadata(prefix),
      });
    },
  });
  return { takeSeat };
});

import { generateMetadata } from "@/app/(public)/layout";
import FrontDoorRoute from "@/app/(public)/page";
import { OursCard, RightColumn } from "@/components/RightColumn";
import { Wordmark } from "@/components/SiteHeader";
import { DOOR_LEDE, DOOR_TITLE, CARD, DOOR_START, MEMBER_JOIN, NEED_HINT, NEED_LABEL } from "@/components/public/door";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { GetInForm, GetInFormView } from "@/components/public/GetInForm";
import { needsLine, progressLine } from "@/components/public/join";
import { LIMITS } from "@/core/validate";
import { CARD_MAX_BYTES, cardHtml, pngSize } from "../scripts/card";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const DOOR_CSS = read("src/components/public/door.module.css");

afterEach(() => {
  req.member = false;
  req.memberCount = "ok";
  req.needCount = "ok";
  req.seats = "ok";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- markup */

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
      for (const a of (m[3] ?? "").matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]!.toLowerCase()] = decode(a[2] ?? "");
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

const elements = (el: El) => el.children.filter((c): c is El => typeof c !== "string");

/** An element's classes as the source writes them: a CSS module's `_hero_b11fbc` is "hero". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-z]{5,8}$/i, "$1").replace(/^[\w-]+-module__\w+__(.+)$/, "$1"))
    .join(" ");
}

/** Looking an element up by the name the source gives its class, module or global. */
const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);

/**
 * A selector's class against an element, as a browser would: a global class names the class itself, a CSS
 * module's (written `M__name` here, see `cssRules`) names only the module's own `_name_hash`, so a global
 * `.headline` never styles the module's `_headline_hash`.
 */
function matchesClass(el: El, name: string): boolean {
  const tokens = (el.attrs.class ?? "").split(" ").filter(Boolean);
  const bare = (c: string) => c.replace(/^_(.+)_[0-9a-z]{5,8}$/i, "$1");
  if (name.startsWith("M__")) return tokens.some((c) => /^_(.+)_[0-9a-z]{5,8}$/i.test(c) && bare(c) === name.slice(3));
  return tokens.includes(name);
}
const byClass = (tree: El, name: string) => findAll(tree, (e) => hasClass(e, name));
const byId = (tree: El, id: string) => findAll(tree, (e) => e.attrs.id === id)[0];

const FOCUSABLE = (e: El) =>
  (e.tag === "a" && e.attrs.href !== undefined) ||
  ["button", "input", "textarea", "select", "summary"].includes(e.tag) ||
  (e.attrs.tabindex !== undefined && e.attrs.tabindex !== "-1");

/** Reachable by Tab: not inside a closed <dialog>, nor inside a closed <details> but as its summary. */
function reachable(e: El): boolean {
  for (let a: El | null = e.parent; a; a = a.parent) {
    if (a.tag === "dialog" && a.attrs.open === undefined) return false;
    if (a.tag === "details" && a.attrs.open === undefined && !(e.tag === "summary" && e.parent === a)) return false;
  }
  return !(e.tag === "input" && e.attrs.type === "hidden");
}

const tabbable = (tree: El) => findAll(tree, (e) => FOCUSABLE(e) && reachable(e));

/** The fields a person sees: a form that can post without scripts also carries hidden ones. */
const visibleInputs = (tree: El) => findAll(tree, (e) => e.tag === "input" && e.attrs.type !== "hidden");

/** Every element of a tree in document order. */
const inOrder = (tree: El) => findAll(tree, () => true);

function render(node: ReactNode): El {
  return parse(reactDomServer.renderToStaticMarkup(node as never));
}

/** The streaming renderer, which (unlike renderToStaticMarkup) writes a form's no-JavaScript fields. */
async function streamed(node: ReactNode): Promise<El> {
  const stream = await (reactDomServer as unknown as { renderToReadableStream: (n: ReactNode) => Promise<ReadableStream<Uint8Array> & { allReady: Promise<void> }> }).renderToReadableStream(node);
  await stream.allReady;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return parse(html);
}

/** The app's shell around a part, as the (app) layout draws it: `.public.app-shell`, then `.app`. */
function inShell(part: ReactNode, where: "main" | "aside"): ReactNode {
  const shell = (child: ReactNode) => createElement("div", { className: "public app-shell" }, child);
  if (where === "main") return shell(createElement("div", { className: "app" }, createElement("main", { id: "main", className: "app-main" }, part)));
  return shell(createElement("div", { className: "app" }, createElement("aside", { className: "aside" }, createElement("div", { className: "aside__inner" }, part))));
}

/** The front door as the route gives it a visitor with joining open, or as the test says. */
const DOOR: FrontDoorProps = { joining: true, email: null, count: 10, needs: 3, seatsOpen: 0, seatsWaiting: 2 };
const door = (props: Partial<FrontDoorProps> = {}) => render(createElement("div", { className: "public" }, createElement(FrontDoor, { ...DOOR, ...props })));

/** The first screen's section, and the one form inside it. */
const hero = (tree: El) => findAll(tree, (e) => e.tag === "section" && e.attrs["aria-labelledby"] === "door-title")[0]!;

/* ------------------------------------------------------------------- CSS */

/** `selectors` as written; `matchers` the same with a CSS module's classes marked, for matching elements. */
type CssRule = { media: string | null; selectors: string[]; matchers: string[]; body: string; order: number; sheet: string };

function cssRules(css: string, sheet: string, start = 0, module = false): CssRule[] {
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
      else if (!head.startsWith("@")) {
        const selectors = head.split(",").map((x) => x.trim());
        const matchers = module ? selectors.map((x) => x.replace(/\.([A-Za-z][\w-]*)/g, ".M__$1")) : selectors;
        out.push({ media, selectors, matchers, body: inner, order: start + out.length, sheet });
      }
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

const G_RULES = cssRules(GLOBALS, "globals.css");
const D_RULES = cssRules(DOOR_CSS, "door.module.css", 100_000, true);
const ALL_RULES = [...G_RULES, ...D_RULES];

/** Where and how the page is seen. */
type Ctx = { width: number; dark: boolean; coarse: boolean };
const WIDE: Ctx = { width: 1440, dark: false, coarse: false };
const at = (width: number, dark = false, coarse = width < 1000): Ctx => ({ width, dark, coarse });
const SCHEMES = ["light", "dark"] as const;

function mediaApplies(media: string | null, ctx: Ctx): boolean {
  if (media === null) return true;
  return media.split(",").some((query) =>
    query.split(/\s+and\s+/).every((f) => {
      const m = /^\(?\s*([\w-]+)\s*:\s*([^)]+?)\s*\)?$/.exec(f.trim());
      if (!m) return false;
      const [, name, v] = m as unknown as [string, string, string];
      if (name === "prefers-color-scheme") return (v === "dark") === ctx.dark;
      if (name === "max-width") return ctx.width <= parseFloat(v);
      if (name === "min-width") return ctx.width >= parseFloat(v);
      if (name === "pointer") return (v === "coarse") === ctx.coarse;
      if (name === "hover") return (v === "none") === ctx.coarse;
      if (name === "prefers-reduced-motion") return v === "no-preference";
      return false;
    }),
  );
}

/** A selector's specificity, roughly: ids, then classes, attributes and pseudo-classes, then tags. */
function specificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|\[[^\]]+\]|(?<!:):(?!:)[\w-]+/g)?.length ?? 0;
  const tags = selector.match(/(?:^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0;
  return ids * 10_000 + classes * 100 + tags;
}

/** The value of `prop` for the exact selectors named, in the context: the most specific rule, then the last. */
function value(selectors: string[], prop: string, ctx: Ctx = WIDE, rules: CssRule[] = ALL_RULES): string | undefined {
  let found: { v: string; spec: number; order: number } | undefined;
  for (const r of rules) {
    if (!mediaApplies(r.media, ctx)) continue;
    const v = declarations(r.body)[prop];
    if (v === undefined) continue;
    for (const s of r.selectors.filter((x) => selectors.includes(x))) {
      const spec = specificity(s);
      if (!found || spec > found.spec || (spec === found.spec && r.order >= found.order)) found = { v, spec, order: r.order };
    }
  }
  return found?.v;
}

/* --------------------------------------------- a small selector matcher */

type State = { focus?: El; hover?: El[] };
type Part = { compound: string; comb: " " | ">" | "+" | "~" | null };

function split(selector: string): Part[] {
  const out: Part[] = [];
  let buf = "";
  let depth = 0;
  let comb: Part["comb"] = null;
  const flush = () => {
    if (buf.trim()) out.push({ compound: buf.trim(), comb });
    buf = "";
  };
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (buf.trim()) {
        flush();
        comb = " ";
      }
      if (/[>+~]/.test(ch)) comb = ch as Part["comb"];
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

function compoundMatches(el: El, compound: string, st: State): boolean {
  let rest = compound;
  const tag = /^([a-z][\w-]*|\*)/i.exec(rest);
  if (tag) {
    if (tag[1] !== "*" && el.tag !== tag[1]!.toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    let m: RegExpExecArray | null;
    if ((m = /^\.([\w-]+)/.exec(rest))) {
      if (!matchesClass(el, m[1]!)) return false;
    } else if ((m = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(rest))) {
      const v = el.attrs[m[1]!];
      if (v === undefined) return false;
      const want = m[2] ?? m[3] ?? m[4];
      if (want !== undefined && v !== want) return false;
    } else if ((m = /^:not\(([^()]*)\)/.exec(rest))) {
      if (m[1]!.split(",").some((s) => compoundMatches(el, s.trim(), st))) return false;
    } else if ((m = /^:root(?![\w-])/.exec(rest))) {
      if (el.tag !== "html") return false;
    } else if ((m = /^:(focus-visible|focus)(?![\w-])/.exec(rest))) {
      if (st.focus !== el) return false;
    } else if ((m = /^:hover(?![\w-])/.exec(rest))) {
      if (!st.hover?.includes(el)) return false;
    } else if ((m = /^:disabled(?![\w-])/.exec(rest))) {
      if (el.attrs.disabled === undefined) return false;
    } else return false; // any other pseudo-class or a pseudo-element: not this element in this state
    rest = rest.slice(m[0].length);
  }
  return true;
}

function previousSiblings(el: El): El[] {
  if (!el.parent) return [];
  const sibs = elements(el.parent);
  return sibs.slice(0, sibs.indexOf(el)).reverse();
}

function matchesFrom(el: El, parts: Part[], i: number, st: State): boolean {
  if (!compoundMatches(el, parts[i]!.compound, st)) return false;
  if (i === 0) return true;
  const comb = parts[i]!.comb;
  if (comb === "+") {
    const prev = previousSiblings(el)[0];
    return !!prev && matchesFrom(prev, parts, i - 1, st);
  }
  if (comb === "~") return previousSiblings(el).some((p) => matchesFrom(p, parts, i - 1, st));
  if (comb === ">") return !!el.parent && matchesFrom(el.parent, parts, i - 1, st);
  for (let a = el.parent; a; a = a.parent) if (matchesFrom(a, parts, i - 1, st)) return true;
  return false;
}

const selectorMatches = (el: El, selector: string, st: State = {}) => {
  if (selector.includes("::")) return false;
  const parts = split(selector);
  return parts.length > 0 && matchesFrom(el, parts, parts.length - 1, st);
};

/** The declaration that wins for `el` among `props` (a shorthand and its longhands compete), in the context. */
function cascade(el: El, props: string[], ctx: Ctx, st: State = {}, rules: CssRule[] = ALL_RULES) {
  let best: { prop: string; value: string; spec: number; order: number; selector: string } | undefined;
  for (const r of rules) {
    if (!mediaApplies(r.media, ctx)) continue;
    const d = declarations(r.body);
    const present = props.filter((p) => d[p] !== undefined);
    if (present.length === 0) continue;
    for (const s of r.matchers) {
      if (!selectorMatches(el, s, st)) continue;
      const spec = specificity(s);
      for (const p of present) {
        if (!best || spec > best.spec || (spec === best.spec && r.order >= best.order)) best = { prop: p, value: d[p]!, spec, order: r.order, selector: s };
      }
    }
  }
  return best;
}

/** An inherited property: the element's own, or its nearest ancestor's. */
function inherited(el: El, prop: string, ctx: Ctx, st: State = {}): string | undefined {
  for (let e: El | null = el; e; e = e.parent) {
    const d = cascade(e, [prop], ctx, st);
    if (d) return d.value;
  }
  return undefined;
}

/* ---------------------------------------------------------- the colours */

type Rgba = { r: number; g: number; b: number; a: number };

function colour(v: string): Rgba {
  const s = v.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex6) {
    const h = hex6[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1]!.split("").map((c) => parseInt(c + c, 16)) as [number, number, number];
    return { r, g, b, a: 1 };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 };
  }
  throw new Error(`not a colour: ${v}`);
}

const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

function luminance(c: Rgba): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG contrast ratio, to two decimals; a translucent foreground is laid over the background first. */
function contrast(fg: Rgba, bg: Rgba): number {
  const top = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(top), luminance(bg)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/** The custom properties every element of the pages sees: `:root`'s, then `.public`'s. */
function tokens(ctx: Ctx): Record<string, string> {
  const own = (sel: string) =>
    Object.fromEntries(
      G_RULES.filter((r) => r.selectors.length === 1 && r.selectors[0] === sel && mediaApplies(r.media, ctx)).flatMap((r) =>
        [...r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as [string, string]),
      ),
    );
  return { ...own(":root"), ...own(".public") };
}

function resolveVars(v: string, t: Record<string, string>, depth = 0): string {
  const i = v.indexOf("var(");
  if (i < 0 || depth > 12) return v;
  let d = 0;
  let j = i + 3;
  for (; j < v.length; j++) {
    if (v[j] === "(") d++;
    else if (v[j] === ")" && --d === 0) break;
  }
  const inner = v.slice(i + 4, j);
  const comma = inner.indexOf(",");
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const fallback = comma < 0 ? "" : inner.slice(comma + 1).trim();
  const sub = resolveVars(t[name] ?? fallback, t, depth + 1);
  return resolveVars(v.slice(0, i) + sub + v.slice(j + 1), t, depth + 1);
}

/** A colour as the page resolves it in the context. */
function resolve(v: string, ctx: Ctx): Rgba {
  const s = resolveVars(v, tokens(ctx));
  const c = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)/i.exec(s);
  if (!c) throw new Error(`no colour in ${v}`);
  return colour(c[0]);
}

const PAPER = (ctx: Ctx) => resolve("var(--paper)", ctx);

/** What is behind an element: its own and its ancestors' backgrounds over the paper. */
function backdrop(el: El, ctx: Ctx, st: State = {}): Rgba {
  const chain: El[] = [];
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) chain.unshift(e);
  let c = PAPER(ctx);
  for (const e of chain) {
    const d = cascade(e, ["background", "background-color"], ctx, st);
    if (!d || /^(none|transparent|inherit)$/.test(d.value.trim())) continue;
    c = over(resolve(d.value, ctx), c);
  }
  return c;
}

/** The colour a focus ring takes on `el`: the winning `outline` or `outline-color`. */
function ringColour(el: El, ctx: Ctx): { colour: Rgba; selector: string; width: number; offset: number } {
  const d = cascade(el, ["outline", "outline-color"], ctx, { focus: el });
  if (!d) throw new Error("no ring");
  const raw = d.prop === "outline" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  const width = parseFloat(cascade(el, ["outline", "outline-width"], ctx, { focus: el })?.value.split(/\s+/)[0] ?? "0");
  const offset = parseFloat(cascade(el, ["outline-offset"], ctx, { focus: el })?.value ?? "0");
  return { colour: resolve(raw, ctx), selector: d.selector, width, offset };
}

/** A border's colour from `border`, `border-color` or `border-top-color`. */
function borderColour(el: El, ctx: Ctx): Rgba {
  const d = cascade(el, ["border", "border-color", "border-top-color"], ctx);
  if (!d) throw new Error("no border");
  const raw = d.prop === "border" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  return resolve(raw, ctx);
}

/* ------------------------------------------- lengths, and the first screen's height */

/** The top-level, comma-separated arguments of a CSS function's body. */
function args(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  out.push(buf.trim());
  return out;
}

/** A length in px at the width: `18px`, `7.2vw`, or `clamp(…)` of those. */
function px(v: string | undefined, ctx: Ctx, fallback = 0): number {
  if (v === undefined) return fallback;
  const s = v.trim();
  const clamp = /^clamp\((.*)\)$/.exec(s);
  if (clamp) {
    const [lo, mid, hi] = args(clamp[1]!).map((p) => px(p, ctx));
    return Math.max(lo!, Math.min(mid!, hi!));
  }
  const vw = /^(-?[\d.]+)vw$/.exec(s);
  if (vw) return (parseFloat(vw[1]!) * ctx.width) / 100;
  return parseFloat(s) || fallback;
}

/** One side of a margin or padding shorthand (or its longhand), in px. */
function side(el: El, prop: "margin" | "padding", which: "top" | "bottom", ctx: Ctx): number {
  const d = cascade(el, [`${prop}-${which}`, prop], ctx);
  if (!d) return 0;
  const p = d.value.split(/\s+/).map((x) => parseFloat(x) || 0);
  if (d.prop !== prop) return p[0] ?? 0;
  return which === "top" ? (p[0] ?? 0) : (p[2] ?? p[0] ?? 0);
}

/** Height of `lines` lines of an element's text: its font size times its line height. */
function textHeight(el: El, lines: number, ctx: Ctx): number {
  const font = px(inherited(el, "font-size", ctx), ctx, 16);
  const raw = inherited(el, "line-height", ctx) ?? "1.55";
  return lines * (/px$/.test(raw) ? parseFloat(raw) : font * parseFloat(raw));
}

/** The gap between rows of a grid (`gap: row column` or `row-gap`), in px. */
function rowGap(el: El, ctx: Ctx): number {
  const d = cascade(el, ["row-gap", "gap"], ctx);
  return d ? (parseFloat(d.value.split(/\s+/)[0]!) || 0) : 0;
}

/**
 * Where the first screen puts the form, as the stylesheet lays it out in a
 * single column of blocks at `ctx.width`: the public header, the hero's
 * padding and its gap, each block of the left column in the order the markup
 * gives them (the eyebrow, the headline, the line, the count, the pledge, the
 * status line, the form), each with its own margin, and the form's rows. The
 * number of lines each text takes is what Chromium drew at 1440px (the
 * headline 3, the line 1, the pledge 3, the status 1) and is taken as given.
 * Measured in Chromium at 1440px on the verified commit: the headline's top
 * at 173.5, the form's at 776.7, the email field 804.4 to 852.5, the question
 * 896.2 to 944.3, its hint to 970.4 and the button 986.4 to 1038.4.
 */
function firstScreen(tree: El, ctx: Ctx, lines = { headline: 3, lede: 1, pledge: 3, status: 1 }) {
  const one = (name: string) => byClass(tree, name)[0]!;
  const section = hero(tree);
  const header = px(value([".public-header__bar"], "min-height", ctx, G_RULES), ctx) + 1; // its bottom border
  let y = header + side(section, "padding", "top", ctx);
  y += textHeight(one("eyebrow"), 1, ctx) + rowGap(section, ctx);
  y += textHeight(one("headline"), lines.headline, ctx) + rowGap(section, ctx);
  y += textHeight(one("lede"), lines.lede, ctx);
  const number = one("progressN");
  y += side(one("progress"), "margin", "top", ctx) + px(inherited(number, "font-size", ctx), ctx) * parseFloat(inherited(number, "line-height", ctx) ?? "1");
  y += side(one("pledge"), "margin", "top", ctx) + textHeight(findAll(one("pledgeWords"), (e) => e.tag === "p")[0]!, lines.pledge, ctx);
  y += side(one("pledgeBy"), "margin", "top", ctx) + textHeight(one("pledgeBy"), 1, ctx);
  y += side(one("heroStatus"), "margin", "top", ctx) + textHeight(one("heroStatus"), lines.status, ctx);
  const join = one("heroJoin");
  y += side(join, "margin", "top", ctx);
  const formTop = y;

  // The form: its fields and button are laid in the columns the stylesheet gives it.
  const form = findAll(join, (e) => e.tag === "form")[0]!;
  const columns = (cascade(form, ["grid-template-columns"], ctx)?.value ?? "1fr").split(/\s+(?![^(]*\))/).length;
  const heightOf = (child: El): number => {
    if (child.tag === "button") return px(cascade(child, ["height"], ctx)?.value, ctx);
    const label = findAll(child, (e) => e.tag === "label")[0]!;
    const input = findAll(child, (e) => e.tag === "input")[0]!;
    const hint = findAll(child, (e) => hasClass(e, "field__hint"))[0];
    const border = parseFloat(cascade(input, ["border"], ctx)?.value ?? "0") * 2;
    const fieldInput = side(input, "padding", "top", ctx) + side(input, "padding", "bottom", ctx) + border + textHeight(input, 1, ctx);
    const gap = parseFloat(cascade(child, ["gap"], ctx)?.value ?? "0");
    const parts = [textHeight(label, 1, ctx), fieldInput, ...(hint ? [textHeight(hint, 1, ctx)] : [])];
    return parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  };
  // (hidden fields, which a form that can post without scripts carries, take no room)
  const children = elements(form).filter((e) => !(e.tag === "input" && e.attrs.type === "hidden"));
  const rows: El[][] = [];
  children.forEach((c, i) => {
    const r = Math.floor(i / columns);
    (rows[r] ??= []).push(c);
  });
  const gap = rowGap(form, ctx);
  const bottoms: number[] = [];
  let cursor = formTop;
  rows.forEach((row, r) => {
    const h = Math.max(...row.map(heightOf));
    bottoms[r] = cursor + h;
    cursor += h + gap;
  });
  const bottomOf = (child: El) => bottoms[Math.floor(children.indexOf(child) / columns)]!;
  const [emailField, ...rest] = children;
  const button = children.find((c) => c.tag === "button")!;
  return { formTop, emailBottom: bottomOf(emailField!), questionBottom: bottomOf(rest[0]!), buttonBottom: bottomOf(button), columns };
}

/* =============================================================== findings */

describe("findings (each FAILS on 01d5d9f, and passes once fixed)", () => {
  it("DEFECT (MEDIUM): the one form is below the first screen — measured in Chromium at 1440 x 900 (the receipt says 'the form is within the first 900px'): the question's field is cut by the fold (896 to 944) and the button is at 986 to 1038, 138px below it; at 1366 x 768 and 1280 x 720 not even the email field is on screen (795 to 843, 776 to 824) and at 375 x 667 neither (761 to 809), the button's top is at 945 to 970 on phones 375 to 430px wide, below the screen of every phone up to 932px tall (the builder's own screen 01 shows the second label on the fold). D-0024 §A sets the order (the headline, a line, the count, the pledge, the status, then the form) so the form can come no earlier; the stylesheet puts 777px above it at 1440px: the headline 102px x 3 lines (294px), the count 56px, the pledge, the status line, each with its margins", () => {
    const m = firstScreen(door(), at(1440));
    // 900px is the whole window the receipt names (a browser's own bars take 100px or more of a 1440 x 900 screen);
    // the form, button included, is the one thing the first screen asks.
    expect(Math.round(m.buttonBottom), `at 1440px the form starts at ${Math.round(m.formTop)}px and its button ends at ${Math.round(m.buttonBottom)}px`).toBeLessThanOrEqual(900);
  });

  it("DEFECT (MEDIUM): after the one answer the fields are emptied and the answer is drawn under the button, out of sight of the field the person was in — measured in Chromium at 1440 x 900 with Enter in the question or in the address: the status line at y 1006 to 1098 and 1020 to 1112 of a 900px screen, so a visitor sees both fields go empty and nothing else; at 375 x 812 with Enter in the address it is at 952 to 1066 of 812 (390 x 844: 984 to 1098), at 1920 x 1080 and 820 x 1180 its lower part is cut. GetInFormView draws `<p role=\"status\">` after the form, below the hint and the button, and keeps no focus or scroll on it; a screen reader hears it, a sighted person is told nothing. (Found by keyboard; a person who scrolls to the button at 1440 x 900 and clicks it does see it, at y 488 to 580)", () => {
    const answered = render(createElement(GetInFormView, { state: { ok: true }, action: () => undefined, pending: false, need: true }));
    const status = findAll(answered, (e) => e.attrs.role === "status")[0]!;
    const order = inOrder(answered);
    const fields = visibleInputs(answered);
    const source = read("src/components/public/GetInForm.tsx");
    const seen = {
      // in view where the person is: before the fields, or in their place, or moved to by focus or scroll
      beforeFields: fields.every((f) => order.indexOf(status) < order.indexOf(f)),
      replacesFields: fields.length === 0,
      focusedOrScrolledTo: /\.focus\(|scrollIntoView/.test(source),
    };
    expect(Object.values(seen).some(Boolean), `the answer is where the fields are not: ${JSON.stringify(seen)}`).toBe(true);
  });

  it("DEFECT (MEDIUM): by keyboard, submitting from the button throws focus to the page — measured in Chromium at 1440 x 900 and 375 x 700: Tab, Tab, Tab to 'Join the waiting list' and Enter, and after a refusal at the address, a refusal at the question and the one answer alike `document.activeElement` was <body>; the next Tab went to the 'Privacy' link below the form and it took Shift+Tab twice more to get back to the question (three times to the address). GetInForm.tsx gives the button `disabled={pending}`, and a focused button that becomes disabled loses focus; Enter from a field keeps it (WCAG 2.4.3, 3.3.1: the refusal is announced by role=alert, but the person is no longer where it can be fixed). The form gained two stops for M-0021, so the walk back is longer than on /feed's form, which has the same line", () => {
    const pending = render(createElement(GetInFormView, { state: null, action: () => undefined, pending: true, need: true }));
    const button = findAll(pending, (e) => e.tag === "button")[0]!;
    const source = read("src/components/public/GetInForm.tsx");
    const sending = {
      disabledWhileSending: button.attrs.disabled !== undefined,
      focusIsGivenBack: /\.focus\(/.test(source),
    };
    expect(!sending.disabledWhileSending || sending.focusIsGivenBack, `the button is disabled while the form is sent and nothing returns focus: ${JSON.stringify(sending)}`).toBe(true);
  });

  it("DEFECT (LOW): with scripts off the front door's form does nothing and says nothing — measured in Chromium with JavaScript disabled on / and /feed (served on 3731): the form's action is `javascript:throw new Error('React form unexpectedly submitted.')`, with no method and no hidden fields; Enter in the address left the URL, the field and the page as they were (no request at all). On the commit before M-0021 (3732) the same form carried `method=POST` and the $ACTION fields and posted, but the server answered 500 (plain text 'Internal Server Error'; its log: 'Invalid Server Actions request'), because the root layout's `<meta name=referrer content=no-referrer>` makes the browser send `Origin: null` on a form post (next.config.ts says it chose Referrer-Policy same-origin for exactly this: 'every form without JavaScript failed'). GetInForm now wraps takeSeat in a client closure to remember what was typed, which cannot post without JavaScript, and the meta still defeats the header: two causes, one result. Scripts-off visitors are few; the page says nothing to them either way", async () => {
    const tree = await streamed(createElement(GetInForm, { need: true }));
    const form = findAll(tree, (e) => e.tag === "form")[0]!;
    const hidden = findAll(form, (e) => e.tag === "input" && e.attrs.type === "hidden").map((e) => e.attrs.name ?? "");
    const readsReferrer = (path: string) => /referrer:\s*"([^"]+)"/.exec(read(path))?.[1];
    const policy = readsReferrer("src/app/(public)/layout.tsx") ?? readsReferrer("src/app/layout.tsx");
    expect({
      postsWithoutScripts: form.attrs.method?.toLowerCase() === "post" && hidden.some((n) => n.startsWith("$ACTION")),
      originIsSent: policy !== "no-referrer",
    }).toEqual({ postsWithoutScripts: true, originIsSent: true });
  });

  it("DEFECT (LOW): a page's own title and description are not its link card's — served by the production build, /privacy has <title>Privacy · our.one</title> and a description of its own ('What our.one keeps about you…') and its og:title, og:description, twitter:title and twitter:description are the front door's ('our.one · The software we live in should be ours.', 'We're bringing people and builders together…'); so are /feed's, /agreement's, /build's, /projects', /maintainers', /costs', /power', /rules' (their own descriptions differ in every one). SPEC §18.23 says 'A page that sets none of its own gives its link this card', which is not what happens to a page that does: (public)/layout.tsx names `title` and `description` inside openGraph and twitter, and Next fills those from the page's own metadata only where they are absent", async () => {
    const card = generateMetadata();
    const hardCoded = {
      openGraph: [card.openGraph?.title, card.openGraph?.description].filter((v) => v !== undefined).length,
      twitter: [card.twitter?.title, card.twitter?.description].filter((v) => v !== undefined).length,
    };
    // Pages that describe themselves, and set no card of their own.
    const own = [
      "projects",
      "agreement",
      "costs",
      "power",
      "rules",
      "build",
      "feed",
      "maintainers",
      "privacy",
    ].filter((dir) => /description:/.test(read(`src/app/(public)/${dir}/page.tsx`)) && !/openGraph|twitter:/.test(read(`src/app/(public)/${dir}/page.tsx`)));
    // Either the layout leaves the words to the page (so Next fills the card from each page's own title and description), or each page sets its card.
    const overridden = hardCoded.openGraph + hardCoded.twitter > 0 ? own : [];
    expect(overridden, "pages whose own title and description the layout's card replaces").toEqual([]);
  });

  it("DEFECT (LOW): the card draws the wordmark differently from the site's — viewed at 1200 x 630 (public/card.png) beside the header at 1440px: the card has a rust bullet in front of 'our.one' in ink at -0.03em, where the header's is 'our', a rust full stop, 'one' at -0.07em (Wordmark in SiteHeader.tsx, `.public-wordmark__dot`), the mark D-0023 §A calls 'the wordmark with its rust dot'. scripts/card.ts's `.wm i` is a 12px circle before the text; the card is the one picture of the brand that leaves the site", () => {
    const wordmark = reactDomServer.renderToStaticMarkup(createElement(Wordmark));
    expect(wordmark).toMatch(/^our<span[^>]*>\.<\/span>one$/);
    const html = cardHtml();
    const drawn = /<div class="wm">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    // the dot of "our.one" is the one in rust, as on the site: no separate bullet, and the full stop is wrapped to be coloured
    expect(drawn.replace(/<\/?[a-z][^>]*>/gi, (tag) => (tag.startsWith("</") ? "</>" : "<>"))).toMatch(/^our<>\.<\/>one$/);
  });

  it("DEFECT (LOW): the question is cut at 140 characters without a word — measured in Chromium at 1440px: 199 FICTIONAL characters pasted into 'Which app would you take back?' left 140 in the field and no message, and nothing on the form says 140. The input carries maxlength=140, so the browser drops the rest; the refusal D-0024 §B promises ('A longer one is refused at the field, in words', NEED_TOO_LONG) can only be reached by a client that is not a browser. A person who pastes a sentence submits it cut mid-word, unaware", () => {
    const tree = door();
    const need = byId(tree, "field-need")!;
    const words = [...findAll(tree, (e) => e.tag === "label" && e.attrs.for === "field-need"), byId(tree, "field-need-hint")!].map(text).join(" ");
    const counter = findAll(tree, (e) => /counter|remaining/.test(moduleClass(e))).length > 0;
    const cut = { limitIsStated: new RegExp(String(LIMITS.needMax)).test(words) || counter, browserCutsSilently: need.attrs.maxlength !== undefined };
    expect(need.attrs.maxlength === undefined || need.attrs.maxlength === String(LIMITS.needMax)).toBe(true);
    expect(cut.limitIsStated || !cut.browserCutsSilently, `the field has maxlength ${need.attrs.maxlength} and its words never say so: ${JSON.stringify(cut)}`).toBe(true);
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: the first screen's order for a visitor — in Chromium at 375, 820 and 1440px: the eyebrow, the headline (the page's only h1), the line, '10 of 100,000 people are in.' with the number at 40px (375px) to 56px (1440px), the pledge in a figure with a 3px rust rule and 'Rado, maintainer', the status line, then the one form (Your email, Which app would you take back?, its hint, the button, '3 apps named so far.', the seat line, the free line, the Privacy line); one email field, no entrance buttons", () => {
    const tree = door();
    const section = hero(tree);
    const blocks = elements(byClass(section, "heroText")[0]!).map((e) => moduleClass(e).split(" ")[0] || e.tag);
    expect(blocks).toEqual(["lede", "progress", "pledge", "heroStatus", "heroJoin"]);
    expect(findAll(tree, (e) => e.tag === "h1")).toHaveLength(1);
    expect(text(byClass(tree, "progress")[0]!)).toBe(progressLine(10));
    expect(text(byClass(tree, "lede")[0]!)).toBe(DOOR_START);
    expect(text(byClass(tree, "pledgeBy")[0]!)).toBe("Rado, maintainer");
    expect(elements(byClass(tree, "pledge")[0]!).map((e) => e.tag)).toEqual(["blockquote", "figcaption"]);
    expect(findAll(tree, (e) => e.tag === "input" && e.attrs.type === "email")).toHaveLength(1);
    const form = byClass(tree, "heroJoin")[0]!;
    expect(elements(form).map((e) => (e.tag === "p" ? text(e).slice(0, 14) : e.tag))).toEqual(["div", "3 answers so f", "No seats are o", "Free to join. ", "We'll email yo"]);
    // "The number set large" (M-0021): at least twice the sentence's 18px at every width, 40px to 56px as Chromium drew it
    const sizes = [320, 375, 820, 1000, 1440].map((w) => px(cascade(byClass(tree, "progressN")[0]!, ["font-size"], at(w))!.value, at(w)));
    sizes.forEach((size) => expect(size).toBeGreaterThanOrEqual(36));
    // The pledge's rule, and no 40px browser margin on the figure (found in a browser by the builder, held here)
    expect(value([".pledge"], "border-left")).toBe("3px solid var(--rust)");
    const margin = (value([".pledge"], "margin") ?? "").split(/\s+/);
    expect([margin[1] ?? margin[0], margin[3] ?? margin[1] ?? margin[0]]).toEqual(["0", "0"]);
  });

  it("closed: nothing scrolls sideways, is cut or passes an edge — 224 loads in Chromium (the visitor and a member × light and dark × 56 widths from 320 to 1920px, 539, 540, 541, 699 to 701, 759 to 761, 819, 821, 999 and 1001 among them): scrollWidth equal to clientWidth, no box of the hero or the header past either edge; the hero's columns are minmax(0, …), the pledge and the form are capped at 520px with no side margin, only 'not-for-profit' is kept whole, and long words break", () => {
    expect(value([".hero"], "grid-template-columns", at(1000))).toBe("minmax(0, 1.32fr) minmax(0, 1fr)");
    expect(value([".hero"], "flex-direction", at(375))).toBe("column");
    expect(value([".pledge"], "max-width")).toBe("520px");
    expect(value([".heroJoin"], "max-width")).toBe("520px");
    expect(value([".public"], "overflow-wrap")).toBe("break-word");
    const tree = door();
    expect(byClass(tree, "nowrap").map(text)).toEqual(["not-for-profit"]);
    expect(value([".public .form"], "max-width")).toBe("520px");
  });

  it("closed: the form stacks at every width, 540px included — measured in Chromium at 539, 540 and 541px (the old one-line rule begins at 540px): the address, the question and the button each on their own line, 495 to 497px wide, no overlap; /feed's form, which has one field, still shares a line with its button from 540px (the stylesheet's `.get-in-form--need` is inside the same media query and wins on specificity)", () => {
    const form = findAll(door(), (e) => e.tag === "form")[0]!;
    expect(hasClass(form, "get-in-form--need")).toBe(true);
    for (const width of [320, 375, 539, 540, 541, 600, 820, 1000, 1440]) {
      const columns = cascade(form, ["grid-template-columns"], at(width))?.value ?? "none";
      expect(columns, `${width}px`).toMatch(/^(none|minmax\(0, 1fr\))$/);
    }
    const feed = render(createElement(GetInFormView, { state: null, action: () => undefined, pending: false }));
    const oneField = findAll(feed, (e) => e.tag === "form")[0]!;
    expect(hasClass(oneField, "get-in-form--need")).toBe(false);
    expect(cascade(oneField, ["grid-template-columns"], at(539))).toBeUndefined();
    expect(cascade(oneField, ["grid-template-columns"], at(540))?.value).toBe("minmax(0, 1fr) auto");
  });

  it("closed: sizes to touch — measured in Chromium with touch at 375px: the button 343 x 52px, each field 48.1px tall (343px wide), the member's 'Open your feed' 146 x 36px with a hit area of 48px (the stylesheet's `.btn::after` grows it by 6px above and below on a coarse pointer); the header's Sign in 44px; the inline links ('See where it stands.', 'Privacy') are words in a sentence, 15px tall", () => {
    const tree = door();
    const button = findAll(tree, (e) => e.tag === "button")[0]!;
    const input = byId(tree, "field-email")!;
    const coarse = at(375, false, true);
    expect(px(cascade(button, ["height"], coarse)!.value, coarse)).toBe(52);
    const heights = [input, byId(tree, "field-need")!].map((i) => side(i, "padding", "top", coarse) + side(i, "padding", "bottom", coarse) + 2 + textHeight(i, 1, coarse));
    heights.forEach((h) => expect(h).toBeGreaterThanOrEqual(44));
    // 'Open your feed' is an ordinary 36px button whose touch target is grown by .btn::after
    expect(value([".btn"], "height", coarse, G_RULES)).toBe("36px");
    expect(value([".btn::after"], "inset", coarse, G_RULES)).toBe("-6px -4px");
    expect(value([".btn"], "position", coarse, G_RULES)).toBe("relative");
    expect(value([".public-header__signin"], "min-height", coarse, G_RULES)).toBe("44px");
  });

  it("closed: the picture beside the form — measured in Chromium at 761px and wider (57 widths from 320 to 1920px, as a visitor and as a member: 114 measurements of the hero's blocks, none overlapping): the picture is the hero's second column, from the headline's row down through the form's, 369 to 532px wide, and overlaps no block of the text; below 761px it follows the form, at most 450px wide and centred, so a phone sees the form first; it comes after the form in the markup, so the Tab order and the reading order agree", () => {
    const tree = door();
    const section = hero(tree);
    const kids = elements(section).map((e) => moduleClass(e).split(" ")[0] || e.tag);
    expect(kids.slice(0, 4)).toEqual(["eyebrow", "headline", "heroText", "diagram"]);
    expect(value([".hero"], "grid-template-areas", at(1000))).toMatch(/"eyebrow eyebrow"\s*"title\s+picture"\s*"text\s+picture"/);
    expect(value([".diagram"], "grid-area")).toBe("picture");
    expect(value([".hero"], "display", at(761))).toBe("grid");
    expect(value([".hero"], "display", at(760))).toBe("flex");
    expect([value([".diagram"], "max-width", at(375)), value([".diagram"], "margin", at(375))]).toEqual(["450px", "10px auto 0"]);
  });

  it("closed: text contrast of the new elements, measured from computed styles in Chromium and from the stylesheet's tokens — the count's number rust on the paper 4.74:1 at 40 to 56px (large text, 3:1 needed; 7.22:1 dark), the pledge and the count's words 13.14:1 (15.07:1), the pledge's caption, the status line, the hint and the Privacy line 5.79:1 (7.93:1), the labels 13.14:1, the error 5.88:1 (7.14:1), the button 13.14:1 (15.07:1), the field's edge 5.79:1 against the paper (7.93:1, WCAG 1.4.11), the panel's count #f5f3eb on its forest 11.94:1 (16.25:1)", () => {
    const pairs: [string, string, number][] = [
      ["var(--rust)", "var(--paper)", 3], // the large number
      ["var(--ink)", "var(--paper)", 4.5],
      ["var(--sub)", "var(--paper)", 4.5], // caption, status, hint, the Privacy line
      ["var(--danger)", "var(--paper)", 4.5], // the error
      ["var(--primary-text)", "var(--primary-bg)", 4.5],
      ["var(--forest-ink)", "var(--forest)", 4.5], // the panel's count
      ["var(--field-border)", "var(--paper)", 3],
    ];
    const expected: Record<string, [number, number]> = {
      "var(--rust)|var(--paper)": [4.74, 7.22],
      "var(--ink)|var(--paper)": [13.14, 15.07],
      "var(--sub)|var(--paper)": [5.79, 7.93],
      "var(--primary-text)|var(--primary-bg)": [13.14, 15.07],
      "var(--forest-ink)|var(--forest)": [11.94, 16.25],
      "var(--field-border)|var(--paper)": [5.79, 7.93],
    };
    for (const [i, scheme] of SCHEMES.entries()) {
      const ctx = at(1440, scheme === "dark");
      for (const [fg, bg, need] of pairs) {
        const ratio = contrast(resolve(fg, ctx), resolve(bg, ctx));
        expect(ratio, `${scheme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(need);
        const want = expected[`${fg}|${bg}`];
        if (want) expect(ratio, `${scheme}: ${fg} on ${bg}`).toBe(want[i]);
      }
    }
    // The error, from the app's own rule, over the paper: 5.88:1 and 7.14:1 as measured
    const error = render(createElement("div", { className: "public" }, createElement(GetInFormView, { state: { error: "FICTIONAL" }, action: () => undefined, pending: false, need: true })));
    const message = findAll(error, (e) => hasClass(e, "field__error"))[0]!;
    expect(SCHEMES.map((s) => contrast(resolve(cascade(message, ["color"], at(1440, s === "dark"))!.value, at(1440, s === "dark")), PAPER(at(1440, s === "dark"))))).toEqual([5.88, 7.14]);
    // And the same, element by element from the rendered page, over what is behind each one (what Chromium measured)
    const tree = door();
    const form = findAll(tree, (e) => e.tag === "form")[0]!;
    const elementsMeasured: [string, El, [number, number]][] = [
      ["the count's number", byClass(tree, "progressN")[0]!, [4.74, 7.22]],
      ["the pledge's words", findAll(byClass(tree, "pledgeWords")[0]!, (e) => e.tag === "p")[0]!, [13.14, 15.07]],
      ["the pledge's caption", byClass(tree, "pledgeBy")[0]!, [5.79, 7.93]],
      ["the status line", byClass(tree, "heroStatus")[0]!, [5.79, 7.93]],
      ["the question's label", findAll(form, (e) => e.tag === "label")[1]!, [13.14, 15.07]],
      ["the question's hint", byId(tree, "field-need-hint")!, [5.79, 7.93]],
      ["the button", findAll(form, (e) => e.tag === "button")[0]!, [13.14, 15.07]],
    ];
    for (const [i, scheme] of SCHEMES.entries()) {
      const ctx = at(1440, scheme === "dark");
      for (const [name, el, want] of elementsMeasured) {
        expect(contrast(resolve(inherited(el, "color", ctx)!, ctx), backdrop(el, ctx)), `${scheme}: ${name}`).toBe(want[i]);
      }
      // The field's edge against the page (WCAG 1.4.11): the sub-text colour, not the faint line
      const input = byId(tree, "field-need")!;
      expect(contrast(borderColour(input, ctx), backdrop(input.parent!.parent!, ctx)), `${scheme}: the field's edge`).toBe(([5.79, 7.93] as const)[i]);
    }
  });

  it("closed: the form by keyboard — in Chromium at 1440 and 375px the skip link comes first, then the wordmark, the four places and Sign in, then 'See where it stands.', the address, the question and the button, then the Privacy link; each field and the button take a 3px rust ring 3px out (4.74:1 on the paper, 7.22:1 dark), nothing clips it at 320px; Enter in either field submits; the hint is tied to the question by aria-describedby", () => {
    const tree = door();
    const section = hero(tree);
    expect(tabbable(section).map((e) => e.attrs.id ?? (text(e) || e.tag))).toEqual(["See where it stands.", "field-email", "field-need", "Join the waiting list", "Privacy"]);
    for (const el of [byId(tree, "field-email")!, byId(tree, "field-need")!, findAll(tree, (e) => e.tag === "button")[0]!]) {
      for (const scheme of SCHEMES) {
        const ctx = at(1440, scheme === "dark");
        const ring = ringColour(el, ctx);
        expect(ring.selector).toBe(".public :focus-visible");
        expect({ width: ring.width, offset: ring.offset }).toEqual({ width: 3, offset: 3 });
        expect(contrast(ring.colour, PAPER(ctx))).toBeGreaterThanOrEqual(3);
      }
    }
    const form = findAll(tree, (e) => e.tag === "form")[0]!;
    expect(findAll(form, (e) => e.tag === "button" && e.attrs.type === "submit")).toHaveLength(1);
    expect(visibleInputs(form).map((e) => e.attrs.name)).toEqual(["email", "need"]);
    expect(byId(tree, "field-need")!.attrs["aria-describedby"]).toBe("field-need-hint");
    expect(text(byId(tree, "field-need-hint")!)).toBe(NEED_HINT);
    expect(findAll(tree, (e) => e.tag === "label").map(text)).toContain(NEED_LABEL);
    expect(read("src/app/layout.tsx")).toMatch(/<a className="skip-link" href="#main">/);
  });

  it("closed: a refusal is announced and kept at its own field — in Chromium by keyboard: the question holding an address ('Leave email addresses out of this one…'), an invalid address with a question, and the same address a fourth time within the hour ('You've done that too many times. Try again later.') each put one role=alert paragraph under the field it names, set aria-invalid on that input only and add the error's id to its aria-describedby (the question's keeps its hint first), and both fields keep what was typed; after the one answer both are empty and one role=status paragraph is drawn", () => {
    const refused = (state: { error: string; field?: "need" }) => render(createElement(GetInFormView, { state, action: () => undefined, pending: false, need: true, values: { email: "typed@example.test", need: "FICTIONAL typed" } }));
    const atNeed = refused({ error: "Leave email addresses out of this one. We don't keep it with your address, and it isn't needed.", field: "need" });
    const atEmail = refused({ error: "You've done that too many times. Try again later." });
    expect(findAll(atNeed, (e) => e.attrs.role === "alert").map((e) => e.attrs.id)).toEqual(["field-need-error"]);
    expect(findAll(atEmail, (e) => e.attrs.role === "alert").map((e) => e.attrs.id)).toEqual(["field-email-error"]);
    expect(byId(atNeed, "field-need")!.attrs).toMatchObject({ "aria-invalid": "true", "aria-describedby": "field-need-hint field-need-error", value: "FICTIONAL typed" });
    expect(byId(atNeed, "field-email")!.attrs["aria-invalid"]).toBeUndefined();
    expect(byId(atNeed, "field-email")!.attrs.value).toBe("typed@example.test");
    expect(byId(atEmail, "field-email")!.attrs).toMatchObject({ "aria-invalid": "true", "aria-describedby": "field-email-error", value: "typed@example.test" });
    expect(byId(atEmail, "field-need")!.attrs["aria-invalid"]).toBeUndefined();
    const answered = render(createElement(GetInFormView, { state: { ok: true }, action: () => undefined, pending: false, need: true }));
    expect(visibleInputs(answered).map((e) => e.attrs.value)).toEqual([undefined, undefined]);
    expect(findAll(answered, (e) => e.attrs.role === "status")).toHaveLength(1);
    expect(findAll(answered, (e) => e.attrs.role === "alert")).toEqual([]);
  });

  it("closed: the member's front door and the panel — in Chromium at 320, 375, 820, 1000 and 1440px, light and dark: the same first screen with no form and no entrance, 'You're in.' and 'Open your feed' (to /home) in the form's place, '10 of 100,000 people are in.' once and no rank; on /home the panel's card carries the same line in the forest card at 15px bold (#f5f3eb on #253328, 11.94:1; 16.25:1 dark) between its words and its buttons; the line is left out when the count can't be read", async () => {
    req.member = true;
    const member = render(await FrontDoorRoute());
    expect(findAll(member, (e) => e.tag === "form")).toEqual([]);
    expect(visibleInputs(member)).toEqual([]);
    expect(text(byClass(member, "heroJoin")[0]!)).toBe(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link}`);
    expect(findAll(member, (e) => e.tag === "a" && text(e) === MEMBER_JOIN.link).map((a) => a.attrs.href)).toContain("/home");
    expect(text(member).match(/of 100,000 people are in/g)).toHaveLength(1);
    expect(text(member)).not.toContain("You'd be #");
    expect(text(member)).not.toMatch(/apps? named so far/);
    const withCount = render(inShell(createElement(OursCard, { email: null, count: 10 }), "aside"));
    const count = byClass(withCount, "card__count")[0]!;
    expect(text(count)).toBe(progressLine(10));
    expect(elements(byClass(withCount, "card--ours")[0]!).map((e) => moduleClass(e).split(" ")[0] || e.tag)).toEqual(["card__kicker", "card__title", "card__text", "card__count", "card__actions", "card__links"]);
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      expect(cascade(count, ["font-size"], ctx)!.value).toBe("15px");
      expect(contrast(resolve(cascade(count, ["color"], ctx)!.value, ctx), resolve("var(--forest)", ctx))).toBeGreaterThanOrEqual(4.5);
    }
    const without = render(inShell(createElement(RightColumn, { invitesRemaining: 8, count: null }), "aside"));
    expect(byClass(without, "card__count")).toEqual([]);
    expect(byClass(without, "card--ours")).toHaveLength(1);
  });

  it("closed: the heading order and landmarks — in Chromium for a visitor and for a member on /: one h1, then h2s with h3s under them, no skipped level, no duplicate id, the skip link's #main is the <main>; one <header>, two navs ('our.one', 'About our.one'), one <main>, one <footer>; on /home one h1 ('Feed'), the panel an <aside> named 'our.one' whose card is a region named by its h2", () => {
    const tree = door();
    const heads = findAll(tree, (e) => /^h[1-6]$/.test(e.tag)).map((e) => Number(e.tag[1]));
    expect(heads[0]).toBe(1);
    expect(heads.filter((h) => h === 1)).toHaveLength(1);
    heads.forEach((h, i) => i > 0 && expect(h - heads[i - 1]!).toBeLessThanOrEqual(1));
    const ids = findAll(tree, (e) => e.attrs.id !== undefined).map((e) => e.attrs.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(byId(tree, "join")).toBeDefined();
    const panel = render(createElement("div", { className: "public app-shell" }, createElement(RightColumn, { invitesRemaining: 8, count: 10 })));
    expect(findAll(panel, (e) => e.tag === "aside").map((e) => e.attrs["aria-label"])).toEqual(["our.one"]);
    expect(elements(byClass(panel, "card--ours")[0]!).filter((e) => e.tag === "h2")).toHaveLength(1);
  });

  it("closed: the panel's link up to the one form works — in Chromium at 1440 x 900 and 375 x 667, Enter on 'Join at the top of this page ↑' scrolls #join to 24px from the top (label first), and the next Tab lands in the address; for a member the same place says 'Open your feed' to /home; nothing else on the page leads to a second form", () => {
    const visitor = door();
    expect(findAll(visitor, (e) => e.tag === "a" && e.attrs.href === "#join").map(text)).toEqual(["Join at the top of this page ↑"]);
    expect(byId(visitor, "join")).toBeDefined();
    expect(value([".heroJoin"], "scroll-margin-top")).toBe("24px");
    expect(findAll(visitor, (e) => e.tag === "form")).toHaveLength(1);
    const member = door({ member: true, needs: null });
    expect(findAll(member, (e) => e.tag === "a" && e.attrs.href === "#join")).toEqual([]);
    expect(findAll(member, (e) => e.tag === "form")).toEqual([]);
  });

  it("closed: with the database down the front door renders, without the count, the named-apps line or the question — in Chromium on the instance whose DATABASE_URL is a closed port: / is 200 at 375 and 1440px, light and dark, with no error on the page and one line in the log per read that failed ('[ours] front door: the count could not be read: Error'); the form is there and asks for the address alone, and nothing is shown of the count, the named apps or the seats", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    req.memberCount = "fails";
    req.needCount = "fails";
    req.seats = "fails";
    const tree = render(await FrontDoorRoute());
    expect(text(tree)).not.toMatch(/people are in|apps? named so far/);
    expect(byClass(tree, "progress")).toEqual([]);
    expect(visibleInputs(tree).map((e) => e.attrs.name)).toEqual(["email"]);
    expect(findAll(tree, (e) => e.tag === "label").map(text)).not.toContain(NEED_LABEL);
    expect(findAll(tree, (e) => e.tag === "h1")).toHaveLength(1);
  });

  it("closed: with the `needs` table missing the page renders and the form asks for the address alone — in Chromium on a copy of the scratch database whose table was renamed: / is 200, '10 of 100,000 people are in.' is shown, the question and the named-apps line are not, one address field; /feed is as it was; every other public page is unchanged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    req.needCount = "fails";
    const tree = render(await FrontDoorRoute());
    expect(text(tree)).toContain(progressLine(10));
    expect(text(tree)).not.toMatch(/apps? named so far/);
    expect(visibleInputs(tree).map((e) => e.attrs.name)).toEqual(["email"]);
    expect(findAll(tree, (e) => e.tag === "form")[0]!.attrs.class).not.toContain("get-in-form--need");
  });

  it("closed: with joining closed the first screen has no form — in Chromium on the instance with DATA_CONTROLLER unset: / says 'Joining opens soon.' and 'Have an invite? It can't be used until joining opens.' where the form was, with the count and the pledge as before; the feed's panel has no link up to a form; no field, no named-apps line", () => {
    const tree = door({ joining: false, needs: null, seatsOpen: null, seatsWaiting: null });
    expect(findAll(tree, (e) => e.tag === "form")).toEqual([]);
    expect(visibleInputs(tree)).toEqual([]);
    expect(text(byClass(tree, "heroJoin")[0]!)).toMatch(/^Joining opens soon\. Have an invite\?/);
    expect(text(tree)).toContain(progressLine(10));
    expect(findAll(tree, (e) => e.tag === "a" && e.attrs.href === "#join")).toEqual([]);
  });

  it("closed: the link card on every public page — served by the production build on /, /privacy, /feed, /agreement, /build, /contract, /signin, /projects, /maintainers, /costs, /power, /rules, /join, /auth, /unsubscribe and an invite page: og:type website, og:site_name our.one, og:title, og:description, og:image (http://localhost:3731/card.png) with width 1200, height 630 and an alt, twitter:card summary_large_image, twitter:image and its alt; the 404 page serves none and says noindex; the invite, join and unsubscribe pages say noindex, nofollow", () => {
    vi.stubEnv("APP_URL", "http://localhost:3731");
    const card = generateMetadata();
    expect(String(card.metadataBase)).toBe("http://localhost:3731/");
    // The title and the description are the front door's where the layout names them, and the page's own where it leaves them to Next.
    expect(card.openGraph).toMatchObject({ type: "website", siteName: "our.one" });
    expect(card.openGraph?.title ?? DOOR_TITLE).toBe(DOOR_TITLE);
    expect(card.openGraph?.description ?? DOOR_LEDE).toBe(DOOR_LEDE);
    expect(card.openGraph?.images).toEqual([{ url: CARD.path, width: 1200, height: 630, alt: CARD.alt }]);
    expect(card.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: CARD.path, alt: CARD.alt }] });
    expect(card.twitter?.title ?? DOOR_TITLE).toBe(DOOR_TITLE);
    expect(card.twitter?.description ?? DOOR_LEDE).toBe(DOOR_LEDE);
    expect(CARD.alt.length).toBeGreaterThan(10);
    // The public layout is the one place that carries it (so the 404 page, drawn by the root layout, serves none),
    // and the root layout imports nothing from the core.
    expect(read("src/app/layout.tsx")).not.toMatch(/@\/core|openGraph|twitter/);
  });

  it("closed: the card's image as served — /card.png on the production build: 200, image/png, 48,428 bytes, Cache-Control public, max-age=0, ETag, byte-for-byte public/card.png, 1200 x 630, 8-bit RGB; seen at full size: the headline in 112px ink with 'ours.' in rust italic on the paper, the wordmark above it and 'It starts with a friends feed.' below, all inside the frame (a 1.91:1 crop at Facebook and a 2:1 crop at X keep the foot, which ends at y 570), the foot 5.79:1 on the paper; fetched by nothing but the site", () => {
    const png = readFileSync(join(WEB_ROOT, "public/card.png"));
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    // 48,428 bytes as committed and served; a card made again may weigh a little more or less, never nothing and never the most
    expect(png.length).toBeGreaterThan(20_000);
    expect(png.length).toBeLessThan(CARD_MAX_BYTES);
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
    // 8-bit, colour type 2 (RGB), not interlaced: the IHDR's last five bytes before the CRC
    expect([png[24], png[25], png[28]]).toEqual([8, 2, 0]);
    const html = cardHtml();
    expect(html).toContain("top:540px");
    expect(html).not.toMatch(/https?:\/\/|url\(|@import/);
    expect(contrast(colour("#586157"), colour("#f5f3eb"))).toBe(5.79);
  });

  it("closed: the card without a base, with a trailing slash — in production with APP_URL unset (3736): every public page 200, no error on the page, the log says 'the link card has no base address' once per request and Next adds its own warning; the pages still render the count and the form. With APP_URL=http://localhost:3737/ the card's image is http://localhost:3737/card.png (appUrl() strips the slash). (With a path in APP_URL, which names an origin and isn't one, the image is under that path and 404s: a misconfiguration, not a finding)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    const none = generateMetadata();
    expect(none.metadataBase).toBeUndefined();
    expect(none.openGraph).toBeDefined();
    expect(error.mock.calls.map((c) => String(c[0])).join(" ")).toContain("the link card has no base address");
    vi.stubEnv("APP_URL", "http://localhost:3737/");
    expect(String(generateMetadata().metadataBase)).toBe("http://localhost:3737/");
  });

  it("closed: nothing loads from another origin, nothing shifts and the console stays quiet — in Chromium on / as a visitor and a member at 375 and 1440px: every request went to the site itself (the only external address is a link, 'Open code ↗'), cumulative layout shift 0 (the count, the named-apps line and the answers are drawn by the server or by the one client form, never fetched after load), no console message, no page error; the stylesheets import and fetch nothing", () => {
    for (const css of [GLOBALS, DOOR_CSS]) expect(css).not.toMatch(/@import|@font-face|url\(\s*['"]?(https?:)?\/\//);
    const tree = door();
    const loads = findAll(tree, (e) => ["link", "script", "img", "iframe", "source", "video", "audio"].includes(e.tag));
    expect(loads.filter((e) => /^(https?:)?\/\//.test(e.attrs.src ?? e.attrs.href ?? ""))).toEqual([]);
    expect([...new Set(findAll(tree, (e) => e.tag === "a" && /^https?:/.test(e.attrs.href ?? "")).map((a) => new URL(a.attrs.href!).host))]).toEqual(["github.com"]);
    const source = read("src/components/public/FrontDoor.tsx");
    expect(source).not.toMatch(/useEffect|fetch\(|useLayoutEffect/);
    expect(read("src/app/(public)/page.tsx")).toMatch(/joining && !member \? readNeeds\(\)/);
    expect(needsLine(0)).toBeNull();
    // Changed after round one (H3): the line counts answers, and says so.
    expect(needsLine(1)).toBe("1 answer so far.");
  });
});
