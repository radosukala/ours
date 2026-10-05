/**
 * The first screen and the link card (D-0024 §A, §C, §D and §E; SPEC §18.23;
 * M-0021):
 *
 * - the first screen's order for a visitor: the headline, the line, the
 *   count against 100,000, the pledge, the status line, one form;
 * - one email field on the page, the need beside it only for a visitor with
 *   joining open, and no entrance buttons;
 * - the count of named apps: a number, never the words, left out when it
 *   can't be read, and the page still renders;
 * - a member sees "You're in." in the form's place, and the panel says how
 *   many of 100,000 are in;
 * - the pledge is a listed sentence in the front door's file, and in no other
 *   file but the one it comes from;
 * - the link card: its metadata, its image, the script that makes it, and the
 *   root layout's rule of importing nothing from the core.
 *
 * Denial paths first. The presentational FrontDoor is rendered with each
 * state as props; the route and the app layout with the real database and
 * the viewer replaced by a FICTIONAL person. Every address is FICTIONAL.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  member: false,
  countFails: false,
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
}));
vi.mock("@/web/viewer", () => ({
  isMemberHere: async () => state.member,
  requireViewer: async () => ({
    id: "01FICTIONAL",
    handle: "mara_f",
    displayName: "Mara FICTIONAL",
    isAdmin: false,
    acceptsFollowers: false,
    invitesRemaining: 8,
  }),
  getViewer: async () => null,
}));
vi.mock("@/core/seats", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/core/seats")>();
  return {
    ...real,
    memberCount: async (db: Parameters<typeof real.memberCount>[0]) => {
      if (state.countFails) throw new Error("the database is down FICTIONAL");
      return real.memberCount(db);
    },
  };
});

import AppLayout from "@/app/(app)/layout";
import PublicLayout, { generateMetadata } from "@/app/(public)/layout";
import FrontDoorRoute from "@/app/(public)/page";
import { ALLOWLIST, scanText } from "@/core/claims";
import { NEED_HAS_ADDRESS } from "@/core/validate";
import {
  CARD,
  DOOR_HEADLINE,
  DOOR_LEDE,
  DOOR_START,
  DOOR_STATUS,
  DOOR_TITLE,
  MEMBER_JOIN,
  NEED_HINT,
  NEED_LABEL,
} from "@/components/public/door";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { GetInFormView } from "@/components/public/GetInForm";
import { formatCount, THRESHOLD } from "@/components/public/handover";
import { JOIN_LABEL, needsLine, progressLine, WAITING_LIST_LABEL } from "@/components/public/join";
import { OursCard, RightColumn } from "@/components/RightColumn";
import { recordNeed } from "@/core/needs";
import { memberCount } from "@/core/seats";
import { CARD_COLOURS, CARD_MAX_BYTES, cardHtml, findBrowser, makeCard, pngSize, removeFolder, runBrowser } from "../scripts/card";
import { db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

beforeEach(async () => {
  await reset();
  state.member = false;
  state.countFails = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

function render(props: Partial<FrontDoorProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FrontDoor, { joining: true, email: null, count: 12, needs: 3, seatsOpen: 3, seatsWaiting: 0, ...props }),
  );
}

/** Everything before the second section: the first screen. */
function firstScreen(html: string): string {
  return html.slice(0, html.indexOf('id="idea"'));
}

const PLEDGE_SENTENCE = `When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`;

/** Every element in a React tree. */
function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!isValidElement(node)) return;
  visit(node);
  walk((node.props as { children?: ReactNode }).children, visit);
}

/* ================================================================ the order */

describe("the first screen, for a visitor (D-0024 §A)", () => {
  it("is, in order: the headline, the line, the count, the pledge, the status line, the form (the address, the question, the button)", () => {
    const text = textOf(firstScreen(render({ count: 12 })));
    const parts = [
      DOOR_HEADLINE[0],
      DOOR_START,
      progressLine(12),
      PLEDGE_SENTENCE,
      DOOR_STATUS,
      "Your email",
      NEED_LABEL,
      JOIN_LABEL,
    ];
    const at = parts.map((part) => text.indexOf(part));
    expect(at.every((i) => i >= 0), JSON.stringify(parts.map((p, i) => [p, at[i]]))).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(progressLine(12)).toBe("12 of 100,000 people are in.");
  });

  it("has no entrance buttons and no paragraph above them: the lede is gone from the first screen, and the buttons' words with it", () => {
    const text = textOf(firstScreen(render()));
    expect(text).not.toContain("I want this to exist");
    expect(text).not.toContain("I want to build");
    expect(text).not.toContain("We're bringing people and builders together");
    expect(firstScreen(render())).not.toMatch(/href="#part"|href="#build"/);
    // DOOR_LEDE is unchanged, and is still every undescribed page's description.
    expect(DOOR_LEDE).toContain("Starting with a friends feed. Building toward much more.");
    expect(DOOR_START).toBe("It starts with a friends feed. Building toward much more.");
  });

  it("has one email field on the whole page, with the question beside it, in every state that shows a form", () => {
    for (const count of [null, 0, 1, 1284]) {
      for (const [seatsOpen, seatsWaiting] of [[null, null], [0, 0], [3, 0], [1, 2]] as const) {
        const html = render({ count, seatsOpen, seatsWaiting });
        expect((html.match(/name="email"/g) ?? []).length, `${count} ${seatsOpen}`).toBe(1);
        expect((html.match(/name="need"/g) ?? []).length).toBe(1);
        expect((html.match(/<form/g) ?? []).length).toBe(1);
        expect(html.indexOf('name="email"')).toBeLessThan(html.indexOf('name="need"'));
        expect(firstScreen(html)).toContain('name="need"');
      }
    }
  });

  it("labels the question and hints that it is optional and kept apart, and the answer's field takes at most 140 characters", () => {
    const html = render();
    expect(textOf(html)).toContain(NEED_LABEL);
    expect(NEED_LABEL).toBe("Which app would you take back?");
    expect(textOf(html)).toContain(NEED_HINT);
    expect(NEED_HINT).toMatch(/^Optional\./);
    expect(html).toMatch(/<input[^>]*id="field-need"[^>]*maxLength="140"|<input[^>]*maxLength="140"[^>]*id="field-need"/i);
    expect(html).not.toMatch(/<input[^>]*name="need"[^>]*required/);
  });

  it("says the button's words for the seats open, as before (D-0016 §B)", () => {
    expect(textOf(render({ seatsOpen: 3, seatsWaiting: 0 }))).toContain(JOIN_LABEL);
    expect(textOf(render({ seatsOpen: 0, seatsWaiting: 0 }))).toContain(WAITING_LIST_LABEL);
  });

  it("puts no form on the page, and no field, while joining is closed, and says so", () => {
    const html = render({ joining: false });
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="need"');
    expect(textOf(html)).toContain("Joining opens soon.");
    expect(textOf(firstScreen(html))).toContain(progressLine(12));
    expect(textOf(firstScreen(html))).toContain(PLEDGE_SENTENCE);
  });

  it("puts back what was typed after a refusal, in both fields, so a visitor fixes one field and retypes nothing; after the one answer the form is empty (React empties a form's fields after every submit)", () => {
    const view = (props: Partial<Parameters<typeof GetInFormView>[0]>) =>
      renderToStaticMarkup(createElement(GetInFormView, { state: null, action: () => {}, pending: false, need: true, ...props }));
    const refused = view({
      state: { error: NEED_HAS_ADDRESS, field: "need" },
      values: { email: "mara_f@example.test", need: 'call me, "Mara" <3' },
    });
    expect(refused).toContain('value="mara_f@example.test"');
    expect(refused).toContain("value=\"call me, &quot;Mara&quot; &lt;3\"");
    // The refusal is at the need's own field, and the address's has none.
    expect(refused.match(/class="field field--error"/g)).toHaveLength(1);
    expect(refused.slice(refused.indexOf("field--error"))).toContain('name="need"');
    for (const state of [null, { ok: true } as const]) {
      expect(view({ state }), JSON.stringify(state)).not.toMatch(/\svalue="/);
    }
    // A refusal at the address puts both back too.
    const badAddress = view({ state: { error: "That doesn't look like an email address." }, values: { email: "nope", need: "Messenger" } });
    expect(badAddress).toContain('value="nope"');
    expect(badAddress).toContain('value="Messenger"');
    // The form hands the fields back only after a refusal, never after the one answer.
    const source = read("src/components/public/GetInForm.tsx");
    expect(source).toContain('const values = shown !== null && "error" in shown.result ? shown.sent : undefined;');
  });

  it("stacks the address, the question and the button, each on its own line, when the form has the question: the one-line layout is for one field and a button (found in a browser: three children in two columns crushed the address and the button)", () => {
    const withQuestion = render();
    expect(withQuestion).toMatch(/<form[^>]*class="form get-in-form get-in-form--need"/);
    // /feed's form, with no question, keeps its one-line layout.
    const plain = renderToStaticMarkup(createElement(GetInFormView, { state: null, action: () => {}, pending: false }));
    expect(plain).toMatch(/<form[^>]*class="form get-in-form"/);
    expect(plain).not.toContain("get-in-form--need");
    const css = read("src/app/globals.css");
    const rule = /\.get-in-form\.get-in-form--need \{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    // It follows the one-line rule it overrides, in the same media query, so it wins.
    expect(css.indexOf(".get-in-form.get-in-form--need")).toBeGreaterThan(css.indexOf(".get-in-form > .btn"));
  });

  it("points the feed's panel to the one form instead of carrying a second, and a member's to their feed", () => {
    const panel = (html: string) => html.slice(html.indexOf('id="projects"'), html.indexOf('id="ours"'));
    expect(textOf(panel(render()))).toContain("Join at the top of this page");
    expect(panel(render())).toContain('href="#join"');
    expect(render()).toContain('id="join"');
    expect(panel(render())).not.toContain('name="email"');
    expect(textOf(panel(render({ member: true })))).toContain(MEMBER_JOIN.link);
    expect(panel(render({ joining: false }))).not.toContain('href="#join"');
  });
});

/* ===================================================== the count, the pledge */

describe("the count against the threshold, and the pledge (D-0024 §A)", () => {
  it("shows the count as 'N of 100,000 people are in.' with the number formatted, and leaves it out, and only it, when it can't be read", () => {
    for (const n of [0, 1, 12, 1284, 99999]) {
      expect(textOf(firstScreen(render({ count: n })))).toContain(`${formatCount(n)} of 100,000 people are in.`);
    }
    const none = textOf(firstScreen(render({ count: null })));
    expect(none).not.toMatch(/of 100,000 people are in/);
    expect(none).toContain(PLEDGE_SENTENCE);
    expect(none).toContain("Your email");
    // No rank any more on this screen: "You'd be #" is /feed's.
    expect(textOf(render({ count: 12 }))).not.toContain("You'd be #");
  });

  it("carries the pledge word for word, with the maintainer's name, and the sentence that follows it", () => {
    const text = textOf(firstScreen(render()));
    expect(text).toContain(`${PLEDGE_SENTENCE} Until then, I hold all three.`);
    expect(text).toContain("Rado, maintainer");
    expect(PLEDGE_SENTENCE).toBe("When 100,000 people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.");
  });

  it("lists the pledge's sentence for the front door's file, in both forms, as /feed's, and the front door and /feed alone carry it", () => {
    const listed = (file: string) => ALLOWLIST.filter((e) => e.file === file).map((e) => e.sentence);
    const door = listed("src/components/public/FrontDoor.tsx");
    expect(door).toEqual([
      "When {THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.",
      PLEDGE_SENTENCE,
    ]);
    for (const sentence of door) expect(listed("src/components/public/FrontPage.tsx")).toContain(sentence);
    // Only those two page files, and the allowlist's own text, hold the sentence.
    const holding: string[] = [];
    const walkDir = (dir: string) => {
      for (const name of readdirSync(join(WEB_ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(WEB_ROOT, rel)).isDirectory()) walkDir(rel);
        else if (/\.(ts|tsx)$/.test(name) && /I hand over its domain, its data and the right to replace me/.test(read(rel))) holding.push(rel);
      }
    };
    walkDir("src");
    expect(holding.sort()).toEqual(["src/core/claims.ts", "src/components/public/FrontDoor.tsx", "src/components/public/FrontPage.tsx"].sort());
  });

  it("is let through by that listing and by nothing else: the rendered front door is clean under its own file, and flagged under none", () => {
    for (const member of [false, true]) {
      const html = render({ member });
      const rendered = [html, textOf(html)];
      for (const text of rendered) expect(scanText(text, "src/components/public/FrontDoor.tsx")).toEqual([]);
      expect(rendered.flatMap((text) => scanText(text, null)).length, `member ${member}`).toBeGreaterThan(0);
      // A file with no such listing lets nothing through either.
      expect(rendered.flatMap((text) => scanText(text, "src/components/public/join.ts")).length).toBeGreaterThan(0);
    }
  });
});

/* ====================================================== the count of named apps */

describe("the count of named apps (D-0024 §C)", () => {
  it("is a line under the form once at least one is named, singular for one, and never for none or an unread count", () => {
    expect(needsLine(0)).toBeNull();
    expect(needsLine(-1)).toBeNull();
    expect(needsLine(1)).toBe("1 app named so far.");
    expect(needsLine(2)).toBe("2 apps named so far.");
    expect(needsLine(1284)).toBe("1,284 apps named so far.");
    expect(textOf(render({ needs: 1 }))).toContain("1 app named so far.");
    expect(textOf(render({ needs: 12 }))).toContain("12 apps named so far.");
    for (const needs of [0, null]) expect(textOf(render({ needs })), String(needs)).not.toMatch(/apps? named so far/);
  });

  it("is not shown to a member or while joining is closed, whatever the number", () => {
    expect(textOf(render({ needs: 12, member: true }))).not.toMatch(/apps? named so far/);
    expect(textOf(render({ needs: 12, joining: false }))).not.toMatch(/apps? named so far/);
  });

  it("is read by the route as a number: one named, and the page says '1 app named so far.' and shows none of the words", async () => {
    await makeAccount({ isAdmin: true, handle: "rado_fict" });
    await recordNeed(db(), "Zorbulon photo app FICTIONAL", new Date("2026-10-05T10:00:00Z"));
    const html = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    expect(textOf(html)).toContain("1 app named so far.");
    expect(html).not.toContain("Zorbulon");
    expect(textOf(html)).toContain(progressLine(1));
  });

  it("leaves the line out and still renders when the table of named apps isn't there, with no error on the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db().execute(sql`drop table needs`);
    try {
      const html = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
      expect(textOf(html)).not.toMatch(/apps? named so far/);
      expect(textOf(firstScreen(html))).toContain(DOOR_STATUS);
      expect(html).toContain('name="email"');
    } finally {
      await db().execute(sql.raw(readFileSync(join(WEB_ROOT, "drizzle/0003_needs.sql"), "utf8")));
    }
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("the number of named apps could not be read");
  });

  it("leaves the count out and still renders when the count can't be read, and logs the error's name, not its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.countFails = true;
    const html = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    expect(textOf(firstScreen(html))).not.toMatch(/of 100,000 people are in/);
    expect(textOf(firstScreen(html))).toContain(PLEDGE_SENTENCE);
    expect(html).toContain('name="email"');
    const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("the count could not be read");
    expect(logged).not.toContain("the database is down FICTIONAL");
  });
});

/* ======================================================================= members */

describe("members (D-0024 §A, §D)", () => {
  it("see 'You're in.' in the form's place, once, with a way to their feed, and no form, field or count of named apps", () => {
    const html = render({ member: true, count: 10, needs: 5 });
    const first = firstScreen(html);
    expect(textOf(first)).toContain(MEMBER_JOIN.line);
    expect(textOf(html).split(MEMBER_JOIN.line).length - 1).toBe(1);
    expect(first).toContain('href="/home"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="need"');
    expect(textOf(first)).toContain("10 of 100,000 people are in.");
    expect(textOf(first)).toContain(PLEDGE_SENTENCE);
  });

  it("are shown the same first screen by the route, with the count, and no form", async () => {
    state.member = true;
    await makeAccount({ isAdmin: true, handle: "rado_fict" });
    const html = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    expect(textOf(firstScreen(html))).toContain(`${MEMBER_JOIN.line} ${MEMBER_JOIN.link}`);
    expect(textOf(firstScreen(html))).toContain(progressLine(1));
    expect(html).not.toContain('name="email"');
  });

  it("have a panel that says 'N of 100,000 people are in.' under its text, and says nothing of it when the count is unknown", () => {
    const card = (count: number | null) => textOf(renderToStaticMarkup(createElement(OursCard, { email: null, count })));
    expect(card(10)).toContain("10 of 100,000 people are in.");
    expect(card(1)).toContain("1 of 100,000 people are in.");
    expect(card(null)).not.toMatch(/of 100,000/);
    expect(card(10).indexOf("What should we make ours?")).toBeLessThan(card(10).indexOf("10 of 100,000"));
    const column = textOf(renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 8, count: 10 })));
    expect(column).toContain("10 of 100,000 people are in.");
    expect(textOf(renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 8 })))).not.toMatch(/of 100,000 people are in/);
  });

  it("have the app layout read the public count for the panel, and leave the line out, with the feed unharmed, when it can't", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await makeAccount({ isAdmin: true, handle: "rado_fict" });
    await makeAccount();
    const find = (tree: ReactNode) => {
      let found: ReactElement | null = null;
      walk(tree, (el) => {
        if (el.type === RightColumn) found = el;
      });
      return found as ReactElement<{ count: number | null; invitesRemaining: number }> | null;
    };
    const ok = find(await AppLayout({ children: null }));
    expect(ok?.props.count).toBe(await memberCount(db()));
    expect(ok?.props.count).toBe(2);
    state.countFails = true;
    const down = find(await AppLayout({ children: null }));
    expect(down?.props.count).toBeNull();
    expect(down?.props.invitesRemaining).toBe(8);
    const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("the panel's count could not be read");
    expect(logged).not.toContain("the database is down FICTIONAL");
  });
});

/* ================================================================= the link card */

describe("the link card (D-0024 §E)", () => {
  it("is on every public page: Open Graph and Twitter, with the title, the description and the image, on the site's own base", () => {
    vi.stubEnv("APP_URL", "https://our.example.test/");
    const meta = generateMetadata() as Record<string, unknown> & {
      metadataBase?: URL;
      openGraph: { type: string; siteName: string; title: string; description: string; images: { url: string; width: number; height: number; alt: string }[] };
      twitter: { card: string; title: string; description: string; images: { url: string; alt: string }[] };
    };
    expect(meta.metadataBase?.href).toBe("https://our.example.test/");
    expect(meta.openGraph).toEqual({
      type: "website",
      siteName: "our.one",
      title: DOOR_TITLE,
      description: DOOR_LEDE,
      images: [{ url: "/card.png", width: 1200, height: 630, alt: CARD.alt }],
    });
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      title: DOOR_TITLE,
      description: DOOR_LEDE,
      images: [{ url: "/card.png", alt: CARD.alt }],
    });
    // The image resolves against the base, to the site's own address and nowhere else.
    expect(new URL(meta.openGraph.images[0]!.url, meta.metadataBase).href).toBe("https://our.example.test/card.png");
    expect(CARD.alt).toBe("our.one: The software we live in should be ours.");
    // No page-level `url`: a page's card names the page that was shared.
    expect("url" in meta.openGraph).toBe(false);
  });

  it("costs the card, never a page, when APP_URL is missing or isn't an address: no base, a line in the log, no throw", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    for (const value of ["", "nowhere FICTIONAL"]) {
      vi.stubEnv("APP_URL", value);
      const meta = generateMetadata();
      expect(meta.metadataBase, JSON.stringify(value)).toBeUndefined();
      expect(meta.openGraph?.images).toBeDefined();
    }
    expect(log.mock.calls.length).toBe(2);
    expect(String(log.mock.calls[0]![0])).toContain("the link card has no base address");
    // The bad value itself is never logged.
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).not.toContain("nowhere FICTIONAL");
    // The layout itself still renders.
    expect(() => renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"))).not.toThrow();
  });

  it("keeps the root layout free of the core, and the public layout reads no database", () => {
    expect(read("src/app/layout.tsx")).not.toMatch(/@\/core\/|from "pg"|drizzle|getDb|\.\.\/core\//);
    const publicLayout = read("src/app/(public)/layout.tsx");
    expect(publicLayout).toContain('export const dynamic = "force-dynamic";');
    expect(publicLayout).not.toMatch(/getDb|drizzle|from "pg"/);
    expect(publicLayout.match(/@\/core\/[a-z-]+/g)).toEqual(["@/core/config"]);
  });

  it("has an image that is a PNG of 1200 × 630, light enough for every service that reads it, in the place the metadata names", () => {
    const file = join(WEB_ROOT, "public", CARD.path.slice(1));
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 });
    expect({ width: CARD.width, height: CARD.height }).toEqual({ width: 1200, height: 630 });
    expect(bytes.length).toBeGreaterThan(5_000);
    expect(bytes.length).toBeLessThanOrEqual(CARD_MAX_BYTES);
    expect(CARD_MAX_BYTES).toBeLessThan(1_000_000);
  });

  it("is made from the front door's own words and tokens: the headline, the line, and the paper, ink, sub and rust of globals.css", () => {
    const html = cardHtml();
    for (const word of DOOR_HEADLINE) expect(html).toContain(word);
    expect(html).toContain("It starts with a friends feed.");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\/|@import|@font-face|url\(/);
    const css = read("src/app/globals.css");
    for (const [token, value] of Object.entries(CARD_COLOURS)) {
      expect(css, token).toMatch(new RegExp(`--${token}:\\s*${value}`, "i"));
      expect(html, token).toContain(value);
    }
  });

  it("reads PNG headers: refuses a file that isn't a PNG, and one too short to hold a header", () => {
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(pngSize(new Uint8Array(40))).toBeNull();
    expect(pngSize(readFileSync(join(WEB_ROOT, "public/card.png")))).not.toBeNull();
  });

  it("finds a headless browser only where it is told or where Playwright keeps one, and says so when it finds none", async () => {
    expect(findBrowser({ CARD_BROWSER: "/nonexistent/browser" })).toBeNull();
    const empty = mkdtempSync(join(tmpdir(), "our-one-test-"));
    try {
      expect(findBrowser({ PLAYWRIGHT_BROWSERS_PATH: empty })).toBeNull();
      mkdirSync(join(empty, "chromium_headless_shell-1", "chrome-linux"), { recursive: true });
      writeFileSync(join(empty, "chromium_headless_shell-1", "chrome-linux", "headless_shell"), "");
      expect(findBrowser({ PLAYWRIGHT_BROWSERS_PATH: empty })).toBe(join(empty, "chromium_headless_shell-1", "chrome-linux", "headless_shell"));
      await expect(makeCard({ CARD_BROWSER: "/nonexistent/browser" }, join(empty, "card.png"))).rejects.toThrow(/No headless browser found/);
      expect(existsSync(join(empty, "card.png"))).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("waits for the browser to close before it cleans up, and kills one that never does (M-0021's first build raced its cleanup against the browser's exit)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "our-one-test-"));
    try {
      // A "browser" that writes its last file well after it starts, then exits.
      const late = join(dir, "profile.lock");
      const script = `setTimeout(() => { require("fs").writeFileSync(${JSON.stringify(late)}, "x"); process.exit(3); }, 400)`;
      const run = await runBrowser(process.execPath, ["-e", script]);
      expect(run.code).toBe(3);
      expect(existsSync(late)).toBe(true);
      await removeFolder(dir);
      expect(existsSync(dir)).toBe(false);
      // One that never exits is killed, not waited for.
      const hung = await runBrowser(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], 300);
      expect(hung.code).toBeNull();
      // Removing what is already gone is not an error.
      await expect(removeFolder(dir)).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves nothing of the script's folder behind after a run that failed at the browser", async () => {
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith("our-one-card-")).length;
    await expect(makeCard({ CARD_BROWSER: process.execPath }, join(tmpdir(), "our-one-card-test.png"))).rejects.toThrow();
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith("our-one-card-")).length).toBe(before);
    expect(existsSync(join(tmpdir(), "our-one-card-test.png"))).toBe(false);
  });
});
