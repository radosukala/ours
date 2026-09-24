/**
 * The claims scan (SPEC §12): prohibited claims in public text.
 *
 * `PROHIBITED` holds the kernel's list (R-NO-FICTIONAL-OWNERSHIP) and
 * D-0011's list. `scanText` finds them; `scanRepoPublicText` reads every
 * file SPEC §12 names and scans each one. The test suite and
 * `scripts/claims-scan.ts` both run it.
 *
 * This is CHECKED, not ENFORCED: a pattern cannot read polarity. It cannot
 * tell a claim from its denial, and it cannot see a claim made in other
 * words. What it flags, a person reads. Two things let a true sentence
 * through, and both are written down here:
 *
 * - a pattern may name the words that, just before it, turn it into a
 *   denial (`unlessPrecededBy`), as for "won't be tax-deductible";
 * - `ALLOWLIST` names a file and one exact sentence in it, with a reason.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type Prohibited = {
  pattern: RegExp;
  reason: string;
  /**
   * Matched against the text just before a hit. When it matches, the hit
   * is a denial ("not …", "won't be …") and is not reported.
   */
  unlessPrecededBy?: RegExp;
};

const OWNERSHIP =
  "Member ownership is not issued. Bootstrap may never read as ownership (R-NO-FICTIONAL-OWNERSHIP).";
const D0011_OWNERSHIP =
  "D-0011 prohibits any claim of ownership in the present tense.";
const MONEY =
  "Contributions buy no reach and no say, and OURS offers no financial return (D-0011 §C.2).";

/** An apostrophe as it may be written in source: ' ’ &apos; &#39; &rsquo; */
const APOS = "(?:'|’|&apos;|&#39;|&rsquo;)";

export const PROHIBITED: readonly Prohibited[] = [
  // The kernel's list (packages/kernel/src/rules.ts, noFictionalOwnership).
  { pattern: /\bmember-owned\b/i, reason: OWNERSHIP },
  { pattern: /\bowned by (?:our |the )?members\b/i, reason: OWNERSHIP },
  { pattern: /\bmembers own\b/i, reason: OWNERSHIP },
  {
    pattern: /\bratified by (?:our |the )?members\b/i,
    reason: "Nothing has been ratified by members; no members exist yet (AGENTS.md §9).",
  },
  {
    pattern: /\btamper-proof\b/i,
    reason: "Nothing here is tamper-proof (AGENTS.md §9).",
  },
  {
    pattern: /\bnon-bypassable\b/i,
    reason: "Nothing here is non-bypassable (AGENTS.md §9).",
  },

  // D-0011's list, case-insensitive.
  { pattern: /not for sale/i, reason: D0011_OWNERSHIP },
  { pattern: /user[- ]owned/i, reason: D0011_OWNERSHIP },
  { pattern: /owned by (?:its |our |the )?users/i, reason: D0011_OWNERSHIP },
  { pattern: /co-owner/i, reason: D0011_OWNERSHIP },
  { pattern: /\byou own\b/i, reason: D0011_OWNERSHIP },
  { pattern: /\bwe own\b/i, reason: D0011_OWNERSHIP },
  // Not "at stake" (architect decision after the M5 build: ordinary English).
  { pattern: /(?<!\bat )\bstakes?\b/i, reason: MONEY },
  // invest, invests, invested, investing, investment(s), investor(s) — not "investigate".
  { pattern: /\binvest(?:s|ed|ing|ments?|ors?)?\b/i, reason: MONEY },
  { pattern: /\bequity\b/i, reason: MONEY },
  { pattern: /\bdividend/i, reason: MONEY },
  {
    pattern: /well paid/i,
    reason: "No promise about pay (D-0011).",
  },
  {
    pattern: /tax[- ]deductible/i,
    reason:
      "No claim of tax deductibility (D-0011). Allowed only as a denial, after \"not\" or \"won't be\".",
    unlessPrecededBy: new RegExp(`(?:\\bnot|\\bwon${APOS}t be)\\s+$`, "i"),
  },
  {
    pattern: /will spread/i,
    reason: "No claim that a launch will spread (AGENTS.md §9).",
  },
  {
    pattern: /\bviral\b/i,
    reason: "No claim that a launch will spread (AGENTS.md §9).",
  },
  {
    pattern: /algorithm-free/i,
    reason: "Overclaims. The order is newest first; say that instead.",
  },
  {
    pattern: /no algorithm/i,
    reason:
      "Allowed only on /rules, in the exact sentence \"No algorithm decides the order.\" (SPEC §12).",
  },
];

export type AllowEntry = {
  /** The file, relative to apps/web, with forward slashes. */
  file: string;
  /** One exact sentence in that file. Only this sentence is let through. */
  sentence: string;
  reason: string;
};

export const ALLOWLIST: readonly AllowEntry[] = [
  {
    // The /rules page's data. Only src/app/(public)/rules/page.tsx imports
    // it; tests/claims.test.ts checks that, so the sentence stays on /rules.
    file: "src/components/public/floorRules.ts",
    sentence: "No algorithm decides the order.",
    reason:
      "SPEC §12 allows \"no algorithm\" only on /rules, in this exact sentence: the feed is newest first, and nothing ranks it.",
  },
];

export type Hit = {
  /** The file, relative to apps/web, when the text came from one. */
  file: string | null;
  /** 1-based line of the hit. */
  line: number;
  /** The text that matched. */
  match: string;
  /** The pattern's source, e.g. "\\bstake\\b". */
  pattern: string;
  reason: string;
};

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/** Blank out each allowlisted sentence for this file, keeping positions. */
function applyAllowlist(text: string, file: string | null): string {
  if (!file) return text;
  let out = text;
  for (const entry of ALLOWLIST) {
    if (entry.file !== file) continue;
    out = out.split(entry.sentence).join(" ".repeat(entry.sentence.length));
  }
  return out;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/**
 * Every prohibited claim in `text`. Pass `file` (relative to apps/web) to
 * apply that file's allowlist entries; without it, nothing is allowlisted.
 */
export function scanText(text: string, file?: string | null): Hit[] {
  const name = file ? toPosix(file) : null;
  const scanned = applyAllowlist(text, name);
  const hits: Hit[] = [];
  for (const rule of PROHIBITED) {
    const flags = rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags}g`;
    const global = new RegExp(rule.pattern.source, flags);
    for (const found of scanned.matchAll(global)) {
      const index = found.index ?? 0;
      if (rule.unlessPrecededBy) {
        const before = scanned.slice(Math.max(0, index - 40), index);
        if (rule.unlessPrecededBy.test(before)) continue;
      }
      hits.push({
        file: name,
        line: lineAt(scanned, index),
        match: found[0],
        pattern: rule.pattern.source,
        reason: rule.reason,
      });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/* ------------------------------------------------------ the public text */

/** What SPEC §12 scans, relative to apps/web. */
export const PUBLIC_TEXT = {
  /** Every .ts and .tsx file under these directories. */
  directories: ["src/app", "src/components"],
  extensions: [".ts", ".tsx"],
  /** Every .json file directly in this directory. */
  jsonDirectory: "transparency",
  /** And these files. */
  files: ["src/core/mail-templates.ts"],
} as const;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
}

/**
 * The files SPEC §12 names, as paths relative to `rootDir` (apps/web),
 * sorted. A directory or file that is missing is an error: a scan that
 * silently read nothing would pass.
 */
export function publicTextFiles(rootDir: string): string[] {
  const found: string[] = [];
  for (const dir of PUBLIC_TEXT.directories) {
    const all: string[] = [];
    walk(join(rootDir, dir), all);
    for (const path of all) {
      if (PUBLIC_TEXT.extensions.some((ext) => path.endsWith(ext))) found.push(path);
    }
  }
  const jsonDir = join(rootDir, PUBLIC_TEXT.jsonDirectory);
  for (const name of readdirSync(jsonDir)) {
    const path = join(jsonDir, name);
    if (name.endsWith(".json") && statSync(path).isFile()) found.push(path);
  }
  for (const file of PUBLIC_TEXT.files) {
    const path = join(rootDir, file);
    if (!statSync(path).isFile()) throw new Error(`claims scan: ${file} is not a file`);
    found.push(path);
  }
  return [...new Set(found.map((p) => toPosix(relative(rootDir, p))))].sort();
}

export type ScanResult = { files: string[]; hits: Hit[] };

/** Scan every public text file under `rootDir` (apps/web). */
export function scanRepoPublicText(rootDir: string): ScanResult {
  const files = publicTextFiles(rootDir);
  const hits: Hit[] = [];
  for (const file of files) {
    const text = readFileSync(join(rootDir, file), "utf8");
    hits.push(...scanText(text, file));
  }
  return { files, hits };
}

/** One line per hit, for the CLI and test failures. */
export function formatHit(hit: Hit): string {
  const where = hit.file ? `${hit.file}:${hit.line}` : `line ${hit.line}`;
  return `${where}: "${hit.match}" (/${hit.pattern}/) — ${hit.reason}`;
}
