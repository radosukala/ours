/**
 * The front door, `/` (D-0020 §A, §B, §E and §F; M-0017; SPEC §18.19):
 *
 * - the message, the two entrances, and what holds today;
 * - every possibility and the illustration carry their labels;
 * - the agreement's rights are shown as proposed, and nothing says user
 *   control, the holder or a safeguard exists;
 * - no status that turns false at the deploy;
 * - the feed's way in: its join form, the count and the lines under them,
 *   by the same gates as /feed, and none while joining is closed;
 * - the drafts: links to /maintainers without JavaScript, nothing sent or
 *   stored, email only with PROPOSALS_EMAIL set;
 * - the route: signed-out visitors see it, its title, and the database
 *   read for the count and the seats, left out when it fails;
 * - /feed: the feed's former front page, word for word;
 * - the public layout: the four places and Sign in, the line and the
 *   footer on every public page;
 * - nothing on it loads from another origin, and the claims scan finds
 *   nothing in it.
 *
 * Denial paths first. The presentational FrontDoor is rendered with each
 * state as props; the routes with the seats module and the Get in action
 * mocked. Every address is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import FeedPageRoute, { metadata as feedMetadata } from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import FrontDoorRoute, { metadata } from "@/app/(public)/page";
import MaintainersPage from "@/app/(public)/maintainers/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import {
  DOOR_EYEBROW,
  DOOR_LEDE,
  DOOR_STATUS,
  DOOR_TITLE,
  ENTRANCES,
  ILLUSTRATION,
  OPEN_FOOT,
  OPEN_ROWS,
  OURS_RIGHTS,
  OURS_STATUS,
  POSSIBILITIES,
  POSSIBILITY_LABEL,
  TAGLINE,
  partFoot,
} from "@/components/public/door";
import {
  DRAFT_CLOSE,
  DRAFT_FALLBACK,
  DRAFT_KINDS,
  MAILTO_LIMIT,
  draftMailto,
  draftText,
} from "@/components/public/drafts";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { FRONT_PAGE_TITLE, HEADLINE } from "@/components/public/FrontPage";
import { countLine, FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, WAITING_LIST_LABEL } from "@/components/public/join";
import { LEDE } from "@/components/public/lede";
import { PLACES } from "@/components/public/PublicNav";
import { STATUS_LINE } from "@/components/RightColumn";
import { scanText } from "@/core/claims";
import { AGENT_LINE } from "@/core/kit-info";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

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
    createElement(FrontDoor, { joining: true, email: null, count: 12, seatsOpen: 3, seatsWaiting: 0, ...props }),
  );
}

/** The HTML of the section with this id. */
function section(html: string, id: string): string {
  const start = html.lastIndexOf("<section", html.indexOf(`id="${id}"`));
  return html.slice(start, html.indexOf("</section>", start));
}

/** Every <a> in this HTML, as [text, href]. */
function links(html: string): [string, string][] {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)].map((m) => [textOf(m[2]!), m[1]!]);
}

const STATES: FrontDoorProps[] = [];
for (const joining of [true, false]) {
  for (const email of [null, "ideas@example.test"]) {
    for (const count of [null, 0, 1, 1284]) {
      for (const [seatsOpen, seatsWaiting] of [[null, null], [0, 0], [3, 0], [1, 2]] as const) {
        STATES.push({ joining, email, count, seatsOpen, seatsWaiting });
      }
    }
  }
}

beforeEach(() => {
  seats.memberCount.mockReset();
  seats.seatState.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------ denials */

describe("what the front door never says (D-0020 §F)", () => {
  it("in no state does it say user control, the holder or a safeguard exists, and nothing turns false at the deploy", () => {
    for (const state of STATES) {
      const text = textOf(render(state));
      expect(text, JSON.stringify(state)).not.toMatch(/\bnot deployed\b|\bis deployed\b|\blive now\b|\btested locally\b/i);
      expect(text).not.toMatch(/user control (?:is|has been) built|users (?:now )?control|the holder (?:exists|holds)|safeguards? (?:is|are) built/i);
      expect(text).not.toMatch(/\bis being built\b/i);
      expect(text).toContain(DOOR_STATUS);
    }
  });

  it("the claims scan finds nothing in any rendered state, nor in its source files", () => {
    for (const state of STATES) {
      expect(scanText(textOf(render(state)), null).map((h) => h.match), JSON.stringify(state)).toEqual([]);
    }
    for (const file of [
      "src/components/public/door.ts",
      "src/components/public/FrontDoor.tsx",
      "src/components/public/Diagram.tsx",
      "src/components/public/Continuity.tsx",
      "src/components/public/drafts.ts",
      "src/components/public/Draft.tsx",
      "src/app/(public)/page.tsx",
    ]) {
      expect(scanText(read(file), file).map((h) => h.match), file).toEqual([]);
    }
  });

  it("promises no pay, audience or income: pay is conditional on people choosing and funding a service", () => {
    const text = textOf(render());
    expect(text).toContain("When people choose a service and fund it, its agreed budget can pay you, or your team, to run it.");
    expect(text).toContain("An audience and an income still have to be earned.");
    expect(text).not.toMatch(/you(?:'ll| will) (?:be paid|get paid|earn)|guaranteed/i);
  });

  it("nothing on it loads from another origin: no script, image, frame or stylesheet from elsewhere, and its one outside link opens the code", () => {
    const html = render({ email: "ideas@example.test" });
    expect(html).not.toMatch(/<(?:script|img|iframe|link|source|video|audio)\b[^>]*\b(?:src|href)="https?:/i);
    const outside = links(html).filter(([, href]) => /^https?:/.test(href));
    expect(outside.map(([, href]) => href)).toEqual([
      "https://github.com/radosukala/ours/tree/main/apps/web",
      "https://github.com/radosukala/ours/tree/main/apps/web",
    ]);
  });

  it("without JavaScript, no draft is built on the server and nothing leads to email: each draft button is a link to /maintainers' instructions", () => {
    for (const email of [null, "ideas@example.test"]) {
      const html = render({ email });
      expect(html).not.toContain("<dialog");
      expect(html).not.toContain("mailto:");
      const drafts = links(html).filter(([text]) => /^Draft /.test(text));
      expect(drafts).toEqual([
        ["Draft an idea first ↗", DRAFT_FALLBACK.idea],
        ["Draft a need ↗", DRAFT_FALLBACK.need],
        ["Draft an idea ↗", DRAFT_FALLBACK.idea],
      ]);
    }
    const maintainers = renderToStaticMarkup(createElement(MaintainersPage));
    for (const anchor of Object.values(DRAFT_FALLBACK)) {
      expect(maintainers).toContain(`id="${anchor.split("#")[1]}"`);
    }
  });

  it("while joining is closed: no form, 'Joining opens soon.', the line for an invite, and the feed's button says 'See the feed'", () => {
    const html = render({ joining: false, seatsOpen: null });
    expect(html).not.toContain("<form");
    const text = textOf(html);
    expect(text).toContain("Joining opens soon.");
    expect(text).toContain(INVITE_CLOSED_LINE);
    expect(text).not.toContain(FREE_LINE);
    expect(links(html)).toContainEqual(["See the feed ↗", "/feed"]);
    expect(text).not.toContain("Join the feed");
  });

  it("a count that couldn't be read is left out; the page still renders", () => {
    const text = textOf(render({ count: null }));
    expect(text).not.toMatch(/people are in|person is in|Nobody is in yet/);
    expect(text).toContain(DOOR_LEDE);
  });
});

/* ------------------------------------------------------------- the copy */

describe("the front door's copy (D-0020 §A)", () => {
  it("the message: eyebrow, headline, lede, the two entrances and what holds today, in that order", () => {
    const html = render();
    const text = textOf(html);
    const order = [DOOR_EYEBROW, TAGLINE, DOOR_LEDE, ENTRANCES.people, ENTRANCES.builders, DOOR_STATUS];
    let at = -1;
    for (const part of order) {
      const next = text.indexOf(part, at + 1);
      expect(next, part).toBeGreaterThan(at);
      at = next;
    }
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(textOf(html.slice(html.indexOf("<h1"), html.indexOf("</h1>")))).toBe(TAGLINE);
    expect(links(html)).toEqual(expect.arrayContaining([[`${ENTRANCES.people} ↗`, "#part"], [`${ENTRANCES.builders} ↗`, "#build"], ["See where it stands.", "#open"]]));
  });

  it("the projects: the feed first, then two possibilities, each labelled with no project announced", () => {
    const html = section(render(), "projects");
    const text = textOf(html);
    expect(text).toContain("The first project");
    expect(text).toContain("Just your people. Then you're done.");
    expect(text).toContain(LEDE);
    for (const p of POSSIBILITIES) {
      expect(text).toContain(`${POSSIBILITY_LABEL} ${p.heading.join(" ")}`);
      expect(text).toContain(p.text);
    }
    expect(text.match(/no project announced/g)).toHaveLength(2);
    expect(text).toContain("Concept only");
    expect(text).toContain("An example feed. Fictional people.");
  });

  it("the feed's way in, while joining is open: the form, its button by the seats, the seat line, the free line, the privacy line and the count", () => {
    const open = textOf(render({ seatsOpen: 3, seatsWaiting: 0, count: 1284 }));
    expect(open).toContain(JOIN_LABEL);
    expect(open).toContain(FREE_LINE);
    expect(open).toContain(countLine(1284));
    expect(open).not.toContain("No seats are open right now.");
    const full = textOf(render({ seatsOpen: 0, seatsWaiting: 0 }));
    expect(full).toContain(WAITING_LIST_LABEL);
    expect(full).toContain("No seats are open right now. Seats go to whoever has waited longest.");
    expect(textOf(render({ seatsOpen: 1, seatsWaiting: 2 }))).toContain(WAITING_LIST_LABEL);
    expect(links(render())).toContainEqual(["Join the feed ↗", "/feed"]);
  });

  it("what 'ours' means: the three rights, marked Proposed, with the status and the link to the agreement", () => {
    const html = section(render(), "ours");
    const text = textOf(html);
    expect(text).toContain("Proposed");
    for (const r of OURS_RIGHTS) expect(text).toContain(`${r.title} ${r.text}`);
    expect(text).toContain(OURS_STATUS);
    expect(links(html)).toContainEqual(["Read the common agreement.", "/agreement"]);
  });

  it("the illustration says what it is: an illustration of something our.one can't do today, with no button before the page's JavaScript runs", () => {
    const html = section(render(), "ours");
    const text = textOf(html);
    expect(text).toContain(ILLUSTRATION.label);
    expect(text).toContain(ILLUSTRATION.idle);
    expect(ILLUSTRATION.done).toContain("An illustration");
    expect(html).not.toContain(ILLUSTRATION.change);
  });

  it("the builders: the invitation, the deal's terms, the line for a coding agent, the three steps and what passing means", () => {
    const html = section(render(), "build");
    const text = textOf(html);
    expect(text).toContain("Build something people can depend on.");
    expect(text).toContain(AGENT_LINE);
    expect(text).toContain("Passing makes it ready to propose, nothing more");
    expect(text).toContain("aren't built yet");
    expect(links(html)).toEqual(expect.arrayContaining([["The maintainer's deal ↗", "/maintainers"], ["Read build.md", "/build.md"], ["How building on our.one works.", "/build"]]));
  });

  it("in the open: four rows, each with its state, and who holds power today", () => {
    const html = section(render(), "open");
    const text = textOf(html);
    for (const row of OPEN_ROWS) expect(text).toContain(`${row.state} ${row.title} ${row.text} ${row.detail}`);
    expect(OPEN_ROWS.map((r) => r.state)).toEqual(["Built", "Built", "Draft", "Not built yet"]);
    expect(text).toContain(OPEN_FOOT);
    expect(links(html)).toContainEqual(["Who holds the power today", "/power"]);
  });

  it("your part: the feed, a need and an idea, with what a draft does, true with the address set and without it", () => {
    for (const email of [null, "ideas@example.test"]) {
      const text = textOf(section(render({ email }), "part"));
      expect(text).toContain("What should we make ours next?");
      expect(text).toContain(partFoot(email !== null));
    }
    expect(partFoot(false)).toContain("Needs and ideas open at launch");
    expect(partFoot(true)).toContain("A person reads every one.");
  });
});

/* ------------------------------------------------------------- the drafts */

describe("the drafts (D-0020 §D and §E)", () => {
  it("a draft is its subject, each question and answer, and a last line that promises nothing", () => {
    const text = draftText("need", ["A FICTIONAL calendar", "Ads", "Our events moved over"]);
    expect(text).toBe(
      [
        "A need for our.one",
        "What do you use today?\nA FICTIONAL calendar",
        "What would you change?\nAds",
        "What would make you try an alternative?\nOur events moved over",
        DRAFT_CLOSE,
      ].join("\n\n"),
    );
    expect(DRAFT_CLOSE).toBe("A starting point for a conversation, not a promise to join, fund or build anything.");
    expect(draftText("idea", ["a", "b", "c"]).startsWith("An idea for our.one\n\nWhat would you build, and for whom?\na")).toBe(true);
  });

  it("the email link carries the draft only while it is short enough; past the limit, the subject only", () => {
    const short = draftMailto("ideas@example.test", "idea", draftText("idea", ["a", "b", "c"]));
    expect(short.whole).toBe(true);
    expect(short.href.startsWith("mailto:ideas@example.test?subject=An%20idea%20for%20our.one&body=")).toBe(true);
    const long = draftMailto("ideas@example.test", "need", draftText("need", ["x".repeat(600), "y".repeat(600), "z".repeat(600)]));
    expect(long).toEqual({ href: "mailto:ideas@example.test?subject=A%20need%20for%20our.one", whole: false });
    expect(MAILTO_LIMIT).toBe(1800);
  });

  it("the idea's questions are the early parts of a proposal: what, for whom, what they use today, and how to find out", () => {
    expect(DRAFT_KINDS.idea.questions.map((q) => q.label)).toEqual([
      "What would you build, and for whom?",
      "What do those people use today?",
      "How would you find out whether they want it?",
    ]);
    expect(DRAFT_KINDS.idea.questions[2].hint).toBe("Interest is a start. It isn't an audience, or funding.");
  });

  it("the dialog stores nothing: no storage, cookie, fetch or form in Draft.tsx, and the email button only with an address", () => {
    const source = read("src/components/public/Draft.tsx");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|<form|navigator\.sendBeacon/);
    expect(source).toContain("{email !== null ? (");
  });

  it("/privacy says what the drafts do, with the address set and without it", () => {
    const without = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(without).toContain("When you draft a need or an idea on our pages, what you type stays in your browser. Nothing is saved or sent, and it's gone when you close or reload the page, unless you copy it.");
    vi.stubEnv("PROPOSALS_EMAIL", "ideas@example.test");
    const withAddress = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(withAddress).toContain("unless you copy it or open it in your own email app and send it yourself.");
  });

  it("/projects shows the two possibilities, labelled, and the drafts as links without JavaScript", () => {
    const html = renderToStaticMarkup(createElement(ProjectsPage));
    const text = textOf(html);
    for (const p of POSSIBILITIES) expect(text).toContain(`${POSSIBILITY_LABEL} ${p.heading.join(" ")} ${p.text}`);
    expect(text).toContain("Neither is a project: nothing is announced, and no one has proposed either to our.one.");
    expect(links(html)).toEqual(expect.arrayContaining([["Draft a need ↗", DRAFT_FALLBACK.need], ["Draft an idea ↗", DRAFT_FALLBACK.idea], ["The feed's page", "/feed"]]));
  });
});

/* ------------------------------------------------------------- the routes */

describe("the routes", () => {
  it("/ renders the front door for a signed-out visitor, with the count and the seats read, and its title", async () => {
    seats.memberCount.mockResolvedValue(1284);
    seats.seatState.mockResolvedValue({ open: 0, waiting: 0 });
    const html = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    const text = textOf(html);
    expect(text).toContain(TAGLINE);
    expect(text).toContain(countLine(1284));
    expect(text).toContain(WAITING_LIST_LABEL);
    expect(metadata.title).toEqual({ absolute: DOOR_TITLE });
    expect(DOOR_TITLE).toBe("our.one · The software we live in should be ours.");
  });

  it("/ still renders when the database is down: no count, no error", async () => {
    seats.memberCount.mockRejectedValue(new Error("FICTIONAL outage"));
    seats.seatState.mockRejectedValue(new Error("FICTIONAL outage"));
    const text = textOf(renderToStaticMarkup((await FrontDoorRoute()) as ReactElement));
    expect(text).toContain(TAGLINE);
    expect(text).not.toMatch(/people are in/);
  });

  it("/feed renders the feed's former front page: its headline, its lede and its title", async () => {
    seats.memberCount.mockResolvedValue(12);
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    const text = textOf(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    expect(text).toContain(`${HEADLINE[0]} ${HEADLINE[1]}`);
    expect(text).toContain(LEDE);
    expect(text).toContain(countLine(12));
    expect(feedMetadata.title).toEqual({ absolute: FRONT_PAGE_TITLE });
  });

  it("both routes send a signed-in visitor to /home, as the front page did", () => {
    for (const file of ["src/app/(public)/page.tsx", "src/app/(public)/feed/page.tsx"]) {
      expect(read(file), file).toContain('if (await signedIn()) redirect("/home");');
    }
  });
});

/* ------------------------------------------------------------- the kit */

describe("build.md starts with the idea (D-0020 §D)", () => {
  const ROOT = join(WEB_ROOT, "..", "..");
  const buildMd = () => readFileSync(join(ROOT, "kit/build.md"), "utf8");

  it("step 2 drafts the idea before anything is set up: it comes before the tool, and no command runs in it", () => {
    const md = buildMd();
    const steps = [...md.matchAll(/^## (\d)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2]}`);
    expect(steps).toEqual([
      "1. Ask the person",
      "2. Draft the idea, before any code",
      "3. Get the tool, and set the project up",
      "4. Fill in our.one.json and COSTS.md",
      "5. Build",
      "6. Check",
      "7. Propose",
    ]);
    const step2 = md.slice(md.indexOf("## 2. Draft the idea"), md.indexOf("## 3. Get the tool"));
    expect(step2).not.toMatch(/```(?:sh|powershell)|node scripts|curl |npm |pnpm /);
    expect(step2).toContain("**find out first, or build now?**");
    expect(step2).toContain("Interest is a start. It isn't an audience, or funding.");
    expect(step2).toContain("stop here");
  });

  it("the headings it asks for are the tool's PITCH.md headings, in the same order, so init leaves the draft as it is and the check reads it", () => {
    const md = buildMd();
    const step2 = md.slice(md.indexOf("## 2. Draft the idea"), md.indexOf("## 3. Get the tool"));
    const asked = [...step2.slice(step2.indexOf("```text"), step2.indexOf("```", step2.indexOf("```text") + 7)).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const tool = readFileSync(join(ROOT, "kit/our-one.mjs"), "utf8");
    const template = tool.slice(tool.indexOf("const PITCH_TEMPLATE"), tool.indexOf("`;", tool.indexOf("const PITCH_TEMPLATE")));
    expect(asked).toEqual([...template.matchAll(/^## (.+)$/gm)].map((m) => m[1]));
    expect(asked).toHaveLength(7);
    expect(md).toContain("| `PITCH.md` | The proposal: `init` writes it only if step 2 didn't |");
  });

  it("step 1 asks how to find out whether people want it, and step 7 finishes the draft", () => {
    const md = buildMd();
    expect(md).toContain("9. How could they find out whether those people want it: people they could\n   ask, or a trial they could offer?");
    expect(md).toContain("Finish `PITCH.md` with the person: the parts you left as TODO in step 2,");
  });

  it("the line for a coding agent is the same on /build, the front door and in the kit's README, and points at build.md", () => {
    expect(AGENT_LINE).toBe("Read https://our.one/build.md and follow it to help me bring my idea to our.one.");
    expect(readFileSync(join(ROOT, "kit/README.md"), "utf8")).toContain(AGENT_LINE);
    expect(textOf(section(render(), "build"))).toContain(AGENT_LINE);
  });
});

/* ------------------------------------------------------------- the layout */

describe("the public layout (D-0020 §B)", () => {
  it("the header: the wordmark, the four places and Sign in; the footer: the line, the site footer and the status line", () => {
    const html = renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"));
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    // The wordmark is "our", the dot and "one" in spans; it reads as its label.
    const wordmark = header.match(/<a [^>]*>/)![0];
    expect(wordmark).toContain('href="/"');
    expect(wordmark).toContain('aria-label="our.one, home"');
    expect(links(header).slice(1)).toEqual([
      ...PLACES.map((p) => [p.label, p.href] as [string, string]),
      ["Sign in", "/signin"],
    ]);
    const footer = textOf(html.slice(html.indexOf("<footer"), html.indexOf("</footer>")));
    expect(footer).toContain(TAGLINE);
    expect(footer).toContain(STATUS_LINE);
    expect(footer).toContain("Build with us");
  });
});
