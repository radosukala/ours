/**
 * The front page (SPEC §18.15, M-0013, D-0015; after §18.2 and §18.8 of
 * M-0011):
 *
 * - the headline and the lede, word for word, and the title;
 * - the count's three forms, in the section on who runs our.one, and no
 *   count at all when it can't be read;
 * - "Joining opens soon." while joining is closed, with the way in for an
 *   invite;
 * - the form, the seat line only when no seat is open, and the unchanged
 *   answer, while it is open;
 * - the signed promise on the first screen;
 * - the rest of the copy, word for word, with every source;
 * - the two pictures, which say what they are.
 *
 * Denial paths first. The presentational FrontPage is rendered with each
 * state as props, and the route is rendered with the seats module and the
 * Get in action mocked. Every address is FICTIONAL.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const seats = vi.hoisted(() => ({
  memberCount: vi.fn<() => Promise<number>>(),
  seatState: vi.fn<() => Promise<{ open: number; waiting: number }>>(),
}));
vi.mock("@/core/seats", () => ({
  memberCount: seats.memberCount,
  seatState: seats.seatState,
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));

import FrontPageRoute, { metadata } from "@/app/(public)/page";
import { CaughtUpMarker } from "@/components/Marker";
import { FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview } from "@/components/public/FeedPreview";
import {
  countLine,
  FRIENDS_SOURCE,
  FRONT_PAGE_TITLE,
  FrontPage,
  type FrontPageProps,
  seatLine,
} from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL, GetInFormView } from "@/components/public/GetInForm";
import { OPEN_CODE_URL } from "@/components/RightColumn";
import { scanText } from "@/core/claims";
import { DEFAULT_INVITES, HANDOVER_THRESHOLD } from "@/core/config";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const THRESHOLD = HANDOVER_THRESHOLD.toLocaleString("en-US");

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

function render(props: Partial<FrontPageProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, ...props }),
  );
}

async function renderRoute(): Promise<string> {
  return renderToStaticMarkup((await FrontPageRoute()) as ReactElement);
}

/** The HTML of the section whose heading has this id. */
function section(html: string, id: string): string {
  const start = html.lastIndexOf("<section", html.indexOf(`id="${id}"`));
  return html.slice(start, html.indexOf("</section>", start));
}

/** The first screen: everything before the first section below it. */
function firstScreen(html: string): string {
  return html.slice(0, html.indexOf('<section class="', html.indexOf("</figure>", html.indexOf("What our.one looks like"))));
}

/** Every <a> in this HTML, as [text, href, the whole tag]. */
function links(html: string): [string, string, string][] {
  return [...html.matchAll(/(<a [^>]*href="([^"]+)"[^>]*>)(.*?)<\/a>/g)].map((m) => [textOf(m[3]!), m[2]!, m[1]!]);
}

beforeEach(() => {
  seats.memberCount.mockReset();
  seats.seatState.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the count", () => {
  it("is left out, with no error and no number, when the count can't be read (the database is down)", async () => {
    seats.memberCount.mockRejectedValue(new Error("FICTIONAL connect ECONNREFUSED db.example.test"));
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    const html = await renderRoute();
    const text = textOf(html);
    expect(text).toContain("Just your people. Then you're done.");
    expect(text).not.toMatch(/people are in|person is in|Nobody is in yet|You'd be #/);
    expect(html).not.toMatch(/class="[^"]*count/);
    // The failure is logged by its name only: a message can carry a host.
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("the count could not be read");
    expect(logged).not.toContain("db.example.test");
  });

  it("is left out when there is no database address at all", async () => {
    vi.stubEnv("DATABASE_URL", "");
    seats.memberCount.mockResolvedValue(5);
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    const text = textOf(await renderRoute());
    expect(text).not.toMatch(/people are in|You'd be #/);
    expect(text).not.toMatch(/seats? open/);
    expect(seats.memberCount).not.toHaveBeenCalled();
    expect(text).toContain("Get in");
  });

  it("is left out when the count is not a count", async () => {
    seats.seatState.mockResolvedValue({ open: 0, waiting: 0 });
    for (const odd of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      seats.memberCount.mockResolvedValue(odd);
      expect(textOf(await renderRoute()), String(odd)).not.toMatch(
        /people are in\.|person is in\.|Nobody is in yet\.|You'd be #/,
      );
    }
  });

  it("reads 'Nobody is in yet. You'd be #1.' at 0, '1 person is in. You'd be #2.' at 1, and '{N} people are in. You'd be #{N+1}.' from 2", () => {
    expect(countLine(0)).toBe("Nobody is in yet. You'd be #1.");
    expect(countLine(1)).toBe("1 person is in. You'd be #2.");
    expect(countLine(2)).toBe("2 people are in. You'd be #3.");
    expect(countLine(999)).toBe("999 people are in. You'd be #1,000.");
    expect(countLine(1284)).toBe("1,284 people are in. You'd be #1,285.");
    expect(countLine(99_999)).toBe("99,999 people are in. You'd be #100,000.");
    for (const n of [0, 1, 2, 1284]) {
      expect(textOf(render({ count: n }))).toContain(countLine(n));
    }
  });

  it("is in the section on who runs our.one, not on the first screen (D-0015 §D)", () => {
    const html = render({ count: 1284 });
    expect(textOf(firstScreen(html))).not.toMatch(/people are in|You'd be #/);
    expect(textOf(section(html, "front-runs"))).toContain("1,284 people are in. You'd be #1,285.");
  });

  it("shows the count from memberCount only, never the waiting list", async () => {
    seats.memberCount.mockResolvedValue(1284);
    seats.seatState.mockResolvedValue({ open: 0, waiting: 777 });
    const text = textOf(await renderRoute());
    expect(text).toContain("1,284 people are in. You'd be #1,285.");
    expect(text).not.toContain("777");
    expect(text).not.toContain("2,061"); // members and the line added together
  });

  it("has no progress bar, and the only percentage on the page is the court's 7%", async () => {
    seats.memberCount.mockResolvedValue(1284);
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    for (const html of [await renderRoute(), render({ count: 0 }), render({ count: 99_999 })]) {
      expect(html).not.toMatch(/<progress|<meter|role="progressbar"/);
      // The large "7%" and the sentence that carries it; nothing measures the threshold.
      expect(textOf(html).match(/[\d.,]+\s?%/g)).toEqual(["7%", "7%"]);
    }
  });
});

describe("the headline and the title", () => {
  it("is one h1 on two lines, word for word (D-0015 §A)", () => {
    const html = render();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>") + 5);
    expect(h1).toBe(
      `<h1 class="headline ${h1.match(/class="headline ([^"]*)"/)![1]}"><span>Just your people.</span> <span>Then you&#x27;re done.</span></h1>`,
    );
    expect(THRESHOLD).toBe("100,000");
  });

  it("the metadata title is 'our.one · Just your people. Then you're done.'", () => {
    const expected = "our.one · Just your people. Then you're done.";
    expect(FRONT_PAGE_TITLE).toBe(expected);
    expect(metadata.title).toEqual({ absolute: expected });
  });

  it("the lede is SPEC §18.15's, and comes before Get in", () => {
    const text = textOf(render());
    const lede =
      "our.one shows you posts from the people you choose, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can put your phone down.";
    expect(text).toContain(lede);
    expect(text.indexOf(lede)).toBeLessThan(text.indexOf("Your email"));
  });

  it("the old headline and the questions that left the page are gone", () => {
    const text = textOf(render());
    for (const gone of ["Today it's mine", "I give it away", "Why not hand it over now?", `What happens at ${THRESHOLD}?`, "No ranking."]) {
      expect(text, gone).not.toContain(gone);
    }
  });
});

describe("Get in", () => {
  it("reads 'Joining opens soon.' with no form while no data controller is named, never asks for the seats, and says how to use an invite", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockResolvedValue({ open: 50, waiting: 0 });
    const html = await renderRoute();
    const getIn = textOf(section(html, "front-get-in"));
    expect(getIn).toContain("Joining opens soon.");
    expect(html).not.toContain("<form");
    expect(getIn).not.toContain("Your email");
    expect(getIn).not.toMatch(/seats? open/);
    expect(getIn).not.toContain("We'll email you the link");
    expect(getIn).not.toContain("Free to join");
    expect(seats.seatState).not.toHaveBeenCalled();
    // The count is still shown, and so is the way in for people with an invite.
    expect(textOf(html)).toContain("3 people are in. You'd be #4.");
    expect(getIn).toContain("Have an invite? Open the link you were sent.");
    expect(section(html, "front-get-in")).toMatch(/<a [^>]*href="\/signin"[^>]*>Sign in<\/a>/);
    // No last call to get in while nobody can.
    expect(html).not.toContain('id="front-close"');
    expect(textOf(html)).not.toContain("Bring your people.");
  });

  it("reads 'Joining opens soon.' while a controller is named in half (a name with no address)", async () => {
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    seats.memberCount.mockResolvedValue(3);
    const html = await renderRoute();
    expect(textOf(section(html, "front-get-in"))).toContain("Joining opens soon.");
    expect(html).not.toContain("<form");
  });

  it("reads 'Joining opens soon.' in production when no client-address header is named", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockResolvedValue({ open: 50, waiting: 0 });
    const html = await renderRoute();
    expect(textOf(section(html, "front-get-in"))).toContain("Joining opens soon.");
    expect(html).not.toContain("<form");
    expect(seats.seatState).not.toHaveBeenCalled();
  });

  it("shows the form, the invites and the privacy note when joining is open, with no seat count while seats are open", async () => {
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockResolvedValue({ open: 12, waiting: 0 });
    const route = await renderRoute();
    const html = section(route, "front-get-in");
    const text = textOf(html);
    expect(text).not.toContain("Joining opens soon.");
    expect(html).toMatch(/<form[^>]*>/);
    expect(html).toMatch(/<label[^>]*for="field-email"[^>]*>Your email<\/label>/);
    const input = html.match(/<input[^>]*>/g) ?? [];
    expect(input).toHaveLength(1);
    for (const attribute of ['id="field-email"', 'name="email"', 'type="email"', 'autoComplete="email"', "required"]) {
      expect(input[0], attribute).toContain(attribute);
    }
    expect(html).toMatch(/<button type="submit"[^>]*>Get in<\/button>/);
    expect(text).not.toMatch(/\d+ seats? open|No seats open/);
    expect(text).toContain(`Free to join. You get ${DEFAULT_INVITES} invites to bring your people.`);
    expect(DEFAULT_INVITES).toBe(10);
    expect(text).toContain(
      "We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in Privacy.",
    );
    // The old note said "only", and the weekly email is on by default (D-0015 §J).
    expect(text).not.toContain("only to send you the link");
    expect(html).toMatch(/<a [^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(text).not.toContain("Have an invite?");
    // The form comes first, then the invites, then the note.
    expect(text.indexOf("Get in Your email")).toBeLessThan(text.indexOf("Free to join."));
    expect(text.indexOf("Free to join.")).toBeLessThan(text.indexOf("We'll email you the link."));
    // And a last way in at the end of the page, to the same form.
    const close = section(route, "front-close");
    expect(textOf(close)).toBe("Bring your people. Get in");
    expect(close).toMatch(/<a href="#front-get-in" class="btn btn--primary btn--large">Get in<\/a>/);
  });

  it("the seat line: shown only when no seat is open (D-0015 §D)", () => {
    const none = "No seats open right now. Leave your address and you'll get the next one.";
    expect(seatLine(0)).toBe(none);
    expect(seatLine(-1)).toBe(none);
    for (const open of [1, 2, 12, 1000]) {
      expect(seatLine(open), String(open)).toBeNull();
      expect(textOf(render({ seatsOpen: open })), String(open)).not.toMatch(/seats? open|No seats/);
    }
    const text = textOf(render({ seatsOpen: 0 }));
    expect(text).toContain(none);
    expect(text.indexOf("Get in Your email")).toBeLessThan(text.indexOf(none));
    expect(text.indexOf(none)).toBeLessThan(text.indexOf("Free to join."));
  });

  it("leaves the seat line out, and keeps the form, when the seats can't be read", async () => {
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockRejectedValue(new Error("FICTIONAL: the database is down"));
    const html = section(await renderRoute(), "front-get-in");
    expect(html).toContain("<form");
    expect(textOf(html)).not.toMatch(/seats? open|No seats/);
    expect(textOf(html)).toContain("We'll email you the link.");
  });

  it("after any valid submission, everyone reads the same words, unchanged (D-0015 §H); a refusal is shown at the field", () => {
    const view = (state: { ok: true } | { error: string } | null) =>
      renderToStaticMarkup(createElement(GetInFormView, { state, action: () => {}, pending: false }));
    expect(CHECK_YOUR_EMAIL).toBe(
      "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.",
    );
    const answered = view({ ok: true });
    expect(answered).toMatch(/<p class="notice notice--ok" role="status">Check your email\./);
    expect(textOf(answered)).toContain(CHECK_YOUR_EMAIL);
    // The prototype's shorter answer is untrue for an account or a place in line: nothing is sent to either.
    expect(textOf(answered)).not.toContain("We've sent you the next step");
    expect(answered).toContain("<form"); // the form stays, for another address

    for (const refusal of ["Joining opens soon.", "FICTIONAL: that isn't an email address."]) {
      const refused = view({ error: refusal });
      expect(refused).toMatch(/<p id="field-email-error" class="field__error" role="alert">/);
      expect(textOf(refused)).toContain(refusal);
      expect(textOf(refused)).not.toContain("Check your email");
      expect(refused).toContain('aria-invalid="true"');
    }

    const fresh = view(null);
    expect(textOf(fresh)).not.toContain("Check your email");
    expect(fresh).not.toContain('role="alert"');
  });

  it("the form's action is takeSeat, through useActionState", () => {
    const source = readFileSync(join(WEB_ROOT, "src/components/public/GetInForm.tsx"), "utf8");
    expect(source).toMatch(/import \{[^}]*\btakeSeat\b[^}]*\} from "@\/app\/\(public\)\/seat-actions";/);
    expect(source).toMatch(/useActionState<[^>]*>\(\s*takeSeat,/);
    expect(source.startsWith('"use client";')).toBe(true);
  });
});

describe("the promise, signed, on the first screen (D-0015 §C)", () => {
  it("is a card after Get in: the promise in the maintainer's words, his name and role, and a link to how it works", () => {
    for (const joining of [true, false]) {
      const html = render({ joining });
      const first = firstScreen(html);
      const card = first.slice(first.indexOf("<figure"), first.indexOf("</figure>") + 9);
      expect(textOf(card)).toBe(
        `R I'll never sell our.one. When ${THRESHOLD} people have joined, I hand it to a not-for-profit body of its members, and they can replace me. Rado, maintainer · How that works`,
      );
      expect(card).toMatch(/<blockquote[^>]*><p>I&#x27;ll never sell our\.one\./);
      expect(card).toMatch(/<figcaption[^>]*>Rado, maintainer · <a href="#front-runs" class="link">How that works<\/a><\/figcaption>/);
      // The initial stands for a face and is not read out.
      expect(card).toMatch(/<span class="[^"]*" aria-hidden="true">R<\/span>/);
      expect(first.indexOf('id="front-get-in"')).toBeLessThan(first.indexOf("<blockquote"));
    }
  });

  it("names the body the contract names, not the members as owners (D-0015 §J)", () => {
    const text = textOf(render());
    expect(text).not.toContain("I hand it to its members");
    expect(text).toContain("I hand it to a not-for-profit body of its members");
  });

  it("the claims scan lists it by exact text, and its widened rule catches 'hand it to' anywhere else", () => {
    const file = "src/components/public/FrontPage.tsx";
    const sentence = `When ${THRESHOLD} people have joined, I hand it to a not-for-profit body of its members, and they can replace me.`;
    expect(scanText(sentence, file)).toEqual([]);
    expect(scanText(sentence, "src/app/(public)/page.tsx").length).toBeGreaterThan(0);
    for (const claim of [
      "I hand it to the members.",
      "At 100,000 members, he hands it to them.",
      "Handing it to the community is the plan.",
      `When ${THRESHOLD} people have joined, I hand it to its members, and they can replace me.`,
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
    }
    expect(scanText(readFileSync(join(WEB_ROOT, file), "utf8"), file)).toEqual([]);
  });
});

describe("the rest of the page, word for word (SPEC §18.15)", () => {
  it("where did your friends go: the court's finding, linked to the court's opinion, and the illustration", () => {
    const html = section(render(), "front-friends");
    const text = textOf(html);
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("Where did your friends go?");
    expect(html).toMatch(/<p class="[^"]*" aria-hidden="true">7%<\/p>/);
    expect(text).toContain(
      "In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.",
    );
    expect(text).toContain("Source: the court's opinion in FTC v. Meta, page 8, citing Meta's own figures.");
    expect(text).toContain("On our.one, your feed is only the people you chose, and then it ends.");
    expect(FRIENDS_SOURCE).toBe(
      "https://storage.courtlistener.com/recap/gov.uscourts.dcd.224921/gov.uscourts.dcd.224921.705.0.pdf",
    );
    const [source] = links(html);
    expect(source?.[0]).toBe("the court's opinion in FTC v. Meta");
    expect(source?.[1]).toBe(FRIENDS_SOURCE);
    expect(source?.[2]).toContain('rel="noopener noreferrer"');
    expect(source?.[2]).toContain('target="_blank"');
    expect(html).toContain("<figure");
    // The two labels, each above its phone.
    expect(text).toMatch(/A ranked feed Home Sponsored .* and it keeps going our\.one Home /);
    expect(text).toContain("Illustration.");
  });

  it("how it works: three steps, in order", () => {
    const html = section(render(), "front-how");
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("How it works");
    const steps = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => textOf(m[1]!));
    expect(steps).toEqual([
      "1 Get in Your email, a name and a username. It's free, and you need to be 18 or older.",
      `2 Bring your people You get ${DEFAULT_INVITES} invites. It stays quiet until the people you care about are here, so send them to the ones you'd actually want to hear from.`,
      "3 Catch up, then close it Their posts, newest first. When there's nothing new, it says so.",
    ]);
    expect(html).toMatch(/<ol role="list"/);
    expect(html.match(/<h3>/g)).toHaveLength(3);
  });

  it("keep your people, change who runs it: WhatsApp in three dated lines, each linked to its source, then the promise and what holds it", () => {
    const html = section(render(), "front-runs");
    const text = textOf(html);
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("Keep your people. Change who runs it.");
    expect(text).toContain("WhatsApp, in three dates");
    const story = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    const lines = [...story.matchAll(/<li>(.*?)<\/li>/g)].map((m) => textOf(m[1]!));
    expect(lines).toEqual([
      "2012 WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
      "2014 Facebook agreed to buy it for about $19 billion.",
      "2025 Ads came to WhatsApp.",
    ]);
    expect(links(story).map(([, href]) => href)).toEqual([
      "https://blog.whatsapp.com/why-we-don-t-sell-ads",
      "https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/",
      "https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html",
    ]);
    for (const [, , tag] of links(story)) {
      expect(tag).toContain('rel="noopener noreferrer"');
      expect(tag).toContain('target="_blank"');
    }
    expect(html).toMatch(
      /<p class="[^"]*"><strong>An owner can sell it, change it or shut it down\. A maintainer does the job, or is replaced\.<\/strong><\/p>/,
    );
    for (const sentence of [
      "our.one has a maintainer: me, Rado. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice, and you can always leave with everything.",
      `When ${THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
      "Today these promises are held by that contract, not yet by law.",
      "12 people are in. You'd be #13.",
      "Read the contract See every cost Read the code",
    ]) {
      expect(text, sentence).toContain(sentence);
    }
    const end = links(html).slice(-3);
    expect(end.map(([label, href]) => [label, href])).toEqual([
      ["Read the contract", "/contract"],
      ["See every cost", "/costs"],
      ["Read the code", OPEN_CODE_URL],
    ]);
    expect(end[2]![2]).toContain('rel="noopener noreferrer"');
    expect(end[2]![2]).toContain('target="_blank"');
  });

  it("fair questions: each question a <dt>, each answer a <dd>, product questions first", () => {
    const html = section(render(), "front-questions");
    const pairs = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [textOf(m[1]!), textOf(m[2]!)]);
    expect(pairs).toEqual([
      ["Is it free?", "Yes. Today I pay the bills, and every cost is public."],
      ["What if my friends aren't on it?", `At first they won't be. That's what your ${DEFAULT_INVITES} invites are for.`],
      ["Can I post photos?", "Not yet. Posts are words for now."],
      ["Is there an app?", "Not yet. our.one works in your phone's browser, and you can add it to your home screen."],
      [
        "Why should I believe you?",
        "Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost.",
      ],
      [
        `What if it never gets to ${THRESHOLD}?`,
        "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything.",
      ],
      [
        "What's a maintainer?",
        `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, a body of its members holds it, and can replace me.`,
      ],
    ]);
  });

  it("the sections come in SPEC §18.15's order, with one h1 and an h2 each", () => {
    const heading = (html: string) =>
      [...html.matchAll(/<h([12])\b[^>]*>(.*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]!)}`);
    const common = [
      "h1 Just your people. Then you're done.",
      "h2 Get in",
      "h2 Where did your friends go?",
      "h2 How it works",
      "h2 Keep your people. Change who runs it.",
      "h2 Fair questions",
    ];
    expect(heading(render())).toEqual([...common, "h2 Bring your people."]);
    expect(heading(render({ joining: false }))).toEqual(common);
  });

  it("a signed-in visitor goes to /home", async () => {
    const source = readFileSync(join(WEB_ROOT, "src/app/(public)/page.tsx"), "utf8");
    expect(source).toMatch(/if \(await signedIn\(\)\) redirect\("\/home"\);/);
  });
});

/**
 * JSX text that follows an expression, begins with a space and runs onto
 * the next line: Next's compiler (SWC) drops that space, and the tests'
 * compiler (esbuild) keeps it. Seen on the front page in `next dev`: "When
 * {THRESHOLD} people have\n joined" rendered "When 100,000people have
 * joined". The rendered tests above cannot see it, so the source is read.
 */
function spacesNextDrops(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      node.children.forEach((child, i) => {
        const before = node.children[i - 1];
        if (!before || !ts.isJsxText(child) || !ts.isJsxExpression(before)) return;
        const raw = child.getFullText();
        if (/^[ \t]+\S/.test(raw) && raw.includes("\n")) {
          const { line } = source.getLineAndCharacterOfPosition(child.getStart());
          found.push(`${file}:${line + 1}: ${JSON.stringify(raw.split("\n")[0])}`);
        }
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("the copy survives Next's compiler", () => {
  it("finds the pattern that loses a space", () => {
    expect(spacesNextDrops("x.tsx", "const a = <p>\n  When {X} people have\n  joined.\n</p>;")).toHaveLength(1);
    expect(spacesNextDrops("x.tsx", "const a = <p>\n  When {X}{\" \"}\n  people have joined.\n</p>;")).toEqual([]);
    expect(spacesNextDrops("x.tsx", "const a = <p>When {X} people have joined.</p>;")).toEqual([]);
  });

  it("no .tsx file has JSX text after an expression that starts with a space and runs onto the next line", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(WEB_ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (path.endsWith(".tsx")) files.push(path);
      }
    };
    walk("src");
    expect(files).toContain("src/components/public/FrontPage.tsx");
    expect(files.flatMap((f) => spacesNextDrops(f, readFileSync(join(WEB_ROOT, f), "utf8")))).toEqual([]);
  });
});

describe("the pictures say what they are (SPEC §18.15)", () => {
  it("the phone: a feed that ends at the app's own caught-up words, with fictional people, and says so", () => {
    const html = renderToStaticMarkup(createElement(FeedPreview));
    expect(html).toContain("An example feed. Fictional people.");
    // The marker's words are the app's: CaughtUpMarker, for a last visit 2 days ago.
    const now = new Date("2026-09-29T12:00:00Z");
    const marker = textOf(
      renderToStaticMarkup(
        createElement(CaughtUpMarker, { since: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), now }),
      ),
    );
    expect(marker).toBe("You're caught up You've seen everything from before your last visit, 2 days ago.");
    expect(textOf(html)).toContain(marker);
    expect(textOf(html)).not.toContain("since yesterday");
    expect(html).not.toMatch(/\bOURS\b/);
  });

  it("the illustration: a ranked feed beside ours, captioned as an illustration", () => {
    const html = renderToStaticMarkup(createElement(FeedContrast));
    const text = textOf(html);
    expect(text.startsWith("A ranked feed")).toBe(true);
    expect(text).toContain("and it keeps going");
    expect(text).toContain("You're caught up");
    expect(text.endsWith("Illustration.")).toBe(true);
    expect(html).toMatch(/<figure [^>]*aria-label="Illustration: a ranked feed that keeps going, beside an our\.one feed that ends"/);
    expect(html).not.toMatch(/\bOURS\b|Instagram/);
  });
});
