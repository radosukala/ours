/**
 * The re-check of M-0013 (the front page, product first): the last step of
 * the independent verification, written by an agent that built nothing and
 * fixed nothing, against 413b0da, after two verifiers checked 24a683f
 * (verify-m0013-honesty.test.ts, verify-m0013-render.test.ts) and the
 * architect fixed what they found (SPEC §18.15 "Decisions after the
 * verification"; D-0015 §K).
 *
 * Stopping rule, declared before the first test was written: each of the
 * seven fixes is read in the code and rendered in every state the brief
 * names (joining open and closed × the count null, 0, 1 and 1,284 × the
 * seats null, 0 and 5); the new seat line is tried on the product's own
 * paths in seats.ts; the phone is compared with what the app draws for the
 * same four posts and the same last visit; the new invite line is tried
 * against invites.ts; the widened rules are tried with neighbouring forms.
 * Each try ends here as a failing "DEFECT (SEVERITY): …" test or a passing
 * "closed: …" test, or, where only a browser's layout can see it, in the
 * re-check report.
 *
 * - "DEFECT (SEVERITY): …" asserts what should be true. It FAILS on
 *   413b0da, and the failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Nothing in the product, the records or another test is changed by this
 * file. Everyone here is FICTIONAL, with an example.test address; client
 * addresses are keyed hashes of the documentation ranges (RFC 5737).
 *
 * After the re-check (the architect, SPEC §18.15 "Decisions after the
 * re-check"): the three DEFECTs were fixed and renamed "fixed (…)"; where a
 * fix changed the words, the assertion points at the fixed words and at
 * what the code does.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
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

import ContractPage from "@/app/(public)/contract/page";
import { FeedList } from "@/components/posts/FeedList";
import { PostRow } from "@/components/posts/PostRow";
import { FeedPreview, PREVIEW_LAST_VISIT, PREVIEW_NOW } from "@/components/public/FeedPreview";
import { FrontPage, type FrontPageProps } from "@/components/public/FrontPage";
import { scanText } from "@/core/claims";
import { HANDOVER_THRESHOLD, INVITE_TTL_DAYS } from "@/core/config";
import { createInvite, inviteForViewer } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import type { PostView } from "@/core/posts";
import { outbox, waitlist } from "@/core/schema";
import { openSeats, requestSeat } from "@/core/seats";
import { asc, eq } from "drizzle-orm";
import { at, db, makeAccount, plus, reset } from "./helpers";

const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A public page in the scan's reach with no ALLOWLIST entry. */
const ANOTHER_PAGE = "src/app/(public)/signin/page.tsx";

const SEAT_LINE = "No seats open right now. Leave your address to join the line. Seats go to whoever has waited longest.";
const INVITE_LINE = "Have an invite? It can't be used until joining opens.";
const MAINTAINER_ANSWER = `After ${T}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`;
const SOURCE_LINE = "Source: the court's opinion in FTC v. Meta, pages 8 and 9, citing Meta's own figures.";

/** Visible text of rendered HTML: scripts dropped, every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

function render(props: FrontPageProps): string {
  return renderToStaticMarkup(createElement(FrontPage, props));
}

/** Every state the brief names: 2 × 4 × 3. */
const STATES: FrontPageProps[] = [true, false].flatMap((joining) =>
  [null, 0, 1, 1284].flatMap((count) => [null, 0, 5].map((seatsOpen) => ({ joining, count, seatsOpen }))),
);

/** The phone's four posts, as the core would send them to a reader who wrote none of them (FICTIONAL). */
const PHONE_POSTS: readonly { handle: string; name: string; body: string; age: number; replies: number }[] = [
  { handle: "mara", name: "Mara", body: "Made it to the top before the rain. Legs are gone. Worth it.", age: 2 * HOUR, replies: 2 },
  { handle: "tomas", name: "Tomas", body: "Soup's on tonight. Door's open from 7, bring whoever.", age: 5 * HOUR, replies: 4 },
  { handle: "jana", name: "Jana", body: "Finished the book you lent me. The last chapter. Wow.", age: DAY, replies: 1 },
  { handle: "pavel", name: "Pavel", body: "Anyone up for a slow run on Saturday? I'll bring coffee.", age: 3 * DAY, replies: 3 },
];

function asReaderSees(now: number): PostView[] {
  return PHONE_POSTS.map((p) => ({
    id: `post-${p.handle}`,
    body: p.body,
    audience: "friends" as const,
    createdAt: new Date(now - p.age),
    author: { id: `account-${p.handle}`, handle: p.handle, displayName: p.name },
    isOwn: false,
    replyCount: p.replies,
    likedByMe: false,
    removed: null,
    // No likeCount: the core sends it to the author only (posts.ts, SPEC §7).
  }));
}

/** The visible text of each `.action__count` in a post row, in order: reply, like. */
function counts(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/class="action__count"[^>]*>([^<]*)</g)].map((m) => m[1]!.trim());
}

function rows(html: string): string[] {
  return html.split(/(?=<article class="post)/).filter((part) => part.startsWith("<article class=\"post"));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ====================================================================== */
/* The fixed words, in every state                                        */
/* ====================================================================== */

describe("the fixed words, in every state (SPEC §18.15, decisions after the verification)", () => {
  it("closed: in all 24 states the seat line shows only while joining with no seat open, the invite line only while joining is closed, the maintainer answer and the 'pages 8 and 9' source always, and none of the five old sentences anywhere", () => {
    for (const state of STATES) {
      const label = JSON.stringify(state);
      const text = textOf(render(state));
      expect(text.includes(SEAT_LINE), label).toBe(state.joining && state.seatsOpen === 0);
      expect(text.includes(INVITE_LINE), label).toBe(!state.joining);
      expect(text, label).toContain(MAINTAINER_ANSWER);
      expect(text, label).toContain(SOURCE_LINE);
      expect(text.split(SEAT_LINE).length - 1, label).toBeLessThanOrEqual(1);
      for (const old of [
        "you'll get the next one",
        "Open the link you were sent",
        `After ${T}, a body of its members holds it`,
        ", page 8, citing",
        "You're caught up You've seen everything from before your last visit, 2 days ago. That's everything",
      ]) {
        expect(text, `${label}: ${old}`).not.toContain(old);
      }
    }
  });

  it("closed: the maintainer answer hands over what /contract's second promise hands over — the domain, the data and the right to replace the maintainer — to the body it names, and adds nothing the contract does not say", () => {
    const contract = textOf(renderToStaticMarkup(createElement(ContractPage)));
    const promise = /I hand over (.+?) to (a not-for-profit body of the members), founded by their vote under rules published before that day\./.exec(contract);
    const answer = /I hand over (.+?) to (a not-for-profit body of its members)\./.exec(MAINTAINER_ANSWER);
    expect(promise?.[1]).toBe("the domain, the data and the right to replace the maintainer");
    expect(answer?.[1]?.replace(/\bme\b/, "the maintainer")).toBe(promise?.[1]);
    expect(answer?.[2]?.replace("its members", "the members")).toBe(promise?.[2]);
    // "After [threshold]" is the contract's "At [threshold] members": the same condition, no earlier.
    expect(contract).toContain(`At ${T} members, I hand over`);
    expect(MAINTAINER_ANSWER.startsWith(`After ${T}, `)).toBe(true);
  });
});

/* ====================================================================== */
/* The seat line, on the product's own paths                              */
/* ====================================================================== */

describe("the seat line, on every path of seats.ts (SPEC §18.4)", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("closed: 'join the line' and 'whoever has waited longest' hold on each path — a repeat request keeps the address's place, a member's address is not put in line, the older address gets the seat although the newer asked twice, and an address that already holds a seat is sent a new link to it instead of a place in line", async () => {
    const t0 = at("2026-09-29T10:00:00Z");
    const rado = await makeAccount({
      handle: "rado_rc13",
      displayName: "Rado FICTIONAL",
      email: "rado_rc13@example.test",
      isAdmin: true,
      createdAt: at("2026-01-01T00:00:00Z"),
    });
    const ip = (n: number) => rateKeyHash(`192.0.2.${n}`);
    const line = async () =>
      (await db().select({ email: waitlist.email, since: waitlist.createdAt }).from(waitlist).orderBy(asc(waitlist.createdAt))).map(
        (row) => `${row.email}@${row.since.toISOString()}`,
      );
    const mailsTo = async (email: string) => (await db().select().from(outbox).where(eq(outbox.toAddress, email))).length;

    // No seat is open. Ida joins the line, then Zoe an hour later.
    await requestSeat(db(), { email: "ida_rc13@example.test", ipHash: ip(1), now: t0 });
    await requestSeat(db(), { email: "zoe_rc13@example.test", ipHash: ip(2), now: plus.hours(t0, 1) });
    // Zoe asks again: she keeps her place, and does not move ahead of Ida or behind herself.
    await requestSeat(db(), { email: "zoe_rc13@example.test", ipHash: ip(2), now: plus.hours(t0, 2) });
    // The maintainer's own address: a member is not put in line.
    await requestSeat(db(), { email: "rado_rc13@example.test", ipHash: ip(3), now: plus.hours(t0, 3) });
    expect(await line()).toEqual([
      `ida_rc13@example.test@${t0.toISOString()}`,
      `zoe_rc13@example.test@${plus.hours(t0, 1).toISOString()}`,
    ]);

    // One seat opens: it goes to Ida, who has waited longest.
    expect(await openSeats(db(), rado.id, 1, { now: plus.hours(t0, 4) })).toEqual({ opened: 1, invited: 1 });
    expect({ ida: await mailsTo("ida_rc13@example.test"), zoe: await mailsTo("zoe_rc13@example.test"), line: await line() }).toEqual({
      ida: 1,
      zoe: 0,
      line: [`zoe_rc13@example.test@${plus.hours(t0, 1).toISOString()}`],
    });

    // Ida holds a seat and asks again with none open: a new link to her seat, and no place in line.
    await requestSeat(db(), { email: "ida_rc13@example.test", ipHash: ip(1), now: plus.hours(t0, 5) });
    expect({ ida: await mailsTo("ida_rc13@example.test"), line: await line() }).toEqual({
      ida: 2,
      line: [`zoe_rc13@example.test@${plus.hours(t0, 1).toISOString()}`],
    });

    // The next seat goes to Zoe, next in line.
    expect(await openSeats(db(), rado.id, 1, { now: plus.hours(t0, 6) })).toEqual({ opened: 1, invited: 1 });
    expect({ zoe: await mailsTo("zoe_rc13@example.test"), line: await line() }).toEqual({ zoe: 1, line: [] });
  });
});

/* ====================================================================== */
/* The phone against the app                                              */
/* ====================================================================== */

describe("the phone is the app (SPEC §18.15, decisions after the verification: 'built from the app's parts')", () => {
  it("closed: the phone's rows and markers come in the order FeedList draws for the same four posts and a last visit 2 days before — post, post, post, the caught-up marker, post, the end marker — with the markers' words the app's", () => {
    const now = Date.now();
    const app = renderToStaticMarkup(
      createElement(FeedList, {
        first: { items: asReaderSees(now), nextCursor: null },
        loadMore: async () => ({ ok: false as const, error: "FICTIONAL: nothing more" }),
        markers: true,
        caughtUpBefore: new Date(now - 2 * DAY),
        hideMuted: true,
        empty: { text: "Your feed is quiet." },
      }),
    );
    const phone = renderToStaticMarkup(createElement(FeedPreview));
    const sequence = (html: string) =>
      [...html.matchAll(/<article class="post[^"]*"|role="separator" aria-label="([^"]*)"/g)].map((m) =>
        m[1] === undefined ? "post" : `separator: ${m[1]}`,
      );
    expect(PREVIEW_LAST_VISIT.getTime()).toBe(PREVIEW_NOW.getTime() - 2 * DAY);
    expect(sequence(phone)).toEqual([
      "post",
      "post",
      "post",
      "separator: You&#x27;re caught up. You&#x27;ve seen everything from before your last visit, 2 days ago.",
      "post",
      "separator: That&#x27;s everything from the last 14 days.",
    ]);
    expect(sequence(phone)).toEqual(sequence(app));
  });

  it("fixed (SPEC §18.15, after the re-check; was DEFECT (MEDIUM)): the phone shows no like count on any of its four posts, as the app draws none for a reader who did not write the post — 'There is no like count for non-authors' (SPEC §7; LikeButton.tsx); each row ends where the app's does, at the reply count", () => {
    const now = Date.now();
    const phone = rows(renderToStaticMarkup(createElement(FeedPreview)));
    const app = asReaderSees(now).map((post) => renderToStaticMarkup(createElement(PostRow, { post })));
    expect(phone).toHaveLength(4);
    expect(app.map(counts)).toEqual([
      ["2", ""],
      ["4", ""],
      ["1", ""],
      ["3", ""],
    ]);
    expect(phone.map(counts), "the phone's rows: reply count, like count").toEqual(app.map(counts));
  });
});

/* ====================================================================== */
/* The invite line while joining is closed                                */
/* ====================================================================== */

describe("the invite line while joining is closed (SPEC §18.15, decisions after the verification)", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it(`fixed (SPEC §18.15, after the re-check; was DEFECT (LOW)): the line while joining is closed states a fact and promises nothing — 'Have an invite? It can't be used until joining opens.' — because an invite expires ${INVITE_TTL_DAYS} days after it is made (invites.ts, INVITE_TTL_DAYS): one made while joining is closed works if joining opens within its life, and not after`, async () => {
    const t0 = at("2026-09-29T10:00:00Z");
    const rado = await makeAccount({ handle: "rado_rc13", email: "rado_rc13@example.test", isAdmin: true });
    // Joining is closed: no data controller is named. The page shows the line. A member makes an invite.
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const { code } = await createInvite(db(), rado.id, { note: "FICTIONAL", now: t0 });
    expect(textOf(render({ joining: false, count: null, seatsOpen: null }))).toContain(INVITE_LINE);
    expect((await inviteForViewer(db(), { code, viewerId: null, now: t0 })).kind).toBe("closed");

    // The line promises nothing about later.
    expect(INVITE_LINE).not.toMatch(/will work|works/);
    // Joining opens later. Within the invite's life it works; after it, it does not.
    vi.unstubAllEnvs();
    const opens = async (day: number) => (await inviteForViewer(db(), { code, viewerId: null, now: plus.days(t0, day) })).kind;
    expect({
      [`opens on day ${INVITE_TTL_DAYS - 1}`]: await opens(INVITE_TTL_DAYS - 1),
      [`opens on day ${INVITE_TTL_DAYS + 1}`]: await opens(INVITE_TTL_DAYS + 1),
    }).toEqual({
      [`opens on day ${INVITE_TTL_DAYS - 1}`]: "can_join",
      [`opens on day ${INVITE_TTL_DAYS + 1}`]: "unusable",
    });
  });
});

/* ====================================================================== */
/* The claims scan's rules, after the widening                            */
/* ====================================================================== */

describe("the claims scan's rules after the widening (claims.ts; CHECKED, not ENFORCED)", () => {
  it("closed: the forms the fix named are caught on a page with no ALLOWLIST entry, and so are 'I've handed our.one to', 'hand our.one over to', 'will hand our.one to', 'our.one was handed to', 'has been handed to' and 'in its members' hands'", () => {
    const told = [
      "I handed it to a not-for-profit body of its members.",
      "Rado has handed it to its members.",
      "I hand our.one to a not-for-profit body of its members.",
      "I handed our.one over to its members.",
      "I've handed our.one to its members.",
      "I hand our.one over to a body of its members.",
      "I will hand our.one to its members.",
      "our.one was handed to its members at 100,000.",
      "our.one has been handed to its members.",
      "our.one is in its members' hands.",
      "The handover happened.",
      "The handover took place.",
    ];
    expect(told.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0)).toEqual([]);
  });

  it("fixed (SPEC §18.15, after the re-check; was DEFECT (LOW)): the done-rule now also catches the handover told as done in its neighbours' words: 'The handover is done.', 'The handover is complete.', 'The handover was completed.', 'is finished' (claims.ts)", () => {
    const told = ["The handover is done.", "The handover is complete.", "The handover was completed.", "The handover has been completed.", "The handover is finished."];
    const seen = told.map((claim) => [claim, scanText(claim, ANOTHER_PAGE).length > 0] as const);
    expect(Object.fromEntries(seen)).toEqual(Object.fromEntries(told.map((claim) => [claim, true])));
  });
});
