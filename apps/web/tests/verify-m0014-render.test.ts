/**
 * Independent verification of M-0014 (the reason, and the invitation;
 * D-0016, SPEC §18.16), the rendering lens: how the amended front page,
 * the invite page and the longer status line lay out and read, in both
 * themes, for a screen reader, a keyboard and a thumb. Written by an agent
 * that did not build it, against dcff190 (the build; its records are
 * a414663, and the state before both is bfd587b). The words and the claims
 * scan are another verifier's. Nothing in the product code, the records or
 * the existing tests is changed by this file.
 *
 * Stopping rule, declared before the first test was written. Six areas,
 * each tried at least once at the widths and in the states named:
 *
 * 1. the front page's layout at 320, 390, 768, 899, 900, 1024 and 1440px,
 *    light and dark: sideways scroll and overlap; below 900px the order
 *    headline, lede, joining, picture, card; from 900px the left stack
 *    (hero, joining, card) centred beside the picture with even gaps and
 *    the card under joining; the first phone screen (390×844); lone words
 *    and awkward wraps in the new text;
 * 2. every state: joining open and closed × the count null, 0, 1 and
 *    1,284 × the seats null, 0 and 5;
 * 3. accessibility: the heading outline; what is hidden from screen
 *    readers; link names and targets (#front-get-in, #front-runs, and the
 *    invite page's /#front-runs); new tabs; reading and focus order from
 *    900px; contrast of the new text in both themes; tap targets of the
 *    new links on touch screens;
 * 4. the status line wherever it shows: the public footer at 320–1440px,
 *    the app's right column, /power's lede, /costs and /rules;
 * 5. the invite page, signed out, joining open and closed, at 390 and
 *    1280px;
 * 6. how dcff190 adapted tests/verify-m0013-render.test.ts.
 *
 * Each try ends here as a failing "DEFECT (SEVERITY): …" test or a passing
 * "closed: …" test, or, where only a browser's layout can see it, as a
 * measurement in the verification report: Chrome on the development server
 * (http://localhost:3310/), every width from 320 to 1480px in 2px steps in
 * both themes; the states the server was not in, the invite page and the
 * app's right column were rendered as here and laid out in the server's
 * own stylesheets. Area 6 is a reading of the diff, also in the report.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. It FAILS on
 *   dcff190, and the failure is the evidence. HIGH: content hidden, broken
 *   or unusable; MEDIUM: wrong order or state, or an accessibility failure
 *   under WCAG AA; LOW: polish (wraps, spacing, small tap targets).
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Everyone here is FICTIONAL, with an example.test address.
 *
 * After the round (the architect, D-0016 §N and SPEC §18.16 "Decisions
 * after the verification"; this file was committed as written first, in
 * d56f8fc): the invite page's link now has the card's link style
 * (`.pledgeLink`), so both DEFECTs were fixed and renamed "fixed (…)"; the
 * one assertion that named the old class points at the new one (and,
 * after the re-check, D-0016 §O, the link's touch rule reads its 44px
 * min-height, which the helper reports before the padding). The
 * browser-only findings are in the verification report: lone last words
 * (fixed where the browser supports `text-wrap`), "not-for-profit" at its
 * hyphen (fixed in the card, accepted in the status line), and the
 * not-found page's footer (fixed).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
// The phone's post rows ask for the router; nothing navigates here.
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
// Server actions are rendered as form targets, never called.
vi.mock("@/app/(public)/seat-actions", () => ({ takeSeat: vi.fn(async () => ({ ok: true })) }));

import InvitePage from "@/app/(public)/i/[code]/page";
import CostsPage from "@/app/(public)/costs/page";
import PublicLayout from "@/app/(public)/layout";
import PowerPage from "@/app/(public)/power/page";
import RulesPage from "@/app/(public)/rules/page";
import NotFound from "@/app/not-found";
import { PREVIEW_CAPTION } from "@/components/public/FeedPreview";
import {
  CLOSE_HEADING,
  CLOSE_LINE,
  countLine,
  FREE_LINE,
  FrontPage,
  type FrontPageProps,
  REASON,
  REASON_LEAD,
} from "@/components/public/FrontPage";
import { JOIN_LABEL, WAITING_LIST_LABEL } from "@/components/public/join";
import { LEDE } from "@/components/public/lede";
import { RightColumn, STATUS_LINE } from "@/components/RightColumn";
import { createInvite } from "@/core/invites";
import { db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");
/** The front page's block of public.module.css: everything before the contract's. */
const FRONT_CSS = PUBLIC_CSS.slice(
  0,
  PUBLIC_CSS.indexOf("/* --------------------------------------------------------------- contract */"),
);

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

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

/** The first 30 characters, enough to tell the page's parts apart. */
const head = (s: string) => s.slice(0, 30);

/** A small tree of React's static markup, enough to ask what is inside what. */
type El = { tag: string; attrs: Record<string, string>; children: (El | string)[]; parent: El | null };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [], parent: null };
  let current = root;
  const token =
    /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
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

function closest(el: El, test: (e: El) => boolean): El | null {
  for (let e: El | null = el; e; e = e.parent) if (test(e)) return e;
  return null;
}

const elements = (el: El) => el.children.filter((c): c is El => typeof c !== "string");

/** An element's classes as written in the source: a CSS module's `_fold_73fd6d` is "fold". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-f]{6}$/, "$1"))
    .join(" ");
}

const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);
const hidden = (el: El) => el.attrs["aria-hidden"] === "true";
const focusable = (e: El) =>
  (/^(a|button|select|textarea)$/.test(e.tag) || (e.tag === "input" && e.attrs.type !== "hidden") || "tabindex" in e.attrs) &&
  !("disabled" in e.attrs);

function renderFront(props: Partial<FrontPageProps> = {}): string {
  return renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, ...props }));
}

/* ------------------------------------------------------------------- CSS */

/** A rule as the stylesheet writes it, with the @media it sits in. */
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
      else if (!head.startsWith("@"))
        out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner, order: start + out.length });
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

/** `tag.class.class`, with no pseudo-class, attribute or combinator but the descendant one. */
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

/** SPEC §9's tokens as globals.css sets them, for one theme. */
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

/** The colour an element's text is drawn in: its own rule, or the nearest ancestor's (body: --text). */
function colourOf(el: El, scheme: "light" | "dark"): string {
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) {
    const value = declared(e, "color");
    if (value && value !== "inherit") return resolveColour(value, scheme);
  }
  return resolveColour("var(--text)", scheme);
}

/** The background behind an element: the nearest one set, or the page's (--bg). */
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

/**
 * The rule that gives an element a 44px target on a touch screen (SPEC §9),
 * the ways this site does it: padding-block of 12px or more around a line
 * (.more, .pledgeLink), a min-height of 44px, or a ::after hit area (.btn).
 */
function touchTarget(el: El): string | null {
  for (const r of RULES.filter((x) => x.media !== null && /pointer:\s*coarse/.test(x.media))) {
    const d = declarations(r.body);
    for (const s of r.selectors) {
      const pseudo = /::?(?:after|before)$/.test(s);
      if (!selectorMatches(el, s.replace(/::?(?:after|before)$/, ""))) continue;
      if (pseudo && d.inset && d.content !== "none") return `${s} { inset: ${d.inset} }`;
      if (parseFloat(d["min-height"] ?? "0") >= 44) return `${s} { min-height: ${d["min-height"]} }`;
      const pad = d["padding-block"] ?? d["padding-top"] ?? d.padding;
      if (pad && parseFloat(pad) >= 12) return `${s} { padding: ${pad} }`;
    }
  }
  return null;
}

/* ============================================================ the first screen */

describe("the first screen's order (D-0016 §D; SPEC §18.16 item 1, 'The order')", () => {
  it("closed: in every state the first screen's four parts are, in the markup, the headline and lede, joining, the picture, then the card; and below 900px nothing reorders them (no order, grid placement or reversed flow outside the 900px query), so a phone shows them in that order (measured in Chrome at every width from 320 to 898px in 2px steps, both themes, with a seat open, with none open and with joining closed: never out of order, never overlapping, never wider than the window)", () => {
    for (const joining of [true, false]) {
      for (const seatsOpen of [null, 0, 5]) {
        const fold = findAll(parse(renderFront({ joining, seatsOpen })), (e) => hasClass(e, "fold"))[0]!;
        const parts = elements(fold).map((e) => `${e.tag}.${moduleClass(e)}`);
        expect(parts, JSON.stringify({ joining, seatsOpen })).toEqual(["header.hero", "section.getIn", "figure.preview", "figure.pledge"]);
        const [hero, getIn, preview, pledge] = elements(fold);
        expect(findAll(hero!, (e) => e.tag === "h1").length + findAll(hero!, (e) => hasClass(e, "lede")).length).toBe(2);
        expect(findAll(getIn!, (e) => e.attrs.id === "front-get-in")).toHaveLength(1);
        expect(findAll(preview!, (e) => hasClass(e, "phone"))).toHaveLength(1);
        expect(findAll(pledge!, (e) => e.tag === "blockquote")).toHaveLength(1);
      }
    }
    // Below 900px: the four parts are never placed, and the fold is one column in source order.
    const below900 = cssRules(FRONT_CSS).filter((r) => r.media === null || !/min-width:\s*900px/.test(r.media));
    const PARTS = [".hero", ".getIn", ".preview", ".fold > .preview", ".pledge"];
    for (const r of below900) {
      const d = declarations(r.body);
      const where = r.selectors.join(", ");
      if (r.selectors.some((s) => PARTS.includes(s))) {
        for (const property of ["order", "grid-area", "grid-row", "grid-column", "position"]) {
          expect([where, property, d[property]]).toEqual([where, property, undefined]);
        }
      }
      if (r.selectors.includes(".fold")) {
        for (const property of ["grid-template-areas", "grid-template-columns", "grid-auto-flow", "flex-direction"]) {
          expect([where, property, d[property]]).toEqual([where, property, undefined]);
        }
      }
    }
  });

  it("closed: from 900px one grid puts the headline and lede, joining and the card in consecutive rows on the left, in that order, and the picture on the right across all five rows; the empty first and last rows are both 1fr and there is one row gap, so the left stack is centred with even gaps (measured in Chrome at every width from 900 to 1480px in 2px steps, both themes, with a seat open, with none open and with joining closed: always within 1px of the centre of the picture with its caption, 0px at 900, 1024, 1280 and 1440px; gaps 24px and 24px; the card always under joining)", () => {
    const at900 = cssRules(FRONT_CSS).filter((r) => r.media !== null && /min-width:\s*900px/.test(r.media));
    const fold = declarations(at900.find((r) => r.selectors.includes(".fold"))!.body);
    expect(fold["grid-template-columns"]).toBe("minmax(0, 1fr) 340px");
    expect(fold["grid-template-rows"]).toBe("1fr auto auto auto 1fr");
    const areas = [...(fold["grid-template-areas"] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!.trim().split(/\s+/));
    expect(areas).toEqual([
      [".", "preview"],
      ["hero", "preview"],
      ["getIn", "preview"],
      ["pledge", "preview"],
      [".", "preview"],
    ]);
    // One row gap for every row: the gaps between the three on the left are even.
    expect(fold.gap).toMatch(/^\d+px \d+px$/);
    const placed = Object.fromEntries(
      at900.flatMap((r) => r.selectors.map((s) => [s, declarations(r.body)["grid-area"]] as const)).filter(([, area]) => area),
    );
    expect(placed).toEqual({ ".hero": "hero", ".getIn": "getIn", ".pledge": "pledge", ".fold > .preview": "preview" });
    // Each part is centred in its own area, and the three on the left share one width limit.
    expect(declarations(cssRules(FRONT_CSS).find((r) => r.selectors.includes(".fold"))!.body)["align-items"]).toBe("center");
    for (const part of [".hero", ".getIn", ".pledge"]) {
      expect(declarations(BASE.find((r) => r.selectors.includes(part) && r.order >= 100_000)!.body)["max-width"], part).toBe("600px");
    }
  });

  it("closed: from 900px the picture sits between joining and the card in the markup but on the right on screen; it holds nothing a keyboard can reach and its phone is hidden, so focus goes from joining's last control straight to the card's link, as the eye reads the left column, and a screen reader hears only the picture's name and caption between them", () => {
    for (const joining of [true, false]) {
      for (const seatsOpen of [null, 0]) {
        const fold = findAll(parse(renderFront({ joining, seatsOpen })), (e) => hasClass(e, "fold"))[0]!;
        const preview = elements(fold)[2]!;
        expect(findAll(preview, focusable)).toEqual([]);
        const order = findAll(fold, focusable).map((e) => `${e.tag} ${e.attrs.type ?? text(e)}`);
        expect(order, JSON.stringify({ joining, seatsOpen })).toEqual(
          joining ? ["input email", "button submit", "a Privacy", "a How that works"] : ["a How that works"],
        );
        expect(preview.attrs["aria-label"]).toBe("What our.one looks like");
        const heard = elements(preview).filter((e) => !hidden(e));
        expect(heard.map((e) => `${e.tag} ${text(e)}`)).toEqual([`figcaption ${PREVIEW_CAPTION}`]);
      }
    }
  });
});

/* ============================================================ every state */

describe("every state renders (FrontPage's props, as the route passes them)", () => {
  const SEAT_LINE = "No seats are open right now. Seats go to whoever has waited longest.";
  const OUTLINE = [
    "h1 Just your people. Then you're done.",
    "h2 Join our.one",
    "h2 Where did your friends go?",
    "h2 How it works",
    "h3 Join",
    "h3 Bring your people",
    "h3 Catch up, then close it",
    "h2 Keep your people. Change who runs it.",
    "h2 Fair questions",
  ];

  it("closed: joining open and closed × the count null, 0, 1 and 1,284 × the seats null, 0 and 5 — one h1 and the outline in order with no level skipped; the joining heading 'Join our.one' hidden only visually whatever the button says; the button 'Join the waiting list' only with no seat open and 'Join our.one' otherwise; the close's link with the button's words; the seat line only with no seat open, between the form and the free line; the reason first under its heading; the close only while joining; and no stray value, empty element, duplicate id or dangling reference", () => {
    for (const joining of [true, false]) {
      for (const count of [null, 0, 1, 1284]) {
        for (const seatsOpen of [null, 0, 5]) {
          const label = JSON.stringify({ joining, count, seatsOpen });
          const html = renderToStaticMarkup(createElement(FrontPage, { joining, count, seatsOpen })).replace(
            /<script\b[^>]*>[\s\S]*?<\/script>/g,
            "",
          );
          const tree = parse(html);
          const all = textOf(html);

          const headings = findAll(tree, (e) => /^h[1-6]$/.test(e.tag));
          expect(headings.map((h) => `${h.tag} ${text(h)}`), label).toEqual(
            joining ? [...OUTLINE, `h2 ${CLOSE_HEADING}`] : OUTLINE,
          );
          const levels = headings.map((h) => Number(h.tag[1]));
          expect(levels.every((l, i) => i === 0 || l <= levels[i - 1]! + 1), label).toBe(true);
          const joinHeading = findAll(tree, (e) => e.attrs.id === "front-get-in")[0]!;
          expect([joinHeading.tag, joinHeading.attrs.class, text(joinHeading)], label).toEqual(["h2", "visually-hidden", JOIN_LABEL]);

          const buttonWords = joining && seatsOpen === 0 ? WAITING_LIST_LABEL : JOIN_LABEL;
          const buttons = findAll(tree, (e) => e.tag === "button");
          expect(buttons.map((b) => `${b.attrs.type} ${text(b)}`), label).toEqual(joining ? [`submit ${buttonWords}`] : []);
          const close = findAll(tree, (e) => e.attrs.href === "#front-get-in");
          expect(close.map((a) => `${moduleClass(a)} ${text(a)}`), label).toEqual(
            joining ? [`btn btn--primary btn--large ${buttonWords}`] : [],
          );
          expect(html.includes('id="front-close"'), label).toBe(joining);
          expect(all.includes(CLOSE_LINE), label).toBe(joining);

          expect(all.includes(SEAT_LINE), label).toBe(joining && seatsOpen === 0);
          if (joining && seatsOpen === 0) {
            const getIn = closest(joinHeading, (e) => e.tag === "section")!;
            const order = elements(getIn).map((e) => (e.tag === "div" ? "form" : text(e).slice(0, 16)));
            expect(order, label).toEqual([JOIN_LABEL, "form", SEAT_LINE.slice(0, 16), FREE_LINE.slice(0, 16), "We'll email you "]);
          }

          const runs = closest(findAll(tree, (e) => e.attrs.id === "front-runs")[0]!, (e) => e.tag === "section")!;
          const [runsHeading, reason] = elements(runs);
          expect(runsHeading?.attrs.id, label).toBe("front-runs");
          expect(hasClass(reason!, "reason"), label).toBe(true);
          expect(elements(reason!).map((p) => `${p.tag}.${moduleClass(p)} ${text(p)}`), label).toEqual([
            `p.reasonLead ${REASON_LEAD}`,
            `p.reasonText ${REASON}`,
          ]);
          const counts = all.match(/Nobody is in yet\.|\d[\d,]* (?:person is|people are) in\./g) ?? [];
          expect(counts, label).toHaveLength(count === null ? 0 : 1);
          if (count !== null) expect(all, label).toContain(countLine(count));

          expect(all, label).not.toMatch(/\bundefined\b|\bNaN\b|\bnull\b|\[object /);
          expect(html, label).not.toMatch(/<(p|h[1-6]|li|dt|dd|a|button|figcaption|blockquote|label)\b[^>]*>\s*<\/\1>/);
          expect(html, label).not.toMatch(/class=""|class="undefined"|class="[^"]*\bundefined\b/);
          const ids = findAll(tree, (e) => "id" in e.attrs).map((e) => e.attrs.id!);
          expect(new Set(ids).size, label).toBe(ids.length);
          for (const e of findAll(tree, (x) => "aria-labelledby" in x.attrs)) {
            expect(ids, `${label}: ${e.attrs["aria-labelledby"]}`).toContain(e.attrs["aria-labelledby"]);
          }
          for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) expect(ids, `${label}: #${target}`).toContain(target);
        }
      }
    }
  });
});

/* ===================================================== screen reader, keyboard */

describe("what a screen reader and a keyboard get", () => {
  it("closed: what is hidden from screen readers is exactly the decoration, now with the phone before the card's initial — the phone, the initial R, the 7%, the two small phones and the three step numbers — none of it a link, control, heading or caption; and none of the new text (the card, the reason, the close's line) is hidden", () => {
    for (const joining of [true, false]) {
      const tree = parse(renderFront({ joining }));
      const roots = findAll(tree, (e) => hidden(e) && !closest(e.parent!, hidden) && e.tag !== "svg");
      expect(
        roots.map((e) => `${e.tag}.${moduleClass(e).split(" ")[0]} ${text(e).slice(0, 12).trim()}`),
        `joining: ${joining}`,
      ).toEqual([
        // Changed after the verification of M-0020 (H2): the phone shows the app as it is: the header (the wordmark, its dot a span of its own, and the four places), then the feed's own bar.
        "div.phone our. one The",
        "span.pledgeFace R",
        "p.stat 7%",
        "div.mini Home Sponsor",
        // Changed after the verification of M-0020 (H2): the illustration's our.one side names its feed Feed.
        "div.mini Feed M Mara",
        "span.stepNumber 1",
        "span.stepNumber 2",
        "span.stepNumber 3",
      ]);
      for (const root of roots) {
        expect(findAll(root, (e) => /^(a|button|input|select|textarea|form|h[1-6]|figcaption)$/.test(e.tag))).toEqual([]);
      }
      const newText = [REASON_LEAD, REASON, ...(joining ? [CLOSE_LINE] : []), "Until then, I hold all three."];
      for (const words of newText) {
        const holders = findAll(tree, (e) => e.children.some((c) => typeof c === "string" && c.includes(words)));
        expect(holders.length, words).toBeGreaterThan(0);
        for (const h of holders) expect(closest(h, hidden), words).toBeNull();
      }
    }
  });

  it("closed: every link on the front page has a name; the in-page links land on the h2s they name (#front-runs, and #front-get-in with the button's words in both seat states); every external link, the new 2025 source among them, opens in a new tab with rel=\"noopener noreferrer\", and no internal one does (measured in Chrome at 390 and 1440px: each in-page link puts its target at the top of the window, 0px; after the close's link the form is in view, its field 26px from the top, and the next Tab stop is that field)", () => {
    for (const seatsOpen of [null, 0, 5]) {
      const tree = parse(renderFront({ seatsOpen }));
      const anchors = findAll(tree, (e) => e.tag === "a");
      for (const a of anchors) {
        const href = a.attrs.href ?? "";
        expect((a.attrs["aria-label"] ?? text(a)).length, href).toBeGreaterThan(1);
        if (/^https?:/.test(href)) expect([href, a.attrs.target, a.attrs.rel]).toEqual([href, "_blank", "noopener noreferrer"]);
        else expect(a.attrs.target, href).toBeUndefined();
        if (href.startsWith("#")) expect(findAll(tree, (e) => e.attrs.id === href.slice(1))[0]?.tag, href).toBe("h2");
      }
      expect(anchors.filter((a) => a.attrs.href?.startsWith("#")).map((a) => `${text(a)} → ${a.attrs.href}`)).toEqual([
        "How that works → #front-runs",
        `${seatsOpen === 0 ? WAITING_LIST_LABEL : JOIN_LABEL} → #front-get-in`,
      ]);
      expect(
        anchors.filter((a) => a.attrs.href === "https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/"),
      ).toHaveLength(1);
    }
  });

  it("closed: the focus ring is the global 2px --accent outline, nothing on the front page removes it, and it meets 3:1 against the page in both themes", () => {
    expect(GLOBALS).toMatch(/\n:focus-visible \{\s*outline: 2px solid var\(--accent\);\s*outline-offset: 2px;\s*\}/);
    expect(FRONT_CSS).not.toMatch(/\n\s*outline(?:-[\w]+)?\s*:/);
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens(scheme);
      expect(contrast(t["--accent"]!, t["--bg"]!), scheme).toBeGreaterThanOrEqual(3);
    }
  });
});

/* =========================================================== new text, both themes */

describe("the new text in both themes (SPEC §9 tokens, read through the cascade)", () => {
  it("closed: the reason's two lines, the close's line and question, the seat line and the card's longer words are drawn in --text on the page (or on the card), 13.14:1 in light and 15.07:1 in dark (13.86:1 on the dark card), in our.one's tokens since M-0020", () => {
    // Retitled after the verification of M-0020 (H13): the title says what the body checks now.
    const tree = parse(renderFront({ seatsOpen: 0 }));
    const pick = (name: string) => findAll(tree, (e) => hasClass(e, name))[0]!;
    const close = findAll(tree, (e) => e.attrs.id === "front-close")[0]!;
    const seen: Record<string, number> = {};
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens(scheme);
      for (const [name, el] of [
        ["reasonLead", pick("reasonLead")],
        ["reasonText", pick("reasonText")],
        ["closeLine", pick("closeLine")],
        ["close question", close],
        ["seat line", pick("seats")],
        ["card", pick("pledgeWords")],
      ] as const) {
        expect([name, colourOf(el, scheme)]).toEqual([name, t["--text"]]);
        const ratio = contrast(colourOf(el, scheme), backgroundOf(el, scheme));
        seen[`${scheme} ${name}`] = ratio;
        expect([scheme, name, ratio >= 4.5]).toEqual([scheme, name, true]);
      }
    }
    // Changed under M-0020 (D-0023 §A): our.one's tokens replace X's at the root.
    expect(seen["light reasonText"]).toBe(13.14);
    expect(seen["dark reasonText"]).toBe(15.07);
    expect(seen["dark card"]).toBe(13.86);
  });
});

/* ====================================================== the status line, everywhere */

describe("the status line wherever it stands (D-0016 §J; SPEC §18.16 item 8)", () => {
  const BODY = createElement("p", null, "FICTIONAL page body");
  const places: [string, () => string][] = [
    ["the public footer", () => renderToStaticMarkup(createElement(PublicLayout, null, BODY))],
    ["the not-found page", () => renderToStaticMarkup(createElement(NotFound))],
    // Changed after the verification of M-0020 (H11): the in-app footer is gone; the app's panel (RightColumn) carries its one footer, at every width.
    ["the app's right column", () => renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 }))],
    ["/power", () => renderToStaticMarkup(createElement(PowerPage))],
    ["/costs", () => renderToStaticMarkup(createElement(CostsPage))],
    ["/rules", () => renderToStaticMarkup(createElement(RulesPage))],
  ];

  it("closed: it renders once in each place as a paragraph of its own, and nothing between it and the page can clip it: no nowrap, ellipsis, line clamp, hidden overflow or fixed height on it or any box around it, and words break when they must (measured in Chrome at every width from 320 to 1480px on /, /power, /costs and /rules in both themes, and on /privacy: never wider than its box, never cut, no sideways scroll; 3 lines at 390px in the footer, 2 from 768px; /power's lede 3 lines at 600px); since M-0020 the app's panel is 320px wide beside the column from 1000px and follows it below that, its footer's text box the panel's less 4px each side", () => {
    // Retitled after the verification of M-0020 (H13): the title says what the body checks now.
    // Every rule at any width that reaches the line or a box around it, not only the one that wins.
    const clipping = (body: string) =>
      Object.entries(declarations(body))
        .filter(
          ([p, v]) =>
            (p === "white-space" && /nowrap|pre/.test(v)) ||
            (/^overflow(?:-[xy])?$/.test(p) && /hidden|clip/.test(v)) ||
            (p === "height" && /\d/.test(v)) ||
            /line-clamp$/.test(p) ||
            p === "text-overflow",
        )
        .map(([p, v]) => `${p}: ${v}`);
    // The reading is sound: it catches the site's own clipping utility.
    const truncated = elements(parse('<p class="truncate">FICTIONAL</p>'))[0]!;
    expect(RULES.filter((r) => r.selectors.some((s) => selectorMatches(truncated, s))).flatMap((r) => clipping(r.body))).toEqual([
      "overflow: hidden",
      "text-overflow: ellipsis",
      "white-space: nowrap",
    ]);
    for (const [place, render] of places) {
      const tree = parse(render());
      const lines = findAll(tree, (e) => e.tag === "p" && text(e) === STATUS_LINE);
      expect([place, lines.length]).toEqual([place, 1]);
      for (let e: El | null = lines[0]!; e && e.tag !== "#root"; e = e.parent) {
        const box = e;
        const clips = RULES.filter((r) => r.selectors.some((s) => selectorMatches(box, s))).flatMap((r) =>
          clipping(r.body).map((c) => `${r.selectors.join(", ")} { ${c} }`),
        );
        expect([place, `${e.tag}.${moduleClass(e)}`, clips]).toEqual([place, `${e.tag}.${moduleClass(e)}`, []]);
      }
    }
    expect(declarations(BASE.find((r) => r.selectors.includes("body"))!.body)["overflow-wrap"]).toBe("break-word");
    // Changed under M-0020 (D-0023 §B, §D): the panel is 320px beside the
    // column from 1000px, and follows it below that; the footer's text box
    // is the panel's less 4px each side.
    const at = (query: string) => RULES.find((r) => r.media === query && r.selectors.includes(".aside"))!;
    // Changed after the verification of M-0020 (R11): the panel scrolls on its own on a short screen; its
    // 8px each side, taken back by its margins, keep the focus rings uncut, and its content stays 320px.
    const panel = declarations(at("(min-width: 1000px)").body);
    expect([panel.flex, panel.padding, panel["margin-inline"]]).toEqual(["0 0 336px", "0 8px 32px", "-8px"]);
    expect(declarations(BASE.find((r) => r.selectors.includes(".site-footer"))!.body).padding).toBe("0 4px");
  });
});

/* ===================================================== the invite page, signed out */

describe("the invite page, signed out (D-0016 §I; SPEC §18.16 item 7)", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** The invite page for a fresh invite from Anna, as a signed-out visitor sees it, inside the public layout. */
  async function invitePage(): Promise<El> {
    const anna = await makeAccount({ handle: "anna_inv", displayName: "Anna FICTIONAL", email: "anna_inv@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    const page = (await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement;
    return parse(renderToStaticMarkup(createElement(PublicLayout, null, page)));
  }

  const promiseLink = (tree: El) => findAll(tree, (e) => e.tag === "a" && text(e) === "The promise behind our.one");

  it("closed: joining open and closed, the page reads in order — the inviter's picture (hidden), the one h1 naming the inviter, the front page's lede, then the form, 'Free to join.' with its link, and the way to sign in; while closed the notice takes the form's place and no 'Free to join.' is shown; the new line is a small muted paragraph of its own in the same 24px stack, and the status line closes the footer (measured in Chrome, laid out in the server's stylesheets at 390px dark and 1280px light: the new line on one line, 24px under the form and 24px over the next line, no sideways scroll)", async () => {
    const HEADING = "Anna FICTIONAL (@anna_inv) invited you to connect on our.one";
    const SIGN_IN = "Already on our.one? Sign in, then open this link again.";
    const open = await invitePage();
    const main = findAll(open, (e) => e.tag === "main")[0]!;
    const stack = findAll(main, (e) => e.tag === "section")[0]!;
    expect(moduleClass(stack)).toBe("stack stack--lg");
    expect(elements(stack).map((e) => `${e.tag}${hidden(e) ? " (hidden)" : ""} ${head(text(e))}`)).toEqual([
      "span (hidden) AF",
      `h1 ${head(HEADING)}`,
      `p ${head(LEDE)}`,
      `form ${head("Your email We'll email you a link to join. Send me a link")}`,
      `p ${head("Free to join. The promise behind our.one")}`,
      `p ${head(SIGN_IN)}`,
    ]);
    expect(text(elements(stack)[4]!)).toBe("Free to join. The promise behind our.one");
    expect(moduleClass(elements(stack)[4]!)).toBe("muted small");
    expect(findAll(open, (e) => /^h[1-6]$/.test(e.tag)).map((h) => `${h.tag} ${text(h)}`)).toEqual([`h1 ${HEADING}`]);
    expect(text(findAll(open, (e) => e.tag === "footer")[0]!).endsWith(STATUS_LINE)).toBe(true);
    expect(promiseLink(open)).toHaveLength(1);

    await reset();
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const closed = await invitePage();
    const closedStack = findAll(findAll(closed, (e) => e.tag === "main")[0]!, (e) => e.tag === "section")[0]!;
    expect(elements(closedStack).map((e) => `${e.tag}${hidden(e) ? " (hidden)" : ""} ${head(text(e))}`)).toEqual([
      "span (hidden) AF",
      `h1 ${head(HEADING)}`,
      `p ${head(LEDE)}`,
      `p ${head("our.one isn't open for new accounts yet.")}`,
      `p ${head(SIGN_IN)}`,
    ]);
    expect(promiseLink(closed)).toEqual([]);
    expect(textOf(renderToStaticMarkup(createElement(FrontPage, { joining: false, count: null, seatsOpen: null })))).not.toContain(
      "The promise behind our.one",
    );
  });

  it("closed: 'The promise behind our.one' is an internal link with a name and no new tab, to /#front-runs, and the front page has that heading in every state a signed-out visitor can meet (measured in Chrome: Next's client navigation to it from another public page at 390px, and a full load of /#front-runs at 1280px, both put the heading at the top of the window, 0px)", async () => {
    const link = promiseLink(await invitePage())[0]!;
    // Changed after the verification of M-0017: the section on who runs it moved
    // to /feed with the front page's words (D-0020 §B), and the link with it.
    expect([link.attrs.href, link.attrs.target, link.attrs.rel]).toEqual(["/feed#front-runs", undefined, undefined]);
    for (const joining of [true, false]) {
      for (const count of [null, 0]) {
        const tree = parse(renderToStaticMarkup(createElement(FrontPage, { joining, count, seatsOpen: null })));
        const target = findAll(tree, (e) => e.attrs.id === "front-runs");
        expect(target.map((h) => `${h.tag} ${text(h)}`)).toEqual(["h2 Keep your people. Change who runs it."]);
      }
    }
  });

  it("closed: the new line's words, 'Free to join.', are --muted on the page: 5.79:1 in light and 7.93:1 in dark, in our.one's tokens since M-0020, at 13px", async () => {
    // Retitled after the verification of M-0020 (H13): the title says what the body checks now.
    const line = closest(promiseLink(await invitePage())[0]!, (e) => e.tag === "p")!;
    expect(declared(line, "font-size")).toBe("13px");
    const ratios = (["light", "dark"] as const).map((scheme) => contrast(colourOf(line, scheme), backgroundOf(line, scheme)));
    // Changed under M-0020 (D-0023 §A): our.one's tokens replace X's at the root.
    expect(ratios).toEqual([5.79, 7.93]);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (MEDIUM)): the invite page's new link 'The promise behind our.one' should meet 4.5:1 against the page, and be told from the muted words beside it by more than colour (an underline, or 3:1 against them) — it is the shared link blue, --accent, with no underline: 3.00:1 on white at 13px, and 2.04:1 (light) and 1.53:1 (dark) against 'Free to join.' (WCAG 1.4.3 and 1.4.1; measured the same in Chrome). The front page's own links are drawn in the text colour and underlined for this reason (.more, .pledgeLink); the prior round accepted this blue only for 'Privacy', older than its build, and this link is new in this one", async () => {
    // The reading is sound: it finds the front page's links in the text colour and underlined,
    // and the accepted 'Privacy' in the link blue at 3.00:1.
    const front = parse(renderFront());
    const byText = (words: string) => findAll(front, (e) => e.tag === "a" && text(e) === words)[0]!;
    for (const words of ["How that works", "Read the contract"]) {
      // Changed under M-0020 (D-0023 §A): our.one's tokens replace X's at the root.
      expect([words, colourOf(byText(words), "light"), underlined(byText(words))]).toEqual([words, "#222b24", true]);
    }
    expect(contrast(colourOf(byText("Privacy"), "light"), backgroundOf(byText("Privacy"), "light"))).toBe(4.74);

    const link = promiseLink(await invitePage())[0]!;
    const around = link.parent!;
    const found: string[] = [];
    for (const scheme of ["light", "dark"] as const) {
      const fg = colourOf(link, scheme);
      const onPage = contrast(fg, backgroundOf(link, scheme));
      const besideWords = contrast(fg, colourOf(around, scheme));
      found.push(`${scheme}: ${onPage} on the page, ${besideWords} against the words beside it, underlined: ${underlined(link)}`);
      expect([scheme, "on the page", onPage >= 4.5], found.join("; ")).toEqual([scheme, "on the page", true]);
      expect([scheme, "told apart", underlined(link) || besideWords >= 3], found.join("; ")).toEqual([scheme, "told apart", true]);
    }
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): on a touch screen the invite page's new link should be a 44px target (SPEC §9, '44px minimum touch targets on mobile'; the front page gives its own text links one under @media (pointer: coarse)) — it is 13px text on a 17.55px line with no rule for a coarse pointer (measured in Chrome at 390px with touch emulation: 169×15px)", async () => {
    // The reading is sound: it finds the front page's own touch rules for its text links.
    const front = parse(renderFront());
    const byText = (words: string) => findAll(front, (e) => e.tag === "a" && text(e) === words)[0]!;
    // Since the re-check (D-0016 §O) the card's link class carries min-height: 44px, which the helper reports first.
    expect(touchTarget(byText("How that works"))).toBe(".pledgeLink { min-height: 44px }");
    expect(touchTarget(byText("Read the contract"))).toBe(".more { padding: 12px }");

    const link = promiseLink(await invitePage())[0]!;
    // The card's link style since D-0016 §N (it was the shared .link on dcff190).
    expect(moduleClass(link)).toBe("pledgeLink");
    expect(touchTarget(link), "a (pointer: coarse) rule that gives the link 44px").not.toBeNull();
    expect(touchTarget(link)).toBe(".pledgeLink { min-height: 44px }");
  });
});
