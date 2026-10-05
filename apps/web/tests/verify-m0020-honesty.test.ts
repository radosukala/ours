/**
 * Independent verification of M-0020 (one our.one, signed in or not;
 * D-0023, SPEC §18.22), the honesty lens. Written by an agent that built
 * none of it, against 4e04af5 (the build is dc12ea0 and b5cf968; 80e4300 and
 * 4e04af5 add only receipts). It changes no product code, no record and no
 * other test.
 *
 * What was read: AGENTS.md (§2, §3, §6, §7, §9–§12), D-0023 and its
 * projection, M-0020 and its acceptance criteria, P-0016 and its evidence,
 * D-0020, D-0017 §A, D-0012 §C; SPEC §9 and §18.22; the build receipt and
 * the stopping rule; the M-0018 verification's receipt and its honesty
 * tests; the whole change (`git diff 184865b 4e04af5`: every file under
 * src, the eleven older tests it adapted, and one-ours.test.ts); and what
 * the change leans on: viewer.ts, session.ts, auth.ts's session and viewer
 * queries, seats.ts's count, the front door's and /feed's routes,
 * FrontDoor, FrontPage, door.ts, join.ts, drafts.ts and Draft.tsx,
 * FeedPreview and FeedContrast, the not-found and error pages, the in-app
 * footer, PageHeader, the composer's counter, the claims scan, and the
 * M-0017 re-check's skipped RC8 test.
 *
 * What was rendered: the panel, the member's links and menu, the bottom
 * bar, MemberJoin, the front door and /feed as a member and as a visitor
 * (the routes themselves, with the session, the database and the count
 * mocked), the public layout with its Suspense boundary resolved
 * (react-dom/static's prerender waits for it; renderToStaticMarkup shows
 * only the fallback), twelve public pages with the database down, the
 * pictures of the app on /feed, the in-app not-found page with the panel,
 * and the not-found and error pages.
 *
 * What was run: the whole suite on 4e04af5 before this file existed (63
 * files, 1,602 pass and 2 skipped, as the receipt says), the claims scan
 * (no prohibited claim in 177 files, 17 allowlisted sentences) and the
 * kit's check (READY TO PROPOSE), each under `env -i`.
 *
 * What was served: a production build of this worktree (`next build`
 * passed, as the receipt says), run with `next start` on 127.0.0.1:3731 with
 * FICTIONAL settings; a local database made for it (ours_m0020_vh, migrated
 * and seeded with the fictional seed, then dropped); a session made in it
 * for the FICTIONAL administrator @ada_quillon, its cookie signed with a
 * FICTIONAL secret, both deleted afterwards; and a preload that refused any
 * connection or name lookup leaving the machine (its log stayed empty: none
 * was attempted). Fetched as a visitor and as that member: /, /feed,
 * /agreement, /home, /settings and an address that matches no route. Then
 * the server was restarted with the database's port closed, and /, /feed,
 * /agreement, /home and that address fetched again, and / with an unsigned
 * cookie. What was served is what the renders here show; where a title says
 * "served", it was seen there too. No browser was used, so no script ran:
 * the served HTML is what a server sends.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on 4e04af5, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity: HIGH, a false or prohibited claim about authority, ownership,
 * control or status, or private data exposed; MEDIUM, a stated requirement
 * unmet, or a sentence that misleads; LOW, imprecise or inconsistent
 * wording, or polish.
 *
 * Not decided here: the question the build receipt names for the founder,
 * a member's header on the public pages. A closed check says the receipt
 * states it truthfully; which reading holds is the founder's.
 *
 * Every person, address and database here is FICTIONAL. No database address
 * appears in this file, and nothing here connects anywhere: the session, the
 * database and the count are mocked.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The request this file imitates: its session cookie, the database's state, and whether the cookie is a member's. */
const state = vi.hoisted(() => ({
  cookie: null as string | null,
  db: "up" as "up" | "down" | "unset",
  member: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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
// The cookie, as the request carries it. The rest of session.ts is real.
vi.mock("@/web/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/web/session")>()),
  readSessionCookie: async () => state.cookie,
}));
// The two queries behind getViewer(): a database that answers, or one that can't be reached.
vi.mock("@/core/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/auth")>()),
  sessionFromCookie: async () => {
    if (state.db === "down") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return state.member ? "FICTIONAL-account" : null;
  },
  viewerAccount: async () => {
    if (state.db === "down") throw new Error("FICTIONAL: connect ECONNREFUSED");
    return state.member
      ? { id: "FICTIONAL-account", handle: "ada_fict", displayName: "Ada Fictional", isAdmin: false, acceptsFollowers: false, invitesRemaining: 3 }
      : null;
  },
}));
// getDb() throws when the database isn't configured (DATABASE_URL unset, or not on this machine off Vercel).
vi.mock("@/core/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/db")>()),
  getDb: () => {
    if (state.db === "unset") throw new Error("DATABASE_URL is not set.");
    return { fictional: "a database handle" };
  },
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
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => false }));

import AppNotFound from "@/app/(app)/not-found";
import AgreementPage from "@/app/(public)/agreement/page";
import BuildPage from "@/app/(public)/build/page";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import FeedPageRoute from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import FrontDoorRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import RulesPage from "@/app/(public)/rules/page";
import SignInPage from "@/app/(public)/signin/page";
import ErrorPage from "@/app/error";
import manifest from "@/app/manifest";
import NotFound from "@/app/not-found";
import { MemberLinks } from "@/components/MemberLinks";
import { navItems } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { OursCard, RightColumn, STATUS_LINE } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { MEMBER_JOIN, MEMBER_PANEL, PART_HEADING, TAGLINE } from "@/components/public/door";
import { DRAFT_FALLBACK, draftNote } from "@/components/public/drafts";
import { CONTRAST_LABELS, FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview } from "@/components/public/FeedPreview";
import { CLOSE_LINE, FrontPage } from "@/components/public/FrontPage";
import { JOIN_LABEL, memberCountLine } from "@/components/public/join";
import { PLACES } from "@/components/public/PublicNav";
import { sessionIdFromCookie } from "@/core/auth";
import { ALLOWLIST, publicTextFiles, scanKitText, scanRepoPublicText, scanText } from "@/core/claims";
import { isMemberHere } from "@/web/viewer";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** SPEC.md as a reader reads it. */
const spec = () => flat(read("SPEC.md")).replace(/[*`]/g, "");

/** A source file read as prose: comment markers at the start of a line dropped, whitespace collapsed. */
const prose = (rel: string) => flat(read(rel).replace(/^\s*(?:\/\*\*?|\*\/|\*(?!\/)|\/\/)[ \t]?/gm, ""));

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
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

const render = (component: unknown, props: object | null = null) =>
  renderToStaticMarkup(createElement(component as () => null, props));

/** The whole HTML, every Suspense boundary resolved, as a server sends it once it is done. */
async function full(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

/** Every file under a directory of apps/web, relative to apps/web, with forward slashes. */
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

type Rule = { media: string | null; selectors: string[]; body: string };

/** A stylesheet's rules, each with the at-rule it sits in (null at the top). */
function cssRules(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@keyframes")) {
        // not a rule about elements
      } else if (head.startsWith("@")) walk(body, head.replace(/^@media\s*/, "").trim());
      else out.push({ media, selectors: head.split(",").map((s) => s.trim().replace(/\s+/g, " ")), body });
      i = j;
    }
  };
  walk(css, null);
  return out;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const at = part.indexOf(":");
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

/** The declarations of the rule for exactly this selector, outside any at-rule. */
function base(rules: Rule[], selector: string): Record<string, string> {
  const rule = rules.find((r) => r.media === null && r.selectors.includes(selector));
  if (!rule) throw new Error(`no rule for ${selector}`);
  return declarations(rule.body);
}

/** WCAG 2 contrast of two #rrggbb colours, to two places. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)];
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
}

/**
 * X's colours: the five M-0020's acceptance criterion names; the rest of the
 * app's old token table, which SPEC §9 still holds from the brief "look like
 * X" (X's own values); and X's accent colours, as the verifier knows them
 * with no network: blue, yellow, pink, purple, orange and green, the yellow
 * also its composer's counter as the limit nears, before its red.
 */
const X_COLOURS: readonly { hex: string; rgb: string; acceptance: boolean }[] = [
  { hex: "#1d9bf0", rgb: "29, 155, 240", acceptance: true },
  { hex: "#f91880", rgb: "249, 24, 128", acceptance: true },
  { hex: "#0f1419", rgb: "15, 20, 25", acceptance: true },
  { hex: "#536471", rgb: "83, 100, 113", acceptance: true },
  { hex: "#eff3f4", rgb: "239, 243, 244", acceptance: true },
  { hex: "#e7e9ea", rgb: "231, 233, 234", acceptance: false },
  { hex: "#71767b", rgb: "113, 118, 123", acceptance: false },
  { hex: "#2f3336", rgb: "47, 51, 54", acceptance: false },
  { hex: "#f7f9f9", rgb: "247, 249, 249", acceptance: false },
  { hex: "#16181c", rgb: "22, 24, 28", acceptance: false },
  { hex: "#cfd9de", rgb: "207, 217, 222", acceptance: false },
  { hex: "#f4212e", rgb: "244, 33, 46", acceptance: false },
  { hex: "#ffd400", rgb: "255, 212, 0", acceptance: false },
  { hex: "#7856ff", rgb: "120, 86, 255", acceptance: false },
  { hex: "#ff7a00", rgb: "255, 122, 0", acceptance: false },
  { hex: "#00ba7c", rgb: "0, 186, 124", acceptance: false },
];

/** What a person sees drawn: every stylesheet, the icon, the manifest and every component (inline styles, SVG fills, theme colours). */
function seenFiles(): string[] {
  return filesUnder("src").filter((f) => /\.(?:css|svg|tsx)$/.test(f) || f === "src/app/manifest.ts");
}

/** "<file>: <colour>" for each of these colours found in these files, as hex or as rgb(a). */
function coloursIn(files: string[], colours: readonly { hex: string; rgb: string }[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const text = read(file);
    for (const c of colours) {
      if (new RegExp(`${c.hex}\\b`, "i").test(text)) found.push(`${file}: ${c.hex}`);
      if (new RegExp(`rgba?\\(\\s*${c.rgb.replace(/, /g, ",\\s*")}\\b`).test(text)) found.push(`${file}: rgb(${c.rgb})`);
    }
  }
  return found;
}

/** The front door and /feed through their routes, for the request `state` describes. */
async function routes(): Promise<{ door: string; feed: string }> {
  return {
    door: renderToStaticMarkup((await FrontDoorRoute()) as ReactElement),
    feed: renderToStaticMarkup((await FeedPageRoute()) as ReactElement),
  };
}

/** The public layout's header, resolved, for the request `state` describes. */
async function publicHeader(): Promise<string> {
  const html = await full(createElement(PublicLayout, null, "FICTIONAL page"));
  return html.slice(html.indexOf("<header"), html.indexOf("</header>") + 9);
}

/** The words of the eleven older tests M-0020 adapted: [file, the start of a title, words that title says and its body no longer checks]. */
const ADAPTED_TITLES: readonly { file: string; starts: string; stale: string[] }[] = [
  { file: "tests/verify-m0017-rendering.test.ts", starts: "closed: signed in, / and /feed send", stale: ["send the visitor to /home", "the blue accent (#1d9bf0)"] },
  { file: "tests/verify-m0013-render.test.ts", starts: "fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): the phone's top bar", stale: ["as the app's /home does on a phone"] },
  { file: "tests/verify-m0013-render.test.ts", starts: "accepted (SPEC §18.15, after the verification): the site's link blue", stale: ["3.0:1 on white"] },
  { file: "tests/verify-m0014-recheck.test.ts", starts: "closed (item 9, contrast)", stale: ["18.51:1", "3.02:1 and 3.76:1", "#2f3336"] },
  { file: "tests/verify-m0014-render.test.ts", starts: "closed: the reason's two lines", stale: ["18.51:1", "14.59:1"] },
  { file: "tests/verify-m0014-render.test.ts", starts: "closed: the new line's words", stale: ["6.12:1 in light and 4.58:1 in dark"] },
  { file: "tests/verify-m0014-render.test.ts", starts: "closed: it renders once in each place", stale: ["258px at 1000–1099px", "318px from 1100px"] },
  { file: "tests/verify-m0015-recheck.test.ts", starts: "closed: every link inside `.page`", stale: ["1.44:1 light and 1.65:1 dark", "6.12:1 and 4.58:1"] },
  { file: "tests/verify-m0016-honesty.test.ts", starts: "closed: contrast", stale: ["18.51:1", "1.12:1 light, 1.65:1 dark"] },
];

/** A test's title, from `it("<starts>` to the end of the string. */
function titleOf(file: string, starts: string): string {
  const src = read(file);
  const at = src.indexOf(`it("${starts}`);
  if (at === -1) return "";
  return src.slice(at + 4, src.indexOf('", ', at));
}

/** A test's body: from its title to the next test. */
function bodyOf(file: string, starts: string): string {
  const src = read(file);
  const at = src.indexOf(`it("${starts}`);
  const next = src.indexOf("\n  it(", at + 1);
  return src.slice(at, next === -1 ? undefined : next);
}

beforeEach(() => {
  state.cookie = null;
  state.db = "up";
  state.member = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on 4e04af5)", () => {
  it("fixed (MEDIUM): two of X's own colours remain where a person sees them. X's yellow, #ffd400, colours the composer's counter once 20 characters are left (globals.css .counter--warn, beside .counter--over, which was X's red #f4212e, SPEC §9's --danger), as X's composer does, and at 1.29:1 on the new paper. X's green, #00ba7c, with its rgba(0, 186, 124, 0.16) halo, is the count's dot on /feed, which a member now reaches (public.module.css .count::before), where the front door's dot is rust. M-0020 adopts 'No X colour, left navigation or Post pill remains.' and D-0023 prohibits 'X's colours'; SPEC §18.22 says 'X's colours are gone, from the stylesheet', and the build receipt 'None of X's colours … remains in the stylesheets'. The acceptance criterion's list of five passes, and the build checked only those five (X's palette as the verifier knows it, with no network: blue #1d9bf0, yellow #ffd400, pink #f91880, purple #7856ff, orange #ff7a00, green #00ba7c). Served so on 3731: the built stylesheets hold .counter--warn{color:#ffd400}, and /feed's dot #00ba7c with its halo as #00ba7c29", () => {
    // What the records say.
    expect(flat(readRoot("mandates/M-0020.yaml"))).toContain("No X colour, left navigation or Post pill remains.");
    expect(record("decisions/D-0023.md")).toContain('X\'s colours, its left navigation or its "Post" pill;');
    expect(spec()).toContain("X's colours are gone, from the stylesheet,");
    expect(record("receipts/builds/2026-10-03-M-0020.md")).toContain(
      "None of X's colours (#1d9bf0, #f91880, #0f1419, #536471, #eff3f4) remains in the stylesheets or the pictures of the app.",
    );
    // Where they come from: the app was built to the brief "look like X", and SPEC §9's table still holds X's red as the danger colour.
    expect(spec()).toContain("look like X, Instagram");
    expect(read("SPEC.md")).toMatch(/\| `--danger` \| `#f4212e` \|/);

    // The counter: yellow from 20 characters left, then the danger colour, as X's composer does.
    expect(read("src/components/posts/Composer.tsx")).toContain('over ? " counter--over" : left <= 20 ? " counter--warn" : ""');
    const g = cssRules(read("src/app/globals.css"));
    expect(base(g, ".counter--over").color).toBe("var(--danger)");
    const warn = base(g, ".counter--warn").color!;
    expect(contrast("#ffd400", base(g, ":root")["--bg"]!)).toBe(1.29);
    // The dot: the front door's is rust; /feed's is whatever public.module.css says.
    expect(base(cssRules(read("src/components/public/door.module.css")), ".count::before").background).toBe("var(--rust)");
    const dot = base(cssRules(read("src/components/public/public.module.css")), ".count::before").background!;

    // The defect: X's colours beyond the acceptance criterion's five, in what a person sees.
    const found = coloursIn(seenFiles(), X_COLOURS.filter((c) => !c.acceptance));
    expect({ found, warn, dot }).toEqual({ found: [], warn: expect.not.stringMatching(/#ffd400/i), dot: expect.not.stringMatching(/#00ba7c/i) });
  });

  it("fixed (MEDIUM): the pictures of the app on /feed don't show its real look (D-0023 §A: 'The pictures of the app on /feed show its real look.'; M-0020: they 'follow'). M-0020 changed only their colours. The illustration beside the 7% finding titles our.one's feed 'Home' (FeedContrast; D-0023 §D: 'the feed is called the feed, not Home'); the phone, in a figure named 'What our.one looks like', has the old /home bar, a centred wordmark without its rust dot, where /home's own bar now says Feed under the header's wordmark (FeedPreview), and a round compose tab, where the app's is square-cornered (public.module.css .phoneCompose 50%; SPEC §18.22: 'the compose tab' is square-cornered). FeedPreview's comment still says it 'is built from the app's own parts, so it cannot drift from them: the top bar with the our.one wordmark (PageHeader on /home)', and public.module.css 'The app's top bar on a phone, on /home: the wordmark (PageHeader)' (served the same on 3731)", () => {
    const d0023 = record("decisions/D-0023.md");
    expect(d0023).toContain("The pictures of the app on /feed show its real look.");
    expect(d0023).toContain('In the app, the feed is called the feed, not "Home".');
    expect(spec()).toContain("buttons, cards and the compose tab are square-cornered");
    // /feed draws both pictures.
    const page = renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, seatsWaiting: 0 }));
    expect(page).toContain('aria-label="What our.one looks like"');
    expect(page).toContain(`aria-label="Illustration: a ranked feed that keeps going, beside an ${CONTRAST_LABELS[1]} feed that ends"`);
    // The app as it is: the header's wordmark has its rust dot.
    expect(render(SiteHeader, { children: "FICTIONAL" })).toContain('our<span class="public-wordmark__dot">.</span>one');

    // The pictures.
    const illustration = render(FeedContrast);
    const columns = illustration.split(/<div class="[^"]*contrastColumn[^"]*">/).slice(1);
    const ours = columns.find((c) => c.includes(`>${CONTRAST_LABELS[1]}</p>`)) ?? "";
    const oursBar = /<div class="[^"]*miniBar[^"]*">([^<]*)<\/div>/.exec(ours)?.[1] ?? "";
    const phone = render(FeedPreview);
    const p = cssRules(read("src/components/public/public.module.css"));
    const g = cssRules(read("src/app/globals.css"));
    const pictureCompose = base(p, ".phoneCompose")["border-radius"];
    const appCompose = base(g, ".tabbar__item--compose .tabbar__icon")["border-radius"];

    // The defect: three ways the pictures show the app before M-0020.
    expect({
      illustrationCallsTheFeedHome: oursBar === "Home",
      composeTabUnlikeTheApp: pictureCompose !== appCompose,
      barWithoutTheAppsWordmarkOrTitle: !phone.includes("public-wordmark__dot") && !/>\s*Feed\s*</.test(phone),
    }).toEqual({ illustrationCallsTheFeedHome: false, composeTabUnlikeTheApp: false, barWithoutTheAppsWordmarkOrTitle: false });
  });

  it("fixed (MEDIUM): on the front door a member is still asked to join. With joining open, 'your part' offers 'Start with the feed.' and a button 'Join the feed', on the same page whose feed panel tells the member 'You're in.' (and with joining closed, 'Joining opens soon.' under 'See the feed'). M-0020: 'where a visitor is asked to join, a member is shown their feed'; its objective: '\"Your feed\" where a visitor sees Sign in or is asked to join'; SPEC §18.22 and the build receipt say it is so. (D-0023 §C's parenthesis names only the feed's panel and /feed). Served so on 3731, to the FICTIONAL member", async () => {
    expect(record("mandates/M-0020.md")).toContain("where a visitor is asked to join, a member is shown their feed;");
    expect(flat(readRoot("mandates/M-0020.yaml"))).toContain('with "Your feed" where a visitor sees Sign in or is asked to join');
    expect(spec()).toContain("where a visitor is asked to join, a member is shown \"You're in.\" and \"Open your feed\" (MemberJoin)");
    expect(record("receipts/builds/2026-10-03-M-0020.md")).toContain(
      "where a visitor is asked to join, a member is shown \"You're in.\" and \"Open your feed\", and the count without a rank.",
    );
    // A visitor is asked to join there.
    const visitor = textOf((await routes()).door);
    expect(visitor).toContain("Start with the feed.");
    expect(visitor).toContain("Join the feed");

    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    const member = textOf((await routes()).door);
    expect(member).toContain(MEMBER_JOIN.line);
    expect(member).toContain(MEMBER_JOIN.link);

    // The defect.
    expect(member).not.toContain("Join the feed");
  });

  it("fixed (MEDIUM): two pages have neither the header nor the wordmark with its rust dot. The not-found page, what any address that matches no route shows, signed in or not, and the error page, what a page shows when it fails (every signed-in page, while the database is down), draw the old plain 'our.one' (class wordmark, the dot in ink) and no header: the not-found page keeps only the footer's links, and the error page has no link but the wordmark. D-0023 §A: 'Every page, signed in or not, has our.one's own look: … the wordmark with its rust dot'; SPEC §18.22: 'SiteHeader … is on every page'; the receipt: 'SiteHeader on every page'. Served so on 3731: as the FICTIONAL member, an address with no route came back 404 with neither; with the database's port closed, /home came back 500 with no header, its error page left to the browser's script", () => {
    expect(record("decisions/D-0023.md")).toContain(
      "Every page, signed in or not, has our.one's own look: the paper, the ink, the rust and the acid, the wordmark with its rust dot, and the type of the public pages.",
    );
    expect(spec()).toContain("SiteHeader (the wordmark, which goes to /, and the four places) is on every page;");
    expect(record("receipts/builds/2026-10-03-M-0020.md")).toContain("SiteHeader on every page: the wordmark, which goes to /, and the four places;");
    // The error page replaces whatever failed under the root layout, the (app) layout included: no (app)/error.tsx.
    expect(filesUnder("src/app/(app)").filter((f) => /\/error\.tsx$/.test(f))).toEqual([]);

    const pages = {
      notFound: render(NotFound),
      error: render(ErrorPage, { error: new Error("FICTIONAL"), reset: () => {} }),
    };
    // Changed after the verification of M-0020 (H4): the old plain wordmark gave way to the header every page has.
    for (const html of Object.values(pages)) expect(html).not.toMatch(/<a class="wordmark" aria-label="our\.one, home" href="\/">our\.one<\/a>/);

    // The defect: the wordmark with its dot, and the header the SPEC says is on every page (or the SPEC says otherwise).
    const claims = spec().includes("is on every page");
    const holds = (html: string) => html.includes("public-wordmark__dot") && (html.includes('class="public-header') || !claims);
    expect({ notFound: holds(pages.notFound), error: holds(pages.error) }).toEqual({ notFound: true, error: true });
  });

  it("fixed (LOW): with the database unreadable, one page tells a reader two things. The header trusts the session cookie (isMemberHere: 'If the database can't be read, the cookie is trusted') and offers 'Your feed'; the front door's and /feed's own signedIn() count an error as no, so the same page shows that reader the visitor's join form, and /feed its closing 'Join, then send them an invite.' viewer.ts says isMemberHere decides 'for the public pages' header and their join forms'; neither route uses it. And where the database can't be reached by its settings (getDb() throws before the cookie's signature is checked), any cookie of that name, signed or not, gets 'Your feed'. Served so on 3731 with the database's port closed: the member's / and /feed said 'Your feed' over the join form, /feed with its closing invitation (an unsigned cookie got 'Sign in' there: with a database configured, the signature is checked first)", async () => {
    // Changed after the verification of M-0020 (H5): one rule for the header and the pages. With the
    // database unreadable nobody is shown as a member, and both routes ask isMemberHere, as the header does.
    expect(spec()).toContain("with the database down, nobody is shown as a member");
    expect(prose("src/web/viewer.ts")).toContain("for the public pages' header and their join forms (D-0023 §B, §C)");
    for (const file of ["src/app/(public)/page.tsx", "src/app/(public)/feed/page.tsx"]) {
      expect(read(file), file).toContain("const member = await isMemberHere();");
    }
    // A cookie that isn't signed is refused once there is a database to ask; with getDb() throwing, no cookie makes a member.
    expect(sessionIdFromCookie("FICTIONAL-not-signed")).toBeNull();
    state.cookie = "FICTIONAL-not-signed";
    state.db = "unset";
    expect(await isMemberHere()).toBe(false);

    // A member's cookie, and a database that can't be reached.
    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    state.db = "down";
    const header = textOf(await publicHeader());
    const { door, feed } = await routes();
    const says = {
      header: header.includes("Your feed") ? "member" : "visitor",
      door: door.includes("<form") ? "visitor" : "member",
      feed: feed.includes("<form") || textOf(feed).includes(CLOSE_LINE) ? "visitor" : "member",
    };

    // The defect: the header and the page disagree about who is reading.
    expect(new Set(Object.values(says)).size, JSON.stringify(says)).toBe(1);
  });

  it("fixed (LOW): the panel says 'This feed is our.one's first project.' on every signed-in page, where no feed is beside it: /settings, /people, /notifications, a profile, a post, moderation and the in-app not-found page all carry it, because the (app) layout draws the panel for every page (D-0023 §D: 'Beside it, a panel says what our.one is'). Served so on 3731: /settings carries it", () => {
    expect(record("decisions/D-0023.md")).toContain("Beside it, a panel says what our.one is:");
    const pages = filesUnder("src/app/(app)").filter((f) => f.endsWith("/page.tsx"));
    expect(pages).toEqual(expect.arrayContaining(["src/app/(app)/settings/page.tsx", "src/app/(app)/people/page.tsx", "src/app/(app)/notifications/page.tsx"]));
    const card = textOf(render(OursCard, { email: null }));
    expect(card).toContain(MEMBER_PANEL.text);

    // On every page: the layout draws the panel, and the panel the card, with no condition.
    const everywhere =
      read("src/app/(app)/layout.tsx").includes("<RightColumn invitesRemaining={viewer.invitesRemaining} email={proposalsEmail()} />") &&
      /<div className="aside__inner">\s*<OursCard email=\{email\} \/>/.test(read("src/components/RightColumn.tsx"));

    // The defect: "This feed", where there is none.
    expect(everywhere && /\bthis feed\b/i.test(card)).toBe(false);
  });

  it("fixed (LOW): the panel's kicker is drawn 'OUR.ONE': the source says our.one, and .card__kicker sets text-transform: uppercase, so a person reads the name in capitals, where the header, the footers and the front door draw it lowercase (served so on 3731: .card__kicker{… text-transform:uppercase …}). AGENTS.md §11: write our.one 'wherever a person using the product reads a name, always lowercase and with the dot'", () => {
    expect(flat(readRoot("AGENTS.md"))).toContain("wherever a person using the product reads a name, always lowercase and with the dot.");
    const html = render(OursCard, { email: null });
    const kicker = /<p class="card__kicker">([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    const g = cssRules(read("src/app/globals.css"));
    const own = g.find((r) => r.media === null && r.selectors.includes(".card--ours .card__kicker"));
    const transform = (own ? declarations(own.body)["text-transform"] : undefined) ?? base(g, ".card__kicker")["text-transform"];

    // The defect.
    expect(transform === "uppercase" && /our\.one/i.test(kicker), `${kicker}: ${transform}`).toBe(false);
  });

  it("fixed (LOW): for an administrator the member's menu holds Your profile, Settings and Moderation, while its name, read by a screen reader on the button that opens it, is '<name>: your profile and settings' (served so on 3731: 'Ada Quillon: your profile and settings')", () => {
    const html = render(MemberLinks, { viewer: { handle: "ada_fict", displayName: "Ada Fictional", isAdmin: true }, counts: { unread: 0, pending: 0 } });
    const menu = textOf(html.slice(html.indexOf('<ul class="menu__list"')));
    expect(menu).toBe("Your profile Settings Moderation");
    const name = decode(/<summary[^>]*aria-label="([^"]*)"/.exec(html)?.[1] ?? "");

    // The defect: the name lists the menu, and leaves out one item.
    expect(/profile and settings/i.test(name) && !/moderation/i.test(name), name).toBe(false);
  });

  it("fixed (LOW): 'home' still names the feed. Five buttons a member meets say 'Go home' and lead to /home, the feed: the in-app not-found page, /report on one's own post, /join/confirm twice, and an unusable invite link while signed in; and the bottom bar's Feed tab is still the house. Meanwhile the wordmark is named 'our.one, home' and leads to the front door. D-0023 §D: 'In the app, the feed is called the feed, not \"Home\".'", () => {
    expect(record("decisions/D-0023.md")).toContain('In the app, the feed is called the feed, not "Home".');
    const header = render(SiteHeader, { children: "FICTIONAL" });
    expect(header).toMatch(/<a class="public-wordmark" aria-label="our\.one, home" href="\/">/);
    const bar = render(TabBar, { viewer: { handle: "ada_fict", displayName: "Ada Fictional" }, counts: { unread: 0, pending: 0 } });
    const feedTab = /<a class="tabbar__item" aria-label="Feed" href="\/home">([\s\S]*?)<\/a>/.exec(bar)?.[1] ?? "";
    expect(feedTab).toContain('<path d="M3.5 10.2 12 3.5l8.5 6.7">');

    // The defect: buttons named "Go home" that lead to the feed.
    const goHome = filesUnder("src/app").filter((f) => /\.tsx$/.test(f) && /"Go home"|>\s*Go home\s*</.test(read(f)));
    expect(goHome).toEqual([]);
  });

  it("fixed (LOW): on /feed a member's 'You're in.' and 'Open your feed' sit in a section whose name, its visually hidden heading, is still 'Join our.one' (FrontPage: <h2 id=\"front-get-in\">{JOIN_LABEL}</h2>, the section aria-labelledby it); a screen reader announces the place a member is told they are in as the place to join (served so on 3731)", () => {
    const html = renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, seatsWaiting: 0, member: true }));
    const section = /<section[^>]*aria-labelledby="front-get-in"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
    expect(textOf(section)).toContain(MEMBER_JOIN.line);
    expect(JOIN_LABEL).toBe("Join our.one");
    const name = /<h2[^>]*id="front-get-in"[^>]*>([^<]*)<\/h2>/.exec(html)?.[1] ?? "";

    // The defect.
    expect(decode(name)).not.toBe(JOIN_LABEL);
  });

  it("fixed (LOW): below 1000px, /settings and the in-app not-found page show the site footer twice, its links, the version and the status line: their own InAppSiteFooter, hidden only from 1000px, and the panel's, which M-0020 now shows at every width, after the column. InAppSiteFooter.tsx still says it is 'for widths where the right column (and its footer) is hidden', and public.module.css 'Below 1000px the right column is hidden' (served so on 3731: /settings carries the status line twice)", () => {
    // Changed after the verification of M-0020 (H11): the in-app footer, and the sentences that said the
    // right column is hidden, are gone; the page and the panel carry the status line once.
    expect(filesUnder("src/components/public")).not.toContain("src/components/public/InAppSiteFooter.tsx");
    expect(prose("src/components/public/public.module.css")).not.toContain("Below 1000px the right column is hidden");
    // Drawn as the (app) layout draws them: the page, then the panel.
    const html = renderToStaticMarkup(createElement(Fragment, null, createElement(AppNotFound), createElement(RightColumn, { invitesRemaining: 3 })));
    expect(html.split(STATUS_LINE).length - 1).toBe(1);

    // Which of the two a phone shows: a rule hiding it at the base or under a max-width hides it there.
    const hiddenOnPhones = (rules: Rule[], selector: string) =>
      rules.some((r) => r.selectors.includes(selector) && /display:\s*none/.test(r.body) && (r.media === null || /max-width/.test(r.media)));
    const g = cssRules(read("src/app/globals.css"));
    const p = cssRules(read("src/components/public/public.module.css"));
    const pagesWithTheirOwn = ["src/app/(app)/settings/page.tsx", "src/app/(app)/not-found.tsx"].filter((f) => read(f).includes("<InAppSiteFooter"));
    const onAPhone = (hiddenOnPhones(p, ".inAppFooter") || pagesWithTheirOwn.length === 0 ? 0 : 1) + (hiddenOnPhones(g, ".aside") ? 0 : 1);

    // The defect: two footers on a phone.
    expect(onAPhone).toBe(1);
  });

  it("fixed (LOW): sentences M-0020 made false still stand. globals.css: 'The signed-in app (.app) keeps its look, and so does the picture of it on the feed's page' (D-0023 replaces D-0020's 'the signed-in app keeps its look'), and 'Derived (not in SPEC's table, built from it)' over our.one's values, while SPEC's table is X's; PageHeader.tsx: 'on /home pass `wordmark` and phones show the our.one wordmark in place of the title', which /home no longer does; and SPEC §9 still specifies X's tokens, the left navigation with its Post pill, 'Home' in the bottom bar and pill buttons, with nothing in §18.22 saying it replaces them", () => {
    expect(record("decisions/D-0023.md")).toContain('It replaces D-0020\'s "the signed-in app keeps its look"');
    const stale: string[] = [];
    const css = prose("src/app/globals.css");
    const specRaw = read("SPEC.md");
    if (css.includes("The signed-in app (.app) keeps its look, and so does the picture of it on the feed's page")) {
      stale.push("globals.css: the signed-in app keeps its look");
    }
    if (css.includes("Derived (not in SPEC's table, built from it).") && /\| `--bg` \| `#ffffff` \|/.test(specRaw)) {
      stale.push("globals.css: derived from SPEC's table, which is X's");
    }
    if (prose("src/components/PageHeader.tsx").includes("on /home pass `wordmark`") && !read("src/app/(app)/home/page.tsx").includes("wordmark")) {
      stale.push("PageHeader.tsx: /home passes the wordmark");
    }
    const s1822 = specRaw.slice(specRaw.indexOf("### 18.22"));
    if (/\| `--accent` \| `#1d9bf0` \|/.test(specRaw) && /a full-width \*Post\* pill/.test(flat(specRaw)) && !/§9/.test(s1822)) {
      stale.push("SPEC §9: X's tokens, the left navigation and its Post pill, unreplaced");
    }

    // The defect.
    expect(stale).toEqual([]);
  });

  it("fixed (LOW): the titles of nine adapted older tests still say what their bodies no longer check — verify-m0017-rendering 'send the visitor to /home … the blue accent (#1d9bf0)'; verify-m0013-render 'as the app's /home does on a phone' and 'the site's link blue … 3.0:1 on white'; verify-m0014-recheck '18.51:1 … 3.02:1 and 3.76:1 … told apart by luminance … #2f3336'; verify-m0014-render '18.51:1 … (14.59:1 on the dark card)', '6.12:1 in light and 4.58:1 in dark' and '258px at 1000–1099px and 4 in 318px from 1100px'; verify-m0015-recheck '1.44:1 light and 1.65:1 dark … 6.12:1 and 4.58:1'; verify-m0016-honesty '18.51:1 … (1.12:1 light, 1.65:1 dark)' — and one adapted assertion can't fail: verify-m0013-render now expects a count to be toBeGreaterThanOrEqual(0). A run and a receipt show the titles; the M-0018 verification's H13 found the same", () => {
    for (const t of ADAPTED_TITLES) {
      expect(titleOf(t.file, t.starts), t.starts).not.toBe("");
      expect(bodyOf(t.file, t.starts), t.starts).toContain("Changed under M-0020");
    }
    const stale = ADAPTED_TITLES.flatMap((t) => t.stale.filter((w) => titleOf(t.file, t.starts).includes(w)).map((w) => `${t.file}: ${w}`));
    const vacuous = read("tests/verify-m0013-render.test.ts").includes("expect(Object.keys(shown).length, scheme).toBeGreaterThanOrEqual(0);")
      ? ["tests/verify-m0013-render.test.ts: a count toBeGreaterThanOrEqual(0)"]
      : [];

    // The defect.
    expect([...stale, ...vacuous]).toEqual([]);
  });

  it("fixed (LOW): the M-0017 re-check's RC8 test is still skipped and titled 'recorded, not fixed', with its comment 'The test stays as written, and skipped, until that decision.' D-0023 is that decision ('decides M-0017's open question on members and the front door (its re-check's RC8)'), and M-0020 builds it: a member stays on the front door, so 'The idea' and 'In the open' reach what they name. The receipt's '2 skipped' doesn't say one of them is now decided", async () => {
    expect(record("decisions/D-0023.md")).toContain("decides M-0017's open question on members and the front door (its re-check's RC8)");
    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    expect(textOf((await routes()).door)).toContain(MEMBER_JOIN.line);
    expect(PLACES.filter((p) => p.href.startsWith("/#")).map((p) => p.label)).toEqual(["The idea", "In the open"]);

    const src = read("tests/verify-m0017-recheck.test.ts");
    const at = src.indexOf("two of the header's four places don't reach what they name");
    expect(at).toBeGreaterThan(-1);
    const head = src.slice(src.lastIndexOf("\n", at), at);

    // The defect.
    expect(/it\.skip\(|recorded, not fixed/.test(head), head.trim()).toBe(false);
  });

  it("fixed (LOW): the manifest M-0020 changed, and the root metadata beside the theme colours it changed, still describe our.one as 'A home for friends and people you choose to follow.': the feed, named home. It is the description of every page with none of its own (the app's pages, /contract, /signin, /join and an invite link) and of the installed app. D-0023's first reason: 'our.one is the network, and the feed its first project (D-0017, D-0020). A member who sees only the feed sees a feed app.'; the M-0018 verification's H7 corrected the README's 'our.one is a friends feed' for the same reason (served so on 3731: /home and /settings carry it as their description)", () => {
    expect(record("decisions/D-0023.md")).toContain("our.one is the network, and the feed its first project (D-0017, D-0020). A member who sees only the feed sees a feed app.");
    expect(git(["diff", "--name-only", "184865b", "4e04af5", "--", "apps/web/src/app/manifest.ts", "apps/web/src/app/layout.tsx"]).trim().split("\n").sort()).toEqual([
      "apps/web/src/app/layout.tsx",
      "apps/web/src/app/manifest.ts",
    ]);
    const described = { manifest: manifest().description ?? "", root: /\n {2}description: "([^"]*)"/.exec(read("src/app/layout.tsx"))?.[1] ?? "" };

    // The defect.
    expect(Object.values(described).filter((d) => /^A home for friends\b/i.test(d)), JSON.stringify(described)).toEqual([]);
  });
});

/* -------------------------------------------------------------- closed */

describe("closed (each passes on 4e04af5)", () => {
  it("closed: M-0020's first acceptance criterion holds in the code — every page under (app) is drawn inside the layout that renders the header every visitor gets (the wordmark to /, the four places) with the member's links on its right: Feed, Notifications and People with their counts ('Notifications, 3 unread', 'People, 1 request', 'People, 2 requests'), and a menu of Your profile, Settings and, for an administrator only, Moderation; the bottom bar keeps Feed, People, New post, Notifications and Profile, and below 700px the header keeps the menu while the bar carries the rest; the left navigation and its Post pill are gone from the code and the stylesheet", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toMatch(/<SiteHeader member>\s*<MemberLinks viewer=\{navViewer\} counts=\{counts\} \/>\s*<\/SiteHeader>/);
    expect(layout).toContain("<TabBar viewer={navViewer} counts={counts} />");
    expect(layout).toContain("const viewer = await requireViewer();");
    expect(filesUnder("src/app/(app)").filter((f) => f.endsWith("layout.tsx"))).toEqual(["src/app/(app)/layout.tsx"]);

    const header = render(SiteHeader, { children: "FICTIONAL", member: true });
    expect(header).toContain('class="public-header public-header--member"');
    expect(header).toMatch(/<a class="public-wordmark" aria-label="our\.one, home" href="\/">our<span class="public-wordmark__dot">\.<\/span>one<\/a>/);
    expect(textOf(header)).toContain(PLACES.map((p) => p.label).join(" "));

    const viewer = { handle: "ada_fict", displayName: "Ada Fictional", isAdmin: false };
    const links = (isAdmin: boolean, unread: number, pending: number) => render(MemberLinks, { viewer: { ...viewer, isAdmin }, counts: { unread, pending } });
    const parts = (html: string) => ({
      links: textOf(/<nav class="member__links"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ""),
      menu: textOf(/<ul class="menu__list">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? ""),
    });
    const one = links(false, 3, 1);
    expect(parts(one)).toEqual({ links: "Feed Notifications 3 People 1", menu: "Your profile Settings" });
    expect(one).toContain('aria-label="Notifications, 3 unread"');
    expect(one).toContain('aria-label="People, 1 request"');
    expect(links(false, 0, 2)).toContain('aria-label="People, 2 requests"');
    expect(parts(links(true, 0, 0))).toEqual({ links: "Feed Notifications People", menu: "Your profile Settings Moderation" });

    const bar = render(TabBar, { viewer, counts: { unread: 0, pending: 0 } });
    expect([...bar.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1])).toEqual(["Main", "Feed", "People", "New post", "Notifications", "Profile"]);

    const g = cssRules(read("src/app/globals.css"));
    expect(g.filter((r) => r.selectors.includes(".member__links") && /display:\s*none/.test(r.body)).map((r) => r.media)).toEqual(["(max-width: 699px)"]);
    expect(g.filter((r) => r.selectors.includes(".tabbar") && /display:\s*none/.test(r.body)).map((r) => r.media)).toEqual(["(min-width: 700px)"]);
    expect(read("src/components/Nav.tsx")).not.toMatch(/export function Nav\b|nav__post|>\s*Post\s*</);
    expect(read("src/app/globals.css")).not.toMatch(/\.nav__(?:post|item|inner|chip)\b/);
    expect(filesUnder("src").filter((f) => /\.tsx$/.test(f) && /<Nav\b/.test(read(f)))).toEqual([]);
  });

  it("closed: the five colours the acceptance criterion names are in no stylesheet, picture, icon, manifest or inline style, as hex or rgb; the root tokens are our.one's, as SPEC §18.22 and the receipt say (paper #f5f3eb, ink #222b24, sub #586157, line #d7dace, rust #bf411d as the accent, and their dark values #131a15, #ebeee3, #a7b19c, #2b382e, #ec8d66); the icon is ink, paper and a rust dot, and the browser bar and the manifest are paper", () => {
    expect(coloursIn(seenFiles(), X_COLOURS.filter((c) => c.acceptance))).toEqual([]);
    const g = cssRules(read("src/app/globals.css"));
    expect(base(g, ":root")).toMatchObject({ "--bg": "#f5f3eb", "--text": "#222b24", "--muted": "#586157", "--border": "#d7dace", "--accent": "#bf411d" });
    const dark = g.find((r) => r.media === "(prefers-color-scheme: dark)" && r.selectors.includes(":root"))!;
    expect(declarations(dark.body)).toMatchObject({ "--bg": "#131a15", "--text": "#ebeee3", "--muted": "#a7b19c", "--border": "#2b382e", "--accent": "#ec8d66" });
    const icon = read("src/app/icon.svg");
    expect([...icon.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1])).toEqual(["#222b24", "#f5f3eb", "#bf411d"]);
    expect(manifest()).toMatchObject({ background_color: "#f5f3eb", theme_color: "#f5f3eb" });
    expect(read("src/app/layout.tsx")).toContain('{ media: "(prefers-color-scheme: light)", color: "#f5f3eb" }');
  });

  it("closed: as a member, / renders the front door with 'Your feed' in the header (the layout's Suspense boundary resolved) and, in place of the join form, 'You're in.' and 'Open your feed', both to /home, and the count with no rank; /feed the same, with no closing invitation; as a visitor, Sign in, the form and the rank, as before. Nothing redirects a member away from /: no redirect in the route, the public layout or the root layout, no middleware or proxy, no redirects() in next.config, no client component on the front door that navigates; the route renders for a member with the database up or down (served the same on 3731, where / and /feed sent 'Your feed' in their first part, both routes waiting on the session themselves)", async () => {
    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    const member = await full(createElement(PublicLayout, null, (await FrontDoorRoute()) as ReactElement));
    const header = member.slice(member.indexOf("<header"), member.indexOf("</header>"));
    expect(header).toContain('<a class="public-header__signin" href="/home">Your feed</a>');
    expect(header).not.toContain("Sign in");
    expect(member).not.toContain("<form");
    expect(member).toContain(`<a class="btn btn--primary" href="/home">${MEMBER_JOIN.link}</a>`);
    expect(textOf(member)).toContain(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link} ${memberCountLine(12)}`);
    expect(textOf(member)).not.toContain("You'd be #13");
    const feed = textOf((await routes()).feed);
    expect(feed).toContain(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link}`);
    expect(feed).not.toContain(CLOSE_LINE);
    expect(feed).toContain(memberCountLine(12));

    state.cookie = null;
    state.member = false;
    const visitor = await full(createElement(PublicLayout, null, (await FrontDoorRoute()) as ReactElement));
    expect(visitor).toContain('<a class="public-header__signin" href="/signin">Sign in</a>');
    expect(visitor).toContain("<form");
    expect(textOf(visitor)).toContain("12 people are in. You'd be #13.");

    for (const file of ["src/app/(public)/page.tsx", "src/app/(public)/layout.tsx", "src/app/layout.tsx"]) {
      expect(read(file), file).not.toMatch(/\bredirect\(|permanentRedirect|useRouter|location\.(?:href|assign|replace)/);
    }
    for (const file of ["src/middleware.ts", "src/proxy.ts", "middleware.ts", "proxy.ts"]) {
      expect(statSync(join(WEB, file), { throwIfNoEntry: false }), file).toBeUndefined();
    }
    expect(read("next.config.ts")).not.toMatch(/redirects\s*\(/);
    const doorImports = [...read("src/components/public/FrontDoor.tsx").matchAll(/from "\.\/(\w+)"/g)].map((m) => `src/components/public/${m[1]}.tsx`);
    for (const file of doorImports.filter((f) => statSync(join(WEB, f), { throwIfNoEntry: false }))) {
      // Draft.tsx's one assignment opens the visitor's own email app, on their click (draftMailto: a mailto: link).
      const code = file.endsWith("/Draft.tsx") ? read(file).replace("window.location.href = link.href;", "") : read(file);
      expect(code, file).not.toMatch(/useRouter|router\.(?:push|replace)|location\.(?:href|assign|replace)\b/);
    }
    expect(read("src/components/public/Draft.tsx")).toMatch(/function openEmail\(\) \{[\s\S]*?const link = draftMailto\(email, kind, text\);[\s\S]*?window\.location\.href = link\.href;/);
    expect(read("src/components/public/drafts.ts")).toContain("const subject = `mailto:${email}?subject=");
    for (const db of ["up", "down"] as const) {
      state.cookie = "FICTIONAL-cookie";
      state.member = true;
      state.db = db;
      await expect(FrontDoorRoute(), db).resolves.toBeTruthy();
    }
  });

  it("closed: 'You're in.' is true for every account that can see it — only a session that is signed, not revoked and not expired, of an account that isn't suspended, makes a viewer (sessionFromCookie, viewerAccount); memberCount counts every account that isn't suspended, so the member is among 'N people are in.'; with the database down the panel shows a visitor's view, never 'You're in.'; and memberCountLine says '1 person is in.', '12 people are in.' and '1,234 people are in.', never a rank", async () => {
    const auth = read("src/core/auth.ts");
    const session = auth.slice(auth.indexOf("export async function sessionFromCookie"), auth.indexOf("/** Revoke one session"));
    expect(session).toContain("const id = sessionIdFromCookie(value);");
    expect(session).toMatch(/isNull\(sessions\.revokedAt\),\s*gt\(sessions\.expiresAt, now\),\s*isNull\(accounts\.suspendedAt\)/);
    const viewer = auth.slice(auth.indexOf("export async function viewerAccount"));
    expect(viewer).toMatch(/\.where\(and\(eq\(accounts\.id, accountId\), isNull\(accounts\.suspendedAt\)\)\)/);
    expect(read("src/core/seats.ts")).toMatch(/export async function memberCount[\s\S]*?\.from\(accounts\)\s*\.where\(isNull\(accounts\.suspendedAt\)\);/);

    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    state.db = "down";
    const { door, feed } = await routes();
    expect(textOf(door)).not.toContain(MEMBER_JOIN.line);
    expect(textOf(feed)).not.toContain(MEMBER_JOIN.line);

    expect([1, 12, 1234].map(memberCountLine)).toEqual(["1 person is in.", "12 people are in.", "1,234 people are in."]);
    expect([0, 1, 2, 12, 1234].map(memberCountLine).filter((l) => /#|You'd be/.test(l))).toEqual([]);
  });

  it("closed: the public pages still render with the database down — with no cookie and with a member's cookie, the front door, /feed, /projects, /build, /maintainers, /agreement, /contract, /costs, /rules, /power, /privacy and /signin render inside the public layout without an error, the count line is left out, and the header says Sign in without a cookie; the layout reads the session only in its own Suspense boundary, isMemberHere catches every error, and without a cookie the database isn't asked at all", async () => {
    const layout = read("src/app/(public)/layout.tsx");
    expect(layout).toContain("<Suspense fallback={<SignIn />}>");
    expect(layout).not.toMatch(/getDb|getViewer\(/);
    // Changed after the verification of M-0020 (H5): isMemberHere still catches every error, and answers
    // no when the database can't be read; it is cached per request.
    expect(read("src/web/viewer.ts")).toMatch(/export const isMemberHere = cache\(async \(\): Promise<boolean> => \{\s*let raw: string \| null;\s*try \{\s*raw = await readSessionCookie\(\);\s*\} catch \{\s*return false;\s*\}\s*if \(!raw\) return false;\s*try \{\s*return \(await getViewer\(\)\) !== null;\s*\} catch \(error\) \{[\s\S]*?return false;\s*\}\s*\}\);/);

    const pages: [string, () => Promise<ReactElement>][] = [
      ["/", async () => (await FrontDoorRoute()) as ReactElement],
      ["/feed", async () => (await FeedPageRoute()) as ReactElement],
      ["/projects", async () => createElement(ProjectsPage)],
      ["/build", async () => createElement(BuildPage)],
      ["/maintainers", async () => createElement(MaintainersPage)],
      ["/agreement", async () => createElement(AgreementPage)],
      ["/contract", async () => createElement(ContractPage)],
      ["/costs", async () => createElement(CostsPage)],
      ["/rules", async () => createElement(RulesPage)],
      ["/power", async () => createElement(PowerPage)],
      ["/privacy", async () => createElement(PrivacyPage)],
      ["/signin", async () => (await SignInPage({ searchParams: Promise.resolve({}) })) as ReactElement],
    ];
    for (const cookie of [null, "FICTIONAL-cookie"]) {
      state.cookie = cookie;
      state.member = cookie !== null;
      state.db = "down";
      for (const [where, page] of pages) {
        const html = await full(createElement(PublicLayout, null, await page()));
        const text = textOf(html);
        expect(text, `${where}, cookie ${String(cookie)}`).not.toMatch(/\d people are in|1 person is in/);
        // Changed after the verification of M-0020 (H5): with the database down nobody is shown as a member.
        expect(html.includes('<a class="public-header__signin" href="/signin">Sign in</a>'), where).toBe(true);
      }
    }
  });

  it("closed: the feed is named the feed where M-0020 says — the browser's title 'Feed · our.one' (/home's metadata, the root template), /home's bar (<h1>Feed</h1>), the header's link, the bottom bar's tab and navItems; the visually hidden heading over the posts is 'Your feed'; and the composer's words and the empty state are the ones verified before ('New post', \"What's new?\", 'Post', 'Your feed is quiet. Invite someone you know.' with Invite)", () => {
    const home = read("src/app/(app)/home/page.tsx");
    expect(home).toContain('export const metadata: Metadata = { title: "Feed" };');
    expect(read("src/app/layout.tsx")).toContain('title: { default: "our.one", template: "%s · our.one" }');
    expect(home).toContain('<PageHeader title="Feed" />');
    expect(render(PageHeader, { title: "Feed" })).toContain('<h1 class="page-header__title">Feed</h1>');
    expect(home).toContain('<h2 className="visually-hidden">Your feed</h2>');
    expect(navItems({ handle: "ada_fict", displayName: "Ada Fictional" }, { unread: 0, pending: 0 })[0]).toMatchObject({ href: "/home", label: "Feed" });
    for (const words of ['label="New post"', `placeholder="What's new?"`, 'submitLabel="Post"', 'text: "Your feed is quiet. Invite someone you know."', 'action: { href: "/people/invites", label: "Invite" }']) {
      expect(home, words).toContain(words);
      expect(git(["show", "184865b:apps/web/src/app/(app)/home/page.tsx"]), words).toContain(words);
    }
  });

  it("closed: the feed's verified words are unchanged — of every file under src, only the 21 the build touched changed; in the five that hold the feed's and the front door's words (FrontPage, FrontDoor, door.ts, join.ts and /home), no string M-0020 removed is gone: every line it took out is back with the member's condition around it; the strings that went are the old shell's (the left navigation, 'Home' in the bar, the aside's name 'More'); and contract, rules, privacy, power, costs, agreement, the markers, the posts, the drafts and the mail are byte for byte as verified", () => {
    const changed = git(["diff", "--name-only", "184865b", "4e04af5", "--", "apps/web/src"]).trim().split("\n").map((p) => p.replace(/^apps\/web\//, ""));
    expect(changed).toEqual([
      "src/app/(app)/home/page.tsx",
      "src/app/(app)/layout.tsx",
      "src/app/(public)/feed/page.tsx",
      "src/app/(public)/layout.tsx",
      "src/app/(public)/page.tsx",
      "src/app/globals.css",
      "src/app/icon.svg",
      "src/app/layout.tsx",
      "src/app/manifest.ts",
      "src/components/MemberLinks.tsx",
      "src/components/Nav.tsx",
      "src/components/RightColumn.tsx",
      "src/components/SiteHeader.tsx",
      "src/components/TabBar.tsx",
      "src/components/public/FrontDoor.tsx",
      "src/components/public/FrontPage.tsx",
      "src/components/public/MemberJoin.tsx",
      "src/components/public/door.ts",
      "src/components/public/join.ts",
      "src/components/public/public.module.css",
      "src/web/viewer.ts",
    ]);
    const literals = (line: string) =>
      [
        ...[...line.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? ""),
        ...[...line.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]!.trim()),
      ].filter((s) => /[A-Za-z]{2}/.test(s));
    const gone = (file: string) => {
      const removed = git(["diff", "-U0", "184865b", "4e04af5", "--", `apps/web/${file}`])
        .split("\n")
        .filter((l) => l.startsWith("-") && !l.startsWith("---") && !/^-\s*(?:\*|\/\/|\/\*)/.test(l));
      const now = read(file);
      return [...new Set(removed.flatMap(literals))].filter((s) => !now.includes(s));
    };
    for (const file of ["src/components/public/FrontPage.tsx", "src/components/public/FrontDoor.tsx", "src/components/public/door.ts", "src/components/public/join.ts", "src/app/(app)/home/page.tsx"]) {
      expect(gone(file), file).toEqual([]);
    }
    expect(gone("src/components/TabBar.tsx")).toEqual(["Home"]);
    expect(gone("src/components/RightColumn.tsx")).toEqual(["More"]);
    expect(gone("src/components/Nav.tsx")).toEqual(expect.arrayContaining(["Home", "our.one home", "New post", "Your account settings"]));
    // Changed under M-0021 (D-0024 §C): /privacy gained the needs' row, and nothing else: its diff
    // against 184865b removes no line of content.
    const privacyRemoved = git(["diff", "-U0", "184865b", "--", "apps/web/src/app/(public)/privacy/page.tsx"])
      .split("\n")
      .filter((l) => l.startsWith("-") && !l.startsWith("---"));
    expect(privacyRemoved).toEqual([]);
    for (const file of [
      "src/app/(public)/contract/page.tsx",
      "src/components/public/floorRules.ts",
      "src/app/(public)/power/page.tsx",
      "src/app/(public)/costs/page.tsx",
      "src/app/(public)/agreement/page.tsx",
      "src/components/Marker.tsx",
      "src/components/posts/FeedList.tsx",
      "src/components/posts/Composer.tsx",
      "src/components/posts/PostRow.tsx",
      "src/components/public/drafts.ts",
      "src/components/public/lede.ts",
      "src/components/public/handover.ts",
      "src/core/mail-templates.ts",
    ]) {
      expect(read(file), file).toBe(git(["show", `184865b:apps/web/${file}`]));
    }
  });

  it("closed: the panel claims nothing that isn't so — its line is D-0020 §A's message, a 'should'; 'The feed is our.one's first project.' is D-0017 §A and D-0023 §D; 'What should we make ours?' is the front door's own question, asked, not answered; 'Name a need' and 'Bring an idea' are D-0020 §A's words and open the front door's drafts (without JavaScript, /maintainers), whose dialog says 'Nothing is saved, sent or counted.'; its places are the header's four; the panel ends with the status line, 'Maintained by its founder. Promised: …'. No word a person reads in the panel, the member's links and menu, MemberJoin, the bottom bar or a member's header says member, owner, control, holder, safeguard or protected; the claims scan finds nothing in any of them, nor in / and /feed as a member", async () => {
    expect(record("decisions/D-0020.md")).toContain("The message: \"The software we live in should be ours.\"");
    expect(TAGLINE).toBe("The software we live in should be ours.");
    expect(record("decisions/D-0017.md")).toContain("The feed is the first project, under the same framework.");
    expect(record("decisions/D-0023.md")).toContain("Beside it, a panel says what our.one is: the line, that the feed is its first project, and the ways to name a need or bring an idea, as the front door has them.");
    // Changed after the verification of M-0020 (H6): the panel names the feed, wherever it stands.
    expect(MEMBER_PANEL.text).toBe(`The feed is our.one's first project. ${PART_HEADING[0]} ${PART_HEADING[1]}`);
    expect(record("decisions/D-0020.md")).toContain("Find your part: start with the feed, name a need, or bring an idea.");
    const card = render(OursCard, { email: null });
    expect(card).toContain(`href="${DRAFT_FALLBACK.need}"`);
    expect(card).toContain(`href="${DRAFT_FALLBACK.idea}"`);
    expect(draftNote(false)).toMatch(/^Nothing is saved, sent or counted\./);
    expect(draftNote(true)).toMatch(/^Nothing is saved, sent or counted\./);
    expect([...card.matchAll(/<a href="(\/[^"]*)">/g)].map((m) => m[1])).toEqual(PLACES.map((p) => p.href));
    const column = render(RightColumn, { invitesRemaining: 3 });
    expect(column.indexOf("card--ours")).toBeLessThan(column.indexOf(STATUS_LINE));
    expect(STATUS_LINE).toMatch(/^Maintained by its founder\. Promised: /);

    const seen: [string, string][] = [
      ["the panel", card],
      ["the member's links", render(MemberLinks, { viewer: { handle: "ada_fict", displayName: "Ada Fictional", isAdmin: true }, counts: { unread: 2, pending: 1 } })],
      ["the bottom bar", render(TabBar, { viewer: { handle: "ada_fict", displayName: "Ada Fictional" }, counts: { unread: 2, pending: 1 } })],
    ];
    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    seen.push(["a member's header", await publicHeader()]);
    const { door, feed } = await routes();
    const join = (html: string) => html.slice(html.indexOf(MEMBER_JOIN.line) - 200, html.indexOf(MEMBER_JOIN.link) + 200);
    seen.push(["MemberJoin on /", join(door)], ["MemberJoin on /feed", join(feed)]);
    for (const [where, html] of seen) {
      const words = `${textOf(html)} ${[...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" ")}`;
      expect(words, where).not.toMatch(/\bmembers?\b|\bown(?:s|ed|er|ership)?\b|\bcontrol|\bholder\b|\bsafeguard|\bprotected\b/i);
      expect([...scanText(html, null), ...scanText(textOf(html), null)].map((h) => h.match), where).toEqual([]);
    }
    // Each page read as claims.test.ts reads it, with the allowlist of the file its words come from.
    for (const [where, html, file] of [
      ["/", door, "src/components/public/FrontDoor.tsx"],
      ["/feed", feed, "src/components/public/FrontPage.tsx"],
    ] as const) {
      expect([...scanText(html, file), ...scanText(textOf(html), file)].map((h) => h.match), where).toEqual([]);
    }
  });

  it("closed: the claims scan and the kit's check pass, as the receipt says, and the scan reads every source file M-0020 added or changed (MemberLinks, SiteHeader, MemberJoin, RightColumn, Nav, TabBar, FrontDoor, FrontPage, door.ts, join.ts, viewer.ts, the root and both group layouts, the two routes, /home and the manifest): no prohibited claim in 177 files on 4e04af5 (178 after the verification's fixes) with 17 allowlisted sentences, and READY TO PROPOSE", () => {
    const changed = git(["diff", "--name-only", "184865b", "4e04af5", "--", "apps/web/src"])
      .trim()
      .split("\n")
      .map((p) => p.replace(/^apps\/web\//, ""))
      .filter((p) => /\.tsx?$/.test(p));
    expect(changed.length).toBe(18);
    const files = publicTextFiles(WEB);
    for (const file of changed) expect(files, file).toContain(file);
    const pages = scanRepoPublicText(WEB);
    const kit = scanKitText(WEB);
    expect([...pages.hits, ...kit.hits]).toEqual([]);
    // Changed after the verification of M-0020 (H2, H4, H11): places.ts and PublicAccount.tsx added, InAppSiteFooter.tsx gone.
    // Changed under M-0021 (D-0024): needs.ts and FirstScreenForm.tsx added (180), and the pledge's sentence
    // listed for FrontDoor.tsx in both forms (19).
    // Changed after the verification of M-0021 (H8): need-words.ts added (181).
    expect(pages.files.length + kit.files.length).toBe(181);
    expect(ALLOWLIST.length).toBe(19);
    expect(record("receipts/builds/2026-10-03-M-0020.md")).toContain("| Claims scan | CHECKED | no prohibited claim in 177 files; 17 sentences listed |");

    const check = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], {
      cwd: ROOT,
      encoding: "utf8",
      // Only what it needs: nothing of this process's environment reaches the kit.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    });
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("RESULT: READY TO PROPOSE.");
    expect(check.stdout).toMatch(/\[ {2}ok {2}\] claims/);
  });

  it("closed: the founder's question is stated truthfully — the receipt quotes M-0020 ('`/` and the header show a member \"Your feed\"') and D-0023 §B ('their feed, their notifications and their own pages') word for word; the build does what M-0020 says (a member's public header holds 'Your feed', and no Notifications, People or menu); the narrower reading builds less than D-0023 might ask, never more (AGENTS.md §12); served on 3731, /agreement sent the member 'Sign in' first and 'Your feed' after it, in a part a script swaps in, as SPEC §18.22 says ('until it knows, it offers Sign in'), so without JavaScript a member keeps Sign in there, which leads them on to /home; the receipt leaves the choice to the founder, and the stopping rule says what the founder asks for is not a finding. Apart from the findings above, nothing in the build contradicts D-0023: one header in the app, the bar on phones, no redirect, the feed named the feed, the panel beside it", async () => {
    const receipt = record("receipts/builds/2026-10-03-M-0020.md");
    expect(record("mandates/M-0020.md")).toContain('/ and the header show a member "Your feed";');
    expect(receipt).toContain('M-0020 says the public header shows a member "Your feed", and the build does that.');
    expect(record("decisions/D-0023.md")).toContain("On its right, where a visitor has Sign in, a member has their feed, their notifications and their own pages.");
    expect(receipt).toContain('D-0023 §B says that where a visitor has Sign in, a member has "their feed, their notifications and their own pages".');
    expect(receipt).toContain("The reading that asks for more work is not taken here (AGENTS.md §12); the founder chooses.");
    expect(flat(readRoot("AGENTS.md"))).toContain("The correct response to an authority conflict is never the reading that authorizes more work.");
    expect(record("receipts/conformance/2026-10-03-M-0020.verification.md")).toContain("What the founder asks for is not a finding.");

    state.cookie = "FICTIONAL-cookie";
    state.member = true;
    const header = await publicHeader();
    expect(textOf(header.replace(/<span class="public-wordmark__dot">\.<\/span>/, "."))).toBe(`our.one ${PLACES.map((p) => p.label).join(" ")} Your feed`);
    expect(header).not.toMatch(/Notifications|People|<details/);
  });

  it("closed: M-0020 stayed in its scope — dc12ea0 and b5cf968 change only apps/web/**, 80e4300 only receipts/builds/**, 4e04af5 only receipts/conformance/**; none touches a denied path (the kit, vercel.json, the records, the foundation, packages, apps/proof); the records 533d5b8 adds are P-0016, D-0023 and M-0020 alone; and the receipt's statuses are the true ones: TESTED locally, nothing pushed or deployed, the verification's progress as it stands, only R-SCOPE ENFORCED (its numbers held here too: 1,602 tests pass and 2 are skipped in 63 files before this one, the claims scan, the kit's check, and a production build)", () => {
    const paths = (commit: string) => git(["show", "--name-only", "--format=", commit]).trim().split("\n");
    expect(paths("dc12ea0").every((p) => p.startsWith("apps/web/"))).toBe(true);
    expect(paths("b5cf968").every((p) => p.startsWith("apps/web/"))).toBe(true);
    expect(paths("80e4300").every((p) => p.startsWith("receipts/builds/"))).toBe(true);
    expect(paths("4e04af5")).toEqual(["receipts/conformance/2026-10-03-M-0020.verification.md"]);
    const denied = /^(?:kit\/|vercel\.json|authority\/|constitution\/|decisions\/|mandates\/|foundation\/|proposals\/|envelopes\/|packages\/|apps\/proof\/|communities\/|spec\/|exit\/|observations\/)/;
    expect(["dc12ea0", "b5cf968", "80e4300", "4e04af5"].flatMap(paths).filter((p) => denied.test(p))).toEqual([]);
    const m0020 = readRoot("mandates/M-0020.yaml");
    for (const allowed of ["- apps/web/**", "- receipts/builds/**", "- receipts/conformance/**"]) expect(m0020).toContain(allowed);
    expect(paths("533d5b8").sort()).toEqual([
      "decisions/D-0023.md",
      "decisions/D-0023.yaml",
      "mandates/M-0020.md",
      "mandates/M-0020.yaml",
      "proposals/P-0016.evidence-conversation-2026-10-03.md",
      "proposals/P-0016.md",
      "proposals/P-0016.yaml",
    ]);
    const receipt = record("receipts/builds/2026-10-03-M-0020.md");
    // Changed after the verification of M-0020 (round one, then the re-check): the receipt says where the
    // verification stands now, truly; its three tables of checks, before round one, after it and after the
    // re-check, each hold R-SCOPE as the one ENFORCED.
    expect(receipt).toContain("Status: TESTED locally, after the independent verification and its one re-check: 37 findings fixed, one recorded for the founder. Nothing is pushed or deployed.");
    expect(receipt).not.toContain("has not run yet");
    expect([...receipt.matchAll(/\| ([^|]+) \| (ENFORCED|CHECKED|STRUCTURAL|INTERPRETED|DECLARED) \|/g)].filter((m) => m[2] === "ENFORCED").map((m) => m[1]!.trim())).toEqual(["R-SCOPE", "R-SCOPE", "R-SCOPE"]);
  });

  it("closed: the eleven older tests M-0020 adapted kept their force, apart from the titles above — each adapted file carries 'Changed under M-0020' with its reason, none gained a skip or an only, and none has fewer assertions than before but verify-m0014-render, which dropped the one about the 1100px rule the panel no longer has, its reason in the comment; every changed number is the new tokens' own (13.14, 15.07, 5.79, 7.93 and the like, from #222b24 and #586157 on #f5f3eb, and their dark values)", () => {
    const adapted = [
      "front-door",
      "front-page",
      "verify-honesty",
      "verify-m0013-render",
      "verify-m0014-recheck",
      "verify-m0014-render",
      "verify-m0015-recheck",
      "verify-m0015-rendering",
      "verify-m0016-honesty",
      "verify-m0017-honesty",
      "verify-m0017-rendering",
    ].map((f) => `apps/web/tests/${f}.test.ts`);
    const changed = git(["diff", "--name-only", "184865b", "4e04af5", "--", "apps/web/tests"]).trim().split("\n").sort();
    expect(changed).toEqual([...adapted, "apps/web/tests/one-ours.test.ts"].sort());
    const count = (s: string) => (s.match(/expect\(/g) ?? []).length;
    for (const f of adapted) {
      const plus = git(["diff", "--unified=0", "184865b", "4e04af5", "--", f]).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      expect(plus.some((l) => l.includes("Changed under M-0020")), f).toBe(true);
      expect(plus.filter((l) => /\.(?:skip|todo|only)\(|skipIf|runIf/.test(l)), f).toEqual([]);
      const before = count(git(["show", `184865b:${f}`]));
      const after = count(git(["show", `4e04af5:${f}`]));
      if (f.endsWith("verify-m0014-render.test.ts")) expect([before, after], f).toEqual([86, 85]);
      else expect(after, f).toBeGreaterThanOrEqual(before);
    }
    expect(bodyOf("tests/verify-m0014-render.test.ts", "closed: it renders once in each place")).toContain("the panel is 320px beside the");
    expect(contrast("#222b24", "#f5f3eb")).toBe(13.14);
    expect(contrast("#ebeee3", "#131a15")).toBe(15.07);
    expect(contrast("#586157", "#f5f3eb")).toBe(5.79);
    expect(contrast("#a7b19c", "#131a15")).toBe(7.93);
  });
});
