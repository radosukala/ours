/**
 * The front page (SPEC §18.15 as §18.16 amends it; M-0013 and M-0014;
 * D-0015 as D-0016 amends it; after §18.2 and §18.8 of M-0011):
 *
 * - the headline and the lede, word for word, and the title;
 * - the count's three forms, in the section on who runs our.one, and no
 *   count at all when it can't be read;
 * - "Joining opens soon." while joining is closed, with the way in for an
 *   invite;
 * - the form, whose button says "Join our.one" or "Join the waiting list",
 *   the seat line only when no seat is open, and the unchanged answer,
 *   while it is open;
 * - the signed promise on the first screen, after the picture on a phone;
 * - the rest of the copy, word for word, with every source;
 * - the status line;
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

// Changed after D-0020 (M-0017): the front page's words, form and promises
// moved to /feed unchanged, and `/` became the front door
// (tests/front-door.test.ts). These tests follow them there.
import FrontPageRoute, { metadata } from "@/app/(public)/feed/page";
import { CaughtUpMarker, EndMarker } from "@/components/Marker";
import { FeedContrast } from "@/components/public/FeedContrast";
import { FeedPreview, PREVIEW_LAST_VISIT, PREVIEW_NOW } from "@/components/public/FeedPreview";
import {
  CLOSE_HEADING,
  CLOSE_LINE,
  countLine,
  FRIENDS_SOURCE,
  FRONT_PAGE_TITLE,
  FrontPage,
  type FrontPageProps,
  LEDE,
  REASON,
  REASON_LEAD,
  seatLine,
} from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL, GetInFormView } from "@/components/public/GetInForm";
import { JOIN_LABEL, joinLabel, WAITING_LIST_LABEL } from "@/components/public/join";
import { OPEN_CODE_URL, SiteFooter, STATUS_LINE } from "@/components/RightColumn";
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
    // The count's own class (the phone's post rows use the app's `action__count`).
    expect(html).not.toMatch(/class="[^"]*\b_count_/);
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
    // The seats can't be read either, so a seat may be open: "Join our.one".
    expect(text).toContain("Join our.one");
    expect(text).not.toContain(WAITING_LIST_LABEL);
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
      // The large "7%" and the sentence that carries it; nothing measures the threshold,
      // in the text or in the markup (a bar drawn with style="width:…%" would show here).
      expect(textOf(html).match(/[\d.,]+\s?%/g)).toEqual(["7%", "7%"]);
      expect(html.split("%").length - 1).toBe(2);
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

  it("the lede is SPEC §18.16's: what our.one is, first, and it comes before the form (D-0016 §A)", () => {
    const text = textOf(render());
    const lede =
      "A social network for your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can get on with your day.";
    expect(LEDE).toBe(lede);
    expect(text).toContain(lede);
    expect(text.indexOf(lede)).toBeLessThan(text.indexOf("Your email"));
  });

  it("the old headline and the questions that left the page are gone", () => {
    const text = textOf(render());
    for (const gone of ["Today it's mine", "I give it away", "Why not hand it over now?", `What happens at ${THRESHOLD}?`, "No ranking."]) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it("the lines D-0016 replaced are gone, in every state", () => {
    for (const props of [{}, { joining: false }, { seatsOpen: 0 }, { seatsOpen: null, count: null }]) {
      const text = textOf(render(props));
      for (const gone of [
        "our.one shows you posts",
        "put your phone down",
        "Get in",
        "Bring your people.",
        "No seats open right now.",
        "Leave your address",
        "I hand it to",
        "and they can replace me",
        "Ads came to WhatsApp.",
        "leave with everything",
        "not yet by law",
        `That's what your ${DEFAULT_INVITES} invites are for.`,
        "Handed to its members",
      ]) {
        expect(text, `${JSON.stringify(props)}: ${gone}`).not.toContain(gone);
      }
    }
  });
});

describe("Joining", () => {
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
    // An invite can't be used while joining is closed either (the verification of M-0013).
    expect(getIn).toContain("Have an invite? It can't be used until joining opens.");
    expect(getIn).not.toContain("will work");
    expect(getIn).not.toContain("Open the link you were sent");
    // No last call to join while nobody can.
    expect(html).not.toContain('id="front-close"');
    expect(textOf(html)).not.toContain(CLOSE_HEADING);
    // No join button or link anywhere: the hidden heading names the part of the page, nothing more.
    expect(html).not.toMatch(/class="btn btn--primary/);
    expect(textOf(html)).not.toContain(WAITING_LIST_LABEL);
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
    expect(html).toMatch(/<button type="submit"[^>]*>Join our\.one<\/button>/);
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
    expect(text.indexOf("Join our.one Your email")).toBe(0);
    expect(text.indexOf("Your email")).toBeLessThan(text.indexOf("Free to join."));
    expect(text.indexOf("Free to join.")).toBeLessThan(text.indexOf("We'll email you the link."));
    // And a last way in at the end of the page, to the same form, asking whom they would bring.
    const close = section(route, "front-close");
    expect(textOf(close)).toBe("Who would you like to hear from? Join, then send them an invite. Join our.one");
    expect(close).toMatch(/<a href="#front-get-in" class="btn btn--primary btn--large">Join our\.one<\/a>/);
    expect([CLOSE_HEADING, CLOSE_LINE]).toEqual(["Who would you like to hear from?", "Join, then send them an invite."]);
  });

  it("the button says what the form will do: 'Join our.one' with a seat open or the seats unread, 'Join the waiting list' with none (D-0016 §B)", async () => {
    expect([JOIN_LABEL, WAITING_LIST_LABEL]).toEqual(["Join our.one", "Join the waiting list"]);
    expect(joinLabel(null)).toBe(JOIN_LABEL);
    for (const open of [1, 2, 12, 1000]) expect(joinLabel(open), String(open)).toBe(JOIN_LABEL);
    for (const open of [0, -1]) expect(joinLabel(open), String(open)).toBe(WAITING_LIST_LABEL);
    // Through the route, as the database answers.
    // With a seat open and an address already waiting, a new address goes in line behind it:
    // the line goes first (seats.ts; the verification of M-0014, D-0016 §N).
    expect(joinLabel(5, 2)).toBe(WAITING_LIST_LABEL);
    expect(joinLabel(5, 0)).toBe(JOIN_LABEL);
    expect(joinLabel(5, null)).toBe(JOIN_LABEL);
    expect(joinLabel(null, 3)).toBe(JOIN_LABEL);
    const cases: [() => void, string][] = [
      [() => seats.seatState.mockResolvedValue({ open: 12, waiting: 0 }), JOIN_LABEL],
      [() => seats.seatState.mockResolvedValue({ open: 0, waiting: 4 }), WAITING_LIST_LABEL],
      [() => seats.seatState.mockResolvedValue({ open: 1, waiting: 1 }), WAITING_LIST_LABEL],
      [() => seats.seatState.mockRejectedValue(new Error("FICTIONAL: the database is down")), JOIN_LABEL],
    ];
    for (const [arrange, label] of cases) {
      seats.memberCount.mockResolvedValue(3);
      arrange();
      const route = await renderRoute();
      const button = section(route, "front-get-in").match(/<button type="submit"[^>]*>([^<]*)<\/button>/)?.[1];
      expect(button, label).toBe(label);
      // The close's link says the same.
      expect(section(route, "front-close"), label).toContain(`class="btn btn--primary btn--large">${label}</a>`);
      // The hidden heading names the part of the page, whatever the button says.
      expect(section(route, "front-get-in")).toMatch(/<h2 id="front-get-in" class="visually-hidden">Join our\.one<\/h2>/);
    }
    // The form on its own, with no label given, says "Join our.one".
    const view = renderToStaticMarkup(createElement(GetInFormView, { state: null, action: () => {}, pending: false }));
    expect(view).toMatch(/<button type="submit"[^>]*>Join our\.one<\/button>/);
    const waiting = renderToStaticMarkup(
      createElement(GetInFormView, { state: null, action: () => {}, pending: false, label: WAITING_LIST_LABEL }),
    );
    expect(waiting).toMatch(/<button type="submit"[^>]*>Join the waiting list<\/button>/);
  });

  it("the seat line: shown only when no seat is open, and it promises a place in line, not the next seat (D-0016 §B; the verification of M-0013)", () => {
    const none = "No seats are open right now. Seats go to whoever has waited longest.";
    expect(seatLine(0)).toBe(none);
    expect(seatLine(-1)).toBe(none);
    for (const open of [1, 2, 12, 1000]) {
      expect(seatLine(open), String(open)).toBeNull();
      expect(textOf(render({ seatsOpen: open })), String(open)).not.toMatch(/seats? (?:are )?open|No seats|waiting list/);
    }
    const text = textOf(render({ seatsOpen: 0 }));
    expect(text).toContain(none);
    expect(text).not.toMatch(/next (?:seat|one)/);
    // The form and its button, then the line, then the invites.
    expect(text.indexOf("Your email Join the waiting list")).toBeGreaterThan(0);
    expect(text.indexOf("Join the waiting list")).toBeLessThan(text.indexOf(none));
    expect(text.indexOf(none)).toBeLessThan(text.indexOf("Free to join."));
  });

  it("leaves the seat line out, and keeps the form, when the seats can't be read", async () => {
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockRejectedValue(new Error("FICTIONAL: the database is down"));
    const html = section(await renderRoute(), "front-get-in");
    expect(html).toContain("<form");
    expect(textOf(html)).not.toMatch(/seats? (?:are )?open|No seats|waiting list/);
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

/** The signed card: the figure that holds the blockquote. */
function card(first: string): string {
  const start = first.lastIndexOf("<figure", first.indexOf("<blockquote"));
  return first.slice(start, first.indexOf("</figure>", start) + 9);
}

describe("the promise, signed, on the first screen (D-0016 §C)", () => {
  it("is a card after joining and after the picture: the promise in the maintainer's words, the maintainer's name and role, and a link to how it works", () => {
    for (const joining of [true, false]) {
      const html = render({ joining });
      const first = firstScreen(html);
      const signed = card(first);
      expect(textOf(signed)).toBe(
        `R I'll never sell our.one. When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members. Until then, I hold all three. Rado, maintainer · How that works`,
      );
      expect(signed).toMatch(/<blockquote[^>]*><p>I&#x27;ll never sell our\.one\./);
      expect(signed).toMatch(/<figcaption[^>]*>Rado, maintainer · <a href="#front-runs" class="[^"]*">How that works<\/a><\/figcaption>/);
      // The initial stands for a face and is not read out.
      expect(signed).toMatch(/<span class="[^"]*" aria-hidden="true">R<\/span>/);
      // On a phone the first screen reads in markup order: the words, joining, the picture, the card (D-0016 §D).
      const order = [
        first.indexOf("<h1"),
        first.indexOf('id="front-get-in"'),
        first.indexOf('aria-label="What our.one looks like"'),
        first.indexOf("<blockquote"),
      ];
      expect(order.every((at) => at >= 0), JSON.stringify(order)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it("names the three things the contract hands over, the body it names, and who holds them until then (D-0016 §C)", () => {
    const text = textOf(render());
    expect(text).not.toContain("I hand it to");
    expect(text).toContain("I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.");
    expect(text).toContain("Until then, I hold all three.");
    // "not-for-profit" stays on one line in the card (the verification of M-0014).
    expect(render()).toMatch(/<span class="[^"]*nowrap[^"]*">not-for-profit<\/span> body of its members\. Until then/);
  });

  it("the claims scan lists it by exact text, and its rule catches the same words, or 'hand it to', anywhere else", () => {
    const file = "src/components/public/FrontPage.tsx";
    const sentence = `When ${THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`;
    expect(scanText(sentence, file)).toEqual([]);
    expect(scanText(sentence, "src/app/(public)/page.tsx").length).toBeGreaterThan(0);
    for (const claim of [
      "I hand it to the members.",
      "At 100,000 members, he hands it to them.",
      "Handing it to the community is the plan.",
      `When ${THRESHOLD} people have joined, I hand it to a not-for-profit body of its members, and they can replace me.`,
      `When ${THRESHOLD} people have joined, I hand over its domain to its members.`,
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
    }
    expect(scanText(readFileSync(join(WEB_ROOT, file), "utf8"), file)).toEqual([]);
  });

  it("from 900px the card stays under joining, beside the picture: the stylesheet's grid areas (D-0016 §D)", () => {
    const css = readFileSync(join(WEB_ROOT, "src/components/public/public.module.css"), "utf8");
    const wide = css.slice(css.indexOf("@media (min-width: 900px)"));
    const areas = wide.slice(wide.indexOf("grid-template-areas:"), wide.indexOf(";", wide.indexOf("grid-template-areas:")));
    expect(areas.match(/"[^"]*"/g)?.map((row) => row.replace(/\s+/g, " "))).toEqual([
      '". preview"',
      '"hero preview"',
      '"getIn preview"',
      '"pledge preview"',
      '". preview"',
    ]);
    for (const [cls, area] of [["hero", "hero"], ["getIn", "getIn"], ["pledge", "pledge"]]) {
      expect(wide, cls).toMatch(new RegExp(`\\.${cls} \\{\\s*grid-area: ${area};`));
    }
    expect(wide).toMatch(/\.fold > \.preview \{\s*grid-area: preview;/);
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
    expect(text).toContain("Source: the court's opinion in FTC v. Meta, pages 8 and 9, citing Meta's own figures.");
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
    // The whole section, word for word: nothing added.
    expect(text).toBe(
      [
        "Where did your friends go? 7%",
        "In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.",
        "Source: the court's opinion in FTC v. Meta, pages 8 and 9, citing Meta's own figures.",
        "On our.one, your feed is only the people you chose, and then it ends.",
        "A ranked feed Home Sponsored Suggested for you M Mara Made it to the top before the rain. Suggested for you Sponsored Suggested for you and it keeps going",
        // Changed after the verification of M-0020 (H2): the illustration's our.one side names its feed Feed.
        "our.one Feed M Mara Made it to the top before the rain. T Tomas Soup's on tonight. Door's open from 7. J Jana Finished the book you lent me. That's everything from the last 14 days.",
        "Illustration.",
      ].join(" "),
    );
  });

  it("how it works: three steps, in order", () => {
    const html = section(render(), "front-how");
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("How it works");
    const steps = [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => textOf(m[1]!));
    expect(steps).toEqual([
      "1 Join Your email, a name and a username. It's free, and you need to be 18 or older.",
      `2 Bring your people You get ${DEFAULT_INVITES} invites. It stays quiet until the people you care about are here, so send them to the ones you'd actually want to hear from.`,
      "3 Catch up, then close it Their posts, newest first. When there's nothing new, it says so.",
    ]);
    expect(html).toMatch(/<ol role="list"/);
    expect(html.match(/<h3>/g)).toHaveLength(3);
  });

  it("keep your people, change who runs it: why it exists, WhatsApp in three dated lines, each linked to its source, then the promise and what holds it", () => {
    const html = section(render(), "front-runs");
    const text = textOf(html);
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("Keep your people. Change who runs it.");
    // Why it exists comes first, in the maintainer's voice (D-0016 §E).
    expect(REASON_LEAD).toBe("The people make the network.");
    expect(REASON).toBe(
      "You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.",
    );
    expect(text.indexOf(REASON_LEAD)).toBeLessThan(text.indexOf("WhatsApp, in three dates"));
    expect(html).toMatch(/<p class="[^"]*">The people make the network\.<\/p>/);
    expect(text).toContain("WhatsApp, in three dates");
    const story = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    const lines = [...story.matchAll(/<li>(.*?)<\/li>/g)].map((m) => textOf(m[1]!));
    expect(lines).toEqual([
      "2012 WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
      "2014 Facebook agreed to buy it for about $19 billion.",
      "2025 WhatsApp announced ads in Status, in its Updates tab.",
    ]);
    // The 2025 line is what Meta announced, linked to its own announcement (D-0016 §F).
    expect(links(story).map(([, href]) => href)).toEqual([
      "https://blog.whatsapp.com/why-we-don-t-sell-ads",
      "https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/",
      "https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/",
    ]);
    for (const [, , tag] of links(story)) {
      expect(tag).toContain('rel="noopener noreferrer"');
      expect(tag).toContain('target="_blank"');
    }
    expect(html).toMatch(
      /<p class="[^"]*"><strong>An owner can sell it, change it or shut it down\. A maintainer does the job, or is replaced\.<\/strong><\/p>/,
    );
    for (const sentence of [
      "our.one has a maintainer: me, Rado. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice. In Settings, you can download your profile, posts, replies and connections, and delete it all. If your account is suspended, write to us and we will do it for you.",
      `When ${THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
      "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
      "12 people are in. You'd be #13.",
      "Read the contract See every cost Read the code",
    ]) {
      expect(text, sentence).toContain(sentence);
    }
    // The whole section, word for word: nothing added.
    expect(text).toBe(
      [
        "Keep your people. Change who runs it.",
        "The people make the network.",
        "You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.",
        "WhatsApp, in three dates",
        "2012 WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
        "2014 Facebook agreed to buy it for about $19 billion.",
        "2025 WhatsApp announced ads in Status, in its Updates tab.",
        "An owner can sell it, change it or shut it down. A maintainer does the job, or is replaced.",
        "our.one has a maintainer: me, Rado. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice. In Settings, you can download your profile, posts, replies and connections, and delete it all. If your account is suspended, write to us and we will do it for you.",
        `When ${THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
        "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
        "12 people are in. You'd be #13.",
        "Read the contract See every cost Read the code",
      ].join(" "),
    );
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
      [
        "What if my friends aren't on it?",
        "At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
      ],
      ["Can I post photos?", "Not yet. Posts are words for now."],
      ["Is there an app?", "Not yet. our.one works in your phone's browser, and you can add it to your home screen."],
      [
        "Why should I believe you?",
        "Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost.",
      ],
      [
        `What if it never gets to ${THRESHOLD}?`,
        "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.",
      ],
      [
        "What's a maintainer?",
        `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`,
      ],
    ]);
  });

  it("the sections come in SPEC §18.16's order, with one h1 and an h2 each", () => {
    const heading = (html: string) =>
      [...html.matchAll(/<h([12])\b[^>]*>(.*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]!)}`);
    const common = [
      "h1 Just your people. Then you're done.",
      "h2 Join our.one",
      "h2 Where did your friends go?",
      "h2 How it works",
      "h2 Keep your people. Change who runs it.",
      "h2 Fair questions",
    ];
    expect(heading(render())).toEqual([...common, "h2 Who would you like to hear from?"]);
    expect(heading(render({ seatsOpen: 0 }))).toEqual([...common, "h2 Who would you like to hear from?"]);
    expect(heading(render({ joining: false }))).toEqual(common);
  });

  // Changed under M-0020 (D-0023 §C): a signed-in visitor stays, and is
  // shown their feed where a visitor is asked to join.
  it("a signed-in visitor stays on the front door", async () => {
    const source = readFileSync(join(WEB_ROOT, "src/app/(public)/page.tsx"), "utf8");
    expect(source).not.toMatch(/redirect\("\/home"\)/);
    expect(source).toContain("member={member}");
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

describe("the status line (D-0016 §J)", () => {
  it("says who maintains it today, and what is promised at the threshold, to whom", () => {
    expect(STATUS_LINE).toBe(
      `Maintained by its founder. Promised: when ${THRESHOLD} people have joined, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.`,
    );
    expect(textOf(renderToStaticMarkup(createElement(SiteFooter)))).toContain(STATUS_LINE);
  });

  it("needs no listing in the claims scan, and the old line is caught on every page", () => {
    for (const file of [null, "src/components/RightColumn.tsx", "src/app/(public)/power/page.tsx", "src/components/public/FrontPage.tsx"]) {
      expect(scanText(STATUS_LINE, file), String(file)).toEqual([]);
      expect(scanText(`Maintained by its founder. Handed to its members at ${THRESHOLD}.`, file).length, String(file)).toBeGreaterThan(0);
      expect(scanText(`It was Handed to its members at ${THRESHOLD}.`, file).length, String(file)).toBeGreaterThan(0);
    }
  });
});

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
  it("the phone: /home as the app draws it on a phone, from the app's own parts, with fictional people, and says so (the verification of M-0013)", () => {
    const html = renderToStaticMarkup(createElement(FeedPreview));
    expect(html).toContain("An example feed. Fictional people.");
    // The app's own markers, in FeedList's order: three posts from after the last visit (2 days
    // before), the caught-up marker above the first post from before it, then the end of the 14 days.
    expect(PREVIEW_LAST_VISIT.getTime()).toBe(PREVIEW_NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    const caughtUp = renderToStaticMarkup(createElement(CaughtUpMarker, { since: PREVIEW_LAST_VISIT, now: PREVIEW_NOW }));
    const end = renderToStaticMarkup(createElement(EndMarker));
    expect(html).toContain(caughtUp);
    expect(html).toContain(end);
    expect(textOf(html)).toBe(
      [
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
      ].join(" "),
    );
    // No like count on another person's post (SPEC §7): the like's count span is empty on all four.
    expect(html.match(/<span class="action action--like"><span class="action__icon">[\s\S]*?<\/span><span class="action__count"><\/span>/g)).toHaveLength(4);
    // The app's post rows, not a look-alike: its classes, and its four icons on each.
    expect(html.match(/<article class="post">/g)).toHaveLength(4);
    for (const part of ["post__audience", "post__menu", "action action--reply", "action action--like"]) {
      expect(html.match(new RegExp(`class="${part}"`, "g")), part).toHaveLength(4);
    }
    expect(html).not.toMatch(/<a\b|<button\b|tabindex/);
    expect(html).not.toMatch(/\bOURS\b/);
  });

  it("the illustration: a ranked feed beside ours, captioned as an illustration", () => {
    const html = renderToStaticMarkup(createElement(FeedContrast));
    const text = textOf(html);
    expect(text.startsWith("A ranked feed")).toBe(true);
    expect(text).toContain("and it keeps going");
    // The our.one side ends where the app's feed ends, in EndMarker's words.
    expect(text).toContain(`${textOf(renderToStaticMarkup(createElement(EndMarker)))} Illustration.`);
    expect(text.endsWith("Illustration.")).toBe(true);
    expect(html).toMatch(/<figure [^>]*aria-label="Illustration: a ranked feed that keeps going, beside an our\.one feed that ends"/);
    expect(html).not.toMatch(/\bOURS\b|Instagram/);
  });
});
