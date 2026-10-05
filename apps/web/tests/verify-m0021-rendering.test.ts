/**
 * Independent verification of M-0021 (the first screen, for people who come
 * from a post; D-0024; SPEC §18.23), the rendering and use lens: what a
 * person sees and can do on the front door's first screen, in a real
 * browser, at every width, light and dark, by keyboard and touch, in every
 * state, and what a link crawler gets. Written by an agent that built none
 * of it, against 089cbcd (the build is e1fc284; 0376b3e holds the records
 * and 089cbcd adds only the stopping rule). The honesty of the words is the
 * other verifier's. Nothing in the product code, the records or the
 * existing tests is changed by this file.
 *
 * What was read: AGENTS.md; D-0024; M-0021 (.md and .yaml); SPEC §9,
 * §18.19, §18.22 and §18.23; the build receipt and its eight screens on the
 * branch m-0021; the stopping rule
 * (receipts/conformance/2026-10-05-M-0021.verification.md); the M-0020
 * rendering verification and its test; `git diff 0376b3e 089cbcd`.
 *
 * How it was looked at. A production build of 089cbcd (`next build`),
 * served by `next start` under `env -i` with FICTIONAL settings only
 * (DATA_CONTROLLER="FICTIONAL Controller",
 * DATA_CONTROLLER_EMAIL=controller@example.test, MAIL_TRANSPORT=outbox,
 * CLIENT_IP_HEADER=x-forwarded-for, APP_URL=http://localhost:3742, a
 * FICTIONAL SESSION_SECRET, telemetry off) on a scratch database
 * (ours_m0021_vr) made, migrated and seeded by the app's own scripts
 * (`seed-fictional`: ten FICTIONAL people), and dropped afterwards. Three
 * instances of the same build: localhost:3742 (open), :3744 with no data
 * controller (joining closed) and :3745 with DATABASE_URL on a closed port
 * (the database down). Sessions were started with the app's own
 * `createSession` for the FICTIONAL @ada_quillon (administrator) and
 * @bruno_varnell and handed to the browser as `__Host-ours_session`; no
 * cookie value was printed. The browser was the headless Chromium 153
 * (chrome-headless-shell), driven over the DevTools protocol by the
 * verifier's own scripts, with a fresh profile and nothing resolving but
 * localhost; each page sent its own FICTIONAL documentation-range client
 * address (203.0.113.x) so the rate limits were counted as a proxy counts
 * them:
 *
 * 1. the front door at 320×568, 375×812, 820×1180 (touch), 1000×900 and
 *    1440×900, light and dark, as a visitor with no seat open, as a
 *    member, with joining closed and with the database down (40 loads, and
 *    20 more with a member's cookie sent to the closed and the
 *    database-down instances: the first showed the member's view, the
 *    second a visitor's), and with seats open, with addresses waiting, and
 *    with needs named (1440 and 375): the status, the title, sideways
 *    scroll, boxes past
 *    either edge, the first screen's parts' order and rectangles, overlaps
 *    among them, text overflowing its box, WCAG 1.4.3 for every new text
 *    run over what is behind it, every target's size on touch, every
 *    request's origin, and the console; the fold at thirteen window sizes
 *    (1440×900, 1440×810, 1512×890, 1366×768, 1366×660, 1280×720,
 *    1280×620, 1000×700, 820×1180, 820×1000, 375×812, 375×667, 320×568);
 * 2. the form by keyboard at 1440, 375 (touch, dark) and 320 (touch): the
 *    Tab order from the top of the page past the first screen, each
 *    stop's ring, each field's label, attributes and description; the
 *    duplicate ids on the page and where a click on the Projects panel's
 *    "Your email" label sends focus; a need of 141 characters (set past
 *    the browser's maxLength by script, then Enter), a malformed address,
 *    an empty address with a need, a valid address with a need, with a
 *    need of exactly 140 characters, and with none, each with a
 *    MutationObserver on the button and the form (the pending state, the
 *    answer, the fields and the focus afterwards); the needs line after a
 *    reload; four submissions from one address; the same by touch at 375
 *    dark; a submission with the database down; the form with scripts
 *    disabled (a native POST), with the request's Origin header captured
 *    with scripts off and on;
 * 3. the link card: /, /feed, /contract, /privacy and a not-found address
 *    fetched as Twitterbot/1.0, facebookexternalhit/1.1,
 *    Slackbot-LinkExpanding 1.0 and Discordbot/2.0; the image fetched,
 *    its bytes against public/card.png and against a fresh render of
 *    scripts/card.html in the same browser, pixel by pixel;
 * 4. /home as the administrator and as a member at 1440×900 (light and
 *    dark), 1000×700, 820×1180 and 375×812 (light and dark): the panel's
 *    count line, its place beside or after the column, its contrast; and
 *    with the database down;
 * 5. the rest of the front door at 1440: the six sections, the Projects
 *    panel's own form (a FICTIONAL address), the drafts (open, Escape),
 *    the footer; and /feed as a visitor.
 *
 * Screenshots (not committed) were saved in the verifier's scratch
 * directory and are named in its report.
 *
 * Each finding ends here as a "DEFECT (SEVERITY): …" test that FAILS on
 * 089cbcd and would pass once fixed; where only a browser shows it, the
 * test pins the cause in the stylesheet, the markup or the source, and its
 * title says what was measured, where and how. Each check that held is a
 * "closed: …" test that passes. HIGH: a page fails or can't be used, or
 * private data is exposed; MEDIUM: a stated requirement unmet, or a real
 * usability or accessibility failure; LOW: polish.
 *
 * Every person, address and value here is FICTIONAL.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePathname: () => "/",
}));

import ContractPage, { metadata as contractMetadata } from "@/app/(public)/contract/page";
import { metadata as feedMetadata } from "@/app/(public)/feed/page";
import { metadata as doorMetadata } from "@/app/(public)/page";
import { metadata as privacyMetadata } from "@/app/(public)/privacy/page";
import { metadata as rootMetadata } from "@/app/layout";
import { OursCard } from "@/components/RightColumn";
import { DOOR_EYEBROW, DOOR_LEDE, DOOR_STATUS, DOOR_TITLE, DOOR_WHAT, ENTRANCES, MEMBER_JOIN, TAGLINE } from "@/components/public/door";
import { FirstScreenFormView, NEED_HINT } from "@/components/public/FirstScreenForm";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { THRESHOLD } from "@/components/public/handover";
import { FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, ofThreshold, WAITING_LIST_LABEL } from "@/components/public/join";
import { NEED_LABEL, NEED_MAX, NEED_TOO_LONG, needsLine } from "@/core/needs";
import { SEATS_CLOSED } from "@/core/seats";
import { GENERIC_ERROR } from "@/web/actions";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const DOOR_CSS = read("src/components/public/door.module.css");
const FORM_TSX = read("src/components/public/FirstScreenForm.tsx");
const LAYOUT_TSX = read("src/app/layout.tsx");

void ContractPage;

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

/** An element's classes as the source writes them: a CSS module's `_heroForm_1a2b3c` or `door-module__x__heroForm` is "heroForm". */
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
  (e.tag === "a" && e.attrs.href !== undefined) || ["button", "input", "textarea", "select", "summary"].includes(e.tag) || (e.attrs.tabindex !== undefined && e.attrs.tabindex !== "-1");

/** Reachable by Tab: not inside a closed <dialog>, nor inside a closed <details> but as its summary. */
function reachable(e: El): boolean {
  for (let a: El | null = e.parent; a; a = a.parent) {
    if (a.tag === "dialog" && a.attrs.open === undefined) return false;
    if (a.tag === "details" && a.attrs.open === undefined && !(e.tag === "summary" && e.parent === a)) return false;
  }
  return true;
}

const tabbable = (tree: El) => findAll(tree, (e) => FOCUSABLE(e) && reachable(e));

/** The front door inside the public layout's `.public`, so its tokens apply. */
function door(props: Partial<FrontDoorProps> = {}): El {
  return parse(
    renderToStaticMarkup(
      createElement("div", { className: "public" }, createElement(FrontDoor, { joining: true, email: null, count: 10, seatsOpen: 0, seatsWaiting: 0, needs: 0, ...props })),
    ),
  );
}

/** The first screen: the section the headline names. */
function hero(tree: El): El {
  const section = findAll(tree, (e) => e.tag === "section" && e.attrs["aria-labelledby"] === "door-title")[0];
  if (!section) throw new Error("no first screen");
  return section;
}

function formView(state: Parameters<typeof FirstScreenFormView>[0]["state"], extra: Partial<Parameters<typeof FirstScreenFormView>[0]> = {}): El {
  return parse(
    renderToStaticMarkup(createElement("div", { className: "public" }, createElement(FirstScreenFormView, { state, action: () => {}, pending: false, lines: [FREE_LINE], needs: null, ...extra }))),
  );
}

function inShell(part: ReactNode): El {
  return parse(
    renderToStaticMarkup(createElement("div", { className: "public app-shell" }, createElement("div", { className: "app" }, createElement("aside", { className: "aside" }, createElement("div", { className: "aside__inner" }, part))))),
  );
}

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
      else if (!head.startsWith("@")) out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner, order: start + out.length, sheet });
      i = j;
    }
  };
  walk(source, null);
  return out;
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/!important/, "").trim()]));
}

/** globals.css first, then the door's module, as the production bundle orders them (the layout's sheet before a component's). */
const G_RULES = cssRules(GLOBALS, "globals.css");
const D_RULES = cssRules(DOOR_CSS, "door.module.css", 100_000);
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
      if (name === "scripting") return v === "enabled";
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
  let rest = compound.replace(/^:global\((.*)\)$/, "$1");
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
    } else if ((m = /^:global\(([^()]*)\)/.exec(rest))) {
      if (!compoundMatches(el, m[1]!, st)) return false;
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

/** The custom properties every public element sees: `:root`'s, then `.public`'s. */
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

/** A colour as the public pages resolve it in the context. */
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

/** The colour of the text in `el`: its own `color`, or the nearest ancestor's (`inherit`, which buttons and links declare, walks on up). */
function ink(el: El, ctx: Ctx): Rgba {
  for (let e: El | null = el; e; e = e.parent) {
    const d = cascade(e, ["color"], ctx);
    if (d && !/^(inherit|currentcolor)$/i.test(d.value.trim())) return resolve(d.value, ctx);
  }
  return resolve("var(--text)", ctx);
}

/** The colour a focus ring takes on `el`: the winning `outline` or `outline-color`. */
function ringColour(el: El, ctx: Ctx): { colour: Rgba; selector: string } {
  const d = cascade(el, ["outline", "outline-color"], ctx, { focus: el });
  if (!d) throw new Error("no ring");
  const raw = d.prop === "outline" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  return { colour: resolve(raw, ctx), selector: d.selector };
}

const px = (v: string | undefined, fallback = 0) => (v === undefined ? fallback : parseFloat(v) || fallback);

/** A length as the stylesheet writes it at a width: `18px`, `7.2vw`, or `clamp(56px, 7.2vw, 102px)`. */
function length(v: string | undefined, ctx: Ctx, fallback = 0): number {
  if (!v) return fallback;
  const one = (s: string): number => {
    const t = s.trim();
    if (t.endsWith("vw")) return (parseFloat(t) * ctx.width) / 100;
    return parseFloat(t) || 0;
  };
  const clamp = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(v.trim());
  if (clamp) return Math.min(Math.max(one(clamp[1]!), one(clamp[2]!)), one(clamp[3]!));
  return one(v);
}

/** A link's height and the pitch of its rows, the way Chrome drew the ones measured (the M-0020 verification's rule). */
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

/* ------------------------------------------------- the first screen's height */

/**
 * Where the first screen's parts land, laid out from the stylesheet the way
 * Chromium 153 laid them out: one column under the headline, each block's
 * height from its font size, line height, padding, border, gap and margin,
 * with the line counts measured in the browser at that width (a visitor,
 * the waiting list). The header's height is the measured one (89px from
 * 761px: the bar's 88px and its border; 127px on a phone: two rows of 44px
 * with the bar's padding and gap), as M-0021 did not touch it. Checked
 * against the measurements: at 1440 the button's bottom 1,075.35 for
 * 1,075.3 measured; at 375, 1,029.85 for 1,029.8.
 */
function firstScreen(ctx: Ctx, lines: { eyebrow: number; headline: number; what: number; pledge: number; status: number }) {
  const lh = (el: string[], fallback: number) => parseFloat(value(el, "line-height", ctx) ?? String(fallback));
  const header = ctx.width <= 760 ? 127 : 89;
  const heroPad = px(value([".hero"], "padding", ctx)?.split(/\s+/)[0]);
  const eyebrow = length(value([".eyebrow", ".hero > .eyebrow"], "font-size", ctx), ctx) * lh([".eyebrow"], 1.5) * lines.eyebrow;
  const gap = px(value([".hero"], "gap", ctx)?.split(/\s+/)[0], 24);
  const headline = length(value([".headline"], "font-size", ctx), ctx) * lh([".headline"], 1) * lines.headline;
  const what = length(value([".lede"], "font-size", ctx), ctx) * lh([".lede"], 1.6) * lines.what;
  const publicLh = parseFloat(value([".public"], "line-height", ctx) ?? "1.55");
  const promisePad = px(value([".heroPromise"], "padding", ctx)?.split(/\s+/)[0]);
  const promiseGap = px(value([".heroPromise"], "gap", ctx), 8);
  const count = length(value([".heroCount"], "font-size", ctx), ctx) * lh([".heroCount"], 1);
  const pledge = length(value([".heroPledge"], "font-size", ctx), ctx) * lh([".heroPledge"], 1.5) * lines.pledge;
  const by = length(value([".heroPledgeBy"], "font-size", ctx), ctx) * publicLh;
  const promise = 2 + 2 * promisePad + count + promiseGap + pledge + promiseGap + by;
  const promiseMargin = px(value([".heroPromise"], "margin", ctx)?.split(/\s+/)[0], 26);
  const statusMargin = px(value([".heroStatus"], "margin-top", ctx), 20);
  const status = length(value([".heroStatus"], "font-size", ctx), ctx) * (ctx.width <= 760 ? lh([".heroStatus"], publicLh) : publicLh) * lines.status;
  const joinMargin = px(value([".heroJoin"], "margin", ctx)?.split(/\s+/)[0], 22);
  const label = px(value([".field__label"], "font-size", ctx), 14) * publicLh;
  const fieldGap = px(value([".field"], "gap", ctx), 6);
  const input = px(value([".input"], "font-size", ctx), 17) * parseFloat(value([".input"], "line-height", ctx) ?? "1.3") + 2 * px(value([".input"], "padding", ctx), 12) + 2;
  const hint = px(value([".field__hint"], "font-size", ctx), 13) * publicLh;
  const formGap = px(value([".heroForm"], "gap", ctx), 12);
  const button = px(value([".btn--large"], "height", ctx), 52);
  const top = header + heroPad;
  const headlineTop = top + eyebrow + gap;
  const whatTop = headlineTop + headline + gap;
  const promiseTop = whatTop + what + promiseMargin;
  const statusTop = promiseTop + promise + statusMargin;
  const formTop = statusTop + status + joinMargin;
  const buttonTop = formTop + label + fieldGap + input + formGap + label + fieldGap + input + fieldGap + hint + formGap;
  return { headlineTop, whatTop, promiseTop, statusTop, formTop, buttonTop, buttonBottom: buttonTop + button };
}

/* =============================================================== findings */

describe("findings (each FAILS on 089cbcd, and passes once fixed)", () => {
  it("DEFECT (HIGH): without JavaScript, or before the page's script has loaded, submitting the first screen's form returns a bare 'Internal Server Error' page and nothing is kept — measured in Chromium 153 at 1440×900 with scripts disabled: the form is wired for it (action=\"\", method=\"POST\", the $ACTION hidden fields), Enter in the need field posted, the server answered 500 and logged \"`x-forwarded-host` header with value `localhost:3742` does not match `origin` header with value `null` … Aborting the action\"; the request's Origin header was the string null (with scripts on, React's fetch carried http://localhost:3742 and got 200). The root layout's metadata sets referrer: \"no-referrer\" (since M-0010), and under that policy a browser serialises the Origin of every form POST as null (Fetch §4.1, 'append a request Origin header'), which Next's server-action origin check refuses; the feed's form and the sign-in form post the same way (useActionState and a form action) and are older than M-0021, though only the first screen's was driven here. D-0024 §C: 'the form is the entrance'; M-0021: 'has one thing to do that works'. A policy of same-origin or strict-origin-when-cross-origin keeps referrers from other sites while letting the site's own posts carry their origin", () => {
    expect(LAYOUT_TSX).toContain("referrer:");
    const policy = rootMetadata.referrer;
    const originSent = policy === undefined || ["same-origin", "strict-origin-when-cross-origin", "origin", "origin-when-cross-origin", "no-referrer-when-downgrade", "strict-origin", "unsafe-url"].includes(policy as string);
    // Either the policy lets a same-origin POST carry its origin, or the form no longer posts to a server action.
    const postsToARoute = /action="\/[\w/-]*"/.test(FORM_TSX);
    expect({ policy, originSent: originSent || postsToARoute }).toEqual({ policy, originSent: true });
  });

  it("DEFECT (MEDIUM): the form, the one thing to do, is below the first screen at every common size — measured in Chromium 153 as a visitor with the waiting list: the button's bottom at 1,075px in a 900px-tall window at 1440 (the receipt's own size, whose screen ends at 'Your email'), 1,065 at 1366×768, 1,047 at 1280×720, 994 at 1000×900, 1,184 at 820×1180, 1,030 at 375×812 (the status line itself is under the fold of a 375×667 phone) and 1,178 at 320×568; for a member 'Open your feed' ends at 916 at 1440×900. D-0024 §A: 'The first screen says the whole thing… the headline; what it is; the promise…; the status; one form'; its reason 1: 'People from a post give the site ten seconds'; M-0021: 'has one thing to do that works'. The parts stack in one column under a 102px headline (294px for its three lines), the 182px promise and the status, while the picture's column beside them is empty below 747px", () => {
    const wide = firstScreen(at(1440), { eyebrow: 1, headline: 3, what: 2, pledge: 3, status: 1 });
    const laptop = firstScreen(at(1366), { eyebrow: 1, headline: 3, what: 2, pledge: 3, status: 1 });
    const phone = firstScreen(at(375), { eyebrow: 2, headline: 3, what: 2, pledge: 5, status: 2 });
    // The estimate reproduces the browser: 1,075.3 and 1,029.8 measured.
    expect(Math.abs(wide.buttonBottom - 1075.3)).toBeLessThan(3);
    expect(Math.abs(phone.buttonBottom - 1029.8)).toBeLessThan(3);
    expect({
      "1440x900": Math.round(wide.buttonBottom) <= 900,
      "1366x768": Math.round(laptop.buttonBottom) <= 768,
      "375x812": Math.round(phone.buttonBottom) <= 812,
    }).toEqual({ "1440x900": true, "1366x768": true, "375x812": true });
  });

  it("DEFECT (MEDIUM): / now has two inputs with the id field-email, and the Projects panel's 'Your email' label is bound to the first screen's field — measured in Chromium 153 at 1440 and, by touch, at 375: document.querySelectorAll('#field-email').length is 2, the panel's label's .control is the first screen's input, and a click or tap on that label scrolls the page to the top (scrollY 423 at 1440, 422 at 375) and focuses the other form; an error on the panel's field would be described by aria-describedby=\"field-email-error\", which resolves to the first screen's. Before M-0021 the front door had one email form. SPEC §9: 'labels on every input'; WCAG 1.3.1 and 4.1.1. Field.tsx derives the id from the name (`field-${name}`) and neither FirstScreenForm nor GetInForm passes one", () => {
    const tree = door();
    const ids = findAll(tree, (e) => e.attrs.id !== undefined && e.attrs.id.startsWith("field-")).map((e) => e.attrs.id!);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(findAll(tree, (e) => e.tag === "input" && e.attrs.name === "email")).toHaveLength(2);
    expect(duplicates).toEqual([]);
  });

  it("DEFECT (MEDIUM): a refusal empties the form, so the person retypes everything and the refusal names words that are no longer there — measured in Chromium 153 at 1440: after 'Keep it to 140 characters.' (a need of 141 characters, Enter in its field) both fields read \"\", the 141 characters and the address gone; after 'Enter a valid email address.' the need written beside it ('the calendar app') is gone too; the same by touch at 375. React resets a form whose `action` prop is a function once the action returns, whatever it returned, and FirstScreenForm's fields are uncontrolled with nothing put back: no value or defaultValue from the state, no requestFormReset/preventDefault of its own. needs.ts: 'refused (INVALID), so the person can shorten it'; SPEC §18.23: 'refused at its field'. The feed's form loses the address the same way, which is older than M-0021; the need is new, and up to 140 characters", () => {
    // Nothing in the view puts the typed words back after a refusal: the refused state carries no values,
    // and the inputs render without any.
    const refused = formView({ error: NEED_TOO_LONG, field: "need" });
    const need = findAll(refused, (e) => e.tag === "input" && e.attrs.name === "need")[0]!;
    expect(need.attrs["aria-invalid"]).toBe("true");
    const keeps = /\bvalue=\{|\bdefaultValue=\{|requestFormReset|preventDefault\(\)/.test(FORM_TSX);
    expect({ keeps, needValue: need.attrs.value }).toEqual({ keeps: true, needValue: expect.any(String) });
  });

  it("DEFECT (LOW): on a touch screen 'How that works', the first screen's way to the contract, is a 16px-tall target — measured in Chromium 153 with touch at 320, 375 and 820px: a.heroPledgeLink 98×16, where the header's places, the panel's links and 'I want to build' are 44px (SPEC §9's 44px on mobile; WCAG 2.5.8 asks 24px, with an exception for a link inside a sentence that this caption, a name and a link, only arguably is). door.module.css gives .textLink, .btnSmall, .values a, .agentActions a and .openFoot a a rule under (pointer: coarse) and .heroPledgeLink none; 'See where it stands.' beside it is older than M-0021", () => {
    const h = hero(door());
    const link = byClass(h, "heroPledgeLink")[0]!;
    expect(text(link)).toBe("How that works");
    const box = linkBox(link, at(375, false, true));
    expect({ height: box.height, meets44: box.height >= 44 }).toEqual({ height: box.height, meets44: true });
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: nothing scrolls sideways, passes an edge or overlaps — the front door as a visitor, a member, with joining closed and with the database down, × 320, 375, 820, 1000 and 1440px × light and dark (40 loads in Chromium 153, and 20 more with a member's cookie on the closed and the database-down instances): scrollWidth equal to clientWidth, no box past either edge, no two of the first screen's blocks intersecting, no text overflowing its box but SVG labels in the picture; the hero is a two-column grid with minmax(0, …) tracks from 761px and a column below, the promise and the form capped at 560 and 520px, the fields and the button full width", () => {
    expect(value([".hero"], "grid-template-columns")).toBe("minmax(0, 1.32fr) minmax(0, 1fr)");
    expect(value([".hero"], "flex-direction", at(760))).toBe("column");
    expect(value([".heroPromise"], "max-width")).toBe("560px");
    expect(value([".heroJoin"], "max-width")).toBe("520px");
    expect(value([".input"], "width")).toBe("100%");
    expect(value([".btn--block"], "width")).toBe("100%");
    expect(value([".public"], "overflow-wrap")).toBe("break-word");
    expect(value([".nowrap"], "white-space")).toBe("nowrap");
  });

  it("closed: the first screen's order, in the markup and on the screen — the eyebrow, the headline, what it is, the promise (the count, the pledge, the signature), the status, the form, 'I want to build' as a text link, then the picture (beside from 761px, below on a phone); tops ascending at every width and in every state (Chromium 153); one h1; 'I want this to exist' gone", () => {
    const h = hero(door());
    const blocks = elements(h).map((e) => moduleClass(e).split(" ")[0] || e.tag);
    expect(blocks).toEqual(["eyebrow", "headline", "heroText", "diagram"]);
    const textParts = elements(byClass(h, "heroText")[0]!).map((e) => moduleClass(e).split(" ")[0] || e.tag);
    expect(textParts).toEqual(["lede", "heroPromise", "heroStatus", "heroJoin", "heroBuild"]);
    const promise = elements(byClass(h, "heroPromise")[0]!).map((e) => `${e.tag}.${moduleClass(e)}`);
    expect(promise).toEqual(["p.heroCount", "blockquote.heroPledge", "figcaption.heroPledgeBy"]);
    const t = text(h);
    for (const [a, b] of [
      [DOOR_EYEBROW, TAGLINE],
      [TAGLINE, DOOR_WHAT],
      [DOOR_WHAT, ofThreshold(10)],
      [ofThreshold(10), "I'll never sell our.one."],
      ["Rado, maintainer · How that works", DOOR_STATUS],
      [DOOR_STATUS, "Your email"],
      [NEED_LABEL, WAITING_LIST_LABEL],
      [WAITING_LIST_LABEL, ENTRANCES.builders],
    ]) {
      expect(t.indexOf(a!), a).toBeGreaterThanOrEqual(0);
      expect(t.indexOf(b!), `${a} before ${b}`).toBeGreaterThan(t.indexOf(a!));
    }
    expect(findAll(h, (e) => e.tag === "h1")).toHaveLength(1);
    expect(t).not.toContain("I want this to exist");
    expect(value([".hero"], "grid-template-areas")?.replace(/\s+/g, " ")).toBe('"eyebrow eyebrow" "title picture" "text picture"');
    expect(value([".diagram"], "max-width", at(375))).toBe("450px");
  });

  it("closed: the count is a number — '10 of 100,000' at 34px (30px on a phone) in tabular figures, then the pledge's sentence and 'Rado, maintainer · How that works' to /contract; no bar, no progress element, no width in percent; the waiting list and the needs change nothing in it (Chromium 153, a visitor with addresses waiting and with six needs named: still '10 of 100,000')", () => {
    const h = hero(door({ count: 10, seatsWaiting: 5, needs: 6 }));
    const count = byClass(h, "heroCount")[0]!;
    expect(text(count)).toBe(`10 of ${THRESHOLD}`);
    expect(value([".heroCount"], "font-size")).toBe("34px");
    expect(value([".heroCount"], "font-size", at(375))).toBe("30px");
    expect(value([".heroCount"], "font-variant-numeric")).toBe("tabular-nums");
    expect(findAll(h, (e) => e.tag === "progress" || e.attrs.role === "progressbar" || e.attrs["aria-valuenow"] !== undefined)).toEqual([]);
    expect(DOOR_CSS).not.toMatch(/\.heroCount[^}]*width:\s*\d+%/);
    const by = byClass(h, "heroPledgeBy")[0]!;
    expect(text(by)).toBe("Rado, maintainer · How that works");
    expect(findAll(by, (e) => e.tag === "a").map((a) => a.attrs.href)).toEqual(["/contract"]);
    expect(text(h)).toContain(`When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`);
  });

  it("closed: text contrast of the new parts, both themes — in Chromium 153 every text run on the first screen met WCAG 1.4.3: the count and the pledge 14.44:1 on the card (13.57 dark), the signature 6.37 (7.15), the status and the hint 5.79 (7.93), the labels, the lines, the needs line and 'I want to build' 13.14 (15.07), the button 13.14 (15.07), the member's notice 12.07 (13.86), a refusal 5.88 (7.14), the panel's count 11.94 on the forest (16.25 dark); the same pairs from the stylesheet", () => {
    const h = hero(door({ needs: 2 }));
    const member = hero(door({ member: true }));
    const refused = formView({ error: NEED_TOO_LONG, field: "need" });
    const panel = inShell(createElement(OursCard, { email: null, count: 10 }));
    const runs: [string, El][] = [
      ["count", byClass(h, "heroCount")[0]!],
      ["pledge", byClass(h, "heroPledge")[0]!],
      ["signature", byClass(h, "heroPledgeBy")[0]!],
      ["signature link", byClass(h, "heroPledgeLink")[0]!],
      ["status", byClass(h, "heroStatus")[0]!],
      ["label", byClass(h, "field__label")[0]!],
      ["hint", byClass(h, "field__hint")[0]!],
      ["button", findAll(h, (e) => e.tag === "button")[0]!],
      ["seat line", byClass(h, "joinStrong")[0]!],
      ["needs line", byClass(h, "needsLine")[0]!],
      ["build link", byClass(h, "textLink")[0]!],
      ["member notice", byClass(member, "notice")[0]!],
      ["refusal", byClass(refused, "field__error")[0]!],
      ["panel count", byClass(panel, "card__count")[0]!],
    ];
    const low: string[] = [];
    const seen: Record<string, number> = {};
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      for (const [name, el] of runs) {
        const ratio = contrast(ink(el, ctx), backdrop(el, ctx));
        seen[`${name} ${scheme}`] = ratio;
        if (ratio < 4.5) low.push(`${name} ${scheme} ${ratio}`);
      }
    }
    expect(low).toEqual([]);
    expect(seen["count light"]).toBe(14.44);
    expect(seen["signature light"]).toBe(6.37);
    expect(seen["hint light"]).toBe(5.79);
    expect(seen["hint dark"]).toBe(7.93);
    expect(seen["panel count light"]).toBe(11.94);
    expect(seen["panel count dark"]).toBe(16.25);
  });

  it("closed: every state of the first screen — a visitor with no seat open: 'Join the waiting list', the seat line and the free line; seats open and nobody waiting: 'Join our.one' and the free line alone; seats open with addresses waiting: 'Join the waiting list' without the seat line; a member: 'You're in.' and 'Open your feed' to /home in place of the form, the count still there, no needs line; joining closed: 'Joining opens soon.' and the invite line, no form, the count still read; the database down: no count, 'Join our.one', the free line alone, no needs line, 'Sign in' even with a member's cookie (each seen in Chromium 153 on :3742, :3744 and :3745)", () => {
    const waiting = text(hero(door({ seatsOpen: 0, seatsWaiting: 0 })));
    expect(waiting).toContain(WAITING_LIST_LABEL);
    expect(waiting).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    expect(waiting).toContain(FREE_LINE);
    const open = text(hero(door({ seatsOpen: 5, seatsWaiting: 0 })));
    expect(open).toContain(JOIN_LABEL);
    expect(open).not.toContain("No seats are open right now.");
    expect(open).toContain(FREE_LINE);
    const line = text(hero(door({ seatsOpen: 5, seatsWaiting: 5 })));
    expect(line).toContain(WAITING_LIST_LABEL);
    expect(line).not.toContain("No seats are open right now.");
    const member = hero(door({ member: true, needs: 6 }));
    expect(text(member)).toContain(MEMBER_JOIN.line);
    expect(findAll(member, (e) => e.tag === "a" && text(e) === MEMBER_JOIN.link).map((a) => a.attrs.href)).toEqual(["/home"]);
    expect(findAll(member, (e) => e.tag === "form")).toEqual([]);
    expect(text(member)).toContain(ofThreshold(10));
    expect(text(member)).not.toContain("named so far");
    const closed = hero(door({ joining: false, seatsOpen: null, seatsWaiting: null, needs: null }));
    expect(text(closed)).toContain(SEATS_CLOSED);
    expect(text(closed)).toContain(INVITE_CLOSED_LINE);
    expect(findAll(closed, (e) => e.tag === "form")).toEqual([]);
    expect(text(closed)).toContain(ofThreshold(10));
    const down = hero(door({ count: null, seatsOpen: null, seatsWaiting: null, needs: null }));
    expect(text(down)).not.toContain(`of ${THRESHOLD}`);
    expect(text(down)).toContain(`When ${THRESHOLD} people have joined`);
    expect(text(down)).toContain(JOIN_LABEL);
    expect(text(down)).not.toContain("No seats are open right now.");
    expect(text(down)).not.toContain("named so far");
    expect(byClass(down, "heroCount")).toEqual([]);
  });

  it("closed: the first screen by keyboard — in Chromium 153 at 1440 (light), 375 (dark, touch) and 320 (touch) the Tab order is the skip link, the wordmark, the four places, Sign in (Your feed for a member), then 'How that works', 'See where it stands.', the address, the need, the button, 'I want to build', and then the strip's 'Open code'; every stop drew a 3px rust ring 3px out (4.74:1 on the paper, 5.21 on the card; 7.22 and 6.51 dark), the fields' too, as `.public :focus-visible` wins over `.input:focus-visible`", () => {
    const h = hero(door());
    expect(tabbable(h).map((e) => (e.tag === "input" ? `input ${e.attrs.name}` : text(e)))).toEqual([
      "How that works",
      "See where it stands.",
      "input email",
      "input need",
      WAITING_LIST_LABEL,
      `${ENTRANCES.builders} ↗`,
    ]);
    const member = hero(door({ member: true }));
    expect(tabbable(member).map(text)).toEqual(["How that works", "See where it stands.", MEMBER_JOIN.link, `${ENTRANCES.builders} ↗`]);
    const low: string[] = [];
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      for (const el of tabbable(h)) {
        const ring = ringColour(el, ctx);
        expect(ring.selector).toBe(".public :focus-visible");
        const ratio = contrast(ring.colour, backdrop(el.parent!, ctx));
        if (ratio < 3) low.push(`${text(el) || el.attrs.name} ${scheme} ${ratio}`);
      }
    }
    expect(low).toEqual([]);
    expect(value([".public :focus-visible"], "outline")).toBe("3px solid var(--rust)");
  });

  it("closed: the fields as rendered and as a screen reader hears them — 'Your email' (type email, required, maxLength 254, inputmode email, autocomplete email) and 'Which app would you take back?' (type text, not required, maxLength 140, autocomplete off) each labelled by `for`, the hint 'Optional. Kept without your address.' tied to the need by aria-describedby; the form posts without the browser's own validation (noValidate), as the feed's does", () => {
    const h = hero(door());
    const inputs = findAll(h, (e) => e.tag === "input");
    expect(inputs.map((i) => i.attrs.name)).toEqual(["email", "need"]);
    const [email, need] = inputs as [El, El];
    expect(email.attrs).toMatchObject({ id: "field-email", type: "email", required: "", maxlength: "254", inputmode: "email", autocomplete: "email", autocapitalize: "none", spellcheck: "false" });
    expect(need.attrs).toMatchObject({ id: "field-need", type: "text", maxlength: String(NEED_MAX), autocomplete: "off", "aria-describedby": "field-need-hint" });
    expect(need.attrs.required).toBeUndefined();
    const labels = findAll(h, (e) => e.tag === "label");
    expect(labels.map((l) => [l.attrs.for, text(l)])).toEqual([
      ["field-email", "Your email"],
      ["field-need", NEED_LABEL],
    ]);
    expect(text(findAll(h, (e) => e.attrs.id === "field-need-hint")[0]!)).toBe(NEED_HINT);
    expect(findAll(h, (e) => e.tag === "form")[0]!.attrs.novalidate).toBe("");
  });

  it("closed: each refusal at its field, and the one answer — in Chromium 153: a need of 141 characters, set past the browser's maxLength by script and sent with Enter, drew 'Keep it to 140 characters.' under the need (role alert, aria-invalid, described by the hint and the error) and nothing under the address, and kept nothing; 'not an email' and an empty address drew 'Enter a valid email address.' under the address and nothing under the need; a fourth submission from one address in an hour drew the rate limit's sentence under the address; with the database down, 'Something went wrong. Please try again.' there; every valid submission (with a need, with one of exactly 140 characters, with none; by touch at 375 dark) drew the one answer in a role=status notice under the button, and the button was disabled while pending", () => {
    const atNeed = formView({ error: NEED_TOO_LONG, field: "need" });
    const needError = findAll(atNeed, (e) => e.attrs.id === "field-need-error")[0]!;
    expect(text(needError)).toBe(NEED_TOO_LONG);
    expect(needError.attrs.role).toBe("alert");
    expect(findAll(atNeed, (e) => e.tag === "input" && e.attrs.name === "need")[0]!.attrs).toMatchObject({ "aria-invalid": "true", "aria-describedby": "field-need-hint field-need-error" });
    expect(findAll(atNeed, (e) => e.attrs.id === "field-email-error")).toEqual([]);
    for (const error of ["Enter a valid email address.", "You've done that too many times. Try again later.", GENERIC_ERROR, SEATS_CLOSED]) {
      const atEmail = formView({ error });
      expect(text(findAll(atEmail, (e) => e.attrs.id === "field-email-error")[0]!)).toBe(error);
      expect(findAll(atEmail, (e) => e.attrs.id === "field-need-error")).toEqual([]);
      expect(findAll(atEmail, (e) => e.tag === "input" && e.attrs.name === "need")[0]!.attrs["aria-invalid"]).toBeUndefined();
    }
    const answered = formView({ ok: true });
    const status = findAll(answered, (e) => e.attrs.role === "status")[0]!;
    expect(text(status)).toBe(CHECK_YOUR_EMAIL);
    expect(hasClass(status, "notice--ok")).toBe(true);
    // The answer follows the form, before the lines under it.
    const join = byClass(answered, "heroJoin")[0]!;
    expect(elements(join).map((e) => e.tag)).toEqual(["form", "p", "p"]);
    expect(findAll(formView(null), (e) => e.attrs.role === "status")).toEqual([]);
    const pending = findAll(formView(null, { pending: true }), (e) => e.tag === "button")[0]!;
    expect(pending.attrs.disabled).toBe("");
    expect(FORM_TSX).toContain("disabled={pending}");
    expect(value([".btn:disabled", ".btn[aria-disabled=\"true\"]"], "opacity")).toBe("0.5");
  });

  it("closed: a need named is counted from the first and never shown — in Chromium 153 after two valid submissions with a need and one without, a reload drew '2 apps named so far.' under the lines (14px bold, the rust dot), and later '6 apps named so far.'; the database held each need's words and time in three columns and no address; the line is absent at none and when the count can't be read; the line's own words for 1, 37 and 1,284", () => {
    expect(needsLine(1)).toBe("1 app named so far.");
    expect(needsLine(37)).toBe("37 apps named so far.");
    expect(needsLine(1284)).toBe("1,284 apps named so far.");
    const h = hero(door({ needs: 2 }));
    const join = byClass(h, "heroJoin")[0]!;
    expect(elements(join).map((e) => `${e.tag}.${moduleClass(e).split(" ").pop()}`)).toEqual(["form.heroForm", "p.joinStrong", "p.joinStrong", "p.needsLine"]);
    expect(text(byClass(h, "needsLine")[0]!)).toBe("2 apps named so far.");
    expect(value([".needsLine"], "font-size")).toBe("14px");
    expect(value([".needsLine"], "font-weight")).toBe("700");
    expect(value([".needsLine::before"], "background")).toBe("var(--rust)");
    expect(byClass(hero(door({ needs: 0 })), "needsLine")).toEqual([]);
    expect(byClass(hero(door({ needs: null })), "needsLine")).toEqual([]);
    expect(read("drizzle/0003_needs.sql")).not.toMatch(/email|address/i);
  });

  it("closed: targets on a touch screen — in Chromium 153 with touch at 320, 375 and 820px the two fields are 48px tall, the button 52px, 'I want to build' 44px, and a member's 'Open your feed' 36px with the 6px hit area every .btn gets; by touch at 375 (dark) the address, the need and the button took the taps and the one answer followed; the places' row and Sign in are 44px (older rules)", () => {
    const coarse = at(375, false, true);
    expect(value([".btn--large"], "height")).toBe("52px");
    expect(px(value([".input"], "font-size")) * 1.3 + 2 * px(value([".input"], "padding")) + 2).toBeCloseTo(48.1, 0);
    expect(value([".textLink"], "min-height", coarse)).toBe("44px");
    const h = hero(door());
    expect(linkBox(byClass(h, "textLink")[0]!, coarse).height).toBe(44);
    expect(value([".btn::after"], "inset", coarse)).toBe("-6px -4px");
    expect(value([".btn--large::after"], "content", coarse)).toBe("none");
    expect(value([".public-nav a"], "min-height", coarse)).toBe("44px");
  });

  it("closed: the link card as crawlers fetch it — from `next start`, /, /feed, /contract, /privacy and a not-found address (404) fetched as Twitterbot/1.0, facebookexternalhit/1.1, Slackbot-LinkExpanding 1.0 and Discordbot/2.0 all served the same tags: og:title and twitter:title the page's title, og:description and twitter:description the page's description (the front door's for pages without one), og:site_name our.one, og:type website, og:image and twitter:image http://localhost:3742/card.png (absolute, from APP_URL), og:image:width 1200, og:image:height 630, og:image:alt the headline, twitter:card summary_large_image; the image 200 image/png, 53,558 bytes, 1200×630, byte-identical to public/card.png and to a fresh render of scripts/card.html in the same browser (0 of 756,000 pixels differing); the card's words are door.ts's and its colours the identity's", () => {
    expect(rootMetadata.openGraph).toMatchObject({ siteName: "our.one", type: "website", images: [{ url: "/card.png", width: 1200, height: 630, alt: TAGLINE }] });
    expect(rootMetadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/card.png"] });
    expect(rootMetadata.openGraph).not.toHaveProperty("title");
    expect(rootMetadata.openGraph).not.toHaveProperty("description");
    expect(rootMetadata.title).toEqual({ default: "our.one", template: "%s · our.one" });
    expect(rootMetadata.description).toBe(DOOR_LEDE);
    expect(String(rootMetadata.metadataBase)).toBe(new URL(process.env.APP_URL!).href);
    expect(doorMetadata).toMatchObject({ title: { absolute: DOOR_TITLE }, description: DOOR_LEDE });
    expect(feedMetadata).toMatchObject({ title: { absolute: "our.one · Just your people. Then you're done." } });
    expect(contractMetadata).toMatchObject({ title: "The contract" });
    expect(privacyMetadata).toMatchObject({ title: "Privacy", description: "What our.one keeps about you, why, for how long, and who else receives it." });
    const card = join(WEB_ROOT, "public/card.png");
    expect(existsSync(card)).toBe(true);
    const png = readFileSync(card);
    expect(png.length).toBe(53_558);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    const source = read("scripts/card.html");
    for (const words of [DOOR_EYEBROW, "The software we live in should be", "ours.", DOOR_STATUS.replace("isn't", "isn't")]) expect(source).toContain(words);
    const t = tokens(WIDE);
    for (const c of ["#f5f3eb", "#222b24", "#bf411d", "#586157", "#e1f28b"]) expect(Object.values(t)).toContain(c);
    for (const c of [...source.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase())) expect(Object.values(t), c).toContain(c);
  });

  it("closed: the panel beside a member's feed — in Chromium 153 on /home as the administrator and as a member, '10 of 100,000 people are in.' stands between the panel's text and its two buttons (15px bold, the paper on the forest, 11.94:1; 16.25 dark), beside the column at 1440 and 1000px (the sticky panel) and after it at 820 and 375px; the app's layout reads the count with a catch, so the page stands without it; with the database down /home is the app's error page, as before M-0021, so a member's panel without a count can't be seen on that server", () => {
    const panel = inShell(createElement(OursCard, { email: null, count: 10 }));
    const card = byClass(panel, "card--ours")[0]!;
    expect(elements(card).map((e) => moduleClass(e).split(" ")[0])).toEqual(["card__kicker", "card__title", "card__text", "card__count", "card__actions", "card__links"]);
    expect(text(byClass(card, "card__count")[0]!)).toBe(`10 of ${THRESHOLD} people are in.`);
    expect(value([".card__count"], "font-size")).toBe("15px");
    expect(value([".card__count"], "font-weight")).toBe("700");
    const without = inShell(createElement(OursCard, { email: null, count: null }));
    expect(byClass(without, "card__count")).toEqual([]);
    expect(text(without)).not.toContain(THRESHOLD);
    expect(read("src/app/(app)/layout.tsx")).toContain("memberCount(db).catch(");
    expect(value([".app"], "flex-direction", at(1000))).toBe("row");
    expect(value([".app"], "flex-direction", at(820))).toBe("column");
    expect(value([".aside"], "position", at(1000))).toBe("sticky");
  });

  it("closed: the rest of the page is unchanged — in Chromium 153 at 1440 the six sections in order (idea, projects, ours, build, open, part), the three tabs, the Projects panel's own form ('Join the waiting list', the rank line) answering a FICTIONAL address with the one answer while the first screen's form shows nothing, 'Draft a need' opening a modal dialog with focus in its field and Escape closing it with focus back on the button, the footer's links and the version; /feed as a visitor: no need field, one email field, the rank line, no 'of 100,000'", () => {
    const tree = door();
    expect(findAll(tree, (e) => e.tag === "section" && e.attrs.id !== undefined).map((e) => e.attrs.id)).toEqual(["idea", "projects", "ours", "build", "open", "part"]);
    const projects = findAll(tree, (e) => e.attrs.id === "projects")[0]!;
    expect(findAll(projects, (e) => e.tag === "form")).toHaveLength(1);
    expect(text(projects)).toContain("10 people are in. You'd be #11.");
    // The drafts' buttons (their dialogs are drawn once the page's script runs; here, before it, each is its link).
    for (const label of ["Draft an idea first", "Draft a need", "Draft an idea"]) {
      expect(findAll(tree, (e) => (e.tag === "a" || e.tag === "button") && text(e).startsWith(label)).length, label).toBeGreaterThanOrEqual(1);
    }
    expect(findAll(tree, (e) => e.tag === "input" && e.attrs.name === "need")).toHaveLength(1);
    const feed = read("src/components/public/FrontPage.tsx");
    expect(feed).not.toContain("FirstScreenForm");
    expect(feed).not.toContain("ofThreshold");
  });

  it("closed: nothing loads from another origin and the console stays quiet — every request in the sweeps, the keyboard and touch sessions and the panel's loads went to the server itself, no page logged an error or a warning, and the stylesheets import and fetch nothing", () => {
    for (const css of [GLOBALS, DOOR_CSS]) expect(css).not.toMatch(/@import|@font-face|url\(\s*['"]?(https?:)?\/\//);
    const loads = findAll(door(), (e) => ["link", "script", "img", "iframe", "source", "video", "audio"].includes(e.tag));
    expect(loads.filter((e) => /^(https?:)?\/\//.test(e.attrs.src ?? e.attrs.href ?? ""))).toEqual([]);
  });
});
