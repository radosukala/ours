/**
 * The re-check of M-0017 (the front door; D-0020; SPEC §18.19), step 5 of
 * the verification's stopping rule: one agent that built none of it and
 * verified none of it, after the fixes (8337d52). It changes no product
 * code, no record, no receipt and no other test.
 *
 * What was asked: do the 31 fixes hold, in the case each finding names and
 * in close variants (other words, other widths, the dark theme, without
 * JavaScript, with and without PROPOSALS_EMAIL); did the fixes break
 * anything, the adapted tests included; and does build.md read clearly to a
 * fresh coding agent after the trial.
 *
 * How it was looked at:
 *
 * - The claims scan's three new rules (src/core/claims.ts), on sentences
 *   written to probe them, on every .md, .ts, .tsx, .mjs, .json and .yaml
 *   file in the repository (the records included), and on the kit's own
 *   check (kit/our-one.mjs) run on a FICTIONAL folder.
 * - A production build of this worktree at 8337d52 (`next build`), served
 *   by `next start` twice with FICTIONAL settings and a scratch Postgres
 *   database: :3531 with PROPOSALS_EMAIL=ideas@example.test, :3532 without
 *   it (both with DATA_CONTROLLER="FICTIONAL Controller",
 *   DATA_CONTROLLER_EMAIL=controller@example.test, MAIL_TRANSPORT=outbox
 *   and CLIENT_IP_HEADER=x-forwarded-for). The browser was headless Google
 *   Chrome 154.0.8037.93, driven over the DevTools protocol by the
 *   re-checker's scripts, in three states: scripts off
 *   (Emulation.setScriptExecutionDisabled, where `(scripting: enabled)` is
 *   false); scripts on but the page's .js chunks blocked
 *   (Network.setBlockedURLs), which holds the state before hydration, as a
 *   script blocker or a failed load does; and hydrated. At 320, 375, 768,
 *   1280 and 1440px, light and dark; touch emulated under 768px; signed out,
 *   and signed in as the FICTIONAL administrator `pnpm seed:fictional`
 *   makes on the scratch database.
 *
 * Each finding is a "DEFECT (SEVERITY): …" test that FAILS on 8337d52 and
 * passes once fixed, by whichever fix the finding allows; where only a
 * browser shows it, the title says what was measured, and the test pins the
 * cause in the source. Each check that held is a "closed: …" test that
 * passes. Severity as round one used it: HIGH, something stated as in
 * force, built or approved that isn't, or content hidden or unusable for
 * everyone; MEDIUM, a statement the code or the records contradict, a layer
 * of checking that misses what it was added for, or an accessibility
 * failure under WCAG AA; LOW, wording, polish, small gaps.
 *
 * Every person, project and address here is FICTIONAL. No network: the
 * routes run with the seats module, the session and the Get in action
 * mocked, and the kit's tool runs on folders in the system's temporary
 * directory.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type FunctionComponent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const hydration = vi.hoisted(() => ({ ready: false }));
const auth = vi.hoisted(() => ({ signedIn: false }));

/** The interactive parts draw their hydrated form while `hydration.ready` is set. */
vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => hydration.ready }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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

import AgreementPage from "@/app/(public)/agreement/page";
import BuildPage from "@/app/(public)/build/page";
import ContractPage from "@/app/(public)/contract/page";
import FeedPageRoute from "@/app/(public)/feed/page";
import MaintainersPage from "@/app/(public)/maintainers/page";
import FrontDoorRoute from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import {
  BUILD_LIMIT,
  DOOR_EYEBROW,
  DOOR_STATUS,
  IDEA_CLOSE,
  ILLUSTRATION,
  OPEN_ROWS,
  OURS_STATUS,
  PART_HEADING,
  POSSIBILITY_LABEL,
  TAGLINE,
  partFoot,
} from "@/components/public/door";
import { ANSWER_LIMIT, DRAFT_FALLBACK, LIMIT_LINE, draftMailto, draftNote, draftText } from "@/components/public/drafts";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { PLACES } from "@/components/public/PublicNav";
import { publicTextFiles, scanKitText, scanRepoPublicText, scanText } from "@/core/claims";
import { AGENT_LINE, KIT_TOOL } from "@/core/kit-info";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TOOL = join(ROOT, "kit", "our-one.mjs");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const BUILD_MD = readRoot("kit/build.md");
const TRIAL_REPORT = "receipts/conformance/2026-10-03-M-0017-agent-trial/REPORT.md";
const RECEIPT = "receipts/conformance/2026-10-03-M-0017.verification.md";
const EMAIL = "ideas@example.test";

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

const made: string[] = [];

afterEach(() => {
  hydration.ready = false;
  auth.signedIn = false;
  vi.unstubAllEnvs();
  while (made.length > 0) rmSync(made.pop()!, { recursive: true, force: true });
});

/* ---------------------------------------------------------------- markup */

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
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

function closest(el: El, test: (e: El) => boolean): El | null {
  for (let e: El | null = el; e; e = e.parent) if (test(e)) return e;
  return null;
}

const elements = (el: El) => el.children.filter((c): c is El => typeof c !== "string");

/** An element's classes as the source writes them: a CSS module's `_tabsBox_1a2b3c` is "tabsBox". */
function classes(el: El): string[] {
  return (el.attrs.class ?? "")
    .split(" ")
    .filter(Boolean)
    .map((c) => c.replace(/^_(.+)_[0-9a-z]{5,8}$/i, "$1"));
}

const hasClass = (el: El, name: string) => classes(el).includes(name);
const byText = (tree: El, tag: string, pattern: RegExp) => findAll(tree, (e) => e.tag === tag && pattern.test(text(e)));
const dialogs = (tree: El) => findAll(tree, (e) => e.tag === "dialog");

/** The front door inside the public layout's `.public` box, as the server sends it or (`hydrated`) once its JavaScript runs. */
function door(props: Partial<FrontDoorProps> = {}, hydrated = false): El {
  hydration.ready = hydrated;
  try {
    return parse(
      renderToStaticMarkup(
        createElement(
          "div",
          { className: "public" },
          createElement(FrontDoor, { joining: true, email: null, count: 10, seatsOpen: 0, seatsWaiting: 0, ...props }),
        ),
      ),
    );
  } finally {
    hydration.ready = false;
  }
}

function pageTree(component: FunctionComponent, hydrated = false): El {
  hydration.ready = hydrated;
  try {
    return parse(renderToStaticMarkup(createElement("div", { className: "public" }, createElement(component))));
  } finally {
    hydration.ready = false;
  }
}

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

/* ------------------------------------------------------------------- CSS */

const GLOBALS = read("src/app/globals.css");
const DOOR_CSS = read("src/components/public/door.module.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");

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

/** The order the sheets load in on the front door: the global sheet, then the page's module. */
const G_RULES = cssRules(GLOBALS);
const D_RULES = cssRules(DOOR_CSS, 100_000);
const P_RULES = cssRules(PUBLIC_CSS, 200_000);
const ALL_RULES = [...G_RULES, ...D_RULES, ...P_RULES];

const DARK = (m: string | null) => m !== null && /prefers-color-scheme:\s*dark/.test(m);
const SCRIPTING = (m: string | null) => m !== null && /scripting:\s*enabled/.test(m);

function specificity(selector: string): number {
  const s = selector.replace(/:global\(([^)]*)\)/g, "$1");
  const ids = s.match(/#[\w-]+/g)?.length ?? 0;
  const cls = s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)?.length ?? 0;
  const tags = s.match(/(?:^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0;
  return ids * 10_000 + cls * 100 + tags;
}

/** The value of `prop` for these exact selectors, in the media that apply: the most specific rule, then the last. */
function value(
  wanted: string[],
  prop: string,
  applies: (media: string | null) => boolean = (m) => m === null,
  rules: CssRule[] = ALL_RULES,
): string | undefined {
  let found: { v: string; spec: number; order: number } | undefined;
  for (const r of rules) {
    if (!applies(r.media)) continue;
    const v = declarations(r.body)[prop];
    if (v === undefined) continue;
    for (const s of r.selectors.filter((x) => wanted.includes(x))) {
      const spec = specificity(s);
      if (!found || spec > found.spec || (spec === found.spec && r.order >= found.order)) found = { v, spec, order: r.order };
    }
  }
  return found?.v;
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

function contrast(fg: Rgba, bg: Rgba): number {
  const top = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(top), luminance(bg)].sort((x, y) => y - x);
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100;
}

/** The public pages' tokens (globals.css, `.public`), for one theme. */
function tokens(scheme: "light" | "dark"): Record<string, string> {
  const own = (rules: CssRule[]) =>
    Object.fromEntries(rules.flatMap((r) => [...r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as [string, string])));
  const mine = (r: CssRule) => r.selectors.length === 1 && r.selectors[0] === ".public";
  const light = own(G_RULES.filter((r) => mine(r) && r.media === null));
  return scheme === "light" ? light : { ...light, ...own(G_RULES.filter((r) => mine(r) && DARK(r.media))) };
}

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

const SCHEMES = ["light", "dark"] as const;

/* ------------------------------------------- a small selector matcher */

type States = { focusVisible?: boolean };
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
  for (const ch of selector.replace(/:global\(([^)]*)\)/g, "$1")) {
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

function compoundMatches(el: El, compound: string, states: States): boolean {
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
      if (compoundMatches(el, m[1]!, states)) return false;
    } else if ((m = /^:focus-visible/.exec(rest))) {
      if (!states.focusVisible) return false;
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

function matchesFrom(el: El, parts: Part[], i: number, states: States): boolean {
  if (!compoundMatches(el, parts[i]!.compound, i === parts.length - 1 ? states : {})) return false;
  if (i === 0) return true;
  const comb = parts[i]!.comb;
  if (comb === "+") {
    const prev = previousSiblings(el)[0];
    return !!prev && matchesFrom(prev, parts, i - 1, states);
  }
  if (comb === "~") return previousSiblings(el).some((p) => matchesFrom(p, parts, i - 1, states));
  if (comb === ">") return !!el.parent && matchesFrom(el.parent, parts, i - 1, states);
  for (let a = el.parent; a; a = a.parent) if (matchesFrom(a, parts, i - 1, states)) return true;
  return false;
}

function selectorMatches(el: El, selector: string, states: States = {}): boolean {
  if (selector.includes("::")) return false;
  const parts = split(selector);
  return parts.length > 0 && matchesFrom(el, parts, parts.length - 1, states);
}

/** The focus ring a keyboard-focused element draws: the winning outline colour, and the rule it comes from. */
function ringFor(el: El, scheme: "light" | "dark"): { colour: string; selector: string } | null {
  let best: { colour: string; selector: string; spec: number; order: number } | null = null;
  for (const r of ALL_RULES) {
    if (!(r.media === null || (scheme === "dark" && DARK(r.media)))) continue;
    const d = declarations(r.body);
    const col = d["outline-color"] ?? d.outline?.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p));
    if (!col) continue;
    for (const s of r.selectors) {
      if (!s.includes(":focus-visible") || !selectorMatches(el, s, { focusVisible: true })) continue;
      const spec = specificity(s);
      if (!best || spec > best.spec || (spec === best.spec && r.order >= best.order)) best = { colour: col, selector: s, spec, order: r.order };
    }
  }
  return best;
}

/**
 * Does a rule in these media hide this element for good (display: none)? A
 * rule that also runs an animation, a timed reveal, isn't counted.
 */
function hiddenBy(el: El, rules: CssRule[], applies: (m: string | null) => boolean): string[] {
  return rules
    .filter((r) => applies(r.media) && declarations(r.body).display === "none" && !/\banimation\b/.test(r.body))
    .flatMap((r) => r.selectors.filter((s) => selectorMatches(el, s)).map((s) => `${r.media ?? "all"} ${s}`));
}

/** A FICTIONAL folder in the system's temporary directory, with these files. No git, no network. */
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-recheck-m0017-"));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, rel), content);
  return dir;
}

/** The kit's tool, as an agent runs it: `node our-one.mjs <args> --project <dir>`. */
function runTool(dir: string, args: string[]) {
  const r = spawnSync(process.execPath, [TOOL, ...args, "--project", dir], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/* =============================================================== findings */

describe("findings (each FAILS on 8337d52, and passes once fixed)", () => {
  it("fixed (MEDIUM): R1's fix put the acid focus ring on everything inside the builders' band, and the draft dialog that 'Draft an idea first' opens is inside it in the DOM, on the light paper: in the light theme its fields and buttons are ringed in the acid on the paper, 1.09:1, where a focus indicator needs 3:1 (WCAG 2.4.7 with 1.4.11) — measured in headless Chrome 154 against next start of 8337d52 at 1280px, light, on both servers: the dialog opens with focus in its first field, ringed 3px rgb(225, 242, 139) on the dialog's rgb(245, 243, 235), 1.09:1, and Tab to 'Copy my draft' draws the same; the dialogs opened from 'Your part', /build and /maintainers draw the rust, 4.74:1; dark, the acid on the dark paper is 14.56:1", () => {
    const tree = door({ email: EMAIL }, true);
    const fromBuild = findAll(tree, (e) => e.tag === "section" && e.attrs.id === "build").flatMap(dialogs);
    expect(fromBuild).toHaveLength(1);
    // The rule R1's fix added, and the dialog's own background.
    expect(DOOR_CSS).toContain(".builders :focus-visible {\n  outline: 3px solid var(--acid);");
    const background = value([".public .draft"], "background");
    expect(background).toBe("var(--paper)");

    const problems: string[] = [];
    for (const d of dialogs(tree)) {
      const where = closest(d, (e) => e.tag === "section")?.attrs.id ?? "?";
      for (const el of findAll(d, (e) => e.tag === "textarea" || e.tag === "button")) {
        for (const scheme of SCHEMES) {
          const ring = ringFor(el, scheme);
          expect(ring, `#${where} ${el.tag}`).not.toBeNull();
          const ratio = contrast(resolve(ring!.colour, scheme), resolve(background!, scheme));
          const name = el.attrs["aria-label"] ?? (el.tag === "textarea" ? el.attrs.placeholder : text(el));
          if (ratio < 3) problems.push(`#${where} ${el.tag} "${name}" ${scheme}: ${ring!.colour} from "${ring!.selector}" on the dialog's paper, ${ratio}:1`);
        }
      }
    }
    // The defect: a ring nobody can see, in the dialog the builders' band opens.
    expect(problems).toEqual([]);
  });

  it("fixed (MEDIUM): R10's fix hides 'Your work' and 'Your audience' wherever scripting is on and the page hasn't hydrated, so a browser that keeps scripting on and never runs the page's scripts (a blocker that refuses them by content policy, a chunk that fails to load) never shows the two labelled possibilities D-0020 §A puts on the front door, and draws an empty bar where tabs never come: content hidden, for that minority of browsers, and the feed's panel still shows — measured in headless Chrome 154 with the page's .js chunks blocked (matchMedia('(scripting: enabled)') stays true), at 320, 375, 768, 1280 and 1440px, light and dark: the first panel shows, the second and third stay display:none under a 52px bar with a bottom rule, and no tab is drawn; with scripting off (Emulation.setScriptExecutionDisabled) all three show. Before the fix, that browser showed all three", () => {
    const server = door({}, false);
    const box = findAll(server, (e) => hasClass(e, "tabsBox"))[0]!;
    expect(box.attrs["data-ready"]).toBeUndefined();
    const panels = elements(box).filter((e) => hasClass(e, "panel"));
    expect(panels.map((p) => text(p))).toEqual([
      expect.stringMatching(/^The first project Just your people\./),
      expect.stringMatching(new RegExp(`^${POSSIBILITY_LABEL} Your team's work\\.`)),
      expect.stringMatching(new RegExp(`^${POSSIBILITY_LABEL} The relationship is the valuable part\\.`)),
    ]);
    expect(findAll(server, (e) => e.attrs.role === "tablist")).toEqual([]);

    // What a browser that has scripting on, and runs none of the page's scripts, applies to the server's markup.
    const scriptingOn = (m: string | null) => m === null || SCRIPTING(m) || /max-width|pointer/.test(m);
    const hidden = panels.map((p) => (p.attrs.hidden !== undefined ? ["the hidden attribute"] : hiddenBy(p, D_RULES, scriptingOn)));

    // The defect: two of the three panels can't be seen, and nothing will ever draw the tabs to reach them.
    expect(hidden).toEqual([[], [], []]);
  });

  it("fixed (LOW): a fresh load of /#build still lands 50–72px low, /#open 23–24px low from 768px, and /#ours 2–7px low: R10's fix keeps the tabs' room as 52px, but the tab list is 54.1px on a phone and 59.3px from 768px, and the illustration's button arrives with hydration above #build and #open, with nothing kept for it — measured in headless Chrome 154 against :3532, scripts blocked and then hydrated, 1.2s after load, each section's top (16px is its scroll margin): #ours 16 → 18 at 320 and 375, 16 → 23 at 768 and 1280; #build 16 → 88 at 320, 70 at 375, 66 at 1280 (on the mark at 768); #open 16 → 40 at 768, 39 at 1280; #idea, #projects and #part on the mark. R10 named /#open (23px) and /#build (54px) beside /#ours", () => {
    // The tab list's height, from the stylesheet, at each width it changes: the tab's line box, padding and
    // bottom border (or its min-height), its negative margin, and the list's own bottom border.
    const lh = parseFloat(value([".public"], "line-height", (m) => m === null, G_RULES) ?? "0");
    expect(lh).toBe(1.55);
    // Changed after the fix (RC2): the reserved bar is gone with the rule that hid
    // the panels; once hydrated, ServiceTabs takes the visitor back to the section
    // the address names, so the tabs' arrival can't leave a deep link low.
    expect(D_RULES.find((r) => r.selectors.includes(".tabsBox:not([data-ready])::before"))).toBeUndefined();
    expect(read("src/components/public/ServiceTabs.tsx")).toContain("target.scrollIntoView()");
    expect(GLOBALS).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing: border-box;/); // the bar's own rule is inside its height
    const widths: [string, (m: string | null) => boolean][] = [
      ["from 761px", (m) => m === null],
      ["to 760px", (m) => m === null || /max-width:\s*760px/.test(m)],
      ["to 380px", (m) => m === null || /max-width:\s*(760|380)px/.test(m)],
    ];
    const off = widths
      .map(([name, applies]) => {
        const tab = (prop: string) => value([".tab"], prop, applies, D_RULES);
        const [top, , bottom] = (tab("padding") ?? "0").split(/\s+/).map((v) => parseFloat(v));
        const fixed = tab("height");
        const box = fixed && /^[\d.]+px$/.test(fixed)
          ? parseFloat(fixed)
          : Math.max(parseFloat(tab("min-height") ?? "0"), parseFloat(tab("font-size") ?? "0") * lh + (top ?? 0) + (bottom ?? top ?? 0) + parseFloat(tab("border-bottom") ?? "0"));
        const list = box + parseFloat(tab("margin-bottom") ?? "0") + parseFloat(value([".tabs"], "border-bottom", applies, D_RULES) ?? "0");
        // The room kept, at this width, where scripting is on.
        const kept = value([".tabsBox:not([data-ready])::before"], "height", (m) => m !== null && SCRIPTING(m) && (applies(m.replace(/\(scripting:\s*enabled\)\s*(and\s*)?/, "").trim() || null)), D_RULES);
        const reserve = kept && /^[\d.]+px$/.test(kept) ? parseFloat(kept) : null; // anything but plain pixels is taken as kept
        return { name, list: Math.round(list * 100) / 100, reserve };
      })
      .filter(({ list, reserve }) => reserve !== null && Math.abs(list - reserve) > 1)
      .map(({ name, list, reserve }) => `${name}: the tab list is ${list}px, the room kept ${reserve}px`);

    // The illustration: the button hydration adds, above #build and #open.
    const figure = (t: El) => findAll(t, (e) => e.tag === "figure" && e.attrs["aria-labelledby"] === "continuity-label")[0]!;
    const shape = (t: El) => findAll(figure(t), () => true).map((e) => e.tag).join(" ");
    const kept =
      shape(door({}, false)) === shape(door({}, true)) ||
      D_RULES.some((r) => SCRIPTING(r.media) && r.selectors.some((s) => /\.(?:continuity|operator|changeButton|result)\b/.test(s)));
    expect(findAll(figure(door({}, true)), (e) => e.tag === "button").map(text)).toEqual([ILLUSTRATION.change]);

    // The defect: the room kept isn't the room taken, so what's below moves when the scripts run.
    expect({ tabs: off, illustration: kept }).toEqual({ tabs: [], illustration: true });
  });

  it("fixed (MEDIUM): H5's rule doesn't see D-0020's first prohibition in its own word — 'Saying that user control, the holder or any safeguard exists' — for two of its three subjects: 'User control exists.' and 'The data safeguards exist.' pass, while 'The holder exists.' is caught; and the plainest forms pass too, because the rule wants 'now' or 'already' before the holder's verb and 'is' before its state: 'The holder holds your data.', 'The holder has been formed.', and the passive of 'users control', 'The feed is controlled by its users.'", () => {
    expect(record("decisions/D-0020.md")).toContain("Saying that user control, the holder or any safeguard exists before it does.");
    expect(scanText("The holder exists.", null).map((h) => h.match)).toEqual(["holder exists"]);
    // The pages' own denials pass, now and after any fix.
    for (const denial of [
      DOOR_STATUS,
      OPEN_ROWS.find((r) => r.state === "Not built yet")!.detail,
      BUILD_LIMIT,
      "No one has signed the common agreement yet, there are no protected services besides the feed, and none of the data safeguards is built.",
      "our.one takes no money for anyone until the holder exists.",
      "Until user control exists, the founder decides.",
      "No safeguard exists yet.",
    ]) {
      expect(scanText(denial, null), denial).toEqual([]);
    }

    // The defect: the claims pass.
    const claims = [
      "User control exists.",
      "User control exists today.",
      "The data safeguards exist.",
      "The holder holds your data.",
      "The holder has been formed.",
      "The feed is controlled by its users.",
    ];
    expect(claims.filter((c) => scanText(c, null).length === 0)).toEqual([]);
  });

  it("fixed (MEDIUM): H5's 'protected by our.one' rule is wrong both ways: it lets the phrase through whenever 'as', 'or', 'not', 'never' or 'nor' stands anywhere in the 40 characters before it, so 'As a member, you're protected by our.one.', 'Your data is never sold: it is protected by our.one.' and 'Whether you build or use it, it's protected by our.one.' pass; and its 'n't' can never match after a letter, so the plain denials 'It isn't protected by our.one.', 'Your project won't be protected by our.one.' and 'It hasn't been protected by our.one.' are refused. The kit's own check, which round one named as knowing the phrase, does the opposite on all six (run here on a FICTIONAL folder)", () => {
    const sentences = [
      "As a member, you're protected by our.one.",
      "Your data is never sold: it is protected by our.one.",
      "Whether you build or use it, it's protected by our.one.",
      "It isn't protected by our.one.",
      "Your project won't be protected by our.one.",
      "It hasn't been protected by our.one.",
    ];
    // The kit's check: the first three are claims, the last three denials.
    const dir = folder({ "page.html": sentences.map((s) => `<p>${s}</p>`).join("\n") });
    const report = JSON.parse(runTool(dir, ["check", "--json"]).stdout) as { checks: { id: string; findings: { line?: number }[] }[] };
    expect(report.checks.find((c) => c.id === "claims")!.findings.map((f) => f.line)).toEqual([1, 2, 3]);
    // Rule 9's own words pass, now and after any fix.
    expect(scanText("Don't present it as its users' property, or as approved, listed or protected by our.one.", null)).toEqual([]);

    // The defect: the site's scan, sentence by sentence (true is a hit).
    expect(sentences.map((s) => scanText(s, null).length > 0)).toEqual([true, true, true, false, false, false]);
  });

  it("fixed (LOW): H6 widened the 'it's ours' rule, and left its twin narrow: 'It's yours' and 'It is yours' are caught, but 'The feed is yours.', 'It's already yours.', 'our.one is yours.' and 'This service is theirs.' pass, while 'It's already ours.' is caught — ownership in the second and third person is the same claim D-0012 dropped (the rule beside it lists 'it's yours' and 'it's theirs'). Two true sentences any widening must keep: /maintainers' 'ordinary product decisions are yours' and /agreement's '… are theirs'", () => {
    expect(scanText("It's yours.", null)).toHaveLength(1);
    expect(scanText("It's already ours.", null)).toHaveLength(1);
    for (const [file, words] of [
      ["src/app/(public)/maintainers/page.tsx", "ordinary product decisions are yours."],
      ["src/app/(public)/agreement/page.tsx", "ordinary product decisions are theirs."],
    ] as const) {
      expect(flat(read(file)), file).toContain(words);
      expect(scanText(read(file), file), file).toEqual([]);
    }

    // The defect.
    const claims = ["The feed is yours.", "It's already yours.", "our.one is yours.", "This service is theirs."];
    expect(claims.filter((c) => scanText(c, null).length === 0)).toEqual([]);
  });

  it("fixed (LOW): the new rules refuse true sentences in the repository's records — H5's denial list knows 'the' and not 'a', so D-0017's own 'No money moves through our.one until a holder exists.' and 'Taking money through our.one before a holder exists.' are refused (the pages pass only because they say 'until the holder exists'); and H6's widened rule, blind to case, refuses sentences about OURS, the repository's working name (AGENTS.md §11): 'The first user is OURS itself.' (foundation/FIRST-PRODUCT.md) and 'What is OURS?' (P-0004, P-0005). None is on a page or in the kit today (the scan of the site's and the kit's text finds nothing); each is refused the day it is quoted", () => {
    const d17 = record("decisions/D-0017.md");
    expect(d17).toContain("No money moves through our.one until a holder exists.");
    expect(d17).toContain("Taking money through our.one before a holder exists.");
    expect(record("foundation/FIRST-PRODUCT.md")).toContain("The first user is OURS itself.");
    expect(record("proposals/P-0005.md")).toContain("what is OURS?");
    expect(scanText("our.one takes no money for anyone until the holder exists.", null)).toEqual([]);

    // The defect.
    const truths = [
      "No money moves through our.one until a holder exists.",
      "Taking money through our.one before a holder exists.",
      "The first user is OURS itself.",
      "What is OURS?",
    ];
    expect(truths.filter((t) => scanText(t, null).length > 0)).toEqual([]);
  });

  // Recorded, not fixed (the verification receipt, round two): M-0017 kept the
  // redirect for signed-in visitors "as before", and D-0020 §B puts the four
  // places in the header; which gives way was the founder's call. D-0023 made
  // it: a member stays on the front door (§C), and M-0020 built it. Unskipped
  // and renamed after the verification of M-0020 (H14).
  it("fixed (LOW; decided by D-0023 §C, built under M-0020): for a signed-in visitor, two of the header's four places don't reach what they name — 'The idea' (/#idea) and 'In the open' (/#open) go to the front door, which sends a signed-in visitor to /home as M-0017 keeps it ('as before'), so a member can't reach the idea or what's built, a draft and not built from the header on any public page — measured in headless Chrome 154 against :3532, signed in as the FICTIONAL administrator from `pnpm seed:fictional`: from /build, 'The idea' and 'In the open' landed on /home (its heading 'Home'), and a fresh load of /#open on /home#open. D-0020 §B puts both places in the header 'on every public page'; which gives way is the founder's call", async () => {
    // Changed after the verification of M-0020 (H14): the redirect is gone, and so is the line that pinned it.
    expect(read("src/app/(public)/page.tsx")).not.toContain('redirect("/home")');
    const intoDoor = PLACES.filter((p) => p.href.startsWith("/#"));
    auth.signedIn = true;
    const outcome = await FrontDoorRoute().then(
      () => "renders",
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

    // The defect: the places lead a member to /home.
    expect(intoDoor.length === 0 || outcome === "renders", `${intoDoor.map((p) => `${p.label} (${p.href})`).join(", ")}: ${outcome}`).toBe(true);
  });

  it("fixed (LOW): /build's new sentence on the trial says the line 'has been tried once, in Claude Code'; nothing in the records of M-0017's trial says which agent or which harness ran it — its REPORT says 'a fresh agent' and the verification receipt 'a fresh agent' (AGENTS.md §10: a sentence with a number carries a source, and a person confirms the source says it; M-0016's trial report did say Claude Code, so round one's H15 then could source it)", () => {
    const build = textOf(render(BuildPage));
    const sentence = /It has been tried once[^.]*\./.exec(build)?.[0] ?? "";
    expect(sentence.length).toBeGreaterThan(0);
    expect(record("receipts/conformance/2026-10-02-M-0016-agent-trial/REPORT.md")).toContain("my Claude Code project folder");
    const report = readRoot(TRIAL_REPORT);
    const receipt = readRoot(RECEIPT);

    // The defect: named on the page, and in no record of the trial.
    expect(!/\bin Claude Code\b/.test(sentence) || /Claude Code/.test(report) || /Claude Code/.test(receipt)).toBe(true);
  });

  it("fixed (LOW): the trial's sixth gap in build.md — 'the example files live on GitHub, not on our.one' — is neither fixed nor recorded: build.md still sends an agent to GitHub for the feed's our.one.json and AGENTS.md, and neither the trial's 'Recorded, not changed' nor the receipt's lists it, while the stopping rule ends with 'every finding is fixed or recorded'", () => {
    const report = readRoot(TRIAL_REPORT);
    expect(flat(report)).toContain("the example files live on GitHub, not on our.one;");
    expect(flat(readRoot(RECEIPT))).toContain("Then every finding is fixed or recorded here. There is no further round.");
    const recordedInReport = report.slice(report.indexOf("**Recorded, not changed:**"));
    const receipt = readRoot(RECEIPT);
    const recordedInReceipt = receipt.slice(receipt.indexOf("**Recorded, not changed:**"), receipt.indexOf("### Honesty"));
    const mentions = (s: string) => /example[^.]*GitHub|GitHub[^.]*example/i.test(s);
    const examples = flat(BUILD_MD.slice(BUILD_MD.indexOf("- The feed is the first project."), BUILD_MD.indexOf("- A project starts as an idea")));
    const servedHere = /https:\/\/our\.one\//.test(examples);

    // The defect.
    expect({ fixed: servedHere, recorded: mentions(recordedInReport) || mentions(recordedInReceipt) }).not.toEqual({ fixed: false, recorded: false });
  });

  it("fixed (LOW): SPEC §18.19 says 'The words below are the files', word for word', and still quotes the rights' status the fix replaced ('None of it is in force: today, the founder decides.', now OURS_STATUS's 'None of its collective rights is in force …'), and says build.md's step 2 drafts 'PITCH.md's first four parts', where it fills in the first, second, fifth and sixth of seven", () => {
    const spec = read("SPEC.md");
    const section = flat(spec.slice(spec.indexOf("### 18.19"), spec.indexOf("**After the verification**", spec.indexOf("### 18.19"))));
    expect(section).toContain("The words below are the files', word for word");
    const step2 = flat(BUILD_MD.slice(BUILD_MD.indexOf("Fill in four of them now"), BUILD_MD.indexOf("Write TODO under the other three.")));
    expect([...step2.matchAll(/\*\*([^*:]+):\*\*/g)].map((m) => m[1])).toEqual(["The need", "What it offers", "What you're asking for now", "What has to happen first"]);
    expect(OURS_STATUS).not.toContain("None of it is in force");

    // The defect.
    expect({ oldStatus: section.includes("None of it is in force: today, the founder decides."), firstFour: /first four parts/.test(section) }).toEqual({ oldStatus: false, firstFour: false });
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: the drafts send, store and count nothing, and offer email only with PROPOSALS_EMAIL — in headless Chrome 154 on both servers, light and dark, a draft opened from the builders' band, from 'Your part', on /build and on /maintainers, three FICTIONAL answers typed, copied (clipboard allowed) and, on :3531, opened in email: every request after opening was a GET, none carried an answer but the mailto: link, nothing was posted, and localStorage, sessionStorage, cookies, IndexedDB and the Cache Storage stayed empty; 'Open in my email' showed on :3531 only; the note said 'email opens your own email app' on :3531 only; 'Copied. Nothing was sent.', and a changed answer put the note back", () => {
    for (const file of [
      "src/components/public/Draft.tsx",
      "src/components/public/drafts.ts",
      "src/components/public/CopyLine.tsx",
      "src/components/public/ServiceTabs.tsx",
      "src/components/public/Continuity.tsx",
      "src/components/public/useHydrated.ts",
    ]) {
      expect(read(file), file).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\.|navigator\.share|<form\b|"use server"|new Image\(/);
    }
    for (const email of [null, EMAIL]) {
      vi.stubEnv("PROPOSALS_EMAIL", email ?? "");
      const places: [string, El][] = [
        ["/", door({ email }, true)],
        ["/build", pageTree(BuildPage, true)],
        ["/maintainers", pageTree(MaintainersPage, true)],
      ];
      for (const [where, tree] of places) {
        const ds = dialogs(tree);
        expect(ds.length, where).toBeGreaterThan(0);
        for (const d of ds) {
          expect(byText(d, "button", /^Open in my email$/).length, `${where} ${String(email)}`).toBe(email ? 1 : 0);
          expect(text(findAll(d, (e) => e.attrs.role === "status")[0]!), where).toBe(draftNote(email !== null));
          expect(findAll(d, (e) => e.tag === "form"), where).toEqual([]);
          expect(text(d), where).toContain(LIMIT_LINE);
        }
      }
      vi.unstubAllEnvs();
    }
    expect(draftNote(false)).not.toMatch(/\bemail\b/i);
    expect(draftMailto(EMAIL, "idea", draftText("idea", ["FICTIONAL a", "FICTIONAL b", "FICTIONAL c"])).href.startsWith(`mailto:${EMAIL}?`)).toBe(true);
    const draft = read("src/components/public/Draft.tsx");
    expect(draft).toMatch(/function update\([^)]*\)\s*\{[\s\S]*?remember\(kind, next\);[\s\S]*?setStatus\(note\);/);
  });

  it("closed: without scripts every panel shows — in Chrome 154 with scripting off, at 320–1440px, light and dark, `(scripting: enabled)` was false, all three panels showed with their labels, each after the first set off by a rule, no tab and no reserved bar were drawn, the illustration said 'This only illustrates the idea: our.one can't do it today.' with no button, every draft was a link to /maintainers' sections, and nothing scrolled sideways", () => {
    const server = door({ email: EMAIL }, false);
    const box = findAll(server, (e) => hasClass(e, "tabsBox"))[0]!;
    const panels = elements(box).filter((e) => hasClass(e, "panel"));
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => p.attrs.hidden)).toEqual([undefined, undefined, undefined]);
    // Nothing outside `(scripting: enabled)` hides a panel; the bar is drawn only there.
    const noScripts = (m: string | null) => m === null || /max-width|pointer/.test(m);
    expect(panels.map((p) => hiddenBy(p, D_RULES, noScripts))).toEqual([[], [], []]);
    // Changed after the fix (RC2): no bar is drawn anywhere now.
    expect(D_RULES.filter((r) => r.selectors.some((s) => /tabsBox[^,]*::before/.test(s))).map((r) => r.media)).toEqual([]);
    // The rule between stacked panels, and only between panels that aren't tab panels.
    const between = D_RULES.filter((r) => r.media === null && r.selectors.some((s) => selectorMatches(panels[1]!, s)) && /border-top/.test(r.body));
    expect(between.flatMap((r) => r.selectors)).toEqual(['.panel:not([role="tabpanel"]) + .panel:not([role="tabpanel"])']);
    expect(text(panels[0]!)).toContain("The first project");
    for (const p of panels.slice(1)) expect(text(p)).toContain(POSSIBILITY_LABEL);
    const figure = findAll(server, (e) => e.tag === "figure" && e.attrs["aria-labelledby"] === "continuity-label")[0]!;
    expect(findAll(figure, (e) => e.tag === "button")).toEqual([]);
    expect(text(figure)).toContain(ILLUSTRATION.still);
    const drafts = findAll(server, (e) => (e.tag === "a" || e.tag === "button") && /^Draft /.test(text(e)));
    expect(drafts.map((d) => [d.tag, d.attrs.href])).toEqual([
      ["a", DRAFT_FALLBACK.idea],
      ["a", DRAFT_FALLBACK.need],
      ["a", DRAFT_FALLBACK.idea],
    ]);
    expect(byText(server, "button", /^Copy the line$/)).toEqual([]);
    expect(dialogs(server)).toEqual([]);
  });

  it("closed: hydrated, the tabs work as R4–R6 said — in Chrome 154 at 320 and 1280px, light: ArrowRight to 'Your work' drew the rust ring 3px inside the tab (offset -3px; the tab's box 424–477 inside the list's 424–478 at 320), its panel sat on the list with no gap, margin or rule, Tab went to the panel itself, and every panel's tabIndex was 0; one panel showed, `data-ready` was set, and no page logged an error or a warning at any of 10 width-and-theme pairs", () => {
    const hydrated = door({}, true);
    const box = findAll(hydrated, (e) => hasClass(e, "tabsBox"))[0]!;
    expect(box.attrs["data-ready"]).toBe("");
    expect(findAll(box, (e) => e.attrs.role === "tab").map(text)).toEqual(["Your people", "Your work", "Your audience"]);
    const panels = findAll(box, (e) => e.attrs.role === "tabpanel");
    expect(panels.map((p) => p.attrs.hidden !== undefined)).toEqual([false, true, true]);
    expect(panels.map((p) => p.attrs.tabindex)).toEqual(["0", "0", "0"]);
    // Once data-ready is set, the before-hydration rule lets go.
    expect(hiddenBy(panels[0]!, D_RULES, (m) => m === null || SCRIPTING(m))).toEqual([]);
    expect(value([".tab:focus-visible"], "outline-offset", (m) => m === null, D_RULES)).toBe("-3px");
    // The server's markup and the first client render agree: the server snapshot is false.
    expect(read("src/components/public/useHydrated.ts")).toMatch(/\(\) => true,\s*\n\s*\(\) => false,/);
    expect(door({}, false).children.length).toBeGreaterThan(0);
  });

  it("closed: round one's other rendering fixes hold in the browser — Chrome 154: the drafts' placeholders 6.37:1 light and 7.15:1 dark (R2); /power's 'recorded' and /rules' 'ENFORCED' 11.44:1 light and 12.02:1 dark (R3); on a touch phone at 320 and 375px the four places, Sign in, the wordmark, 'Copy the line', the text links, the strip's links, 'Read build.md' and 'Who holds the power today' 44px tall (R13), the footer's links 29.5px with their centres 29.5px apart (R11), and the picture's IMAGINE and FIRST PROJECT 10.5px at 320 and 12.5px at 375 (R12); without scripts /maintainers draws no draft link (R9); the button-drawn draft links on /build and the front door keep the button's colours, 12–15.07:1", () => {
    for (const scheme of SCHEMES) {
      const placeholder = value([".public .draft__field textarea::placeholder"], "color", (m) => m === null || (scheme === "dark" && DARK(m)));
      expect(contrast(resolve(placeholder!, scheme), resolve("var(--card)", scheme)), scheme).toBeGreaterThanOrEqual(4.5);
      const badge = resolve(value([".badgeRecorded"], "color", (m) => m === null, P_RULES)!, scheme);
      const tint = over(resolve("var(--accent-soft)", scheme), resolve("var(--paper)", scheme));
      expect(contrast(badge, tint), scheme).toBeGreaterThanOrEqual(4.5);
    }
    const coarse = (sel: string, rules: CssRule[]) => value([sel], "min-height", (m) => m !== null && /pointer:\s*coarse/.test(m), rules);
    for (const sel of [".public-nav a", ".public-wordmark", ".public-header__signin"]) expect(coarse(sel, G_RULES), sel).toBe("44px");
    for (const sel of [".btnSmall", ".textLink", ".proofLinks .textLink", ".values a", ".agentActions a", ".openFoot a"]) expect(coarse(sel, D_RULES), sel).toBe("44px");
    // Changed after the verification of M-0020 (R9): the rule holds for the footer wherever it is, the app's panel too.
    expect(value([".site-footer__links a"], "padding-block", (m) => m !== null && /pointer:\s*coarse/.test(m), G_RULES)).toBe("5px");
    for (const sel of [".orbitKicker", ".orbitFirstKicker"]) expect(value([sel], "font-size", (m) => m === null || /max-width/.test(m ?? ""), D_RULES), sel).toBe("16px");
    const maintainers = pageTree(MaintainersPage, false);
    expect(findAll(maintainers, (e) => (e.tag === "a" || e.tag === "button") && /^Draft /.test(text(e)))).toEqual([]);
    for (const id of ["maintainers-propose", "maintainers-need"]) expect(findAll(maintainers, (e) => e.attrs.id === id)).toHaveLength(1);
    expect(PUBLIC_CSS).toMatch(/\.page a:global\(\.btn\)\s*\{/);
  });

  it("closed: round one's honesty fixes hold, with their close variants — every link into a section of / or /feed lands on a section the page draws (the invite page's 'The promise behind our.one', the header's two places, the front door's own); no other public string still says what H2, H3, H4, H8, H11, H12 or H14 changed; and the fix's new words have their sources: 'today only the founder could' (D-0016 §N, FOUNDING-AUTHORITY), the rights' status (D-0017 §B; /agreement's 'In force on the feed'), 'will run under the common agreement' (/contract), 'A person reads every one you send.', and the trial's 'passed version 0.2.1' (its PITCH.md: READY TO PROPOSE on cce7ea3 with the tool's SHA-256, which is /build's) and 'passed version 0.1.0' (M-0016's trial)", async () => {
    // The links into sections.
    const feed = renderToStaticMarkup((await FeedPageRoute()) as ReactElement);
    const front = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    const pages: Record<string, string> = { "/": front, "/feed": feed };
    const targets = [
      ...[...read("src/app/(public)/i/[code]/page.tsx").matchAll(/href="(\/[a-z]*#[\w-]+)"/g)].map((m) => m[1]!),
      ...PLACES.filter((p) => p.href.includes("#")).map((p) => p.href),
      ...[...front.matchAll(/href="(#[\w-]+)"/g)].map((m) => `/${m[1]!}`),
    ];
    expect(targets).toEqual(expect.arrayContaining(["/feed#front-runs", "/#idea", "/#open", "/#part", "/#build"]));
    for (const href of targets) {
      const [path, id] = href.split("#");
      expect(pages[path || "/"] ?? "", href).toContain(`id="${id}"`);
    }
    // The phrasings round one changed are gone from every public string.
    const all = publicTextFiles(WEB).map((f) => flat(read(f))).join(" ");
    for (const old of ["None of it is in force", "same framework as every project", "holds the right to make it", "make ours next", "A person reads every one.", "This line hasn't been tried yet", "The feed runs under"]) {
      expect(all, old).not.toContain(old);
    }
    expect(flat(readRoot("kit/README.md"))).not.toMatch(/Not deployed yet|points at nothing/);
    // The new words' sources.
    expect(ILLUSTRATION.done).toContain("today only the founder could.");
    expect(record("decisions/D-0016.md")).toContain("nobody else holds it today.");
    expect(OURS_STATUS).toContain("None of its collective rights is in force");
    expect(record("decisions/D-0017.md")).toContain("None of the collective rights is in force on our.one yet.");
    expect(textOf(render(AgreementPage))).toContain("Take your own data and leave. Download it, and delete it all, whenever you want. Today: In force on the feed");
    expect(textOf(render(AgreementPage))).toMatch(/See the costs and the rules\. [^.]*\. Today: In force on the feed/);
    expect(textOf(render(ContractPage))).toContain("The feed will also run under the common agreement, which every service on our.one will sign.");
    expect(partFoot(true)).toMatch(/A person reads every one you send\.$/);
    const pitch = flat(readRoot("receipts/conformance/2026-10-03-M-0017-agent-trial/linden-tools/PITCH.md"));
    expect(pitch).toContain(`tool sha256 ${KIT_TOOL.sha256}`);
    expect(pitch).toContain("RESULT: READY TO PROPOSE.");
    expect(KIT_TOOL.version).toBe("0.2.1");
    expect(textOf(render(BuildPage))).toContain("passed version 0.2.1 of the check");
    expect(flat(readRoot("receipts/conformance/2026-10-02-M-0016-agent-trial/REPORT.md"))).toContain("ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7");
    expect(readRoot("receipts/conformance/2026-10-02-M-0016-agent-trial/book-club/scripts/our-one.mjs")).toContain('export const VERSION = "0.1.0";');
  });

  it("closed: the three new rules refuse nothing the site or the kit says — every public string and the kit's text scan clean; so do the front door in all eight states (joining or not, with or without PROPOSALS_EMAIL, before or after hydration), the six dialogs, /build, /maintainers, /privacy and /projects with and without the address; and round one's own examples are still caught", () => {
    expect(scanRepoPublicText(WEB).hits).toEqual([]);
    expect(scanKitText(WEB).hits).toEqual([]);
    for (const joining of [true, false]) {
      for (const email of [null, EMAIL]) {
        for (const hydrated of [false, true]) {
          expect(scanText(text(door({ joining, email }, hydrated)), null), `${joining} ${email} ${hydrated}`).toEqual([]);
        }
      }
    }
    for (const email of [null, EMAIL]) {
      vi.stubEnv("PROPOSALS_EMAIL", email ?? "");
      // Each page with its own file, so the sentences ALLOWLIST lists there (the handover's on /projects) pass there.
      for (const [component, file] of [
        [BuildPage, null],
        [MaintainersPage, null],
        [PrivacyPage, null],
        [ProjectsPage, "src/app/(public)/projects/page.tsx"],
      ] as [FunctionComponent, string | null][]) {
        for (const hydrated of [false, true]) expect(scanText(text(pageTree(component, hydrated)), file), `${file} ${hydrated}`).toEqual([]);
      }
      vi.unstubAllEnvs();
    }
    for (const s of [TAGLINE, DOOR_EYEBROW, `${IDEA_CLOSE[0]} ${IDEA_CLOSE[1]}`, `${PART_HEADING[0]} ${PART_HEADING[1]}`]) expect(scanText(s, null), s).toEqual([]);
    for (const claim of ["User control is built.", "The holder now holds your data.", "The data safeguards are built.", "Your data is protected by our.one.", "It's already ours.", "It is now ours.", "The feed is ours.", "our.one is ours."]) {
      expect(scanText(claim, null).length, claim).toBeGreaterThan(0);
    }
  });

  it("closed: the words on the pages M-0017 changed, read again after the fixes, in both settings and both states — nothing says user control, the holder or a safeguard exists; no new sentence turns at the deploy (the README's 'Once our.one is deployed, it serves them … They are here, in the repository, either way.' is true on both sides of it); without the address nothing offers email, and with it the address appears; and /privacy says what the drafts do in both", () => {
    const affirm = /\buser control (?:is|was|exists|has)\b|\bholder (?:holds|has|keeps|owns|exists|is|was)\b|\bsafeguards? (?:is|are|exist|exists|was|were|has|have) (?:built|in place|working|live|in force|here|ready)/i;
    const deploy = /\b(?:not (?:yet )?deployed|is deployed|deployed (?:yet|now)|live now|is live|now live|launched|tested locally|in production)\b/i;
    for (const email of [null, EMAIL]) {
      vi.stubEnv("PROPOSALS_EMAIL", email ?? "");
      const texts: [string, string][] = [
        ["/", text(door({ email }, true))],
        ["/ (server)", text(door({ email }, false))],
        ["/build", text(pageTree(BuildPage, true))],
        ["/maintainers", text(pageTree(MaintainersPage, true))],
        ["/projects", text(pageTree(ProjectsPage, false))],
      ];
      for (const [where, words] of texts) {
        const sentences = words.split(/(?<=[.!?])\s+/).filter((s) => affirm.test(s) && !/\b(?:isn't|aren't|not|no|none|until|before|once)\b/i.test(s));
        expect(sentences, `${where} ${String(email)}`).toEqual([]);
        expect(words, `${where} ${String(email)}`).not.toMatch(deploy);
        if (!email) expect(words, where).not.toMatch(/Open in my email|ideas@example\.test/);
      }
      const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
      expect(privacy).toContain(
        email
          ? "unless you copy it or open it in your own email app and send it yourself."
          : "it's gone when you close or reload the page, unless you copy it.",
      );
      vi.unstubAllEnvs();
    }
    const readme = flat(readRoot("kit/README.md"));
    expect(readme).toContain("Once our.one is deployed, it serves them at the addresses below, from the commit it runs. They are here, in the repository, either way.");
    expect(textOf(render(BuildPage))).not.toMatch(deploy);
  });

  it("closed: build.md, read from its first line as a fresh coding agent reads it, keeps the order D-0020 §D sets and the trial's fixes — ask (with the name, the repository's address, download and deletion, who can see each thing including whoever runs it, and the companies, which the person chooses), draft PITCH.md before any code with no command in step 2, ask 'find out first, or build now?', and only then the tool; finding out writes no code and keeps no one's data, and the answers kept go in PITCH.md and NOTES.md, the person's own; the headings are the ones init writes, init leaves a drafted PITCH.md as it is, and the tool runs where step 2 left a folder with no git; a PITCH.md still saying TODO doesn't keep the check from READY TO PROPOSE, so step 7's order works; and 'RESULT lines' fits an output whose RESULT runs over more than one line", () => {
    const steps = [...BUILD_MD.matchAll(/^## (\d)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2]}`);
    expect(steps.slice(0, 3)).toEqual(["1. Ask the person", "2. Draft the idea, before any code", "3. Get the tool, and set the project up"]);
    const step1 = flat(BUILD_MD.slice(BUILD_MD.indexOf("## 1. Ask the person"), BUILD_MD.indexOf("## 2. Draft the idea")));
    for (const asked of ["What is it called, even for now?", "including whoever runs the service?", "How will a person download it, and delete it?", "The person chooses the companies", "ask them to say yes to it", "Where will its code be public (the repository's address)?", "And what happens if they don't?", "keep the rest in a short `NOTES.md` beside it. Neither holds anyone's data but the person's own."]) {
      expect(step1, asked).toContain(asked);
    }
    const step2 = BUILD_MD.slice(BUILD_MD.indexOf("## 2. Draft the idea"), BUILD_MD.indexOf("## 3. Get the tool"));
    expect(step2).not.toMatch(/```(?:sh|powershell)|\bnode |\bcurl |\bnpm |\bpnpm |git init/);
    expect(flat(step2)).toContain("Finding out writes no code and collects no one's data: no sign-up page and no form, and no list of who said yes in the project's folder.");
    expect(BUILD_MD.indexOf("node scripts/our-one.mjs init")).toBeGreaterThan(BUILD_MD.indexOf("## 3. Get the tool"));

    // init writes the same headings, and leaves a drafted PITCH.md as it is, in a folder with no git.
    const tool = readFileSync(TOOL, "utf8");
    const template = tool.slice(tool.indexOf("const PITCH_TEMPLATE"), tool.indexOf("`;", tool.indexOf("const PITCH_TEMPLATE")));
    const block = step2.slice(step2.indexOf("```text"), step2.indexOf("```", step2.indexOf("```text") + 7));
    expect([...block.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual([...template.matchAll(/^## (.+)$/gm)].map((m) => m[1]));
    const pitch = "# Proposal: FICTIONAL Tool Shelf\n\n## The need\n\nFICTIONAL neighbours.\n\n## What it offers\n\nTODO\n";
    const dir = folder({ "PITCH.md": pitch });
    expect(runTool(dir, ["init"]).status).toBe(0);
    expect(readFileSync(join(dir, "PITCH.md"), "utf8")).toBe(pitch);
    const report = JSON.parse(runTool(dir, ["check", "--json"]).stdout) as { pitch: string };
    expect(report.pitch).toBe("todo");

    // The pitch's TODO is said under READY TO PROPOSE, not counted as a failure; the RESULT runs on.
    const format = tool.slice(tool.indexOf("export function formatReport"), tool.indexOf("/** For a stop hook"));
    const ready = format.slice(format.indexOf("} else {"), format.indexOf('out.push("");', format.indexOf("} else {")));
    expect(ready).toContain("RESULT: READY TO PROPOSE");
    expect(ready).toContain("That's all passing means.");
    expect(ready).toContain("PITCH.md still says TODO");
    expect(flat(BUILD_MD)).toContain("Copy into it the check's RESULT lines and its tool sha256 line, with the commit the check ran on.");
    expect(flat(readRoot("kit/README.md"))).toContain(AGENT_LINE);
  });

  it("closed: the adapted tests kept their force — R10's test still fails without the rule it accepts (the stylesheet without its `(scripting: enabled)` block leaves the server's panels unhidden and no such rule); H17's two adaptations still find no draft on /projects, before or after hydration, and both kinds on /maintainers once hydrated and none before; the invite link's four adapted tests name /feed#front-runs, which /feed draws; M-0015's re-check counts no button-drawn link on its eight pages, and the one /build draws without scripts keeps the button's colours by `.page a:global(.btn)`; and the illustration's adapted check asks for the still words without scripts and the button's words with them", async () => {
    // Changed after the fix (RC2): R10's rule hid the panels for good where the
    // page's scripts never run, so it is gone; R10's test now asks for the
    // panels unhidden before hydration and for the scroll back to the section the
    // address names once hydrated, and fails without that scroll.
    const r10 = (tabs: string) => /window\.location\.hash/.test(tabs) && /scrollIntoView\(\)/.test(tabs);
    const tabs = read("src/components/public/ServiceTabs.tsx");
    expect([r10(tabs), r10(tabs.replace("target.scrollIntoView()", "void target"))]).toEqual([true, false]);
    expect(DOOR_CSS).not.toMatch(/\.panel \+ \.panel\s*\{\s*display:\s*none/);
    // H17 and R9.
    for (const hydrated of [false, true]) {
      expect(findAll(pageTree(ProjectsPage, hydrated), (e) => (e.tag === "a" || e.tag === "button") && /^Draft /.test(text(e)))).toEqual([]);
    }
    expect(dialogs(pageTree(MaintainersPage, true)).map((d) => text(findAll(d, (e) => e.tag === "h2")[0]!))).toHaveLength(2);
    // The invite link.
    for (const file of ["tests/invite-page.test.ts", "tests/verify-m0014-honesty.test.ts", "tests/verify-m0014-recheck.test.ts", "tests/verify-m0014-render.test.ts"]) {
      expect(read(file), file).toContain("/feed#front-runs");
      expect(read(file), file).not.toMatch(/"\\\/#front-runs"|"\/#front-runs"|href="\\\/#front-runs/);
    }
    expect(renderToStaticMarkup((await FeedPageRoute()) as ReactElement)).toContain('id="front-runs"');
    // M-0015's re-check, and the illustration's check.
    expect(read("tests/verify-m0015-recheck.test.ts")).toContain("expect(all.length - links.length).toBe(0);");
    expect(read("tests/verify-m0017-rendering.test.ts")).toContain("expect(text(off)).toContain(ILLUSTRATION.still);");
    expect(read("tests/verify-m0016-recheck.test.ts")).toContain('expect(/passed the check/.test(text) && !/0\\.1\\.0/.test(text)).toBe(false);');
    expect(ANSWER_LIMIT).toBe(600);
    expect(textOf(render(BuildPage))).toContain(AGENT_LINE);
  });
});
