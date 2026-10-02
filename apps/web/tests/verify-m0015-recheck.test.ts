/**
 * The re-check of M-0015 (the framework pages), after the two independent
 * verifications (1a8904c honesty, e811913 rendering) and their fixes
 * (6af7d29, 328f3c0). Written by an agent that built none of it, against
 * 328f3c0. It changes no product code, no record and no other test.
 *
 * Stopping rule, declared before the first test was written, and the one the
 * build declared in advance: this is the last round. After it, each finding
 * here is fixed or recorded, and nothing is re-verified again. Four areas:
 *
 * 1. the 29 findings: each "fixed:" test and each adapted check, read for
 *    whether the fix holds or was only made to pass, and whether an
 *    adaptation weakened what the original test proved;
 * 2. the fixes' side effects on pages M-0015 did not build: the `.page a`
 *    restyle (/contract, /rules, /privacy, /costs, /power, /unsubscribe; the
 *    front page and the invite page), the footer's no-break separators, the
 *    claims scan's four new rules (false positives, trivial variants, their
 *    reasons), /agreement against /privacy and /power under each
 *    configuration, and the stricter PROPOSALS_EMAIL rule;
 * 3. every sentence the fixes reworded on /agreement, /projects and
 *    /maintainers, against the records and the other pages;
 * 4. M-0015's acceptance lines, all nine, against the shipped code.
 *
 * - "DEFECT: (SEVERITY) …" asserts what should be true. Its first assertions
 *   check the records and pages it relies on, which pass; its last one FAILS
 *   on 328f3c0, and that failure is the evidence. It passes once fixed.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Where only a server could see it, the measurement is in the test's title:
 * `next build` of 328f3c0, then `next start` on ports 3317 (a controller and
 * PROPOSALS_EMAIL set), 3318 (PROPOSALS_EMAIL set, no controller) and 3319
 * (a controller, no PROPOSALS_EMAIL), all FICTIONAL, stopped afterwards.
 *
 * Everyone here is FICTIONAL, at example.test.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgreementPage from "@/app/(public)/agreement/page";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import RulesPage from "@/app/(public)/rules/page";
import NotFound from "@/app/not-found";
import { HEADLINE } from "@/components/public/FrontPage";
import { MAINTAINER, NOTICE_DAYS, THRESHOLD } from "@/components/public/handover";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { LEDE } from "@/components/public/lede";
import { RightColumn, SiteFooter } from "@/components/RightColumn";
import { ALLOWLIST, formatHit, PROHIBITED, scanRepoPublicText, scanText } from "@/core/claims";
import { proposalsEmail } from "@/core/config";

/* ------------------------------------------------------------- helpers */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WEB = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

const AGREEMENT_FILE = "src/app/(public)/agreement/page.tsx";
const PROJECTS_FILE = "src/app/(public)/projects/page.tsx";
const MAINTAINERS_FILE = "src/app/(public)/maintainers/page.tsx";

/** A record as a reader reads it: markdown emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Visible text of rendered HTML: every tag a space, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

/** The text of each <dd> after a <dt> with this label, in order. */
function ddAfter(markup: string, label: string): string[] {
  const out: string[] = [];
  for (const m of markup.matchAll(new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`, "g"))) out.push(textOf(m[1]!));
  return out;
}

/** /agreement's sections, by their aria-labelledby id. */
function sectionsOf(markup: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of markup.matchAll(/<section aria-labelledby="([a-z-]+)">([\s\S]*?)<\/section>/g)) out.set(m[1]!, m[2]!);
  return out;
}

/** The <li> texts of one /agreement section. */
function itemsOf(section: string): string[] {
  return [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]!));
}

/** Part 1's seven rights, each with its "Today:" line, as rendered under the current settings. */
const userRights = () => itemsOf(sectionsOf(render(AgreementPage)).get("agreement-users") ?? "");

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const renderedHits = (html: string, file: string | null) =>
  [...scanText(html, file), ...scanText(textOf(html), file)].map(formatHit);

/** The three settings the servers were started with (FICTIONAL). */
const CONFIGS: Record<string, Record<string, string>> = {
  "a controller and PROPOSALS_EMAIL": {
    DATA_CONTROLLER: "FICTIONAL Controller",
    DATA_CONTROLLER_EMAIL: "controller@example.test",
    PROPOSALS_EMAIL: "proposals@example.test",
  },
  "PROPOSALS_EMAIL without a controller": {
    DATA_CONTROLLER: "",
    DATA_CONTROLLER_EMAIL: "",
    PROPOSALS_EMAIL: "proposals@example.test",
  },
  "a controller, no PROPOSALS_EMAIL": {
    DATA_CONTROLLER: "FICTIONAL Controller",
    DATA_CONTROLLER_EMAIL: "controller@example.test",
    PROPOSALS_EMAIL: "",
  },
};

function configure(env: Record<string, string>): void {
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------- markup tree and the cascade */

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
  const go = (n: El | string) => (typeof n === "string" ? parts.push(n) : n.children.forEach(go));
  go(el);
  return parts.join(" ").replace(/\s+/g, " ").replace(/ ([.,:;?!])/g, "$1").trim();
}

function exactText(el: El): string {
  const parts: string[] = [];
  const go = (n: El | string) => (typeof n === "string" ? parts.push(n) : n.children.forEach(go));
  go(el);
  return parts.join("");
}

function findAll(el: El, test: (e: El) => boolean): El[] {
  const out: El[] = [];
  const go = (n: El) => {
    for (const c of n.children) {
      if (typeof c === "string") continue;
      if (test(c)) out.push(c);
      go(c);
    }
  };
  go(el);
  return out;
}

/** An element's classes as the source writes them: a CSS module's `_page_73fd6d` is "page". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-f]{6}$/, "$1"))
    .join(" ");
}

const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");

type CssRule = { media: string | null; selectors: string[]; body: string; order: number };

function cssRules(css: string, start = 0): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: CssRule[] = [];
  const go = (s: string, media: string | null) => {
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
      if (head.startsWith("@media")) go(inner, head.replace(/^@media\s*/, ""));
      else if (!head.startsWith("@")) out.push({ media, selectors: head.split(",").map((x) => x.trim()), body: inner, order: start + out.length });
      i = j;
    }
  };
  go(source, null);
  return out;
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/!important/, "").trim()]),
  );
}

/** Module CSS loads after the global sheet (served so: globals' chunk first, the module's second). */
const RULES: CssRule[] = [...cssRules(GLOBALS), ...cssRules(PUBLIC_CSS, 100_000)];
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

/** The value the cascade gives this element for one property, and the selector that gives it. */
function winner(el: El, property: string): { value: string; selector: string } | undefined {
  let found: { value: string; selector: string; spec: number; order: number } | undefined;
  for (const r of BASE) {
    const value = declarations(r.body)[property];
    if (value === undefined) continue;
    for (const s of r.selectors) {
      if (!selectorMatches(el, s)) continue;
      const spec = specificity(s);
      if (!found || spec > found.spec || (spec === found.spec && r.order >= found.order)) found = { value, selector: s, spec, order: r.order };
    }
  }
  return found;
}

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
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) {
    const value = winner(e, "color")?.value;
    if (value && value !== "inherit") return resolveColour(value, scheme);
  }
  return resolveColour("var(--text)", scheme);
}

function backgroundOf(el: El, scheme: "light" | "dark"): string {
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) {
    const value = winner(e, "background-color")?.value ?? winner(e, "background")?.value;
    if (value && value !== "transparent" && value !== "none") return resolveColour(value, scheme);
  }
  return resolveColour("var(--bg)", scheme);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/* ------------------------------------------------- Next's own compiler */

type AstNode = { type?: string; children?: AstNode[]; raw?: string; value?: string };
type SwcBindings = { parse: (source: string, options: object) => Promise<string> };
let swc: Promise<SwcBindings> | null = null;

function nextSwc(): Promise<SwcBindings> {
  if (!swc) {
    const load = createRequire(import.meta.url);
    const { loadBindings } = load("next/dist/build/swc/index.js") as { loadBindings: () => Promise<SwcBindings> };
    swc = loadBindings();
  }
  return swc;
}

/**
 * Every JSX text Next's compiler shortens (the rendering verification's
 * reading, shown there to be sound): one that follows an element or an
 * expression on the same line with a space, runs over more than one line,
 * and holds an HTML entity.
 */
async function textsSwcShortens(file: string): Promise<string[]> {
  const b = await nextSwc();
  const ast = JSON.parse(await b.parse(read(file), { syntax: "typescript", tsx: true })) as unknown;
  const hits: string[] = [];
  const go = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(go);
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
    for (const value of Object.values(n)) go(value);
  };
  go(ast);
  return hits;
}

/* ============================================================= defects */

describe("defects (each FAILS on 328f3c0)", () => {
  it("fixed: (MEDIUM) /agreement and /projects end the founder's holding of the feed when the holder exists ('the founder holds it until the holder exists', 'Until the holder exists, the founder keeps the feed's'), while /contract holds the domain, the data and the keys 'Until 100,000 members' and, if that is never reached, says 'Nothing is handed over'; D-0017 §K.4 and D-0018's 'Still open' leave moving the feed to the holder before 100,000 undecided ('That would amend D-0012 §B and contract promise 2'). The holder is set up at the first funded service (D-0017 §E), which can come first. The words are D-0018 §A's, so this is the founder's reading to make: each such sentence should say it is still open, or bound the holding as the contract does. The never-reached sentence the honesty round added ('none of it goes to that body') is narrower than D-0012 §B's 'nothing is handed over', and leaves room for the same reading", () => {
    // The records: the holder's sentence, the open question, and the contract's bound.
    expect(record("decisions/D-0018.md")).toContain("the founder holds it until the holder exists.");
    expect(record("decisions/D-0018.md")).toContain("moving identity and connections before 100,000;");
    expect(record("decisions/D-0017.md")).toContain(
      "Whether the feed's identity and connections move to the holder before 100,000. That would amend D-0012 §B and contract promise 2.",
    );
    expect(record("decisions/D-0017.md")).toContain("The holder is set up when the first service is funded by its users.");
    expect(record("decisions/D-0012.md")).toContain(
      "Before the threshold, the maintainer holds the domain, the database and the registrar and deploy keys",
    );
    expect(record("decisions/D-0012.md")).toContain("If the threshold is never reached, nothing is handed over and nothing is sold.");
    const contract = textOf(render(ContractPage));
    expect(contract).toContain(`Until ${THRESHOLD} members I also hold the domain, the data and the keys`);
    expect(contract).toContain(`If it never gets to ${THRESHOLD} Nothing is handed over.`);
    // The pages: every sentence that bounds the founder's holding by the holder.
    // (On 328f3c0: four, three on /agreement and one on /projects, beside
    // "If that count is never reached, none of it goes to that body".)
    const problems: string[] = [];
    for (const [page, component] of [
      ["/agreement", AgreementPage],
      ["/projects", ProjectsPage],
    ] as const) {
      const bound = sentences(textOf(render(component))).filter((s) => /\bfounder\b/.test(s) && /\buntil the holder exists\b/i.test(s));
      for (const s of bound) {
        if (!new RegExp(`\\bstill open\\b|\\bnot (?:yet )?decided\\b|\\bundecided\\b|${THRESHOLD}`).test(s)) problems.push(`${page}: ${s}`);
      }
    }
    // The defect: none of them says it is open or gives the contract's bound.
    expect(problems).toEqual([]);
  });

  it("fixed: (MEDIUM) the claims scan's fix for ownership catches the verifier's nine examples and misses their one-word variants: 'owned by its own users', 'owned by the feed's users', 'owned by our.one's users', 'Its users now own it.', 'Its users, together, own it.' (the definition's own phrasing), 'The people who use the feed own it.', 'The users are its true owners.'; and D-0018 §E's sentences in another form pass anywhere, /agreement included ('We call the feed owned by its own users.', 'Owned by its own users means: …'). SPEC §18.17 item 7 says that 'Everywhere else, and in any other form, they are caught'; honesty 8 was the same class ('a word … inserted'), rated MEDIUM", () => {
    // Changed after the fix: SPEC no longer claims "any other form" (a pattern can't), only the forms the tests try.
    expect(record("apps/web/SPEC.md")).toContain("Everywhere else, and in the other forms the tests try, they are caught.");
    expect(record("apps/web/SPEC.md")).toContain("The claims scan now catches ownership in the active voice and in quotes");
    // The verifier's forms are caught: the fix holds for what was shown.
    for (const claim of [
      "Its users own it.",
      "The people who use it own it.",
      "The users are its owners.",
      "The feed is owned by all its users.",
      "The feed is “owned” by its users.",
    ]) {
      expect(scanText(claim, PROJECTS_FILE).length, claim).toBeGreaterThan(0);
    }
    const missed: string[] = [];
    for (const claim of [
      "The feed is owned by its own users.",
      "The feed is owned by the feed's users.",
      "The feed is owned by our.one's users.",
      "Its users now own it.",
      "Its users, together, own it.",
      "The people who use the feed own it.",
      "The users are its true owners.",
    ]) {
      if (scanText(claim, PROJECTS_FILE).length === 0) missed.push(claim);
    }
    for (const claim of ["We call the feed owned by its own users.", "Owned by its own users means: its users decide its rules."]) {
      for (const file of [AGREEMENT_FILE, PROJECTS_FILE]) {
        if (scanText(claim, file).length === 0) missed.push(`${file}: ${claim}`);
      }
    }
    expect(missed).toEqual([]);
  });

  it("fixed: (LOW) the new handover and income rules miss trivial variants of the forms they were written for: 'have gone to the holder', 'were given to the holder' and 'now belong to the holder' (the members' rule lists 'gone' and 'given', and 'now belongs to' its members; the holder's rule lists neither), and 'You'll get paid.', 'You will get paid.' and 'You're guaranteed an income.' beside the caught 'You'll be paid.' and 'guaranteed income'", () => {
    for (const caught of [
      "Its name, its data and its funds went to the holder.",
      "Its domain has gone to its members.",
      "Its domain was given to its members.",
      "Its domain now belongs to its members.",
      "You'll be paid.",
      "Guaranteed income for maintainers.",
    ]) {
      expect(scanText(caught, MAINTAINERS_FILE).length, caught).toBeGreaterThan(0);
    }
    const missed = [
      "Its name, its data and its funds have gone to the holder.",
      "Its name, its data and its funds were given to the holder.",
      "Its name, its data and its funds now belong to the holder.",
      "You'll get paid.",
      "You will get paid.",
      "You're guaranteed an income.",
    ].filter((claim) => scanText(claim, MAINTAINERS_FILE).length === 0);
    expect(missed).toEqual([]);
  });

  it("fixed: (LOW) a new rule's reason misstates D-0017 §B: the active-voice ownership rule says 'none of its rights is in force', where D-0017 §B says 'None of the collective rights is in force on our.one yet' and /agreement shows two rights in force on the feed (taking your data and leaving; seeing the costs and rules). The reason is printed with every hit a person reads", () => {
    expect(record("decisions/D-0017.md")).toContain("None of the collective rights is in force on our.one yet.");
    // On 328f3c0: "Take your own data and leave" and "See the costs and the rules".
    expect(userRights().filter((i) => /Today: In force on the feed/.test(i)).length).toBeGreaterThan(0);
    const misstated = PROHIBITED.map((p) => p.reason).filter((reason) => /\bnone of its rights\b/i.test(reason));
    expect(misstated).toEqual([]);
  });

  it("fixed: (LOW) /projects says the contract holds 'taking your data and leaving while your account is active', and says nothing of a suspended account; the contract's promise 4 holds it for a suspended account too ('If your account is suspended, write to us and we will do it for you.'), and /agreement's right 4, fixed for honesty 4, says so. The fix turned an overclaim on one page into an underclaim on the other", () => {
    expect(textOf(render(ContractPage))).toContain(
      "You can leave with everything: download your profile, posts, replies and connections, and delete it all, whenever you want. For anything else we hold about you, write to us. If your account is suspended, write to us and we will do it for you.",
    );
    const right4 = userRights().find((i) => i.startsWith("Take your own data and leave"));
    // Changed after the fix of defect 7: right 4 now says "on request if it is suspended", naming no controller.
    expect(right4).toMatch(/suspended/);
    // On 328f3c0: "Held by the contract: taking your data and leaving while your account is active, and seeing its costs and rules. …"
    const row = ddAfter(render(ProjectsPage), "Its users&#x27; rights today")[0] ?? "";
    // The defect: held "while your account is active", and the suspended case the contract holds is gone.
    expect(/while your account is active/.test(row) && !/suspended/.test(row), row).toBe(false);
  });

  it("fixed: (LOW) with no data controller configured, /agreement tells a suspended person to 'write to the data controller and it is done for you' while its own first safeguard says 'no data controller is named yet' (both fixes' words; served so by next start on 3318); /privacy, in the same state, says 'write to the controller (not yet named)'", () => {
    configure(CONFIGS["PROPOSALS_EMAIL without a controller"]!);
    expect(textOf(render(PrivacyPage))).toContain(
      "If your account is suspended, you can't sign in to do either: write to the controller (not yet named) to get a copy or have it deleted.",
    );
    // On 328f3c0: "Not yet. No holder exists, and no data controller is named yet." (the law), and
    // "If your account is suspended, write to the data controller and it is done for you." (right 4).
    const page = textOf(render(AgreementPage));
    const right4 = userRights().find((i) => i.startsWith("Take your own data and leave")) ?? "";
    // The defect: one page, two states of the same fact.
    const sendsToUnnamed = /write to the data controller/.test(right4) && !/not yet named|no data controller is named/.test(right4);
    expect(sendsToUnnamed && /no data controller is named yet/.test(page), right4).toBe(false);
  });

  it("fixed: (LOW) /agreement says 'every change is a commit to the agreement's source' (the honesty fix's rewording of 'a commit in the our.one records'), but its words also change with no commit to that file: the law's 'Today' and Part 7's 'Today' follow this server's configuration (both since the fixes), and the threshold and the maintainer's name come from config.ts and handover.ts", () => {
    const claim = "every change is a commit to the agreement's source";
    configure(CONFIGS["a controller and PROPOSALS_EMAIL"]!);
    const configured = sentences(textOf(render(AgreementPage)));
    configure(CONFIGS["PROPOSALS_EMAIL without a controller"]!);
    const unconfigured = sentences(textOf(render(AgreementPage)));
    // On 328f3c0 the two differ in "No holder exists, and FICTIONAL Controller is the feed's data
    // controller." and "Today: proposals are read by hand.", and the page imports MAINTAINER and
    // THRESHOLD from components/public/handover.ts (which reads core/config.ts).
    const changed = configured.filter((s) => !unconfigured.includes(s));
    // The defect: the page's words differ by configuration alone, under a sentence saying every change is a commit to its source.
    expect(configured.join(" ").includes(claim) && changed.length > 0, changed.join(" | ")).toBe(false);
  });

  it("fixed: (MEDIUM) SPEC §18.17's note 'After the verification' says the two verifiers 'proved 29 defects: 4 HIGH or MEDIUM, 25 LOW'; their files hold 2 HIGH, 9 MEDIUM and 18 LOW (11 HIGH or MEDIUM). The record a build receipt is written from understates the verification's findings (AGENTS.md §6, §10)", () => {
    const note = /proved (\d+) defects: (\d+) HIGH or MEDIUM, (\d+) LOW/.exec(record("apps/web/SPEC.md"));
    expect(note).not.toBeNull();
    const honesty = read("tests/verify-m0015-honesty.test.ts");
    const rendering = read("tests/verify-m0015-rendering.test.ts");
    const count = (severity: string) =>
      (honesty.match(new RegExp(`it\\("fixed: \\(${severity}\\)`, "g")) ?? []).length +
      (rendering.match(new RegExp(`it\\("fixed \\(${severity}\\)`, "g")) ?? []).length;
    const [high, medium, low] = ["HIGH", "MEDIUM", "LOW"].map(count) as [number, number, number];
    expect([high, medium, low]).toEqual([2, 9, 18]);
    expect(Number(note![1])).toBe(high + medium + low);
    // The defect.
    expect([Number(note![2]), Number(note![3])]).toEqual([high + medium, low]);
  });

  it("fixed: (LOW) SPEC §18.17 item 1 still quotes, as the agreement's last sentence, words the page no longer renders ('…every change is a commit in the our.one records…'), and item 2 still describes an 'Under the common agreement' row that the honesty fix renamed 'Its users' rights today'; the note after the verification mentions neither change, and M-0015's first acceptance line holds the pages to §18.17's copy", () => {
    expect(record("mandates/M-0015.yaml")).toContain("render SPEC §18.17's copy word for word");
    const spec = record("apps/web/SPEC.md");
    const section = spec.slice(spec.indexOf("18.17 The framework pages"), spec.indexOf("After the verification (2 October 2026)"));
    expect(section).toContain("18.17 The framework pages");
    // On 328f3c0: "This agreement is a draft, developed in public; every change is a commit in the
    // our.one records. The terms you join the feed under are the contract."
    const last = /Last: "([^"]+)"/.exec(section)?.[1];
    const stale: string[] = [];
    if (last && !textOf(render(AgreementPage)).includes(last)) stale.push(`item 1: ${last}`);
    if (section.includes("Under the common agreement: in force, promised, not yet.") && ddAfter(render(ProjectsPage), "Under the common agreement").length === 0) {
      stale.push("item 2: Under the common agreement");
    }
    expect(stale).toEqual([]);
  });
});

/* ============================================================== closed */

describe("closed: the 29 fixes, where the verifiers' own assertions no longer reach", () => {
  it("closed: both verifiers' files hold 29 'fixed' tests (honesty 17, rendering 12) and no DEFECT; each of the seven adapted checks carries its reason in a comment (honesty 4, rendering 3, as the fix commits say)", () => {
    const honesty = read("tests/verify-m0015-honesty.test.ts");
    const rendering = read("tests/verify-m0015-rendering.test.ts");
    expect([(honesty.match(/it\("DEFECT/g) ?? []).length, (rendering.match(/it\("DEFECT/g) ?? []).length]).toEqual([0, 0]);
    expect([(honesty.match(/it\("fixed: /g) ?? []).length, (rendering.match(/it\("fixed \(/g) ?? []).length]).toEqual([17, 12]);
    // Changed after the re-check's fixes: two more of the honesty file's checks follow the new wording.
    expect((honesty.match(/\/\/ (?:Changed|Fixed) after/g) ?? []).length).toBe(6);
    // Changed after D-0020 (M-0017): six more of the rendering file's checks
    // follow the front door's layout and pages, each with its reason; the
    // round's own three are counted apart from them.
    expect((rendering.match(/\/\/ Changed after (?!D-0020)/g) ?? []).length).toBe(3);
    expect((rendering.match(/\/\/ Changed after D-0020 \(M-0017\)/g) ?? []).length).toBe(6);
  });

  it("closed: honesty 2's second assertion became vacuous — it reads rows labelled 'Under the common agreement', which the fix renamed, so its loop runs over nothing; re-asserted on the renamed row: no 'In force' under the draft, and what holds today is named as the contract", () => {
    const markup = render(ProjectsPage);
    expect(ddAfter(markup, "Under the common agreement")).toEqual([]);
    const row = ddAfter(markup, "Its users&#x27; rights today");
    expect(row).toHaveLength(1);
    expect(row[0]).not.toMatch(/\bIn force\b/);
    expect(row[0]).toMatch(/^Held by the contract: /);
    expect(row[0]).toMatch(/Not yet: deciding its rules, approving its budget, changing who runs it\.$/);
    expect(textOf(markup)).not.toContain("is a project, run under the common agreement");
  });

  it("closed: honesty 11's adapted search string holds 'protected', so its last assertion cannot fail, and its end marker ('Today: proposals are read by hand') is not on the page under the suite's settings; re-asserted directly: with proposals on and off, Part 7's fourth step sends only a protected service's name, data and funds to the holder", () => {
    for (const config of Object.values(CONFIGS)) {
      configure(config);
      const steps = itemsOf(sectionsOf(render(AgreementPage)).get("agreement-start") ?? "");
      expect(steps).toHaveLength(4);
      expect(steps[3]).toBe(
        "When the people who use a protected service first pay for it, its name, its data and its funds go to the holder, which is set up then if it doesn't exist yet.",
      );
    }
    vi.unstubAllEnvs();
    expect(textOf(render(AgreementPage))).not.toContain("Today: proposals are read by hand");
  });

  it("closed: the adapted import check (honesty, closed 'the three sentences …') now reads only `from \"…/agreement/page\"` and `import(…)`, and would miss an import with an extension or a relative path; made exact here, resolving every specifier under src (alias, relative, extension, require): nothing imports the agreement page, so its three sentences stay on /agreement", () => {
    const target = join(WEB, "src/app/(public)/agreement/page");
    let resolved = 0;
    for (const file of walk(join(WEB, "src")).filter((f) => /\.(?:tsx?|jsx?|mjs)$/.test(f))) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)) {
        const spec = m[1]!;
        const base = spec.startsWith("@/") ? join(WEB, "src", spec.slice(2)) : spec.startsWith(".") ? join(dirname(file), spec) : null;
        if (!base) continue;
        resolved += 1;
        const path = base.replace(/\.(?:tsx?|jsx?|mjs)$/, "").replace(/\/index$/, "");
        expect(path === target, `${file} imports ${spec}`).toBe(false);
      }
    }
    expect(resolved).toBeGreaterThan(100);
  });

  it("closed: the adapted external-link check now admits any link into the public repository; the two it was widened for point at paths that exist here: decisions/ and the agreement's own source", () => {
    const hrefs = findAll(parse(render(AgreementPage)), (e) => e.tag === "a")
      .map((a) => a.attrs.href ?? "")
      .filter((h) => h.startsWith("https://github.com/radosukala/ours/"));
    expect(hrefs).toEqual([
      "https://github.com/radosukala/ours/tree/main/decisions",
      "https://github.com/radosukala/ours/blob/main/apps/web/src/app/(public)/agreement/page.tsx",
    ]);
    for (const href of hrefs) {
      const path = href.replace(/^https:\/\/github\.com\/radosukala\/ours\/(?:tree|blob)\/main\//, "");
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it("closed: honesty 12 holds under every configuration — /agreement names the controller exactly as /privacy and /power's configured row do, or says none is named when they do; and Part 7's 'Today', /maintainers and /privacy are in one state for proposals (served so by next start on 3317, 3318 and 3319). /power's recorded row 'Ctrl AI, Inc., the founder's company, is the maintainer and the data controller.' (D-0013 §A) stays in every configuration, beside its configured row: older than M-0015, and accepted by earlier rounds (verify2-honesty, rename.test)", () => {
    for (const [name, config] of Object.entries(CONFIGS)) {
      configure(config);
      const agreement = textOf(render(AgreementPage));
      const privacy = textOf(render(PrivacyPage));
      const power = textOf(render(PowerPage));
      const maintainers = render(MaintainersPage);
      const named = Boolean(config.DATA_CONTROLLER);
      const open = proposalsEmail() !== null;
      expect(open, name).toBe(named && Boolean(config.PROPOSALS_EMAIL));
      if (named) {
        expect(agreement, name).toContain("FICTIONAL Controller is the feed's data controller.");
        expect(privacy, name).toContain("is FICTIONAL Controller, as stated in this server's configuration");
        expect(power, name).toContain("Data controller stated in this server's configuration FICTIONAL Controller.");
      } else {
        expect(agreement, name).toMatch(/no data controller is named/);
        expect(privacy, name).toContain("The data controller is not yet named");
        expect(power, name).toContain("Data controller not yet recorded Not yet named.");
      }
      expect(power, name).toContain("Ctrl AI, Inc., the founder's company, is the maintainer and the data controller.");
      expect(agreement, name).toContain(open ? "Today: proposals are read by hand." : "Today: proposals open at launch.");
      expect(maintainers.includes("mailto:"), name).toBe(open);
      expect(/If you email a proposal or a need/.test(privacy), name).toBe(open);
    }
  });

  it("closed: rendering 1 holds without turning away an ordinary address: hyphens, a plus, a subdomain, upper case, digits, underscores, dots and a punycode host are accepted, trimmed, and linked as written; it does turn away an apostrophe, a tilde and non-ASCII letters, which a mailto link could carry, as SPEC §18.17 records ('a plain address … letters, digits, _+-, dots, and a host name')", () => {
    expect(record("apps/web/SPEC.md")).toContain("PROPOSALS_EMAIL must be a plain address (letters, digits, _+-, dots, and a host name).");
    for (const address of [
      "proposals@example.test",
      "pro-posals@mail.sub-domain.example.test",
      "first.last+proposals@example.test",
      "Proposals@Example.TEST",
      "ideas_2026@example.test",
      "navrhy@xn--nvrhy-6qa.example.test",
    ]) {
      vi.stubEnv("PROPOSALS_EMAIL", `  ${address}  `);
      expect(proposalsEmail(), address).toBe(address);
      const links = findAll(parse(render(MaintainersPage)), (e) => e.tag === "a" && (e.attrs.href ?? "").startsWith("mailto:"));
      expect(links.map((a) => decodeURIComponent(new URL(a.attrs.href!).pathname)), address).toEqual([address, address]);
    }
    for (const address of ["o'brien@example.test", "first~last@example.test", "návrhy@example.test"]) {
      vi.stubEnv("PROPOSALS_EMAIL", address);
      expect(proposalsEmail(), address).toBeNull();
    }
  });

  it("closed: rendering 2 and 8 hold in the production build — next start's article HTML for /agreement, /projects, /maintainers, /privacy and /contract equals this renderer's character for character under all three configurations, the footer too (no-break separators included); and Next's compiler shortens no JSX text in any file the fixes touched", async () => {
    for (const file of [
      AGREEMENT_FILE,
      PROJECTS_FILE,
      MAINTAINERS_FILE,
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/contract/page.tsx",
      "src/components/RightColumn.tsx",
    ]) {
      expect([file, await textsSwcShortens(file)]).toEqual([file, []]);
    }
  });
});

describe("closed: the fixes' side effects on pages M-0015 did not build", () => {
  /** The pages under `.page`, rendered as they serve, proposals on so the mailto links show. */
  function pageLinks(): [string, El][] {
    configure(CONFIGS["a controller and PROPOSALS_EMAIL"]!);
    const out: [string, El][] = [];
    for (const [page, component] of [
      ["/contract", ContractPage],
      ["/rules", RulesPage],
      ["/privacy", PrivacyPage],
      ["/costs", CostsPage],
      ["/power", PowerPage],
      ["/agreement", AgreementPage],
      ["/projects", ProjectsPage],
      ["/maintainers", MaintainersPage],
    ] as const) {
      const article = findAll(parse(render(component)), (e) => e.tag === "article")[0]!;
      expect(moduleClass(article), page).toBe("page");
      for (const a of findAll(article, (e) => e.tag === "a")) out.push([page, a]);
    }
    return out;
  }

  it("closed: `.page a` reaches only the nine pages whose article is `.page` (/contract, /rules, /privacy, /costs, /power, /unsubscribe and the three new ones); the front page and the invite page use no `.page`, and their own link rules (.more, .pledgeLink, .story a, .source a) are unchanged", () => {
    const users = walk(join(WEB, "src"))
      .filter((f) => /\.tsx$/.test(f) && /className=\{styles\.page\}/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(WEB.length).replace(/\\/g, "/"))
      .sort();
    // Changed by M-0016 (D-0019 §G): /build is a tenth `.page` page.
    expect(users).toEqual([
      "src/app/(public)/agreement/page.tsx",
      "src/app/(public)/build/page.tsx",
      "src/app/(public)/contract/page.tsx",
      "src/app/(public)/costs/page.tsx",
      "src/app/(public)/maintainers/page.tsx",
      "src/app/(public)/power/page.tsx",
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/projects/page.tsx",
      "src/app/(public)/rules/page.tsx",
      "src/app/(public)/unsubscribe/page.tsx",
    ]);
    const rule = (selector: string) => declarations(BASE.find((r) => r.selectors.includes(selector))!.body);
    expect(rule(".more")).toMatchObject({ color: "var(--text)", "text-decoration": "underline" });
    expect(rule(".pledgeLink")).toMatchObject({ color: "var(--text)", "text-decoration": "underline" });
    expect(rule(".story a")).toMatchObject({ color: "var(--text)", "text-decoration": "underline" });
    expect(rule(".source a")).toMatchObject({ color: "var(--muted)", "text-decoration": "underline" });
  });

  it("closed: every link inside `.page` on the eight server-rendered pages takes its colour from `.page a` (inherit) and its underline from it — no earlier rule (.link, .prose a, .notice a) wins, none is doubly coloured — and is 4.5:1 or more on its background in both themes (the faint underline, 1.44:1 light and 1.65:1 dark, is the one M-0014 accepted for the card and the story); /unsubscribe's `.link` in its muted line is overridden the same way: muted and underlined, 6.12:1 and 4.58:1. Served so: the global sheet's chunk loads first and the module's second on all nine `.page` pages under all three configurations (27 responses from next start, 328f3c0)", () => {
    // Changed after D-0020 (M-0017): a draft's button, before the page's
    // JavaScript runs, is a link drawn as a button (.btn, on its own
    // background), and keeps the button's colours and no underline
    // (public.module.css, `.page a:global(.btn)`). Every other link is
    // checked as before.
    const all = pageLinks();
    const links = all.filter(([, a]) => !/\bbtn\b/.test(a.attrs.class ?? ""));
    expect(all.length - links.length).toBe(4);
    expect(links.length).toBeGreaterThan(25);
    const problems: string[] = [];
    for (const [page, a] of links) {
      const colour = winner(a, "color");
      const decoration = winner(a, "text-decoration");
      if (colour?.selector !== ".page a" || colour.value !== "inherit") problems.push(`${page} "${text(a)}": colour from ${colour?.selector}`);
      if (decoration?.selector !== ".page a" || decoration.value !== "underline") problems.push(`${page} "${text(a)}": decoration from ${decoration?.selector}`);
      for (const scheme of ["light", "dark"] as const) {
        const ratio = contrast(colourOf(a, scheme), backgroundOf(a, scheme));
        if (ratio < 4.5) problems.push(`${page} "${text(a)}" ${scheme}: ${ratio}:1`);
      }
    }
    expect(problems).toEqual([]);
    const unsubscribe = findAll(
      parse('<article class="page"><p class="muted">You can turn it back on at any time in <a class="link" href="/settings">Settings</a>.</p></article>'),
      (e) => e.tag === "a",
    )[0]!;
    expect([winner(unsubscribe, "color")?.selector, winner(unsubscribe, "text-decoration")?.value]).toEqual([".page a", "underline"]);
    expect(["light", "dark"].map((s) => contrast(colourOf(unsubscribe, s as "light"), backgroundOf(unsubscribe, s as "light")))).toEqual([6.12, 4.58]);
    const underline = (s: "light" | "dark") => contrast(resolveColour("var(--outline-border)", s), resolveColour("var(--bg)", s));
    expect([underline("light"), underline("dark")]).toEqual([1.44, 1.65]);
  });

  it("closed: the footer's no-break separators: in the public layout, the not-found page, the in-app footer and the right column each of the eight is exactly '\\u00a0· ' and hidden from screen readers; every text projection the tests use collapses it to ' · ' (contract.test's footer line still reads 'Contract · Agreement · … · Privacy'); no mail template carries a '·'", () => {
    const BODY = createElement("p", null, "FICTIONAL page body");
    for (const [place, html] of [
      ["the public layout", renderToStaticMarkup(createElement(PublicLayout, null, BODY))],
      ["the not-found page", render(NotFound)],
      ["the in-app footer", render(InAppSiteFooter)],
      ["the right column", renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 }))],
    ] as const) {
      // Changed after D-0020 (M-0017): the public layout's header has a
      // navigation of its own, so the footer's is found by its name.
      const nav = findAll(parse(html), (e) => e.tag === "nav" && e.attrs["aria-label"] === "About our.one")[0]!;
      const separators = findAll(nav, (e) => e.tag === "span");
      expect(separators.map((s) => [s.attrs["aria-hidden"], exactText(s)]), place).toEqual(Array.from({ length: 8 }, () => ["true", " · "]));
      expect(textOf(html), place).toContain(
        "Contract · Agreement · Projects · Build with us · Open code · Costs · Who controls what · Rules · Privacy",
      );
    }
    expect(read("src/core/mail-templates.ts")).not.toContain("·");
    expect(read("tests/contract.test.ts")).toContain(
      '"Contract · Agreement · Projects · Build with us · Open code · Costs · Who controls what · Rules · Privacy"',
    );
  });

  it("closed: the four new claims rules raise no false positive: the repository's public text scans clean, and so do the rendered /agreement, /projects, /maintainers, /privacy and /contract under all three configurations; three of the four reasons match their records (D-0017 §B's definition, D-0017 §E's holder, D-0017's income prohibition). The span that keeps 'not-for-profit' whole splits two promises in the source, where the scan reads '…go to a `}not-for-profit body…', so a past-tense variant there would pass the source scan; the rendered scan, which claims.test runs on all fourteen pages, catches it", () => {
    expect(scanRepoPublicText(WEB).hits.map(formatHit)).toEqual([]);
    for (const [name, config] of Object.entries(CONFIGS)) {
      configure(config);
      for (const [page, component, file] of [
        ["/agreement", AgreementPage, AGREEMENT_FILE],
        // Changed after the re-check's fix: /projects now carries one listed sentence (the never-reached case).
        ["/projects", ProjectsPage, PROJECTS_FILE],
        ["/maintainers", MaintainersPage, null],
        ["/privacy", PrivacyPage, null],
        ["/contract", ContractPage, "src/app/(public)/contract/page.tsx"],
      ] as const) {
        expect(renderedHits(render(component), file), `${name}: ${page}`).toEqual([]);
      }
    }
    const reasons = PROHIBITED.slice(-6, -2).map((p) => p.reason);
    expect(reasons[1]).toMatch(/D-0017 §B/);
    expect(reasons[2]).toBe("D-0012 and D-0017 §E: nothing has gone to the holder or to the members' body; no holder exists.");
    expect(reasons[3]).toBe("D-0017: no promise of income to builders; pay depends on people choosing and paying for a service.");
    expect(record("decisions/D-0017.md")).toContain(`Promising builders income. "Can earn a living" stays conditional on people choosing and paying for the service.`);
    const split =
      '{`At ${THRESHOLD} people, as the contract counts them, its domain, its data and the right to replace the maintainer went to a `}\n<span className={styles.nowrap}>not-for-profit</span>\n{" body of its members."}';
    expect(scanText(split, PROJECTS_FILE)).toEqual([]);
    const rendered = `<dd>At ${THRESHOLD} people, as the contract counts them, its domain, its data and the right to replace the maintainer went to a <span class="nowrap">not-for-profit</span> body of its members.</dd>`;
    expect(renderedHits(rendered, null).length).toBeGreaterThan(0);
  });
});

describe("closed: M-0015's acceptance lines against the shipped code", () => {
  it("closed: line 1 — the three pages render with their titles, and every phrase SPEC §18.17 quotes for them is on the page, except the stale last sentence (the DEFECT above)", () => {
    configure(CONFIGS["a controller and PROPOSALS_EMAIL"]!);
    const agreement = textOf(render(AgreementPage));
    for (const phrase of [
      "Being developed. None of the collective rights below is in force yet, and each part says what holds it today.",
      "We call a service owned by its users only when all of that holds. None does yet.",
      "This is about control. It isn't shares: there is nothing to trade, and nobody receives a payout.",
      "Today: No one has signed this agreement yet.",
      "Until all seven exist for a service, it gets nothing of yours from our.one",
      "it can't be prevented.",
      "Today: proposals are read by hand.",
      `at ${THRESHOLD} people, as it counts them,`,
      "go to a not-for-profit body of its members",
    ]) {
      expect(agreement, phrase).toContain(phrase);
    }
    const projects = textOf(render(ProjectsPage));
    for (const phrase of ["None, by choice", "as the contract counts them", "The next one"]) expect(projects, phrase).toContain(phrase);
    const maintainers = render(MaintainersPage);
    expect(maintainers).toContain("subject=A%20proposal%20for%20our.one");
    expect(maintainers).toContain("subject=A%20need%20for%20our.one");
  });

  it("closed: line 2 — the notice comes first, every numbered part has a 'Today', the seven safeguards are each 'Not yet', 'Not built' or 'Written here. Nobody has signed it yet.', and none reads as built (the acceptance's 'the lede' is the opening paragraph: the notice, not p.lede, says it)", () => {
    const markup = render(AgreementPage);
    const article = findAll(parse(markup), (e) => e.tag === "article")[0]!;
    const first = article.children.filter((c): c is El => typeof c !== "string")[1]!;
    expect([first.attrs.class, text(first).startsWith("Being developed.")]).toEqual(["notice", true]);
    const parts = [...sectionsOf(markup).entries()].filter(([id]) => id !== "agreement-meaning");
    expect(parts.filter(([, html]) => !/\bToday\b/.test(textOf(html))).map(([id]) => id)).toEqual([]);
    const today = ddAfter(sectionsOf(markup).get("agreement-data") ?? "", "Today");
    expect(today).toHaveLength(7);
    for (const line of today) expect(line).toMatch(/^(?:Not yet\.|Not built|Written here\. Nobody has signed it yet\.)/);
  });

  it("closed: line 3 — /projects shows the lede by import, MAINTAINER, 'None, by choice', the costs link, the promise in the status line's form ('go to'), the exception and a link to /maintainers", () => {
    expect(read(PROJECTS_FILE)).toContain('import { LEDE } from "@/components/public/lede";');
    const markup = render(ProjectsPage);
    expect(textOf(markup)).toContain(LEDE);
    expect(ddAfter(markup, "Run by")[0]).toMatch(new RegExp(`^${MAINTAINER}, the founder`));
    expect(ddAfter(markup, "Paid")).toEqual(["None, by choice"]);
    expect(ddAfter(markup, "Promised")[0]).toContain("go to a not-for-profit body of its members");
    expect(ddAfter(markup, "Its exception")[0]).toMatch(/^It is the one service that runs before its data safeguards exist\./);
    for (const href of ["/costs", "/maintainers"]) expect(markup).toContain(`href="${href}"`);
  });

  it("closed: line 4 — with PROPOSALS_EMAIL empty, blank, the placeholder or not an address, and now also with no controller, there is no mailto and no /privacy paragraph; with both set, the two links and /privacy's paragraph name the address (the controller condition is the honesty fix's, recorded in SPEC §18.17)", () => {
    expect(record("apps/web/SPEC.md")).toContain("Proposals stay off without a data controller.");
    for (const value of ["", "   ", "[CONFIRM]", "not-an-address"]) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      expect(render(MaintainersPage)).not.toContain("mailto:");
      expect(textOf(render(PrivacyPage))).not.toMatch(/proposal/i);
    }
    configure(CONFIGS["PROPOSALS_EMAIL without a controller"]!);
    expect(render(MaintainersPage)).not.toContain("mailto:");
    configure(CONFIGS["a controller and PROPOSALS_EMAIL"]!);
    expect((render(MaintainersPage).match(/href="mailto:proposals@example\.test\?subject=/g) ?? []).length).toBe(2);
    expect(render(PrivacyPage)).toContain('href="mailto:proposals@example.test"');
  });

  it("closed: lines 5 to 7 — every footer links to /agreement, /projects and /maintainers among its nine; /contract keeps its eight promises word for word and gains one paragraph linking /agreement; the front page's headline and lede are the recorded ones", () => {
    for (const html of [render(SiteFooter), render(InAppSiteFooter)]) {
      // Changed by M-0016 (D-0019 §G): "Build with us" goes to /build, which links /maintainers.
      for (const href of ["/contract", "/agreement", "/projects", "/build", "/costs", "/power", "/rules", "/privacy"]) {
        expect(html).toContain(`href="${href}"`);
      }
    }
    const contract = render(ContractPage);
    const promises = findAll(parse(contract), (e) => e.tag === "li").map((li) => text(findAll(li, (e) => e.tag === "strong")[0]!));
    expect(promises).toEqual([
      "Neither our.one nor any part of it will be sold, and nobody will invest in it for a return.",
      `At ${THRESHOLD} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day. The count is the number on the front page: accounts that exist and are not suspended.`,
      "Your feed is your people, in order. No ranking, no ads, no selling your data.",
      "You can leave with everything: download your profile, posts, replies and connections, and delete it all, whenever you want. For anything else we hold about you, write to us. If your account is suspended, write to us and we will do it for you.",
      "Every cost is public. Money buys no reach and no say.",
      "The code is public, under an open licence (Apache-2.0): anyone can read it, run it or copy it.",
      "Who holds each key is public.",
      `Changes come with notice. Any change to this contract is announced ${NOTICE_DAYS} days ahead, with the reason, and you can leave with everything before it applies. Promises 1 and 2 can't be changed at all.`,
    ]);
    expect(contract).toContain('<a href="/agreement">common agreement</a>');
    expect(HEADLINE).toEqual(["Just your people.", "Then you're done."]);
    expect(record("decisions/D-0016.md")).toContain(`"${LEDE}"`);
  });

  it("closed: line 8 — the claims scan finds nothing in the repository, and D-0018 §E's three sentences, exactly as written, pass only in the agreement's file (their other forms: the DEFECT above)", () => {
    expect(scanRepoPublicText(WEB).hits).toEqual([]);
    // Changed after the fix of defect 1: the agreement's file also lists the contract's never-reached sentence.
    const listed = ALLOWLIST.filter((e) => e.file === AGREEMENT_FILE).map((e) => e.sentence);
    expect(listed).toHaveLength(4);
    expect(listed[3]).toBe("If that count is never reached, nothing is handed over.");
    for (const sentence of listed) {
      expect(scanText(sentence, AGREEMENT_FILE)).toEqual([]);
      for (const other of [PROJECTS_FILE, MAINTAINERS_FILE, "src/components/public/FrontPage.tsx", null]) {
        expect(scanText(sentence, other).length, `${other}`).toBeGreaterThan(0);
      }
    }
  });

  it("closed: line 9 — measured on 328f3c0: typecheck and lint pass; 49 files and 1,178 tests pass; next build passes (the three pages are ƒ, dynamic); next start serves /agreement, /projects, /maintainers, /privacy, /power, /contract, /costs, /rules and /unsubscribe with 200 under all three configurations; `pnpm ours check M-0015 --changed` gives AUTHORISED FOR EXECUTION (ENFORCED 11 passed, 0 refused; 5 articles open). The pages that read a setting render per request", () => {
    expect(read(AGREEMENT_FILE)).toContain('export const dynamic = "force-dynamic";');
    expect(read(MAINTAINERS_FILE)).toContain('export const dynamic = "force-dynamic";');
    expect(read("src/app/(public)/layout.tsx")).toContain('export const dynamic = "force-dynamic";');
  });
});
