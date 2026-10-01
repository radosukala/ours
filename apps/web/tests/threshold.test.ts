/**
 * The handover threshold is one constant (SPEC §18.1; M-0011: "the
 * founder's confirmation of the number changes one line"). Here the
 * constant is 1,000,000, the other number the founder offered (D-0012 §B),
 * and every page and line that states the threshold follows it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/config")>()),
  HANDOVER_THRESHOLD: 1_000_000,
}));
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));

import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import PowerPage from "@/app/(public)/power/page";
import RulesPage from "@/app/(public)/rules/page";
import { countLine, FRONT_PAGE_TITLE, FrontPage } from "@/components/public/FrontPage";
import { SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { publicTextFiles } from "@/core/claims";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

describe("one constant, every page", () => {
  it("the front page, /contract, the status line and the pages that show it follow the constant", () => {
    // Since D-0015 the headline names no number (SPEC §18.15).
    expect(FRONT_PAGE_TITLE).toBe("our.one · Just your people. Then you're done.");
    expect(STATUS_LINE).toBe(
      "Maintained by its founder. Promised: when 1,000,000 people have joined, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.",
    );
    const front = textOf(renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 2 })));
    const contract = textOf(renderToStaticMarkup(createElement(ContractPage)));
    for (const [page, text, times] of [
      ["/", front, 4], // the signed card, the handover promise, one question and one answer
      ["/contract", contract, 4], // the maintainer's paragraph, promise 2, the h2, the closing
      ["/power", textOf(renderToStaticMarkup(createElement(PowerPage))), 1],
      ["/rules", textOf(renderToStaticMarkup(createElement(RulesPage))), 1],
      ["/costs", textOf(renderToStaticMarkup(createElement(CostsPage))), 1],
      ["the footer", textOf(renderToStaticMarkup(createElement(SiteFooter))), 1],
    ] as const) {
      expect(text, page).not.toContain("100,000");
      expect(text.split("1,000,000").length - 1, page).toBe(times);
    }
    expect(front).toContain(
      "When 1,000,000 people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.",
    );
    expect(countLine(999_999)).toBe("999,999 people are in. You'd be #1,000,000.");
    expect(contract).toContain("If it never gets to 1,000,000 Nothing is handed over.");
  });

  it("no file a person reads writes the threshold itself; only core/config.ts holds it", () => {
    const written: string[] = [];
    for (const file of publicTextFiles(WEB_ROOT)) {
      const text = readFileSync(join(WEB_ROOT, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const m of text.matchAll(/\b100(?:,|_)?000\b/g)) written.push(`${file}: ${m[0]}`);
    }
    expect(written).toEqual(["src/core/config.ts: 100_000"]);
  });
});
