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
 * §17 item 15, and the final verification's honesty-1 and honesty-3):
 *
 * - the common HTML entities are decoded;
 * - inline tags (`<strong>`, `<em>`, `<a …>`, `<Link …>`, `<code>` and the
 *   like) and every closing tag are dropped, so "not for <strong>sale</strong>"
 *   reads "not for sale" (a second reading keeps the tags, for the words
 *   inside one, such as an `aria-label`);
 * - a JSX string expression (`{"member-"}owned`, `{' '}`) is read as the
 *   text it renders, joined to the text around it;
 * - in .ts and .tsx files, JavaScript escapes (`\u0020`, `\u{2011}`,
 *   `\x20`, `\n`, `\'`) are decoded; in .json files each string value is
 *   read as `JSON.parse` gives it (see `scanJsonText`);
 * - every run of whitespace is one space.
 *
 * So a claim a formatter wrapped across two lines ("not for\n        sale")
 * is still a hit, and each hit is reported at the line of the original file
 * where it starts. tests/claims.test.ts also scans the rendered pages and
 * every mail template, the text as it actually reaches people.
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
  // The kernel's list (packages/kernel/src/rules.ts, noFictionalOwnership),
  // copied exactly: tests/verify-honesty.test.ts checks each source is here.
  // The wider forms of the same claims follow in D-0011's list below.
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
  // The final verification's honesty-4: the commonest co-operative phrase,
  // the space form of "member-owned", and the second person.
  { pattern: /\bowned by (?:its |our |the )?members\b/i, reason: D0011_OWNERSHIP },
  { pattern: /\bmembers?[- ]owned/i, reason: D0011_OWNERSHIP },
  { pattern: /\bowned by you\b/i, reason: D0011_OWNERSHIP },
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
/**
 * A JSX string expression, which renders as its text: {"member-"},
 * {'sale'}, or {`text`} with no ${…} in it. Group 1, 2 or 3 is the text
 * between the quotes, escapes not yet decoded.
 */
const STRING_EXPRESSION =
  /\{\s*(?:"((?:[^"\\\n]|\\[\s\S])*)"|'((?:[^'\\\n]|\\[\s\S])*)'|`((?:[^`\\$]|\\[\s\S]|\$(?!\{))*)`)\s*\}/y;
/**
 * Inline elements: a reader sees their text run on with the text around
 * them. A block element (<p>, <li>, <h2>) is kept, so it still separates.
 */
const INLINE_NAMES =
  "a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|i|ins|kbd|Link|mark|q|s|samp|small|span|strong|sub|sup|time|u|var";
/** An attribute value: "…", '…', or a JSX expression up to three braces deep. */
const ATTR_VALUE = String.raw`(?:"[^"]*"|'[^']*'|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})`;
const ATTR = String.raw`\s+(?:[A-Za-z_][\w:.-]*(?:\s*=\s*${ATTR_VALUE})?|\{\s*\.\.\.[^{}]*\})`;
/**
 * An inline opening tag (attributes and all, as JSX or HTML writes them,
 * across lines), a self-closing one, or any closing tag. The attribute
 * grammar is strict, so a comparison such as `i<b;` is never read as a tag.
 */
const TAG = new RegExp(
  String.raw`<(?:(?:${INLINE_NAMES})(?:${ATTR})*\s*\/?|\/[A-Za-z][\w.:-]*\s*)>`,
  "y",
);
/**
 * A JavaScript escape: \uXXXX, \u{X…}, \xXX, \n \r \t \v \f (whitespace
 * where it renders), \' \" \` \\, and a backslash before a line break
 * (a line continuation, which renders as nothing).
 */
const JS_ESCAPE =
  /\\(?:u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]{1,6})\}|x([0-9a-fA-F]{2})|([nrtvf])|(['"`\\])|(\r\n|\n|\r))/y;
/** Characters that render as nothing: soft hyphen, zero-width space and joiners, BOM. */
const INVISIBLE = /[\u00ad\u200b\u200c\u200d\u2060\ufeff]/;
/**
 * Hyphens and dashes a claim may be written with, read as "-": the Unicode
 * hyphen and non-breaking hyphen, the figure dash, the en dash (and so
 * `&ndash;`), and the minus sign. Not the em dash, which joins clauses.
 */
const HYPHENS = /[\u2010\u2011\u2012\u2013\u2212]/;

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

/** The JavaScript escape at `at`, decoded, and how long it is; or null. */
function jsEscapeAt(raw: string, at: number): { text: string; length: number } | null {
  JS_ESCAPE.lastIndex = at;
  const m = JS_ESCAPE.exec(raw);
  if (!m) return null;
  const hex = m[1] ?? m[3];
  let text: string;
  if (hex !== undefined) text = String.fromCharCode(Number.parseInt(hex, 16));
  else if (m[2] !== undefined) {
    const code = Number.parseInt(m[2], 16);
    if (code > 0x10ffff) return null;
    text = String.fromCodePoint(code);
  } else if (m[4] !== undefined) text = " ";
  else if (m[5] !== undefined) text = m[5];
  else text = "";
  return { text, length: m[0].length };
}

export type Normalized = {
  /** The text as a reader would see it: entities decoded, whitespace collapsed. */
  text: string;
  /** For each UTF-16 unit of `text`, its offset in the original. */
  origin: number[];
  /** Where each dropped tag was in the original: [start, end). */
  droppedTags: [number, number][];
};

export type NormalizeOptions = {
  /**
   * Decode JavaScript escapes (\u0020, \x20, \n …) outside string
   * expressions too, as a .ts or .tsx file's string literals render them.
   * `scanText` sets it from the file's name.
   */
  jsEscapes?: boolean;
  /**
   * Keep tags as they are written (default false: inline and closing tags
   * are dropped). The scan reads the text both ways, so words inside a tag
   * (an `aria-label`, a `title`) are read as well as the text around it.
   */
  keepTags?: boolean;
};

/**
 * The text as a reader sees it, with a map back to the original: the
 * common HTML entities decoded; inline tags and closing tags dropped; a JSX
 * string expression read as its text (`{" "}` as a space); with
 * `jsEscapes`, JavaScript escapes decoded; invisible characters dropped;
 * hyphens and dashes read as "-"; and every run of whitespace (a line
 * break and the indentation after it, a non-breaking space) made one space.
 */
export function normalizeForScan(raw: string, options: NormalizeOptions = {}): Normalized {
  const units: string[] = [];
  const from: number[] = [];
  const droppedTags: [number, number][] = [];
  const push = (text: string, at: number) => {
    for (let k = 0; k < text.length; k += 1) {
      units.push(text[k]!);
      from.push(at);
    }
  };
  /** The characters of a string literal's body, its escapes decoded. */
  const pushLiteral = (start: number, end: number) => {
    let j = start;
    while (j < end) {
      if (raw[j] === "\\") {
        const escape = jsEscapeAt(raw, j);
        if (escape && j + escape.length <= end) {
          push(escape.text, j);
          j += escape.length;
          continue;
        }
      }
      push(raw[j]!, j);
      j += 1;
    }
  };

  let i = 0;
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "&") {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(raw);
      const decoded = m ? decodeEntity(m[1]!) : null;
      if (m && decoded !== null) {
        push(decoded, i);
        i += m[0].length;
        continue;
      }
    } else if (c === "{") {
      JSX_SPACE.lastIndex = i;
      const space = JSX_SPACE.exec(raw);
      if (space) {
        push(" ", i);
        i += space[0].length;
        continue;
      }
      STRING_EXPRESSION.lastIndex = i;
      const m = STRING_EXPRESSION.exec(raw);
      if (m) {
        const body = m[1] ?? m[2] ?? m[3] ?? "";
        const start = i + m[0].search(/["'`]/) + 1;
        pushLiteral(start, start + body.length);
        i += m[0].length;
        continue;
      }
    } else if (c === "<" && !options.keepTags) {
      TAG.lastIndex = i;
      const m = TAG.exec(raw);
      if (m) {
        droppedTags.push([i, i + m[0].length]);
        i += m[0].length;
        continue;
      }
    } else if (c === "\\" && options.jsEscapes) {
      const escape = jsEscapeAt(raw, i);
      if (escape) {
        push(escape.text, i);
        i += escape.length;
        continue;
      }
    }
    push(c, i);
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
  return { text, origin, droppedTags };
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

/** Files whose string literals decode JavaScript escapes when they render. */
const SCRIPT_FILE = /\.(?:tsx?|jsx?|mjs|cjs|json)$/;

/**
 * Every prohibited claim in `text`. Pass `file` (relative to apps/web) to
 * apply that file's allowlist entries; without it, nothing is allowlisted.
 * A .ts, .tsx (or .json) file's JavaScript escapes are decoded too.
 *
 * The text is normalized first (`normalizeForScan`), so `match` is the text
 * as a reader sees it, and `line` is the line of the original where the
 * match starts. Where two patterns match at the same place ("co-owner" and
 * "co-own"), the longer match is reported once.
 */
export function scanText(text: string, file?: string | null): Hit[] {
  const name = file ? toPosix(file) : null;
  return scanNormalized(text, name, name !== null && SCRIPT_FILE.test(name));
}

/**
 * The text is read twice: with inline and closing tags dropped, as a
 * reader sees the words run on ("not for <strong>sale</strong>"), and with
 * every tag kept, for words inside a dropped tag (an `aria-label`, a
 * `title`). The second reading reports only what overlaps a dropped tag;
 * everything else, the first has read. A hit is keyed by where it starts in
 * the original, so a claim both readings find is reported once.
 */
function scanNormalized(text: string, name: string | null, jsEscapes: boolean): Hit[] {
  const starts = lineStarts(text);
  /** By offset in the original text. */
  const byOffset = new Map<number, Hit>();
  let droppedTags: [number, number][] = [];
  for (const keepTags of [false, true]) {
    if (keepTags && droppedTags.length === 0) break;
    const normalized = normalizeForScan(text, { jsEscapes, keepTags });
    if (!keepTags) droppedTags = normalized.droppedTags;
    const scanned = applyAllowlist(normalized.text, name);
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
        const offset = normalized.origin[index] ?? 0;
        if (keepTags) {
          const end = (normalized.origin[index + found[0].length - 1] ?? offset) + 1;
          if (!droppedTags.some(([from, to]) => offset < to && from < end)) continue;
        }
        const existing = byOffset.get(offset);
        if (existing && existing.match.length >= found[0].length) continue;
        byOffset.set(offset, {
          file: name,
          line: lineOf(starts, offset),
          match: found[0],
          pattern: rule.pattern.source,
          reason: rule.reason,
        });
      }
    }
  }
  return [...byOffset.entries()].sort(([a], [b]) => a - b).map(([, hit]) => hit);
}

/** A JSON string literal, as the JSON grammar writes one. */
const JSON_STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/g;

/**
 * Every prohibited claim in a JSON document, read as the pages read it:
 * each string is scanned as `JSON.parse` gives it, so `\u0020` is a space
 * and `\u2011` a hyphen. Each hit is reported at the line where its string
 * starts. A document that is not JSON is scanned as it is written.
 */
export function scanJsonText(text: string, file?: string | null): Hit[] {
  try {
    JSON.parse(text);
  } catch {
    return scanText(text, file);
  }
  const name = file ? toPosix(file) : null;
  const starts = lineStarts(text);
  const hits: Hit[] = [];
  for (const literal of text.matchAll(JSON_STRING)) {
    const value = JSON.parse(literal[0]) as string;
    const line = lineOf(starts, literal.index ?? 0);
    for (const hit of scanNormalized(value, name, false)) hits.push({ ...hit, line });
  }
  return hits;
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
    hits.push(...(file.endsWith(".json") ? scanJsonText(text, file) : scanText(text, file)));
  }
  return { files, hits };
}

/** One line per hit, for the CLI and test failures. */
export function formatHit(hit: Hit): string {
  const where = hit.file ? `${hit.file}:${hit.line}` : `line ${hit.line}`;
  return `${where}: "${hit.match}" (/${hit.pattern}/) — ${hit.reason}`;
}
