/**
 * The first screen, for people who come from a post (D-0024; M-0021; SPEC
 * §18.23):
 *
 * - in order: the headline, what it is, the count against its threshold
 *   with the pledge's sentence, the status, one form; the builders'
 *   entrance as a text link; nothing else on it;
 * - the count is a number, never a bar, from `memberCount`; the sentence
 *   stands alone when it can't be read; the waiting list changes nothing;
 * - the form: the address, an optional need of at most 140 characters,
 *   D-0016 §B's button; a member is shown their feed; closed joining its
 *   notice;
 * - a need rides on the seat request's gates and limits, is kept without
 *   the address, is never rendered, and is counted from the first;
 * - the privacy notice's row, the migration and its down file;
 * - the link card on every page.
 *
 * Denial paths first. The presentational FrontDoor is rendered with each
 * state as props; the action is called with next/headers replaced by an
 * in-memory header map and Next's `after` by a queue this file runs by
 * hand. Every address and name is FICTIONAL.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  later: [] as Array<() => unknown>,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      web.later.push(task);
    },
  };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

import { metadata as rootMetadata } from "@/app/layout";
import PrivacyPage from "@/app/(public)/privacy/page";
import { takeSeat } from "@/app/(public)/seat-actions";
import { OursCard } from "@/components/RightColumn";
import { DOOR_EYEBROW, DOOR_STATUS, DOOR_WHAT, ENTRANCES, TAGLINE } from "@/components/public/door";
import { FirstScreenFormView, NEED_HINT } from "@/components/public/FirstScreenForm";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import { FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, ofThreshold, WAITING_LIST_LABEL } from "@/components/public/join";
import { MEMBER_JOIN } from "@/components/public/door";
import { scanText } from "@/core/claims";
import { isCoreError } from "@/core/errors";
import { RATE_LIMITED_MESSAGE } from "@/core/limits";
import { nameNeed, NEED_KEPT_MONTHS, NEED_LABEL, NEED_MAX, NEED_TOO_LONG, needsCount, needsLine, normalizeNeed } from "@/core/needs";
import { needs, rateEvents, seatState as seatRow, waitlist } from "@/core/schema";
import { SEATS_CLOSED } from "@/core/seats";
import { at, db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");
const DOOR_FILE = "src/components/public/FrontDoor.tsx";

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

function render(props: Partial<FrontDoorProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FrontDoor, { joining: true, email: null, count: 1, seatsOpen: 0, seatsWaiting: 0, needs: 0, ...props }),
  );
}

/** The first screen's markup: the hero section. */
function hero(html: string): string {
  const start = html.indexOf('aria-labelledby="door-title"');
  const from = html.lastIndexOf("<section", start);
  return html.slice(from, html.indexOf("</section>", from) + "</section>".length);
}

/** The one <input> named so, as rendered. */
function inputTag(html: string, name: string): string {
  const tags = [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(`name="${name}"`));
  expect(tags, name).toHaveLength(1);
  return tags[0]!;
}

/** [text, href] of every link in the markup. */
function links(html: string): [string, string][] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [textOf(m[2]!), m[1]!]);
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runLater(): Promise<void> {
  while (web.later.length > 0) await web.later.shift()!();
}

async function maintainer() {
  return makeAccount({ handle: "rado_fict", isAdmin: true, createdAt: at("2026-01-01T00:00:00Z") });
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function storedNeeds(): Promise<string[]> {
  return (await db().select({ text: needs.text }).from(needs)).map((r) => r.text);
}

/* ======================================================= the first screen */

describe("the first screen, in order (D-0024 §A)", () => {
  it("says the headline, what it is, the count with the pledge's sentence, the status and the form, in that order, and nothing before the form but those", () => {
    const html = hero(render({ count: 1 }));
    const text = textOf(html);
    const order = [
      DOOR_EYEBROW,
      TAGLINE,
      DOOR_WHAT,
      ofThreshold(1),
      `When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`,
      `${MAINTAINER}, maintainer · How that works`,
      DOOR_STATUS,
      "Your email",
      NEED_LABEL,
      WAITING_LIST_LABEL,
      ENTRANCES.builders,
    ];
    let last = -1;
    for (const part of order) {
      const next = text.indexOf(part, last + 1);
      expect(next, part).toBeGreaterThan(last);
      last = next;
    }
    // The old lede and the old entrance are gone from the first screen.
    expect(text).not.toContain("We're bringing people and builders together");
    expect(text).not.toContain("I want this to exist");
    // One h1, the headline.
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it("the builders' entrance is a text link to /build; 'How that works' goes to /contract; where it stands to #open", () => {
    const all = links(hero(render()));
    expect(all).toEqual(
      expect.arrayContaining([
        [`${ENTRANCES.builders} ↗`, "/build"],
        ["How that works", "/contract"],
        ["See where it stands.", "#open"],
      ]),
    );
    expect(all.map(([, href]) => href)).not.toContain("#part");
  });

  it("claims nothing on the first screen that D-0020 §F forbids: the claims scan, with the pledge's sentence listed for this file, finds nothing", () => {
    const text = textOf(hero(render({ count: 12, needs: 3 })));
    expect(scanText(text, DOOR_FILE)).toEqual([]);
    // The pledge's sentence is listed for the front door by exact text, and nowhere else lets it through.
    expect(scanText(`When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`, null)).not.toEqual([]);
    expect(read("src/core/claims.ts")).toContain('const DOOR_FILE = "src/components/public/FrontDoor.tsx";');
  });

  it("the rest of the page stays: the six sections, in their order", () => {
    const html = render();
    expect([...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual(["idea", "projects", "ours", "build", "open", "part"]);
  });
});

describe("the count against its threshold (D-0024 §B)", () => {
  it("is a number, 'N of 100,000', from the public count; the waiting list changes nothing; never a bar", () => {
    expect(ofThreshold(0)).toBe(`0 of ${THRESHOLD}`);
    expect(ofThreshold(1)).toBe(`1 of ${THRESHOLD}`);
    expect(ofThreshold(1284)).toBe(`1,284 of ${THRESHOLD}`);
    expect(THRESHOLD).toBe("100,000");
    const html = hero(render({ count: 7, seatsWaiting: 40 }));
    expect(textOf(html)).toContain(`7 of ${THRESHOLD}`);
    expect(html).not.toMatch(/<progress|role="progressbar"|aria-valuenow/);
    expect(read("src/components/public/door.module.css")).not.toMatch(/\.heroCount[^}]*width:\s*\d+%/);
  });

  it("when the count can't be read, the sentence stands alone and the page renders", () => {
    const text = textOf(hero(render({ count: null })));
    expect(text).not.toContain(`of ${THRESHOLD}`);
    expect(text).toContain(`When ${THRESHOLD} people have joined, I hand over`);
    expect(text).toContain(DOOR_STATUS);
  });

  it("the panel beside a member's feed carries the same number, and stands without it", () => {
    const withCount = textOf(renderToStaticMarkup(createElement(OursCard, { email: null, count: 3 })));
    expect(withCount).toContain(`3 of ${THRESHOLD} people are in.`);
    const without = textOf(renderToStaticMarkup(createElement(OursCard, { email: null, count: null })));
    expect(without).not.toContain(THRESHOLD);
    expect(read("src/app/(app)/layout.tsx")).toContain("memberCount(db).catch(");
  });
});

describe("the form (D-0024 §C)", () => {
  it("takes the address and an optional need of at most 140 characters, with D-0016 §B's button: the waiting list when no seat is open, Join our.one when one is", () => {
    const closed = hero(render({ seatsOpen: 0 }));
    expect(inputTag(closed, "email")).toMatch(/\brequired\b/);
    expect(inputTag(closed, "need")).toContain(`maxLength="${NEED_MAX}"`);
    expect(inputTag(closed, "need")).not.toMatch(/\brequired\b/);
    const text = textOf(closed);
    expect(text).toContain(NEED_LABEL);
    expect(text).toContain(NEED_HINT);
    expect(text).toContain(WAITING_LIST_LABEL);
    expect(text).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    expect(text).toContain(FREE_LINE);

    const open = textOf(hero(render({ seatsOpen: 3, seatsWaiting: 0 })));
    expect(open).toContain(JOIN_LABEL);
    expect(open).not.toContain("No seats are open right now.");
  });

  it("counts the needs named in public from the first one, and shows nothing at none or unread", () => {
    expect(needsLine(1)).toBe("1 app named so far.");
    expect(needsLine(37)).toBe("37 apps named so far.");
    expect(needsLine(1284)).toBe("1,284 apps named so far.");
    expect(textOf(hero(render({ needs: 1 })))).toContain("1 app named so far.");
    expect(textOf(hero(render({ needs: 0 })))).not.toContain("named so far");
    expect(textOf(hero(render({ needs: null })))).not.toContain("named so far");
  });

  it("a member is shown their feed in place of the form; while joining is closed, the notice stands in its place", () => {
    const member = textOf(hero(render({ member: true })));
    expect(member).toContain(MEMBER_JOIN.line);
    expect(member).toContain(MEMBER_JOIN.link);
    expect(member).not.toContain("Your email");
    const closed = hero(render({ joining: false, seatsOpen: null, needs: null }));
    expect(textOf(closed)).toContain("Joining opens soon.");
    expect(textOf(closed)).toContain(INVITE_CLOSED_LINE);
    expect(closed).not.toContain('name="email"');
  });

  it("shows a refusal at the field it concerns, and the one answer after a valid submission", () => {
    const view = (state: Parameters<typeof FirstScreenFormView>[0]["state"]) =>
      renderToStaticMarkup(createElement(FirstScreenFormView, { state, action: () => {}, pending: false, lines: [FREE_LINE], needs: null }));
    const atEmail = view({ error: SEATS_CLOSED });
    expect(atEmail).toMatch(/id="field-email-error"[^>]*>[^<]*Joining opens soon\./);
    expect(atEmail).not.toMatch(/id="field-need-error"/);
    const atNeed = view({ error: NEED_TOO_LONG, field: "need" });
    expect(atNeed).toMatch(new RegExp(`id="field-need-error"[^>]*>[^<]*${NEED_TOO_LONG.replace(".", "\\.")}`));
    expect(atNeed).not.toMatch(/id="field-email-error"/);
    expect(textOf(view({ ok: true }))).toContain(CHECK_YOUR_EMAIL);
    expect(textOf(view(null))).not.toContain(CHECK_YOUR_EMAIL);
  });
});

/* ================================================================ needs */

describe("a need, in the core (D-0024 §C)", () => {
  it("normalizes: collapses whitespace, trims, drops control characters; empty is null; over 140 characters is refused", () => {
    expect(normalizeNeed("  the  calendar\n app ")).toBe("the calendar app");
    expect(normalizeNeed("a\u0000b\u0007c")).toBe("abc");
    expect(normalizeNeed("")).toBeNull();
    expect(normalizeNeed("   \n  ")).toBeNull();
    expect(normalizeNeed(null)).toBeNull();
    expect(normalizeNeed(undefined)).toBeNull();
    expect(normalizeNeed("x".repeat(NEED_MAX))).toHaveLength(NEED_MAX);
    expect(() => normalizeNeed("x".repeat(NEED_MAX + 1))).toThrow(NEED_TOO_LONG);
    // Characters, not bytes.
    expect(normalizeNeed("é".repeat(NEED_MAX))).toHaveLength(NEED_MAX);
  });

  it("keeps the words and when, nothing else: the table has no column for an address, and the check holds the length", async () => {
    const t0 = at("2026-10-05T10:00:00Z");
    const id = await nameNeed(db(), { text: "  the group chat we all hate ", now: t0 });
    expect(id).toMatch(/^[0-9a-z]+$/i);
    const rows = await db().select().from(needs);
    expect(rows).toEqual([{ id, text: "the group chat we all hate", createdAt: t0 }]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["createdAt", "id", "text"]);
    // The database holds the line too, whatever the code does.
    const refusedBy = async (statement: ReturnType<typeof sql>): Promise<string> => {
      try {
        await db().execute(statement);
      } catch (error) {
        const cause = (error as { cause?: { message?: string } }).cause;
        return `${cause?.message ?? ""} ${(error as Error).message}`;
      }
      return "accepted";
    };
    expect(await refusedBy(sql`insert into needs (id, text) values ('FICTIONAL-long', ${"x".repeat(NEED_MAX + 1)})`)).toContain("needs_text_length");
    expect(await refusedBy(sql`insert into needs (id, text) values ('FICTIONAL-empty', '')`)).toContain("needs_text_length");
    await expect(nameNeed(db(), { text: "   " })).rejects.toSatisfy((e: unknown) => isCoreError(e) && e.code === "INVALID");
    expect(await needsCount(db())).toBe(1);
  });

  it("the migration creates the table with its check, the journal names it, and the down file drops it and forgets the run", () => {
    const up = read("drizzle/0003_needs.sql");
    expect(up).toContain('CREATE TABLE "needs"');
    expect(up).toMatch(/CONSTRAINT "needs_text_length" CHECK \(char_length\("needs"\."text"\) BETWEEN 1 AND 140\)/);
    expect(up).not.toMatch(/email|address/i);
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: { tag: string; when: number }[] };
    const entry = journal.entries.find((e) => e.tag === "0003_needs");
    expect(entry).toBeDefined();
    const down = read("drizzle/down/0003_needs.sql");
    expect(down).toContain('DROP TABLE "needs";');
    expect(down).toContain(`WHERE "created_at" = ${entry!.when};`);
    expect(down).toContain("\\copy needs to");
  });
});

describe("a need rides on the seat request (D-0024 §C)", () => {
  it("is refused at its field when too long, before anything is counted, and nothing is kept", async () => {
    await maintainer();
    web.headers.set("x-forwarded-for", "203.0.113.30");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "x".repeat(NEED_MAX + 1) }))).toEqual({ error: NEED_TOO_LONG, field: "need" });
    await runLater();
    expect(await db().select().from(rateEvents)).toEqual([]);
    expect(await storedNeeds()).toEqual([]);
    expect(await db().select().from(waitlist)).toEqual([]);
  });

  it("is not kept when the seat request is refused: joining closed, a malformed address, a rate limit", async () => {
    const rado = await maintainer();
    web.headers.set("x-forwarded-for", "203.0.113.31");
    vi.stubEnv("DATA_CONTROLLER", "");
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar" }))).toEqual({ error: SEATS_CLOSED });
    vi.unstubAllEnvs();
    expect(await takeSeat(null, form({ email: "not an email", need: "the calendar" }))).toEqual({ error: "Enter a valid email address." });
    for (let i = 0; i < 3; i++) {
      expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({ ok: true });
    }
    expect(await takeSeat(null, form({ email: "mara_f@example.test", need: "the calendar" }))).toEqual({ error: RATE_LIMITED_MESSAGE });
    await runLater();
    expect(await storedNeeds()).toEqual([]);
    expect(rado.isAdmin).toBe(true);
  });

  it("goes through with or without a need; a need is kept once, without the address, and counted", async () => {
    await maintainer();
    await setOpen(0);
    web.headers.set("x-forwarded-for", "203.0.113.32");
    expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({ ok: true });
    expect(await takeSeat(null, form({ email: "tomas_f@example.test", need: "  the group chat  " }))).toEqual({ ok: true });
    await runLater();
    expect(await storedNeeds()).toEqual(["the group chat"]);
    expect(await needsCount(db())).toBe(1);
    const row = (await db().select().from(needs))[0]!;
    expect(JSON.stringify(row)).not.toMatch(/example\.test|mara|tomas/);
    expect((await db().select().from(waitlist)).map((r) => r.email).sort()).toEqual(["mara_f@example.test", "tomas_f@example.test"]);
  });

  it("is never rendered to a visitor or a member: no component reads the needs' words", () => {
    const readers = ["src/components", "src/app"].flatMap((dir) => listFiles(join(WEB_ROOT, dir)));
    const offenders = readers.filter((file) => /\bneeds\.text\b|select\(\)\.from\(needs\)|from\(needs\)/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
    // The core exposes the count and the keeping, and no listing.
    expect(read("src/core/needs.ts")).not.toMatch(/export (?:async )?function list/);
  });
});

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/* ================================================= privacy, the card */

describe("the privacy notice and the link card (D-0024 §C, §D)", () => {
  it("/privacy names the need, its purpose and 12 months, before the form takes anything", () => {
    const text = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(NEED_KEPT_MONTHS).toBe(12);
    expect(text).toContain("Apps you name");
    expect(text).toContain(`What you write in "${NEED_LABEL}" on the front door, and when. Not your address: nothing links a need to you.`);
    expect(text).toContain("To see what people want made theirs, and to count it in public.");
    expect(text).toContain("For 12 months, or until a decision publishes or deletes them. They are not removed automatically yet.");
    // The "what Neon receives" line, shown on the deployed site, stays true: the needs are kept on our.one too.
    expect(read("src/app/(public)/privacy/page.tsx")).toContain('const NEON_KEEPS = "everything this notice says is kept on our.one is stored there.";');
  });

  it("every page carries the link card: the page's own title and description, one committed image on the paper, and X's large card", () => {
    expect(rootMetadata.openGraph).toMatchObject({
      siteName: "our.one",
      type: "website",
      images: [{ url: "/card.png", width: 1200, height: 630, alt: TAGLINE }],
    });
    expect(rootMetadata.twitter).toMatchObject({ card: "summary_large_image", images: ["/card.png"] });
    // No title or description of its own, so each page's flow into the card.
    expect(rootMetadata.openGraph).not.toHaveProperty("title");
    expect(rootMetadata.openGraph).not.toHaveProperty("description");
    // The base is APP_URL, which the test setup sets; the source reads it as appUrl() does, without the core.
    expect(process.env.APP_URL).toBeTruthy();
    expect(String(rootMetadata.metadataBase)).toBe(new URL(process.env.APP_URL!).href);
    expect(read("src/app/layout.tsx")).toContain('process.env.APP_URL?.replace(/\\/+$/, "")');
    expect(read("src/app/layout.tsx")).not.toMatch(/from "@\/core\//);
    const card = join(WEB_ROOT, "public/card.png");
    expect(existsSync(card)).toBe(true);
    const png = readFileSync(card);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    // Its source is committed beside the script that renders it.
    expect(read("scripts/card.html")).toContain("The software we live in should be");
    expect(read("package.json")).toContain('"card": "tsx scripts/card.ts"');
  });
});
