/**
 * Independent verification of M-0015 (the framework pages; D-0017, D-0018,
 * SPEC §18.17), the rendering and behaviour lens: how /agreement, /projects
 * and /maintainers, the footer's three new links, /contract's new paragraph
 * and /privacy's new paragraph render, read and behave — in the test
 * renderer, in Next's own compiler, and over HTTP from a production build.
 * Written by an agent that did not build it, against 185bb67. The honesty
 * of the words and the claims scan are other verifiers'. Nothing in the
 * product code, the records or the existing tests is changed by this file.
 *
 * Stopping rule, declared before the first test was written. Seven areas,
 * each tried at least once:
 *
 * 1. PROPOSALS_EMAIL as read at request time: unset, empty, blank, the
 *    placeholder, not an address, a valid FICTIONAL address (padded and in
 *    mixed case), and values carrying "?", "&", "#", quotes, angle brackets
 *    and a newline — on /maintainers and /privacy, rendered here and served
 *    by `next start` from 185bb67's production build, one server per value;
 * 2. the copy as shipped: the production HTML of the three pages, /contract
 *    and /privacy against this renderer's, character by character, and
 *    every JSX text in those five files through Next's own compiler (SWC);
 * 3. structure: one h1, the outline, landmarks, labelled sections, lists,
 *    the dl/dt/dd pairs and the blockquote;
 * 4. links: names out of context, targets that exist, contrast in both
 *    themes, touch targets on a coarse pointer;
 * 5. the footer's nine links in order in every footer, and how they wrap
 *    (Chrome, 13px, every width from 240 to 600px in the footer's box);
 * 6. layout at 320 and 375px and on the desktop, light and dark, measured
 *    in Chrome on the production server (no sideways scroll; what wraps);
 * 7. SPEC §18.17 and M-0015's acceptance lines against the shipped pages,
 *    and what tests/framework-pages.test.ts would not notice if it broke.
 *
 * Each try ends here as a failing "DEFECT (SEVERITY): …" test or a passing
 * "closed: …" test, or, where only a server or a browser can see it, as a
 * measurement named in the test's title and given in full in the
 * verification report.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. It FAILS on
 *   185bb67, and the failure is the evidence. The scale is the one the
 *   M-0014 rendering verification used: HIGH, content hidden, broken or
 *   unusable; MEDIUM, wrong order or state, a page out of step with its
 *   acceptance line, or an accessibility failure under WCAG AA; LOW,
 *   polish (wraps, spacing, small tap targets).
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Every address here is FICTIONAL, at example.test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as agreementModule from "@/app/(public)/agreement/page";
import ContractPage from "@/app/(public)/contract/page";
import PublicLayout, { dynamic as layoutDynamic } from "@/app/(public)/layout";
import * as maintainersModule from "@/app/(public)/maintainers/page";
import PrivacyPage, { dynamic as privacyDynamic } from "@/app/(public)/privacy/page";
import * as projectsModule from "@/app/(public)/projects/page";
import { metadata as rootMetadata } from "@/app/layout";
import NotFound from "@/app/not-found";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { OPEN_CODE_URL, RightColumn, SiteFooter } from "@/components/RightColumn";
import { proposalsEmail } from "@/core/config";

const AgreementPage = agreementModule.default;
const ProjectsPage = projectsModule.default;
const MaintainersPage = maintainersModule.default;

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");

const FILES = {
  agreement: "src/app/(public)/agreement/page.tsx",
  projects: "src/app/(public)/projects/page.tsx",
  maintainers: "src/app/(public)/maintainers/page.tsx",
  contract: "src/app/(public)/contract/page.tsx",
  privacy: "src/app/(public)/privacy/page.tsx",
} as const;

/** The subjects SPEC §18.17 item 3 gives the two invitations. */
const PROPOSAL_SUBJECT = "A proposal for our.one";
const NEED_SUBJECT = "A need for our.one";

/** SPEC §18.17 item 4: every footer, in this order. */
const FOOTER: [string, string][] = [
  ["Contract", "/contract"],
  ["Agreement", "/agreement"],
  ["Projects", "/projects"],
  ["Build with us", "/maintainers"],
  ["Open code", OPEN_CODE_URL],
  ["Costs", "/costs"],
  ["Who controls what", "/power"],
  ["Rules", "/rules"],
  ["Privacy", "/privacy"],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ---------------------------------------------------------------- markup */

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&");
}

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

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

/** The text as a reader hears it: parts joined by spaces, as textOf does. */
function text(el: El): string {
  const parts: string[] = [];
  const walk = (n: El | string) => (typeof n === "string" ? parts.push(n) : n.children.forEach(walk));
  walk(el);
  return parts.join(" ").replace(/\s+/g, " ").replace(/ ([.,:;?!])/g, "$1").trim();
}

/** The text exactly as the markup has it: nothing added between tags, so a missing or doubled space shows. */
function exactText(el: El): string {
  const parts: string[] = [];
  const walk = (n: El | string) => (typeof n === "string" ? parts.push(n) : n.children.forEach(walk));
  walk(el);
  return parts.join("");
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

/** An element's classes as written in the source: a CSS module's `_page_73fd6d` is "page". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-f]{6}$/, "$1"))
    .join(" ");
}

const hasClass = (el: El, name: string) => moduleClass(el).split(" ").includes(name);
const hidden = (el: El) => el.attrs["aria-hidden"] === "true";
const anchors = (el: El) => findAll(el, (e) => e.tag === "a");
const mailtos = (el: El) => findAll(el, (e) => e.tag === "a" && (e.attrs.href ?? "").startsWith("mailto:"));

function render(component: FunctionComponent, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(component, props));
}

/** A page as it is served: inside the public layout, with its header and footer. */
function served(page: FunctionComponent): El {
  return parse(renderToStaticMarkup(createElement(PublicLayout, null, createElement(page))));
}

const article = (tree: El) => findAll(tree, (e) => e.tag === "article")[0]!;
const sectionOf = (tree: El, id: string) => closest(findAll(tree, (e) => e.attrs.id === id)[0]!, (e) => e.tag === "section")!;

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

/* ------------------------------------------------- Next's own compiler */

type SwcBindings = {
  transform: (source: string, options: object) => Promise<{ code: string }>;
  parse: (source: string, options: object) => Promise<string>;
};

let swc: Promise<SwcBindings> | null = null;

/** The SWC binding `next build` compiles the app with (this package's own Next, 16.2.7). */
function nextSwc(): Promise<SwcBindings> {
  if (!swc) {
    const load = createRequire(import.meta.url);
    const { loadBindings } = load("next/dist/build/swc/index.js") as { loadBindings: () => Promise<SwcBindings> };
    swc = loadBindings();
  }
  return swc;
}

async function compiled(source: string): Promise<string> {
  const b = await nextSwc();
  const out = await b.transform(source, {
    filename: "page.tsx",
    jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } }, target: "es2022" },
    minify: false,
  });
  return out.code;
}

/** The string children SWC emits on lines of their own, in order. */
async function emittedStrings(jsx: string): Promise<string[]> {
  const code = await compiled(`const x = ${jsx};`);
  return [...code.matchAll(/^\s*("(?:[^"\\]|\\.)*"),?$/gm)].map((m) => JSON.parse(m[1]!) as string);
}

type AstNode = { type?: string; children?: AstNode[]; raw?: string; value?: string };

/**
 * Every JSX text in a file that Next's compiler shortens: one that follows
 * an element or expression on the same line with a space, runs over more
 * than one line, and holds an HTML entity. SWC drops that space (shown in
 * the tests below); the JSX rule, and vitest's transform, keep it.
 */
async function textsSwcShortens(file: string): Promise<string[]> {
  const b = await nextSwc();
  const ast = JSON.parse(await b.parse(read(file), { syntax: "typescript", tsx: true })) as unknown;
  const hits: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as AstNode;
    if ((n.type === "JSXElement" || n.type === "JSXFragment") && Array.isArray(n.children)) {
      n.children.forEach((child, i) => {
        if (child.type !== "JSXText" || i === 0) return;
        const raw = child.raw ?? child.value ?? "";
        const first = raw.split("\n")[0]!;
        if (raw.includes("\n") && /&[a-zA-Z0-9#]+;/.test(raw) && /^[ \t]+\S/.test(first)) hits.push(first.trim());
      });
    }
    for (const value of Object.values(n)) walk(value);
  };
  walk(ast);
  return hits;
}

/* ============================================ 1. the setting, at request time */

describe("PROPOSALS_EMAIL, as each request reads it (D-0018 §D; SPEC §18.17 items 3 and 6)", () => {
  const OFF: (string | undefined)[] = [
    undefined,
    "",
    "   ",
    "[CONFIRM]",
    "[ confirm: which inbox ]",
    "not-an-address",
    "a@b",
    "proposals@example.test\nBcc: other@example.test",
    '"pro posals"@example.test',
    "proposals @example.test",
  ];

  it("closed: unset, empty, blank, the placeholder in any case, not an address, an address with a newline or a space in it — /maintainers says 'Proposals open at launch.' under 'Propose a service' and 'This opens at launch, too.' under 'Need something?', where the links would be, has no mailto link and shows none of the value, and /privacy says nothing about proposals (served the same by next start from 185bb67's build, one server per value: unset, '', '   ', '[CONFIRM]', 'not-an-address' and the newline value each gave both notices, no mailto and no address anywhere in the response, scripts included)", () => {
    for (const value of OFF) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      const label = JSON.stringify(value);
      expect(proposalsEmail(), label).toBeNull();
      const markup = render(MaintainersPage);
      const tree = parse(markup);
      expect(mailtos(tree), label).toEqual([]);
      expect(markup, label).not.toContain("mailto:");
      const propose = elements(sectionOf(tree, "maintainers-propose"));
      const need = elements(sectionOf(tree, "maintainers-need"));
      expect([moduleClass(propose.at(-1)!), text(propose.at(-1)!)], label).toEqual(["notice", "Proposals open at launch."]);
      expect([moduleClass(need.at(-1)!), text(need.at(-1)!)], label).toEqual(["notice", "This opens at launch, too."]);
      if (value?.trim()) expect(markup, label).not.toContain(value.trim());
      expect(markup, label).not.toMatch(/@example\.test/);
      expect(textOf(render(PrivacyPage)), label).not.toMatch(/proposal/i);
    }
  });

  it("closed: with an address set, padded or in mixed case, both invitations link to it exactly as configured, trimmed and with its case kept, each with its own subject, encoded so that it reads back as SPEC §18.17's words, at the end of its own section; no notice shows; and /privacy's paragraph names and links the same address (next start: 'proposals@example.test' and '  proposals@example.test  ' served both links as mailto:proposals@example.test?subject=A%20proposal%20for%20our.one and …A%20need%20for%20our.one, 'Proposals@Example.TEST' as written)", () => {
    const ON: [string, string][] = [
      ["proposals@example.test", "proposals@example.test"],
      ["  proposals@example.test  ", "proposals@example.test"],
      ["Proposals@Example.TEST", "Proposals@Example.TEST"],
    ];
    for (const [value, shown] of ON) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      const label = JSON.stringify(value);
      expect(proposalsEmail(), label).toBe(shown);
      const tree = parse(render(MaintainersPage));
      expect(text(tree), label).not.toContain("open at launch");
      const links = mailtos(tree);
      expect(links.map((a) => [a.attrs.href, text(a)]), label).toEqual([
        [`mailto:${shown}?subject=A%20proposal%20for%20our.one`, shown],
        [`mailto:${shown}?subject=A%20need%20for%20our.one`, shown],
      ]);
      expect(links.map((a) => new URL(a.attrs.href!).searchParams.get("subject")), label).toEqual([PROPOSAL_SUBJECT, NEED_SUBJECT]);
      expect(text(elements(sectionOf(tree, "maintainers-propose")).at(-1)!), label).toBe(`Send it to ${shown}.`);
      expect(text(elements(sectionOf(tree, "maintainers-need")).at(-1)!), label).toBe(`Write to ${shown}.`);
      const privacy = parse(render(PrivacyPage));
      const paragraph = findAll(privacy, (e) => e.tag === "p" && text(e).startsWith("If you email a proposal or a need"));
      expect(paragraph.map((p) => mailtos(p).map((a) => [a.attrs.href, text(a)])), label).toEqual([[[`mailto:${shown}`, shown]]]);
    }
  });

  it("closed: whatever the value holds, nothing gets into the markup: an angle bracket is shown as text and makes no element, a quote stays inside the href, and each link has only its href (next start with '<b>proposals@example.test': &lt;b&gt; in the text, no <b>)", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "<b>proposals@example.test");
    const angled = render(MaintainersPage);
    expect(angled).toContain("&lt;b&gt;proposals@example.test");
    expect(findAll(parse(angled), (e) => e.tag === "b")).toEqual([]);
    vi.stubEnv("PROPOSALS_EMAIL", 'pro"posals@example.test');
    const quoted = render(MaintainersPage);
    expect(quoted).toContain('href="mailto:pro&quot;posals@example.test?subject=A%20proposal%20for%20our.one"');
    for (const a of mailtos(parse(quoted))) expect(Object.keys(a.attrs)).toEqual(["href"]);
  });

  it("closed: the pages that read the setting render per request, so no build-time or cached copy can show another state: /maintainers and /privacy, and the public layout around /agreement and /projects, are force-dynamic, and those two pages set nothing that overrides it (next build at 185bb67 lists /agreement, /projects, /maintainers and /privacy as ƒ, dynamic; each response carries Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate and no x-nextjs-cache header)", () => {
    expect(maintainersModule.dynamic).toBe("force-dynamic");
    expect(privacyDynamic).toBe("force-dynamic");
    expect(layoutDynamic).toBe("force-dynamic");
    for (const mod of [agreementModule, projectsModule]) {
      const exported = mod as unknown as Record<string, unknown>;
      expect([exported.dynamic ?? "force-dynamic", exported.revalidate, exported.fetchCache]).toEqual(["force-dynamic", undefined, undefined]);
    }
  });

  it("DEFECT (LOW): PROPOSALS_EMAIL should become a link only if it is an email address, and then go to exactly that address with the subject as its one header — but proposalsEmail() takes anything without a space or a second @ (normEmail's /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/), and mailto() puts it into the link unencoded. 'proposals@example.test?bcc=other%40example.test&body=FICTIONAL' is shown as the address and gives both links a Bcc and a body and no subject; '<b>proposals@example.test' and 'pro\"posals@example.test' are not addresses and are linked; and a '#', which an address may hold, cuts each link to 'mailto:proposals' (all four served so by next start from 185bb67's build; /privacy's link too). The value is the founder's to set, so this bites only on a mistake, which M-0015 says should switch the feature off", () => {
    /** An address in RFC 5322's dot-atom form, with a host name for its domain. */
    const ADDRESS =
      /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
    // The reading is sound: the address the founder would set passes it, and so do its two links.
    expect(ADDRESS.test("proposals@example.test")).toBe(true);
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    const good = mailtos(parse(render(MaintainersPage))).map((a) => new URL(a.attrs.href!));
    expect(good.map((u) => [u.hash, decodeURIComponent(u.pathname), [...u.searchParams.keys()].join()])).toEqual([
      ["", "proposals@example.test", "subject"],
      ["", "proposals@example.test", "subject"],
    ]);
    const problems: string[] = [];
    for (const value of [
      "proposals@example.test?bcc=other%40example.test&body=FICTIONAL",
      "<b>proposals@example.test",
      'pro"posals@example.test',
      "proposals#x@example.test",
    ]) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      const email = proposalsEmail();
      const tree = parse(render(MaintainersPage));
      if (email === null) {
        if (mailtos(tree).length) problems.push(`${value}: off, but linked`);
        continue;
      }
      if (!ADDRESS.test(email)) problems.push(`${value}: not an address, shown and linked as one`);
      for (const a of mailtos(tree)) {
        const url = new URL(a.attrs.href!);
        const headers = [...url.searchParams.keys()];
        const to = decodeURIComponent(url.pathname);
        if (url.hash || to !== email || headers.join() !== "subject") {
          problems.push(`${value}: link goes to ${JSON.stringify(to)} with headers [${headers.join(", ")}]${url.hash ? ` and fragment ${url.hash}` : ""}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

/* ================================================ 2. the copy, as shipped */

describe("the copy as next build ships it (JSX whitespace)", () => {
  it("closed: the reading is sound — Next's compiler (SWC 16.2.7, the binding next build uses) drops the space before a JSX text that follows an element on the same line, runs over two lines and holds an entity; it keeps the space when the text has no entity or stays on one line", async () => {
    expect(await emittedStrings("<li><b>A</b> it&apos;s\n  here</li>")).toEqual(["it's here"]);
    expect(await emittedStrings("<li><b>A</b> it is\n  here&apos;s</li>")).toEqual(["it is here's"]);
    expect(await emittedStrings("<li><b>A</b> it is\n  here</li>")).toEqual([" it is here"]);
    expect(await emittedStrings("<li><b>A</b> it&apos;s here</li>")).toEqual([" it's here"]);
  });

  it("closed: /agreement, /projects, /maintainers and /contract hold no text that Next's compiler shortens, and their production HTML is this renderer's, character for character, tags and attributes alike, class names and React's empty comments aside (next start from 185bb67's build, with the address set and unset: 6,668, 1,113 and 2,152/2,137 characters of article text, and /contract's 2,323, identical); in this renderer no block on the three pages, nor /contract's or /privacy's new paragraph, runs a word into punctuation or into the next word, doubles a space, or puts one before punctuation — except the paired links in a .links row (/agreement 'Its project page' 'The contract', /projects 'The contract' 'The common agreement'), which have no text between them and are kept apart by the row's gap, as the front page's three links have been since M-0013", async () => {
    for (const file of [FILES.agreement, FILES.projects, FILES.maintainers, FILES.contract]) {
      expect([file, await textsSwcShortens(file)]).toEqual([file, []]);
    }
    const BLOCK = /^(p|li|dt|dd|h1|h2|h3|figcaption)$/;
    const check = (label: string, root: El) => {
      const isLeaf = (e: El) => BLOCK.test(e.tag) && findAll(e, (c) => BLOCK.test(c.tag)).length === 0;
      const leaves = isLeaf(root) ? [root] : findAll(root, isLeaf);
      expect(leaves.length, label).toBeGreaterThan(0);
      for (const leaf of leaves) {
        // A .links row is links side by side with nothing between them, kept apart by the row's gap.
        if (closest(leaf, (e) => hasClass(e, "links"))) continue;
        const words = exactText(leaf);
        expect([label, words, /[a-z][,;:!?][A-Za-z]|[a-z]\.[A-Z]|[a-z][A-Z]| {2,}| [.,;:!?]/.test(words)]).toEqual([label, words, false]);
      }
    };
    check("/agreement", article(parse(render(AgreementPage))));
    check("/projects", article(parse(render(ProjectsPage))));
    check("/maintainers, unset", article(parse(render(MaintainersPage))));
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    check("/maintainers, set", article(parse(render(MaintainersPage))));
    const contract = parse(render(ContractPage));
    check("/contract", closest(findAll(contract, (e) => e.tag === "a" && e.attrs.href === "/agreement")[0]!, (e) => e.tag === "p")!);
    const privacy = parse(render(PrivacyPage));
    check("/privacy", findAll(privacy, (e) => e.tag === "p" && text(e).startsWith("If you email a proposal"))[0]!);
  });

  it("DEFECT (LOW): /privacy should read 'If your account is suspended, you can't sign in to do either' in production as it does here — but next build ships 'If your account is suspended,you can't sign in…' (in the HTML next start serves from 185bb67's build, with the address set and unset, and on screen in Chrome; the only difference between the five pages' production HTML and this renderer's). Next's compiler drops the space after the bold words because the text after them runs over two lines and holds &apos;; vitest compiles JSX with its own transform, which keeps it, so no test in the suite can see it. The line is from a4c997f (M-0010); /privacy is a page M-0015 changed, and the same construct anywhere in it would go the same way", async () => {
    // What this renderer, and so every test, shows:
    expect(textOf(render(PrivacyPage))).toContain("If your account is suspended, you can't sign in to do either");
    // What next build emits for the same lines:
    const code = await compiled(read(FILES.privacy));
    const m = /children: "If your account is suspended,"\s*\}\),\s*("(?:[^"\\]|\\.)*")/.exec(code);
    const after = m ? (JSON.parse(m[1]!) as string) : null;
    expect(after === null || after.startsWith(" "), `SWC emits ${JSON.stringify(after)} after the bold words`).toBe(true);
    expect([FILES.privacy, await textsSwcShortens(FILES.privacy)]).toEqual([FILES.privacy, []]);
  });
});

/* ================================================== 3. structure */

describe("headings, landmarks, lists and the blockquote", () => {
  const OUTLINES: [string, FunctionComponent, string[]][] = [
    [
      "/agreement",
      AgreementPage,
      [
        "h1 The common agreement",
        "h2 What ownership means here",
        "h2 1. What the people who use a service get",
        "h2 2. What the people who build and run a service get",
        "h2 3. What they give up",
        "h2 4. Your data: the line nobody running a service crosses",
        "h3 The law",
        "h3 The agreement",
        "h3 No keys",
        "h3 Reach",
        "h3 Leave",
        "h3 The record",
        "h3 Custody",
        "h2 5. Two kinds of project",
        "h2 6. Money",
        "h2 7. How a service starts",
        "h2 8. The feed, the first project",
      ],
    ],
    ["/projects", ProjectsPage, ["h1 Projects", "h2 The feed, the first project", "h2 The next one"]],
    [
      "/maintainers",
      MaintainersPage,
      [
        "h1 Build the next one",
        "h2 What the job is",
        "h2 What you get",
        "h2 What you give up",
        "h2 Your users' data",
        "h2 Propose a service",
        "h2 Need something?",
        "h2 Where it stands today",
      ],
    ],
  ];

  it("closed: each page, served inside the public layout, has one h1 (its title), an outline that never skips a level, every section labelled by its own first heading, unique ids, and one banner, one main#main (the skip link's target), one footer and one navigation, 'About our.one'", () => {
    for (const [page, component, outline] of OUTLINES) {
      const tree = served(component);
      const headings = findAll(tree, (e) => /^h[1-6]$/.test(e.tag));
      expect(headings.map((h) => `${h.tag} ${text(h)}`), page).toEqual(outline);
      const levels = headings.map((h) => Number(h.tag[1]));
      expect(levels.every((l, i) => i === 0 || l <= levels[i - 1]! + 1), page).toBe(true);
      for (const section of findAll(tree, (e) => e.tag === "section")) {
        const first = elements(section)[0]!;
        expect([page, section.attrs["aria-labelledby"]], page).toEqual([page, first.attrs.id]);
        expect(/^h[23]$/.test(first.tag), page).toBe(true);
      }
      const ids = findAll(tree, (e) => "id" in e.attrs).map((e) => e.attrs.id!);
      expect(new Set(ids).size, page).toBe(ids.length);
      expect(findAll(tree, (e) => e.tag === "header").length, page).toBe(1);
      expect(findAll(tree, (e) => e.tag === "main").map((m) => m.attrs.id), page).toEqual(["main"]);
      expect(findAll(tree, (e) => e.tag === "footer").length, page).toBe(1);
      expect(findAll(tree, (e) => e.tag === "nav").map((n) => n.attrs["aria-label"]), page).toEqual(["About our.one"]);
    }
  });

  it("closed: every dl is dt then dd, in pairs, none empty; every ul and ol holds only li; the blockquote holds one paragraph, the definition (/agreement: the seven safeguards' What/Today and the two kinds of project; /projects: the seven facts about the feed)", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    for (const [page, component] of OUTLINES) {
      const root = article(parse(render(component)));
      for (const dl of findAll(root, (e) => e.tag === "dl")) {
        const kids = elements(dl);
        expect(kids.length % 2, page).toBe(0);
        kids.forEach((k, i) => {
          expect([page, k.tag], text(dl)).toEqual([page, i % 2 === 0 ? "dt" : "dd"]);
          expect(text(k).length, page).toBeGreaterThan(0);
        });
      }
      for (const list of findAll(root, (e) => e.tag === "ul" || e.tag === "ol")) {
        expect(list.children.every((c) => typeof c !== "string" && c.tag === "li"), page).toBe(true);
      }
    }
    const quotes = findAll(article(parse(render(AgreementPage))), (e) => e.tag === "blockquote");
    expect(quotes).toHaveLength(1);
    expect(elements(quotes[0]!).map((e) => e.tag)).toEqual(["p"]);
    expect(text(quotes[0]!)).toMatch(/^Owned by its users means: /);
  });

  it("closed: the three titles, through the root layout's template, are 'The common agreement · our.one', 'Projects · our.one' and 'Build the next one · our.one' (served so by next start)", () => {
    const template = (rootMetadata.title as { template: string }).template;
    const titles = [agreementModule.metadata, projectsModule.metadata, maintainersModule.metadata].map((m) =>
      template.replace("%s", String(m.title)),
    );
    expect(titles).toEqual(["The common agreement · our.one", "Projects · our.one", "Build the next one · our.one"]);
  });

  it("DEFECT (LOW): the list of the seven safeguards should keep its list semantics — it is a ul whose stylesheet takes the bullets away (.items { list-style: none }) without role=\"list\", and WebKit then gives VoiceOver no list at all, where 'list, 7 items' would say how many there are (WebKit's known behaviour; not measured here). The site's own pattern for an unstyled list is role=\"list\" (globals.css: ul[role=\"list\"]; SettingsLinks, /settings/blocked)", () => {
    const data = sectionOf(parse(render(AgreementPage)), "agreement-data");
    const list = findAll(data, (e) => e.tag === "ul" && elements(e).length === 7)[0]!;
    expect(findAll(list, (e) => e.tag === "h3").map((h) => text(h))).toEqual(["The law", "The agreement", "No keys", "Reach", "Leave", "The record", "Custody"]);
    const bulletsGone = declared(list, "list-style") === "none" || declared(list, "list-style-type") === "none";
    expect([bulletsGone, list.attrs.role ?? null]).not.toEqual([true, null]);
  });

  it("DEFECT (LOW): the definition's blockquote should be styled as the page's, like the front page's (.pledgeWords { margin: 0 }) — no rule reaches it, so the browser's 40px on each side apply: in Chrome at 320px it is 208px of the 288px column, a ten-line bold block indented on both sides with no rule or mark to say why (measured on next start, 185bb67)", () => {
    const quote = findAll(article(parse(render(AgreementPage))), (e) => e.tag === "blockquote")[0]!;
    const margin = ["margin", "margin-inline", "margin-left", "margin-inline-start"].map((p) => declared(quote, p)).find(Boolean);
    expect(margin, "a margin for the blockquote, from any rule").toBeDefined();
  });
});

/* ========================================================= 4. links */

describe("the links on the new pages", () => {
  /** Every route the app serves, from its files: a route group adds nothing to the path, [x] is one segment. */
  function routes(): RegExp[] {
    const out: RegExp[] = [];
    const walk = (dir: string, segments: string[]) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name]);
        } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
          const path = segments.map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
          out.push(new RegExp(`^/${path}$`));
        }
      }
    };
    walk(join(WEB_ROOT, "src/app"), []);
    return out;
  }

  it("closed: every internal link on the three pages, in their header and footer, and /contract's new one resolves to a route the app has; the only external one, Open code, opens in a new tab with rel=\"noopener noreferrer\", and no internal one does (next start: /agreement, /projects, /maintainers, /contract, /costs, /power, /rules, /privacy, /signin and / each 200, an unknown path 404)", () => {
    const known = routes();
    expect(known.some((r) => r.test("/agreement"))).toBe(true);
    expect(known.some((r) => r.test("/no-such-page"))).toBe(false);
    const trees = [served(AgreementPage), served(ProjectsPage), served(MaintainersPage), parse(render(ContractPage))];
    const hrefs = new Set<string>();
    for (const tree of trees) {
      for (const a of anchors(tree)) {
        const href = a.attrs.href ?? "";
        if (href.startsWith("mailto:")) continue;
        if (/^https?:/.test(href)) {
          expect([href, a.attrs.target, a.attrs.rel]).toEqual([OPEN_CODE_URL, "_blank", "noopener noreferrer"]);
          continue;
        }
        expect(a.attrs.target, href).toBeUndefined();
        hrefs.add(href.replace(/[?#].*$/, ""));
      }
    }
    expect([...hrefs].sort()).toEqual(["/", "/agreement", "/contract", "/costs", "/maintainers", "/power", "/privacy", "/projects", "/rules", "/signin"]);
    for (const href of hrefs) expect([href, known.some((r) => r.test(href))]).toEqual([href, true]);
  });

  it("DEFECT (MEDIUM): the new pages' links should meet 4.5:1 against the page, and those inside a sentence should be told from it by more than colour (an underline, or 3:1 against the words) — they are the shared link blue, --accent #1d9bf0, with no underline: 3.00:1 on white in light (WCAG 1.4.3), and inside sentences 2.46:1 against the text in dark and 2.04:1 against the muted 'Today:' line in light (1.4.1); measured the same in Chrome on next start. That is every link in the three pages' bodies — the two invitations to email among them — /contract's new 'common agreement' and /privacy's new address. M-0014's rendering round found the same blue on the invite page's new link (MEDIUM) and gave it the text colour, underlined", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    // The reading is sound: it finds the muted 'Today:' line's colour, and white and black behind the page.
    const muted = elements(parse('<article class="page"><p class="heldBy">Today: words</p></article>'))[0]!;
    expect(colourOf(elements(muted)[0]!, "light")).toBe(tokens("light")["--muted"]);
    expect([backgroundOf(muted, "light"), backgroundOf(muted, "dark")]).toEqual(["#ffffff", "#000000"]);
    const contract = parse(render(ContractPage));
    const privacy = parse(render(PrivacyPage));
    const links: [string, El][] = [
      ...anchors(article(parse(render(AgreementPage)))).map((a) => ["/agreement", a] as [string, El]),
      ...anchors(article(parse(render(ProjectsPage)))).map((a) => ["/projects", a] as [string, El]),
      ...anchors(article(parse(render(MaintainersPage)))).map((a) => ["/maintainers", a] as [string, El]),
      ["/contract", anchors(contract).find((a) => a.attrs.href === "/agreement")!],
      ["/privacy", mailtos(privacy).find((a) => a.attrs.href === "mailto:proposals@example.test")!],
    ];
    // On 185bb67: /agreement 3, /projects 4, /maintainers 4 (the two invitations among them), /contract 1, /privacy 1.
    expect(links.length).toBeGreaterThanOrEqual(13);
    expect(links.every(([, a]) => a !== undefined)).toBe(true);
    const problems: string[] = [];
    for (const [page, a] of links) {
      const inline = a.parent!.children.some((c) => typeof c === "string" && c.trim().length > 0);
      for (const scheme of ["light", "dark"] as const) {
        const onPage = contrast(colourOf(a, scheme), backgroundOf(a, scheme));
        if (onPage < 4.5) problems.push(`${page} "${text(a)}" ${scheme}: ${onPage}:1 on the page`);
        if (inline && !underlined(a)) {
          const besideWords = contrast(colourOf(a, scheme), colourOf(a.parent!, scheme));
          if (besideWords < 3) problems.push(`${page} "${text(a)}" ${scheme}: ${besideWords}:1 against the words around it, no underline`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("DEFECT (LOW): on a touch screen the paired links ('Its project page' and 'The contract' on /agreement; 'The contract' and 'The common agreement' on /projects) should be 44px targets (SPEC §9) — they reuse the front page's .links row, whose (pointer: coarse) rule takes the gap away (gap: 0 20px) because the front page's own links (.more) grow to 44px there; these have no such rule, so each is 22.5px tall and they touch (Chrome, 375×812 with touch: 343×22.5px each, the first's bottom the second's top), under WCAG 2.5.8's 24px too", () => {
    // The reading is sound: it finds the front page's link rule.
    expect(touchTarget(anchors(parse('<a class="more" href="/">x</a>'))[0]!)).toBe(".more { padding: 12px }");
    const problems: string[] = [];
    for (const [page, component] of [
      ["/agreement", AgreementPage],
      ["/projects", ProjectsPage],
    ] as const) {
      for (const row of findAll(article(parse(render(component))), (e) => hasClass(e, "links"))) {
        for (const a of anchors(row)) if (!touchTarget(a)) problems.push(`${page} "${text(a)}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("DEFECT (LOW): a link's name should say where it goes when it is read out of its paragraph, as a screen reader's list of links reads it — /agreement's 'Its project page' (the feed's) leans on the heading above it", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    const names = [AgreementPage, ProjectsPage, MaintainersPage].flatMap((c) => anchors(article(parse(render(c)))).map((a) => text(a)));
    expect(names.length).toBeGreaterThan(10);
    expect(names.filter((n) => /^(its|it|this|that|here|click|more)\b/i.test(n))).toEqual([]);
  });
});

/* ======================================================= 5. the footer */

describe("the footer's nine links (SPEC §18.17 item 4)", () => {
  it("closed: in the public layout, the not-found page, the in-app footer and the app's right column, the footer is one navigation, 'About our.one', with the nine links in SPEC's order and the eight separators hidden from screen readers; only Open code opens a new tab (next start: the same nine on every public page)", () => {
    const BODY = createElement("p", null, "FICTIONAL page body");
    const places: [string, string][] = [
      ["the public layout", renderToStaticMarkup(createElement(PublicLayout, null, BODY))],
      ["the not-found page", render(NotFound)],
      ["the in-app footer", render(InAppSiteFooter)],
      ["the right column", renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 }))],
    ];
    for (const [place, html] of places) {
      const navs = findAll(parse(html), (e) => e.tag === "nav");
      expect(navs.map((n) => n.attrs["aria-label"]), place).toEqual(["About our.one"]);
      const nav = navs[0]!;
      expect(anchors(nav).map((a) => [text(a), a.attrs.href]), place).toEqual(FOOTER);
      expect(anchors(nav).filter((a) => a.attrs.target).map((a) => text(a)), place).toEqual(["Open code"]);
      const separators = findAll(nav, (e) => e.tag === "span");
      expect(separators.map((s) => [hidden(s), text(s)]), place).toEqual(Array.from({ length: 8 }, () => [true, "·"]));
    }
  });

  it("DEFECT (LOW): the footer should wrap between its links, never inside one or before a separator — nothing keeps a link's words together and each separator starts with a breakable space, so with nine links (six before M-0015) names split across lines: 'Open code' at 375px, the most common phone width; 'Who controls what' from 492 to 552px; 'Build with us' and 'Who controls what' both in the app's right column at 1000–1099px (258px); and at 392px a line starts with '·' (Chrome, 13px, every 20px or less from 240 to 600px of the footer's box, laid out in the server's stylesheets; with the six links before M-0015 only 'Who controls what' split, at 320px and in the right column)", () => {
    const nav = findAll(parse(render(SiteFooter)), (e) => e.tag === "nav")[0]!;
    const problems: string[] = [];
    for (const a of anchors(nav)) {
      if (/ /.test(exactText(a)) && declared(a, "white-space") !== "nowrap") problems.push(`"${text(a)}" can break inside its name`);
    }
    const separators = findAll(nav, (e) => e.tag === "span" && hidden(e));
    if (separators.some((s) => /^ /.test(exactText(s)))) problems.push("a line can start with the separator '·'");
    expect(problems).toEqual([]);
  });
});

/* ================================================ 6. layout (Chrome) */

describe("layout at phone and desktop widths", () => {
  it("closed: nothing on the three pages is held to one line or a fixed width — the body breaks long words, the facts list goes to one column at 420px and the paired links to one column at 460px (Chrome on next start, 185bb67, light and dark: no sideways scroll on /agreement, /projects or /maintainers at 320, 375 or 1280px, and no element past the window's edge, 18 of 18; the address link 168px wide at 320px)", () => {
    expect(declarations(BASE.find((r) => r.selectors.includes("body"))!.body)["overflow-wrap"]).toBe("break-word");
    const at = (query: string, selector: string) => RULES.find((r) => r.media === query && r.selectors.includes(selector));
    expect(declarations(at("(max-width: 420px)", ".facts")!.body)["grid-template-columns"]).toBe("1fr");
    expect(declarations(at("(max-width: 460px)", ".links")!.body)["flex-direction"]).toBe("column");
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    for (const component of [AgreementPage, ProjectsPage, MaintainersPage]) {
      const root = article(parse(render(component)));
      const held = findAll(root, (e) => (declared(e, "white-space") ?? "").includes("nowrap") || /\d+px/.test(declared(e, "width") ?? ""))
        // One word kept whole (a .nowrap span, as the front page's card has) can't push the page sideways.
        .filter((e) => /\s/.test(text(e)));
      expect(held.map((e) => `${e.tag}.${moduleClass(e)}`)).toEqual([]);
    }
  });

  it("DEFECT (LOW): 'not-for-profit' should not break at its hyphens, as the front page's card keeps it whole (.nowrap) — on /agreement (twice) and /projects it is plain text, and in Chrome at 320px both pages break it at a hyphen, 'a not-' / 'for-profit body' on /agreement and 'a not-for-' / 'profit body' on /projects (next start, 185bb67; M-0014 fixed this in the card and accepted it only in the status line)", () => {
    expect(declarations(BASE.find((r) => r.selectors.includes(".nowrap"))!.body)["white-space"]).toBe("nowrap");
    const problems: string[] = [];
    for (const [page, component] of [
      ["/agreement", AgreementPage],
      ["/projects", ProjectsPage],
    ] as const) {
      const root = article(parse(render(component)));
      // The word with ordinary hyphens, or with non-breaking ones (U+2011).
      const holders = findAll(root, (e) => e.children.some((c) => typeof c === "string" && /not[-\u2011]for[-\u2011]profit/.test(c)));
      expect(holders.length, page).toBeGreaterThan(0);
      for (const h of holders) {
        const breakable = h.children.some((c) => typeof c === "string" && c.includes("not-for-profit"));
        if (breakable && !hasClass(h, "nowrap")) problems.push(`${page}: <${h.tag}> "${text(h).slice(0, 50)}…"`);
      }
    }
    expect(problems).toEqual([]);
  });
});

/* =========================================== 7. SPEC §18.17 and M-0015 */

describe("the shipped pages against SPEC §18.17 and M-0015's acceptance lines", () => {
  it("DEFECT (MEDIUM): every part of /agreement should say what holds it today — D-0018 §B ('Each part says what holds it today'), M-0015's acceptance ('every part has a \"Today:\" line') and the page's own notice ('each part says what holds it today') — but Part 3, 'What they give up', and Part 6, 'Money', have no Today line at all, so the notice says something about the page that isn't so. tests/framework-pages.test.ts checks the Today lines of Part 1's rights and Part 4's safeguards only", () => {
    const root = article(parse(render(AgreementPage)));
    const parts = findAll(root, (e) => e.tag === "section")
      .map((s) => [text(elements(s)[0]!), text(s)] as const)
      .filter(([heading]) => /^\d+\. /.test(heading));
    expect(parts.map(([heading]) => heading.slice(0, 2))).toEqual(["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8."]);
    expect(parts.filter(([, words]) => !/\bToday\b/.test(words)).map(([heading]) => heading)).toEqual([]);
  });

  it("DEFECT (LOW): the agreement should open with its status — SPEC §18.17 item 1, 'First comes the notice', and M-0015's acceptance, 'the lede says the agreement is being developed and that none of its collective rights is in force' — but the first paragraph under the h1 is a lede that says neither ('The terms every service on our.one will run under…'), and the notice comes second. tests/framework-pages.test.ts only checks that the notice comes before the definition, which it would still do anywhere in the first section", () => {
    const kids = elements(article(parse(render(AgreementPage))));
    expect(kids[0]!.tag).toBe("h1");
    const first = kids[1]!;
    const name = `${first.tag}.${moduleClass(first)}: ${text(first).slice(0, 40)}…`;
    expect([name, /being developed/i.test(text(first))]).toEqual([name, true]);
  });

  it("DEFECT (LOW): /agreement's 'Today:' line for how a service starts should follow PROPOSALS_EMAIL, as D-0018 §D has the pages do — with the setting empty /maintainers says 'Proposals open at launch.' while /agreement still says 'Today: proposals are read by hand.', two pages in two states (both served so by next start with the setting unset)", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "");
    expect(textOf(render(MaintainersPage))).toContain("Proposals open at launch.");
    expect(textOf(render(AgreementPage))).not.toMatch(/Today: proposals are read by hand/);
  });
});
