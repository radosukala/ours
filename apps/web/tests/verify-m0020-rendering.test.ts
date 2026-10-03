/**
 * Independent verification of M-0020 (one our.one, signed in or not;
 * D-0023; SPEC §18.22), the rendering and use lens: what a person sees and
 * can do on every signed-in page, the front door and /feed, at every width,
 * light and dark, and by keyboard alone. Written by an agent that built none
 * of it, against 4e04af5 (the build is dc12ea0 with b5cf968; 80e4300 and
 * 4e04af5 add only receipts). The honesty of the words is the other
 * verifier's. Nothing in the product code, the records or the existing
 * tests is changed by this file.
 *
 * What was read: AGENTS.md; D-0023; M-0020 (.md and .yaml); SPEC §9 and
 * §18.22; the build receipt and its screens; the stopping rule
 * (receipts/conformance/2026-10-03-M-0020.verification.md); the M-0017
 * rendering verification and its test; `git diff 184865b 4e04af5`.
 *
 * How it was looked at. A production build of 4e04af5 (`next build`),
 * served by `next start` on 127.0.0.1:3732 under `env -i` with FICTIONAL
 * settings (DATA_CONTROLLER="FICTIONAL Controller",
 * DATA_CONTROLLER_EMAIL=controller@example.test, MAIL_TRANSPORT=outbox,
 * CLIENT_IP_HEADER=x-forwarded-for, a FICTIONAL SESSION_SECRET, telemetry
 * off) on a scratch database migrated and seeded by the app's own scripts
 * (`seed-fictional`: ten FICTIONAL people). Sessions were started with the
 * app's own `createSession` for the FICTIONAL @ada_quillon (administrator)
 * and @bruno_varnell, and handed to the browser as `__Host-ours_session`. A
 * second instance (127.0.0.1:3739) had DATABASE_URL on a closed port. The
 * browser was the headless Chromium 153 (chrome-headless-shell), driven
 * over the DevTools protocol by the verifier's own scripts, with a fresh
 * profile and nothing resolving but localhost:
 *
 * 1. a sweep of /home, /notifications, /people, /people/requests,
 *    /people/following, /people/followers, /people/invites,
 *    /u/ada_quillon, /u/bruno_varnell, /p/<id>, /settings,
 *    /settings/blocked, /settings/delete, /report and /admin as the
 *    administrator, and /, /feed and /agreement as a member and as a
 *    visitor, plus /home, /admin and / as a member who is not one, at 320,
 *    375 and 820px with touch and 1000 and 1440px without, light and dark
 *    (240 loads): sideways scroll, boxes past the edge, the header's rows
 *    and overlaps, the column and the panel, the bottom bar, WCAG 1.4.3
 *    for every visible text run over what is behind it, every colour in
 *    every computed style, every target's size on touch, every request's
 *    origin, and the console;
 * 2. the header at 699, 700, 701, 720, 760, 761, 800, 900, 999, 1000, 1001,
 *    1020, 1100 and 1280px, with today's counts and with "99+" on both,
 *    and with a 15 or 17px scrollbar that takes room (a styled one);
 * 3. keyboard sessions: the Tab order through the header at 1440, 820 and
 *    375px and every ring's colour and contrast; the member's menu (open,
 *    Tab, follow a link, Escape, Tab out, a click or tap outside) at 1440,
 *    820, 375 and 320px; the panel's two drafts (Enter, where focus goes,
 *    Tab inside, Escape, focus back) at 1440, 820, 375 and 320px, light and
 *    dark; the composer (its ring, the audience, Post, a FICTIONAL post with
 *    Ctrl+Enter, the counter near and over the limit); the bottom bar and
 *    its ＋; 60 Tabs and 40 Shift+Tabs on /home, /notifications and /people
 *    at 375 and 320px, and 60 Shift+Tabs at 820 and 1440px, measuring
 *    whether the focused element is hidden;
 * 4. the bottom of every phone page with the bar; the sticky panel at
 *    1440×900, 1440×780, 1366×657, 1280×600 and 1000×700; the member's links
 *    after 1500px of scroll; a hovered post with a link;
 * 5. the public pages with the database down (13 pages, as a visitor and
 *    with a member's cookie, 375 light and 1440 dark), and /home there;
 * 6. the pictures of the app on /feed beside the app itself at 375px.
 *
 * Screenshots (not committed) were saved beside the scripts, in the
 * verifier's scratch directory, and are named in its report.
 *
 * Each finding ends here as a "DEFECT (SEVERITY): …" test that FAILS on
 * 4e04af5 and would pass once fixed; where only a browser shows it, the
 * test pins the cause in the stylesheet or the markup, and its title says
 * what was measured, where and how. Each check that held is a "closed: …"
 * test that passes. HIGH: a page fails or can't be used, or private data is
 * exposed; MEDIUM: a stated requirement unmet, or a real usability or
 * accessibility failure (WCAG AA); LOW: polish.
 *
 * Before this file was committed, each DEFECT was run against a scratch
 * copy of src/ with a plausible fix for it (in globals.css,
 * public.module.css, MemberLinks.tsx, the two public pages, FeedPreview.tsx
 * and FeedContrast.tsx): every test passed there, the closed checks too. That
 * copy is not part of this file, and nothing in it is a decision about how
 * to fix anything.
 *
 * Every person, address and value here is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const hydration = vi.hoisted(() => ({ ready: false }));
const nav = vi.hoisted(() => ({ path: "/home" }));
/** The request: a session cookie or none; a member behind it; the database up or down. */
const req = vi.hoisted(() => ({ cookie: null as string | null, member: false, dbDown: false }));

vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => hydration.ready }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/web/session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readSessionCookie: async () => req.cookie,
}));
// Nothing here reaches a database: the queries the pages make are the ones mocked below.
vi.mock("@/core/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => ({}),
}));
vi.mock("@/core/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sessionFromCookie: vi.fn(async () => {
    if (req.dbDown) throw Object.assign(new Error("FICTIONAL: connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    return req.member ? "FICTIONAL-account" : null;
  }),
  viewerAccount: vi.fn(async () => ({
    id: "FICTIONAL-account",
    handle: "ada_fict",
    displayName: "Ada (FICTIONAL)",
    isAdmin: true,
    acceptsFollowers: true,
    invitesRemaining: 8,
  })),
}));
vi.mock("@/core/seats", () => ({
  memberCount: vi.fn(async () => {
    if (req.dbDown) throw new Error("FICTIONAL: database down");
    return 10;
  }),
  seatState: vi.fn(async () => {
    if (req.dbDown) throw new Error("FICTIONAL: database down");
    return { open: 0, waiting: 0 };
  }),
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({ takeSeat: vi.fn(async () => ({ ok: true })) }));

import FeedPageRoute from "@/app/(public)/feed/page";
import FrontDoorRoute from "@/app/(public)/page";
import { MemberLinks } from "@/components/MemberLinks";
import { HeaderTabs } from "@/components/PageHeader";
import { OursCard, RightColumn } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { MEMBER_JOIN, MEMBER_PANEL } from "@/components/public/door";
import { FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview } from "@/components/public/FeedPreview";
import { PLACES } from "@/components/public/PublicNav";
import { isMemberHere } from "@/web/viewer";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");

const VIEWER = { handle: "ada_fict", displayName: "Ada (FICTIONAL)", isAdmin: true };
const COUNTS = { unread: 3, pending: 1 };

afterEach(() => {
  hydration.ready = false;
  nav.path = "/home";
  req.cookie = null;
  req.member = false;
  req.dbDown = false;
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

/** An element's classes as the source writes them: a CSS module's `_phoneBar_1a2b3c` is "phoneBar". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-z]{5,8}$/i, "$1").replace(/^[\w-]+-module__\w+__(.+)$/, "$1"))
    .join(" ");
}

const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);
const byClass = (tree: El, name: string) => findAll(tree, (e) => hasClass(e, name));
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
  return true;
}

const tabbable = (tree: El) => findAll(tree, (e) => FOCUSABLE(e) && reachable(e));

function render(node: ReactNode, hydrated = false): El {
  hydration.ready = hydrated;
  try {
    return parse(renderToStaticMarkup(node as never));
  } finally {
    hydration.ready = false;
  }
}

/** The app's shell around a part, as the (app) layout draws it: `.public.app-shell`, then `.app`. */
function inShell(part: ReactNode, where: "header" | "main" | "aside"): ReactNode {
  const shell = (child: ReactNode) => createElement("div", { className: "public app-shell" }, child);
  if (where === "header") return shell(part);
  if (where === "main") return shell(createElement("div", { className: "app" }, createElement("main", { id: "main", className: "app-main" }, part)));
  return shell(createElement("div", { className: "app" }, createElement("aside", { className: "aside" }, createElement("div", { className: "aside__inner" }, part))));
}

const memberHeader = (viewer = VIEWER, counts = COUNTS) =>
  render(inShell(createElement(SiteHeader, { member: true } as Parameters<typeof SiteHeader>[0], createElement(MemberLinks, { viewer, counts })), "header"));

/* ------------------------------------------------------------------- CSS */

type CssRule = { media: string | null; selectors: string[]; body: string; order: number; sheet: string };

function cssRules(css: string, sheet: string, start = 0): CssRule[] {
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
      else if (!head.startsWith("@"))
        out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner, order: start + out.length, sheet });
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
const P_RULES = cssRules(PUBLIC_CSS, "public.module.css", 100_000);
const ALL_RULES = [...G_RULES, ...P_RULES];

/** Where and how the page is seen. */
type Ctx = { width: number; dark: boolean; coarse: boolean };
const PHONE: Ctx = { width: 375, dark: false, coarse: true };
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
      if (!hasClass(el, m[1]!)) return false;
    } else if ((m = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(rest))) {
      const v = el.attrs[m[1]!];
      if (v === undefined) return false;
      const want = m[2] ?? m[3] ?? m[4];
      if (want !== undefined && v !== want) return false;
    } else if ((m = /^:not\(([^()]*)\)/.exec(rest))) {
      if (m[1]!.split(",").some((s) => compoundMatches(el, s.trim(), st))) return false;
    } else if ((m = /^:has\(([^()]*)\)/.exec(rest))) {
      const inner = m[1]!;
      if (!findAll(el, (d) => selectorMatches(d, inner, st)).length) return false;
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
    for (const s of r.selectors) {
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

/** The custom properties every app element sees: `:root`'s, then `.public`'s (the shell is `.public`). */
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

/** A colour as the app resolves it in the context. */
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
function ringColour(el: El, ctx: Ctx): { colour: Rgba; selector: string } {
  const d = cascade(el, ["outline", "outline-color"], ctx, { focus: el });
  if (!d) throw new Error("no ring");
  const raw = d.prop === "outline" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  return { colour: resolve(raw, ctx), selector: d.selector };
}

/** A border's colour from `border`, `border-color` or `border-top-color`. */
function borderColour(el: El, ctx: Ctx): Rgba {
  const d = cascade(el, ["border", "border-color", "border-top-color"], ctx);
  if (!d) throw new Error("no border");
  const raw = d.prop === "border" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  return resolve(raw, ctx);
}

const px = (v: string | undefined, fallback = 0) => (v === undefined ? fallback : parseFloat(v) || fallback);

/** A link's height and the pitch of its rows, the way Chrome drew the ones measured. */
function linkBox(a: El, ctx: Ctx): { height: number; pitch: number; display: string } {
  const display = cascade(a, ["display"], ctx)?.value ?? "inline";
  const font = px(inherited(a, "font-size", ctx), 16);
  const lhRaw = inherited(a, "line-height", ctx) ?? "1.55";
  const lh = /px$/.test(lhRaw) ? parseFloat(lhRaw) : font * parseFloat(lhRaw);
  const side = (which: "top" | "bottom") => {
    const d = cascade(a, [`padding-${which}`, "padding-block", "padding"], ctx);
    if (!d) return 0;
    const p = d.value.split(/\s+/).map((x) => parseFloat(x) || 0);
    if (d.prop === `padding-${which}`) return p[0] ?? 0;
    if (d.prop === "padding-block") return which === "top" ? (p[0] ?? 0) : (p[1] ?? p[0] ?? 0);
    return which === "top" ? (p[0] ?? 0) : (p[2] ?? p[0] ?? 0);
  };
  const padding = side("top") + side("bottom");
  const min = px(cascade(a, ["min-height"], ctx)?.value);
  const height = display === "inline" ? Math.round(font * 1.15 * 10) / 10 : Math.max(lh + padding, min);
  return { height, pitch: Math.round(Math.max(lh, display === "inline" ? 0 : height) * 10) / 10, display };
}

/* =============================================================== findings */

describe("findings (each FAILS on 4e04af5, and passes once fixed)", () => {
  it("DEFECT (MEDIUM): in the dark theme the counts are white on the dark accent, 2.45:1, under WCAG 1.4.3's 4.5:1 for 11px bold text — measured in Chromium 153 on every signed-in page: the header's Notifications and People counts (from 700px), the phone bar's counts, and the Requests count in People's tabs, #ffffff on #ec8d66 (light: 5.26:1 on #bf411d; before M-0020 they were white on the blue, 3.00:1). globals.css's .badge keeps `color: #ffffff` over `background: var(--accent)`, and SPEC §18.22 makes the accent the rust, whose dark value is a light salmon", () => {
    const parts = [
      ...byClass(memberHeader(), "badge"),
      ...byClass(render(inShell(createElement(TabBar, { viewer: VIEWER, counts: COUNTS }), "main")), "badge"),
      ...byClass(render(inShell(createElement(HeaderTabs, { label: "People", tabs: [{ href: "/people/requests", label: "Requests", current: false, count: 1 }] }), "main")), "badge"),
    ];
    expect(parts.length).toBe(5);
    const measured = SCHEMES.flatMap((scheme) =>
      parts.map((badge) => {
        const ctx = at(820, scheme === "dark");
        const fg = resolve(cascade(badge, ["color"], ctx)!.value, ctx);
        const bg = backdrop(badge, ctx);
        return { scheme, badge: moduleClass(badge), ratio: contrast(fg, bg) };
      }),
    );
    expect(measured.filter((m) => m.ratio < 4.5)).toEqual([]);
  });

  it("DEFECT (MEDIUM): in the light theme the focus ring in our.one's panel is rust on its forest, 2.52:1, under the 3:1 a focus indicator needs against what is next to it (WCAG 1.4.11, for 2.4.7) — measured in Chromium 153 by Tab on /home: 'Name a need' and 'Bring an idea' at 1440, 820, 375 and 320px, and the four places at 1440px, each drew a 3px #bf411d ring on #253328 (dark: 7.79:1). globals.css gives `.card--ours :focus-visible` the acid, but `.public :focus-visible` (equal specificity, later in the file) sets the whole outline to rust, so the panel's own rule never applies; the acid buttons' acid border loses to `.public .btn--outline`'s ink the same way. M-0017's R1 fixed this very contrast on the front door's builders band", () => {
    const card = render(inShell(createElement(OursCard, { email: null }), "aside"), true);
    const panel = byClass(card, "card--ours")[0]!;
    const targets = tabbable(panel);
    expect(targets.map(text)).toEqual(["Name a need ↗", "Bring an idea ↗", ...PLACES.map((p) => p.label)]);
    const measured = SCHEMES.flatMap((scheme) => {
      const ctx = at(1440, scheme === "dark");
      const forest = backdrop(panel, ctx);
      return targets.map((t) => {
        const ring = ringColour(t, ctx);
        return { scheme, target: text(t), ratio: contrast(ring.colour, forest), from: ring.selector };
      });
    });
    expect(measured.filter((m) => m.ratio < 3)).toEqual([]);
  });

  it("DEFECT (MEDIUM): near the limit the composer's counter turns #ffd400, 1.29:1 on the paper, under WCAG 1.4.3's 4.5:1 for its 13px — measured in Chromium 153 on /home at 375px: 1,985 FICTIONAL characters, the counter '15' (aria-label '15 characters left') drawn rgb(255, 212, 0) on #f5f3eb (dark: 12.4:1 on #131a15). globals.css's .counter--warn keeps a yellow from the old shell that none of our.one's tokens names, where D-0023 §A and SPEC §18.22 give every signed-in page the paper, ink, rust and acid", () => {
    const tree = render(
      inShell(
        createElement("form", { className: "composer" }, createElement("div", { className: "composer__bar" }, createElement("span", { className: "counter counter--warn" }, "15"))),
        "main",
      ),
    );
    const counter = byClass(tree, "counter")[0]!;
    const measured = SCHEMES.map((scheme) => {
      const ctx = at(375, scheme === "dark");
      return { scheme, colour: cascade(counter, ["color"], ctx)!.value, ratio: contrast(resolve(cascade(counter, ["color"], ctx)!.value, ctx), backdrop(counter, ctx)) };
    });
    expect(measured.filter((m) => m.ratio < 4.5)).toEqual([]);
  });

  it("DEFECT (MEDIUM): keyboard focus lands where it can't be seen — under the phone's bottom bar going forward, and under the sticky page header going back (WCAG 2.2 SC 2.4.11, Focus Not Obscured, AA) — measured in Chromium 153: on /home at 375×812, Tab put focus on 'Reply, 1 reply' at y 769–803, entirely under the bar (760–812), 7 of 60 stops wholly hidden ('Name a need' and 'Bring an idea' on /notifications; the panel's footer links at 320×640, 8 of 60); Shift+Tab hid up to 5 of 40 under the page header at 375px (its bottom at 54px, 107px on People), and 6 of 60 at 820 and 1440px. Chromium scrolls a focused element just into the viewport, and nothing tells it about the fixed bar or the sticky header: no scroll-padding anywhere. Inherited from the old shell, which had the same bar and header; M-0020 rebuilt the shell and kept both", () => {
    // The page's scroller, with the app's shell in it (so `html:has(…)` can be read).
    const html = findAll(render(createElement("html", null, createElement("body", null, inShell(createElement("p", null, "FICTIONAL"), "main")))), (e) => e.tag === "html")[0]!;
    const pad = (side: "top" | "bottom", ctx: Ctx) => {
      const d = cascade(html, [`scroll-padding-${side}`, "scroll-padding-block", "scroll-padding"], ctx);
      if (!d) return 0;
      const t = tokens(ctx);
      const parts = resolveVars(d.value, t).split(/\s+(?![^(]*\))/);
      const pick = d.prop === `scroll-padding-${side}` ? parts[0] : d.prop === "scroll-padding-block" ? (side === "top" ? parts[0] : (parts[1] ?? parts[0])) : side === "top" ? parts[0] : (parts[2] ?? parts[0]);
      return parseFloat((pick ?? "0").replace(/^calc\(/, "")) || 0;
    };
    const bar = px(tokens(PHONE)["--tabbar-h"]);
    const header = px(tokens(WIDE)["--header-h"]);
    expect({ bar, header }).toEqual({ bar: 52, header: 53 });
    expect({ phoneBottom: pad("bottom", PHONE) >= bar, phoneTop: pad("top", PHONE) >= header, wideTop: pad("top", WIDE) >= header }).toEqual({
      phoneBottom: true,
      phoneTop: true,
      wideTop: true,
    });
  });

  it("DEFECT (MEDIUM): the pictures of the app on /feed still draw the old app — seen in Chromium 153 beside the app at 375px: the phone's top bar is 'our.one' centred in place of the title (which M-0020 took out of the app: /home's bar now says 'Feed', and the wordmark is in the site header), the wordmark has no rust dot, the ＋ is a circle where the app's compose tab is now square, and the 'our.one' drawing's bar says 'Home'. D-0023 §A: 'The pictures of the app on /feed show its real look' and 'the wordmark with its rust dot'; §D: the feed is called the feed, 'not Home'; SPEC §18.22: the compose tab is square-cornered. FeedPreview.tsx says it is built from the app's parts 'so it cannot drift from them'", () => {
    const preview = render(createElement(FeedPreview));
    const contrastPicture = render(createElement(FeedContrast));
    const bars = byClass(contrastPicture, "miniBar").map(text);
    expect(bars).toHaveLength(2);
    const drift = {
      wordmarkDot: byClass(preview, "public-wordmark__dot").length > 0,
      ourBarSaysHome: bars[1] === "Home",
      composeCorner: value([".phoneCompose"], "border-radius", PHONE, P_RULES) === value([".tabbar__item--compose .tabbar__icon"], "border-radius", PHONE, G_RULES),
    };
    expect(drift).toEqual({ wordmarkDot: true, ourBarSaysHome: false, composeCorner: true });
  });

  it("DEFECT (LOW): below 1000px /settings and the app's not-found page (/admin for a member who isn't one) show the site footer twice — the links, the version and the status line, with two 'About our.one' navigation landmarks — and the first copy's words sit 4px from a phone's edge — measured in Chromium 153 at 375 and 820px (two status lines at y 1819 and 2460 on /settings at 375). InAppSiteFooter exists 'for widths where the right column (and its footer) is hidden' and hides from 1000px; since M-0020 the panel, with its footer, follows the column at every width (SPEC §18.22), and .site-footer's side padding went from 16px to 4px", () => {
    expect(read("src/app/(app)/layout.tsx")).toContain("<RightColumn");
    const panel = byClass(render(inShell(createElement(RightColumn, { invitesRemaining: 8 }), "aside"), true), "site-footer");
    expect(panel).toHaveLength(1);
    const pages = ["src/app/(app)/settings/page.tsx", "src/app/(app)/not-found.tsx"];
    const footers = pages.flatMap((page) =>
      [375, 820].map((width) => {
        const shown = (sel: string, rules: CssRule[]) => value([sel], "display", at(width), rules) !== "none";
        const own = read(page).includes("<InAppSiteFooter") && shown(".inAppFooter", P_RULES);
        return { page, width, footers: Number(own) + Number(shown(".aside", G_RULES)) };
      }),
    );
    expect(footers.filter((f) => f.footers !== 1)).toEqual([]);
    // On a phone the column has no side padding: an in-app copy's words start at .site-footer's own.
    const phone = at(375);
    const inset = px(value([".app"], "padding", phone, G_RULES)?.split(/\s+/)[1]) + px(value([".site-footer"], "padding", phone, G_RULES)?.split(/\s+/)[1]);
    const inAppShown = pages.some((page) => read(page).includes("<InAppSiteFooter")) && value([".inAppFooter"], "display", phone, P_RULES) !== "none";
    expect({ inAppShown, inset: inAppShown ? inset : 16 }).toEqual({ inAppShown, inset: expect.toSatisfy((v: number) => v >= 16) });
  });

  it("DEFECT (LOW): the member's menu stays open, over the page, on Escape, on a click or tap outside it, and when Tab leaves it — measured in Chromium 153 at 1440, 820, 375 and 320px: after Escape and after a click elsewhere `details.open` was still true, and at 375px its list (y 62–212) covered part of the places' row and the page's title; it closes only from its own summary or when one of its links is followed. Every other menu in the app closes on Escape and a click outside (PostMenu.tsx's useDismissableMenu, people/ActionMenu.tsx); MemberLinks.tsx listens for neither", () => {
    const source = read("src/components/MemberLinks.tsx");
    expect(read("src/components/posts/PostMenu.tsx")).toMatch(/export function useDismissableMenu/);
    expect({
      escape: /useDismissableMenu\(|["']Escape["']/.test(source),
      outside: /useDismissableMenu\(|pointerdown|mousedown|focusout/.test(source),
    }).toEqual({ escape: true, outside: true });
  });

  it("DEFECT (LOW): on a touch screen the header's Feed, Notifications and People are 40px tall, under SPEC §9's 44px — measured in Chromium 153 with touch at 820px (and they show from 700px): each a.member__link 40px. M-0017's R13 gave the public header's places and Sign in 44px under `@media (pointer: coarse)`; the member's links, new under M-0020, have no such rule", () => {
    const links = byClass(memberHeader(), "member__link");
    expect(links.map((a) => text(a).replace(/\s*\d+$/, ""))).toEqual(["Feed", "Notifications", "People"]);
    const heights = links.map((a) => px(cascade(a, ["min-height"], at(820, false, true))?.value));
    expect(heights.filter((h) => h < 44)).toEqual([]);
  });

  it("DEFECT (LOW): on a phone the panel's links are small and close — measured in Chromium 153 with touch at 320 and 375px on every signed-in page: the panel's four places are 17px inline links in rows 21.7px apart, under SPEC §9's 44px; its footer's nine links are 15px in rows 19.5px apart, so their 24px targets meet (WCAG 2.5.8). Before M-0020 the panel never showed below 1000px; M-0017's R11 gave the public footer's links 29.5px on touch screens, under `.public-footer`, which the panel's copy of the footer isn't in", () => {
    const tree = render(inShell(createElement(RightColumn, { invitesRemaining: 8 }), "aside"), true);
    const places = findAll(byClass(tree, "card__links")[0]!, (e) => e.tag === "a");
    const footer = findAll(byClass(tree, "site-footer__links")[0]!, (e) => e.tag === "a");
    expect([places.length, footer.length]).toEqual([4, 9]);
    const ctx = at(375, false, true);
    const short = [
      ...places.map((a) => ({ link: text(a), ...linkBox(a, ctx), need: "44px" })).filter((b) => b.height < 44),
      ...footer.map((a) => ({ link: text(a), ...linkBox(a, ctx), need: "rows 24px apart" })).filter((b) => b.pitch < 24),
    ];
    expect(short).toEqual([]);
  });

  it("DEFECT (LOW): with the database down, a member's front door and /feed say 'Your feed' in the header and still ask them to join below — measured in Chromium 153 on a second server whose DATABASE_URL is a closed port, with a FICTIONAL member's cookie, at 375 and 1440px: the header 'Your feed', and below it the visitor's form ('Your email', 'Join our.one'). The layout trusts the cookie when the database can't be read (isMemberHere, SPEC §18.22: 'with the database down, the cookie is trusted'); the pages' own signedIn() treats the same failure as a visitor, where SPEC §18.22 shows a member 'You're in.'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    req.cookie = "FICTIONAL-session.FICTIONAL-hmac";
    req.dbDown = true;
    expect(await isMemberHere()).toBe(true);
    const door = render(await FrontDoorRoute(), true);
    const feed = render(await FeedPageRoute(), true);
    const seen = [door, feed].map((tree) => ({ youreIn: text(tree).includes(MEMBER_JOIN.line), forms: findAll(tree, (e) => e.tag === "form").length }));
    expect(seen).toEqual([
      { youreIn: true, forms: 0 },
      { youreIn: true, forms: 0 },
    ]);
  });

  it("DEFECT (LOW): from 1000px the panel is sticky and 728px tall with no scroll of its own, so on a laptop screen its last lines are out of reach until the feed ends — measured in Chromium 153 on /home scrolled 1500px: at 1366×657 (a 1366×768 screen) the status line stops mid-sentence at '…its domain, its data and the right', at 1280×600 the version and the status line are gone. The status line is D-0016 §J's, shown 'wherever control is described'; the right column before M-0020 kept it in reach (max-height: 100dvh; overflow-y: auto)", () => {
    const aside = findAll(render(inShell(createElement("div"), "aside")), (e) => e.tag === "aside")[0]!;
    const ctx = at(1366);
    const position = cascade(aside, ["position"], ctx)?.value;
    const maxHeight = cascade(aside, ["max-height"], ctx)?.value;
    const scroll = cascade(aside, ["overflow-y", "overflow"], ctx)?.value;
    expect(position).toBe("sticky");
    expect({ inReach: position !== "sticky" || (!!maxHeight && /auto|scroll/.test(scroll ?? "")) }).toEqual({ inReach: true });
  });

  it("DEFECT (LOW): from 700px, once a page scrolls, a member has nothing to reach the feed, notifications, people or the menu — measured in Chromium 153 on /home after 1500px of scroll at 820, 1000 and 1440px: none of the member's links in view, where at 375px the bottom bar carries them. The header isn't sticky and the bar hides from 700px ('the header carries everything', says globals.css); the left navigation it replaced stayed in view (.nav__inner was sticky)", () => {
    const header = memberHeader();
    const links = byClass(header, "member__links")[0]!;
    const chain: El[] = [];
    for (let e: El | null = links; e && e.tag !== "#root"; e = e.parent) chain.push(e);
    const kept = [820, 1440].map((width) => ({ width, kept: chain.some((e) => /sticky|fixed/.test(cascade(e, ["position"], at(width))?.value ?? "")) }));
    expect(kept).toEqual([
      { width: 820, kept: true },
      { width: 1440, kept: true },
    ]);
  });

  it("DEFECT (LOW): the text fields' edges are 1.69:1 on the paper (2.38:1 dark), and their fill 1.1:1, under the 3:1 WCAG 1.4.11 asks of what identifies a control — measured in Chromium 153 at 1440px: the composer's audience, /settings' Name and Bio, /people/invites' note, /admin's two fields, /report's details and /settings/delete's confirmation, each a #b9c0ac border (#4a594b dark). The app's --outline-border is now the public pages' --line-strong; each field has a visible label, and before M-0020 the app's fields were #cfd9de on white, 1.44:1", () => {
    const tree = render(inShell(createElement("input", { className: "input", "aria-label": "FICTIONAL" }), "main"));
    const field = findAll(tree, (e) => e.tag === "input")[0]!;
    const measured = SCHEMES.map((scheme) => {
      const ctx = at(1440, scheme === "dark");
      return { scheme, ratio: contrast(borderColour(field, ctx), backdrop(field.parent!, ctx)) };
    });
    expect(measured.filter((m) => m.ratio < 3)).toEqual([]);
  });

  it("DEFECT (LOW): in the light theme a link in a hovered post, and the reply and like counts as they're hovered, are rust on the hover tint, 4.35:1, under WCAG 1.4.3's 4.5:1 — measured in Chromium 153 on /home at 1440px with the pointer on a FICTIONAL post with a link: #bf411d on #ebeadf (16px; the counts 13px). Dark: 6.64:1. globals.css draws .post__body a in var(--accent) and .post--link:hover in var(--hover)", () => {
    const tree = render(
      inShell(
        createElement(
          "article",
          { className: "post post--link" },
          createElement("div", { className: "post__main" }, createElement("div", { className: "post__body" }, createElement("a", { href: "https://example.test/FICTIONAL" }, "example.test/FICTIONAL"))),
        ),
        "main",
      ),
    );
    const row = findAll(tree, (e) => e.tag === "article")[0]!;
    const link = findAll(row, (e) => e.tag === "a")[0]!;
    const measured = SCHEMES.map((scheme) => {
      const ctx = at(1440, scheme === "dark");
      const st = { hover: [row] };
      return { scheme, ratio: contrast(resolve(cascade(link, ["color"], ctx, st)!.value, ctx), backdrop(link, ctx, st)) };
    });
    expect(measured.filter((m) => m.ratio < 4.5)).toEqual([]);
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: nothing scrolls sideways or passes the screen's edge — 18 pages as the administrator (the 15 signed-in pages, the front door, /feed and /agreement), 3 as a member and 3 as a visitor, × 320, 375, 820, 1000 and 1440px × light and dark (240 loads in Chromium 153): scrollWidth equal to clientWidth, no box past either edge, no header part over another; the column shrinks (min-width: 0), long words break, People's tabs scroll inside themselves, and the header wraps", () => {
    expect(value([".app-main"], "min-width")).toBe("0");
    expect(value([".aside"], "min-width")).toBe("0");
    expect(value([".post__body"], "overflow-wrap")).toBe("anywhere");
    expect(value([".public"], "overflow-wrap")).toBe("break-word");
    expect(value([".tabs"], "overflow-x")).toBe("auto");
    expect(value([".public-header__bar"], "flex-wrap")).toBe("wrap");
    expect(value([".member__links"], "display", at(375))).toBe("none");
  });

  it("closed: one identity — the root tokens are SPEC §18.22's, light and dark; none of X's five colours (#1d9bf0, #f91880, #0f1419, #536471, #eff3f4) in any computed style of any page in the sweep (60 distinct colours, all the identity's, the avatars' hues or the front door's), in the stylesheets, the icon, the manifest or the browser's bar", () => {
    const root = tokens({ width: 1440, dark: false, coarse: false });
    expect({ paper: resolveVars("var(--paper)", root), ink: resolveVars("var(--ink)", root), sub: resolveVars("var(--sub)", root), line: resolveVars("var(--line)", root), rust: resolveVars("var(--rust)", root) }).toEqual({
      paper: "#f5f3eb",
      ink: "#222b24",
      sub: "#586157",
      line: "#d7dace",
      rust: "#bf411d",
    });
    const files = [
      "src/app/globals.css",
      "src/components/public/public.module.css",
      "src/components/NotificationRow.module.css",
      "src/components/posts/posts.module.css",
      "src/app/icon.svg",
      "src/app/manifest.ts",
      "src/app/layout.tsx",
      "src/app/(public)/layout.tsx",
    ].map(read);
    for (const x of ["#1d9bf0", "#f91880", "#0f1419", "#536471", "#eff3f4"]) for (const f of files) expect(f.toLowerCase()).not.toContain(x);
  });

  it("closed: the header — one row from 1000px (it needs 848px with today's counts and 892px with '99+' on both, in 904px at 1000px), the places on a row of their own from 700 to 999px (761–999 by the member's rule, 700–760 by the phone's) with the member's links beside the wordmark, and below 700px the menu alone, the links in the bottom bar; heights 123px at 699–760, 105px at 761–999, 89px from 1000px; nothing overlaps at 14 widths (Chromium 153). With a scrollbar that takes room and '99+' on both counts it wraps below 1005px (15px) or 1010px (17px), readable: an edge case, not a finding", () => {
    expect(value([".public-header--member .public-nav"], "order", at(820))).toBe("3");
    expect(value([".public-header--member .public-nav"], "width", at(820))).toBe("100%");
    expect(value([".public-nav"], "order", at(760))).toBe("3");
    expect(value([".public-header--member .public-nav"], "order", at(1000))).toBeUndefined();
    expect(value([".member__links"], "display", at(699))).toBe("none");
    expect(value([".member__links"], "display", at(700))).toBe("flex");
    const header = memberHeader();
    const bar = byClass(header, "public-header__bar")[0]!;
    expect(elements(bar).map((e) => moduleClass(e).split(" ")[0] || e.tag)).toEqual(["public-wordmark", "public-nav", "public-header__account"]);
  });

  it("closed: the column and the panel — side by side from 1000px (the column 544px at 1000px and 680px at 1440px, the panel 320px under the member's links), the panel after the column below that, the column 680px under the wordmark at 820px (x 48) and the full width on a phone (Chromium 153)", () => {
    expect(value([".app"], "flex-direction", at(820))).toBe("column");
    expect(value([".app"], "flex-direction", at(1000))).toBe("row");
    expect(value([".aside"], "flex", at(1000))).toBe("0 0 320px");
    expect(value([".app-main"], "max-width", at(820))).toBe("680px");
    expect(value([".app"], "padding", at(820))).toBe("0 var(--gutter)");
    expect(value([".app"], "padding", at(375))).toBeUndefined();
  });

  it("closed: on a phone the bottom bar covers no content — scrolled to the end of /home, /notifications, /people/invites, /settings and /u/ada_quillon at 320, 375 and 699px, light and dark, the panel's status line ends 24px above the bar (Chromium 153); the bar's five tabs are 51px tall and it hides from 700px", () => {
    expect(value([".aside"], "padding-bottom", at(375))).toBe("calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 24px)");
    expect(tokens(PHONE)["--tabbar-h"]).toBe("52px");
    expect(value([".tabbar__item"], "min-height", at(375))).toBe("44px");
    expect(value([".tabbar"], "display", at(700))).toBe("none");
    expect(value([".tabbar"], "position", at(375))).toBe("fixed");
  });

  it("closed: the header by keyboard — in Chromium 153 at 1440, 820 and 375px the skip link comes first and sends the next Tab into the composer; then the wordmark, the four places, Feed, Notifications, People (from 700px) and the menu, each ringed 3px in rust 3px out, 4.74:1 on the paper (7.22:1 dark); the current page is marked (aria-current) and underlined. Below 1000px the places, on the second row, come before the links on the first, as the public header's do on a phone (M-0017 held that order)", () => {
    nav.path = "/notifications";
    const header = memberHeader();
    expect(tabbable(header).map((e) => e.attrs["aria-label"] ?? text(e))).toEqual([
      "our.one, home",
      ...PLACES.map((p) => p.label),
      "Feed",
      "Notifications, 3 unread",
      "People, 1 request",
      `${VIEWER.displayName}: your profile and settings`,
    ]);
    expect(findAll(header, (e) => e.attrs["aria-current"] === "page").map((e) => e.attrs["aria-label"] ?? text(e))).toEqual(["Notifications, 3 unread"]);
    const wordmark = findAll(header, (e) => e.tag === "a")[0]!;
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      const ring = ringColour(wordmark, ctx);
      expect(ring.selector).toBe(".public :focus-visible");
      expect(contrast(ring.colour, PAPER(ctx))).toBeGreaterThanOrEqual(3);
    }
    expect(value([".member__link[aria-current=\"page\"]"], "text-decoration")).toBe("underline");
  });

  it("closed: the member's menu by keyboard — in Chromium 153 at 1440, 820, 375 and 320px Enter on the summary opens it on top of the page and within the screen, Tab reaches Your profile, Settings and Moderation (47px each, ringed), Enter on Settings goes to /settings and closes it, Enter on the summary closes it; a member who isn't an administrator has no Moderation", () => {
    const header = memberHeader();
    const menu = findAll(header, (e) => e.tag === "details")[0]!;
    expect(findAll(menu, (e) => e.tag === "summary")[0]!.attrs["aria-label"]).toBe(`${VIEWER.displayName}: your profile and settings`);
    expect(findAll(menu, (e) => e.tag === "a").map((a) => [text(a), a.attrs.href])).toEqual([
      ["Your profile", `/u/${VIEWER.handle}`],
      ["Settings", "/settings"],
      ["Moderation", "/admin"],
    ]);
    expect(read("src/components/MemberLinks.tsx")).toContain("onClick={close}");
    expect(value([".menu__list"], "z-index")).toBe("30");
    expect(value([".member__me"], "min-height")).toBe("44px");
    const plain = findAll(memberHeader({ ...VIEWER, isAdmin: false }), (e) => e.tag === "details")[0]!;
    expect(findAll(plain, (e) => e.tag === "a").map(text)).toEqual(["Your profile", "Settings"]);
  });

  it("closed: the panel's drafts by keyboard — in Chromium 153 at 1440, 820, 375 and 320px, light and dark: Enter on 'Name a need' or 'Bring an idea' opens a modal dialog with focus in its first field, Tab stays in it, Escape closes it and focus goes back to the button; the dialog is the paper and the ink inside the forest card, and its rings are rust on the paper (4.74:1, 7.22:1 dark)", () => {
    const card = render(inShell(createElement(OursCard, { email: null }), "aside"), true);
    const panel = byClass(card, "card--ours")[0]!;
    expect(findAll(panel, (e) => e.tag === "button" && reachable(e)).map(text)).toEqual([`${MEMBER_PANEL.need} ↗`, `${MEMBER_PANEL.idea} ↗`]);
    const dialogs = findAll(panel, (e) => e.tag === "dialog");
    expect(dialogs).toHaveLength(2);
    for (const d of dialogs) expect(findAll(d, (e) => e.attrs.id === d.attrs["aria-labelledby"])).toHaveLength(1);
    expect(read("src/components/public/Draft.tsx")).toMatch(/d\.showModal\(\);\s*\n\s*d\.querySelector\("textarea"\)\?\.focus\(\);/);
    expect(value([".public .draft"], "background")).toBe("var(--paper)");
    expect(value([".public .draft"], "color")).toBe("var(--ink)");
  });

  it("closed: the composer by keyboard — in Chromium 153 at 375 and 1440px its field, the audience and Post each take the 3px rust ring (the old `.composer__input:focus { outline: none }` now loses to `.public :focus-visible`), Ctrl+Enter posts a FICTIONAL line, empties the field and keeps focus there, and over the limit Post is disabled; the disabled Post is 2.96:1, which WCAG 1.4.3 exempts for an inactive control", () => {
    const tree = render(inShell(createElement("form", { className: "composer" }, createElement("textarea", { className: "composer__input", "aria-label": "FICTIONAL" })), "main"));
    const field = findAll(tree, (e) => e.tag === "textarea")[0]!;
    const d = cascade(field, ["outline", "outline-style"], WIDE, { focus: field })!;
    expect(d.value).toBe("3px solid var(--rust)");
    expect(contrast(ringColour(field, WIDE).colour, PAPER(WIDE))).toBeGreaterThanOrEqual(3);
    expect(value([".btn:disabled"], "opacity")).toBe("0.5");
    expect(read("src/components/posts/Composer.tsx")).toMatch(/e\.key === "Enter" && \(e\.metaKey \|\| e\.ctrlKey\)/);
  });

  it("closed: text contrast — in the sweep every visible text run met WCAG 1.4.3 in both themes but the counts and the disabled Post above; the new tokens' pairs pass: the ink and the muted ink on the paper, the hover tint, the card and the unread tint; the panel's words and acid buttons on its forest; the rust and the danger on the paper; the avatars' initials on all eight hues", () => {
    const pairs: [string, string, number][] = [
      ["var(--text)", "var(--bg)", 4.5],
      ["var(--muted)", "var(--bg)", 4.5],
      ["var(--muted)", "var(--hover)", 4.5],
      ["var(--muted)", "var(--card)", 4.5],
      ["var(--forest-ink)", "var(--forest)", 4.5],
      ["var(--forest-sub)", "var(--forest)", 4.5],
      ["var(--acid)", "var(--forest)", 4.5],
      ["var(--on-acid)", "var(--acid)", 4.5],
      ["var(--accent)", "var(--bg)", 4.5],
      ["var(--danger)", "var(--bg)", 4.5],
      ["var(--primary-text)", "var(--primary-bg)", 4.5],
    ];
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      for (const [fg, bg, need] of pairs) expect(contrast(resolve(fg, ctx), resolve(bg, ctx)), `${scheme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(need);
      // Unread notifications: the muted ink on the accent's tint over the paper.
      expect(contrast(resolve("var(--muted)", ctx), over(resolve("var(--accent-soft)", ctx), PAPER(ctx)))).toBeGreaterThanOrEqual(4.5);
      // The avatars: white on hsl(hue var(--avatar-sat) var(--avatar-light)), Avatar.tsx's eight hues.
      const t = tokens(ctx);
      const [s, l] = [parseFloat(t["--avatar-sat"]!) / 100, parseFloat(t["--avatar-light"]!) / 100];
      for (const hue of [210, 250, 285, 330, 12, 35, 150, 185]) {
        const k = (n: number) => (n + hue / 30) % 12;
        const f = (n: number) => 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
        expect(contrast({ r: 255, g: 255, b: 255, a: 1 }, { r: f(0), g: f(8), b: f(4), a: 1 }), `${scheme}: avatar ${hue}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("closed: the front door and /feed for a member — in Chromium 153 at 375 and 1440px: 'Your feed' (to /home) in the header, 'You're in.' and 'Open your feed' (to /home) where a visitor is asked to join, '10 people are in.' with no rank, no closing invitation, no form; for a visitor 'Sign in', the form and 'You'd be #11.'; nothing redirects a member (200, the same path, also by a client-side click on the app's wordmark and on 'In the open')", async () => {
    req.cookie = "FICTIONAL-session.FICTIONAL-hmac";
    req.member = true;
    expect(await isMemberHere()).toBe(true);
    for (const route of [FrontDoorRoute, FeedPageRoute]) {
      const tree = render(await route(), true);
      expect(text(tree)).toContain(MEMBER_JOIN.line);
      expect(findAll(tree, (e) => e.tag === "a" && text(e) === MEMBER_JOIN.link).map((a) => a.attrs.href)).toEqual(["/home"]);
      expect(findAll(tree, (e) => e.tag === "form")).toEqual([]);
      expect(text(tree)).toContain("10 people are in.");
      expect(text(tree)).not.toContain("You'd be #");
    }
    expect(read("src/app/(public)/layout.tsx")).toMatch(/<Link href="\/home" className="public-header__signin">\s*Your feed\s*<\/Link>/);
    req.cookie = null;
    req.member = false;
    expect(await isMemberHere()).toBe(false);
    const visitor = render(await FeedPageRoute(), true);
    expect(findAll(visitor, (e) => e.tag === "form")).toHaveLength(1);
    expect(text(visitor)).toContain("You'd be #11.");
  });

  it("closed: the public pages never depend on the database — in Chromium 153 on the server whose database port is closed, 13 public pages (/, /feed, /agreement, /projects, /build, /maintainers, /contract, /privacy, /costs, /power, /rules, /signin, /join) as a visitor and with a member's cookie, 375px light and 1440px dark: all 200 in 0.3–0.5s, no error, 'Sign in' or 'Your feed', no count, nothing sideways", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    req.dbDown = true;
    expect(await isMemberHere()).toBe(false);
    for (const route of [FrontDoorRoute, FeedPageRoute]) {
      const tree = render(await route(), true);
      expect(text(tree)).not.toMatch(/people are in|person is in/);
    }
    req.cookie = "FICTIONAL-session.FICTIONAL-hmac";
    expect(await isMemberHere()).toBe(true);
  });

  it("closed: nothing loads from another origin and the console stays quiet — every request in the sweeps went to the server itself, and no page logged an error or a warning but the 404 a member who isn't an administrator gets on /admin; the stylesheets import and fetch nothing", () => {
    for (const css of [GLOBALS, PUBLIC_CSS]) expect(css).not.toMatch(/@import|@font-face|url\(\s*['"]?(https?:)?\/\//);
    const shell = [memberHeader(), render(inShell(createElement(RightColumn, { invitesRemaining: 8 }), "aside"), true), render(inShell(createElement(TabBar, { viewer: VIEWER, counts: COUNTS }), "main"))];
    for (const tree of shell) {
      const loads = findAll(tree, (e) => ["link", "script", "img", "iframe", "source", "video", "audio"].includes(e.tag));
      expect(loads.filter((e) => /^(https?:)?\/\//.test(e.attrs.src ?? e.attrs.href ?? ""))).toEqual([]);
    }
  });

  it("closed: the browser's bar, the icon and the manifest — served by the production build: theme-color #f5f3eb (light) and #131a15 (dark) on every page, a manifest in the paper, an icon of ink and paper with its rust dot", () => {
    for (const file of ["src/app/layout.tsx", "src/app/(public)/layout.tsx"]) {
      expect(read(file)).toMatch(/prefers-color-scheme: light\)", color: "#f5f3eb"/);
      expect(read(file)).toMatch(/prefers-color-scheme: dark\)", color: "#131a15"/);
    }
    expect(read("src/app/manifest.ts")).toMatch(/background_color: "#f5f3eb",\s*theme_color: "#f5f3eb"/);
    const icon = read("src/app/icon.svg");
    for (const c of ["#222b24", "#f5f3eb", "#bf411d"]) expect(icon).toContain(c);
  });

  it("closed: the bottom bar by keyboard — in Chromium 153 at 375px its five tabs follow the panel in the Tab order, each named (Feed, 'People, 1 new', New post, Notifications, Profile) and ringed on its top and sides, the current one marked; Enter on New post opens /home#compose with the composer focused", () => {
    nav.path = "/home";
    const bar = render(inShell(createElement(TabBar, { viewer: VIEWER, counts: COUNTS }), "main"));
    const tabs = findAll(bar, (e) => e.tag === "a");
    expect(tabs.map((a) => [a.attrs["aria-label"], a.attrs.href])).toEqual([
      ["Feed", "/home"],
      ["People, 1 new", "/people"],
      ["New post", "/home#compose"],
      ["Notifications, 3 new", "/notifications"],
      ["Profile", `/u/${VIEWER.handle}`],
    ]);
    expect(tabs.filter((a) => a.attrs["aria-current"] === "page").map((a) => a.attrs["aria-label"])).toEqual(["Feed"]);
    expect(read("src/components/posts/Composer.tsx")).toContain("if (window.location.hash === `#${id}`) input.current?.focus();");
  });
});
