/**
 * Independent verification of M-0017 (the front door; D-0020; SPEC §18.19),
 * the rendering and use lens: every public page in a browser, by keyboard,
 * without JavaScript, the drafts' denial paths, and the front door against
 * the design study the founder chose. Written by an agent that built none
 * of it, against e4e5637 (with the stopping rule, cb1aadd). The honesty of
 * the words is the other verifier's. Nothing in the product code, the
 * records or the existing tests is changed by this file.
 *
 * How it was looked at. A production build of cb1aadd (`next build`),
 * served by `next start` twice with FICTIONAL settings and a scratch
 * Postgres database: :3421 with PROPOSALS_EMAIL=ideas@example.test, :3422
 * without it (both with DATA_CONTROLLER="FICTIONAL Controller",
 * DATA_CONTROLLER_EMAIL=controller@example.test, MAIL_TRANSPORT=outbox and
 * CLIENT_IP_HEADER=x-forwarded-for, so the join form shows). The browser
 * was a headless Google Chrome 154, driven over the DevTools protocol by
 * the verifier's scripts (not the built-in browser pane):
 *
 * 1. a sweep of the 13 public pages (/, /feed, /projects, /build,
 *    /maintainers, /agreement, /contract, /privacy, /costs, /power, /rules,
 *    /signin, /join) at 320, 375, 768, 1280 and 1440px, light and dark, on
 *    both servers (260 loads; touch emulated under 768px): sideways scroll,
 *    boxes past the edge, clipped and overlapping text, WCAG 1.4.3 for
 *    every visible text run composited over what is behind it, WCAG 2.5.8
 *    for every target (24px, the spacing circles, the inline exception),
 *    every request's origin, and the console;
 * 2. keyboard sessions on the front door at 320, 375 and 1280px, light and
 *    dark, on both servers: the Tab order and each focus ring's contrast,
 *    the skip link, the tabs, the illustration, every draft dialog (focus
 *    on open, on Escape, on Close; the accessibility tree; an empty draft;
 *    the clipboard allowed and blocked; a short and a 3 × 600-character
 *    draft through "Open in my email"), "Copy the line", the network and
 *    the browser's storage; the same for /build, /projects and /maintainers;
 * 3. the same pages with scripts off;
 * 4. deep links (/#ours, /#build, /#open, /#part) loaded fresh;
 * 5. signed in as a FICTIONAL administrator from `pnpm seed:fictional`;
 * 6. screenshots against docs-internal/prototype/our-one-next.html, the
 *    study, rendered in the same browser at the same widths.
 *
 * Each finding ends here as a "DEFECT (SEVERITY): …" test that FAILS on
 * e4e5637 and would pass once fixed; where only a browser shows it, the
 * test pins what in the source causes it, and its title says what was
 * measured, where and how. Each check that held is a "closed: …" test that
 * passes. The scale is M-0015's rendering verification's: HIGH, content
 * hidden, broken or unusable; MEDIUM, wrong order or state, or an
 * accessibility failure under WCAG AA; LOW, polish (wraps, spacing, small
 * tap targets).
 *
 * Every address and every person here is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const hydration = vi.hoisted(() => ({ ready: false }));
const nav = vi.hoisted(() => ({ path: "/" }));
const auth = vi.hoisted(() => ({ signedIn: false }));

/** The interactive parts draw their hydrated form while `hydration.ready` is set. */
vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => hydration.ready }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/web/session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readSessionCookie: async () => (auth.signedIn ? "FICTIONAL-session" : undefined),
}));
vi.mock("@/web/viewer", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getViewer: async () => (auth.signedIn ? { id: "FICTIONAL-viewer" } : null),
}));
vi.mock("@/core/seats", () => ({
  memberCount: vi.fn(async () => 10),
  seatState: vi.fn(async () => ({ open: 0, waiting: 0 })),
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));

import BuildPage from "@/app/(public)/build/page";
import FeedPageRoute from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import FrontDoorRoute from "@/app/(public)/page";
import ProjectsPage from "@/app/(public)/projects/page";
import RootLayout from "@/app/layout";
import { ILLUSTRATION, POSSIBILITIES, POSSIBILITY_LABEL } from "@/components/public/door";
import { DRAFT_KINDS, DRAFT_FALLBACK, MAILTO_LIMIT, draftMailto, draftText } from "@/components/public/drafts";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { PLACES } from "@/components/public/PublicNav";
import { AGENT_LINE } from "@/core/kit-info";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const DOOR_CSS = read("src/components/public/door.module.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");
const DRAFT_TSX = read("src/components/public/Draft.tsx");
const TABS_TSX = read("src/components/public/ServiceTabs.tsx");
const COPY_TSX = read("src/components/public/CopyLine.tsx");
const HYDRATED_TS = read("src/components/public/useHydrated.ts");

const EMAIL = "ideas@example.test";

afterEach(() => {
  hydration.ready = false;
  nav.path = "/";
  auth.signedIn = false;
  vi.unstubAllEnvs();
});

/* ---------------------------------------------------------------- markup */

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
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
      // HTML attribute names are case-insensitive: React writes some in camelCase (maxLength).
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

function closest(el: El, test: (e: El) => boolean): El | null {
  for (let e: El | null = el; e; e = e.parent) if (test(e)) return e;
  return null;
}

const elements = (el: El) => el.children.filter((c): c is El => typeof c !== "string");

/** An element's classes as the source writes them: a CSS module's `_tabs_1a2b3c` is "tabs". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-z]{5,8}$/i, "$1"))
    .join(" ");
}

const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);
const byText = (tree: El, tag: string, pattern: RegExp) => findAll(tree, (e) => e.tag === tag && pattern.test(text(e)));
const FOCUSABLE = (e: El) =>
  (e.tag === "a" && e.attrs.href !== undefined) ||
  ["button", "input", "textarea", "select"].includes(e.tag) ||
  (e.attrs.tabindex !== undefined && e.attrs.tabindex !== "-1");

function render(node: ReactNode): El {
  return parse(renderToStaticMarkup(node as never));
}

/** The front door as the server sends it, or (`hydrated`) as it stands once its JavaScript runs. */
function door(props: Partial<FrontDoorProps> = {}, hydrated = false): El {
  hydration.ready = hydrated;
  try {
    return render(createElement(FrontDoor, { joining: true, email: null, count: 10, seatsOpen: 0, seatsWaiting: 0, ...props }));
  } finally {
    hydration.ready = false;
  }
}

function page(component: FunctionComponent, hydrated = false): El {
  hydration.ready = hydrated;
  try {
    return render(createElement(component));
  } finally {
    hydration.ready = false;
  }
}

const panels = (tree: El) => findAll(tree, (e) => hasClass(e, "panel"));
const dialogs = (tree: El) => findAll(tree, (e) => e.tag === "dialog");

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
const D_RULES = cssRules(DOOR_CSS, "door.module.css", 100_000);
const P_RULES = cssRules(PUBLIC_CSS, "public.module.css", 200_000);
const ALL_RULES = [...G_RULES, ...D_RULES, ...P_RULES];

const PHONE = (m: string | null) => m !== null && /max-width:\s*(760|480|420|380)px/.test(m);
const COARSE = (m: string | null) => m !== null && /pointer:\s*coarse/.test(m);
const DARK = (m: string | null) => m !== null && /prefers-color-scheme:\s*dark/.test(m);

/** A selector's specificity, roughly: ids, then classes, attributes and pseudo-classes, then tags. */
function specificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const tags = selector.match(/(?:^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0;
  return ids * 10_000 + classes * 100 + tags;
}

/**
 * The value of `prop` for the selectors `wanted` names (a list of exact
 * selectors, or a test), in the media that apply: the most specific rule,
 * then the last.
 */
function value(
  wanted: string[] | ((selector: string) => boolean),
  prop: string,
  applies: (media: string | null) => boolean = (m) => m === null,
  rules: CssRule[] = ALL_RULES,
): string | undefined {
  const test = typeof wanted === "function" ? wanted : (s: string) => wanted.includes(s);
  let found: { v: string; spec: number; order: number } | undefined;
  for (const r of rules) {
    if (!applies(r.media)) continue;
    const v = declarations(r.body)[prop];
    if (v === undefined) continue;
    for (const s of r.selectors.filter(test)) {
      const spec = specificity(s);
      if (!found || spec > found.spec || (spec === found.spec && r.order >= found.order)) found = { v, spec, order: r.order };
    }
  }
  return found?.v;
}

/** The four sides of a padding, from padding, padding-block and the single sides. */
function padding(wanted: string[] | ((s: string) => boolean), applies: (m: string | null) => boolean, rules: CssRule[] = ALL_RULES) {
  const px = (v: string | undefined) => (v === undefined ? undefined : parseFloat(v) || 0);
  const all = (value(wanted, "padding", applies, rules) ?? "0").split(/\s+/).map((v) => parseFloat(v) || 0);
  const [t, r = t, b = t, l = r] = all as [number, number?, number?, number?];
  const block = value(wanted, "padding-block", applies, rules)?.split(/\s+/).map((v) => parseFloat(v) || 0);
  const inline = value(wanted, "padding-inline", applies, rules)?.split(/\s+/).map((v) => parseFloat(v) || 0);
  return {
    top: px(value(wanted, "padding-top", applies, rules)) ?? block?.[0] ?? t,
    bottom: px(value(wanted, "padding-bottom", applies, rules)) ?? block?.[1] ?? block?.[0] ?? b!,
    left: px(value(wanted, "padding-left", applies, rules)) ?? inline?.[0] ?? l!,
  };
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

/** The public pages' tokens (globals.css, `.public`, D-0020 §A), for one theme. */
function tokens(scheme: "light" | "dark"): Record<string, string> {
  const from = (r: CssRule) => r.selectors.length === 1 && r.selectors[0] === ".public";
  const own = (rules: CssRule[]) =>
    Object.fromEntries(
      rules.flatMap((r) => [...r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as [string, string])),
    );
  const light = own(G_RULES.filter((r) => from(r) && r.media === null));
  return scheme === "light" ? light : { ...light, ...own(G_RULES.filter((r) => from(r) && DARK(r.media))) };
}

/** A colour as the public pages resolve it, through their tokens. */
function resolve(v: string, scheme: "light" | "dark"): Rgba {
  const t = tokens(scheme);
  let s = v.trim();
  for (let i = 0; i < 6; i++) {
    const m = /var\((--[\w-]+)\)/.exec(s);
    if (!m) break;
    s = s.replace(m[0], t[m[1]!] ?? "");
  }
  const c = /#[0-9a-f]{6}\b|rgba?\([^)]+\)/i.exec(s);
  if (!c) throw new Error(`no colour in ${v} (${scheme})`);
  return colour(c[0]);
}

const PAPER = (s: "light" | "dark") => resolve("var(--paper)", s);
const SCHEMES = ["light", "dark"] as const;

/** The public pages' focus ring (globals.css, `.public :focus-visible`), or a later rule that `selectors` match. */
function ring(selectors: string[] = []): { width: number; offset: number; colour: string } {
  let width = 0;
  let offset = 0;
  let col = "";
  for (const r of ALL_RULES.filter((x) => x.media === null)) {
    if (!r.selectors.some((s) => s === ".public :focus-visible" || selectors.includes(s))) continue;
    const d = declarations(r.body);
    if (d.outline) {
      const parts = d.outline.split(/\s+(?![^(]*\))/);
      width = parseFloat(parts.find((p) => /^\d/.test(p)) ?? `${width}`);
      col = parts.find((p) => /^(var|#|rgb)/.test(p)) ?? col;
    }
    if (d["outline-width"]) width = parseFloat(d["outline-width"]);
    if (d["outline-color"]) col = d["outline-color"];
    if (d["outline-offset"]) offset = parseFloat(d["outline-offset"]);
  }
  return { width, offset, colour: col };
}

/* ------------------------------------------- a small selector matcher */

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

function compoundMatches(el: El, compound: string): boolean {
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
    } else if ((m = /^\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]/.exec(rest))) {
      const v = el.attrs[m[1]!];
      if (v === undefined) return false;
      const want = m[2] ?? m[3];
      if (want !== undefined && v !== want) return false;
    } else if ((m = /^:not\(([^()]*)\)/.exec(rest))) {
      if (compoundMatches(el, m[1]!)) return false;
    } else return false; // any other pseudo-class or element is a state this static tree doesn't have
    rest = rest.slice(m[0].length);
  }
  return true;
}

function previousSiblings(el: El): El[] {
  if (!el.parent) return [];
  const sibs = elements(el.parent);
  return sibs.slice(0, sibs.indexOf(el)).reverse();
}

function matchesFrom(el: El, parts: Part[], i: number): boolean {
  if (!compoundMatches(el, parts[i]!.compound)) return false;
  if (i === 0) return true;
  const comb = parts[i]!.comb;
  if (comb === "+") {
    const prev = previousSiblings(el)[0];
    return !!prev && matchesFrom(prev, parts, i - 1);
  }
  if (comb === "~") return previousSiblings(el).some((p) => matchesFrom(p, parts, i - 1));
  if (comb === ">") return !!el.parent && matchesFrom(el.parent, parts, i - 1);
  for (let a = el.parent; a; a = a.parent) if (matchesFrom(a, parts, i - 1)) return true;
  return false;
}

const selectorMatches = (el: El, selector: string) => {
  const parts = split(selector);
  return parts.length > 0 && matchesFrom(el, parts, parts.length - 1);
};

/* ----------------------------------------------- heights on a phone */

/**
 * A target's height on a phone, from the stylesheet that styles it, the way
 * Chrome drew the ones measured: a box's line (font size × line height)
 * plus its vertical padding and borders, or its min-height; an inline
 * link's own line box; plus a ::after hit area on a coarse pointer, as the
 * global .btn has. A module's class is only that module's: door.module.css's
 * .btn is not globals.css's.
 */
function phoneHeight(selectors: string[], fallbackFont: number, rules: CssRule[]): number {
  const phone = (m: string | null) => m === null || PHONE(m) || COARSE(m);
  const v = (p: string) => value(selectors, p, phone, rules);
  const font = parseFloat(v("font-size") ?? `${fallbackFont}`);
  const lh = parseFloat(v("line-height") ?? value([".public"], "line-height", (m) => m === null, G_RULES) ?? "1.55");
  const lineBox = lh < 4 ? font * lh : lh;
  const display = v("display") ?? "inline";
  const pad = (side: "top" | "bottom") => {
    const block = v("padding-block");
    const all = v("padding");
    const one = v(`padding-${side}`);
    if (one) return parseFloat(one);
    if (block) return parseFloat(block.split(/\s+/)[side === "top" ? 0 : 1] ?? block.split(/\s+/)[0]!);
    if (all) {
      const p = all.split(/\s+/).map(parseFloat);
      return side === "top" ? p[0]! : (p[2] ?? p[0]!);
    }
    return 0;
  };
  const border = /border-bottom/.test(selectors.map((s) => rules.filter((r) => r.selectors.includes(s)).map((r) => r.body).join(";")).join(";")) ? 1 : 0;
  let h = display === "inline" ? font * 1.15 : lineBox + pad("top") + pad("bottom") + border;
  const min = parseFloat(v("min-height") ?? "0");
  h = Math.max(h, min);
  for (const s of selectors) {
    const after = rules.find((r) => phone(r.media) && r.selectors.includes(`${s}::after`));
    const inset = after ? declarations(after.body).inset : undefined;
    if (inset) h += -2 * parseFloat(inset.split(/\s+/)[0]!);
  }
  return Math.round(h * 10) / 10;
}

/* =============================================================== findings */

describe("findings (each FAILS on e4e5637, and passes once fixed)", () => {
  it("fixed (MEDIUM): in the builders' dark band the focus ring is rust on forest, 2.52:1, under the 3:1 a focus indicator needs against what is next to it (WCAG 1.4.11, for 2.4.7's visible focus) — measured in headless Chrome 154 by Tab at 320, 375 and 1280px, light: 'Draft an idea first', 'The maintainer's deal', 'Copy the line', 'Read build.md' and 'How building on our.one works.' each drew a 3px #bf411d ring on #253328 (dark: #ec8d66 on #0b110c, 7.8:1); globals.css gives every public :focus-visible var(--rust), and door.module.css gives .builders no ring of its own", () => {
    const own = ALL_RULES.flatMap((r) => r.selectors).filter((s) => /builders/.test(s) && /focus-visible/.test(s));
    const band = ring(own);
    for (const scheme of SCHEMES) {
      const forest = resolve("var(--forest)", scheme);
      expect(contrast(resolve(band.colour, scheme), forest), `${scheme}: ring ${band.colour} on --forest`).toBeGreaterThanOrEqual(3);
    }
  });

  it("fixed (MEDIUM): in the dark theme the drafts' placeholders are 3.46:1 on their field (WCAG 1.4.3) — measured in Chrome 154 with a dialog open at 320, 375 and 1280px: getComputedStyle(textarea, '::placeholder') is Chrome's own #757575, on the field's #1b241d (--card); light is 4.56:1. globals.css styles .draft__field textarea, and gives it no ::placeholder colour", () => {
    const UA_PLACEHOLDER = "#757575"; // Chrome 154's, in both themes, measured
    const own = ALL_RULES.filter((r) => r.selectors.some((s) => /::?placeholder/.test(s) && /draft/.test(s)));
    for (const scheme of SCHEMES) {
      const rule = own.filter((r) => r.media === null || (scheme === "dark" && DARK(r.media))).at(-1);
      const fg = rule ? resolve(declarations(rule.body).color ?? UA_PLACEHOLDER, scheme) : colour(UA_PLACEHOLDER);
      const bg = resolve(value([".draft__field textarea"], "background") ?? "var(--card)", scheme);
      expect(contrast(fg, bg), `${scheme}: placeholder on the draft's field`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("fixed (MEDIUM): on /power and /rules in the light theme the 'recorded' and 'ENFORCED' badges are 4.13:1 (WCAG 1.4.3; 12px bold) — measured in Chrome 154 at all five widths: .badgeRecorded's rust #bf411d on its 10% rust tint over the paper, #f0e1d6 (dark: 5.77:1). M-0017's .public block points --accent at the rust and --accent-soft at the tint; before it the badge was the app's blue on a blue tint, about 2.7:1, so this is inherited, better, and still under 4.5", () => {
    for (const scheme of SCHEMES) {
      const applies = (m: string | null) => m === null || (scheme === "dark" && DARK(m));
      const sels = ALL_RULES.flatMap((r) => r.selectors).filter((s) => /(^|\s)\.badgeRecorded$/.test(s));
      const fg = resolve(value(sels, "color", applies) ?? "var(--text)", scheme);
      const tint = resolve(value(sels, "background", applies) ?? value(sels, "background-color", applies) ?? "var(--paper)", scheme);
      const bg = over(tint, PAPER(scheme));
      expect(contrast(fg, bg), `${scheme}: .badgeRecorded`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("fixed (LOW): on a phone a focused tab's ring is cut away on three sides — measured in Chrome 154 at 320 and 375px, by arrow keys: the ring (3px, 3px out) reaches 6px above, below and left of the tab, and the tab list, a scroll box under 760px (overflow-x: auto; overflow-y: hidden), clips it there, so only its side bars show (ring 417–482px against the list's 423–477px; left edge 10 against 16). The study's tabs had no overflow, and the three tabs fit at 320px", () => {
    const r = ring([".tab:focus-visible", ".tabs .tab:focus-visible"]);
    const reach = r.width + r.offset;
    const clips = D_RULES.filter((x) => PHONE(x.media) && x.selectors.includes(".tabs")).some((x) => {
      const d = declarations(x.body);
      return [d.overflow, d["overflow-x"], d["overflow-y"]].some((o) => o !== undefined && o !== "visible");
    });
    const p = padding([".tabs"], (m) => m === null || PHONE(m), D_RULES);
    const room = Math.min(p.top, p.bottom, p.left);
    expect({ clips, reach, room, fits: !clips || reach <= 0 || room >= reach }).toMatchObject({ fits: true });
  });

  it("fixed (LOW): choosing 'Your work' or 'Your audience' drops its panel 24px under a second rule — measured in Chrome 154 at 375 and 1280px: the gap under the tab list is 0 for 'Your people' and 24px, over a 1px border, for the other two. door.module.css's .panel + .panel:not([hidden]) is meant for the panels stacked without JavaScript, and it still matches a shown panel whose hidden sibling comes before it", () => {
    const tree = door({}, true);
    const [first, second] = panels(tree);
    expect(first && second).toBeTruthy();
    // "Your work" chosen: the first panel hidden, the second shown.
    first!.attrs.hidden = "";
    delete second!.attrs.hidden;
    const pushes = D_RULES.filter((r) => r.media === null)
      .flatMap((r) => r.selectors.filter((s) => selectorMatches(second!, s)).map((s) => ({ s, d: declarations(r.body) })))
      .filter(({ d }) => (d["margin-top"] && parseFloat(d["margin-top"]) !== 0) || (d["border-top"] && !/^(0|none)/.test(d["border-top"])))
      .map(({ s }) => s);
    expect(pushes).toEqual([]);
  });

  it("fixed (LOW): the two possibilities' panels hold nothing focusable and aren't focusable themselves, so Tab from 'Your work' skips past its words — measured in Chrome 154: Tab from 'Your work' reached 'Every project, and what it's held to', and every tabpanel's tabIndex was -1. The WAI-ARIA tabs pattern that ServiceTabs cites puts tabindex=\"0\" on a panel with no focusable content", () => {
    const tree = door({}, true);
    const tabpanels = findAll(tree, (e) => e.attrs.role === "tabpanel");
    expect(tabpanels).toHaveLength(3);
    const bare = tabpanels.filter((p) => findAll(p, FOCUSABLE).length === 0);
    expect(bare.length).toBe(2);
    expect(bare.map((p) => p.attrs.tabindex ?? "(none)")).toEqual(["0", "0"]);
  });

  it("fixed (LOW): with PROPOSALS_EMAIL unset the dialog still says 'email opens your own email app', and offers no way to email — seen in Chrome 154 on the server without the address (:3422): on / that note stood over a lone 'Copy my draft', and /build, /projects and /maintainers showed the same lone button under the same note. drafts.ts has one note for both states; the front door's last line follows the address (partFoot), the dialog's doesn't", () => {
    const tree = door({ email: null }, true);
    const shown = dialogs(tree).map((d) => ({
      email: byText(d, "button", /^Open in my email$/).length,
      status: text(findAll(d, (e) => e.attrs.role === "status")[0]!),
    }));
    expect(shown.length).toBeGreaterThan(0);
    for (const d of shown) {
      expect(d.email).toBe(0);
      // It may say email opens at launch; it mustn't describe an email route that isn't there.
      expect(d.status).not.toMatch(/email opens|your own email app|open in my email/i);
    }
  });

  it("fixed (LOW): after 'Copy my draft', changing an answer leaves 'Copied. Nothing was sent.' standing over a draft the clipboard doesn't hold — measured in Chrome 154: three FICTIONAL answers copied, the second then changed; the status still read 'Copied. Nothing was sent.' and the clipboard lacked the change. Draft.tsx's update() clears the fallback, not the status", () => {
    // An answer changes through the field's onChange, which calls update().
    const body = /function update\([^)]*\)\s*\{([\s\S]*?)\n  \}/.exec(DRAFT_TSX)?.[1] ?? "";
    const onChange = /onChange=\{([^\n]*)\}/.exec(DRAFT_TSX)?.[1] ?? "";
    expect(body).toContain("remember(kind, next)");
    expect(`${body}\n${onChange}`).toMatch(/setStatus\(/);
  });

  it("fixed (LOW): without JavaScript, /maintainers' two draft buttons link to the sections they sit in, so pressing one only scrolls to the heading above it — in Chrome 154 with scripts off: 'Draft an idea ↗' under 'Propose a service' goes to /maintainers#maintainers-propose, and 'Draft a need ↗' under 'Need something?' to /maintainers#maintainers-need", () => {
    vi.stubEnv("PROPOSALS_EMAIL", EMAIL);
    const tree = page(MaintainersPage);
    const links = findAll(tree, (e) => e.tag === "a" && /^Draft /.test(text(e)));
    const selfLinks = links
      .filter((a) => {
        const [path, id] = (a.attrs.href ?? "").split("#");
        if (path !== "/maintainers" || !id) return false;
        const section = closest(a, (e) => e.tag === "section");
        return !!section && findAll(section, (e) => e.attrs.id === id).length > 0;
      })
      .map((a) => `${text(a)} -> ${a.attrs.href}`);
    expect(selfLinks).toEqual([]);
  });

  it("fixed (LOW): a fresh load of /#ours lands 624px past the section at 1280px and 1,077px past it at 375px — measured in Chrome 154 (/#open landed 23px low, /#build 54px, /#part on the mark): the server draws all three project panels, hydration hides two, and Chrome's scroll anchoring holds #projects where it was, so all below it moves up; a visitor who scrolls before the scripts run sees the same jump. The server's markup should hide what the hydrated page hides, and show the panels to a browser without scripts another way (a <noscript> style, say)", () => {
    const server = door({}, false);
    const hydrated = door({}, true);
    const hidden = (t: El) => panels(t).map((p) => p.attrs.hidden !== undefined);
    expect(hidden(hydrated)).toEqual([false, true, true]);
    const markup = renderToStaticMarkup(createElement(FrontDoor, { joining: true, email: null }));
    // Either the server hides what the hydrated page hides, with a <noscript> for a browser without scripts,
    // or the stylesheet hides the later panels only where scripts run (@media (scripting: enabled)).
    const sameAsHydrated = JSON.stringify(hidden(server)) === JSON.stringify(hidden(hydrated)) && /<noscript>/.test(markup);
    const byScripting = D_RULES.some(
      (r) => r.media !== null && /scripting:\s*enabled/.test(r.media) && /\.panel/.test(r.selectors.join(",")) && /display:\s*none/.test(r.body),
    );
    expect(sameAsHydrated || byScripting, `server panels hidden: ${JSON.stringify(hidden(server))}`).toBe(true);
  });

  it("fixed (LOW): on a phone the footer's links are 15px targets in rows 19.5px apart, so their 24px circles meet (WCAG 2.5.8) on every public page — measured in Chrome 154 with touch at 320 and 375px: 'Contract' and 'Open code', 'Agreement' and 'Costs', 'Open code' and 'Privacy'; and at 320px on /power 'The public ledger' beside the wrapped 'Founding authority, section 4: no bank account' (13px at /power's line-height 1.6, 20.8px rows). The footer's type predates M-0017; nothing gives these links a taller box", () => {
    /** The rows' pitch: the line's own line-height, or the one it inherits; or a link's own taller box. */
    const pitch = (lines: RegExp[], link: RegExp) => {
      const applies = (m: string | null) => m === null || COARSE(m) || PHONE(m);
      const first = (prop: string) => lines.map((re) => value((s) => re.test(s), prop, applies)).find((v) => v !== undefined);
      const font = parseFloat(first("font-size") ?? "13");
      const lhv = first("line-height") ?? "1.5";
      const lh = /px$/.test(lhv) ? parseFloat(lhv) / font : parseFloat(lhv);
      const own = (s: string) => link.test(s);
      const display = value(own, "display", applies) ?? "inline";
      const pad = padding(own, applies);
      const min = parseFloat(value(own, "min-height", applies) ?? "0");
      const box = display === "inline" ? 0 : Math.max(font * lh + pad.top + pad.bottom, min);
      return Math.round(Math.max(font * lh, box) * 10) / 10;
    };
    const footer = pitch([/(^|\s)\.site-footer__links$/, /(^|\s)\.site-footer$/], /\.site-footer__links\s+a$/);
    const records = pitch([/(^|\s)\.meta$/, /(^|\s)\.page$/], /\.meta\s+a$/);
    expect({ footer, records }).toEqual({ footer: expect.toSatisfy((v: number) => v >= 24), records: expect.toSatisfy((v: number) => v >= 24) });
  });

  it("fixed (LOW): on a phone the picture's 'IMAGINE' and 'FIRST PROJECT', the words that mark its cards, are drawn at 12px in a 440-unit picture: 7.9px on a 320px screen, 9.4px at 375px — measured in Chrome 154 (the picture is 288px wide at 320). The study set them to 16px there (10.3px), and its cards have 47–68px to spare at that size; SPEC §18.19 and D-0020 give no reason, and the stylesheet's comment says 'big enough to read at a phone's width'", () => {
    const STUDY = 16;
    for (const s of [".orbitKicker", ".orbitFirstKicker"]) {
      const size = parseFloat(value([s], "font-size", (m) => m === null || PHONE(m), D_RULES) ?? "0");
      expect(size, s).toBeGreaterThanOrEqual(STUDY);
    }
  });

  it("fixed (LOW): on a phone the header and the front door's new links and small buttons are under SPEC §9's 44px — measured in Chrome 154 at 375px with touch: the four places 40.1px (the stylesheet's comment over them says 44px), 'Sign in' 40px, 'Copy the line' 42px, the text links 35.6–38.7px ('More about the feed', 'Every project, and what it's held to', 'What the feed's contract promises', 'The maintainer's deal', 'Start with the kit'), 'Read build.md' and 'Who holds the power today' 18.6px, the strip's three links 15px, the wordmark 27px. Each meets WCAG 2.5.8's 24px or its spacing; SPEC §9 asks 44px, as M-0014's re-check held .pledgeLink to it", () => {
    const measured: Record<string, number> = {
      ".public-nav a": phoneHeight([".public-nav a"], 13, G_RULES),
      ".public-header__signin": phoneHeight([".public-header__signin"], 13, G_RULES),
      ".public-wordmark": phoneHeight([".public-wordmark"], 27, G_RULES),
      ".btnSmall": phoneHeight([".btn", ".btnSmall"], 13, D_RULES),
      ".textLink": phoneHeight([".textLink"], 14, D_RULES),
      ".proofLinks .textLink": phoneHeight([".textLink", ".proofLinks .textLink"], 12, D_RULES),
      ".values a": phoneHeight([".values a"], 12, D_RULES),
      ".agentActions a": phoneHeight([".agentActions a"], 12, D_RULES),
      ".openFoot a": phoneHeight([".openFoot a"], 12, D_RULES),
    };
    // On e4e5637 the model gives what Chrome measured: 40.2 (40.1), 40, 42,
    // 38.7 and 35.6 for the places, Sign in, the copy button and the two
    // sizes of text link; the inline links come out near their line box.
    const under = Object.entries(measured).filter(([, h]) => h < 44);
    expect(under).toEqual([]);
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: no page scrolls sideways and nothing passes the screen's edge — 13 public pages × 320, 375, 768, 1280 and 1440px × light and dark, on both servers (260 loads in Chrome 154: scrollWidth equal to clientWidth on every one, no element's box past either edge, the open dialog included at 320 and 375px); what could push it is held: the headline's lines are blocks, the agent line and /build's line wrap anywhere, the SHA-256 breaks anywhere, the slip is at most the column, and the tabs keep a scroll box as a backstop", () => {
    expect(value([".line"], "display", (m) => m === null, D_RULES)).toBe("block");
    expect(value([".agentLine code"], "overflow-wrap", (m) => m === null, D_RULES)).toBe("anywhere");
    expect(value([".prompt code"], "overflow-wrap", (m) => m === null, P_RULES)).toBe("anywhere");
    expect(value([".hash"], "word-break", (m) => m === null, P_RULES)).toBe("break-all");
    expect(value([".public"], "overflow-wrap")).toBe("break-word");
    expect(value([".slip"], "width", PHONE, D_RULES)).toBe("100%");
    expect(value([".public .draft"], "width")).toBe("calc(100% - 32px)");
    expect(value([".tabs"], "overflow-x", PHONE, D_RULES)).toBe("auto");
  });

  it("closed: nothing loads from another origin — every request in the sweeps (3,303 a server) and in the keyboard sessions went to the server itself, but the mailto: a visitor opens with 'Open in my email'; no stylesheet imports or fetches anything, no font is downloaded (the stacks are the device's), and the rendered pages load no script, style, image or frame from elsewhere", () => {
    for (const css of [GLOBALS, DOOR_CSS, PUBLIC_CSS]) {
      expect(css).not.toMatch(/@import|@font-face|url\(\s*['"]?(https?:)?\/\//);
    }
    for (const t of ["--serif", "--sans", "--mono"]) expect(tokens("light")[t]).not.toMatch(/url|https?:/);
    const pages = [door({ email: EMAIL }, true), page(BuildPage, true), page(ProjectsPage, true), page(MaintainersPage, true)];
    for (const tree of pages) {
      const loads = findAll(tree, (e) => ["link", "script", "img", "iframe", "source", "video", "audio"].includes(e.tag));
      expect(loads.filter((e) => /^(https?:)?\/\//.test(e.attrs.src ?? e.attrs.href ?? ""))).toEqual([]);
    }
  });

  it("closed: text contrast — on the 13 pages, light and dark, at five widths, every visible text run composited over what is behind it met WCAG 1.4.3 (Chrome 154), but the badges above and the feed picture's initials (aria-hidden letters inside a picture of the app, 3.63–4.24:1: incidental text); the identity's text pairs all pass in both themes", () => {
    const pairs: [string, string, number][] = [
      ["var(--ink)", "var(--paper)", 4.5],
      ["var(--ink)", "var(--paper-deep)", 4.5],
      ["var(--ink)", "var(--card)", 4.5],
      ["var(--sub)", "var(--paper)", 4.5],
      ["var(--sub)", "var(--paper-deep)", 4.5],
      ["var(--sub)", "var(--card)", 4.5],
      ["var(--on-acid)", "var(--acid)", 4.5],
      ["var(--forest-ink)", "var(--forest)", 4.5],
      ["var(--forest-sub)", "var(--forest)", 4.5],
      ["var(--forest-sub)", "var(--forest-deep)", 4.5],
      ["var(--acid)", "var(--forest)", 4.5],
      ["var(--paper)", "var(--ink)", 4.5],
      ["var(--primary-text)", "var(--primary-bg)", 4.5],
      ["var(--rust)", "var(--paper)", 3],
      ["var(--rust)", "var(--paper-deep)", 3],
    ];
    for (const scheme of SCHEMES) {
      for (const [fg, bg, need] of pairs) {
        expect(contrast(resolve(fg, scheme), resolve(bg, scheme)), `${scheme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(need);
      }
    }
    // The idea's field in the dark: the ink on a deep olive (door.module.css).
    const olive = value([".acid"], "background", DARK, D_RULES);
    expect(olive).toBe("#232e1b");
    expect(contrast(resolve("var(--ink)", "dark"), colour(olive!))).toBeGreaterThanOrEqual(4.5);
  });

  it("closed: the header and the skip link by keyboard — in Chrome 154 the skip link is the first stop and appears, and Enter on it sends the next Tab into main ('I want this to exist'); then the wordmark, the four places and Sign in, each ringed 3px in rust, 4.74:1 on the paper (7.2:1 dark); 'Projects' and 'Build with us' carry aria-current=\"page\" on their pages; on a phone the places take a second row", () => {
    const tree = render(createElement(RootLayout, null, createElement(PublicLayout, null, createElement("p", null, "FICTIONAL"))));
    const skip = findAll(tree, (e) => hasClass(e, "skip-link"))[0]!;
    expect(skip.attrs.href).toBe("#main");
    expect(findAll(tree, (e) => e.tag === "main" && e.attrs.id === "main")).toHaveLength(1);
    const header = findAll(tree, (e) => e.tag === "header")[0]!;
    expect(findAll(header, (e) => e.tag === "a").map((a) => [a.attrs["aria-label"] ?? text(a), a.attrs.href])).toEqual([
      ["our.one, home", "/"],
      ...PLACES.map((p) => [p.label, p.href]),
      ["Sign in", "/signin"],
    ]);
    for (const [path, label] of [["/projects", "Projects"], ["/build", "Build with us"]] as const) {
      nav.path = path;
      const t = render(createElement(PublicLayout, null, null));
      expect(findAll(t, (e) => e.attrs["aria-current"] === "page").map(text)).toEqual([label]);
    }
    const r = ring();
    expect(r).toMatchObject({ width: 3, offset: 3 });
    for (const scheme of SCHEMES) expect(contrast(resolve(r.colour, scheme), PAPER(scheme))).toBeGreaterThanOrEqual(3);
    expect(value([".public-nav"], "width", PHONE)).toBe("100%");
  });

  it("closed: the tabs by keyboard — in Chrome 154 ArrowRight and ArrowLeft move and wrap, Home and End go to the ends, ArrowDown does nothing, the focused tab is the selected one and the only one with tabindex 0, one panel shows, and Tab from 'Your people' enters its form; the tab list is labelled, each tab controls its panel, each panel is labelled by its tab", () => {
    for (const key of ['"ArrowRight"', '"ArrowLeft"', '"Home"', '"End"', "preventDefault()", "(to + tabs.length) % tabs.length"]) expect(TABS_TSX).toContain(key);
    const tree = door({}, true);
    const list = findAll(tree, (e) => e.attrs.role === "tablist")[0]!;
    expect(list.attrs["aria-label"]).toBe("A part of your life");
    const tabs = findAll(list, (e) => e.attrs.role === "tab");
    expect(tabs.map((t) => [text(t), t.attrs["aria-selected"], t.attrs.tabindex])).toEqual([
      ["Your people", "true", "0"],
      ["Your work", "false", "-1"],
      ["Your audience", "false", "-1"],
    ]);
    for (const t of tabs) {
      const panel = findAll(tree, (e) => e.attrs.id === t.attrs["aria-controls"])[0]!;
      expect(panel.attrs.role).toBe("tabpanel");
      expect(panel.attrs["aria-labelledby"]).toBe(t.attrs.id);
    }
  });

  it("closed: the illustration — in Chrome 154 Enter and Space toggle 'Appoint a successor' and 'Back to the start', focus stays on the button, the maintainer's name changes, and the role=status line changes and says, both ways, that it is an illustration; without JavaScript it shows its first state and words, and no button", () => {
    const fig = (t: El) => findAll(t, (e) => e.tag === "figure" && e.attrs["aria-labelledby"] === "continuity-label")[0]!;
    const on = fig(door({}, true));
    expect(byText(on, "button", /^Appoint a successor$/)).toHaveLength(1);
    expect(text(findAll(on, (e) => e.attrs.role === "status")[0]!)).toBe(ILLUSTRATION.idle);
    expect(ILLUSTRATION.idle).toMatch(/illustrates/);
    expect(ILLUSTRATION.done).toMatch(/An illustration/);
    const off = fig(door({}, false));
    expect(findAll(off, (e) => e.tag === "button")).toEqual([]);
    // Changed after the fixes (the honesty verification's 15th finding): with
    // no button yet, the first words don't ask for a press.
    expect(text(off)).toContain(ILLUSTRATION.still);
    expect(text(off)).not.toContain("Try changing the maintainer");
  });

  it("closed: the draft dialog, by keyboard and to a screen reader — on all four pages in Chrome 154 Enter on a draft button opens a modal dialog with focus in its first field; Chrome's accessibility tree has it as a modal 'dialog' named by its title, the field named by its question, the status line 'polite'; Escape (on all four pages) and Close (44 × 44px, on the front door) put focus back on the button that opened it; an empty draft says so and moves focus to the first empty field; two buttons of the same kind share their answers, and a need and an idea don't", () => {
    const tree = door({ email: EMAIL }, true);
    const all = dialogs(tree);
    expect(all.map((d) => text(findAll(d, (e) => e.tag === "h2")[0]!))).toEqual([
      DRAFT_KINDS.idea.title,
      DRAFT_KINDS.need.title,
      DRAFT_KINDS.idea.title,
    ]);
    for (const d of all) {
      const title = findAll(d, (e) => e.tag === "h2")[0]!;
      expect(d.attrs["aria-labelledby"]).toBe(title.attrs.id);
      const fields = findAll(d, (e) => e.tag === "textarea");
      expect(fields).toHaveLength(3);
      for (const f of fields) {
        const label = findAll(tree, (e) => e.tag === "label" && e.attrs.for === f.attrs.id);
        expect(label).toHaveLength(1);
        expect(f.attrs.maxlength).toBe("600");
      }
      expect(findAll(d, (e) => e.tag === "button" && e.attrs["aria-label"] === "Close")).toHaveLength(1);
      expect(findAll(d, (e) => e.attrs.role === "status")).toHaveLength(1);
    }
    expect(value([".draft__close"], "width")).toBe("44px");
    expect(value([".draft__close"], "height")).toBe("44px");
    expect(DRAFT_TSX).toMatch(/d\.showModal\(\);\s*\n\s*d\.querySelector\("textarea"\)\?\.focus\(\);/);
    expect(DRAFT_TSX).toMatch(/const answers: Record<DraftKind, string\[\]> = \{ need: \["", "", ""\], idea: \["", "", ""\] \};/);
    expect(DRAFT_TSX).toMatch(/fields\.current\[empty\]\?\.focus\(\)/);
  });

  it("closed: nothing is sent, stored or counted — in Chrome 154, drafting, copying (allowed and blocked) and closing on both servers: no request but GET, none carrying the draft but the mailto: the visitor opens; localStorage, sessionStorage, cookies, IndexedDB and the Cache Storage stayed empty; no form holds a draft", () => {
    for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "<form"]) {
      expect(DRAFT_TSX).not.toContain(forbidden);
    }
    for (const d of dialogs(door({ email: EMAIL }, true))) expect(findAll(d, (e) => e.tag === "form")).toEqual([]);
    expect(draftMailto(EMAIL, "need", "FICTIONAL").href.startsWith(`mailto:${EMAIL}?`)).toBe(true);
  });

  it("closed: email only with PROPOSALS_EMAIL — in Chrome 154 'Open in my email' showed on :3421 and not on :3422, on all four pages; a short draft opened mailto:ideas@example.test with the subject and the body; three answers at their 600-character limit opened it with the subject only, and the status said to paste the draft; the fields stop at 600", () => {
    const count = (t: El) => byText(t, "button", /^Open in my email$/).length;
    expect(count(door({ email: null }, true))).toBe(0);
    expect(count(door({ email: EMAIL }, true))).toBe(3);
    const short = draftMailto(EMAIL, "idea", draftText("idea", ["FICTIONAL a", "FICTIONAL b", "FICTIONAL c"]));
    expect(short.whole).toBe(true);
    expect(new URL(short.href).searchParams.get("body")).toContain("FICTIONAL b");
    const long = draftMailto(EMAIL, "idea", draftText("idea", ["FICTIONAL ".repeat(60), "FICTIONAL ".repeat(60), "FICTIONAL ".repeat(60)]));
    expect(long.whole).toBe(false);
    expect(long.href).toBe(`mailto:${EMAIL}?subject=An%20idea%20for%20our.one`);
    expect(MAILTO_LIMIT).toBe(1800);
  });

  it("closed: the clipboard — in Chrome 154, allowed, 'Copy my draft' put the subject, the three questions with their answers and the last line on it, and 'Copy the line' the line; blocked, the draft appeared below, selected whole (334 of 334 characters) with focus in it, and the line's button said to select the line, which one tap does (user-select: all)", () => {
    expect(draftText("idea", ["FICTIONAL 1", "FICTIONAL 2", "FICTIONAL 3"]).split("\n\n")).toEqual([
      "An idea for our.one",
      "What would you build, and for whom?\nFICTIONAL 1",
      "What do those people use today?\nFICTIONAL 2",
      "How would you find out whether they want it?\nFICTIONAL 3",
      "A starting point for a conversation, not a promise to join, fund or build anything.",
    ]);
    expect(DRAFT_TSX).toMatch(/fallbackField\.current\?\.focus\(\);\s*\n\s*fallbackField\.current\?\.select\(\);/);
    expect(COPY_TSX).toContain("Select the line, and copy it from there.");
    expect(value([".agentLine code"], "user-select", (m) => m === null, D_RULES)).toBe("all");
    expect(value([".prompt code"], "user-select", (m) => m === null, P_RULES)).toBe("all");
  });

  it("closed: without JavaScript — in Chrome 154 with scripts off, every draft button on /, /build, /projects and /maintainers is a link to /maintainers#maintainers-propose or #maintainers-need, both there and saying how to write; the tabs aren't drawn and all three panels' words are on the page, each with its label; the illustration shows its first state with no button; no copy button is drawn; nothing scrolls sideways at 320 or 1280px", () => {
    vi.stubEnv("PROPOSALS_EMAIL", EMAIL);
    const pages = [door({ email: EMAIL }), page(BuildPage), page(ProjectsPage), page(MaintainersPage)];
    // Changed after the fixes: /projects has no drafts (D-0020 §E names the
    // front door, /build and /maintainers; the honesty verification's 17th
    // finding), and /maintainers draws its two only once the page's
    // JavaScript runs, since without it they linked to the sections they sit
    // in (this file's ninth finding).
    const withDrafts = new Set([0, 1]);
    pages.forEach((tree, i) => {
      const drafts = findAll(tree, (e) => /^Draft /.test(text(e)) && (e.tag === "a" || e.tag === "button"));
      expect(drafts.length > 0, `page ${i}`).toBe(withDrafts.has(i));
      for (const d of drafts) {
        expect(d.tag).toBe("a");
        expect([DRAFT_FALLBACK.idea, DRAFT_FALLBACK.need]).toContain(d.attrs.href);
      }
      expect(byText(tree, "button", /^Copy the line$/)).toEqual([]);
      expect(dialogs(tree)).toEqual([]);
    });
    const front = pages[0]!;
    expect(findAll(front, (e) => e.attrs.role === "tablist")).toEqual([]);
    const words = text(front);
    expect(words).toContain("The first project");
    for (const p of POSSIBILITIES) expect(words).toContain(p.heading.join(" "));
    expect(words.split(POSSIBILITY_LABEL).length - 1).toBe(2);
    const maintainers = pages[3]!;
    for (const id of ["maintainers-propose", "maintainers-need"]) expect(findAll(maintainers, (e) => e.attrs.id === id)).toHaveLength(1);
  });

  it("closed: the drafts and 'Copy the line' on /build, /projects and /maintainers — in Chrome 154 at 375px with touch, on both servers: each draft button is reached by Tab and opens with focus in its first field, Escape gives focus back; /build's copy button copies the line and says what to do when the clipboard is blocked", () => {
    vi.stubEnv("PROPOSALS_EMAIL", EMAIL);
    const kinds = (t: El) => dialogs(t).map((d) => text(findAll(d, (e) => e.tag === "h2")[0]!));
    expect(kinds(page(BuildPage, true))).toEqual([DRAFT_KINDS.idea.title]);
    // Changed after the fixes: /projects has no drafts (the honesty verification's 17th finding).
    expect(kinds(page(ProjectsPage, true))).toEqual([]);
    expect(kinds(page(MaintainersPage, true))).toEqual([DRAFT_KINDS.idea.title, DRAFT_KINDS.need.title]);
    const build = page(BuildPage, true);
    expect(byText(build, "button", /^Copy the line$/)).toHaveLength(1);
    expect(findAll(build, (e) => e.tag === "code").map(text)).toContain(AGENT_LINE);
  });

  it("closed: the dialog on a phone — at 320px in Chrome 154 it is 288px wide on a 320px screen and scrolls inside itself (1,004px of content in 808px), nothing sideways; its buttons are 52px tall and full width under 480px, Close is 44 × 44px; light and dark, its words pass 1.4.3 (the placeholders aside, above)", () => {
    expect(value([".public .draft"], "max-height")).toBe("90dvh");
    expect(value([".public .draft"], "max-width")).toBe("610px");
    expect(value([".draft__actions .btn"], "width", (m) => m !== null && /max-width:\s*480px/.test(m))).toBe("100%");
    expect(value([".btn--large"], "height")).toBe("52px");
    for (const scheme of SCHEMES) {
      expect(contrast(resolve("var(--ink)", scheme), resolve("var(--paper)", scheme))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(resolve("var(--sub)", scheme), resolve("var(--paper)", scheme))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("closed: signed in, / and /feed send the visitor to /home, which keeps the app's look — in Chrome 154 as a FICTIONAL administrator from `pnpm seed:fictional` on a scratch database, both landed on /home, white (#fff) and black in the dark, the blue accent (#1d9bf0) and the system font; public pages kept the identity while signed in", async () => {
    auth.signedIn = true;
    await expect(FrontDoorRoute()).rejects.toThrow("redirect /home");
    await expect(FeedPageRoute()).rejects.toThrow("redirect /home");
    auth.signedIn = false;
    await expect(FrontDoorRoute()).resolves.toBeTruthy();
    const root = G_RULES.find((r) => r.media === null && r.selectors.length === 1 && r.selectors[0] === ":root")!;
    expect(declarations(root.body)).toMatchObject({ "--bg": "#ffffff", "--accent": "#1d9bf0" });
    // The identity's tokens are defined on .public alone (light, then dark), never on :root.
    expect(G_RULES.filter((r) => /--paper\s*:/.test(r.body)).flatMap((r) => r.selectors)).toEqual([".public", ".public"]);
  });

  it("closed: no console error or warning on any public page, either theme, any width, on both servers (Chrome 154), so the server's markup and the hydrated page agree: the interactive parts draw their server form until hydration, through useSyncExternalStore's server snapshot", () => {
    expect(HYDRATED_TS).toContain("useSyncExternalStore(");
    expect(HYDRATED_TS).toMatch(/\(\) => true,\s*\n\s*\(\) => false,/);
  });

  it("closed: the departures from the study that the records explain — 'Sign in' where the study had 'Find your part' (D-0020 §B); 'User control isn't built yet' for 'is being built' (§F); 'The first project' for 'The feed · built locally, not deployed' (§F, no status that turns false at the deploy); the feed as a third way in beside a need and an idea (§A); all four places on a phone, on a second row (§B; SPEC §18.19 item 3), where the study hid two; the drafts' links to /maintainers without JavaScript (§E), where the study had a noscript note; no 'PROPOSED' bar, the study's own framing; and the picture's card names at 15px on a phone, where the study's 16px ran 'A creator's home' 2px past its card at 320px (Chrome 154)", () => {
    const tree = door({ email: EMAIL }, true);
    const words = text(tree);
    expect(words).toContain("Founder-led today. User control isn't built yet.");
    expect(words).not.toMatch(/being built|not deployed|PROPOSED|Find your part/);
    expect(words).toContain("The first project");
    expect(PLACES.map((p) => p.label)).toEqual(["The idea", "Projects", "Build with us", "In the open"]);
    const part = findAll(tree, (e) => e.attrs.id === "part")[0]!;
    expect(findAll(part, (e) => e.tag === "h3").map(text)).toEqual(["Start with the feed.", "Give builders a reason to build.", "Bring your idea."]);
    expect(value([".orbitCardName"], "font-size", PHONE, D_RULES)).toBe("15px");
  });
});
