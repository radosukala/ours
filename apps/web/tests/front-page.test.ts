/**
 * The front page (SPEC §18.2 and §18.8, Builder A; M-0011 acceptance):
 *
 * - the headline, with the threshold from its one constant;
 * - the count's three forms, and no count at all when it can't be read;
 * - "Joining opens soon." while joining is closed;
 * - the form and the seat line while it is open;
 * - the rest of the copy, word for word.
 *
 * Denial paths first. Nothing here depends on how seats are built (Builder
 * B's part): the presentational FrontPage is rendered with each state as
 * props, and the route is rendered with the seats module and the Get in
 * action mocked. Every address is FICTIONAL.
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
import {
  countLine,
  FRONT_PAGE_TITLE,
  FrontPage,
  type FrontPageProps,
  seatLine,
} from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL, GetInFormView } from "@/components/public/GetInForm";
import { HANDOVER_THRESHOLD } from "@/core/config";

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
    expect(text).toContain(`Today it's mine. At ${THRESHOLD} members, I give it away.`);
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

  it("shows the count from memberCount only, never the waiting list", async () => {
    seats.memberCount.mockResolvedValue(1284);
    seats.seatState.mockResolvedValue({ open: 0, waiting: 777 });
    const text = textOf(await renderRoute());
    expect(text).toContain("1,284 people are in. You'd be #1,285.");
    expect(text).not.toContain("777");
    expect(text).not.toContain("2,061"); // members and the line added together
  });

  it("has no progress bar", async () => {
    seats.memberCount.mockResolvedValue(1284);
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    for (const html of [await renderRoute(), render({ count: 0 }), render({ count: 99_999 })]) {
      expect(html).not.toMatch(/<progress|<meter|role="progressbar"|%/);
    }
  });
});

describe("the headline and the title", () => {
  it("is one h1 on two lines, with the threshold from its constant", () => {
    const html = render();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>") + 5);
    expect(h1).toBe(
      `<h1 class="headline ${h1.match(/class="headline ([^"]*)"/)![1]}"><span>Today it&#x27;s mine.</span> <span>At ${THRESHOLD} members, I give it away.</span></h1>`,
    );
    expect(THRESHOLD).toBe("100,000");
  });

  it("the metadata title is 'our.one · Today it's mine. At 100,000 members, I give it away.'", () => {
    const expected = `our.one · Today it's mine. At ${THRESHOLD} members, I give it away.`;
    expect(FRONT_PAGE_TITLE).toBe(expected);
    expect(metadata.title).toEqual({ absolute: expected });
  });

  it("the lede is SPEC §18.2's", () => {
    expect(textOf(render())).toContain(
      "our.one is a social network for your people: their posts, in order, with an end when you're caught up. No ads. No ranking.",
    );
  });
});

describe("Get in", () => {
  it("reads 'Joining opens soon.' with no form while no data controller is named, and never asks for the seats", async () => {
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
    expect(getIn).not.toContain("We use your address only to send you the link");
    expect(seats.seatState).not.toHaveBeenCalled();
    // The count is still shown, and so is the way in for people with an invite.
    expect(textOf(html)).toContain("3 people are in. You'd be #4.");
    expect(getIn).toContain("Have an invite? Open the link you were sent.");
    expect(section(html, "front-get-in")).toMatch(/<a [^>]*href="\/signin"[^>]*>Sign in<\/a>/);
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

  it("shows the form, the seat line and the privacy note when joining is open", async () => {
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockResolvedValue({ open: 12, waiting: 0 });
    const html = section(await renderRoute(), "front-get-in");
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
    expect(text).toContain("12 seats open.");
    expect(text).toContain(
      "We use your address only to send you the link. What we keep, and for how long, is in Privacy.",
    );
    expect(html).toMatch(/<a [^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(text).toContain("Have an invite? Open the link you were sent.");
    // The form comes first, then the seat line, then the note.
    expect(text.indexOf("Get in Your email")).toBeLessThan(text.indexOf("12 seats open."));
    expect(text.indexOf("12 seats open.")).toBeLessThan(text.indexOf("We use your address"));
  });

  it("the seat line: '{open} seats open.', '1 seat open.', and none", () => {
    expect(seatLine(12)).toBe("12 seats open.");
    expect(seatLine(1000)).toBe("1,000 seats open.");
    expect(seatLine(1)).toBe("1 seat open.");
    expect(seatLine(0)).toBe("No seats open right now. Leave your address and you'll get the next one.");
    for (const open of [0, 1, 2, 1000]) {
      expect(textOf(render({ seatsOpen: open }))).toContain(seatLine(open));
    }
  });

  it("leaves the seat line out, and keeps the form, when the seats can't be read", async () => {
    seats.memberCount.mockResolvedValue(3);
    seats.seatState.mockRejectedValue(new Error("FICTIONAL: the database is down"));
    const html = section(await renderRoute(), "front-get-in");
    expect(html).toContain("<form");
    expect(textOf(html)).not.toMatch(/seats? open|No seats/);
    expect(textOf(html)).toContain("We use your address only to send you the link");
  });

  it("after any valid submission, everyone reads the same words; a refusal is shown at the field", () => {
    const view = (state: { ok: true } | { error: string } | null) =>
      renderToStaticMarkup(createElement(GetInFormView, { state, action: () => {}, pending: false }));
    expect(CHECK_YOUR_EMAIL).toBe(
      "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.",
    );
    const answered = view({ ok: true });
    expect(answered).toMatch(/<p class="notice notice--ok" role="status">Check your email\./);
    expect(textOf(answered)).toContain(CHECK_YOUR_EMAIL);
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

describe("the rest of the page, word for word (SPEC §18.2)", () => {
  it("the promise, with the link to the contract and the signature", () => {
    const html = section(render(), "front-promise");
    const text = textOf(html);
    expect(text).toBe(
      [
        "The promise",
        `When ${THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
        "Until then I run it as its maintainer, under a public contract. Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice, and you can always leave with everything.",
        "Today these promises are held by that contract, the terms you join under, not yet by law.",
        "Read the contract",
        "Rado, maintainer",
      ].join(" "),
    );
    expect(html).toMatch(/<a [^>]*href="\/contract"[^>]*>Read the contract<\/a>/);
  });

  it("why a maintainer, not an owner: each sentence links to its source, and the last line is bold with no link", () => {
    const html = section(render(), "front-why");
    const story: [string, string][] = [
      [
        "In 2012, WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
        "https://blog.whatsapp.com/why-we-don-t-sell-ads",
      ],
      ["In 2014, Facebook agreed to buy it for about $19 billion.", "https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/"],
      [
        "In 2016, WhatsApp announced it would share users' phone numbers with Facebook.",
        "https://www.eff.org/deeplinks/2016/08/what-facebook-and-whatsapps-data-sharing-plans-really-mean-user-privacy-0",
      ],
      [
        "In 2018, one of its founders said: “I sold my users' privacy to a larger benefit.”",
        "https://www.cnbc.com/2018/09/26/whatsapp-co-founder-explains-why-he-left-facebook.html",
      ],
      ["In 2025, ads came to WhatsApp.", "https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html"],
    ];
    const links = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [textOf(m[2]!), m[1]!]);
    expect(links).toEqual(story);
    for (const m of html.matchAll(/<a [^>]*>/g)) {
      expect(m[0]).toContain('rel="noopener noreferrer"');
      expect(m[0]).toContain('target="_blank"');
    }
    expect(textOf(html.slice(html.indexOf("<h2"), html.indexOf("</h2>")))).toBe("Why a maintainer, not an owner");
    const last = html.slice(html.lastIndexOf("<p"));
    expect(last).toMatch(/^<p[^>]*><strong>An owner can sell it, change it or shut it down\. A maintainer does the job, or is replaced\.<\/strong><\/p>$/);
  });

  it("fair questions: each question a <dt>, each answer a <dd>", () => {
    const html = section(render(), "front-questions");
    const pairs = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [textOf(m[1]!), textOf(m[2]!)]);
    expect(pairs).toEqual([
      [
        "Why should I believe you?",
        "Don't take my word for it. Read the contract: it is the terms you join under. The code will be public from launch, and every cost is public.",
      ],
      [
        "Why not hand it over now?",
        `A proper not-for-profit body costs money and time, and I've built things before that nobody used. If ${THRESHOLD} people want this, it deserves one, with their say.`,
      ],
      [
        `What if it never gets to ${THRESHOLD}?`,
        "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything.",
      ],
      [
        `What happens at ${THRESHOLD}?`,
        "Members vote to found a not-for-profit body under rules published before that day. It gets the domain, the data and the right to replace the maintainer.",
      ],
      [
        "What's a maintainer?",
        `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, a body of its members holds it, and can replace me.`,
      ],
    ]);
  });

  it("the sections come in SPEC §18.2's order, with one h1 and an h2 each", () => {
    const html = render();
    const headings = [...html.matchAll(/<h([12])\b[^>]*>(.*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]!)}`);
    expect(headings).toEqual([
      `h1 Today it's mine. At ${THRESHOLD} members, I give it away.`,
      "h2 Get in",
      "h2 The promise",
      "h2 Why a maintainer, not an owner",
      "h2 Fair questions",
    ]);
    const text = textOf(html);
    expect(text.indexOf("No ranking.")).toBeLessThan(text.indexOf("12 people are in."));
    expect(text.indexOf("12 people are in.")).toBeLessThan(text.indexOf("Get in"));
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

describe("the first screen's picture of the product (SPEC §18.13)", () => {
  it("shows a feed that ends, with fictional people, and says they are fictional", async () => {
    const { FeedPreview } = await import("@/components/public/FeedPreview");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToStaticMarkup(createElement(FeedPreview));
    expect(html).toContain("Fictional people, for illustration.");
    expect(html).toContain("You&#x27;re caught up");
    expect(html).not.toMatch(/\bOURS\b/);
  });
});
