/**
 * Independent verification of M-0013 (the front page, product first), the
 * honesty lens: every sentence the page renders, its sources, the claims
 * scan, and the six test files the build changed. Written by an agent that
 * did not build it, against 24a683f.
 *
 * Stopping rule, declared before the first test was written: every state
 * the brief names (joining open and closed; the count null, 0, 1 and N;
 * seats 0, open and unreadable) is rendered and read sentence by sentence
 * against /contract, D-0012, D-0015, /privacy, /rules and the code; the
 * 7% source is read once; every handover form in the brief is tried
 * against the scan; each changed test file is diffed against 4ca7b86. Each
 * try ends here, as a failing "DEFECT (SEVERITY): …" test or a passing
 * "closed: …" test, or, for what a test cannot read (the court's PDF over
 * the network), in the verification report.
 *
 * - "DEFECT (SEVERITY): …" asserts what should be true. It FAILS on
 *   24a683f, and the failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Nothing in the product, the records or another test is changed by this
 * file. Everyone here is FICTIONAL, with an example.test address; client
 * addresses are keyed hashes of the documentation ranges (RFC 5737).
 *
 * After the round (the architect, SPEC §18.15 "Decisions after the
 * verification"): each DEFECT was fixed and renamed "fixed (…)", its
 * assertion kept or pointed at the fixed words, or recorded as "accepted:"
 * with the reason. `specText` follows the fixed copy.
 *
 * Under M-0014 (D-0016, SPEC §18.16) the architect pointed `specText` and
 * the tests that quote the page at the new words, in the new order (the
 * picture before the card). Each test keeps what it proved. The accepted
 * gap, "It was Handed to its members", is fixed: the status line no longer
 * needs a listing, and nothing is let through on every page.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq, getTableColumns } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import ContractPage from "@/app/(public)/contract/page";
import { JoinForm } from "@/app/(public)/join/JoinForm";
import FrontPageRoute from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import manifest from "@/app/manifest";
import { FRIENDS_SOURCE, FrontPage, type FrontPageProps } from "@/components/public/FrontPage";
import { MAINTAINER, NOTICE_DAYS } from "@/components/public/handover";
import { STATUS_LINE } from "@/components/RightColumn";
import { NEED_HINT, NEED_LABEL } from "@/components/public/door";
import { ALLOWLIST, scanText } from "@/core/claims";
import { DEFAULT_INVITES, HANDOVER_THRESHOLD } from "@/core/config";
import { isCoreError } from "@/core/errors";
import { createInvite, inviteForViewer, requestJoin } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { accounts, outbox, posts, waitlist } from "@/core/schema";
import { openSeats, requestSeat } from "@/core/seats";
import { at, db, makeAccount, plus, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");
const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
const FRONT = "src/components/public/FrontPage.tsx";
/** A public page in the scan's reach that no rendered check renders (claims.test.ts, contract.test.ts). */
const ANOTHER_PAGE = "src/app/(public)/signin/page.tsx";

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

async function renderRoute(): Promise<string> {
  return renderToStaticMarkup((await FrontPageRoute()) as ReactElement);
}

/** The states the brief names: joining open and closed; the count null, 0, 1 and N; seats 0, open, unreadable. */
const STATES: FrontPageProps[] = [
  { joining: true, count: null, seatsOpen: null },
  { joining: true, count: 0, seatsOpen: 0 },
  { joining: true, count: 1, seatsOpen: 3 },
  { joining: true, count: 1284, seatsOpen: 0 },
  { joining: false, count: 12, seatsOpen: null },
  { joining: false, count: null, seatsOpen: null },
];

/** The count's forms (SPEC §18.2 item 3), written out, not taken from countLine. */
const COUNT_LINES: Record<string, string> = {
  "0": "Nobody is in yet. You'd be #1.",
  "1": "1 person is in. You'd be #2.",
  "12": "12 people are in. You'd be #13.",
  "1284": "1,284 people are in. You'd be #1,285.",
};

/**
 * SPEC §18.15's copy, as §18.16 amends it, for one state, in its order, as
 * a reader sees it. The phone's posts are FeedPreview's (§18.15 names them,
 * §18.13 does not write them); the rest is the specification's, word for
 * word.
 */
function specText({ joining, count, seatsOpen }: FrontPageProps): string {
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
          `Free to join. You get ${DEFAULT_INVITES} invites to bring your people.`,
          "We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.",
        ]
      : ["Joining opens soon.", "Have an invite? It can't be used until joining opens."]),
    // Changed after the verification of M-0020 (H2): the phone shows the app as it is: the header (the wordmark, its dot a span of its own, and the four places), then the feed's own bar.
    "our. one",
    "The idea Projects Build with us In the open",
    "Feed",
    "M Mara @mara · 2h Made it to the top before the rain. Legs are gone. Worth it. 2",
    "T Tomas @tomas · 5h Soup's on tonight. Door's open from 7, bring whoever. 4",
    "J Jana @jana · 1d Finished the book you lent me. The last chapter. Wow. 1",
    "You're caught up You've seen everything from before your last visit, 2 days ago.",
    "P Pavel @pavel · 3d Anyone up for a slow run on Saturday? I'll bring coffee. 3",
    "That's everything from the last 14 days.",
    "An example feed. Fictional people.",
    MAINTAINER[0],
    `I'll never sell our.one. When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three.`,
    `${MAINTAINER}, maintainer · How that works`,
    "Where did your friends go?",
    "7%",
    "In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.",
    "Source: the court's opinion in FTC v. Meta, pages 8 and 9, citing Meta's own figures.",
    "On our.one, your feed is only the people you chose, and then it ends.",
    "A ranked feed Home Sponsored Suggested for you M Mara Made it to the top before the rain. Suggested for you Sponsored Suggested for you and it keeps going",
    // Changed after the verification of M-0020 (H2): the illustration's our.one side names its feed Feed.
    "our.one Feed M Mara Made it to the top before the rain. T Tomas Soup's on tonight. Door's open from 7. J Jana Finished the book you lent me. That's everything from the last 14 days.",
    "Illustration.",
    "How it works",
    "1 Join Your email, a name and a username. It's free, and you need to be 18 or older.",
    `2 Bring your people You get ${DEFAULT_INVITES} invites. It stays quiet until the people you care about are here, so send them to the ones you'd actually want to hear from.`,
    "3 Catch up, then close it Their posts, newest first. When there's nothing new, it says so.",
    "Keep your people. Change who runs it.",
    "The people make the network.",
    "You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.",
    "WhatsApp, in three dates",
    "2012 WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
    "2014 Facebook agreed to buy it for about $19 billion.",
    "2025 WhatsApp announced ads in Status, in its Updates tab.",
    "An owner can sell it, change it or shut it down. A maintainer does the job, or is replaced.",
    `our.one has a maintainer: me, ${MAINTAINER}. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with ${NOTICE_DAYS} days' notice. In Settings, you can download your profile, posts, replies and connections, and delete it all. If your account is suspended, write to us and we will do it for you.`,
    `When ${T} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
    "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
    ...(count === null ? [] : [COUNT_LINES[String(count)]!]),
    "Read the contract See every cost Read the code",
    "Fair questions",
    "Is it free? Yes. Today I pay the bills, and every cost is public.",
    "What if my friends aren't on it? At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
    "Can I post photos? Not yet. Posts are words for now.",
    "Is there an app? Not yet. our.one works in your phone's browser, and you can add it to your home screen.",
    "Why should I believe you? Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost.",
    `What if it never gets to ${T}? Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.`,
    `What's a maintainer? The one who keeps it running. Today that's me, and today I also hold everything. After ${T}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`,
    ...(joining ? [`Who would you like to hear from? Join, then send them an invite. ${label}`] : []),
  ].join(" ");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ====================================================================== */
/* Every sentence, in every state                                         */
/* ====================================================================== */

describe("every sentence the front page renders, in every state (SPEC §18.15, as §18.16 amends it)", () => {
  it("closed: in each of the six states the whole visible text is SPEC §18.15's copy, as §18.16 amends it, in its order, and nothing else (the old 'promise' test pinned its section with toBe; the new tests use toContain)", () => {
    for (const state of STATES) {
      expect(textOf(render(state)), JSON.stringify(state)).toBe(specText(state));
    }
  });

  it("closed: in every state the only '%' anywhere in the markup is the court's 7%, twice (the old progress-bar test banned '%' from the markup; the new one reads only the visible text)", () => {
    for (const state of STATES) {
      const html = render(state);
      expect(html.split("%").length - 1, JSON.stringify(state)).toBe(2);
      expect([...html.matchAll(/(.)%/g)].map((m) => m[1]), JSON.stringify(state)).toEqual(["7", "7"]);
      expect(html).not.toMatch(/<progress|<meter|role="progressbar"/);
    }
  });
});

/* ====================================================================== */
/* The seat line, by the product's own paths                              */
/* ====================================================================== */

describe("the seat line (D-0015 §D), by the product's own paths", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (HIGH)): the seat line no longer promises the next seat — with the button 'Join the waiting list' (D-0016 §B) it says seats go to whoever has waited longest, which is what opening a seat does (seats.ts; SPEC §18.4)", async () => {
    const t0 = at("2026-09-29T10:00:00Z");
    const rado = await makeAccount({
      handle: "rado_m13",
      displayName: "Rado FICTIONAL",
      email: "rado_m13@example.test",
      isAdmin: true,
      createdAt: at("2026-01-01T00:00:00Z"),
    });
    // Ida asked three days ago, with no seat open: she waits in line.
    await requestSeat(db(), { email: "ida_m13@example.test", ipHash: rateKeyHash("192.0.2.1"), now: plus.days(t0, -3) });

    // Zoe opens the front page. No seat is open, and it tells her she joins the waiting list.
    const front = textOf(await renderRoute());
    // Changed under M-0021 (D-0024 §A): the form now has the optional question between the
    // address and the button, so the two are no longer neighbours; the button is the same.
    expect(front).toContain(`Your email ${NEED_LABEL} ${NEED_HINT} Join the waiting list`);
    expect(front).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    expect(front).not.toContain("you'll get the next one");
    expect(front).not.toMatch(/next (?:seat|one)/);
    await requestSeat(db(), { email: "zoe_m13@example.test", ipHash: rateKeyHash("192.0.2.2"), now: t0 });

    // The next seat opens.
    expect(await openSeats(db(), rado.id, 1, { now: plus.days(t0, 1) })).toEqual({ opened: 1, invited: 1 });
    const mailsTo = async (email: string) =>
      (await db().select().from(outbox).where(eq(outbox.toAddress, email))).length;
    const line = (await db().select({ email: waitlist.email }).from(waitlist).orderBy(asc(waitlist.createdAt))).map(
      (row) => row.email,
    );
    // What the line says is what happens: the seat goes to Ida, who waited longest, and Zoe keeps her place.
    expect({
      ida: await mailsTo("ida_m13@example.test"),
      zoe: await mailsTo("zoe_m13@example.test"),
      line,
    }).toEqual({ ida: 1, zoe: 0, line: ["zoe_m13@example.test"] });
  });
});

/* ====================================================================== */
/* The handover sentences                                                 */
/* ====================================================================== */

describe("the handover sentences (D-0015: 'Any sentence about the handover that is not listed by exact text' is prohibited)", () => {
  it("fixed (SPEC §18.15, after the verification; was DEFECT (MEDIUM)): the answer to 'What's a maintainer?' says what /contract hands over, in its words, and is listed by exact text, so the scan catches it on any other page", () => {
    const old = `After ${T}, a body of its members holds it, and can replace me.`;
    const answer = `After ${T}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`;
    for (const state of STATES) {
      expect(textOf(render(state)), JSON.stringify(state)).toContain(answer);
      expect(textOf(render(state)), JSON.stringify(state)).not.toContain(old);
    }
    const contract = textOf(renderToStaticMarkup(createElement(ContractPage)));
    expect(contract).toContain(
      `At ${T} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day.`,
    );
    const listed = ALLOWLIST.filter((entry) => entry.file === FRONT).map((entry) => entry.sentence);
    expect({
      listed: listed.includes(answer) || listed.includes(answer.replace(T, "{THRESHOLD}")),
      caughtOnAnotherPage: scanText(answer, ANOTHER_PAGE).length > 0,
    }).toEqual({ listed: true, caughtOnAnotherPage: true });
  });

  it("closed: the page's sentences with the verb 'hand' are the four FrontPage.tsx lists by exact text (three at 24a683f; the maintainer answer since the fix); each passes only there, a variation is caught there, and only the route imports FrontPage.tsx", () => {
    const seen = new Set<string>();
    for (const state of STATES) {
      // "our.one" holds a full stop; read it as one word while splitting sentences.
      const text = textOf(render(state)).replaceAll("our.one", "our․one");
      for (const m of text.matchAll(/[^.?!]*\bhand(?:s|ed|ing)?\b[^.?!]*[.?!]/gi)) {
        seen.add(m[0].trim().replaceAll("our․one", "our.one"));
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "Then nothing is handed over.",
        `After ${T}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`,
        `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`,
        `When ${T} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
      ].sort(),
    );
    const listed = ALLOWLIST.filter((entry) => entry.file === FRONT).map((entry) => entry.sentence);
    for (const sentence of seen) {
      expect(listed, sentence).toContain(sentence);
      expect(scanText(sentence, FRONT), sentence).toEqual([]);
      for (const other of ["src/app/(public)/page.tsx", ANOTHER_PAGE, "src/components/public/handover.ts", "src/core/mail-templates.ts"]) {
        expect(scanText(sentence, other).length, `${other}: ${sentence}`).toBeGreaterThan(0);
      }
      if (sentence.includes(T)) expect(scanText(sentence.replace(T, "10"), FRONT).length, sentence).toBeGreaterThan(0);
      expect(scanText(`${sentence} I hand it to them.`, FRONT), sentence).toHaveLength(1);
    }
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(WEB_ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:ts|tsx)$/.test(path) && /from\s+["'][^"']*\/FrontPage["']/.test(readFileSync(join(WEB_ROOT, path), "utf8"))) {
          importers.push(path);
        }
      }
    };
    walk("src");
    // Changed after D-0020 (M-0017): the front page's route moved to /feed; it is
    // still the one file that imports FrontPage.tsx.
    expect(importers).toEqual(["src/app/(public)/feed/page.tsx"]);
  });
});

/* ====================================================================== */
/* The claims scan's widened rule                                         */
/* ====================================================================== */

describe("the claims scan's widened rule (M-0013: '\"hand it to\" is caught in any other sentence')", () => {
  it("closed: 'hand it to' is caught however it is written: across a line break, a <br />, an inline tag or link, an entity, a zero-width space, JSX's {\" \"}, in capitals, and as 'handing it to' and 'hands it to'", () => {
    for (const claim of [
      "I hand it\n        to its members.",
      "I hand it<br />to its members.",
      "I hand <em>it</em> to its members.",
      'I hand <a href="/contract">it</a> to its members.',
      "I hand&nbsp;it to its members.",
      "I hand it t​o its members.",
      'I hand it{" "}\n        to its members.',
      "I HAND IT TO ITS MEMBERS.",
      "I'm handing it to its members.",
      "He hands it to them.",
      `When ${T} people have joined, I hand it to its members, and they can replace me.`,
    ]) {
      expect(scanText(claim, ANOTHER_PAGE).length, claim).toBeGreaterThan(0);
      expect(scanText(claim, FRONT).length, claim).toBeGreaterThan(0);
    }
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (MEDIUM)): the rule now sees the past tense and our.one by name ('I handed it to …', 'has handed it to', 'hand our.one to', 'handed our.one over to'), and the done-rule sees 'The handover happened.'", () => {
    // The forms the rules did see, for contrast.
    for (const seen of ["I hand it to its members.", "I handed it over to its members.", "It was handed to its members."]) {
      expect(scanText(seen, ANOTHER_PAGE).length, seen).toBeGreaterThan(0);
    }
    const told = [
      "I handed it to a not-for-profit body of its members.",
      "Rado has handed it to its members.",
      "I hand our.one to a not-for-profit body of its members.",
      "I handed our.one over to its members.",
      "The handover happened.",
      "The handover took place.",
    ];
    expect(told.filter((claim) => scanText(claim, ANOTHER_PAGE).length === 0)).toEqual([]);
  });

  it("fixed (D-0016 §J and §K, under M-0014; was accepted after the verification of M-0013): 'It was Handed to its members at 100,000.' is caught: the status line says 'Promised: … go to', needs no listing, and nothing is let through on every page", () => {
    expect(scanText(`It was Handed to its members at ${T}.`, ANOTHER_PAGE).length).toBeGreaterThan(0);
    // The old status line is caught too, on any page; the new one passes with nothing listed for it.
    expect(scanText(`Maintained by its founder. Handed to its members at ${T}.`, ANOTHER_PAGE).length).toBeGreaterThan(0);
    expect(scanText(STATUS_LINE, ANOTHER_PAGE)).toEqual([]);
    expect(ALLOWLIST.filter((entry) => /Handed to its members|Maintained by its founder/.test(entry.sentence))).toEqual([]);
    // Anything else about it, in other words, is caught.
    expect(scanText(`It was handed over to its members at ${T}.`, ANOTHER_PAGE).length).toBeGreaterThan(0);
  });
});

/* ====================================================================== */
/* Joining closed                                                         */
/* ====================================================================== */

describe("joining closed (D-0015 §D: the invite line 'stays only while joining is closed, when an invite is the only way in')", () => {
  beforeEach(async () => {
    await reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("fixed (SPEC §18.15, after the verification; was DEFECT (LOW)): while joining is closed the page says an invite will work when joining opens — and in both closed states it does not work yet: /i says our.one isn't open for new accounts, or asking to join through it is CLOSED", async () => {
    const t0 = at("2026-09-29T10:00:00Z");
    const rado = await makeAccount({ handle: "rado_m13", email: "rado_m13@example.test", isAdmin: true });
    const { code } = await createInvite(db(), rado.id, { note: "FICTIONAL", now: t0 });
    const closedStates: Record<string, Record<string, string>> = {
      "no data controller named": { DATA_CONTROLLER: "", DATA_CONTROLLER_EMAIL: "" },
      "production, no client-address header": { NODE_ENV: "production", CLIENT_IP_HEADER: "" },
    };
    const works: Record<string, boolean> = {};
    const seen: Record<string, { invitePage: string; askToJoin: string }> = {};
    for (const [name, env] of Object.entries(closedStates)) {
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      expect(textOf(await renderRoute()), name).toContain("Joining opens soon. Have an invite? It can't be used until joining opens.");
      const invitePage = (await inviteForViewer(db(), { code, viewerId: null, now: t0 })).kind;
      let askToJoin = "OK";
      try {
        await requestJoin(db(), { code, email: "nia_m13@example.test", ipHash: rateKeyHash("192.0.2.3"), now: t0 });
      } catch (error) {
        askToJoin = isCoreError(error) ? error.code : String(error);
      }
      seen[name] = { invitePage, askToJoin };
      works[name] = invitePage === "can_join" && askToJoin === "OK";
    }
    // The page no longer tells anyone to open the link now; it would not work.
    expect(works, JSON.stringify(seen)).toEqual({
      "no data controller named": false,
      "production, no client-address header": false,
    });
  });
});

/* ====================================================================== */
/* The sources and the facts the new sentences state                       */
/* ====================================================================== */

/**
 * ECF No. 705, page 8 (printed page 8, "Page 8 of 89", "Filed 12/02/25"),
 * as read on 29 September 2026: `pdftotext -layout` of FRIENDS_SOURCE,
 * sha256 0907ce07829be78a7d8f2e201d9aa9797058b70073ec5a569c41d04c481182be.
 * A court's opinion is a public record.
 */
const PAGE_8 =
  "Americans now spend only 17% of their time on Facebook viewing content from their friends. See DX 1152 (Jan. 2025 Facebook Surface Breakdown). On Instagram, that number is 7%. See DX 1153 (Jan. 2025 Instagram Surface Breakdown). What has replaced content from friends? For the most part, short videos posted by strangers and recommended by AI.";

describe("the sources, and what the new sentences say about the product", () => {
  it("closed: D-0015 §E quotes page 8 of the opinion the page links word for word, and the first sentence's 'January 2025' (the exhibit's title), 'Americans', 'content from friends' and '7%' are in it", () => {
    const d15 = readFileSync(join(REPO_ROOT, "decisions/D-0015.md"), "utf8").replace(/\s+/g, " ");
    expect(d15).toContain(PAGE_8);
    expect(FRIENDS_SOURCE).toMatch(/\/gov\.uscourts\.dcd\.224921\.705\.0\.pdf$/);
    expect(render(STATES[0]!)).toContain(`href="${FRIENDS_SOURCE}"`);
    for (const fact of ["Jan. 2025 Instagram", "Americans", "content from their friends", "On Instagram, that number is 7%"]) {
      expect(PAGE_8, fact).toContain(fact);
    }
  });

  it("closed: what the new sentences say about the product holds in the code: 10 invites and the weekly email on by default, a way to stop it, a name, a username and 18+ at joining, no photos and no advertising for now, and a manifest for the home screen", () => {
    const columns = getTableColumns(accounts);
    expect(columns.invitesRemaining.default).toBe(DEFAULT_INVITES);
    expect(columns.weeklyEmail.default).toBe(true);
    expect(textOf(renderToStaticMarkup(createElement(PrivacyPage)))).toContain(
      "Stop the weekly email in Settings, or with the link at the bottom of any weekly email.",
    );
    const join = renderToStaticMarkup(createElement(JoinForm));
    for (const field of ['name="displayName"', 'name="handle"', 'name="adult"']) expect(join, field).toContain(field);
    expect(textOf(join)).toContain("I'm 18 or older");
    expect(textOf(renderToStaticMarkup(createElement(RulesPage)))).toContain(
      "There is no search, no suggested people, no contact upload, no advertising and, for now, no photos.",
    );
    expect(Object.keys(getTableColumns(posts)).filter((name) => /image|photo|media|attach/i.test(name))).toEqual([]);
    expect(manifest().display).toBe("standalone");
  });
});
