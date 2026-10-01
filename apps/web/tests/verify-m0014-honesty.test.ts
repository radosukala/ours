/**
 * Independent verification of M-0014 (the reason, and the invitation), the
 * honesty lens and the claims scan. Written by an agent that did not build
 * it, against dcff190 (the build; its records are a414663, its base
 * bfd587b). It changes no product code, no record and no other test.
 *
 * Stopping rule, declared before the first test was written. Six areas,
 * each tried at least once in the states the brief names, and each try
 * ends here as a test:
 *
 * 1. Every sentence D-0016 changes or adds, rendered in every state of the
 *    front page (joining open and closed × the count null, 0, 1 and 1,284 ×
 *    the seats null, 0 and 5), read against its source and the code: the
 *    lede against follows and the feed; the two labels and the seat line
 *    against what `takeSeat` (seats.ts) does for each kind of address and
 *    against the unchanged answer; the card against /contract, D-0012 and
 *    D-0013; the reason; the 2025 line against Meta's announcement, fetched
 *    once; the export sentence against export.ts, /settings, promise 4 and
 *    a suspended account; the present state; the friends answer; the close.
 * 2. The status line, wherever it renders.
 * 3. The invite page, signed out, joining open and closed.
 * 4. The claims scan: `everywhere` removed, the card's sentence listed,
 *    every sentence about the handover on every page, and neighbouring
 *    forms tried against `scanText`.
 * 5. D-0016's and SPEC §18.16's exact sentences against the rendered page.
 * 6. Each test file the build changed, diffed against bfd587b, and what
 *    each changed assertion still proves.
 *
 * What a test cannot read (Meta's page, over the network) was read once and
 * is recorded below with its digest.
 *
 * - "DEFECT (SEVERITY): …" asserts what should be true. It FAILS on
 *   dcff190, and the failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Everyone here is FICTIONAL, with an example.test address; client
 * addresses are keyed hashes of the documentation ranges (RFC 5737).
 *
 * After the round (the architect, D-0016 §N and SPEC §18.16 "Decisions
 * after the verification"; this file was committed as written first, in
 * dcd57d0): each DEFECT was fixed and renamed "fixed (…)", its assertion
 * kept, or pointed at the fixed words where the fix changed them; or
 * recorded as "accepted (…)", or "open (…)" while it waits for the
 * founder, its assertion turned to say what holds today and where it is
 * recorded. The closed tests that quote the page follow the fixed words.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, getTableColumns, or } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import { JoinRequestForm } from "@/app/(public)/i/[code]/InviteForms";
import InvitePage from "@/app/(public)/i/[code]/page";
import { JoinForm } from "@/app/(public)/join/JoinForm";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import PublicLayout from "@/app/(public)/layout";
import FrontPageRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import RulesPage from "@/app/(public)/rules/page";
import {
  CLOSE_HEADING,
  CLOSE_LINE,
  FrontPage,
  type FrontPageProps,
  REASON,
  REASON_LEAD,
} from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { MAINTAINER, NOTICE_DAYS } from "@/components/public/handover";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { JOIN_LABEL, WAITING_LIST_LABEL } from "@/components/public/join";
import { LEDE } from "@/components/public/lede";
import { RightColumn, SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { deleteAccount, openEmailLink } from "@/core/accounts";
import { ALLOWLIST, scanText } from "@/core/claims";
import { DEFAULT_INVITES, HANDOVER_THRESHOLD } from "@/core/config";
import { follow as followThroughTheApp } from "@/core/connections";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { getFeed } from "@/core/feed";
import { applyInviteAsExisting, completeJoin, createInvite, JOIN_REQUESTS_OFF, requestJoin } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import { seatEmail } from "@/core/mail-templates";
import { createReply } from "@/core/posts";
import { accounts, follows, friendships, invites, outbox, posts, replies, waitlist } from "@/core/schema";
import { memberCount, openSeats, requestSeat, seatState } from "@/core/seats";
import { at, befriend, db, follow, makeAccount, plus, post, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
const FRONT = "src/components/public/FrontPage.tsx";
/** A public page in the scan's reach with no ALLOWLIST entry. */
const ANOTHER_PAGE = "src/app/(public)/signin/page.tsx";
const INVITE_PAGE = "src/app/(public)/i/[code]/page.tsx";

/* ---------------------------------------------------------------- helpers */

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

/** A page's sentences, block by block (a heading never runs into the paragraph after it). */
function sentencesOf(html: string): string[] {
  return textOf(html.replace(/<\/(?:h[1-6]|p|li|dt|dd|div|section|header|footer|nav|figcaption|blockquote)>/g, "\u0001"))
    .split("\u0001")
    .flatMap((block) => block.trim().split(/(?<=[.?!])\s+(?=[A-Z0-9"“])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function render(props: FrontPageProps): string {
  return renderToStaticMarkup(createElement(FrontPage, props));
}

async function renderRoute(): Promise<string> {
  return renderToStaticMarkup((await FrontPageRoute()) as ReactElement);
}

/** A component rendered with no props, as a page or a footer is. */
function rendered(component: (props: never) => unknown): string {
  return renderToStaticMarkup(createElement(component as unknown as () => ReactElement));
}

/**
 * A record as one line of text: blockquote markers, emphasis and code ticks
 * dropped, whitespace collapsed, so a sentence the record wraps reads whole.
 */
function readRecord(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ");
}

/** SPEC §18.16, as one line. */
function spec1816(): string {
  const spec = readRecord("apps/web/SPEC.md");
  return spec.slice(spec.indexOf("### 18.16"));
}

/** A rendered sentence written as the records write it, with their placeholders. */
function withPlaceholders(sentence: string): string {
  return sentence
    .replaceAll(T, "[threshold]")
    .replace(`${MAINTAINER}, maintainer`, "[maintainer], maintainer")
    .replace(`me, ${MAINTAINER}.`, "me, [maintainer].")
    .replace(`${NOTICE_DAYS} days' notice`, "[notice] days' notice")
    .replace(`${DEFAULT_INVITES} invites`, "[invites] invites");
}

/** The words on the front page's join button, or null when there is no form. */
function buttonOf(html: string): string | null {
  return html.match(/<button type="submit"[^>]*>([^<]*)<\/button>/)?.[1] ?? null;
}

/** A client address: a keyed hash of a documentation range (RFC 5737). */
const ip = (n: number) => rateKeyHash(`192.0.2.${n % 250}`);

/** The maintainer: the oldest active administrator (FICTIONAL). */
async function maintainer() {
  return makeAccount({
    handle: "rado_m14",
    displayName: "Rado FICTIONAL",
    email: "rado_m14@example.test",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
  });
}

async function mailsTo(email: string): Promise<number> {
  return (await db().select().from(outbox).where(eq(outbox.toAddress, email))).length;
}

async function line(): Promise<string[]> {
  const rows = await db()
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((row) => row.email);
}

/** What the form did with one address, in the words the two labels use. */
async function outcomeFor(email: string, mailsBefore: number): Promise<"a join link" | "a place in line" | "nothing"> {
  if ((await mailsTo(email)) > mailsBefore) return "a join link";
  if ((await line()).includes(email)) return "a place in line";
  return "nothing";
}

/** What each label tells the visitor the form will do. */
function promisedBy(label: string | null): string {
  if (label === JOIN_LABEL) return "a join link";
  if (label === WAITING_LIST_LABEL) return "a place in line";
  return `no form (${String(label)})`;
}

/** The Resend transport chosen but not configured: every send returns ok: false. */
function transportRefuses(): void {
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ====================================================================== */
/* 1, 5 and 6. Every sentence, in all 24 states                           */
/* ====================================================================== */

/** joining open and closed × the count null, 0, 1 and 1,284 × the seats null, 0 and 5. */
const STATES: FrontPageProps[] = [true, false].flatMap((joining) =>
  [null, 0, 1, 1284].flatMap((count) => [null, 0, 5].map((seatsOpen) => ({ joining, count, seatsOpen }))),
);

const COUNT_LINES: Record<string, string> = {
  "0": "Nobody is in yet. You'd be #1.",
  "1": "1 person is in. You'd be #2.",
  "1284": "1,284 people are in. You'd be #1,285.",
};

/**
 * The page as D-0016 and SPEC §18.16 write it (over §18.15), for one state,
 * in its order. The phone and the illustration are unchanged by M-0014 and
 * are written as the M-0013 verification pinned them.
 */
function expectedText({ joining, count, seatsOpen }: FrontPageProps): string {
  const noSeat = seatsOpen !== null && seatsOpen <= 0;
  const label = noSeat ? "Join the waiting list" : "Join our.one";
  return [
    "Just your people. Then you're done.",
    "A social network for your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can get on with your day.",
    "Join our.one",
    ...(joining
      ? [
          `Your email ${label}`,
          ...(noSeat ? ["No seats are open right now. Seats go to whoever has waited longest."] : []),
          "Free to join. You get 10 invites to bring your people.",
          "We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.",
        ]
      : ["Joining opens soon.", "Have an invite? It can't be used until joining opens."]),
    "our.one",
    "M Mara @mara · 2h Made it to the top before the rain. Legs are gone. Worth it. 2",
    "T Tomas @tomas · 5h Soup's on tonight. Door's open from 7, bring whoever. 4",
    "J Jana @jana · 1d Finished the book you lent me. The last chapter. Wow. 1",
    "You're caught up You've seen everything from before your last visit, 2 days ago.",
    "P Pavel @pavel · 3d Anyone up for a slow run on Saturday? I'll bring coffee. 3",
    "That's everything from the last 14 days.",
    "An example feed. Fictional people.",
    "R",
    "I'll never sell our.one. When 100,000 people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three.",
    "Rado, maintainer · How that works",
    "Where did your friends go?",
    "7%",
    "In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.",
    "Source: the court's opinion in FTC v. Meta, pages 8 and 9, citing Meta's own figures.",
    "On our.one, your feed is only the people you chose, and then it ends.",
    "A ranked feed Home Sponsored Suggested for you M Mara Made it to the top before the rain. Suggested for you Sponsored Suggested for you and it keeps going",
    "our.one Home M Mara Made it to the top before the rain. T Tomas Soup's on tonight. Door's open from 7. J Jana Finished the book you lent me. That's everything from the last 14 days.",
    "Illustration.",
    "How it works",
    "1 Join Your email, a name and a username. It's free, and you need to be 18 or older.",
    "2 Bring your people You get 10 invites. It stays quiet until the people you care about are here, so send them to the ones you'd actually want to hear from.",
    "3 Catch up, then close it Their posts, newest first. When there's nothing new, it says so.",
    "Keep your people. Change who runs it.",
    "The people make the network.",
    "You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.",
    "WhatsApp, in three dates",
    "2012 WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
    "2014 Facebook agreed to buy it for about $19 billion.",
    "2025 WhatsApp announced ads in Status, in its Updates tab.",
    "An owner can sell it, change it or shut it down. A maintainer does the job, or is replaced.",
    "our.one has a maintainer: me, Rado. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice. In Settings, you can download your profile, posts, replies and connections, and delete it all. If your account is suspended, write to us and we will do it for you.",
    "When 100,000 people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.",
    "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
    ...(count === null ? [] : [COUNT_LINES[String(count)]!]),
    "Read the contract See every cost Read the code",
    "Fair questions",
    "Is it free? Yes. Today I pay the bills, and every cost is public.",
    "What if my friends aren't on it? At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
    "Can I post photos? Not yet. Posts are words for now.",
    "Is there an app? Not yet. our.one works in your phone's browser, and you can add it to your home screen.",
    "Why should I believe you? Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost.",
    "What if it never gets to 100,000? Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.",
    "What's a maintainer? The one who keeps it running. Today that's me, and today I also hold everything. After 100,000, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.",
    ...(joining ? [`Who would you like to hear from? Join, then send them an invite. ${label}`] : []),
  ].join(" ");
}

describe("every sentence, in all 24 states (D-0016; SPEC §18.16 over §18.15)", () => {
  it("closed: joining open and closed × the count null, 0, 1 and 1,284 × the seats null, 0 and 5 — the whole visible text is D-0016's and SPEC §18.16's copy, in its order, and nothing else (written here from the records, not from the build's own specText)", () => {
    expect(HANDOVER_THRESHOLD).toBe(100_000);
    expect([MAINTAINER, NOTICE_DAYS, DEFAULT_INVITES]).toEqual(["Rado", 60, 10]);
    expect(STATES).toHaveLength(24);
    for (const state of STATES) {
      expect(textOf(render(state)), JSON.stringify(state)).toBe(expectedText(state));
    }
  });

  it("closed: the button and the close carry the same label in every state with the form; the seat line shows only with the form and no seat open; with no form there is no button, no close and no label but the hidden heading", () => {
    for (const state of STATES) {
      const html = render(state);
      const label = JSON.stringify(state);
      const button = buttonOf(html);
      const close = html.match(/<a href="#front-get-in" class="btn btn--primary btn--large">([^<]*)<\/a>/)?.[1] ?? null;
      if (!state.joining) {
        expect({ button, close }, label).toEqual({ button: null, close: null });
        expect(textOf(html).split("Join our.one").length - 1, label).toBe(1);
        expect(html, label).toMatch(/<h2 id="front-get-in" class="visually-hidden">Join our\.one<\/h2>/);
        continue;
      }
      const expected = state.seatsOpen === 0 ? WAITING_LIST_LABEL : JOIN_LABEL;
      expect({ button, close }, label).toEqual({ button: expected, close: expected });
      expect(textOf(html).includes("No seats are open right now."), label).toBe(state.seatsOpen === 0);
    }
  });
});

/* ====================================================================== */
/* 1. The lede, against follows and the feed                              */
/* ====================================================================== */

describe("the lede (D-0016 §A), against follows and the feed", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: 'your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you' — the feed holds a friend's posts and the followers posts of someone followed, newest first, nothing from anyone else, and ends; following needs the other person to accept followers (off by default), so 'choose' is among those who do", async () => {
    const now = at("2026-10-01T12:00:00Z");
    const ann = await makeAccount({ handle: "ann_m14", email: "ann_m14@example.test" });
    const ben = await makeAccount({ handle: "ben_m14", email: "ben_m14@example.test" });
    const cleo = await makeAccount({ handle: "cleo_m14", email: "cleo_m14@example.test", acceptsFollowers: true });
    const dan = await makeAccount({ handle: "dan_m14", email: "dan_m14@example.test" });
    const eve = await makeAccount({ handle: "eve_m14", email: "eve_m14@example.test", acceptsFollowers: true });
    await befriend(ann, ben);
    // Ann follows Cleo through the app; Dan does not accept followers, so she can't follow him.
    await followThroughTheApp(db(), ann.id, cleo.id, now);
    let refused = "";
    try {
      await followThroughTheApp(db(), ann.id, dan.id, now);
    } catch (error) {
      refused = isCoreError(error) ? error.code : String(error);
    }
    expect(refused).toBe("FORBIDDEN");
    expect(getTableColumns(accounts).acceptsFollowers.default).toBe(false);

    await post(ben, { audience: "friends", body: "FICTIONAL Ben, friends", at: plus.hours(now, -3) });
    await post(cleo, { audience: "friends", body: "FICTIONAL Cleo, friends only", at: plus.hours(now, -2) });
    await post(cleo, { audience: "followers", body: "FICTIONAL Cleo, followers", at: plus.hours(now, -1) });
    await post(dan, { audience: "friends", body: "FICTIONAL Dan", at: plus.minutes(now, -40) });
    await post(eve, { audience: "followers", body: "FICTIONAL Eve, a stranger", at: plus.minutes(now, -30) });

    const feed = await getFeed(db(), ann.id, { now });
    expect(feed.items.map((item) => item.body)).toEqual(["FICTIONAL Cleo, followers", "FICTIONAL Ben, friends"]);
    expect(feed.ended).toBe(true);
    expect(LEDE).toBe(
      "A social network for your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can get on with your day.",
    );
  });
});

/* ====================================================================== */
/* 1. The two labels and the seat line, on the paths of seats.ts          */
/* ====================================================================== */

describe("the button's two labels and the seat line (D-0016 §B), against what takeSeat does with each address", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("closed: a seat open and nobody waiting — 'Join our.one', and a newcomer gets the join link; none open — 'Join the waiting list' and the seat line, and a newcomer gets a place in line, a repeat keeps its place, and a member's address gets nothing and is not put in line (D-0016 §B: an address with an account gets no email; the answer's last sentence covers it)", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const rado = await maintainer();
    await makeAccount({ handle: "mia_m14", email: "mia_m14@example.test" });
    expect(await openSeats(db(), rado.id, 1, { now: t0 })).toEqual({ opened: 1, invited: 0 });

    // One seat open, nobody waiting.
    const open = await renderRoute();
    expect(buttonOf(open)).toBe(JOIN_LABEL);
    expect(textOf(open)).not.toContain("No seats are open right now.");
    await requestSeat(db(), { email: "ana_m14@example.test", ipHash: ip(1), now: plus.minutes(t0, 1) });
    expect(await outcomeFor("ana_m14@example.test", 0)).toBe(promisedBy(JOIN_LABEL));

    // No seat open now.
    const none = await renderRoute();
    expect(buttonOf(none)).toBe(WAITING_LIST_LABEL);
    expect(textOf(none)).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    await requestSeat(db(), { email: "ben_m14@example.test", ipHash: ip(2), now: plus.minutes(t0, 2) });
    expect(await outcomeFor("ben_m14@example.test", 0)).toBe(promisedBy(WAITING_LIST_LABEL));
    await requestSeat(db(), { email: "ben_m14@example.test", ipHash: ip(2), now: plus.hours(t0, 1) });
    const [ben] = await db().select().from(waitlist).where(eq(waitlist.email, "ben_m14@example.test"));
    expect(ben?.createdAt.toISOString()).toBe(plus.minutes(t0, 2).toISOString());
    // A member's address: nothing, and no place in line. The answer says "If this address already has an account, just sign in."
    await requestSeat(db(), { email: "mia_m14@example.test", ipHash: ip(3), now: plus.minutes(t0, 3) });
    expect(await outcomeFor("mia_m14@example.test", 0)).toBe("nothing");
    expect(CHECK_YOUR_EMAIL).toContain("If this address already has an account, just sign in.");
    expect(await line()).toEqual(["ben_m14@example.test"]);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): 'Join our.one' was shown while a seat is open and an older address waits — and the newcomer who presses it is put in line, because the line goes first (seats.ts, requestSeat). The route reads only `seatState().open`, not `waiting`; the state arises by the product's own paths (a seat email that failed gives its seat back, and a removal at its owner's request reopens one)", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const rado = await maintainer();
    // Pia waits. A seat opens; its email to her fails, so the seat comes back and she keeps her place.
    await requestSeat(db(), { email: "pia_m14@example.test", ipHash: ip(11), now: plus.days(t0, -2) });
    transportRefuses();
    await openSeats(db(), rado.id, 1, { now: t0 });
    vi.unstubAllEnvs();
    expect(await seatState(db())).toEqual({ open: 1, waiting: 1 });

    // Stan opens the front page: a seat is open, but Pia waits, so it says "Join the waiting list"
    // (it said "Join our.one" on dcff190), and no seat line: a seat is open.
    const page = await renderRoute();
    const label = buttonOf(page);
    expect(label).toBe(WAITING_LIST_LABEL);
    expect(textOf(page)).not.toContain("No seats are open right now.");
    await requestSeat(db(), { email: "stan_m14@example.test", ipHash: ip(12), now: plus.minutes(t0, 1) });

    // What happened: Pia, who waited longest, got the seat; Stan got a place in line.
    expect({ pia: await mailsTo("pia_m14@example.test"), line: await line() }).toEqual({
      pia: 1,
      line: ["stan_m14@example.test"],
    });
    expect(
      await outcomeFor("stan_m14@example.test", 0),
      `the button said "${label}"; the answer then reads: "${CHECK_YOUR_EMAIL}"`,
    ).toBe(promisedBy(label));
  });

  it("accepted (D-0016 §N, after the verification; was DEFECT (LOW)): an address that holds a seat — which the seat email sends back to the front page when its 15-minute link expires — reads 'No seats are open right now' and 'Join the waiting list', and pressing it sends a new link to its seat, not a place in line: better than the words say, and the answer after it says 'If a seat was open, your link is there'; words for holders would be a new decision. M-0014's acceptance: 'The button's words match what the form will do with the address' (the re-check of M-0013 judged the old seat line held on this path; the words are now the button's)", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const rado = await maintainer();
    await openSeats(db(), rado.id, 1, { now: t0 });
    await requestSeat(db(), { email: "lea_m14@example.test", ipHash: ip(21), now: t0 });
    expect(await mailsTo("lea_m14@example.test")).toBe(1);
    // The seat email's own words send her back.
    expect(seatEmail("http://localhost:3000/auth#FICTIONAL").body).toContain("If the link expires, ask again on the front page");

    const page = await renderRoute();
    const label = buttonOf(page);
    expect(label).toBe(WAITING_LIST_LABEL);
    expect(textOf(page)).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    await requestSeat(db(), { email: "lea_m14@example.test", ipHash: ip(21), now: plus.hours(t0, 1) });
    // Accepted: the holder gets a new link to the seat it holds, not the place in line the button names.
    expect(await outcomeFor("lea_m14@example.test", 1), `the button said "${label}"`).toBe("a join link");
    expect(promisedBy(label)).toBe("a place in line");
    expect(CHECK_YOUR_EMAIL).toContain("If a seat was open, your link is there.");
    expect(readRecord("decisions/D-0016.md")).toContain("An address that already holds a seat.");
  });

  it("closed (for a person to judge, D-0016 §B's choice): with the seats unread the button says 'Join our.one' and no seat line shows; with no seat in fact open the form puts the address in line, and the unchanged answer covers both outcomes ('If a seat was open, your link is there. If not, you're in line')", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    await maintainer();
    const unread = render({ joining: true, count: null, seatsOpen: null });
    expect(buttonOf(unread)).toBe(JOIN_LABEL);
    expect(textOf(unread)).not.toContain("No seats are open right now.");
    await requestSeat(db(), { email: "una_m14@example.test", ipHash: ip(31), now: t0 });
    expect(await outcomeFor("una_m14@example.test", 0)).toBe("a place in line");
    expect(CHECK_YOUR_EMAIL).toBe(
      "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.",
    );
  });
});

/* ====================================================================== */
/* 1. The signed card, against /contract, D-0012 and D-0013               */
/* ====================================================================== */

const CARD = `I'll never sell our.one. When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three.`;

describe("the signed card (D-0016 §C), against /contract, D-0012 and D-0013", () => {
  it("closed: it hands over what /contract's promise 2 hands over — the domain, the data and the right to replace the maintainer — to the body it names; no 'it' handed over; no sale is promise 1; and the founder holds today what the card says he holds (AGENTS.md §2, FOUNDING-AUTHORITY.md §4: the domain is the founder's; no members' institution exists)", () => {
    const contract = textOf(rendered(ContractPage));
    const promise = /I hand over (.+?) to (a not-for-profit body of the members), founded by their vote/.exec(contract);
    const card = /I hand over (.+?) to (a not-for-profit body of its members)\./.exec(CARD);
    expect(promise?.[1]).toBe("the domain, the data and the right to replace the maintainer");
    expect(card?.[1]?.replace("its domain, its data", "the domain, the data").replace(/\bme$/, "the maintainer")).toBe(promise?.[1]);
    expect(card?.[2]?.replace("its members", "the members")).toBe(promise?.[2]);
    expect(contract).toContain("Neither our.one nor any part of it will be sold");
    expect(CARD).not.toMatch(/\bhand it\b/);

    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents).toMatch(/AUTHORITY\s+FOUNDER BOOTSTRAP/);
    expect(agents).toMatch(/MEMBER INSTITUTION\s+NOT YET FORMED/);
    const authority = readFileSync(join(REPO_ROOT, "authority/FOUNDING-AUTHORITY.md"), "utf8");
    expect(authority).toMatch(/\| `our\.one` \| founder \| founder's registrar account \|/);
    // D-0013 §A: the maintainer is the founder's company; /contract says "me, Rado, through my company".
    expect(readRecord("decisions/D-0013.md")).toContain("Ctrl AI, Inc., the founder's company, is our.one's maintainer and its data controller.");
    expect(contract).toContain(`Today that is me, ${MAINTAINER}, through my company, Ctrl AI, Inc.`);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): 'Until then, I hold all three.' — D-0016 §C gave /contract as its source, but /contract says the maintainer holds 'the domain, the data and the keys', not the right to replace the maintainer; D-0016 §N now gives the founder's bootstrap authority (AGENTS.md §2, FOUNDING-AUTHORITY.md) as the source for that third thing", () => {
    const d16 = readRecord("decisions/D-0016.md");
    expect(d16).toContain("The contract hands over three things (promise 2, /contract), and says the maintainer holds them until then.");
    const contract = textOf(rendered(ContractPage));
    const held = /Until [\d,]+ members I also hold (.+?), and I'm not paid\./.exec(contract)?.[1] ?? "";
    expect(held).toBe("the domain, the data and the keys");
    const front = textOf(render({ joining: true, count: null, seatsOpen: null }));
    expect(front).toContain("Until then, I hold all three.");
    expect(front).toContain("Today I hold the domain, the data and the keys.");
    // /contract still names the domain, the data and the keys; the record now cites the source for the third thing.
    expect(held.includes("right to replace")).toBe(false);
    expect(d16).toContain(
      "For the right to replace the maintainer, the source is the founder's bootstrap authority (AGENTS.md §2, authority/FOUNDING-AUTHORITY.md): nobody else holds it today.",
    );
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents).toMatch(/AUTHORITY\s+FOUNDER BOOTSTRAP/);
  });
});

/* ====================================================================== */
/* 1 and 2. The handover's trigger, as the card and the status line say it */
/* ====================================================================== */

describe("when the handover comes, as the card and the status line say it", () => {
  beforeEach(async () => {
    await reset();
  });

  it("open (for the founder, D-0016 §N; was DEFECT (MEDIUM)): the status line (new, on every page), the card and the front page's handover promise say 'when 100,000 people have joined'; /contract and D-0012 §B make the trigger the public count — 'accounts that exist and are not suspended', so 'the goalposts can't move' — which people who joined and then deleted their account or were suspended no longer count toward. With churn, 'have joined' reaches the number before the count does: the promise reads earlier than the contract keeps it (the front page's own count says 'people are in', not 'have joined')", async () => {
    const contract = textOf(rendered(ContractPage));
    expect(contract).toContain(`At ${T} members, I hand over`);
    expect(contract).toContain("The count is the number on the front page: accounts that exist and are not suspended.");
    expect(readRecord("decisions/D-0012.md")).toContain("One number triggers the handover: the public count, meaning accounts that exist and are not suspended.");
    expect(STATUS_LINE).toContain(`when ${T} people have joined`);
    expect(CARD).toContain(`When ${T} people have joined`);
    const front = textOf(render({ joining: true, count: 1284, seatsOpen: 5 }));
    expect(front).toContain(`When ${T} people have joined, I hand over our.one's domain`);
    expect(front).toContain("1,284 people are in. You'd be #1,285.");

    // Three FICTIONAL people join. One deletes her account; one is suspended.
    const ida = await makeAccount({ handle: "ida_m14", email: "ida_m14@example.test" });
    await makeAccount({ handle: "ole_m14", email: "ole_m14@example.test", suspended: true });
    await makeAccount({ handle: "kim_m14", email: "kim_m14@example.test" });
    await deleteAccount(db(), ida.id, "ida_m14");
    const peopleWhoHaveJoined = 3;
    const theCount = await memberCount(db());
    expect(theCount).toBe(1);

    // What each sentence counts toward the threshold: still apart, until the founder chooses the words.
    expect(
      { statusLine: peopleWhoHaveJoined, card: peopleWhoHaveJoined, handoverPromise: peopleWhoHaveJoined, contract: theCount },
      "the status line, the card and the handover promise count people who have joined; the contract counts accounts that exist and are not suspended",
    ).toEqual({ statusLine: 3, card: 3, handoverPromise: 3, contract: 1 });
    // Recorded as the founder's decision, with the words proposed: the count's own.
    const d16 = readRecord("decisions/D-0016.md");
    expect(d16).toContain("The trigger's words.");
    expect(d16).toContain('The agent proposes "when [threshold] people are in", the words of the count on the same page.');
  });
});

/* ====================================================================== */
/* 1. The reason                                                          */
/* ====================================================================== */

describe("the reason (D-0016 §E)", () => {
  it("closed: it claims no present say, no ownership and no members: 'should have a say' is a value, not a right the page grants; its purpose, 'a network whose people choose who looks after it', is the handover's third thing (the right to replace whoever runs it) and the body 'founded by their vote'; nothing in it is caught by the scan", () => {
    const reason = `${REASON_LEAD} ${REASON}`;
    expect(reason).toBe(
      "The people make the network. You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.",
    );
    expect(scanText(reason)).toEqual([]);
    expect(reason).not.toMatch(/\b(?:you|members|they) (?:have|has|get|hold) (?:a|the) say\b|\bmembers?\b|\bown|\bvote\b|\bdecide/i);
    expect(reason).toContain("you should have a say");
    const front = textOf(render({ joining: true, count: 12, seatsOpen: 5 }));
    expect(front).toContain("the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.");
    // D-0016 §E records the agent's interpretation, and what it left out.
    expect(readRecord("decisions/D-0016.md")).toContain('It left out the review\'s heading, "They should have the final say".');
  });
});

/* ====================================================================== */
/* 1. WhatsApp in 2025, against Meta's announcement                       */
/* ====================================================================== */

/**
 * Meta's announcement, read once on 1 October 2026: GET
 * https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/
 * answered 200; the HTML's sha256 is
 * a323ea2fded041a563165fefc50e758299db32e5814eb5a062d5b9ba7a60d9d0;
 * article:published_time 2025-06-16T13:00:30+00:00.
 *
 * In this verifier's words: it introduces three things in WhatsApp's
 * Updates tab — channel subscriptions, promoted channels, and ads in
 * Status; all three stay in the Updates tab, away from personal chats; and
 * they roll out slowly over the next several months. Quoted once:
 * "Subscriptions, promotions and ads will appear only on the Updates tab".
 */
const META_2025 = {
  url: "https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/",
  published: "2025-06-16",
  says: ["announced (introduced), not yet everywhere: rolled out over months", "ads in Status", "only on the Updates tab"],
} as const;

describe("WhatsApp in 2025 (D-0016 §F)", () => {
  it("closed: 'WhatsApp announced ads in Status, in its Updates tab.' says no more than Meta's announcement of 16 June 2025, which it links in a new tab: an announcement (not that ads came), in Status, in the Updates tab; D-0016 §F's account of the source matches the page as read", () => {
    const html = render({ joining: true, count: null, seatsOpen: null });
    const story = html.slice(html.indexOf("WhatsApp, in three dates"), html.indexOf("</ol>", html.indexOf("WhatsApp, in three dates")));
    const line = [...story.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]!).find((li) => li.includes(">2025<"));
    expect(textOf(line ?? "")).toBe("2025 WhatsApp announced ads in Status, in its Updates tab.");
    expect(line).toMatch(new RegExp(`<a href="${META_2025.url.replace(/[.?]/g, "\\$&")}" rel="noopener noreferrer" target="_blank">`));
    expect(META_2025.published.startsWith("2025")).toBe(true);
    // Each claim the line makes, and what the source says.
    expect(textOf(line ?? "")).not.toMatch(/came|launched|everywhere|chats/);
    expect(META_2025.says.join(" ")).toMatch(/announced[\s\S]*ads in Status[\s\S]*Updates tab/);
    expect(readRecord("decisions/D-0016.md")).toContain(
      "The announcement keeps those ads in the Updates tab, away from personal chats, and rolls them out over months.",
    );
  });
});

/* ====================================================================== */
/* 1. Download and delete, against export.ts, /settings and promise 4     */
/* ====================================================================== */

const SETTINGS_SENTENCE = "In Settings, you can download your profile, posts, replies and connections, and delete it all.";
const NEVER_ANSWER =
  "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.";

describe("'In Settings, you can download your profile, posts, replies and connections, and delete it all.' (D-0016 §G, §H)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: for an active account it holds — /settings links the download and the deletion; the export holds the profile, the posts, the replies and the connections (friends, following, followers); deleting removes all of them; the words are promise 4's", async () => {
    const now = at("2026-10-01T12:00:00Z");
    const eva = await makeAccount({ handle: "eva_m14", email: "eva_m14@example.test", acceptsFollowers: true });
    const finn = await makeAccount({ handle: "finn_m14", email: "finn_m14@example.test", acceptsFollowers: true });
    const gil = await makeAccount({ handle: "gil_m14", email: "gil_m14@example.test", acceptsFollowers: true });
    await befriend(eva, finn);
    await follow(eva, gil);
    await follow(gil, eva);
    await post(eva, { body: "FICTIONAL Eva's post", at: plus.hours(now, -2) });
    const finnsPost = await post(finn, { body: "FICTIONAL Finn's post", at: plus.hours(now, -1) });
    await createReply(db(), eva.id, finnsPost.id, { body: "FICTIONAL Eva's reply", now });

    const data = await exportAccount(db(), eva.id, now);
    expect({
      profile: [data.account.handle, data.account.display_name, data.account.bio].every(Boolean),
      posts: data.posts.map((p) => p.body),
      replies: data.replies.map((r) => r.body),
      friends: data.friends.map((p) => p.handle),
      following: data.following.map((p) => p.handle),
      followers: data.followers.map((p) => p.handle),
    }).toEqual({
      profile: true,
      posts: ["FICTIONAL Eva's post"],
      replies: ["FICTIONAL Eva's reply"],
      friends: ["finn_m14"],
      following: ["gil_m14"],
      followers: ["gil_m14"],
    });

    await deleteAccount(db(), eva.id, "eva_m14");
    const left = {
      account: (await db().select().from(accounts).where(eq(accounts.id, eva.id))).length,
      posts: (await db().select().from(posts).where(eq(posts.authorId, eva.id))).length,
      replies: (await db().select().from(replies).where(eq(replies.authorId, eva.id))).length,
      friendships: (await db().select().from(friendships).where(or(eq(friendships.aId, eva.id), eq(friendships.bId, eva.id)))).length,
      follows: (await db().select().from(follows).where(or(eq(follows.followerId, eva.id), eq(follows.followeeId, eva.id)))).length,
    };
    expect(left).toEqual({ account: 0, posts: 0, replies: 0, friendships: 0, follows: 0 });

    const settings = readFileSync(join(WEB_ROOT, "src/app/(app)/settings/page.tsx"), "utf8");
    expect(settings).toContain('href: "/settings/export"');
    expect(settings).toContain('href: "/settings/delete"');
    expect(textOf(rendered(ContractPage))).toContain(
      "download your profile, posts, replies and connections, and delete it all, whenever you want.",
    );
    const front = textOf(render({ joining: false, count: null, seatsOpen: null }));
    expect(front).toContain(SETTINGS_SENTENCE);
    expect(front).toContain(NEVER_ANSWER);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): untrue for a suspended account: it cannot reach Settings (no session for it; requireViewer redirects to /signin), and the export and the deletion both refuse it (NOT_FOUND). Promise 4 on /contract carries the exception — 'If your account is suspended, write to us and we will do it for you.' — and the front page's two sentences drop it", async () => {
    const sam = await makeAccount({ handle: "sam_m14", email: "sam_m14@example.test", suspended: true });
    const refusal = async (attempt: () => Promise<unknown>) => {
      try {
        await attempt();
        return "OK";
      } catch (error) {
        return isCoreError(error) ? error.code : String(error);
      }
    };
    const download = await refusal(() => exportAccount(db(), sam.id));
    const remove = await refusal(() => deleteAccount(db(), sam.id, "sam_m14"));
    expect({ download, remove }).toEqual({ download: "NOT_FOUND", remove: "NOT_FOUND" });
    const contract = textOf(rendered(ContractPage));
    expect(contract).toContain("If your account is suspended, write to us and we will do it for you.");

    const front = textOf(render({ joining: true, count: null, seatsOpen: null }));
    const theTwo = [SETTINGS_SENTENCE, NEVER_ANSWER].filter((s) => front.includes(s));
    expect(theTwo).toHaveLength(2);
    const trueForEveryAccount = download === "OK" && remove === "OK";
    const saysTheException = /suspended|write to us/i.test(front);
    expect(
      trueForEveryAccount || saysTheException,
      `a suspended account: download ${download}, delete ${remove}; the front page says "${SETTINGS_SENTENCE}" and names no exception`,
    ).toBe(true);
  });
});

/* ====================================================================== */
/* 1. The present state                                                   */
/* ====================================================================== */

describe("the present state (D-0016 §G)", () => {
  it("closed: 'Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.' — /contract's own words for what the maintainer holds until the threshold, AGENTS.md §2's 'NOT YET FORMED' and 'NOT EXECUTED', and D-0012 §B's holding; the done-rule does not fire on its denial", () => {
    const present = "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.";
    for (const state of STATES) expect(textOf(render(state)), JSON.stringify(state)).toContain(present);
    expect(textOf(rendered(ContractPage))).toContain(`Until ${T} members I also hold the domain, the data and the keys`);
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents).toMatch(/MEMBER INSTITUTION\s+NOT YET FORMED/);
    expect(agents).toMatch(/TRANSFER PLAN\s+DRAFTED \/ NOT EXECUTED/);
    expect(readRecord("decisions/D-0012.md")).toContain("Before the threshold, the maintainer holds the domain, the database and the registrar and deploy keys");
    expect(scanText(present, ANOTHER_PAGE)).toEqual([]);
    expect(scanText("The members' body has been formed, and the handover has happened.", ANOTHER_PAGE).length).toBeGreaterThan(0);
  });
});

/* ====================================================================== */
/* 1. The friends answer and the close                                    */
/* ====================================================================== */

describe("the friends answer and the close (D-0016 §B, §H)", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("closed: someone who joins through a seat can at once invite, post and be replied to ('invite them, post something, and give them a reason to reply'; 'Join, then send them an invite.'); the close shows only with the form, with the form's label. For a person to judge: beside 'Join the waiting list' the close still reads 'Join, then send them an invite.', and a waiting address has no account and no invites", async () => {
    const t0 = at("2026-10-01T09:00:00Z");
    const rado = await maintainer();
    await openSeats(db(), rado.id, 1, { now: t0 });
    await requestSeat(db(), { email: "gus_m14@example.test", ipHash: ip(41), now: t0 });
    const mail = await latestOutbox(db(), "gus_m14@example.test", "join");
    const opened = await openEmailLink(db(), { token: tokenFromLink(mail!.body)!, now: plus.minutes(t0, 1) });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
    const gus = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "FICTIONAL Gus",
      handle: "gus_m14",
      adultConfirmed: true,
      now: plus.minutes(t0, 2),
    });
    const [account] = await db().select().from(accounts).where(eq(accounts.id, gus.accountId));
    expect(account?.invitesRemaining).toBe(DEFAULT_INVITES);
    const invite = await createInvite(db(), gus.accountId, { now: plus.minutes(t0, 3) });
    expect(invite.code.length).toBeGreaterThan(0);
    // His friend replies to what he posts.
    const hal = await makeAccount({ handle: "hal_m14", email: "hal_m14@example.test" });
    await befriend(gus.accountId, hal);
    const hisPost = await post(gus.accountId, { body: "FICTIONAL Gus's first post", at: plus.minutes(t0, 4) });
    await createReply(db(), hal.id, hisPost.id, { body: "FICTIONAL reply", now: plus.minutes(t0, 5) });

    for (const state of STATES) {
      const html = render(state);
      const close = textOf(html.slice(html.indexOf('id="front-close"') - 4)).slice(0, 200);
      expect(html.includes('id="front-close"'), JSON.stringify(state)).toBe(state.joining);
      if (state.joining) {
        const label = state.seatsOpen === 0 ? WAITING_LIST_LABEL : JOIN_LABEL;
        expect(close.startsWith(`${CLOSE_HEADING} ${CLOSE_LINE} ${label}`), JSON.stringify(state)).toBe(true);
      }
    }
    // A waiting address has no account, so no invites.
    await requestSeat(db(), { email: "wes_m14@example.test", ipHash: ip(42), now: plus.minutes(t0, 6) });
    expect(await line()).toEqual(["wes_m14@example.test"]);
    expect(await db().select().from(accounts).where(eq(accounts.email, "wes_m14@example.test"))).toEqual([]);
  });
});

/* ====================================================================== */
/* 2. The status line, wherever it renders                                */
/* ====================================================================== */

describe("the status line (D-0016 §J), wherever it renders", () => {
  it("closed: D-0016 §J's words, with the threshold from its constant, in the public footer, the in-app footer, the right column, the public layout, the lede of /power, /costs and /rules; no page says 'Handed to its members'; it names the card's and the contract's three things and recipient, and says 'Promised:'", () => {
    expect(readRecord("decisions/D-0016.md")).toContain(`"${withPlaceholders(STATUS_LINE)}"`);
    const places: [string, string][] = [
      ["the public footer", rendered(SiteFooter)],
      ["the in-app footer", rendered(InAppSiteFooter)],
      ["the right column", renderToStaticMarkup(createElement(RightColumn, { invitesRemaining: 3 }))],
      ["the public layout", renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"))],
      ["/power", rendered(PowerPage)],
      ["/costs", rendered(CostsPage)],
      ["/rules", rendered(RulesPage)],
    ];
    for (const [where, html] of places) {
      expect(textOf(html), where).toContain(STATUS_LINE);
      expect(textOf(html), where).not.toMatch(/Handed to its members/i);
    }
    const power = rendered(PowerPage);
    expect(power).toContain(`<p class="lede">${STATUS_LINE}</p>`);
    // The page itself, without the layout's footer: once each.
    for (const page of ["/costs", "/rules"]) {
      const html = places.find(([where]) => where === page)![1];
      expect(textOf(html).split(STATUS_LINE).length - 1, page).toBe(1);
    }
    const objects = /its domain, its data and the right to replace the maintainer go to (a not-for-profit body of its members)\./.exec(STATUS_LINE);
    expect(objects?.[1]).toBe("a not-for-profit body of its members");
    expect(STATUS_LINE.startsWith("Maintained by its founder. Promised: ")).toBe(true);
    expect(CARD).toContain("its domain, its data and the right to replace me to a not-for-profit body of its members");
  });
});

/* ====================================================================== */
/* 3. The invite page                                                     */
/* ====================================================================== */

describe("the invite page, signed out (D-0016 §I)", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  async function invitePageFor(code: string): Promise<string> {
    return renderToStaticMarkup((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement);
  }

  it("closed: joining closed — the pitch is the front page's lede, and neither 'Free to join.' nor the link; joining open — the lede, the unchanged form, 'Free to join.' with 'The promise behind our.one' → /#front-runs, which is the section on who runs it; joining costs nothing anywhere in the flow (no payment field in either join form)", async () => {
    const anna = await makeAccount({ handle: "anna_m14", displayName: "Anna FICTIONAL", email: "anna_m14@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    const heading = "Anna FICTIONAL (@anna_m14) invited you to connect on our.one";

    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const closed = textOf(await invitePageFor(code));
    vi.unstubAllEnvs();
    expect(closed).toContain(heading);
    expect(closed).toContain(LEDE);
    expect(closed).toContain("our.one isn't open for new accounts yet.");
    expect(closed).not.toContain("Free to join.");
    expect(closed).not.toContain("The promise behind our.one");

    const html = await invitePageFor(code);
    const open = textOf(html);
    expect(open).toContain(`${heading} ${LEDE} Your email We'll email you a link to join. Send me a link Free to join. The promise behind our.one Already on our.one? Sign in, then open this link again.`);
    // The card's link style since D-0016 §N (it was the shared .link on dcff190).
    expect(html).toMatch(/<a class="[^"]*pledgeLink[^"]*" href="\/#front-runs">The promise behind our\.one<\/a>|<a href="\/#front-runs" class="[^"]*pledgeLink[^"]*">The promise behind our\.one<\/a>/);
    expect(render({ joining: true, count: null, seatsOpen: null })).toContain('<h2 id="front-runs">Keep your people. Change who runs it.</h2>');
    for (const form of [renderToStaticMarkup(createElement(JoinRequestForm, { code })), rendered(JoinForm)]) {
      expect(textOf(form)).not.toMatch(/\b(?:pay|payment|price|card|subscription|fee)\b|€|\$/i);
    }
    expect(textOf(render({ joining: true, count: null, seatsOpen: null }))).toContain("Is it free? Yes.");
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): in production with a data controller named but no client-address header (CLIENT_IP_HEADER), the invite page still says 'Free to join.' with the promise link, under a form that refuses ('This server can't send join links yet…'), while the front page says 'Joining opens soon.'. D-0016 §I and SPEC §18.16 item 7 say 'While the visitor can join'; the code shows it whenever `inviteForViewer` says can_join, which reads only the controller", async () => {
    const anna = await makeAccount({ handle: "anna_m14", displayName: "Anna FICTIONAL", email: "anna_m14@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    const invite = textOf(await invitePageFor(code));
    const front = textOf(await renderRoute());
    let asking = "OK";
    try {
      await requestJoin(db(), { code, email: "nia_m14@example.test", ipHash: ip(51) });
    } catch (error) {
      asking = isCoreError(error) ? `${error.code}: ${error.message}` : String(error);
    }
    expect(asking).toBe(`CLOSED: ${JOIN_REQUESTS_OFF}`);
    expect(front).toContain("Joining opens soon. Have an invite? It can't be used until joining opens.");
    const visitorCanJoin = asking === "OK";
    expect(
      invite.includes("Free to join. The promise behind our.one"),
      `the invite page says "Free to join." beside a form that answers "${asking}"; the front page says "Joining opens soon."`,
    ).toBe(visitorCanJoin);
  });

  it("closed: accepting an invite does what it did — the two become friends and the invite is used; no follow, no seat, no invites given", async () => {
    const now = at("2026-10-01T12:00:00Z");
    const anna = await makeAccount({ handle: "anna_m14", email: "anna_m14@example.test", acceptsFollowers: true });
    const bo = await makeAccount({ handle: "bo_m14", email: "bo_m14@example.test", acceptsFollowers: true });
    const invite = await createInvite(db(), anna.id, { now });
    expect(await applyInviteAsExisting(db(), { accountId: bo.id, inviteId: invite.id, now })).toEqual({ status: "friends" });
    const [aId, bId] = [anna.id, bo.id].sort();
    expect(await db().select().from(friendships).where(and(eq(friendships.aId, aId!), eq(friendships.bId, bId!)))).toHaveLength(1);
    expect(await db().select().from(follows)).toEqual([]);
    const [used] = await db().select().from(invites).where(eq(invites.id, invite.id));
    expect(used?.usedBy).toBe(bo.id);
    const [boAfter] = await db().select().from(accounts).where(eq(accounts.id, bo.id));
    expect(boAfter?.invitesRemaining).toBe(bo.invitesRemaining);
  });
});

/* ====================================================================== */
/* 4. The claims scan                                                     */
/* ====================================================================== */

describe("the claims scan (D-0016 §K)", () => {
  it("closed: `everywhere` is gone — every entry is file, sentence and reason, and passes only in its file; the card's sentence is listed as written and as rendered, for FrontPage.tsx only, and the old card sentence is not; the status line passes in every file with nothing listed for it; 'Handed to its members' is caught in every file and with none", () => {
    for (const entry of ALLOWLIST) {
      expect(Object.keys(entry).sort(), entry.sentence).toEqual(["file", "reason", "sentence"]);
      expect(scanText(entry.sentence, entry.file), entry.sentence).toEqual([]);
      for (const other of [null, ANOTHER_PAGE, INVITE_PAGE, "src/components/RightColumn.tsx", "src/core/mail-templates.ts"]) {
        if (other === entry.file) continue;
        expect(scanText(entry.sentence, other).length, `${String(other)}: ${entry.sentence}`).toBeGreaterThan(0);
      }
    }
    const card = `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`;
    const listed = ALLOWLIST.filter((entry) => entry.file === FRONT).map((entry) => entry.sentence);
    expect(listed).toContain(card);
    expect(listed).toContain(card.replace(T, "{THRESHOLD}"));
    expect(ALLOWLIST.filter((entry) => /I hand it to|and they can replace me/.test(entry.sentence))).toEqual([]);
    expect(scanText(readFileSync(join(WEB_ROOT, FRONT), "utf8"), FRONT)).toEqual([]);

    for (const file of [null, ANOTHER_PAGE, INVITE_PAGE, FRONT, "src/components/RightColumn.tsx", "src/app/(public)/power/page.tsx"]) {
      expect(scanText(STATUS_LINE, file), String(file)).toEqual([]);
      expect(scanText(`Maintained by its founder. Handed to its members at ${T}.`, file).length, String(file)).toBeGreaterThan(0);
    }
    expect(ALLOWLIST.filter((entry) => entry.file === "src/components/RightColumn.tsx")).toEqual([]);
  });

  it("closed: SPEC §18.16 — 'None of the new sentences above is caught by a rule, except the card's': each sentence D-0016 adds or changes passes the scan on any page, and the card's handover sentence is caught off the front page", () => {
    const added = [
      LEDE,
      JOIN_LABEL,
      WAITING_LIST_LABEL,
      "No seats are open right now. Seats go to whoever has waited longest.",
      "I'll never sell our.one.",
      "Until then, I hold all three.",
      REASON_LEAD,
      REASON,
      "WhatsApp announced ads in Status, in its Updates tab.",
      `The rest can change only with ${NOTICE_DAYS} days' notice. ${SETTINGS_SENTENCE}`,
      "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
      "At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
      NEVER_ANSWER.replace("Then nothing is handed over. ", ""),
      CLOSE_HEADING,
      CLOSE_LINE,
      "Free to join.",
      "The promise behind our.one",
      STATUS_LINE,
    ];
    for (const sentence of added) expect(scanText(sentence, ANOTHER_PAGE), sentence).toEqual([]);
    const card = `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`;
    expect(scanText(card, ANOTHER_PAGE).length).toBeGreaterThan(0);
    expect(scanText(card, FRONT)).toEqual([]);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): D-0016 §K catches 'Handed to its members' again, but the status line's own verb had no rule: its done forms, the same line with another verb, and 'Maintained by its members.' all pass on every page. The scan is CHECKED, not ENFORCED; no page says these today, and contract.test.ts's handoverTold, which guards 'no page says the handover has happened', has no pattern for them either", () => {
    // What D-0016 §K closed, for contrast.
    for (const caught of [`Handed to its members at ${T}.`, "It was handed to its members.", "The handover has happened."]) {
      expect(scanText(caught, ANOTHER_PAGE).length, caught).toBeGreaterThan(0);
    }
    const toldAsDone = [
      // The new line's verb, done.
      "Its domain, its data and the right to replace the maintainer went to a not-for-profit body of its members.",
      "Its domain, its data and the right to replace the maintainer have gone to a not-for-profit body of its members.",
      // The old line's shape, with another verb.
      `Given to its members at ${T}.`,
      `Passed to its members at ${T}.`,
      `Transferred to its members at ${T}.`,
      // The status line's first sentence, with the members in it.
      "Maintained by its members.",
      // The present state, told as done.
      "The members' body has been formed.",
      "Its members now hold the domain, the data and the right to replace the maintainer.",
      "The handover is over.",
    ];
    expect(
      toldAsDone.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0),
      "told as done, and let through on any page",
    ).toEqual([]);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (MEDIUM)): D-0016 prohibits 'Any sentence about the handover that is not listed by exact text, here or in the claims scan's list', and M-0014 repeats it; three on the front page were listed in neither — 'A maintainer does the job, or is replaced.' (in D-0015 §F and the SPEC), 'Two of its promises can never be changed: no sale, and the handover.' and 'Today that's me, and today I also hold everything.' (in the SPEC only). FrontPage.tsx's header, rewritten by this build, says every one is 'listed by exact text in D-0016'", () => {
    const d16 = readRecord("decisions/D-0016.md");
    const d15 = readRecord("decisions/D-0015.md");
    const spec = readRecord("apps/web/SPEC.md");
    const source = readFileSync(join(WEB_ROOT, FRONT), "utf8").replace(/\s*\*\s*/g, " ");
    // The header now says where each is listed (it said "in D-0016" for all of them on dcff190).
    expect(source).toContain(
      "Every sentence about the handover is in this file, listed by exact text in D-0016 or in the claims scan's ALLOWLIST (src/core/claims.ts), which holds every one its rules catch (D-0016 §N).",
    );
    const seen = new Set<string>();
    for (const state of [STATES[0]!, STATES[5]!, STATES[13]!, STATES[22]!]) {
      for (const sentence of sentencesOf(render(state))) if (aboutTheHandover(sentence)) seen.add(sentence);
    }
    for (const sentence of sentencesOf(rendered(SiteFooter))) if (aboutTheHandover(sentence)) seen.add(sentence);
    const unlisted = [...seen].filter((sentence) => !listed(sentence, d16));
    expect(
      unlisted.map((sentence) => `${sentence} [D-0015: ${d15.includes(withPlaceholders(sentence))}; SPEC: ${spec.includes(sentence) || spec.includes(withPlaceholders(sentence))}]`),
      `of ${seen.size} sentences about the handover on the front page and in its footer`,
    ).toEqual([]);
  });

  it("fixed (D-0016 §N, after the verification; was DEFECT (LOW)): the same on /contract, which M-0014 did not change: five sentences about the handover are listed neither in D-0016 nor in the scan's list (they are the SPEC's, §18.3 as later amended) — the maintainer's holding until the threshold, promise 8's lock on promise 2, the never-reached heading and its answer, and the closing paragraph", () => {
    const d16 = readRecord("decisions/D-0016.md");
    const seen = sentencesOf(rendered(ContractPage)).filter(aboutTheHandover);
    const unlisted = seen.filter((sentence) => !listed(sentence, d16));
    expect(unlisted, `of ${seen.length} sentences about the handover on /contract`).toEqual([]);
  });
});

/** A sentence about the handover: its verb, its threshold, its body, its third thing, or what is held until then. */
function aboutTheHandover(sentence: string): boolean {
  return new RegExp(
    String.raw`\bhand(?:s|ed|ing)?\b|\bhandover\b|${T}|\bmembers' body\b|\bbody of (?:its|the) members\b|\breplace(?:d)?\b|\bwho runs it\b|\bwho looks after it\b|\bI (?:also )?hold\b|\bPromises? [12]\b`,
    "i",
  ).test(sentence);
}

/** Listed by exact text in D-0016, or in the claims scan's list (as rendered). */
function listed(sentence: string, d16: string): boolean {
  return d16.includes(withPlaceholders(sentence)) || ALLOWLIST.some((entry) => entry.sentence === sentence);
}

/* ====================================================================== */
/* 5. The records against the page                                        */
/* ====================================================================== */

describe("the records against the page, word for word (D-0016; SPEC §18.16)", () => {
  beforeEach(async () => {
    await reset();
  });

  it("closed: every sentence D-0016 changes or adds is word for word in D-0016, in SPEC §18.16 and on the rendered page (the front page in its states, the invite page, the footer)", async () => {
    const d16 = readRecord("decisions/D-0016.md");
    const spec = spec1816();
    const open = textOf(render({ joining: true, count: 12, seatsOpen: 5 }));
    const none = textOf(render({ joining: true, count: 12, seatsOpen: 0 }));
    const anna = await makeAccount({ handle: "anna_m14", displayName: "Anna FICTIONAL", email: "anna_m14@example.test" });
    const { code } = await createInvite(db(), anna.id, {});
    const invite = textOf(renderToStaticMarkup((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement));
    const footer = textOf(rendered(SiteFooter));

    const sentences: [string, string][] = [
      [LEDE, open],
      ["Join our.one", open],
      ["Join the waiting list", none],
      ["No seats are open right now. Seats go to whoever has waited longest.", none],
      ["Who would you like to hear from?", open],
      ["Join, then send them an invite.", open],
      [CARD, open],
      [`${MAINTAINER}, maintainer`, open],
      ["Keep your people. Change who runs it.", open],
      ["The people make the network.", open],
      [REASON, open],
      ["WhatsApp announced ads in Status, in its Updates tab.", open],
      [`The rest can change only with ${NOTICE_DAYS} days' notice. ${SETTINGS_SENTENCE}`, open],
      // Added by D-0016 §N after the verification.
      ["If your account is suspended, write to us and we will do it for you.", open],
      ["Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.", open],
      [
        "At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
        open,
      ],
      [NEVER_ANSWER, open],
      ["Free to join.", invite],
      ["The promise behind our.one", invite],
      [LEDE, invite],
      [STATUS_LINE, footer],
    ];
    const mismatches: string[] = [];
    for (const [sentence, page] of sentences) {
      const recorded = withPlaceholders(sentence);
      if (!d16.includes(recorded)) mismatches.push(`D-0016: ${recorded}`);
      if (!spec.includes(recorded)) mismatches.push(`SPEC §18.16: ${recorded}`);
      if (!page.includes(sentence)) mismatches.push(`page: ${sentence}`);
    }
    expect(mismatches).toEqual([]);
    expect(open).toContain(`${MAINTAINER}, maintainer · How that works`);
    expect(d16).toContain("[maintainer], maintainer · How that works");
  });
});

/* ====================================================================== */
/* 6. The adapted tests                                                   */
/* ====================================================================== */

describe("the tests the build changed (git diff bfd587b..dcff190 -- apps/web/tests/)", () => {
  it("closed: each changed assertion kept its strength — whole texts still compared with toBe or toEqual (the card, the close, the 'Keep your people' section, the questions, the steps, the whole page in M-0013's six states); the accepted gap turned into a passing check, not deleted; the status-line exception removed from contract.test's handoverTold, and the old line added to what it must catch; no `everywhere` left; the 2025 source compared against the rendered links; the footer's handover sentence still checked against an exact listing (now D-0016's)", () => {
    const read = (file: string) => readFileSync(join(WEB_ROOT, "tests", file), "utf8").replace(/\s+/g, " ");
    const front = read("front-page.test.ts");
    expect(front).toContain("expect(textOf(signed)).toBe( `R I'll never sell our.one. When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three. Rado, maintainer · How that works`, );");
    expect(front).toContain('expect(textOf(close)).toBe("Who would you like to hear from? Join, then send them an invite. Join our.one");');
    expect(front).toContain("// The whole section, word for word: nothing added. expect(text).toBe(");
    expect(front).toContain("expect(pairs).toEqual([");
    expect(front).toContain("expect(steps).toEqual([");
    expect(read("verify-m0013-honesty.test.ts")).toContain("expect(textOf(render(state)), JSON.stringify(state)).toBe(specText(state));");
    expect(read("verify-m0013-honesty.test.ts")).toContain(
      "expect(scanText(`It was Handed to its members at ${T}.`, ANOTHER_PAGE).length).toBeGreaterThan(0);",
    );
    const contract = read("contract.test.ts");
    expect(contract).not.toContain("if (sentence === `Handed to its members at ${THRESHOLD}.`) continue;");
    // The old line is in the list handoverTold must catch. (On dcff190 it was the list's last item; the
    // fixes after the verification added the done-forms after it, so the check reads the whole list.)
    const mustCatch = contract.slice(
      contract.indexOf('it("the check catches the handover told as done"'),
      contract.indexOf("]) { expect(handoverTold(claim), claim).not.toEqual([]);"),
    );
    expect(mustCatch).toContain("`Maintained by its founder. Handed to its members at ${THRESHOLD}.`,");
    expect(read("claims.test.ts")).not.toMatch(/\beverywhere\b/);
    expect(read("verify5-recheck.test.ts")).not.toMatch(/\.everywhere\b/);
    expect(read("verify4-honesty.test.ts")).toContain("expect(links.filter((href) => href !== OPEN_CODE_URL)).toEqual(sources);");
    expect(read("verify5-recheck.test.ts")).toContain('expect(sentences).toEqual([]);');
    expect(read("verify5-recheck.test.ts")).toContain("expect(d16).toContain(");
    expect(read("verify-m0013-recheck.test.ts")).toContain('"Leave your address to join the line.",');
  });
});
