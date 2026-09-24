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
 *
 * Before matching, the text is normalized as a reader would see it (SPEC
 * §17 item 15): the common HTML entities are decoded, JSX's `{" "}` is a
 * space, and every run of whitespace is one space. So a claim a formatter
 * wrapped across two lines ("not for\n        sale") is still a hit, and
 * each hit is reported at the line of the original file where it starts.
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
  // The near forms (SPEC §17 item 15): co-own, co-owns, co-owned. (Where
  // "co-owner" matches at the same place, as in "co-ownership", the longer
  // match is the one reported.)
  { pattern: /\bco-own/i, reason: D0011_OWNERSHIP },
  { pattern: /\bowned by (?:its |our |the )?(?:people|community|everyone)/i, reason: D0011_OWNERSHIP },
  { pattern: /community[- ]owned/i, reason: D0011_OWNERSHIP },
  { pattern: /\byou own\b/i, reason: D0011_OWNERSHIP },
  { pattern: /\bwe own\b/i, reason: D0011_OWNERSHIP },
  // Not "at stake" (architect decision after the M5 build: ordinary English).
  { pattern: /(?<!\bat )\bstakes?\b/i, reason: MONEY },
  // invest, invests, invested, investing, investment(s), investor(s) — not "investigate".
  { pattern: /\binvest(?:s|ed|ing|ments?|ors?)?\b/i, reason: MONEY },
  { pattern: /\bequity\b/i, reason: MONEY },
  { pattern: /\bdividend/i, reason: MONEY },
  {
    pattern: /well[- ]paid/i,
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

/* ------------------------------------------------------ normalization */

/** The named HTML entities a page is likely to carry, decoded. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  ndash: "\u2013",
  mdash: "\u2014",
  hyphen: "-",
  shy: "",
};

const ENTITY = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/y;
/** JSX's explicit space between two lines of text: {" "}, {' '} or {` `}. */
const JSX_SPACE = /\{\s*(["'`]) +\1\s*\}/y;
/** Characters that render as nothing: soft hyphen, zero-width space and joiners, BOM. */
const INVISIBLE = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/;
/** Hyphens that render as "-". */
const HYPHENS = /[\u2010\u2011]/;

function decodeEntity(body: string): string | null {
  if (body.startsWith("#")) {
    const code = body[1] === "x" || body[1] === "X"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? null;
}

export type Normalized = {
  /** The text as a reader would see it: entities decoded, whitespace collapsed. */
  text: string;
  /** For each UTF-16 unit of `text`, its offset in the original. */
  origin: number[];
};

/**
 * The text as a reader sees it, with a map back to the original: the
 * common HTML entities decoded, JSX's `{" "}` read as a space, invisible
 * characters dropped, and every run of whitespace (a line break and the
 * indentation after it, a non-breaking space) made one space.
 */
export function normalizeForScan(raw: string): Normalized {
  const units: string[] = [];
  const from: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "&") {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(raw);
      const decoded = m ? decodeEntity(m[1]!) : null;
      if (m && decoded !== null) {
        for (let k = 0; k < decoded.length; k += 1) {
          units.push(decoded[k]!);
          from.push(i);
        }
        i += m[0].length;
        continue;
      }
    } else if (c === "{") {
      JSX_SPACE.lastIndex = i;
      const m = JSX_SPACE.exec(raw);
      if (m) {
        units.push(" ");
        from.push(i);
        i += m[0].length;
        continue;
      }
    }
    units.push(c);
    from.push(i);
    i += 1;
  }

  let text = "";
  const origin: number[] = [];
  let inSpace = false;
  for (let k = 0; k < units.length; k += 1) {
    let u = units[k]!;
    if (INVISIBLE.test(u)) continue;
    if (HYPHENS.test(u)) u = "-";
    if (/\s/.test(u)) {
      if (inSpace) continue;
      inSpace = true;
      u = " ";
    } else {
      inSpace = false;
    }
    text += u;
    origin.push(from[k]!);
  }
  return { text, origin };
}

/** Blank out each allowlisted sentence for this file, keeping positions. */
function applyAllowlist(text: string, file: string | null): string {
  if (!file) return text;
  let out = text;
  for (const entry of ALLOWLIST) {
    if (entry.file !== file) continue;
    const sentence = normalizeForScan(entry.sentence).text;
    out = out.split(sentence).join(" ".repeat(sentence.length));
  }
  return out;
}

/** Offsets at which each line of `text` starts. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** The 1-based line holding `offset`. */
function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Every prohibited claim in `text`. Pass `file` (relative to apps/web) to
 * apply that file's allowlist entries; without it, nothing is allowlisted.
 *
 * The text is normalized first (`normalizeForScan`), so `match` is the text
 * as a reader sees it, and `line` is the line of the original where the
 * match starts. Where two patterns match at the same place ("co-owner" and
 * "co-own"), the longer match is reported once.
 */
export function scanText(text: string, file?: string | null): Hit[] {
  const name = file ? toPosix(file) : null;
  const normalized = normalizeForScan(text);
  const scanned = applyAllowlist(normalized.text, name);
  const starts = lineStarts(text);
  const byIndex = new Map<number, Hit & { index: number }>();
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
      const existing = byIndex.get(index);
      if (existing && existing.match.length >= found[0].length) continue;
      byIndex.set(index, {
        index,
        file: name,
        line: lineOf(starts, normalized.origin[index] ?? 0),
        match: found[0],
        pattern: rule.pattern.source,
        reason: rule.reason,
      });
    }
  }
  return [...byIndex.values()]
    .sort((a, b) => a.index - b.index)
    .map(({ index: _index, ...hit }) => hit);
}

/* ------------------------------------------------------ the public text */

/**
 * What the scan reads, relative to apps/web: SPEC §12, and SPEC §17 item 15,
 * which adds src/core and src/web because their sentences reach people (a
 * CoreError's message is shown word for word; reports.ts writes the
 * statements of reasons).
 */
export const PUBLIC_TEXT = {
  /** Every .ts and .tsx file under these directories, which must exist. */
  directories: ["src/app", "src/components"],
  extensions: [".ts", ".tsx"],
  /**
   * Every .ts file directly in these directories (not below). src/core must
   * exist; src/web is read when it is there.
   */
  flatDirectories: [
    { dir: "src/core", required: true },
    { dir: "src/web", required: false },
  ],
  /** Files in the flat directories that are not public text. */
  exclude: ["src/core/claims.ts"],
  /** Every .json file directly in this directory. */
  jsonDirectory: "transparency",
  /** And these files, which must exist. */
  files: ["src/core/mail-templates.ts"],
} as const;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The files the scan reads, as paths relative to `rootDir` (apps/web),
 * sorted. A required directory or file that is missing is an error: a scan
 * that silently read nothing would pass.
 *
 * claims.ts itself is left out: it holds the patterns, so every one of
 * them would be a hit.
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
  for (const { dir, required } of PUBLIC_TEXT.flatDirectories) {
    const path = join(rootDir, dir);
    if (!required && !isDirectory(path)) continue;
    for (const name of readdirSync(path)) {
      const file = join(path, name);
      if (name.endsWith(".ts") && statSync(file).isFile()) found.push(file);
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
  const excluded = new Set<string>(PUBLIC_TEXT.exclude);
  return [...new Set(found.map((p) => toPosix(relative(rootDir, p))))]
    .filter((f) => !excluded.has(f))
    .sort();
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
