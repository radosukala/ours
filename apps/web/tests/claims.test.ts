/**
 * The claims scan (SPEC §12, M-0010 acceptance: "The claims scan finds no
 * prohibited claim in any public string"). Every prohibited pattern is
 * caught on a sample; denials pass only where the scan says why; and the
 * scan over the real files passes.
 *
 * CHECKED, not ENFORCED: a pattern cannot read polarity. These tests show
 * what the patterns catch, not that no claim can be made in other words.
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWLIST,
  formatHit,
  normalizeForScan,
  PROHIBITED,
  publicTextFiles,
  scanRepoPublicText,
  scanText,
} from "@/core/claims";

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

describe("the scan over the real files", () => {
  it("reads every file SPEC §12 names", () => {
    const files = publicTextFiles(WEB_ROOT);
    for (const expected of [
      "transparency/ledger.json",
      "transparency/control.json",
      "src/core/mail-templates.ts",
      "src/app/(public)/page.tsx",
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
