/**
 * /contract (SPEC §18.3 and §18.8, Builder A; M-0011 acceptance): every
 * promise with its "Held today by" line, the "never gets to 100,000"
 * paragraph, word for word; the footer's link to it; and, across every
 * public page, that no page says the handover has happened (D-0012:
 * "Claims that the handover has happened, before it has" are prohibited).
 *
 * The handover check is CHECKED, not ENFORCED: it reads words, not
 * meaning. It holds every sentence that says "handed" to the two that
 * may (the status line's promise and "nothing is handed over"), and looks
 * for the handover told in the past or perfect tense.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import ContractPage, { metadata } from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import FrontPageRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import { FrontPage } from "@/components/public/FrontPage";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { OPEN_CODE_URL, SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { HANDOVER_THRESHOLD } from "@/core/config";

const THRESHOLD = HANDOVER_THRESHOLD.toLocaleString("en-US");

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

const contract = () => renderToStaticMarkup(createElement(ContractPage));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/contract, word for word (SPEC §18.3)", () => {
  it("is titled 'The contract', with one h1", () => {
    expect(metadata.title).toBe("The contract");
    const html = contract();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(textOf(html.slice(html.indexOf("<h1"), html.indexOf("</h1>")))).toBe("The contract");
  });

  it("opens with the two paragraphs", () => {
    const text = textOf(contract());
    expect(text).toContain(
      "The contract Between the people who use our.one and its maintainer. Most terms of service list what you can't do. This one lists what the maintainer can't do, and says what holds each promise today: this contract, the code, or the law. " +
        `The maintainer keeps our.one running and safe, acts on reports, and pays the bills. Today that is me, Rado. Until ${THRESHOLD} members I also hold the domain, the data and the keys, and I'm not paid.`,
    );
  });

  it("renders every promise in bold, numbered, each with its 'Held today by' line and link", () => {
    const html = contract();
    const list = html.slice(html.indexOf("<ol"), html.indexOf("</ol>") + 5);
    expect(list.startsWith("<ol")).toBe(true);
    const items = [...list.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]!);
    const expected: [string, string, [string, string] | null][] = [
      [
        "Neither our.one nor any part of it will be sold, and nobody will invest in it for a return.",
        "Held today by: this contract. This promise can never be changed.",
        null,
      ],
      [
        `At ${THRESHOLD} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day. The count is the number on the front page: accounts that exist and are not suspended.`,
        "Held today by: this contract. This promise can never be changed.",
        null,
      ],
      [
        "Your feed is your people, in order. No ranking, no ads, no selling your data.",
        "Held today by: this contract and the code.",
        null,
      ],
      [
        "You can leave with everything: download your profile, posts, replies and connections, and delete it all, whenever you want. For anything else we hold about you, write to us. If your account is suspended, write to us and we will do it for you.",
        "Held today by: this contract, the code and the law (GDPR).",
        null,
      ],
      ["Every cost is public. Money buys no reach and no say.", "Held today by: this contract. Costs", ["Costs", "/costs"]],
      [
        "The code will be public from launch, under an open licence (Apache-2.0): anyone will be able to read it, run it or copy it.",
        "Held today by: this contract until it is published, then the licence. Open code",
        ["Open code", OPEN_CODE_URL],
      ],
      [
        "Who holds each key is public.",
        "Held today by: this contract. Who controls what",
        ["Who controls what", "/power"],
      ],
      [
        "Changes come with notice. Any change to this contract is announced 60 days ahead, with the reason, and you can leave with everything before it applies. Promises 1 and 2 can't be changed at all.",
        "Held today by: this contract.",
        null,
      ],
    ];
    expect(items).toHaveLength(expected.length);
    items.forEach((item, i) => {
      const [promise, heldBy, link] = expected[i]!;
      const bold = item.match(/<strong>(.*?)<\/strong>/);
      expect(textOf(bold?.[1] ?? ""), `promise ${i + 1}`).toBe(promise);
      const after = item.slice(item.indexOf("</strong>"));
      expect(textOf(after), `promise ${i + 1}`).toBe(heldBy);
      const links = [...after.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[2], m[1]]);
      expect(links, `promise ${i + 1}`).toEqual(link ? [link] : []);
    });
    // The open-code link leaves the site the way the footer's does.
    expect(list).toMatch(new RegExp(`<a href="${OPEN_CODE_URL}" rel="noopener noreferrer" target="_blank">Open code</a>`));
  });

  it("says what happens if it never gets to 100,000, and closes by saying these are promises", () => {
    const html = contract();
    const start = html.indexOf('<section aria-labelledby="contract-never"');
    expect(start).toBeGreaterThan(html.indexOf("</ol>"));
    const never = html.slice(start, html.indexOf("</section>", start));
    expect(never).toMatch(new RegExp(`<h2 id="contract-never">If it never gets to ${THRESHOLD}</h2>`));
    expect(textOf(never)).toBe(
      `If it never gets to ${THRESHOLD} Nothing is handed over. Promise 1 still holds, the code stays open, and you can leave with everything.`,
    );
    const closing = textOf(html.slice(html.indexOf("</section>")));
    expect(closing).toBe(
      `Until ${THRESHOLD}, these are my promises, written into the terms you join under. That is weaker than a law, and this page says so.`,
    );
  });

  it("is linked from the footer of every public page, and from the in-app footer", () => {
    for (const html of [
      renderToStaticMarkup(createElement(SiteFooter)),
      renderToStaticMarkup(createElement(InAppSiteFooter)),
    ]) {
      expect(html).toMatch(/<a href="\/contract">Contract<\/a>/);
      expect(textOf(html)).toContain("Contract · Open code · Costs · Who controls what · Rules · Privacy");
    }
  });
});

/* ------------------------------------------------ the handover, never done */

/**
 * A page's text, one line per block (heading, paragraph, list item, term),
 * so a heading with no full stop does not run into the sentence after it.
 */
function blocksOf(html: string): string {
  // A control character, not whitespace: textOf collapses whitespace.
  return textOf(html.replace(/<\/(?:h[1-6]|p|li|dt|dd|div|section|header|footer|nav)>/g, "\u0001"))
    .split("\u0001")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** The sentences that say the handover has happened, or say "handed" where they may not. */
function handoverTold(text: string): string[] {
  const told: string[] = [];
  // The handover told as done: "has been handed", "was given", "is now held".
  for (const m of text.matchAll(
    /[^.?!\n]*\b(?:has|have|had|was|were)\s+(?:now\s+|already\s+)?(?:been\s+)?(?:handed|given|transferred)\b[^.?!\n]*/gi,
  )) {
    told.push(m[0].trim());
  }
  for (const m of text.matchAll(/[^.?!\n]*\b(?:gave (?:it )?away|(?:is|are) now (?:held|run|owned)|now belongs)\b[^.?!\n]*/gi)) {
    told.push(m[0].trim());
  }
  // "handed" only in the status line's promise and in "nothing is handed over".
  for (const m of text.matchAll(/[^.?!\n]*\bhanded\b[^.?!\n]*[.?!]?/gi)) {
    const sentence = m[0].trim();
    if (sentence === `Handed to its members at ${THRESHOLD}.`) continue;
    if (/^(?:Then nothing|Nothing) is handed over\.$/.test(sentence)) continue;
    told.push(sentence);
  }
  return told;
}

describe("no page says the handover has happened (D-0012)", () => {
  it("the check catches the handover told as done", () => {
    for (const claim of [
      "our.one has been handed to its members.",
      "The domain was handed over to the members' body.",
      "Rado gave it away last year.",
      "It is now held by its members.",
      "The data has been transferred.",
      "Handed to its members.",
      "It was handed over.",
    ]) {
      expect(handoverTold(claim), claim).not.toEqual([]);
    }
    for (const promise of [
      `Maintained by its founder. Handed to its members at ${THRESHOLD}.`,
      "Nothing is handed over.",
      "Then nothing is handed over.",
      `When ${THRESHOLD} people have joined, I hand over our.one's domain.`,
    ]) {
      expect(handoverTold(promise), promise).toEqual([]);
    }
  });

  it("not on the front page in any state, /contract, /power, /rules, /costs, /privacy or the footer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seats.memberCount.mockResolvedValue(HANDOVER_THRESHOLD - 1);
    seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
    const pages: [string, string][] = [
      ["/", renderToStaticMarkup((await FrontPageRoute()) as ReactElement)],
      ["/ (no count)", renderToStaticMarkup(createElement(FrontPage, { count: null, joining: false, seatsOpen: null }))],
      ["/contract", contract()],
      ["/power", renderToStaticMarkup(createElement(PowerPage))],
      ["/rules", renderToStaticMarkup(createElement(RulesPage))],
      ["/costs", renderToStaticMarkup(createElement(CostsPage))],
      ["/privacy", renderToStaticMarkup(createElement(PrivacyPage))],
      ["the footer", renderToStaticMarkup(createElement(SiteFooter))],
    ];
    for (const [page, html] of pages) {
      const text = blocksOf(html);
      expect(text.length, page).toBeGreaterThan(0);
      expect(handoverTold(text), page).toEqual([]);
    }
    // The status line states the handover with its condition, wherever it is shown.
    expect(STATUS_LINE).toBe(`Maintained by its founder. Handed to its members at ${THRESHOLD}.`);
  });

  it("the front page and /contract state the handover with its conditions, and what happens if the threshold is never reached", () => {
    const front = textOf(renderToStaticMarkup(createElement(FrontPage, { count: 0, joining: false, seatsOpen: null })));
    expect(front).toContain(
      `When ${THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
    );
    expect(front).toContain(
      `What if it never gets to ${THRESHOLD}? Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything.`,
    );
    const text = textOf(contract());
    expect(text).toContain(`At ${THRESHOLD} members, I hand over the domain, the data and the right to replace the maintainer`);
    expect(text).toContain("founded by their vote under rules published before that day");
    expect(text).toContain(`If it never gets to ${THRESHOLD} Nothing is handed over.`);
    expect(text).toContain(`Until ${THRESHOLD}, these are my promises`);
  });
});
