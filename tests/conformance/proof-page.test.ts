import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@ours/kernel";
import { parseArticles, readRecords } from "../../apps/proof/src/records.ts";
import { renderPage } from "../../apps/proof/src/page.ts";
import { DURING_WINDOW, REPO_ROOT } from "../helpers.ts";

/**
 * The page's acceptance tests, from M-0001.
 *
 * These exist because the failure mode here is silent: an empty table still
 * renders its heading, and a page that promises to list every article while
 * listing none looks fine in a screenshot.
 */

async function render(): Promise<string> {
  const result = await compile({ root: REPO_ROOT, mandateId: "M-0001", now: DURING_WINDOW });
  const records = await readRecords(REPO_ROOT, "M-0001");
  return renderPage(records, result, "2026-08-30");
}

describe("the constitution parses into articles", () => {
  it("finds every article and its enforcement class", async () => {
    const markdown = await readFile(
      path.join(REPO_ROOT, "constitution/CONSTITUTION-0.1.md"),
      "utf8",
    );
    const articles = parseArticles(markdown);
    expect(articles.length).toBeGreaterThanOrEqual(10);
    expect(articles.map((a) => a.id)).toContain("R-HUMAN-AUTHORITY");
    expect(articles.map((a) => a.id)).toContain("R-WEAKEST-LAYER");
  });

  it("leaves no article untagged, as the constitution requires", async () => {
    const markdown = await readFile(
      path.join(REPO_ROOT, "constitution/CONSTITUTION-0.1.md"),
      "utf8",
    );
    for (const article of parseArticles(markdown)) {
      expect(article.classes.length, `${article.id} carries no enforcement class`).toBeGreaterThan(0);
    }
  });
});

describe("the rendered page", () => {
  it("names founder authority and states no member institution exists", async () => {
    const html = await render();
    expect(html).toContain("FOUNDER AUTHORITY");
    expect(html).toContain("NO MEMBER INSTITUTION");
    expect(html).toContain("There are no members.");
  });

  it("shows every article in the table, not just the heading", async () => {
    const html = await render();
    expect(html).toContain("R-HUMAN-AUTHORITY</td>");
    expect(html).toContain("R-ROLLBACK</td>");
    expect(html).not.toContain("UNTAGGED");
  });

  it("carries no prohibited ownership claim", async () => {
    const html = await render();
    // The same patterns the kernel's R-NO-FICTIONAL-OWNERSHIP scan applies.
    for (const pattern of [
      /\bmember-owned\b/i,
      /\bowned by (?:our |the )?members\b/i,
      /\bmembers own\b/i,
      /\bratified by (?:our |the )?members\b/i,
      /\btamper-proof\b/i,
      /\bnon-bypassable\b/i,
    ]) {
      expect(html, `page matched prohibited claim ${pattern}`).not.toMatch(pattern);
    }
  });

  it("reports open articles at the same weight as held ones", async () => {
    const html = await render();
    // Both markers present, and neither list is separated into its own block.
    expect(html).toContain('data-outcome="NOT_MACHINE_DECIDABLE"');
    expect(html).toContain('data-outcome="PASS"');
    const listStart = html.indexOf('<ul class="checks">');
    const listEnd = html.indexOf("</ul>", listStart);
    const list = html.slice(listStart, listEnd);
    expect(list).toContain('data-outcome="NOT_MACHINE_DECIDABLE"');
    expect(list).toContain('data-outcome="PASS"');
  });

  it("never prints a combined total", async () => {
    const html = await render();
    expect(html).toContain("no combined total");
    // A "14 checks passed" style string would defeat the whole report.
    expect(html).not.toMatch(/\d+\s*(?:\/|of)\s*\d+\s*(?:checks|articles)/i);
    expect(html).not.toMatch(/\b\d+\s+checks passed\b/i);
  });

  it("requests nothing from a third-party origin", async () => {
    const html = await render();
    const urls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1] as string);
    // Links a reader may follow are fine; loaded subresources are not.
    const loaded = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(loaded.filter((u) => u.startsWith("http"))).toEqual([]);
    expect(urls.every((u) => u.startsWith("https://github.com/"))).toBe(true);
  });

  it("states how to reverse the change and what a reversal would not undo", async () => {
    const html = await render();
    expect(html).toContain("How to reverse it");
    expect(html).toContain("What a reversal would not undo");
  });
});
