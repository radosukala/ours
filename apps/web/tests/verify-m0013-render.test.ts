/**
 * Independent verification of M-0013 (the front page, product first), the
 * rendering lens: how the page lays out and reads in both themes, what a
 * screen reader and a keyboard get, how faithfully its phone pictures the
 * app, and how each state renders. Written by an agent that did not build
 * it, against 24a683f. The words and the claims scan are another
 * verifier's.
 *
 * Stopping rule, declared before the first test was written: each of the
 * brief's five areas is tried at least once — layout at 320, 390, 768,
 * 1024 and 1440px; both themes; accessibility; the phone's fidelity to
 * the app (post rows, the caught-up marker, the phone tab bar); and the
 * states (joining open and closed; the count null, 0, 1 and 1,284; the
 * seats null, 0 and 5). Each try ends here as a failing "DEFECT
 * (SEVERITY): …" test or a passing "closed: …" test or, where only a
 * browser's layout can see it, as a measurement in the verification
 * report (taken on the development server at http://127.0.0.1:3310/).
 * Nothing in the product code is changed by this file.
 *
 * - "DEFECT (SEVERITY): …" asserts what the page should render. It FAILS
 *   on 24a683f, and the failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Everyone here is FICTIONAL: the page's own three people, and one more.
 *
 * After the round (the architect, SPEC §18.15 "Decisions after the
 * verification"): the phone is now built from the app's own parts, so each
 * DEFECT below was fixed and renamed "fixed (…)", its assertion kept or
 * pointed at the fixed page; one part of a contrast finding, older than
 * this build, is "accepted:" with the reason. The closed tests follow the
 * fixed page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The app's feed and post rows ask for the router; nothing navigates here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    prefetch: () => undefined,
  }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));
// Server actions are rendered as form and button targets, never called.
vi.mock("@/app/(public)/seat-actions", () => ({ takeSeat: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/components/posts/actions", () => ({
  toggleLikeAction: vi.fn(),
  deletePostAction: vi.fn(),
  deleteReplyAction: vi.fn(),
  mutePersonAction: vi.fn(),
  unmutePersonAction: vi.fn(),
  blockPersonAction: vi.fn(),
}));

import { CaughtUpMarker } from "@/components/Marker";
import { PageHeader } from "@/components/PageHeader";
import { FeedList } from "@/components/posts/FeedList";
import { PostRow } from "@/components/posts/PostRow";
import { CONTRAST_CAPTION, FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview, PREVIEW_CAPTION, PREVIEW_LAST_VISIT, PREVIEW_NOW } from "@/components/public/FeedPreview";
import { countLine, FREE_LINE, FrontPage, type FrontPageProps } from "@/components/public/FrontPage";
import type { PostView } from "@/core/posts";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const GLOBALS = read("src/app/globals.css");
const PUBLIC_CSS = read("src/components/public/public.module.css");
/** The front page's block of public.module.css: everything before the contract's. */
const FRONT_CSS = PUBLIC_CSS.slice(
  0,
  PUBLIC_CSS.indexOf("/* --------------------------------------------------------------- contract */"),
);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* ---------------------------------------------------------------- helpers */

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
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

/** A small tree of React's static markup, enough to ask what is inside what. */
type El = { tag: string; attrs: Record<string, string>; children: (El | string)[]; parent: El | null };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [], parent: null };
  let current = root;
  const token =
    /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(token)) {
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

/** An element's CSS-module class, as written in the source: `_phoneEnd_73fd6d` → "phoneEnd". */
function moduleClass(el: El): string {
  return (el.attrs.class ?? "")
    .split(" ")
    .map((c) => c.replace(/^_(.+)_[0-9a-f]{6}$/, "$1"))
    .join(" ");
}

const hidden = (el: El) => el.attrs["aria-hidden"] === "true";

/** The declarations of the top-level rule for exactly this selector. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1]!;
}

/** SPEC §9's tokens as globals.css sets them, for one theme. */
function tokens(scheme: "light" | "dark"): Record<string, string> {
  const from = scheme === "light" ? 0 : GLOBALS.indexOf("@media (prefers-color-scheme: dark)");
  const start = GLOBALS.indexOf(":root {", from);
  const block = GLOBALS.slice(start, GLOBALS.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

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

function renderFront(props: Partial<FrontPageProps> = {}): string {
  return renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, ...props }));
}

/** The HTML of the section whose heading has this id. */
function section(html: string, id: string): string {
  const start = html.lastIndexOf("<section", html.indexOf(`id="${id}"`));
  return html.slice(start, html.indexOf("</section>", start));
}

/** A post as the core sends it to the feed; FICTIONAL people. */
function post(handle: string, displayName: string, body: string, createdAt: Date): PostView {
  return {
    id: `post-${handle}`,
    body,
    audience: "friends",
    createdAt,
    author: { id: `account-${handle}`, handle, displayName },
    isOwn: false,
    replyCount: 0,
    likedByMe: false,
    removed: null,
  };
}

/** The phone's own feed, as the core would send it: 2h, 5h and 1d old. */
function phoneFeed(now: number): PostView[] {
  return [
    post("mara", "Mara", "Made it to the top before the rain. Legs are gone. Worth it.", new Date(now - 2 * HOUR)),
    post("tomas", "Tomas", "Soup's on tonight. Door's open from 7, bring whoever.", new Date(now - 5 * HOUR)),
    post("jana", "Jana", "Finished the book you lent me. The last chapter. Wow.", new Date(now - DAY)),
  ];
}

/** The app's /home feed for these posts and this last visit (FeedList, as /home calls it). */
function appFeed(items: PostView[], lastVisit: Date): string {
  return renderToStaticMarkup(
    createElement(FeedList, {
      first: { items, nextCursor: null },
      loadMore: async () => ({ ok: false as const, error: "FICTIONAL: nothing more" }),
      markers: true,
      caughtUpBefore: lastVisit,
      hideMuted: true,
      empty: { text: "Your feed is quiet. Invite someone you know." },
    }),
  );
}

const PHONE_HTML = renderToStaticMarkup(createElement(FeedPreview));
const PHONE = parse(PHONE_HTML);
const PHONE_SCREEN = findAll(PHONE, (e) => moduleClass(e) === "phone")[0]!;

/** The caught-up marker's two lines, as CaughtUpMarker writes them for the phone's last visit. */
const PREVIEW_MARKER = ["You're caught up", "You've seen everything from before your last visit, 2 days ago."] as const;

/* ============================== fixed: the phone is the app (were DEFECTS) */

describe("the phone looks like the app (SPEC §18.15 item 1.5: 'the app's caught-up marker', 'a tab bar like the app's'; SPEC §9)", () => {
  it("fixed (SPEC §18.15, after the verification; was DEFECT (MEDIUM)): the phone's caught-up marker is the app's: the words between a thin rule on each side, with no tick (SPEC §9 Markers; Marker.tsx)", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    const app = parse(
      renderToStaticMarkup(createElement(CaughtUpMarker, { since: new Date(now.getTime() - 2 * DAY), now })),
    );
    // What a marker is made of, left to right: rules, an icon, words.
    const shape = (marker: El) =>
      marker.children
        .filter((c): c is El => typeof c !== "string")
        .map((c) => (text(c) ? "words" : findAll(c, (e) => e.tag === "svg").length || c.tag === "svg" ? "icon" : "rule"))
        .filter((part, i, all) => !(part === "words" && all[i - 1] === "words"));
    const appMarker = findAll(app, (e) => e.attrs.role === "separator")[0]!;
    const phoneMarker = closest(
      findAll(PHONE_SCREEN, (e) => e.tag === "strong" && text(e) === PREVIEW_MARKER[0])[0]!,
      (e) => e.attrs.role === "separator",
    )!;
    expect(PREVIEW_LAST_VISIT.getTime()).toBe(now.getTime() - 2 * DAY);
    expect(PREVIEW_NOW.getTime()).toBe(now.getTime());

    // The words are the app's (D-0015 §J), and that part holds.
    expect(text(phoneMarker)).toBe(text(appMarker));
    expect(shape(appMarker)).toEqual(["rule", "words", "rule"]);
    // The drawing is not.
    expect(shape(phoneMarker), "the phone's marker, left to right").toEqual(shape(appMarker));
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (MEDIUM)): the phone shows what the app draws: its three posts from after the last visit, the caught-up marker above a post from before it, and the end of the 14 days — FeedList's own order for the same posts and the same last visit (FeedList.tsx)", () => {
    const now = Date.now();
    const lastVisit = new Date(now - 2 * DAY);

    // The app draws the marker only above a post from before the last visit.
    const withOlder = textOf(
      appFeed([...phoneFeed(now), post("ada", "Ada", "Back from the coast. The sea was cold.", new Date(now - 3 * DAY))], lastVisit),
    );
    const order = ["Wow.", PREVIEW_MARKER[0], PREVIEW_MARKER[1], "The sea was cold.", "That's everything from the last 14 days."];
    expect(order.map((s) => withOlder.indexOf(s)).every((at, i, all) => at >= 0 && (i === 0 || at > all[i - 1]!))).toBe(true);

    // The phone now carries such a post (Pavel, 3 days old). Its whole feed, word for word, is
    // what the app's FeedList draws for the same four posts, the same reply counts and the same
    // last visit — with no like count, since none of the four is the reader's own (SPEC §7).
    // Read without the icons' titles and the ⋯ menus' lists, which the app keeps in the markup
    // and a reader does not see until a tap (the re-check of M-0013 restored this whole-text
    // form, which the fix had loosened to seven snippets in order).
    const replies = [2, 4, 1, 3];
    const items = [...phoneFeed(now), post("pavel", "Pavel", "Anyone up for a slow run on Saturday? I'll bring coffee.", new Date(now - 3 * DAY))].map(
      (p, i) => ({ ...p, replyCount: replies[i]! }),
    );
    const readable = (el: El): string => {
      const parts: string[] = [];
      const walk = (n: El | string) => {
        if (typeof n === "string") return void parts.push(n);
        if (n.tag === "svg" || (n.attrs.class ?? "").split(" ").includes("menu__list")) return;
        n.children.forEach(walk);
      };
      walk(el);
      return parts.join(" ").replace(/\s+/g, " ").replace(/ ([.,:;?!])/g, "$1").trim();
    };
    const app = readable(parse(appFeed(items, lastVisit)));
    const phoneFeedEl = findAll(PHONE_SCREEN, (e) => moduleClass(e) === "phoneFeed")[0]!;
    expect(readable(phoneFeedEl)).toBe(app);
    expect(app).toContain(`${PREVIEW_MARKER[0]} ${PREVIEW_MARKER[1]}`);
    expect(app.endsWith("That's everything from the last 14 days.")).toBe(true);
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): the phone's top bar shows the our.one wordmark, as the app's /home does on a phone (SPEC §9 '<700px: a sticky top bar … (on /home: the wordmark)'; PageHeader.tsx; globals.css)", () => {
    expect(read("src/app/(app)/home/page.tsx")).toContain('<PageHeader title="Home" wordmark />');
    expect(GLOBALS).toMatch(
      /@media \(max-width: 699px\) \{\s*\.page-header__title--home \{[^}]*clip: rect\(0 0 0 0\);[^}]*\}\s*\.page-header__wordmark \{\s*display: block;/,
    );
    const header = parse(renderToStaticMarkup(createElement(PageHeader, { title: "Home", wordmark: true })));
    const onPhone = findAll(header, (e) => (e.attrs.class ?? "").includes("page-header__wordmark")).map(text);
    expect(onPhone).toEqual(["our.one"]);

    const phoneBar = PHONE_SCREEN.children.find((c): c is El => typeof c !== "string")!;
    expect(text(phoneBar), "the phone's top bar").toBe(onPhone[0]);
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): each of the phone's posts has the app's four post-row icons — audience, the ⋯ menu, reply and like (SPEC §9 Post row; PostRow.tsx)", () => {
    const now = Date.now();
    const appRow = parse(renderToStaticMarkup(createElement(PostRow, { post: phoneFeed(now)[0]! })));
    // The icons a reader sees: not those inside the ⋯ menu's list, which opens on a tap.
    const icons = (el: El) =>
      findAll(el, (e) => e.tag === "svg" && !closest(e, (x) => (x.attrs.class ?? "").split(" ").includes("menu__list"))).length;
    const appIcons = icons(appRow);
    // Audience, the ⋯ menu, reply and like.
    expect(appIcons).toBe(4);
    expect(findAll(appRow, (e) => (e.attrs["aria-label"] ?? "").startsWith("Reply")).length).toBe(1);
    expect(findAll(appRow, (e) => e.attrs["aria-label"] === "Like").length).toBe(1);

    const phoneRows = findAll(PHONE_SCREEN, (e) => e.tag === "article" && e.attrs.class === "post");
    expect(phoneRows).toHaveLength(4);
    expect(phoneRows.map(icons), "icons on each of the phone's posts").toEqual([appIcons, appIcons, appIcons, appIcons]);
    // Nothing in the picture can be clicked or focused.
    expect(findAll(PHONE_SCREEN, (e) => /^(a|button|input)$/.test(e.tag) || "tabindex" in e.attrs)).toEqual([]);
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): the phone's tab bar draws every tab in the text colour and marks the current one only by a heavier stroke, as the app does (TabBar.tsx; globals.css .tabbar__item)", () => {
    expect(read("src/components/TabBar.tsx")).toMatch(/strokeWidth=\{current \? 2\.25 : 1\.75\}/);
    const colour = (declarations: string) => /(?:^|\n)\s*color: ([^;]+);/.exec(declarations)?.[1];
    const app = colour(rule(GLOBALS, ".tabbar__item"));
    expect(app).toBe("var(--text)");
    expect(colour(rule(FRONT_CSS, ".phoneTabs")), "every tab").toBe(app);
    // No rule gives one tab another colour (the compose disc is the app's too: .tabbar__item--compose).
    expect(FRONT_CSS).not.toMatch(/\.phoneTab[^{]*:(?:first|last|nth)-child/);
    expect(rule(FRONT_CSS, ".phoneCompose")).toMatch(/background: var\(--primary-bg\);[\s\S]*color: var\(--primary-text\);/);
    const strokes = [...PHONE_HTML.matchAll(/<span class="[^"]*phoneTab[^"]*"><svg [^>]*stroke-width="([\d.]+)"/g)].map((m) => m[1]);
    expect(strokes).toEqual(["2.25", "1.75", "1.75", "1.75", "1.75"]);
  });
});

/* ================================ fixed: contrast on the card (were DEFECTS) */

describe("the signed card's small text in both themes (SPEC §9 tokens)", () => {
  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): the card's byline is in the text colour, which meets 4.5:1 on the card in both themes (it was --muted, 3.88:1 in dark)", () => {
    expect(rule(FRONT_CSS, ".pledge")).toMatch(/background: var\(--hover\);/);
    const byline = rule(FRONT_CSS, ".pledgeBy");
    expect(byline).toMatch(/color: var\(--text\);/);
    expect(byline).toMatch(/font-size: 14px;/);
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens(scheme);
      expect(contrast(t["--text"]!, t["--hover"]!), scheme).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): the card's link 'How that works' and the three links under the promise are in the text colour, underlined, which meets 4.5:1 in both themes (the card's link was 2.84:1 in light)", () => {
    const card = renderFront().match(/<figure class="[^"]*pledge[^"]*">[\s\S]*?<\/figure>/)![0];
    expect(card).toMatch(/<a href="#front-runs" class="[^"]*pledgeLink[^"]*">How that works<\/a>/);
    for (const selector of [".pledgeLink", ".more"]) {
      const declarations = rule(FRONT_CSS, selector);
      expect(declarations, selector).toMatch(/(?:^|\n)\s*color: var\(--text\);/);
      expect(declarations, selector).toMatch(/text-decoration: underline;/);
    }
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens(scheme);
      expect(contrast(t["--text"]!, t["--hover"]!), scheme).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--text"]!, t["--bg"]!), scheme).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accepted (SPEC §18.15, after the verification): the site's link blue (SPEC §9 --accent, 3.0:1 on white) still colours 'Privacy' under the form, as on every page that uses the shared .link; it is a §9 token matter, older than this build, left to a decision on the tokens", () => {
    expect(GLOBALS).toMatch(/\n\.link,\n[^{]*\{\s*color: var\(--accent\);/);
    const light = tokens("light");
    expect(contrast(light["--accent"]!, light["--bg"]!)).toBe(3);
    expect(renderFront()).toMatch(/<a class="link" href="\/privacy">Privacy<\/a>/);
  });
});

/* ================================================================= closed */

describe("every state renders (FrontPage's props, as the route passes them)", () => {
  const COMMON = [
    "h1 Just your people. Then you're done.",
    "h2 Get in",
    "h2 Where did your friends go?",
    "h2 How it works",
    "h3 Get in",
    "h3 Bring your people",
    "h3 Catch up, then close it",
    "h2 Keep your people. Change who runs it.",
    "h2 Fair questions",
  ];
  const SEAT_LINE =
    "No seats open right now. Leave your address to join the line. Seats go to whoever has waited longest.";

  it("closed: joining open and closed × the count null, 0, 1 and 1,284 × the seats null, 0 and 5 — one h1, headings in order, the Get in heading hidden only visually, the seat line only while joining with no seat open, the count only when read and only under 'Keep your people', the close only while joining, and no stray value", () => {
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

          const headings = findAll(tree, (e) => /^h[1-6]$/.test(e.tag)).map((h) => `${h.tag} ${text(h)}`);
          expect(headings, label).toEqual(joining ? [...COMMON, "h2 Bring your people."] : COMMON);
          const getIn = findAll(tree, (e) => e.attrs.id === "front-get-in")[0]!;
          expect([getIn.tag, getIn.attrs.class], label).toEqual(["h2", "visually-hidden"]);

          expect(all.includes(SEAT_LINE), label).toBe(joining && seatsOpen === 0);
          expect(all.includes(FREE_LINE), label).toBe(joining);
          expect(html.includes("<form"), label).toBe(joining);
          expect(all.includes("Joining opens soon."), label).toBe(!joining);
          expect(all.includes("Have an invite? It can't be used until joining opens."), label).toBe(!joining);
          expect(html.includes('id="front-close"'), label).toBe(joining);

          const counts = all.match(/Nobody is in yet\.|\d[\d,]* (?:person is|people are) in\./g) ?? [];
          if (count === null) {
            expect(counts, label).toEqual([]);
            expect(all, label).not.toMatch(/You'd be #/);
          } else {
            expect(counts, label).toHaveLength(1);
            expect(textOf(section(html, "front-runs")), label).toContain(countLine(count));
          }

          expect(all, label).not.toMatch(/\bundefined\b|\bNaN\b|\bnull\b|\[object /);
          expect(html, label).not.toMatch(/<p[^>]*><\/p>|class=""|class="undefined"/);
          for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
            expect(html, `${label}: #${target}`).toContain(`id="${target}"`);
          }
        }
      }
    }
  });
});

describe("what a screen reader and a keyboard get", () => {
  it("closed: what is hidden from screen readers is exactly the decoration — the initial R, the phone, the 7%, the two small phones and the three step numbers — and none of it is a link, a control, a heading or a caption", () => {
    for (const joining of [true, false]) {
      const tree = parse(renderFront({ joining }));
      const roots = findAll(tree, (e) => hidden(e) && !closest(e.parent!, hidden) && e.tag !== "svg");
      expect(
        roots.map((e) => `${e.tag}.${moduleClass(e).split(" ")[0]} ${text(e).slice(0, 24)}`),
        `joining: ${joining}`,
      ).toEqual([
        "span.pledgeFace R",
        "div.phone our.one M Mara @mara · 2",
        "p.stat 7%",
        "div.mini Home Sponsored Suggested",
        "div.mini Home M Mara Made it to t",
        "span.stepNumber 1",
        "span.stepNumber 2",
        "span.stepNumber 3",
      ]);
      for (const root of roots) {
        expect(findAll(root, (e) => /^(a|button|input|select|textarea|form|h[1-6]|figcaption)$/.test(e.tag))).toEqual([]);
      }
      // The numbers are still read: the steps are an ordered list. The 7% is in the sentence.
      expect(findAll(tree, (e) => e.tag === "ol" && moduleClass(e).includes("steps"))).toHaveLength(1);
      expect(text(tree)).toContain("content from friends got 7% of the time");
      // Every icon outside those is decorative too, and no other icon exists.
      expect(findAll(tree, (e) => e.tag === "svg" && !closest(e, (x) => hidden(x) && x.tag !== "svg"))).toEqual([]);
    }
  });

  it("closed: every link has a name; the in-page links land on the headings they name (#front-get-in, #front-runs); every external link opens in a new tab with rel=\"noopener noreferrer\", and no internal one does", () => {
    const html = renderFront();
    const tree = parse(html);
    const anchors = findAll(tree, (e) => e.tag === "a");
    expect(anchors.length).toBeGreaterThanOrEqual(10);
    for (const a of anchors) {
      const name = a.attrs["aria-label"] ?? text(a);
      const href = a.attrs.href ?? "";
      expect(name.length, href).toBeGreaterThan(1);
      if (/^https?:/.test(href)) {
        expect([href, a.attrs.target, a.attrs.rel]).toEqual([href, "_blank", "noopener noreferrer"]);
      } else {
        expect(a.attrs.target, href).toBeUndefined();
      }
      if (href.startsWith("#")) {
        const target = findAll(tree, (e) => e.attrs.id === href.slice(1))[0];
        expect(target?.tag, href).toBe("h2");
      }
    }
    const inPage = anchors.filter((a) => a.attrs.href?.startsWith("#")).map((a) => `${text(a)} → ${a.attrs.href}`);
    expect(inPage).toEqual(["How that works → #front-runs", "Get in → #front-get-in"]);
  });

  it("closed: the focus ring is the global 2px --accent outline, nothing on the front page removes it, and it meets 3:1 against the page in both themes", () => {
    expect(GLOBALS).toMatch(/\n:focus-visible \{\s*outline: 2px solid var\(--accent\);\s*outline-offset: 2px;\s*\}/);
    expect(FRONT_CSS).not.toMatch(/\n\s*outline(?:-[\w]+)?\s*:/);
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens(scheme);
      expect(contrast(t["--accent"]!, t["--bg"]!), scheme).toBeGreaterThanOrEqual(3);
    }
  });

  it("closed: the illustration says it is one, in its caption and its accessible name; the phone's caption says it is an example with fictional people; neither caption is hidden", () => {
    const contrastFigure = parse(renderToStaticMarkup(createElement(FeedContrast)));
    const figure = findAll(contrastFigure, (e) => e.tag === "figure")[0]!;
    expect(figure.attrs["aria-label"]).toMatch(/^Illustration: /);
    expect(findAll(figure, (e) => e.tag === "figcaption").map(text)).toEqual([CONTRAST_CAPTION]);
    expect(CONTRAST_CAPTION).toBe("Illustration.");
    const caption = findAll(PHONE, (e) => e.tag === "figcaption")[0]!;
    expect(text(caption)).toBe(PREVIEW_CAPTION);
    expect(PREVIEW_CAPTION).toBe("An example feed. Fictional people.");
    for (const c of [caption, ...findAll(figure, (e) => e.tag === "figcaption")]) {
      expect(closest(c, hidden)).toBeNull();
    }
  });
});

describe("both themes (SPEC §9 tokens; SPEC §18.15 'the only colours are §9's tokens, plus the caught-up green')", () => {
  it("closed: every colour on the front page is a token with a dark value, or one of the constants kept the same in both themes on purpose: the white avatar initials and the caught-up green", () => {
    const light = tokens("light");
    const dark = tokens("dark");
    const used = [...new Set([...FRONT_CSS.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!))];
    const inlineStyles = ["FeedPreview.tsx", "FeedContrast.tsx", "FrontPage.tsx"].flatMap((f) =>
      [...read(`src/components/public/${f}`).matchAll(/style=\{\{(.*?)\}\}/g)].map((m) => m[1]!),
    );
    // The phone's avatars are the app's Avatar component now; only the illustration draws its own.
    expect(inlineStyles).toEqual([" background: `hsl(${hue} var(--avatar-sat) var(--avatar-light))` "]);
    for (const token of [...used, "--avatar-sat", "--avatar-light"]) {
      expect([token, token in light, token in dark]).toEqual([token, true, true]);
    }

    // Literal colours, each with the rule it sits in (comments are not colours).
    const code = FRONT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const literals = [
      ...code.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![\w-])(?:white|black|gr[ae]y|red|green|blue)(?![\w-])/g),
    ].map((m) => {
      const open = code.lastIndexOf("{", m.index);
      const selector = code.slice(code.lastIndexOf("}", open) + 1, open).trim();
      return `${selector} ${m[0]}`;
    });
    expect(literals.sort()).toEqual(
      [".miniAvatar #ffffff", ".count::before #00ba7c", ".count::before rgba(0, 186, 124, 0.16)"].sort(),
    );
    // The initials are the app's own: .avatar is white on its hue in both themes.
    expect(rule(GLOBALS, ".avatar")).toMatch(/color: #ffffff;/);
  });

  it("closed: body and muted text meet 4.5:1 on the page in both themes, and muted text meets it on the light card", () => {
    const light = tokens("light");
    const dark = tokens("dark");
    const pairs = {
      "light text on bg": contrast(light["--text"]!, light["--bg"]!),
      "light muted on bg": contrast(light["--muted"]!, light["--bg"]!),
      "light muted on the card": contrast(light["--muted"]!, light["--hover"]!),
      "dark text on bg": contrast(dark["--text"]!, dark["--bg"]!),
      "dark muted on bg": contrast(dark["--muted"]!, dark["--bg"]!),
      "light button": contrast(light["--primary-text"]!, light["--primary-bg"]!),
      "dark button": contrast(dark["--primary-text"]!, dark["--primary-bg"]!),
    };
    for (const [pair, ratio] of Object.entries(pairs)) expect([pair, ratio >= 4.5]).toEqual([pair, true]);
    // Dark muted text on black clears the bar by little: 4.58.
    expect(pairs["dark muted on bg"]).toBe(4.58);
  });
});

describe("the headline and the fold (the widths themselves are measured in the browser: see the report)", () => {
  it("closed: the headline is one h1 whose two sentences are block lines, from 36px on a phone to 60px, so it sets on two lines wherever each sentence fits its column (measured: every width from 316 to 1480px, 4px to spare at 320px)", () => {
    const h1 = findAll(parse(renderFront()), (e) => e.tag === "h1");
    expect(h1).toHaveLength(1);
    expect(findAll(h1[0]!, (e) => e.tag === "span").map(text)).toEqual(["Just your people.", "Then you're done."]);
    expect(rule(FRONT_CSS, ".frontHeadline span")).toMatch(/display: block;/);
    expect(rule(FRONT_CSS, ".frontHeadline")).toMatch(/font-size: clamp\(36px, 9vw, 60px\);/);
    expect(FRONT_CSS).toMatch(/@media \(min-width: 900px\) \{[^@]*\.frontHeadline \{\s*font-size: clamp\(44px, 5vw, 60px\);/);
  });
});
