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
import { HANDOVER_THRESHOLD } from "./config";

export type Prohibited = {
  pattern: RegExp;
  reason: string;
  /**
   * Matched against the text just before a hit. When it matches, the hit
   * is a denial ("not …", "won't be …") and is not reported.
   */
  unlessPrecededBy?: RegExp;
  /**
   * How many characters before a hit `unlessPrecededBy` reads: 40 unless
   * the rule says more (a denial at the start of its clause).
   */
  lookback?: number;
};

const OWNERSHIP =
  "Member ownership is not issued. Bootstrap may never read as ownership (R-NO-FICTIONAL-OWNERSHIP).";
const D0011_OWNERSHIP =
  "D-0011 prohibits any claim of ownership in the present tense.";
const MONEY =
  "Contributions buy no reach and no say, and OURS offers no financial return (D-0011 §C.2).";

/** An apostrophe as it may be written in source: ' ’ &apos; &#39; &rsquo; */
const APOS = "(?:'|’|&apos;|&#39;|&rsquo;)";
/** An optional quotation mark, straight or curly, slipped between the words of a claim. */
const QUOTE = `["“”'‘’]?`;

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
  // D-0012's prohibitions (M-0011; the fourth verification, honesty 8).
  {
    pattern: /\b(?:first|only) (?:social )?(?:network|platform|app|service)\b/i,
    reason: "D-0012: never call our.one the first or the only anything without a checked source.",
  },
  {
    pattern:
      /\b(?:has|have|had) been handed\b|\bwas handed\b|\bhanded (?:over|to)\b|\bhandover (?:has|had) (?:happened|taken place|been)\b|\bhandover (?:happened|took place)\b|\bhandover (?:is|was) (?:done|complete|completed|finished)\b|\b(?:gave|given) (?:it )?away\b|\bin (?:its|the) members(?:'|’)? hands\b/i,
    reason:
      "D-0012: the handover has not happened; never write it as done. Only a listed denial, such as \"Then nothing is handed over.\", passes, on its own page; since D-0016 §K no sentence passes on every page.",
  },
  {
    // The handover told as done in other verbs (the verification of
    // M-0014). The status line says these things "go to" the members'
    // body, as a promise (D-0016 §J); "went to", "has gone to", "passed
    // to", "given to" and "transferred to" its members say it happened,
    // and so do "maintained by its members", "the members' body has been
    // formed", "its members now hold" and "the handover is over". The
    // re-check added close neighbours: the same verbs to "the not-for-profit
    // body of" its members, "run by", "the members' body holds", "has
    // formed", "…body of its members was founded", and "its members hold".
    pattern:
      /\b(?:went|gone|passed|given|transferred) to (?:(?:a|the) not-for-profit body of |(?:a|the) body of )?(?:its |the |our )?members\b|\b(?:maintained|run) by (?:(?:a|the) not-for-profit body of |(?:a|the) body of )?(?:its |the |our )?members\b|\bmembers(?:'|’)? body (?:has|had) (?:been )?(?:formed|founded)\b|\bmembers(?:'|’)? body (?:is|was) (?:now )?(?:formed|founded)\b|\bmembers(?:'|’)? body (?:now )?holds?\b|\bbody of (?:its|the|our) members (?:was|were|has been|is) (?:now )?(?:formed|founded)\b|\b(?:its|the|our) members (?:now )?hold\b|\bhandover is over\b/i,
    reason:
      "D-0016 §J: the status line promises these things go to the members' body; told as done, in any verb, the handover has not happened.",
  },
  {
    pattern: /\bbelongs? to (?:its |our |the )?(?:members|users|people|community|everyone)\b/i,
    reason: "D-0012: no claim of ownership, in the present or as done.",
  },
  {
    pattern:
      /\bwill (?:\w+ )?(?:be )?own(?:ed)?\b|\bwill (?:\w+ )?be (?:yours|ours|theirs|(?:its |the )?owners)\b|\b(?:you|we|they)(?:'ll|’ll| will) own\b|\bit(?:'s|’s| is) (?:yours|theirs)\b|\bbelongs? to (?:you|us|them)\b/i,
    reason: "D-0012 and M-0011: ownership in the future tense only in the listed handover sentences.",
  },
  {
    // The verification of M-0017 widened it: a word between ("It's already
    // ours.", "It is now ours.") and anything named ("The feed is ours.",
    // "our.one is ours."). A denial ("is not ours") is not a claim, and the
    // message's own words, "should be ours" and "make it ours", aren't caught.
    // Its re-check made it read case: "OURS", the repository's working name
    // (AGENTS.md §11), is not the word "ours" ("What is OURS?").
    pattern: new RegExp(`(?<![\\w.])[\\w.]+(?:${APOS}s| [Ii]s| [Aa]re) (?:(?!not\\b|never\\b)\\w+ )?[Oo]urs\\b`),
    reason: "D-0012: a members' body gives control, not ownership; \"it's ours\" was dropped.",
  },
  {
    // D-0020's first prohibition (the verification of M-0017): user control,
    // the holder or a safeguard told as existing. A denial ("isn't built",
    // "none of the data safeguards is built", "until the holder exists")
    // passes.
    // Its re-check added D-0020's own word ("User control exists.", "The data
    // safeguards exist."), the plain forms ("The holder holds your data.",
    // "The holder has been formed.") and the passive ("The feed is controlled
    // by its users."), and "a", "an" and "any" before a denied subject.
    pattern:
      /\buser control (?:(?:is|was|has been) (?:now |already )?(?:built|here|in force|in place|live|working|ready)|(?:now |already )?exists)\b|\bholder (?:now |already )?(?:holds?|has|keeps|owns) (?:your|their|our|its users|its members|people|the people|members)\b|\bholder (?:exists|(?:is|was|has been) (?:now )?(?:formed|founded|set up|in place))\b|\bsafeguards? (?:(?:is|are|was|were|has been|have been) (?:now |already )?(?:built|in place|working|live|in force)|(?:now |already )?exists?)\b|\b(?:is|are) (?:now |already )?controlled by (?:its |the |our )?(?:users|members|people)\b/i,
    reason: "D-0020: nothing may say that user control, the holder or a safeguard exists before it does.",
    unlessPrecededBy: /\b(?:none of (?:the|its)|no|not|until|before|once|when|if|unless)\s+(?:(?:the|its|data|seven|our|a|an|any)\s+){0,3}$/i,
  },
  {
    // The verification of M-0017: the kit's own check knows the phrase; the
    // site's scan didn't. Its re-check: only a denial earlier in the same
    // clause lets it through ("isn't", "won't be", "not", "never", "no",
    // "nor"), as the kit's check reads it, so rule 9's own words ("Don't
    // present it … as approved, listed or protected by our.one.") pass and
    // "As a member, you're protected by our.one." doesn't.
    pattern: /\bprotected by our\.one\b/i,
    reason: "D-0019 rule 9 and D-0020: nothing is protected by our.one; no safeguard is built.",
    // A sentence that names the claim to forbid it ("presents it as …
    // protected by our.one", the kit's own messages) passes too.
    unlessPrecededBy: /(?:\bnot\b|n['’]t\b|\bnever\b|\bno\b|\bnor\b|\bnone\b|\bpresent(?:s|ed|ing)?\b[^.;:!?]*\bas\b)[^.;:!?]*$/i,
    lookback: 200,
  },
  {
    // The re-check of M-0017: "ours" was widened, and its twin wasn't. A
    // service told as "yours" or "theirs", with a word between or anything
    // named; what a maintainer decides ("ordinary product decisions are
    // yours", the agreement's terms) is not a claim of ownership.
    pattern: new RegExp(`(?<![\\w.])(?!decisions?\\b|choices?\\b)[\\w.]+(?:${APOS}s| is| are) (?:(?!not\\b|never\\b)\\w+ )?(?:yours|theirs)\\b`, "i"),
    reason: "D-0012: no claim of ownership, in the present or as done; \"it's yours\" is the same claim as \"it's ours\".",
  },
  {
    // "hand it to" since M-0013: the front page's signed promise handed
    // our.one to a body of its members, and the rule could not see it
    // (the cold read of 29 September 2026). The verification of M-0013
    // added the past tense and our.one by name: "handed it to", "hand
    // our.one to", "handed our.one over to". Since D-0016 §C the card
    // hands over three named things, which the first form catches.
    pattern: /\bhand(?:s|ed|ing)? (?:it )?over\b|\bhand(?:s|ed|ing)? (?:it|our\.one) (?:over )?to\b|\bgives? it away\b/i,
    reason:
      "M-0011: every sentence about the handover is listed by exact text in ALLOWLIST; any other is refused until it is reviewed and listed.",
  },
  // The verification of M-0015 (honesty 8 and 15). The term /agreement
  // defines, said of anything as a fact: in the active voice ("its users
  // own it", "the users are its owners"), with a word or a quotation mark
  // slipped in ('"owned" by its users', "owned by all its users", 'will be
  // "owned"'), and in other compounds ("people-owned").
  {
    // The re-check of M-0015 added a word or two between ("Its users now
    // own it.", "Its users, together, own it.").
    pattern:
      /\b(?:users|people|members),?\s+(?:[\w’']+,?\s+){0,2}own(?:s)?\b|\bwho use (?:[\w.’']+\s+){1,2}own\b|\b(?:users|people|members) are (?:[\w’']+\s+){0,2}(?:co-)?owners\b/i,
    reason:
      "D-0012 and D-0017 §B: \"owned\" is defined on /agreement and claimed of nothing; none of its collective rights is in force.",
  },
  {
    // The re-check of M-0015: up to three words may stand between "owned
    // by" and its owners ("owned by its own users", "owned by the feed's
    // users", "owned by our.one's users").
    pattern: new RegExp(
      `\\bowned${QUOTE}\\s+by\\s+(?:all\\s+(?:of\\s+)?|those\\s+who\\s+use|everyone\\s+who\\s+uses?)|\\bowned${QUOTE}\\s+by\\s+(?:[\\w.’']+\\s+){0,3}${QUOTE}(?:users|people|members|community|everyone)\\b|\\bwill\\s+(?:\\w+\\s+)?(?:be\\s+)?${QUOTE}own(?:ed)?\\b|\\bpeople[- ]owned\\b`,
      "i",
    ),
    reason: "D-0012 and D-0017 §B: \"owned\" is defined on /agreement, in its listed words only, and claimed of nothing.",
  },
  {
    // The handover told as done in two more verbs, and the holder as
    // having received what it only will (the verification of M-0015).
    pattern:
      /\b(?:moved|went|gone|passed|given|transferred|handed|belongs?|belonged) to the holder\b|\b(?:moved|now belongs?) to (?:(?:a|the) not-for-profit body of |(?:a|the) body of )?(?:its |the |our )?members\b/i,
    reason: "D-0012 and D-0017 §E: nothing has gone to the holder or to the members' body; no holder exists.",
  },
  {
    // D-0017 prohibits promising builders income: "can earn a living"
    // stays conditional on people choosing and paying for the service.
    pattern: new RegExp(
      `\\byou(?:${APOS}ll| will) (?:be paid|get paid|earn)\\b|\\bwill earn (?:a|your) living\\b|\\bguaranteed (?:an? )?(?:income|pay|living)\\b|\\byou(?:${APOS}re| are) guaranteed\\b`,
      "i",
    ),
    reason: "D-0017: no promise of income to builders; pay depends on people choosing and paying for a service.",
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

/** The threshold as the pages write it, for the handover sentences' rendered form. */
const T = HANDOVER_THRESHOLD.toLocaleString("en-US");
const FRONT_FILE = "src/components/public/FrontPage.tsx";
const CONTRACT_PAGE = "src/app/(public)/contract/page.tsx";
const HANDOVER_REASON =
  "D-0012 §B and §D, D-0015 §C, D-0016 §C and §K, M-0011, M-0013 and M-0014: a sentence about the handover, reviewed and listed by exact text (source and rendered form).";

export type AllowEntry = {
  /**
   * The file, relative to apps/web, with forward slashes. The sentence is
   * let through there and nowhere else: since D-0016 §K no sentence passes
   * on every page (the status line no longer needs to).
   */
  file: string;
  /** One exact sentence in that file. Only this sentence is let through. */
  sentence: string;
  reason: string;
};

export const ALLOWLIST: readonly AllowEntry[] = [
  // The handover sentences (M-0011: the only ones the handover rule lets
  // through). Each is listed twice: as the source writes it, and as a
  // person reads it with the threshold filled in.
  ...[
    // The signed promise on the first screen (D-0016 §C): the three things
    // the contract hands over, and to whom.
    "When {THRESHOLD} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.",
    `When ${T} people have joined, I hand over its domain, its data and the right to replace me to a not-for-profit body of its members.`,
    "When {THRESHOLD} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.",
    `When ${T} people have joined, I hand over our.one's domain, its data and the right to replace whoever runs it to a not-for-profit body of its members, founded by their vote.`,
    "Then nothing is handed over.",
    // "What's a maintainer?", in the contract's terms (the verification of M-0013).
    "After ${THRESHOLD}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.",
    `After ${T}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`,
  ].map((sentence) => ({ file: FRONT_FILE, sentence, reason: HANDOVER_REASON })),
  ...[
    "At ${THRESHOLD} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day.",
    `At ${T} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day.`,
    "Nothing is handed over.",
  ].map((sentence) => ({ file: CONTRACT_PAGE, sentence, reason: HANDOVER_REASON })),
  {
    // The /rules page's data. Only src/app/(public)/rules/page.tsx imports
    // it; tests/claims.test.ts checks that, so the sentence stays on /rules.
    file: "src/components/public/floorRules.ts",
    sentence: "No algorithm decides the order.",
    reason:
      "SPEC §12 allows \"no algorithm\" only on /rules, in this exact sentence: the feed is newest first, and nothing ranks it.",
  },
  {
    // The file holding the /contract copy (SPEC §18.7). A page file is
    // imported by nothing else, so the sentence stays on /contract.
    file: "src/app/(public)/contract/page.tsx",
    sentence: "Neither our.one nor any part of it will be sold, and nobody will invest in it for a return.",
    reason:
      "D-0012 §A, promise 1: a denial of investment. SPEC §18.7 allows it on /contract only, in this exact sentence.",
  },
  // The common agreement (D-0017 §B and §J, D-0018 §E; SPEC §18.17). A page
  // file is imported by nothing else, so these stay on /agreement: the
  // definition of "owned", which claims it of nothing; the sentence that
  // applies it, followed on the page by "None does yet."; and promise 1's
  // denial of investment, for every service.
  ...[
    "Owned by its users means: its users, together, decide its essential rules, approve its budget, and can change who runs it while the service keeps going.",
    "We call a service owned by its users only when all of that holds.",
    "Neither a service nor any part of it will be sold, and nobody will invest in it for a return.",
    // The contract's never-reached case, in its own verb (the re-check of M-0015).
    "If that count is never reached, nothing is handed over.",
  ].map((sentence) => ({
    file: "src/app/(public)/agreement/page.tsx",
    sentence,
    reason:
      "D-0017 §B and D-0018 §E: the definition of \"owned\", the sentence that applies it, the agreement's denial of investment, and the contract's never-reached case (D-0012 §B), on /agreement only and in these exact words.",
  })),
  {
    // /projects states the contract's never-reached case in the contract's verb.
    file: "src/app/(public)/projects/page.tsx",
    sentence:
      "If that count is never reached, nothing is handed over, and the promise not to sell still holds.",
    reason: HANDOVER_REASON,
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
  minus: "\u2212",
  shy: "",
  zwj: "\u200d",
  zwnj: "\u200c",
  lrm: "\u200e",
  rlm: "\u200f",
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
  "a|abbr|b|bdi|bdo|cite|code|data|del|dfn|em|i|ins|kbd|Link|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr";
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
/** A line break element, which a reader sees as a break between words. */
const LINE_BREAK = /<br(?:\s+[^<>]*?)?\s*\/?>/iy;
/** A JSX fragment's tags, <> and </>, which render as nothing. */
const FRAGMENT = /<\/?>/y;
/**
 * A JavaScript escape: \uXXXX, \u{X…}, \xXX, \n \r \t \v \f (whitespace
 * where it renders), \' \" \` \\, and a backslash before a line break
 * (a line continuation, which renders as nothing).
 */
const JS_ESCAPE =
  /\\(?:u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]{1,6})\}|x([0-9a-fA-F]{2})|([nrtvf])|(['"`\\])|(\r\n|\n|\r))/y;
/** Characters that render as nothing: soft hyphen, zero-width space and joiners, BOM. */
const INVISIBLE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
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
      LINE_BREAK.lastIndex = i;
      const br = LINE_BREAK.exec(raw);
      if (br) {
        droppedTags.push([i, i + br[0].length]);
        push(" ", i);
        i += br[0].length;
        continue;
      }
      FRAGMENT.lastIndex = i;
      const fragment = FRAGMENT.exec(raw);
      if (fragment) {
        droppedTags.push([i, i + fragment[0].length]);
        i += fragment[0].length;
        continue;
      }
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
          const before = scanned.slice(Math.max(0, index - (rule.lookback ?? 40)), index);
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

/* ------------------------------------------------------ the build kit's text */

/**
 * The build kit's text (D-0019 §B, M-0016), relative to apps/web: the
 * feed's manifest and rules block, and the files the site serves from kit/
 * at the repository's root, with the kit's README. Read by its own
 * function, so the trees the older tests build for `scanRepoPublicText`
 * stay as they are. Every file must exist: a scan that silently read
 * nothing would pass.
 */
export const KIT_TEXT = {
  files: [
    "our.one.json",
    "AGENTS.md",
    "../../kit/build.md",
    "../../kit/README.md",
    "../../kit/our-one.mjs",
    "../../kit/our.one.schema.json",
  ],
  /** The feed's manifest, whose claims.allowed sentences are quotations. */
  manifest: "our.one.json",
} as const;

/** Scan the kit's text, under `rootDir` (apps/web). */
export function scanKitText(rootDir: string): ScanResult {
  const files: string[] = [];
  const hits: Hit[] = [];
  for (const file of KIT_TEXT.files) {
    const path = join(rootDir, file);
    if (!statSync(path).isFile()) throw new Error(`claims scan: ${file} is not a file`);
    files.push(file);
    const text = readFileSync(path, "utf8");
    if (file === KIT_TEXT.manifest) hits.push(...scanManifestText(text, file));
    else hits.push(...(file.endsWith(".json") ? scanJsonText(text, file) : scanText(text, file)));
  }
  return { files, hits };
}

/**
 * The feed's manifest, read as `scanJsonText` reads JSON, except for the
 * sentences it lists in claims.allowed: the kit's own check lets those
 * through on /agreement (D-0019 §F). Each must be a sentence ALLOWLIST
 * already lets through in that same file, and is then a quotation, not a
 * new claim, so it isn't scanned again; one ALLOWLIST doesn't hold is a hit.
 */
export function scanManifestText(text: string, file: string): Hit[] {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch {
    return scanText(text, file);
  }
  const name = toPosix(file);
  const starts = lineStarts(text);
  const hits: Hit[] = [];
  const quotations = new Set<string>();
  const claims = manifest && typeof manifest === "object" ? (manifest as { claims?: unknown }).claims : undefined;
  const allowed = claims && typeof claims === "object" ? (claims as { allowed?: unknown }).allowed : undefined;
  if (Array.isArray(allowed)) {
    for (const entry of allowed as { file?: unknown; text?: unknown }[]) {
      if (!entry || typeof entry.file !== "string" || typeof entry.text !== "string") continue;
      const { file: quotedFile, text: quoted } = entry as { file: string; text: string };
      if (ALLOWLIST.some((a) => a.file === quotedFile && a.sentence === quoted)) {
        quotations.add(quoted);
      } else {
        hits.push({
          file: name,
          line: lineOf(starts, Math.max(0, text.indexOf(JSON.stringify(quoted)))),
          match: quoted,
          pattern: "claims.allowed",
          reason:
            "D-0019 §F: the manifest may let through only a sentence that ALLOWLIST already lets through in that file, word for word.",
        });
      }
    }
  }
  for (const literal of text.matchAll(JSON_STRING)) {
    const value = JSON.parse(literal[0]) as string;
    if (quotations.has(value)) continue;
    const line = lineOf(starts, literal.index ?? 0);
    for (const hit of scanNormalized(value, name, false)) hits.push({ ...hit, line });
  }
  return hits;
}

/** One line per hit, for the CLI and test failures. */
export function formatHit(hit: Hit): string {
  const where = hit.file ? `${hit.file}:${hit.line}` : `line ${hit.line}`;
  return `${where}: "${hit.match}" (/${hit.pattern}/) — ${hit.reason}`;
}
