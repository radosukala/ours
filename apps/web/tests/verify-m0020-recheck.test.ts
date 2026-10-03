/**
 * The re-check of M-0020 (one our.one, signed in or not; D-0023; SPEC
 * §18.22), step 4 of the verification's stopping rule: one agent that built
 * none of it and verified none of it, after round one's fixes (8dc4094) and
 * their receipts (a832a99, 0b6de40). Both lenses: honesty, and rendering and
 * use. It changes no product code, no record, no receipt and no other test.
 *
 * What was read: AGENTS.md (§6, §7, §9–§12); D-0023; M-0020 (.md and
 * .yaml); SPEC §9 with its new note, and §18.22; the verification receipt
 * (the stopping rule, round one and what was done with each finding) and the
 * build receipt; the two verifiers' files as written (6d29552, 27e82e1) and
 * as adapted, with every "Changed after the verification of M-0020" and
 * "Retitled after" comment; `git diff 4e04af5 0b6de40` (every product file,
 * and the 24 tests it adapted); the M-0017 re-check and its receipt, for
 * method.
 *
 * What was run, each under `env -i` with only what it needs: the whole
 * suite on 0b6de40 before this file existed (65 files, 1,658 pass and 2
 * skipped, as the receipts say), typecheck, lint, the claims scan (no
 * prohibited claim in 178 files, 17 sentences listed), the kit's check
 * (READY TO PROPOSE), `pnpm ours check M-0020 --changed` as its script runs
 * it, `node packages/cli/src/main.ts check M-0020 --changed` (AUTHORISED;
 * with a clean tree it evaluates no path, so the fixes' paths are checked
 * here from git), and `next build`.
 *
 * What was served: that build, by `next start` on 127.0.0.1:3733, under
 * `env -i` with FICTIONAL settings (NODE_ENV=production, DATA_CONTROLLER=
 * "FICTIONAL Controller", DATA_CONTROLLER_EMAIL=controller@example.test, a
 * FICTIONAL SESSION_SECRET, APP_URL=http://localhost:3733,
 * MAIL_TRANSPORT=outbox, CLIENT_IP_HEADER=x-forwarded-for,
 * PROPOSALS_EMAIL=ideas@example.test, telemetry off), on a database of its
 * own (ours_m0020_rc: made with createdb, migrated and seeded with the app's
 * own scripts, dropped afterwards), with a preload that refused any
 * connection or name lookup leaving the machine (none was attempted); then
 * again with DATABASE_URL on a closed port. Sessions for the FICTIONAL
 * @ada_quillon (administrator) and @bruno_varnell were started with the
 * app's own createSession and handed to the browser as `__Host-ours_session`;
 * no cookie, session id or secret was printed, and the server's logs were
 * only counted, never shown.
 *
 * What was seen: chrome-headless-shell (HeadlessChrome/153.0.8010.12), driven
 * over the DevTools protocol by the re-checker's own scripts, with a fresh
 * profile deleted afterwards and nothing resolving but localhost:
 * - 16 signed-in pages at 320, 375 (dark), 820, 1000 (dark) and 1440px, with
 *   touch below 1000px: sideways scroll, boxes past the edge, every field's
 *   edge; the front door, /feed and /agreement as a member and a visitor at
 *   1440 and 375px; the header's two places into the front door, clicked
 *   from /build, and fresh loads of /#idea and /#open;
 * - the panel at 1440×900, 1440×780, 1366×657, 1280×600, 1000×700 and
 *   1000×560 (its box, its scroll, its stickiness, Tab and Shift+Tab through
 *   all of it), and at 1366×657 with a 15px scrollbar that takes room;
 * - the panel's draft dialogs by keyboard, light and dark, and the same
 *   dialog from the front door; the composer; the member's menu (Escape, a
 *   click outside, over the panel); touch heights; the counts;
 * - 60 Tabs and 40–60 Shift+Tabs on /home, /notifications, /people and
 *   /settings at 320–1440px, for focus under the bar or the page's header;
 * - the pictures on /feed at 320–1440px, light and dark;
 * - with the database's port closed: /, /feed, /agreement and an address
 *   with no route, as a visitor and as @bruno_varnell; /home and /settings
 *   (the error page, by keyboard).
 *
 * Each finding is a "DEFECT (SEVERITY): …" test that FAILS on 0b6de40 and
 * passes once fixed, by whichever fix the finding allows; where only a
 * browser shows it, the title says what was measured and the test pins the
 * cause in the stylesheet, the markup or the words. Any assertion before the
 * last is evidence, and passes; evidence about a file a fix would change is
 * read from 0b6de40 itself (`git show`), so it holds after the fix. Each
 * check that held is a "closed: …" test that passes. Before this file was
 * committed, it was run in a scratch clone of 0b6de40 with a plausible fix
 * for each finding: all of its tests passed there, and so did the whole
 * suite (66 files, 1,681 pass, 2 skipped). That clone is not part of this
 * file, and nothing in it is a decision about how to fix anything.
 *
 * Severity: HIGH, a false claim about authority, ownership, control or
 * status, private data exposed, or a page that fails; MEDIUM, a stated
 * requirement unmet, a sentence that misleads about what the product does,
 * or a real usability or accessibility failure; LOW, a stale or imprecise
 * sentence in a comment, a test title, the SPEC or a receipt (as round one
 * rated its own), or polish.
 *
 * Every person, address and database here is FICTIONAL. Nothing here
 * connects anywhere: the session, the database and the count are mocked.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hydration = vi.hoisted(() => ({ ready: false }));
const nav = vi.hoisted(() => ({ path: "/home" }));
/** The request this file imitates. */
const state = vi.hoisted(() => ({
  cookie: null as string | null,
  db: "up" as "up" | "down",
  /** Whether the session behind the cookie is a member's. */
  member: false,
  /** The older files' way to fake a member: the getViewer export answers a viewer. */
  exportMember: false,
  /** Let the real sessionFromCookie run: it refuses a cookie that isn't signed before any query. */
  realSession: false,
}));

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
  permanentRedirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/web/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/web/session")>()),
  readSessionCookie: async () => state.cookie,
}));
vi.mock("@/core/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/core/auth")>();
  return {
    ...real,
    sessionFromCookie: async (...args: Parameters<typeof real.sessionFromCookie>) => {
      if (state.realSession) return real.sessionFromCookie(...args);
      if (state.db === "down") throw new Error("FICTIONAL: connect ECONNREFUSED");
      return state.member ? "FICTIONAL-account" : null;
    },
    viewerAccount: async () => {
      if (state.db === "down") throw new Error("FICTIONAL: connect ECONNREFUSED");
      return state.member
        ? { id: "FICTIONAL-account", handle: "ada_fict", displayName: "Ada Fictional", isAdmin: false, acceptsFollowers: false, invitesRemaining: 3 }
        : null;
    },
  };
});
vi.mock("@/core/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/db")>()),
  getDb: () => ({ fictional: "a database handle" }),
}));
vi.mock("@/core/seats", () => ({
  memberCount: async () => {
    if (state.db !== "up") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return 12;
  },
  seatState: async () => {
    if (state.db !== "up") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return { open: 3, waiting: 0 };
  },
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({ takeSeat: vi.fn(async () => ({ ok: true })) }));
// As verify-m0017-recheck and verify-m0017-rendering fake a member: the export answers a viewer.
vi.mock("@/web/viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/web/viewer")>();
  return {
    ...real,
    getViewer: async () => (state.exportMember ? ({ id: "FICTIONAL-viewer" } as unknown as Awaited<ReturnType<typeof real.getViewer>>) : real.getViewer()),
  };
});

import FeedPageRoute from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import FrontDoorRoute from "@/app/(public)/page";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";
import { MemberLinks } from "@/components/MemberLinks";
import { OursCard, RightColumn } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";
import { DraftButton } from "@/components/public/Draft";
import { MEMBER_JOIN, MEMBER_PANEL, TAGLINE } from "@/components/public/door";
import { FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview } from "@/components/public/FeedPreview";
import { FrontPage } from "@/components/public/FrontPage";
import { PLACES } from "@/components/public/places";
import { ALLOWLIST, scanKitText, scanRepoPublicText } from "@/core/claims";
import { getViewer, isMemberHere } from "@/web/viewer";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const VERIFICATION = "receipts/conformance/2026-10-03-M-0020.verification.md";
const BUILD = "receipts/builds/2026-10-03-M-0020.md";
const EMAIL = "ideas@example.test";

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
const record = (path: string) => readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
/** A source file read as prose: comment markers at the start of a line dropped, whitespace collapsed. */
const prose = (rel: string) => flat(read(rel).replace(/^\s*(?:\/\*\*?|\*\/|\*(?!\/)|\/\/)[ \t]?/gm, ""));

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/** The commit this re-check looked at. Evidence about it is read from it, so it holds after any fix. */
const RECHECKED = "0b6de40";
/** A file of the repository as it was on the re-checked commit. */
const then = (rel: string) => git(["show", `${RECHECKED}:${rel}`]);
/** A file of apps/web as it was on the re-checked commit. */
const webThen = (rel: string) => then(`apps/web/${rel}`);
/** A record as a reader reads it, as it was on the re-checked commit. */
const recordThen = (path: string) => then(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");

/** Every file under a directory of apps/web, relative to apps/web. */
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

/** A test's title in a test file, from `it("<starts>` to the end of the string. */
function titleOf(src: string, starts: string): string {
  const at = src.indexOf(`it("${starts}`);
  if (at === -1) return "";
  return src.slice(at + 4, src.indexOf('", ', at));
}

/** A test's body: from its title to the next test. */
function bodyOf(src: string, starts: string): string {
  const at = src.indexOf(`it("${starts}`);
  if (at === -1) return "";
  const next = src.indexOf("\n  it(", at + 1);
  return src.slice(at, next === -1 ? undefined : next);
}

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

/** The whole HTML, every Suspense boundary resolved, as a server sends it once it is done. */
async function full(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

/** The public layout's header, resolved, for the request `state` describes. */
async function publicHeader(): Promise<string> {
  const html = await full(createElement(PublicLayout, null, "FICTIONAL page"));
  return html.slice(html.indexOf("<header"), html.indexOf("</header>") + 9);
}

/* ---------------------------------------------------------------- markup */

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

/** Rendered to a tree, the interactive parts in their hydrated form when `hydrated`. */
function tree(node: ReactNode, hydrated = false): El {
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

const VIEWER = { handle: "ada_fict", displayName: "Ada Fictional", isAdmin: true };
const memberHeader = (viewer = VIEWER) =>
  tree(inShell(createElement(SiteHeader, { member: true } as Parameters<typeof SiteHeader>[0], createElement(MemberLinks, { viewer, counts: { unread: 3, pending: 1 } })), "header"));

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
  return Object.fromEntries(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((m) => [m[1]!.trim(), m[2]!.replace(/!important/, "").trim()]),
  );
}

const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");
const POSTS_CSS = read("src/components/posts/posts.module.css");
const DOOR_CSS = read("src/components/public/door.module.css");
/** The order a signed-in page loads them in: the global sheet first, then the modules. */
const G_RULES = cssRules(GLOBALS, "globals.css");
const P_RULES = cssRules(PUBLIC_CSS, "public.module.css", 100_000);
const POST_RULES = cssRules(POSTS_CSS, "posts.module.css", 200_000);
const BOX_RULES = [
  ...cssRules(read("src/components/safety/safety.module.css"), "safety.module.css", 300_000),
  ...cssRules(read("src/components/people/people.module.css"), "people.module.css", 400_000),
  ...cssRules(read("src/components/NotificationRow.module.css"), "NotificationRow.module.css", 500_000),
];
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
  for (const ch of selector) {
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

function selectorMatches(el: El, selector: string, st: State = {}): boolean {
  if (selector.includes("::")) return false;
  const parts = split(selector);
  return parts.length > 0 && matchesFrom(el, parts, parts.length - 1, st);
}

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

const hex = (c: Rgba) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

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
  const c = /#[0-9a-f]{6}\b|rgba?\([^)]+\)/i.exec(s);
  if (!c) throw new Error(`no colour in ${v}`);
  return colour(c[0]);
}

const PAPER = (ctx: Ctx) => resolve("var(--paper)", ctx);

/** What is behind an element: its own and its ancestors' backgrounds over the paper. */
function backdrop(el: El, ctx: Ctx, st: State = {}, rules: CssRule[] = ALL_RULES): Rgba {
  const chain: El[] = [];
  for (let e: El | null = el; e && e.tag !== "#root"; e = e.parent) chain.unshift(e);
  let c = PAPER(ctx);
  for (const e of chain) {
    const d = cascade(e, ["background", "background-color"], ctx, st, rules);
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
function borderColour(el: El, ctx: Ctx, rules: CssRule[] = ALL_RULES): Rgba {
  const d = cascade(el, ["border", "border-color", "border-top-color"], ctx, {}, rules);
  if (!d) throw new Error("no border");
  const raw = d.prop === "border" ? (d.value.split(/\s+(?![^(]*\))/).find((p) => /^(var|#|rgb)/.test(p)) ?? "") : d.value;
  return resolve(raw, ctx);
}

beforeEach(() => {
  Object.assign(state, { cookie: null, db: "up", member: false, exportMember: false, realSession: false });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  hydration.ready = false;
  nav.path = "/home";
  vi.restoreAllMocks();
});

/* =============================================================== findings */

describe("findings (each FAILS on 0b6de40, and passes once fixed)", () => {
  it("DEFECT (MEDIUM): R2's fix put the panel's acid on everything inside our.one's card, and the two draft dialogs the card's buttons open are inside it, on the paper: in the light theme their fields, 'Copy my draft', 'Open in my email' and the × are ringed in the acid, 1.09:1 on the dialog's paper (1.2:1 on a field), where a focus indicator needs 3:1 (WCAG 2.4.7 with 1.4.11), and 'Open in my email' is drawn as an acid block where the same dialog has an outline button — measured in Chromium 153 against next start of 0b6de40 at 1440px, light, as the FICTIONAL @ada_quillon with PROPOSALS_EMAIL set: Enter on 'Name a need' opened the dialog with focus in its first field, ringed 3px rgb(225, 242, 139) on rgb(245, 243, 235), and Tab drew the same ring on its other two fields, both buttons and the dialog's × ('Open in my email' itself rgb(225, 242, 139)); the same dialog opened from the front door's 'your part' rings rgb(191, 65, 29), 4.74:1. It is the M-0017 re-check's RC1 (MEDIUM) again, which door.module.css answers for the builders' band with `.builders .draft :focus-visible`; SPEC §18.22 gives the acid to 'our.one's panel', on the forest, and the rendering verifier's closed check still says the drafts' 'rings are rust on the paper (4.74:1, 7.22:1 dark)'. Dark: the acid on the dark paper is 14.56:1", () => {
    const panel = tree(inShell(createElement(OursCard, { email: EMAIL }), "aside"), true);
    const card = byClass(panel, "card--ours")[0]!;
    // On the re-checked commit: the rules R2's fix made win, over everything inside the card.
    const cssThen = webThen("src/app/globals.css");
    expect(cssThen).toContain(".public .card--ours :focus-visible {\n  outline-color: var(--acid, #e1f28b);\n}");
    expect(cssThen).toContain(".public .card--ours .btn--outline {\n  border-color: var(--acid, #e1f28b);\n  background: var(--acid, #e1f28b);");
    expect(flat(webThen("SPEC.md"))).toContain("in our.one's panel the focus ring and the buttons' edges are the acid, over the public pages' rust and ink;");
    expect(webThen("tests/verify-m0020-rendering.test.ts")).toContain("its rings are rust on the paper (4.74:1, 7.22:1 dark)");
    // The dialog's own paper.
    expect(value([".public .draft"], "background")).toBe("var(--paper)");
    // R2 holds on the card's own targets: the acid on the forest.
    const own = tabbable(card);
    expect(own.map(text)).toEqual([`${MEMBER_PANEL.need} ↗`, `${MEMBER_PANEL.idea} ↗`, ...PLACES.map((p) => p.label)]);
    for (const scheme of SCHEMES) {
      const ctx = at(1440, scheme === "dark");
      for (const t of own) expect(contrast(ringColour(t, ctx).colour, backdrop(card, ctx)), `${scheme} ${text(t)}`).toBeGreaterThanOrEqual(3);
    }
    // The builders' band answers the same case with a rule of its own (the M-0017 re-check, RC1).
    expect(DOOR_CSS).toMatch(/\.builders :global\(\.draft\) :focus-visible \{\s*outline: 3px solid var\(--rust\);/);
    // The same dialog, opened elsewhere (the front door's 'your part'): its outline button.
    const elsewhere = tree(
      createElement("div", { className: "public" }, createElement("main", null, createElement(DraftButton, { kind: "need", label: "Draft a need", email: EMAIL, className: "btn btn--outline" }))),
      true,
    );
    const emailButton = (t: El) => findAll(t, (e) => e.tag === "button" && text(e) === "Open in my email")[0]!;
    const fill = (el: El) => cascade(el, ["background", "background-color"], WIDE)?.value;
    expect(fill(emailButton(elsewhere))).toBe("transparent");

    // The defect: inside the panel, every ring in the dialogs on their paper, and the outline button's fill.
    const problems: string[] = [];
    for (const d of findAll(panel, (e) => e.tag === "dialog")) {
      for (const el of findAll(d, (e) => e.tag === "textarea" || e.tag === "button")) {
        for (const scheme of SCHEMES) {
          const ctx = at(1440, scheme === "dark");
          const ring = ringColour(el, ctx);
          const ratio = contrast(ring.colour, backdrop(el.parent!, ctx));
          if (ratio < 3) problems.push(`${scheme} ${el.tag} "${el.attrs["aria-label"] ?? (text(el) || el.attrs.placeholder)}": ${hex(ring.colour)} from "${ring.selector}", ${ratio}:1`);
        }
      }
    }
    const inPanel = findAll(panel, (e) => e.tag === "button" && text(e) === "Open in my email");
    expect({ rings: problems, emailButton: inPanel.map(fill) }).toEqual({ rings: [], emailButton: inPanel.map(() => fill(emailButton(elsewhere))) });
  });

  it("DEFECT (LOW): R13's fix missed one of the fields R13 named, the composer's audience ('Friends'): posts.module.css's `.audience { border-color: var(--outline-border) }` loads after globals.css and wins over `.input`'s new `var(--field-border, …)`, so its edge is still the line, #b9c0ac, 1.69:1 on the paper and 1.86:1 on its own fill (dark #4a594b, 2.38:1 and 2.14:1), under the 3:1 WCAG 1.4.11 asks — measured in Chromium 153 against next start of 0b6de40 on /home at 320, 375, 820, 1000 and 1440px, light and dark: the select's border rgb(185, 192, 172) (dark rgb(74, 89, 75)), and every other field (/settings' three, /settings/delete, /people/invites, /report, /admin's two) rgb(88, 97, 87) (dark rgb(167, 177, 156)). SPEC §18.22: 'a field's edge is --sub, 3:1 or more on its paper (5.79:1 light, 7.93:1 dark)'; the receipt's R13: 'Fixed'. (It keeps its 9999px pill too.)", () => {
    expect(read("src/components/posts/Composer.tsx")).toContain("className={`input select ${styles.audience}`}");
    // On the re-checked commit: the module's own edge, after the global sheet's.
    expect(webThen("src/components/posts/posts.module.css")).toMatch(/\.audience \{[^}]*border-radius: 9999px;\s*border-color: var\(--outline-border\);/);
    expect(webThen("src/app/globals.css")).toContain("border: 1px solid var(--field-border, var(--outline-border));");
    expect(flat(webThen("SPEC.md")).replace(/[*`]/g, "")).toContain("a field's edge is --sub, 3:1 or more on its paper (5.79:1 light, 7.93:1 dark);");
    expect(recordThen(VERIFICATION)).toContain("| R13 | LOW | The fields' edges were 1.69:1 on the paper. | Fixed: --sub, 5.79:1 light and 7.93:1 dark. |");
    expect(git(["show", "27e82e1:apps/web/tests/verify-m0020-rendering.test.ts"])).toContain("measured in Chromium 153 at 1440px: the composer's audience, /settings' Name and Bio");
    const rules = [...G_RULES, ...P_RULES, ...POST_RULES];
    const composer = tree(
      inShell(
        createElement(
          "form",
          { className: "composer" },
          createElement(
            "div",
            { className: "composer__bar" },
            createElement("select", { className: "input select audience", "aria-label": "Who can see this" }, createElement("option", null, "Friends")),
            createElement("input", { className: "input", "aria-label": "FICTIONAL" }),
          ),
        ),
        "main",
      ),
    );
    const select = findAll(composer, (e) => e.tag === "select")[0]!;
    const field = findAll(composer, (e) => e.tag === "input")[0]!;
    const edge = (el: El, ctx: Ctx) => {
      const c = borderColour(el, ctx, rules);
      return { onPaper: contrast(c, PAPER(ctx)), onFill: contrast(c, backdrop(el, ctx, {}, rules)) };
    };
    // Every other field holds R13's fix.
    expect(SCHEMES.map((s) => edge(field, at(1440, s === "dark")).onPaper)).toEqual([5.79, 7.93]);

    // The defect.
    const measured = SCHEMES.map((s) => ({ scheme: s, ...edge(select, at(1440, s === "dark")) }));
    expect(measured.filter((m) => m.onPaper < 3 || m.onFill < 3)).toEqual([]);
  });

  it("DEFECT (LOW): two test titles round one wrote or left aren't so. H13 retitled verify-m0013-render's 'accepted' check to say that 'the site's link blue gave way to the rust under M-0020 (D-0023 §A, 4.74:1 on the paper), which colours 'Privacy' under the form, as on every page that uses the shared .link'; but `.public .link` (since M-0017) draws it in the ink, and every page is `.public` now — served on /feed against 0b6de40: 'Privacy' rgb(34, 43, 36), underlined (dark rgb(235, 238, 227)). And 0b6de40 adapted the honesty lens's scope check to the receipt after round one ('The re-check has not run yet.') and left its title saying 'the verification not yet run'. H13's row: the titles say what their bodies check", () => {
    const starts13 = "accepted (SPEC §18.15, after the verification): the site's link blue";
    // On the re-checked commit: the title H13 wrote.
    const m13Then = webThen("tests/verify-m0013-render.test.ts");
    expect(titleOf(m13Then, starts13)).toContain(
      "the site's link blue gave way to the rust under M-0020 (D-0023 §A, 4.74:1 on the paper), which colours 'Privacy' under the form, as on every page that uses the shared .link",
    );
    expect(bodyOf(m13Then, starts13)).toContain("Retitled after the verification of M-0020 (H13)");
    const t13 = titleOf(read("tests/verify-m0013-render.test.ts"), starts13);
    // 'Privacy' under the form, as /feed draws it.
    const page = tree(createElement("div", { className: "public" }, createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, seatsWaiting: 0 })));
    const privacy = findAll(page, (e) => e.tag === "a" && hasClass(e, "link") && text(e) === "Privacy");
    expect(privacy).toHaveLength(1);
    expect(value([".link"], "color")).toBe("var(--accent)");
    const drawn = SCHEMES.map((s) => {
      const ctx = at(1440, s === "dark");
      const d = cascade(privacy[0]!, ["color"], ctx)!;
      return { selector: d.selector, colour: hex(resolve(d.value, ctx)), rust: hex(resolve("var(--rust)", ctx)) };
    });
    expect(drawn.map((d) => d.selector)).toEqual([".public .link", ".public .link"]);
    // The honesty lens's scope check: 0b6de40 changed its body alone.
    const scopeStarts = "closed: M-0020 stayed in its scope";
    const honestyThen = webThen("tests/verify-m0020-honesty.test.ts");
    expect(titleOf(honestyThen, scopeStarts)).toContain("TESTED locally, nothing pushed or deployed, the verification not yet run, only R-SCOPE ENFORCED");
    expect(bodyOf(honestyThen, scopeStarts)).toContain('expect(receipt).toContain("The re-check has not run yet.");');
    expect(git(["show", "--name-only", "--format=", "0b6de40"]).trim()).toBe("apps/web/tests/verify-m0020-honesty.test.ts");
    expect(git(["diff", "-U0", "a832a99", "0b6de40"]).split("\n").filter((l) => /^[-+]\s+it\(/.test(l))).toEqual([]);
    const honesty = read("tests/verify-m0020-honesty.test.ts");
    const scopeTitle = titleOf(honesty, scopeStarts);
    const scopeBody = bodyOf(honesty, scopeStarts);

    // The defect.
    expect({
      privacy: /gave way to the rust[\s\S]*colours 'Privacy' under the form/.test(t13) && drawn.some((d) => d.colour !== d.rust),
      scope: scopeTitle.includes("the verification not yet run") && scopeBody.includes("after round one"),
    }).toEqual({ privacy: false, scope: false });
  });

  it("DEFECT (LOW): H5's one rule turned two older checks of a signed-in member into checks of a visitor. verify-m0017-recheck's RC8 test (unskipped and renamed 'fixed' under H14: 'for a signed-in visitor, two of the header's four places don't reach what they name') and verify-m0017-rendering's 'signed in, / and /feed send no one away (… both routes render for a member)' (retitled under H13: 'the title says what the body checks now') fake the member by replacing the getViewer export. Since H5 both routes ask isMemberHere, which calls viewer.ts's own getViewer, so under those files' mocks the cookie is a FICTIONAL one that isn't signed, nobody is a member, and both routes render the visitor's front door and /feed: the join form, and no 'You're in.' (run here with the same mocks). Both still pass, whatever a member would be shown", async () => {
    const files = ["tests/verify-m0017-recheck.test.ts", "tests/verify-m0017-rendering.test.ts"];
    // On the re-checked commit: how those two files fake a member, and what their titles say.
    for (const f of files) {
      const src = webThen(f);
      expect(src, f).toContain('readSessionCookie: async () => (auth.signedIn ? "FICTIONAL-session" : undefined),');
      expect(src, f).toContain('getViewer: async () => (auth.signedIn ? { id: "FICTIONAL-viewer" } : null),');
      expect(src, f).not.toMatch(/\bisMemberHere\s*:/);
    }
    const rc8 = "fixed (LOW; decided by D-0023 §C, built under M-0020)";
    expect(titleOf(webThen(files[0]!), rc8)).toContain("for a signed-in visitor, two of the header's four places don't reach what they name");
    expect(bodyOf(webThen(files[0]!), rc8)).toContain("auth.signedIn = true;");
    const r17 = "closed: signed in, / and /feed send no one away";
    expect(titleOf(webThen(files[1]!), r17)).toContain("both routes render for a member");
    expect(bodyOf(webThen(files[1]!), r17)).toContain("Retitled after the verification of M-0020 (H13): the title says what the body checks now.");
    // Both routes ask isMemberHere, which calls viewer.ts's own getViewer, not the module's export.
    for (const route of ["src/app/(public)/page.tsx", "src/app/(public)/feed/page.tsx"]) expect(webThen(route), route).toContain("const member = await isMemberHere();");
    expect(webThen("src/web/viewer.ts")).toMatch(/return \(await getViewer\(\)\) !== null;/);

    // Their member, here: the same cookie, the getViewer export answering a viewer, the real session check.
    Object.assign(state, { cookie: "FICTIONAL-session", exportMember: true, realSession: true });
    expect(await getViewer()).toEqual({ id: "FICTIONAL-viewer" });
    const asked = await isMemberHere();
    const door = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    const feed = renderToStaticMarkup((await FeedPageRoute()) as ReactElement);
    const seen = { asked, door: textOf(door).includes(MEMBER_JOIN.line), feed: textOf(feed).includes(MEMBER_JOIN.line), forms: (door + feed).split("<form").length - 1 };

    // The defect: fixed once the member those files fake reaches the routes (their mocks answer isMemberHere, or the session it reads).
    const reaches = (src: string) => /\bisMemberHere\s*:/.test(src) || /vi\.mock\("@\/core\/auth"[\s\S]{0,600}sessionFromCookie/.test(src);
    expect((seen.door && seen.feed) || files.every((f) => reaches(read(f))), JSON.stringify(seen)).toBe(true);
  });

  it("DEFECT (LOW): SPEC §9's new note marks four things as history (X's token table, the left navigation with its Post pill, 'Home' in the bar, the pill buttons) and leaves §9's type and layout standing, which M-0020 replaced too: §9 still says the app's fonts are the system stack ('-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, …') at 15px / 1.35, a 600px centre column, a 350px right column, and below 700px a top bar with the wordmark on /home; every signed-in page is `.public` now, 16px / 1.55 in the public pages' sans (:root's --font too, since M-0020), with a 680px column, a 320px panel and 'Feed' in the bar, and §18.22 says nothing of the type. D-0023 §A: 'the type of the public pages'; H12's row: 'SPEC §9 … marked as replaced in part by §18.22'", () => {
    const section9 = (raw: string) => flat(raw.slice(raw.indexOf("## 9. Design"), raw.indexOf("## 10. Routes")));
    const noteOf = (s9: string) => s9.slice(0, s9.indexOf("**The brief"));
    // On the re-checked commit: the note H12's fix added, and what §9 still states under it.
    const s9Then = section9(webThen("SPEC.md"));
    expect(noteOf(s9Then)).toContain("Replaced in part by §18.22 (M-0020, D-0023)");
    expect(noteOf(s9Then)).toContain(
      "The token table below (X's colours), the left navigation with its Post pill, \"Home\" in the bottom bar and the pill-shaped buttons are history; §18.22 says what replaced them.",
    );
    expect(s9Then).toContain('**Fonts:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"`. The base is 15px / 1.35.');
    expect(s9Then).toContain("**Centre:** 600px");
    expect(s9Then).toContain("**Right:** 350px");
    expect(s9Then).toContain("(on `/home`: the wordmark)");
    const raw = read("SPEC.md");
    const s9 = section9(raw);
    const note = noteOf(s9);
    // What the app is.
    expect(git(["show", "184865b:apps/web/src/app/globals.css"])).toContain('--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,');
    const root = declarations(G_RULES.find((r) => r.media === null && r.selectors.length === 1 && r.selectors[0] === ":root")!.body);
    expect(root["--font"]).toMatch(/^"Helvetica Neue", Helvetica, Arial, sans-serif/);
    expect([value([".public"], "font-family"), value([".public"], "font-size"), value([".public"], "line-height")]).toEqual(["var(--sans)", "16px", "1.55"]);
    expect(read("src/app/(app)/layout.tsx")).toContain('<div className="public app-shell">');
    expect(value([".app-main"], "max-width", at(820))).toBe("680px");
    expect(read("src/app/(app)/home/page.tsx")).toContain('<PageHeader title="Feed" />');
    expect(record("decisions/D-0023.md")).toContain("and the type of the public pages.");
    const s1822 = flat(raw.slice(raw.indexOf("### 18.22")));

    // The defect: the type and the layout §9 states are history too, and neither the note nor §18.22 says so.
    const typeMarked = /\b(?:fonts?|type)\b/i.test(note) || /\b(?:fonts?|type)\b/i.test(s1822) || !s9.includes("-apple-system, BlinkMacSystemFont");
    const layoutMarked = /\b(?:layout|columns?|centre|350px|600px)\b/i.test(note) || !s9.includes("**Right:** 350px");
    expect({ typeMarked, layoutMarked }).toEqual({ typeMarked: true, layoutMarked: true });
  });

  it("DEFECT (LOW): R12's skipped test says the decision is the founder's because 'the verifier named' it so, and nothing the verifier committed says that: its test as written (27e82e1) is 'DEFECT (LOW)', and neither it, its file's header nor its commit names the founder or a design choice; the verification receipt puts 'a design choice for the founder' in the column of what was done, which is the architect's. Recording R12 for the founder is within the stopping rule, and the question is real (closed below); the attribution needs a source (AGENTS.md §10; the M-0017 re-check's RC9 asked the same of /build's 'in Claude Code')", () => {
    // R12's comment, read as prose: the comment block above its test.
    const commentOf = (src: string) => {
      const at12 = src.indexOf("from 700px, once a page scrolls, a member has nothing to reach the feed");
      const start = at12 === -1 ? -1 : src.lastIndexOf("// Recorded, not fixed", at12);
      return start === -1 ? "" : flat(src.slice(start, src.lastIndexOf("\n", at12)).replace(/^\s*\/\/[ \t]?/gm, ""));
    };
    expect(commentOf(webThen("tests/verify-m0020-rendering.test.ts"))).toContain("is a design choice, which the verifier named the founder's.");
    const comment = commentOf(read("tests/verify-m0020-rendering.test.ts"));
    const asWritten = git(["show", "27e82e1:apps/web/tests/verify-m0020-rendering.test.ts"]);
    expect(asWritten).toContain('it("DEFECT (LOW): from 700px, once a page scrolls, a member has nothing to reach the feed, notifications, people or the menu');
    const message = git(["show", "-s", "--format=%B", "27e82e1"]);
    const row = then(VERIFICATION).split("\n").find((l) => l.startsWith("| R12 |"))!;
    const cells = row.split("|").map((c) => c.trim());
    expect(cells[3]).toBe("From 700px, once a page scrolls, none of a member's links stay in view.");
    expect(cells[4]).toContain("a design choice for the founder");
    const verifierSaidIt = /\bfounder\b|design choice/i.test(asWritten) || /\bfounder\b|design choice/i.test(message) || /\bfounder\b/i.test(cells[3]!);

    // The defect.
    expect(!comment.includes("which the verifier named") || verifierSaidIt).toBe(true);
  });

  it("DEFECT (LOW): three sentences round one wrote or left behind aren't so. (1) The build receipt, now 'after round one', still says the panel holds 'This feed is our.one's first project. What should we make ours?', the line H6 replaced with 'The feed is …'. (2) SPEC §18.22, globals.css and the receipt's R1 row call the dark counts 'the ink on the dark rust', 7.22:1: in the identity's own tokens the dark ink (#ebeee3) on the dark rust (#ec8d66) is 2.09:1, R1's own failure; what is drawn is --primary-text, the dark paper (#131a15), 7.22:1 — served rgb(19, 26, 21) on rgb(236, 141, 102). (3) public.module.css ends on its section heading 'in-app footer (phones)', over nothing: the footer H11 removed", () => {
    // (1) On the re-checked commit: the receipt after round one, and H6's row.
    const oldLine = 'the panel: the line, "This feed is our.one\'s first project. What should we make ours?"';
    expect(recordThen(BUILD)).toContain("Status: TESTED locally, after round one of the independent verification");
    expect(recordThen(BUILD)).toContain(oldLine);
    expect(recordThen(VERIFICATION)).toContain("| H6 | LOW | \"This feed is our.one's first project.\" stood on pages with no feed beside it. | Fixed: \"The feed is our.one's first project.\" |");
    expect(MEMBER_PANEL.text).toBe("The feed is our.one's first project. What should we make ours?");
    const build = record(BUILD);
    // (2)
    const badge = findAll(tree(inShell(createElement("span", { className: "badge" }, "3"), "main")), (e) => hasClass(e, "badge"))[0]!;
    const dark = at(820, true);
    const t = tokens(dark);
    expect(cascade(badge, ["color"], dark)!.value).toBe("var(--primary-text)");
    expect([t["--primary-text"], t["--paper"], t["--ink"], t["--rust"]]).toEqual(["#131a15", "#131a15", "#ebeee3", "#ec8d66"]);
    expect(contrast(resolve("var(--primary-text)", dark), resolve("var(--accent)", dark))).toBe(7.22);
    expect(contrast(resolve("var(--ink)", dark), resolve("var(--rust)", dark))).toBe(2.09);
    const sayInk = ["apps/web/SPEC.md", "apps/web/src/app/globals.css", VERIFICATION].filter((f) => record(f).includes("the ink on the dark rust"));
    // (3)
    expect(filesUnder("src/components/public")).not.toContain("src/components/public/InAppSiteFooter.tsx");
    const emptyHeading = /\/\* -+ in-app footer \(phones\) \*\/\s*$/.test(PUBLIC_CSS);

    // The defect.
    expect({ staleQuote: build.includes(oldLine), inkOnDarkRust: sayInk, emptyHeading }).toEqual({ staleQuote: false, inkOnDarkRust: [], emptyHeading: false });
  });

  it("DEFECT (LOW): where scrollbars take room (the default on Windows and most Linux desktops, and macOS's 'Always'), R11's panel narrows when it scrolls: on a short window its own scrollbar takes its room from the content, so the panel's cards are 305px and their right edge stands 15px inside the member's links above them, while globals.css says 'the content stays 320px' — measured in Chromium 153 against next start of 0b6de40 on /home at 1366×657 with a 15px scrollbar that takes room (styled, as the rendering verifier measured the header): the panel 336px, its client width 321px, its cards 305px, their right edge at 1288px against the member's links' 1303px; at 1440×900, where it doesn't scroll, 320px and in line. With overlay scrollbars it stays 320px", () => {
    const short = at(1366);
    // On the re-checked commit: the panel R11's fix made, and what its comment says of it.
    const cssThen = webThen("src/app/globals.css");
    const rulesThen = cssRules(cssThen, "globals.css");
    expect(["position", "max-height", "overflow-y", "flex", "padding", "margin-inline", "scrollbar-width", "scrollbar-gutter"].map((p) => value([".aside"], p, short, rulesThen))).toEqual([
      "sticky",
      "100dvh",
      "auto",
      "0 0 336px",
      "0 8px 32px",
      "-8px",
      undefined,
      undefined,
    ]);
    expect(flat(cssThen.replace(/^\s*(?:\/\*\*?|\*\/|\*(?!\/)|\/\/)[ \t]?/gm, ""))).toContain("Its 8px each side, taken back by the margins, keep the focus rings uncut; the content stays 320px.");
    // The content box: 336px less 8px each side, less a scrollbar where one takes room.
    const scrollbar = 15;
    expect([336 - 16, 336 - 16 - scrollbar]).toEqual([320, 305]);
    const keepsWidth = value([".aside"], "scrollbar-width", short) === "none";

    // The defect: nothing keeps the scrollbar's room out of the content, and the comment says the content keeps its width.
    expect(keepsWidth || !prose("src/app/globals.css").includes("the content stays 320px")).toBe(true);
  });

  it("DEFECT (LOW): SPEC §18.22 says 'buttons, cards and the compose tab are square-cornered, as the public pages' are', and the app still draws rounded boxes in the old shape: the quoted post on /report and in the moderation queue (safety.module.css .quote, 16px, X's quote card), the moderation's decision panel (.panel, 16px), the new invite link's box on /people/invites (.inviteLink, 16px), a notification's statement of reasons (.statement, 12px) and a removed post's note (.post__removed, 12px), where the public pages' card and the panel's are 4px — served against 0b6de40 on /report for a FICTIONAL post: the quote's box 16px round, 646px wide (and the member's menu 12px, a popover rather than a card). D-0023 §A: every page has our.one's own look", () => {
    expect(flat(webThen("SPEC.md")).replace(/[*`]/g, "")).toContain("buttons, cards and the compose tab are square-cornered, as the public pages' are.");
    // On the re-checked commit: the quote's box, round.
    expect(value([".quote"], "border-radius", WIDE, cssRules(webThen("src/components/safety/safety.module.css"), "safety.module.css"))).toBe("16px");
    expect(value([".card"], "border-radius")).toBe("4px");
    expect(value([".public .btn"], "border-radius")).toBe("4px");
    expect(record("decisions/D-0023.md")).toContain("Every page, signed in or not, has our.one's own look");
    const rules = [...G_RULES, ...P_RULES, ...BOX_RULES];
    const boxes: [string, string][] = [
      ["safety.module.css .quote", "quote"],
      ["safety.module.css .panel", "panel"],
      ["people.module.css .inviteLink", "inviteLink"],
      ["NotificationRow.module.css .statement", "statement"],
      ["globals.css .post__removed", "post__removed"],
    ];
    const page = tree(inShell(createElement("div", null, ...boxes.map(([, c]) => createElement("section", { key: c, className: c }, "FICTIONAL"))), "main"));
    const radius = (c: string) => cascade(byClass(page, c)[0]!, ["border-radius"], WIDE, {}, rules)?.value ?? "0";

    // The defect.
    expect(boxes.map(([name, c]) => [name, radius(c)]).filter(([, r]) => parseFloat(r!) > 4)).toEqual([]);
  });
});

/* ============================================================ closed checks */

describe("closed checks (each held, and passes)", () => {
  it("closed: round one changed in the product what its rows name, and nothing else — the strings 8dc4094 took out of src are 'Go home' (five buttons, now 'Open your feed'), 'A home for friends and people you choose to follow.' (the manifest and the root description), the member's menu's old name, the panel's old line, the routes' own session checks and their log lines, and the error and not-found pages' plain wordmark; the four places and the public layout's Sign in and Your feed moved (places.ts, PublicAccount.tsx), word for word; a visitor's front door and /feed keep 'Join the feed' and 'Join our.one' — served so on next start of 0b6de40 at 1440 and 375px, as a visitor and as the FICTIONAL @bruno_varnell", async () => {
    const changed = git(["diff", "--name-only", "4e04af5", "8dc4094", "--", "apps/web/src"]).trim().split("\n");
    const literals = (line: string) =>
      [
        ...[...line.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? ""),
        ...[...line.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!.trim()),
        ...(/^-\s+([A-Z][^<>{}=;()"`]*)$/.exec(line)?.slice(1) ?? []),
      ].filter((s) => /[A-Za-z]{2}/.test(s));
    // Still somewhere in src on the re-checked commit (git grep exits 1 when it finds nothing).
    const stillThere = (s: string) => spawnSync("git", ["grep", "-q", "-F", "-e", s, RECHECKED, "--", "apps/web/src"], { cwd: ROOT }).status === 0;
    const gone = new Set<string>();
    for (const file of changed) {
      const removed = git(["diff", "-U0", "4e04af5", "8dc4094", "--", file])
        .split("\n")
        .filter((l) => l.startsWith("-") && !l.startsWith("---") && !/^-\s*(?:\*|\/\/|\/\*)/.test(l));
      for (const s of new Set(removed.flatMap(literals))) if (!stillThere(s)) gone.add(s);
    }
    expect([...gone].sort()).toEqual(
      [
        "${viewer.displayName}: your profile and settings",
        "@/components/public/InAppSiteFooter",
        "A home for friends and people you choose to follow.",
        "Go home",
        "This feed is our.one's first project. What should we make ours?",
        "[ours] front page: the session could not be checked:",
      ].sort(),
    );
    // Moved, word for word.
    expect(PLACES.map((p) => [p.href, p.label])).toEqual([
      ["/#idea", "The idea"],
      ["/projects", "Projects"],
      ["/build", "Build with us"],
      ["/#open", "In the open"],
    ]);
    expect(read("src/components/PublicAccount.tsx")).toMatch(/<Link href="\/signin" className="public-header__signin">\s*Sign in\s*<\/Link>/);
    // A visitor, as before.
    const door = textOf(renderToStaticMarkup((await FrontDoorRoute()) as ReactElement));
    const feed = textOf(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    expect(door).toContain("Join the feed");
    expect(door).not.toContain(MEMBER_JOIN.line);
    expect(feed).toContain("Join our.one");
  });

  it("closed: one rule for who is reading — the header, the front door, /feed and the not-found page agree for a visitor, a member, a cookie that isn't a session, and a member while the database is down (nobody is a member then); isMemberHere is React-cached per request and logs only the error's name — served so on next start of 0b6de40: as @bruno_varnell 'Your feed' and 'You're in.' with the database up; with its port closed, 'Sign in' and the join form on /, /feed, /agreement and an address with no route, as for a visitor, at 1440px light and 375px dark; the log carried '[ours] the session could not be checked: Error', 13 lines", async () => {
    const viewer = read("src/web/viewer.ts");
    expect(viewer).toMatch(/import \{ cache \} from "react";/);
    expect(viewer).toContain("export const isMemberHere = cache(async (): Promise<boolean> => {");
    expect(viewer).toMatch(/console\.error\(\s*"\[ours\] the session could not be checked:",\s*error instanceof Error \? error\.name : "unknown error",\s*\);/);
    expect(read("src/components/PublicAccount.tsx")).toContain("if (!(await isMemberHere())) return <SignIn />;");
    const cases = [
      { name: "a visitor", cookie: null, member: false, db: "up" as const, realSession: false, want: false },
      { name: "a member", cookie: "FICTIONAL-cookie", member: true, db: "up" as const, realSession: false, want: true },
      { name: "a cookie that isn't a session", cookie: "FICTIONAL-not-signed", member: false, db: "up" as const, realSession: true, want: false },
      { name: "a member, the database down", cookie: "FICTIONAL-cookie", member: true, db: "down" as const, realSession: false, want: false },
    ];
    const seen = [];
    for (const c of cases) {
      Object.assign(state, { cookie: c.cookie, member: c.member, db: c.db, realSession: c.realSession, exportMember: false });
      const header = await publicHeader();
      const notFound = await full(createElement(NotFound));
      const door = textOf(renderToStaticMarkup((await FrontDoorRoute()) as ReactElement));
      const feed = renderToStaticMarkup((await FeedPageRoute()) as ReactElement);
      seen.push({
        name: c.name,
        header: header.includes(">Your feed<"),
        notFound: notFound.slice(notFound.indexOf("<header"), notFound.indexOf("</header>")).includes(">Your feed<"),
        door: door.includes(MEMBER_JOIN.line),
        feed: textOf(feed).includes(MEMBER_JOIN.line) && !feed.includes("<form"),
      });
    }
    expect(seen).toEqual(cases.map((c) => ({ name: c.name, header: c.want, notFound: c.want, door: c.want, feed: c.want })));
  });

  it("closed: the not-found and error pages carry the header every page has — the wordmark with its rust dot, to /, and the four places; the not-found page's right side is Sign in or Your feed, the error page's is empty; both fill the window under the header and no more — served on next start of 0b6de40: 404 for an address with no route, as a visitor ('Sign in') and as @bruno_varnell ('Your feed', or 'Sign in' with the database's port closed); 500 on /home and /settings with the port closed, the error page drawn once the script ran ('Something went wrong on our side', Try again; Tab: the skip link, the wordmark, the four places, Try again); the page 900px tall in a 900px window, 812 in 812", async () => {
    const notFound = parse(await full(createElement(NotFound)));
    const error = tree(createElement(ErrorPage, { error: new Error("FICTIONAL"), reset: () => undefined }));
    for (const [name, t] of [
      ["not-found", notFound],
      ["error", error],
    ] as const) {
      const top = elements(t)[0]!;
      expect(hasClass(top, "public"), name).toBe(true);
      const header = findAll(t, (e) => e.tag === "header")[0]!;
      expect(hasClass(header, "public-header"), name).toBe(true);
      const wordmark = byClass(header, "public-wordmark")[0]!;
      expect([wordmark.attrs.href, wordmark.attrs["aria-label"], byClass(wordmark, "public-wordmark__dot").map(text)], name).toEqual(["/", "our.one, home", ["."]]);
      expect(findAll(byClass(header, "public-nav")[0]!, (e) => e.tag === "a").map((a) => [text(a), a.attrs.href]), name).toEqual(PLACES.map((p) => [p.label, p.href]));
      expect(findAll(t, (e) => e.tag === "main" && e.attrs.id === "main" && hasClass(e, "plain-page")), name).toHaveLength(1);
    }
    expect(text(byClass(notFound, "public-header__account")[0]!)).toBe("Sign in");
    expect(text(byClass(error, "public-header__account")[0]!)).toBe("");
    Object.assign(state, { cookie: "FICTIONAL-cookie", member: true });
    expect(text(byClass(parse(await full(createElement(NotFound))), "public-header__account")[0]!)).toBe("Your feed");
    // The column fills what the header leaves, and no more.
    expect(value([".plain-page"], "min-height")).toBe("100dvh");
    expect([value([".public > .plain-page"], "flex"), value([".public > .plain-page"], "min-height"), value([".public"], "min-height")]).toEqual(["1", "0", "100dvh"]);
    expect(read("src/app/error.tsx").startsWith('"use client";')).toBe(true);
  });

  it("closed: R11's panel holds where a window is short — from 1000px it is sticky, never taller than the window, and scrolls on its own; the rings it draws stay uncut and the member's menu draws over it — served on next start of 0b6de40 on /home and /settings at 1440×900, 1440×780, 1366×657, 1280×600, 1000×700 and 1000×560: the panel 728px or the window's height (657, 600, 700, 560), at the top once the page has scrolled past the header, its status line reached by scrolling it (its foot at 625 of 657, 568 of 600, 528 of 560), its cards 320px and in line with the member's links (1360, 1318, 1232 and 952px); Tab and Shift+Tab through its 15 links at 1280×600 and 1366×657 kept each one wholly in view; the menu's three items on top of it at 1440, 1000 and 1280px", () => {
    const short = at(1280);
    expect(["position", "top", "max-height", "overflow-y", "flex", "padding", "margin-inline"].map((p) => value([".aside"], p, short))).toEqual([
      "sticky",
      "0",
      "100dvh",
      "auto",
      "0 0 336px",
      "0 8px 32px",
      "-8px",
    ]);
    expect([value([".app"], "flex-direction", short), value([".app"], "align-items", short)]).toEqual(["row", "flex-start"]);
    expect(value([".aside__inner"], "padding", short)).toBe("24px 0 0");
    // A ring reaches 3px past its 3px offset: inside the panel's 8px each side, the 24px above its first target, the cards' 20px and the footer's 4px.
    expect([value([".public :focus-visible"], "outline"), value([".public :focus-visible"], "outline-offset")]).toEqual(["3px solid var(--rust)", "3px"]);
    expect([value([".card"], "padding"), value([".site-footer"], "padding")]).toEqual(["20px", "0 4px"]);
    expect(3 + 3).toBeLessThanOrEqual(Math.min(8, 24, 20, 4 + 8));
    // Below 1000px it follows the column and isn't a scroller.
    expect([value([".aside"], "overflow-y", at(999)), value([".aside"], "max-height", at(999))]).toEqual([undefined, undefined]);
    // The member's menu: positioned, on top; the panel sets no stacking order of its own.
    expect(value([".menu__list"], "z-index")).toBe("30");
    expect(value([".aside"], "z-index", short)).toBeUndefined();
  });

  it("closed: R4's room for the sticky header and the bar — the room is set on html, which sees only :root's tokens, and both tokens are :root's; served on next start of 0b6de40: 60 Tabs on /home, /notifications and /people at 375×812 and on /home at 320×640, 40 Shift+Tabs on /home and /people at 375×812, 60 on /home at 820 and 1440px and 40 on /people at 1440px: no focused element wholly under the bar or the page's header (one field taller than the room, /settings' 100px Bio at 320×640, half under the bar, which 2.4.11 allows)", () => {
    const html = findAll(tree(createElement("html", null, createElement("body", null, inShell(createElement("p", null, "FICTIONAL"), "main")))), (e) => e.tag === "html")[0]!;
    const root = declarations(G_RULES.find((r) => r.media === null && r.selectors.length === 1 && r.selectors[0] === ":root")!.body);
    expect([root["--header-h"], root["--tabbar-h"]]).toEqual(["53px", "52px"]);
    expect(cascade(html, ["scroll-padding-top"], PHONE)?.value).toBe("calc(var(--header-h) * 2 + 8px)");
    expect(cascade(html, ["scroll-padding-top"], WIDE)?.value).toBe("calc(var(--header-h) * 2 + 8px)");
    expect(cascade(html, ["scroll-padding-bottom"], PHONE)?.value).toBe("calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 8px)");
    expect(cascade(html, ["scroll-padding-bottom"], at(820))).toBeUndefined();
    // Only the app's pages: the public pages have no sticky header to keep room for.
    const publicHtml = findAll(tree(createElement("html", null, createElement("body", null, createElement("div", { className: "public" })))), (e) => e.tag === "html")[0]!;
    expect(cascade(publicHtml, ["scroll-padding-top"], PHONE)).toBeUndefined();
  });

  it("closed: the front door and /feed, for a member and for a visitor — a member's 'your part' opens their feed (/home) with no 'Joining opens soon.', /feed's section for them is 'Your feed' with 'You're in.' and no form; a visitor keeps 'Join the feed' (/feed) and 'Join our.one'; the header's two places into the door have their sections for both — served on next start of 0b6de40 at 1440 and 375px: 'The idea' and 'In the open', clicked from /build, and fresh loads of /#idea and /#open, landed on their sections 16px below the top for a member and a visitor", async () => {
    const part = (t: El) => findAll(t, (e) => e.attrs.id === "part")[0]!;
    const feedLink = (t: El) => {
      const a = findAll(part(t), (e) => e.tag === "a" && /Join the feed|See the feed|Open your feed/.test(text(e)))[0]!;
      return [text(a), a.attrs.href];
    };
    Object.assign(state, { cookie: "FICTIONAL-cookie", member: true });
    const door = parse(renderToStaticMarkup((await FrontDoorRoute()) as ReactElement));
    const feed = parse(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    expect(feedLink(door)).toEqual([`${MEMBER_JOIN.link} ↗`, "/home"]);
    expect(text(part(door))).not.toContain("Joining opens soon.");
    expect(text(findAll(feed, (e) => e.attrs.id === "front-get-in")[0]!)).toBe(MEMBER_JOIN.heading);
    expect(text(feed)).toContain(MEMBER_JOIN.line);
    expect(findAll(feed, (e) => e.tag === "form")).toEqual([]);
    Object.assign(state, { cookie: null, member: false });
    const vdoor = parse(renderToStaticMarkup((await FrontDoorRoute()) as ReactElement));
    const vfeed = parse(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    expect(feedLink(vdoor)).toEqual(["Join the feed ↗", "/feed"]);
    expect(text(findAll(vfeed, (e) => e.attrs.id === "front-get-in")[0]!)).toBe("Join our.one");
    expect(findAll(vfeed, (e) => e.tag === "form")).toHaveLength(1);
    for (const t of [door, vdoor]) {
      for (const p of PLACES.filter((x) => x.href.startsWith("/#"))) expect(findAll(t, (e) => e.tag === "section" && e.attrs.id === p.href.slice(2))).toHaveLength(1);
    }
    expect(DOOR_CSS).toMatch(/\.section \{[^}]*scroll-margin-top: 16px;/);
  });

  it("closed: round one's other rendering fixes hold, served — the counts the paper on the rust (4.74:1) and the dark paper on the dark rust (7.22:1): rgb(245, 243, 235) on rgb(191, 65, 29), rgb(19, 26, 21) on rgb(236, 141, 102); a field's edge --sub at rest, the rust edge and a 3px rust ring in focus, the danger's edge in error (/signin, an address that isn't one: 'Enter a valid email address.', rgb(179, 38, 30), dark rgb(242, 134, 123)); a hovered post's links 5.21:1 and 6.51:1 on the card; with touch, the member's links and the panel's places 44px and the footer's links 29.5px in rows 30px apart at 820, 375 and 320px; the member's menu closing on Escape (focus back on its button) and on a click outside at 1440 and 375px, named 'Bruno Varnell: your profile and settings'", () => {
    // The counts.
    const badge = findAll(tree(inShell(createElement("span", { className: "badge" }, "3"), "main")), (e) => hasClass(e, "badge"))[0]!;
    const counts = SCHEMES.map((s) => {
      const ctx = at(820, s === "dark");
      return contrast(resolve(cascade(badge, ["color"], ctx)!.value, ctx), backdrop(badge, ctx));
    });
    expect(counts).toEqual([4.74, 7.22]);
    // The fields, at rest, in focus and in error.
    const form = tree(
      inShell(
        createElement(
          "div",
          null,
          createElement("input", { className: "input", "aria-label": "FICTIONAL rest" }),
          createElement("div", { className: "field field--error" }, createElement("input", { className: "input", "aria-label": "FICTIONAL error" })),
        ),
        "main",
      ),
    );
    const [rest, wrong] = findAll(form, (e) => e.tag === "input") as [El, El];
    const focusEdge = cascade(rest, ["border", "border-color"], WIDE, { focus: rest })!;
    expect([hex(borderColour(rest, WIDE)), focusEdge.value, hex(borderColour(wrong, WIDE))]).toEqual(["#586157", "var(--accent)", "#b3261e"]);
    expect(hex(borderColour(wrong, at(1440, true)))).toBe("#f2867b");
    // A hovered post.
    const post = tree(
      inShell(
        createElement("article", { className: "post post--link" }, createElement("div", { className: "post__body" }, createElement("a", { href: "https://example.test/FICTIONAL" }, "example.test/FICTIONAL"))),
        "main",
      ),
    );
    const row = findAll(post, (e) => e.tag === "article")[0]!;
    const link = findAll(row, (e) => e.tag === "a")[0]!;
    expect(
      SCHEMES.map((s) => {
        const ctx = at(1440, s === "dark");
        return contrast(resolve(cascade(link, ["color"], ctx, { hover: [row] })!.value, ctx), backdrop(link, ctx, { hover: [row] }));
      }),
    ).toEqual([5.21, 6.51]);
    // Touch.
    const coarse = (sel: string, prop: string) => value([sel], prop, at(820, false, true), G_RULES);
    expect([coarse(".member__link", "min-height"), coarse(".card--ours .card__links a", "min-height"), coarse(".site-footer__links a", "padding-block")]).toEqual(["44px", "44px", "5px"]);
    // The menu.
    const links = read("src/components/MemberLinks.tsx");
    expect(links).toContain("const dismiss = useDismissableMenu(menu);");
    expect(links).toContain("onToggle={dismiss.onToggle}");
    const hook = read("src/components/posts/PostMenu.tsx");
    expect(hook).toMatch(/if \(event\.key === "Escape" && ref\.current\) \{\s*ref\.current\.open = false;\s*ref\.current\.querySelector\("summary"\)\?\.focus\(\);/);
    expect(hook).toContain('document.addEventListener("pointerdown", onPointer);');
    const name = (isAdmin: boolean) => findAll(memberHeader({ ...VIEWER, isAdmin }), (e) => e.tag === "summary")[0]!.attrs["aria-label"];
    expect([name(false), name(true)]).toEqual([`${VIEWER.displayName}: your profile and settings`, `${VIEWER.displayName}: your profile, settings and moderation`]);
  });

  it("closed: nothing scrolls sideways, light or dark — served on next start of 0b6de40 as @ada_quillon: /home, /notifications, /people and its four tabs, two profiles, a post, /settings and its two pages, /report twice (another's post and one's own), and /admin, at 320, 375 (dark), 820, 1000 (dark) and 1440px, touch below 1000px (80 loads): the page never wider than the window, and no box past either edge; the not-found and error pages the same at 1440 and 375px", () => {
    expect(value([".app-main"], "min-width")).toBe("0");
    expect(value([".aside"], "min-width")).toBe("0");
    expect(value([".public"], "overflow-wrap")).toBe("break-word");
    expect(value([".post__body"], "overflow-wrap")).toBe("anywhere");
    expect(value([".tabs"], "overflow-x")).toBe("auto");
    expect(value([".public-header__bar"], "flex-wrap")).toBe("wrap");
    expect(value([".plain-page"], "padding")).toBe("24px 16px");
  });

  it("closed: the pictures on /feed are the app as it is — the phone's header has the wordmark with its rust dot, then the four places on their own row, then the feed's bar, 'Feed', and a square compose tab, as the app's is; the illustration's our.one side is 'Feed' (its ranked side keeps 'Home', the other product's) — served on next start of 0b6de40 at 320, 375 (light and dark), 760, 1000 and 1440px: the four places fit inside the phone at every width (the last ends 12px inside it at 320px), nothing sideways", () => {
    const phone = tree(createElement(FeedPreview));
    const head = byClass(phone, "phoneHead")[0]!;
    expect(byClass(head, "public-wordmark__dot").map(text)).toEqual(["."]);
    expect(findAll(byClass(phone, "phonePlaces")[0]!, (e) => e.tag === "span").map(text)).toEqual(PLACES.map((p) => p.label));
    expect(text(byClass(phone, "phoneBar")[0]!)).toBe("Feed");
    expect(value([".phoneCompose"], "border-radius", PHONE, P_RULES)).toBe(value([".tabbar__item--compose .tabbar__icon"], "border-radius", PHONE, G_RULES));
    expect(byClass(tree(createElement(FeedContrast)), "miniBar").map(text)).toEqual(["Home", "Feed"]);
    expect(value([".phone"], "overflow", PHONE, P_RULES)).toBe("hidden");
    expect(value([".phonePlaces"], "white-space", PHONE, P_RULES)).toBe("nowrap");
  });

  it("closed: the finding about the session's id in the server's log is recorded truly — served with the database's port closed, @bruno_varnell's /home and /settings made the server log the failed session query with its parameters, and that FICTIONAL session's id stood on 10 of the log's lines (counted, never shown), while the public pages' lines carry only the error's name; it is older than M-0020: at 184865b the (app) layout already asked requireViewer(), whose getViewer runs the same query unguarded, as it still does; both receipts record it for the founder, unfixed, as the subject of a record of its own, and M-0020's own new log line names only the error", () => {
    const layoutThen = git(["show", "184865b:apps/web/src/app/(app)/layout.tsx"]);
    expect(layoutThen).toContain("const viewer = await requireViewer();");
    expect(read("src/app/(app)/layout.tsx")).toContain("const viewer = await requireViewer();");
    for (const version of [git(["show", "184865b:apps/web/src/web/viewer.ts"]), read("src/web/viewer.ts")]) {
      const getViewerSource = version.slice(version.indexOf("export const getViewer"), version.indexOf("/** The viewer, or a redirect"));
      expect(getViewerSource).toContain("const accountId = await sessionFromCookie(db, raw, new Date());");
      expect(getViewerSource).not.toMatch(/\btry\b|\bcatch\b/);
    }
    expect(read("src/core/auth.ts")).toMatch(/\.where\(\s*and\(\s*eq\(sessions\.id, id\),/);
    expect(recordThen(VERIFICATION)).toContain(
      "Found outside the lenses, older than M-0020: with the database down, a member opening a page of the app makes the server log the failed session query with its parameters, which include the session's id.",
    );
    expect(recordThen(VERIFICATION)).toContain("M-0020 doesn't touch the logs, so it is not fixed here: it is recorded for the founder, as the subject of a record of its own.");
    expect(recordThen(BUILD)).toContain(
      "The session's id in the server's log when the database is down, found outside the verification's lenses and older than M-0020: the subject of a record of its own.",
    );
    expect(read("src/web/viewer.ts")).toMatch(/error instanceof Error \? error\.name : "unknown error"/);
  });

  it("closed: the receipts' numbers and statuses are true, rerun on 0b6de40 under env -i — 65 test files, 1,658 pass and 2 skipped (R12 and M-0018's older one), as on 8dc4094; the claims scan: no prohibited claim in 178 files, 17 sentences listed; the kit: READY TO PROPOSE; typecheck, lint and next build pass; pnpm ours check M-0020 --changed: AUTHORISED (with a clean tree it evaluates no path, so the fixes' paths are checked here: 8dc4094, a832a99 and 0b6de40 touch only apps/web/**, receipts/builds/** and receipts/conformance/**); the build stays TESTED locally and the verification OPEN (and `git branch -r --contains dc12ea0` listed nothing in this clone: no M-0020 commit on a remote-tracking ref)", () => {
    const tests = git(["ls-tree", "--name-only", "8dc4094", "apps/web/tests/"]).trim().split("\n").filter((f) => f.endsWith(".test.ts"));
    expect(tests).toHaveLength(65);
    // A test that is skipped starts its line with it.skip( (another file only quotes one).
    const skipped = tests.flatMap((f) => (git(["show", `8dc4094:${f}`]).match(/^\s*it\.skip\(/gm) ?? []).map(() => f));
    expect(skipped.sort()).toEqual(["apps/web/tests/verify-m0018-honesty.test.ts", "apps/web/tests/verify-m0020-rendering.test.ts"]);
    const build = recordThen(BUILD);
    expect(build).toContain("| Tests (vitest, real Postgres) | CHECKED | 1,658 pass, 2 skipped (R12, and one older), in 65 files on 8dc4094 |");
    expect(build).toContain("| Claims scan | CHECKED | no prohibited claim in 178 files; 17 sentences listed |");
    expect(build).toContain("| The feed under the kit's check | CHECKED | READY TO PROPOSE |");
    expect(build).toContain("| R-SCOPE | ENFORCED | pnpm ours check M-0020 --changed: authorised |");
    expect(build).toContain("Status: TESTED locally, after round one of the independent verification (28 findings fixed, one recorded). The re-check is next. Nothing is pushed or deployed.");
    expect(recordThen(VERIFICATION)).toContain("Status of this receipt: OPEN");
    expect(recordThen(VERIFICATION)).toContain("After round one: on 8dc4094, 1,658 tests pass and 2 are skipped (R12, and one older).");
    const allow = /^(?:apps\/web\/|receipts\/builds\/|receipts\/conformance\/)/;
    for (const c of ["8dc4094", "a832a99", "0b6de40"]) {
      const paths = git(["show", "--name-only", "--format=", c]).trim().split("\n");
      expect(paths.filter((p) => !allow.test(p)), c).toEqual([]);
    }
    const m0020 = readRoot("mandates/M-0020.yaml");
    for (const allowed of ["- apps/web/**", "- receipts/builds/**", "- receipts/conformance/**"]) expect(m0020).toContain(allowed);
    expect([...scanRepoPublicText(WEB).hits, ...scanKitText(WEB).hits]).toEqual([]);
    expect(ALLOWLIST).toHaveLength(17);
  });

  it("closed: R12 is put to the founder truly in both receipts, and still stands as recorded — the header every visitor gets isn't sticky, and D-0023 §B gives a member that header and keeps the bar 'on a phone', so keeping a member's links in view is a choice between two of its sentences, not a fix; no box around the member's links is sticky or fixed at 820, 1000 or 1440px, and the bar hides from 700px; the test is skipped, not removed", () => {
    const header = memberHeader();
    const links = byClass(header, "member__links")[0]!;
    const chain: El[] = [];
    for (let e: El | null = links; e && e.tag !== "#root"; e = e.parent) chain.push(e);
    expect([820, 1000, 1440].map((w) => chain.some((e) => /sticky|fixed/.test(cascade(e, ["position"], at(w))?.value ?? "")))).toEqual([false, false, false]);
    expect(value([".tabbar"], "display", at(700))).toBe("none");
    const d0023 = record("decisions/D-0023.md");
    expect(d0023).toContain("Members get the header every visitor gets:");
    expect(d0023).toContain("On a phone, the app keeps its bottom bar for the feed, people, writing, notifications and the profile.");
    expect(webThen("tests/verify-m0020-rendering.test.ts")).toContain('it.skip("recorded, not fixed (LOW): from 700px, once a page scrolls');
    expect(recordThen(VERIFICATION)).toContain("Recorded, not fixed: a design choice for the founder (a sticky header, or the bottom bar at more widths). Its test is skipped until that decision.");
    expect(recordThen(BUILD)).toContain("Whether a member's links stay in view as a page scrolls (R12): from 700px the header scrolls away with the page, and the bottom bar shows only on a phone.");
  });

  it("closed: the adapted tests' reasons name round one's rows, and the adaptations kept their force — every 'Changed after the verification of M-0020' and 'Retitled after' comment in the 24 tests 8dc4094 and 0b6de40 changed names an H or R row of the receipt (or 'round one'); none of those files has fewer assertions than on 4e04af5, or than the verifiers wrote; none gained a skip, an only or a todo but R12's, recorded; the in-app footer's counts (16 → 15, 19 → 18) and the scan's 177 → 178 are those fixes' own: InAppSiteFooter out, places.ts and PublicAccount.tsx in", () => {
    const files = git(["diff", "--name-only", "4e04af5", "0b6de40", "--", "apps/web/tests"]).trim().split("\n");
    expect(files).toHaveLength(24);
    const rows = new Set([...then(VERIFICATION).matchAll(/^\| ([HR]\d{1,2}) \|/gm)].map((m) => m[1]!));
    expect(rows.size).toBe(29);
    let reasons = 0;
    for (const f of files) {
      const src = then(f);
      for (const m of src.matchAll(/(?:Changed|Retitled) after the verification of M-0020 \(([^)]*)\)/g)) {
        reasons++;
        const ids = m[1]!.match(/\b[HR]\d{1,2}\b/g) ?? [];
        if (ids.length === 0) expect(m[1], f).toBe("round one");
        for (const id of ids) expect(rows.has(id), `${f}: ${id}`).toBe(true);
      }
      const asWritten = f.endsWith("verify-m0020-honesty.test.ts") ? "6d29552" : f.endsWith("verify-m0020-rendering.test.ts") ? "27e82e1" : "4e04af5";
      const count = (s: string) => (s.match(/expect\(/g) ?? []).length;
      expect(count(src), f).toBeGreaterThanOrEqual(count(git(["show", `${asWritten}:${f}`])));
      const added = git(["diff", "-U0", asWritten, "0b6de40", "--", f]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      const skips = added.filter((l) => /^\+\s*(?:it|describe|test)\.(?:skip|only|todo)\(/.test(l));
      expect(
        skips.map((l) => l.includes('it.skip("recorded, not fixed (LOW): from 700px, once a page scrolls')),
        f,
      ).toEqual(f.endsWith("verify-m0020-rendering.test.ts") ? [true] : []);
    }
    expect(reasons).toBeGreaterThanOrEqual(60);
    // The two counts the in-app footer took with it, one entry each.
    for (const [f, before, after] of [
      ["apps/web/tests/claims.test.ts", "expect(rendered).toHaveLength(16);", "expect(rendered).toHaveLength(15);"],
      ["apps/web/tests/rename.test.ts", "expect(pages).toHaveLength(19);", "expect(pages).toHaveLength(18);"],
    ] as const) {
      const was = git(["show", `4e04af5:${f}`]);
      const now = then(f);
      expect([was.includes(before), was.includes('["the in-app footer", '), now.includes(after), now.includes('["the in-app footer", ')], f).toEqual([true, true, true, false]);
    }
    expect(git(["diff", "--name-status", "4e04af5", "8dc4094", "--", "apps/web/src"]).split("\n").filter((l) => /^[AD]\t/.test(l)).sort()).toEqual([
      "A\tapps/web/src/components/PublicAccount.tsx",
      "A\tapps/web/src/components/public/places.ts",
      "D\tapps/web/src/components/public/InAppSiteFooter.tsx",
    ]);
  });

  it("closed: M-0020's acceptance criteria still hold on 0b6de40 — every signed-in page has the header with the four places and the member's links, the bar on phones, no left navigation or Post pill; none of X's five colours in any stylesheet, picture, icon, manifest or component; / renders for a member with 'Your feed' in its header and in place of the join form, and nothing redirects; the feed is 'Feed', and beside it the panel has the line, the first project and the two drafts; the public pages render with the database down; and the checks, rerun (above)", async () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toMatch(/<SiteHeader member>\s*<MemberLinks viewer=\{navViewer\} counts=\{counts\} \/>\s*<\/SiteHeader>/);
    expect(layout).toContain("<TabBar viewer={navViewer} counts={counts} />");
    expect(filesUnder("src").filter((f) => /\.tsx$/.test(f) && /<Nav\b/.test(read(f)))).toEqual([]);
    expect([value([".tabbar"], "display", at(699)), value([".tabbar"], "display", at(700))]).toEqual(["flex", "none"]);
    const seen = filesUnder("src").filter((f) => /\.(?:css|svg|tsx)$/.test(f) || f === "src/app/manifest.ts");
    for (const x of ["#1d9bf0", "#f91880", "#0f1419", "#536471", "#eff3f4"]) expect(seen.filter((f) => read(f).toLowerCase().includes(x)), x).toEqual([]);
    Object.assign(state, { cookie: "FICTIONAL-cookie", member: true });
    const page = await full(createElement(PublicLayout, null, (await FrontDoorRoute()) as ReactElement));
    expect(page.slice(page.indexOf("<header"), page.indexOf("</header>"))).toContain('<a class="public-header__signin" href="/home">Your feed</a>');
    expect(page).not.toContain("<form");
    expect(textOf(page)).toContain(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link}`);
    expect(read("src/app/(public)/page.tsx")).not.toMatch(/\bredirect\(|permanentRedirect/);
    expect(read("src/app/(app)/home/page.tsx")).toContain('<PageHeader title="Feed" />');
    const card = textOf(renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 })));
    for (const words of [TAGLINE, MEMBER_PANEL.text, MEMBER_PANEL.need, MEMBER_PANEL.idea]) expect(card).toContain(words);
    Object.assign(state, { db: "down" });
    for (const route of [FrontDoorRoute, FeedPageRoute]) {
      const html = await full(createElement(PublicLayout, null, (await route()) as ReactElement));
      expect(html).toContain('<a class="public-header__signin" href="/signin">Sign in</a>');
    }
  });
});
