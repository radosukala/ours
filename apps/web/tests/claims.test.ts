/**
 * The claims scan (SPEC §12, M-0010 acceptance: "The claims scan finds no
 * prohibited claim in any public string"). Every prohibited pattern is
 * caught on a sample; denials pass only where the scan says why; and the
 * scan over the real files passes.
 *
 * CHECKED, not ENFORCED: a pattern cannot read polarity. These tests show
 * what the patterns catch, not that no claim can be made in other words.
 *
 * The source scan reads what is written; the last part of this file also
 * scans what people are shown: every public page the tests can render, the
 * footers, and every mail template (the final verification's honesty-1).
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppNotFound from "@/app/(app)/not-found";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import PublicLayout from "@/app/(public)/layout";
import LandingPage from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import RootNotFound from "@/app/not-found";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { SiteFooter } from "@/components/RightColumn";
import {
  ALLOWLIST,
  formatHit,
  normalizeForScan,
  PROHIBITED,
  publicTextFiles,
  scanJsonText,
  scanRepoPublicText,
  scanText,
} from "@/core/claims";
import * as mailTemplates from "@/core/mail-templates";

// The landing page reads the session cookie; outside a request there is
// none, and the page renders for a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** One sample per pattern, keyed by the pattern's source. */
const SAMPLES: Record<string, string[]> = {
  "\\bmember-owned\\b": ["OURS is member-owned.", "A MEMBER-OWNED network"],
  "\\bowned by (?:our |the )?members\\b": ["It is owned by our members.", "owned by members", "Owned by the members"],
  "\\bmembers own\\b": ["The members own it."],
  "\\bratified by (?:our |the )?members\\b": ["These rules were ratified by the members."],
  "\\btamper-proof\\b": ["A tamper-proof record."],
  "\\bnon-bypassable\\b": ["The checks are non-bypassable."],
  "not for sale": ["OURS is not for sale.", "NOT FOR SALE"],
  "user[- ]owned": ["A user-owned network.", "user owned"],
  "owned by (?:its |our |the )?users": ["Owned by its users.", "owned by users", "owned by the users"],
  "co-owner": ["Become a co-owner.", "co-owners"],
  "\\bco-own": ["The people using it co-own OURS.", "co-owned by everyone", "She co-owns it."],
  "\\bowned by (?:its |our |the )?(?:people|community|everyone)": [
    "OURS is owned by the people using it.",
    "owned by its community",
    "owned by everyone",
  ],
  "community[- ]owned": ["A community-owned home.", "community owned"],
  "\\bowned by (?:its |our |the )?members\\b": ["OURS is owned by its members.", "Owned by its members"],
  "\\bmembers?[- ]owned": ["A member owned network.", "A members-owned network.", "members owned"],
  "\\bowned by you\\b": ["A home owned by you.", "OWNED BY YOU"],
  "\\byou own\\b": ["The network you own."],
  "\\bwe own\\b": ["Something we own together."],
  "(?<!\\bat )\\bstakes?\\b": ["Take a stake in OURS.", "Hold stakes in OURS."],
  "\\binvest(?:s|ed|ing|ments?|ors?)?\\b": ["Invest in OURS.", "an investment", "investors", "invested"],
  "\\bequity\\b": ["Get equity."],
  "\\bdividend": ["Dividends for everyone.", "a dividend"],
  "well[- ]paid": ["Moderators are well paid.", "well-paid moderators"],
  "tax[- ]deductible": [
    "Contributions are tax-deductible.",
    "It is tax deductible.",
    "They will be tax-deductible.",
    "Always tax-deductible",
  ],
  "will spread": ["This will spread fast."],
  "\\bviral\\b": ["Built to go viral."],
  "algorithm-free": ["An algorithm-free feed."],
  "no algorithm": ["There is no algorithm.", "No algorithms here.", "No algorithm decides what you see."],
};

describe("each prohibited pattern is caught", () => {
  it("every pattern has at least one sample", () => {
    for (const rule of PROHIBITED) {
      expect(SAMPLES[rule.pattern.source], rule.pattern.source).toBeDefined();
    }
    expect(Object.keys(SAMPLES).sort()).toEqual(PROHIBITED.map((p) => p.pattern.source).sort());
  });

  for (const rule of PROHIBITED) {
    it(`catches /${rule.pattern.source}/`, () => {
      for (const sample of SAMPLES[rule.pattern.source] ?? []) {
        const hits = scanText(sample);
        expect(
          hits.some((h) => h.pattern === rule.pattern.source),
          `"${sample}" should hit /${rule.pattern.source}/`,
        ).toBe(true);
        // A sample is caught even inside a public file, with no allowlist entry for it.
        expect(scanText(sample, "src/app/(public)/page.tsx").length).toBeGreaterThan(0);
      }
    });
  }

  it("is case-insensitive", () => {
    expect(scanText("NOT FOR SALE").length).toBe(1);
    expect(scanText("Tamper-Proof").length).toBe(1);
    expect(scanText("VIRAL").length).toBe(1);
  });

  it("reports each occurrence with its line and reason", () => {
    const hits = scanText("fine\nfine\nwe own it\nand a stake", "src/app/x.tsx");
    expect(hits.map((h) => [h.line, h.match])).toEqual([
      [3, "we own"],
      [4, "stake"],
    ]);
    expect(formatHit(hits[0]!)).toMatch(/^src\/app\/x\.tsx:3: "we own"/);
    expect(hits.every((h) => h.reason.length > 0)).toBe(true);
  });

  it("does not flag ordinary words that only contain a pattern", () => {
    for (const fine of [
      "your own posts",
      "stakeholders",
      "a mistake",
      "what is at stake",
      "we investigate every report",
      "the owner of this post",
      "Friendship is mutual",
      "They won't be tax-deductible unless the recipient qualifies",
    ]) {
      expect(scanText(fine), fine).toEqual([]);
    }
  });
});

describe("denials pass only where the scan says why", () => {
  it("lets 'tax-deductible' through only after 'not' or 'won't be'", () => {
    for (const denial of [
      "They won't be tax-deductible unless the recipient qualifies.",
      "They won’t be tax-deductible.",
      "They won&apos;t be tax-deductible.",
      "They won&#39;t be tax deductible.",
      "This is not tax-deductible.",
    ]) {
      expect(scanText(denial), denial).toEqual([]);
    }
    for (const claim of [
      "They will be tax-deductible.",
      "They'll be tax-deductible.",
      "Nothing is not clear: it's tax-deductible.",
      "won't be. Tax-deductible!",
    ]) {
      expect(scanText(claim).length, claim).toBeGreaterThan(0);
    }
  });

  it("every allowlist entry has a reason, names a real file, and its sentence is in it", () => {
    expect(ALLOWLIST.length).toBeGreaterThan(0);
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(20);
      const text = readFileSync(join(WEB_ROOT, entry.file), "utf8");
      expect(text, `${entry.file} should contain the allowlisted sentence`).toContain(
        entry.sentence,
      );
    }
  });

  it("an allowlisted sentence passes in its file, and is caught anywhere else", () => {
    for (const entry of ALLOWLIST) {
      // Out of context it is a hit: the allowlist is what lets it through.
      expect(scanText(entry.sentence).length).toBeGreaterThan(0);
      expect(scanText(entry.sentence, "src/app/(public)/page.tsx").length).toBeGreaterThan(0);
      // In its own file it passes.
      expect(scanText(entry.sentence, entry.file)).toEqual([]);
      const text = readFileSync(join(WEB_ROOT, entry.file), "utf8");
      expect(scanText(text, entry.file)).toEqual([]);
    }
  });

  it("the allowlist lets through the exact sentence only, not a variation of it", () => {
    const file = "src/components/public/floorRules.ts";
    expect(scanText("No algorithm decides the order.", file)).toEqual([]);
    expect(scanText("No algorithm decides the order", file).length).toBe(1);
    expect(scanText("No algorithm decides what you see.", file).length).toBe(1);
    expect(scanText("No algorithm decides the order. There is no algorithm.", file).length).toBe(1);
  });

  it("'No algorithm decides the order.' stays on /rules: only the rules page imports the file that holds it", () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (/from\s+["'][^"']*\/floorRules["']/.test(text)) {
            importers.push(path.slice(WEB_ROOT.length).split("\\").join("/"));
          }
        }
      }
    };
    walk(join(WEB_ROOT, "src"));
    expect(importers).toEqual(["src/app/(public)/rules/page.tsx"]);
  });

  it("promise 1 passes only in the file holding the /contract copy, only in its exact words, and nothing imports that file (SPEC §18.7)", () => {
    const file = "src/app/(public)/contract/page.tsx";
    const sentence = "It won't be sold, and nobody will invest in it for a return.";
    expect(ALLOWLIST.filter((e) => e.file === file).map((e) => e.sentence)).toEqual([sentence]);
    expect(ALLOWLIST.find((e) => e.file === file)?.reason).toMatch(/D-0012 §A, promise 1/);
    expect(scanText(sentence, file)).toEqual([]);
    expect(scanText("It won&apos;t be sold, and nobody will\n      invest in it for a return.", file)).toEqual([]);
    // Anywhere else, or in other words, it is a hit.
    expect(scanText(sentence, "src/components/public/FrontPage.tsx").length).toBe(1);
    expect(scanText("Nobody will invest in it for a return.", file).length).toBe(1);
    expect(scanText("It won't be sold, and nobody will invest in it.", file).length).toBe(1);
    expect(scanText(`${sentence} Invest now.`, file).length).toBe(1);
    // A page file is imported by nothing, so the sentence cannot travel.
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && /["']@\/app\/\(public\)\/contract\/page["']|["'][^"']*\/contract\/page["']/.test(readFileSync(path, "utf8"))) {
          importers.push(path);
        }
      }
    };
    walk(join(WEB_ROOT, "src"));
    expect(importers).toEqual([]);
  });
});

describe("the text is read as a reader sees it (SPEC §17 item 15)", () => {
  it("catches a claim a formatter wrapped across lines, and reports the line where it starts", () => {
    const source = [
      "export default function Page() {", // 1
      "  return (", // 2
      "    <p>", // 3
      "      OURS is a home that is not for", // 4
      "      sale, and contributions are tax", // 5
      "      deductible.", // 6
      "    </p>", // 7
      "  );", // 8
      "}", // 9
    ].join("\n");
    const hits = scanText(source, "src/app/x.tsx");
    expect(hits.map((h) => [h.line, h.match])).toEqual([
      [4, "not for sale"],
      [5, "tax deductible"],
    ]);
    expect(formatHit(hits[0]!)).toMatch(/^src\/app\/x\.tsx:4: "not for sale"/);
  });

  it("reads HTML entities and JSX's {\" \"} as the characters and spaces they render", () => {
    for (const claim of [
      "OURS is not&nbsp;for&#160;sale.",
      "OURS is not&#xA0;for sale.",
      "OURS is not for{\" \"}\n        sale.",
      "OURS is not for{' '}sale.",
      "A user&#8209;owned network.",
      "A user&hyphen;owned network.",
      "Moderators are well&nbsp;paid.",
      "Contributions are tax&#45;deductible.",
      "It is tamper\u2011proof.",
      "Become a co\u00ad-owner.",
    ]) {
      expect(scanText(claim, "src/app/(public)/page.tsx").length, claim).toBeGreaterThan(0);
    }
  });

  it("still lets a denial through when its words are wrapped or written as entities", () => {
    for (const denial of [
      "They won&apos;t be\n      tax-deductible unless the recipient qualifies.",
      "They won&rsquo;t be tax-deductible.",
      "This is not\n  tax deductible.",
    ]) {
      expect(scanText(denial), denial).toEqual([]);
    }
  });

  it("does not decode twice or invent entities", () => {
    // "&amp;nbsp;" renders as the text "&nbsp;", not as a space.
    expect(normalizeForScan("not for&amp;nbsp;sale").text).toBe("not for&nbsp;sale");
    expect(scanText("not for&amp;nbsp;sale")).toEqual([]);
    // An unknown name is left as written.
    expect(normalizeForScan("a &notanentity; b").text).toBe("a &notanentity; b");
  });

  it("maps every character of the normalized text back to where it came from", () => {
    const raw = "a&nbsp;b\n\n   c{\" \"}d";
    const { text, origin } = normalizeForScan(raw);
    expect(text).toBe("a b c d");
    expect(origin).toHaveLength(text.length);
    expect(origin.map((i) => raw[i])).toEqual(["a", "&", "b", "\n", "c", "{", "d"]);
  });

  it("an allowlisted sentence wrapped across lines still passes in its file, and only there", () => {
    const file = "src/components/public/floorRules.ts";
    const wrapped = "No algorithm\n      decides the order.";
    expect(scanText(wrapped, file)).toEqual([]);
    expect(scanText(wrapped, "src/app/(public)/page.tsx").length).toBe(1);
  });

  it("reports a claim once where two patterns match at the same place", () => {
    expect(scanText("Become a co-owner.").map((h) => h.match)).toEqual(["co-owner"]);
    expect(scanText("They co-own it.").map((h) => h.match)).toEqual(["co-own"]);
  });
});

describe("markup, string expressions and escapes are read as they render (final verification, honesty-1, -3, -4)", () => {
  const file = "src/app/(public)/page.tsx";

  it("drops inline tags and closing tags, so a claim split by emphasis or a link is whole again", () => {
    for (const claim of [
      "OURS is not for <strong>sale</strong>.",
      "Contributions are <em>tax-</em>deductible.",
      "A <b>user</b>-<i>owned</i> network.",
      "A <span className={styles.x}>member</span> owned network.",
      "not for <code>sale</code>",
      "not for <mark>sale</mark>",
      "not for <small>sale</small>",
      'not for <Link href="/costs">sale</Link>',
      [
        "OURS is not for{\" \"}",
        "<a",
        '  href={repositoryUrl("decisions", true)}',
        '  rel="noopener noreferrer"',
        '  target="_blank"',
        ">",
        "  sale",
        "</a>",
      ].join("\n"),
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
    }
  });

  it("still reads the words inside a dropped tag, and a denial in emphasis is still a denial", () => {
    // An aria-label or a title is read out or shown: dropping the tag must not drop them.
    expect(scanText('<a aria-label="OURS is not for sale" href="/">OURS</a>', file).map((h) => h.match)).toEqual([
      "not for sale",
    ]);
    expect(scanText('<span title="A user-owned network">OURS</span>', file).map((h) => h.match)).toEqual([
      "user-owned",
    ]);
    // Reported once, where both readings find it.
    expect(scanText("OURS is <em>not for sale</em>.", file)).toHaveLength(1);
    expect(scanText("They won't be <em>tax-deductible</em> unless the recipient qualifies.", file)).toEqual([]);
    expect(scanText("They won't be <em>tax-</em>deductible.", file)).toEqual([]);
  });

  it("reads a JSX string expression as the text it renders, joined to the text around it", () => {
    for (const claim of [
      '{"member-"}owned',
      "not for{' sale'}",
      '{"not for"} sale',
      "tax{`-`}deductible",
      '{"They will be tax-deductible."}',
      '{"user\\u2011owned"}',
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
    }
    // A denial inside a string expression is still a denial.
    expect(
      scanText(`{"They won't be tax-deductible unless the recipient qualifies."}`, file),
    ).toEqual([]);
    expect(scanText(`{'They won\\'t be tax-deductible.'}`, file)).toEqual([]);
  });

  it("decodes JavaScript escapes in .ts and .tsx files", () => {
    for (const claim of [
      'const A = "OURS is not for\\u0020sale.";',
      'const A = "A user\\u2011owned network.";',
      'const A = "A user\\u{2011}owned network.";',
      'const A = "Contributions are tax\\x20deductible.";',
      'const A = "not for\\nsale";',
    ]) {
      expect(scanText(claim, "src/components/public/x.ts").length, claim).toBeGreaterThan(0);
      expect(scanText(claim, "src/app/x.tsx").length, claim).toBeGreaterThan(0);
    }
    // An escaped backslash is a backslash: "\\u0020" renders as those six characters.
    expect(normalizeForScan('"not for\\\\u0020sale"', { jsEscapes: true }).text).toBe('"not for\\u0020sale"');
    expect(scanText('const A = "not for\\\\u0020sale";', "src/app/x.tsx")).toEqual([]);
    // A denial written with an escaped apostrophe is still a denial.
    expect(scanText("const A = 'They won\\'t be tax-deductible.';", "src/app/x.ts")).toEqual([]);
  });

  it("reads each JSON string as JSON.parse gives it, and reports the line where the string starts", () => {
    const json = [
      "{", // 1
      '  "note": "Fine.",', // 2
      '  "rows": [', // 3
      '    { "who": "OURS is not for\\u0020sale." },', // 4
      '    { "who": "A user\\u2011owned network, tax\\u2013deductible." }', // 5
      "  ]", // 6
      "}", // 7
    ].join("\n");
    expect(scanJsonText(json, "transparency/x.json").map((h) => [h.line, h.match])).toEqual([
      [4, "not for sale"],
      [5, "user-owned"],
      [5, "tax-deductible"],
    ]);
    // A file that is not JSON is read as it is written, never skipped.
    expect(scanJsonText('{ "who": "not for sale", }', "transparency/x.json").length).toBe(1);
  });

  it("reads the figure dash, the en dash (and &ndash;) and the minus sign as a hyphen, and not the em dash", () => {
    for (const claim of [
      "A user\u2012owned network.",
      "A user\u2013owned network.",
      "Contributions are tax&ndash;deductible.",
      "Contributions are tax\u2212deductible.",
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
    }
    expect(normalizeForScan("before \u2014 after").text).toBe("before \u2014 after");
  });

  it("keeps block elements apart, and never reads a comparison as a tag", () => {
    // Two paragraphs are two sentences to a reader.
    expect(scanText("<p>OURS is not for</p>\n<p>sale by the pound</p>", file)).toEqual([]);
    expect(normalizeForScan("if (i<b && b>a) return;").text).toBe("if (i<b && b>a) return;");
    expect(normalizeForScan("const n = a <b ? 1 : 2;").text).toBe("const n = a <b ? 1 : 2;");
  });

  it("reports a claim after dropped markup at the line where it starts", () => {
    const source = [
      "<p>", // 1
      '  <a href={x} rel="noopener noreferrer">', // 2
      "    Open code", // 3
      "  </a>", // 4
      "  and a <strong>stake</strong>", // 5
      "</p>", // 6
    ].join("\n");
    expect(scanText(source, file).map((h) => [h.line, h.match])).toEqual([[5, "stake"]]);
  });
});

/* ---------------------------------------------- what people are shown */

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The claims in a rendered page, read two ways: the markup through the
 * scan's own normalization (inline tags dropped, so a claim split by
 * <strong> is whole), and the plain text with every tag a space.
 */
function renderedHits(html: string, file: string | null = null) {
  return [...scanText(html, file), ...scanText(textOf(html), file)].map(formatHit);
}

/** The rules page's data file: its one allowlisted sentence is shown only on /rules. */
const RULES_FILE = "src/components/public/floorRules.ts";
/** The file holding the /contract copy: its one allowlisted sentence is shown only on /contract (SPEC §18.7). */
const CONTRACT_FILE = "src/app/(public)/contract/page.tsx";

describe("what people are shown: every public page, the footers and every mail, rendered (final verification, honesty-1)", () => {
  afterEach(() => vi.unstubAllEnvs());

  /** The pages, under the configuration in force when called. */
  async function pages(): Promise<[string, string, string | null][]> {
    const landing = (await LandingPage()) as ReactElement;
    return [
      ["/", renderToStaticMarkup(landing), null],
      ["/contract", renderToStaticMarkup(createElement(ContractPage)), CONTRACT_FILE],
      ["/rules", renderToStaticMarkup(createElement(RulesPage)), RULES_FILE],
      ["/privacy", renderToStaticMarkup(createElement(PrivacyPage)), null],
      ["/power", renderToStaticMarkup(createElement(PowerPage)), null],
      ["/costs", renderToStaticMarkup(createElement(CostsPage)), null],
      ["not-found", renderToStaticMarkup(createElement(RootNotFound)), null],
      ["not-found in the app", renderToStaticMarkup(createElement(AppNotFound)), null],
      ["the footer", renderToStaticMarkup(createElement(SiteFooter)), null],
      ["the in-app footer", renderToStaticMarkup(createElement(InAppSiteFooter)), null],
      ["the public layout", renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page")), null],
    ];
  }

  it("the rendered scan catches a claim that only markup splits", () => {
    const html = renderToStaticMarkup(
      createElement("p", null, "OURS is not for ", createElement("strong", null, "sale"), "."),
    );
    expect(html).toBe("<p>OURS is not for <strong>sale</strong>.</p>");
    expect(renderedHits(html).length).toBeGreaterThan(0);
    expect(scanText(html).map((h) => h.match)).toEqual(["not for sale"]);
  });

  it("finds no prohibited claim on any public page, whatever this server's configuration", async () => {
    const configurations: Record<string, Record<string, string>> = {
      "the test configuration": {},
      "no data controller": { DATA_CONTROLLER: "", DATA_CONTROLLER_EMAIL: "" },
      "resend, set up": {
        NODE_ENV: "production",
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "re_FICTIONAL",
        MAIL_FROM: "ours@example.test",
        OURS_VERSION: "v0-FICTIONAL",
      },
      "resend, set up incompletely": { MAIL_TRANSPORT: "resend" },
    };
    for (const [name, env] of Object.entries(configurations)) {
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const rendered = await pages();
      expect(rendered).toHaveLength(11);
      for (const [page, html, file] of rendered) {
        expect(textOf(html).length, `${name}: ${page}`).toBeGreaterThan(0);
        expect(renderedHits(html, file), `${name}: ${page}`).toEqual([]);
      }
    }
  });

  it("shows each allowlisted sentence only on its own page: 'No algorithm…' on /rules, promise 1 on /contract", async () => {
    const rendered = await pages();
    const home: Record<string, string> = { [RULES_FILE]: "/rules", [CONTRACT_FILE]: "/contract" };
    expect(ALLOWLIST.map((e) => e.file).sort()).toEqual(Object.keys(home).sort());
    for (const entry of ALLOWLIST) {
      for (const [page, html] of rendered) {
        expect(textOf(html).includes(entry.sentence), `${page}: ${entry.sentence}`).toBe(page === home[entry.file]);
      }
    }
    for (const [page, html, file] of rendered) {
      if (file === null) expect(scanText(html).filter((h) => /algorithm|invest/i.test(h.match)), page).toEqual([]);
    }
  });

  it("finds no prohibited claim in any email, and renders every template there is", () => {
    const url = "http://localhost:3000/auth#FICTIONAL";
    const mails = [
      mailTemplates.signInEmail(url),
      mailTemplates.joinEmail(url, "FICTIONAL Anna"),
      mailTemplates.joinEmail(url, "FICTIONAL Anna", "anna_f"),
      mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", "controller@example.test"),
      mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", null),
      mailTemplates.seatEmail(url),
      mailTemplates.digestEmail(
        Array.from({ length: 7 }, (_, i) => ({ name: `FICTIONAL Person ${i}`, posts: i + 1 })),
        "http://localhost:3000",
        "http://localhost:3000/unsubscribe#FICTIONAL",
      ),
    ];
    for (const mail of mails) {
      const text = `${mail.subject}\n${mail.body}`;
      expect(scanText(text).map(formatHit), mail.subject).toEqual([]);
    }
    // Every template the module exports is one of those rendered above.
    const exported = Object.entries(mailTemplates)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name)
      .sort();
    expect(exported).toEqual(["digestEmail", "joinEmail", "seatEmail", "signInEmail", "suspensionEmail"]);
  });
});

describe("the scan over the real files", () => {
  it("reads every file SPEC §12 names", () => {
    const files = publicTextFiles(WEB_ROOT);
    for (const expected of [
      "transparency/ledger.json",
      "transparency/control.json",
      "src/core/mail-templates.ts",
      "src/app/(public)/page.tsx",
      "src/app/(public)/contract/page.tsx",
      "src/components/public/FrontPage.tsx",
      "src/components/public/GetInForm.tsx",
      "src/components/public/handover.ts",
      "src/app/(public)/rules/page.tsx",
      "src/app/(public)/privacy/page.tsx",
      "src/app/(public)/costs/page.tsx",
      "src/app/(public)/power/page.tsx",
      "src/components/public/floorRules.ts",
      "src/components/RightColumn.tsx",
      "src/app/layout.tsx",
    ]) {
      expect(files).toContain(expected);
    }
    expect(files.every((f) => /\.(ts|tsx|json)$/.test(f))).toBe(true);
  });

  it("reads every file in src/core except claims.ts, and every file in src/web (SPEC §17 item 15)", () => {
    const files = new Set(publicTextFiles(WEB_ROOT));
    const core = readdirSync(join(WEB_ROOT, "src/core")).filter((f) => f.endsWith(".ts"));
    const web = readdirSync(join(WEB_ROOT, "src/web")).filter((f) => f.endsWith(".ts"));
    expect(core.length).toBeGreaterThan(15);
    expect(web.length).toBeGreaterThan(2);
    for (const f of core) {
      if (f === "claims.ts") expect(files.has("src/core/claims.ts")).toBe(false);
      else expect(files.has(`src/core/${f}`), f).toBe(true);
    }
    for (const f of web) expect(files.has(`src/web/${f}`), f).toBe(true);
  });

  it("finds a claim in a core error message or in src/web", () => {
    const dir = mkdtempSync(join(tmpdir(), "ours-claims-"));
    try {
      for (const d of ["src/app", "src/components", "src/core", "src/web", "transparency"]) {
        mkdirSync(join(dir, d), { recursive: true });
      }
      writeFileSync(join(dir, "src/core/mail-templates.ts"), "export {};");
      writeFileSync(
        join(dir, "src/core/posts.ts"),
        'throw invalid(\n  "Posting is limited. Invest in OURS\n   to post more.",\n);\n',
      );
      writeFileSync(join(dir, "src/web/actions.ts"), 'const GENERIC_ERROR = "A FICTIONAL well-paid team.";\n');
      // claims.ts holds the patterns themselves, so it is not read.
      writeFileSync(join(dir, "src/core/claims.ts"), 'const p = /not for sale/i;\n');
      const { files, hits } = scanRepoPublicText(dir);
      expect(files).toEqual(["src/core/mail-templates.ts", "src/core/posts.ts", "src/web/actions.ts"]);
      expect(hits.map((h) => [h.file, h.line, h.match])).toEqual([
        ["src/core/posts.ts", 2, "Invest"],
        ["src/web/actions.ts", 1, "well-paid"],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds no prohibited claim in any public string", () => {
    const { files, hits } = scanRepoPublicText(WEB_ROOT);
    expect(files.length).toBeGreaterThan(20);
    expect(hits.map(formatHit)).toEqual([]);
  });

  it("refuses to pass silently when a directory it must read is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ours-claims-"));
    try {
      expect(() => scanRepoPublicText(dir)).toThrow();
      mkdirSync(join(dir, "src/app"), { recursive: true });
      mkdirSync(join(dir, "src/components"), { recursive: true });
      mkdirSync(join(dir, "src/core"), { recursive: true });
      mkdirSync(join(dir, "transparency"));
      expect(() => scanRepoPublicText(dir)).toThrow(); // mail-templates.ts is missing
      writeFileSync(join(dir, "src/core/mail-templates.ts"), "export {};");
      writeFileSync(join(dir, "src/app/page.tsx"), "export default () => 'A FICTIONAL co-owner';");
      writeFileSync(join(dir, "transparency/x.json"), '{"note": "not for sale"}');
      const { files, hits } = scanRepoPublicText(dir);
      expect(files).toEqual(["src/app/page.tsx", "src/core/mail-templates.ts", "transparency/x.json"]);
      expect(hits.map((h) => h.file)).toEqual(["src/app/page.tsx", "transparency/x.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
