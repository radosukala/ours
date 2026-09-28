/**
 * The public ledger, the control map, the rules page's claims about its
 * own tests, and the counts (SPEC §10, §11; D-0011 §C; M-0010: "a
 * [CONFIRM] fact is rendered as not yet recorded, never resolved").
 *
 * Denial paths first: a proposal is never received, an estimate is never
 * paid, and an entry whose status is unknown is refused, not guessed at.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CostsPage from "@/app/(public)/costs/page";
import * as PublicLayout from "@/app/(public)/layout";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import * as RootNotFound from "@/app/not-found";
import { ControlList } from "@/components/public/ControlList";
import { FLOOR_RULES, NO_ALGORITHM_SENTENCE } from "@/components/public/floorRules";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { LedgerView } from "@/components/public/LedgerView";
import { ENFORCEMENT_WORDS } from "@/components/public/RuleList";
import { STATUS_LINE } from "@/components/RightColumn";
import { DEFAULT_INVITES } from "@/core/config";
import { counts, health } from "@/core/health";
import { sendMail } from "@/core/mail";
import { suspensionEmail } from "@/core/mail-templates";
import { mailLog, outbox } from "@/core/schema";
import {
  controlStatusWords,
  DATA_CONTROLLER_ASSET,
  EMAIL_PROVIDER_WORDS,
  type EmailSending,
  emailSending,
  HOSTING_ASSET,
  ledgerStatusWords,
  ledgerSummary,
  loadControl,
  loadLedger,
  parseControl,
  parseLedger,
  TransparencyError,
  withConfiguredController,
  withEmailSending,
} from "@/core/transparency";
import { at, befriend, db, makeAccount, plus, post, reset } from "./helpers";

// Resend itself is never reached from a test: this stands in for the SDK,
// so a test can see that sendMail hands a message to it.
const resendSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: "FICTIONAL" }, error: null })));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");

type RawEntry = Record<string, unknown>;

/** A FICTIONAL receipt path: a RECORDED contribution or expense must name one. */
const EVIDENCE = "receipts/FICTIONAL/L-0100-invoice.pdf";

function entry(fields: RawEntry): RawEntry {
  return {
    id: "L-0100",
    kind: "expense",
    status: "RECORDED",
    date: "2026-09-24",
    description: "FICTIONAL entry",
    amount: 10,
    evidence: EVIDENCE,
    note: null,
    ...fields,
  };
}

/** Visible text of rendered HTML, roughly as a reader sees it. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const FICTIONAL_CONTROLLER = { name: "FICTIONAL Controller", email: "controller@example.test" };

function ledgerWith(entries: RawEntry[], overrides: RawEntry = {}) {
  return {
    scope: "FICTIONAL scope line.",
    currency: "USD",
    contributions_open: false,
    unpaid_work: "FICTIONAL unpaid work line.",
    entries,
    ...overrides,
  };
}

function refusedWith(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof TransparencyError) return error.message;
    throw error;
  }
  throw new Error("expected a TransparencyError, but nothing was refused");
}

/** The HTML of one /costs section, by its data-section marker. */
function section(html: string, name: string): string {
  const start = html.indexOf(`data-section="${name}"`);
  expect(start, `section ${name}`).toBeGreaterThanOrEqual(0);
  const next = html.indexOf("data-section=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

describe("ledger: what is never counted", () => {
  it("never counts a PROPOSED commitment as received", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([
          entry({ id: "L-0001", kind: "commitment", status: "PROPOSED", amount: 2500 }),
          entry({ id: "L-0002", kind: "contribution", status: "RECORDED", amount: 100 }),
        ]),
      ),
    );
    expect(summary.received.total).toBe(100);
    expect(summary.received.entries.map((e) => e.id)).toEqual(["L-0002"]);
    expect(summary.remaining).toBe(100);
    expect(summary.coming.map((e) => e.id)).toEqual(["L-0001"]);
  });

  it("with only a PROPOSED commitment, nothing is received and nothing remains", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([entry({ id: "L-0001", kind: "commitment", status: "PROPOSED", amount: 2500 })]),
      ),
    );
    expect(summary.received).toEqual({ entries: [], total: 0 });
    expect(summary.remaining).toBeNull();
  });

  it("never counts a RECORDED commitment as received either: it is coming until it arrives", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([entry({ id: "L-0001", kind: "commitment", status: "RECORDED", amount: 50 })]),
      ),
    );
    expect(summary.received.total).toBe(0);
    expect(summary.coming.map((e) => e.id)).toEqual(["L-0001"]);
    expect(ledgerStatusWords(summary.coming[0]!)).toBe("recorded commitment, not yet received");
  });

  it("refuses a contribution that is only proposed: a pledge is a commitment until it is received", () => {
    const message = refusedWith(() =>
      parseLedger(ledgerWith([entry({ kind: "contribution", status: "PROPOSED" })])),
    );
    expect(message).toMatch(/contribution cannot have status PROPOSED/);
  });

  it("never counts an ESTIMATE as paid", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([
          entry({ id: "L-0001", kind: "estimate", status: "ESTIMATE", amount: 700, period: "per year" }),
          entry({ id: "L-0002", kind: "expense", status: "RECORDED", amount: 50 }),
        ]),
      ),
    );
    expect(summary.paid.total).toBe(50);
    expect(summary.paid.entries.map((e) => e.id)).toEqual(["L-0002"]);
    expect(summary.coming.map((e) => e.id)).toEqual(["L-0001"]);
  });

  it("refuses an expense marked as an estimate: a figure is an estimate until it is invoiced", () => {
    const message = refusedWith(() =>
      parseLedger(ledgerWith([entry({ kind: "expense", status: "ESTIMATE" })])),
    );
    expect(message).toMatch(/expense cannot have status ESTIMATE/);
  });

  it("shows provider credits as credits, never as money received", () => {
    const summary = ledgerSummary(
      parseLedger(ledgerWith([entry({ id: "L-0001", kind: "credit", status: "CREDIT", amount: 300 })])),
    );
    expect(summary.received.total).toBe(0);
    expect(summary.paid.total).toBe(0);
    expect(summary.remaining).toBeNull();
    expect(summary.coming).toEqual([]);
    expect(summary.credits.map((e) => e.id)).toEqual(["L-0001"]);
    const html = renderToStaticMarkup(createElement(LedgerView, { summary }));
    expect(section(html, "received")).not.toContain("$300");
    expect(section(html, "credits")).toContain("credit from a provider, not money");
  });

  it("refuses a RECORDED contribution or expense that names no evidence (SPEC §17 item 16)", () => {
    expect(
      refusedWith(() => parseLedger(ledgerWith([entry({ kind: "contribution", evidence: null })]))),
    ).toMatch(/a RECORDED contribution must name its evidence/);
    expect(
      refusedWith(() => parseLedger(ledgerWith([entry({ kind: "expense", evidence: null })]))),
    ).toMatch(/a RECORDED expense must name its evidence/);
    // Leaving the key out is the same as null.
    const { evidence: _omitted, ...withoutKey } = entry({ kind: "expense" });
    expect(refusedWith(() => parseLedger(ledgerWith([withoutKey])))).toMatch(/must name its evidence/);
  });

  it("still takes a commitment, an estimate or a credit with no evidence yet: none of them is counted as money", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([
          entry({ id: "L-0001", kind: "commitment", status: "RECORDED", evidence: null }),
          entry({ id: "L-0002", kind: "commitment", status: "PROPOSED", evidence: null }),
          entry({ id: "L-0003", kind: "estimate", status: "ESTIMATE", evidence: null }),
          entry({ id: "L-0004", kind: "credit", status: "CREDIT", evidence: null }),
        ]),
      ),
    );
    expect(summary.received.total).toBe(0);
    expect(summary.paid.total).toBe(0);
  });

  it("refuses evidence that is not a path in the repository", () => {
    for (const evidence of ["https://example.test/invoice.pdf", "../outside.pdf", "/etc/passwd", "an invoice"]) {
      expect(() => parseLedger(ledgerWith([entry({ evidence })])), evidence).toThrow(/is not a repository path/);
    }
  });

  it("refuses RECORDED evidence that names no record: a placeholder word, a folder, a file outside receipts/ or with no extension (final verification, honesty-5)", () => {
    const placeholders = [
      "none",
      "TBD",
      "n/a",
      "pending",
      ".",
      "-",
      "receipts",
      "receipts/",
      "receipts/2026",
      "receipts/2026/",
      "receipts/invoice",
      "receipts/.pdf",
      "receipts/2026/.hidden",
      "receipts//invoice.pdf",
      "docs/invoice.pdf",
      "decisions/D-0011.md",
      "apps/web/transparency/ledger.json",
    ];
    for (const evidence of placeholders) {
      for (const kind of ["contribution", "expense", "commitment"]) {
        expect(() => parseLedger(ledgerWith([entry({ kind, evidence })])), `${kind}: ${evidence}`).toThrow(
          TransparencyError,
        );
      }
    }
    // A file under receipts/, with its extension, is evidence.
    for (const evidence of [EVIDENCE, "receipts/2026-09-24-L-0100.md", "receipts/2026/09/L_0100.invoice.PDF"]) {
      const summary = ledgerSummary(parseLedger(ledgerWith([entry({ evidence, amount: 120 })])));
      expect(summary.paid.total, evidence).toBe(120);
    }
    // An entry not yet recorded may still point at another record, or none.
    expect(
      ledgerSummary(
        parseLedger(
          ledgerWith([entry({ kind: "commitment", status: "PROPOSED", evidence: "decisions/D-0011.md" })]),
        ),
      ).coming,
    ).toHaveLength(1);
  });
});

describe("ledger: unknown status is refused", () => {
  const unknown: unknown[] = [
    "CONFIRM",
    "[CONFIRM]",
    "[CONFIRM — invoice]",
    "recorded",
    "RECEIVED",
    "PAID",
    "PENDING",
    "",
    null,
    undefined,
    1,
    ["RECORDED"],
  ];
  for (const status of unknown) {
    it(`refuses status ${JSON.stringify(status) ?? "undefined"}`, () => {
      const message = refusedWith(() =>
        ledgerSummary(parseLedger(ledgerWith([entry({ status })]))),
      );
      expect(message).toMatch(/status .* is not one of RECORDED, PROPOSED, ESTIMATE, CREDIT/);
    });
  }

  it("refuses the whole ledger, so no partial sums are shown", () => {
    expect(() =>
      parseLedger(
        ledgerWith([
          entry({ id: "L-0001", kind: "contribution", status: "RECORDED", amount: 100 }),
          entry({ id: "L-0002", status: "[CONFIRM]" }),
        ]),
      ),
    ).toThrow(TransparencyError);
  });

  it("refuses other malformed entries", () => {
    for (const bad of [
      entry({ kind: "donation" }),
      entry({ amount: -1 }),
      entry({ amount: "2500" }),
      entry({ amount: Number.NaN }),
      entry({ amount: 1.005 }),
      entry({ date: "24 September 2026" }),
      entry({ date: "2026-13-45" }),
      entry({ id: "1" }),
      entry({ description: "" }),
      entry({ evidence: 42 }),
    ]) {
      expect(() => parseLedger(ledgerWith([bad])), JSON.stringify(bad)).toThrow(TransparencyError);
    }
    expect(() =>
      parseLedger(ledgerWith([entry({ id: "L-0001" }), entry({ id: "L-0001" })])),
    ).toThrow(/appears twice/);
    expect(() => parseLedger(ledgerWith([], { currency: "dollars" }))).toThrow(TransparencyError);
    expect(() => parseLedger(ledgerWith([], { contributions_open: "no" }))).toThrow(TransparencyError);
    expect(() => parseLedger(null)).toThrow(TransparencyError);
  });

  it("adds in cents", () => {
    const summary = ledgerSummary(
      parseLedger(
        ledgerWith([
          entry({ id: "L-0001", kind: "contribution", amount: 0.1 }),
          entry({ id: "L-0002", kind: "contribution", amount: 0.2 }),
          entry({ id: "L-0003", kind: "expense", amount: 0.3 }),
        ]),
      ),
    );
    expect(summary.received.total).toBe(0.3);
    expect(summary.remaining).toBe(0);
  });
});

describe("the ledger file", () => {
  it("every evidence path in ledger.json is a file in the repository (final verification, honesty-5)", () => {
    const raw = JSON.parse(readFileSync(join(WEB_ROOT, "transparency/ledger.json"), "utf8")) as {
      entries: { id: string; evidence?: string | null }[];
    };
    const ledger = loadLedger();
    expect(ledger.entries.map((e) => e.evidence)).toEqual(raw.entries.map((e) => e.evidence ?? null));
    for (const e of ledger.entries) {
      if (e.evidence === null) continue;
      const path = join(REPO_ROOT, e.evidence);
      expect(existsSync(path) && statSync(path).isFile(), `${e.id}: ${e.evidence}`).toBe(true);
    }
  });

  it("loads, and holds only the proposal and the estimate SPEC §11 records", () => {
    const ledger = loadLedger();
    expect(ledger.currency).toBe("USD");
    expect(ledger.contributionsOpen).toBe(false);
    const summary = ledgerSummary();
    expect(summary.received).toEqual({ entries: [], total: 0 });
    expect(summary.paid).toEqual({ entries: [], total: 0 });
    expect(summary.remaining).toBeNull();
    expect(summary.coming.map((e) => [e.id, e.kind, e.status, e.amount])).toEqual([
      ["L-0001", "commitment", "PROPOSED", 2500],
      ["L-0002", "estimate", "ESTIMATE", 700],
    ]);
  });

  it("renders the four sections with status words, and the 2,500 only as a proposal", () => {
    const html = renderToStaticMarkup(createElement(LedgerView, { summary: ledgerSummary() }));
    expect(section(html, "received")).toContain("Nothing received yet.");
    expect(section(html, "received")).not.toContain("2,500");
    expect(section(html, "paid")).toContain("No costs recorded as paid yet.");
    expect(section(html, "paid")).not.toContain("700");
    expect(section(html, "remaining")).toContain("Nothing received yet.");
    const coming = section(html, "coming");
    expect(coming).toContain("$2,500");
    expect(coming).toContain("proposed, not yet confirmed");
    expect(coming).toContain("$700 per year");
    expect(coming).toContain("estimate, not yet invoiced");
    expect(coming).toContain("not yet stated"); // repayable
    expect(html).not.toContain('data-section="credits"');
  });
});

describe("control", () => {
  it("renders NOT_YET_RECORDED as 'not yet recorded' (a server with no controller configured)", () => {
    expect(controlStatusWords("NOT_YET_RECORDED")).toBe("not yet recorded");
    const rows = loadControl(null);
    const html = renderToStaticMarkup(createElement(ControlList, { rows }));
    for (const asset of ["Data controller", "If the founder stops"]) {
      const start = html.indexOf(asset);
      expect(start).toBeGreaterThanOrEqual(0);
      const item = html.slice(start, html.indexOf("</li>", start));
      expect(item).toContain("not yet recorded");
      expect(item).toContain('data-status="NOT_YET_RECORDED"');
      expect(item).toContain("No record yet.");
    }
    expect(html.match(/data-status="NOT_YET_RECORDED"[^>]*>not yet recorded</g)).toHaveLength(2);
    // The maintainer's row says in its own words that its facts are not yet recorded.
    expect(html).toContain("responsibility for our.one are not yet recorded");
    expect(html).toContain("stated by the founder, not verified");
  });

  it("holds the rows of SPEC §11, in order, with their statuses as SPEC §17 item 18 amends them", () => {
    const rows = loadControl(null);
    expect(rows.map((r) => [r.asset, r.status])).toEqual([
      ["The rules of our.one", "RECORDED"],
      ["The domain our.one", "RECORDED"],
      ["The maintainer", "STATED"],
      ["The code", "STATED"],
      ["Hosting, database, email sending", "RECORDED"],
      ["Releases", "RECORDED"],
      ["Moderation", "STATED"],
      ["Money", "RECORDED"],
      ["Data controller", "NOT_YET_RECORDED"],
      ["If the founder stops", "NOT_YET_RECORDED"],
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.asset, r]));
    expect(by["Moderation"]?.who).toBe(
      "No administrator exists until something is deployed; the founder will be the only one.",
    );
    expect(by["The code"]?.who).toMatch(/^Apache-2\.0; public once this build is pushed to the public repository\./);
    // Nothing in the file is STATED on the configuration's word.
    expect(rows.every((r) => r.statedBy === undefined)).toBe(true);
  });

  it("shows the configured data controller as stated in this server's configuration, with no record", () => {
    const rows = loadControl(FICTIONAL_CONTROLLER);
    const row = rows.find((r) => r.asset === DATA_CONTROLLER_ASSET)!;
    expect(row).toEqual({
      asset: "Data controller",
      who: "FICTIONAL Controller. Write to controller@example.test.",
      status: "STATED",
      evidence: null,
      statedBy: "configuration",
    });
    // Its place in the list, and every other row, are the file's.
    expect(rows.map((r) => r.asset)).toEqual(loadControl(null).map((r) => r.asset));
    expect(rows.filter((r) => r !== row)).toEqual(loadControl(null).filter((r) => r.asset !== DATA_CONTROLLER_ASSET));
    const html = renderToStaticMarkup(createElement(ControlList, { rows }));
    const start = html.indexOf("Data controller");
    const item = textOf(html.slice(start, html.indexOf("</li>", start)));
    expect(item).toBe(
      "Data controller stated in this server's configuration FICTIONAL Controller. Write to controller@example.test. No record yet.",
    );
    // The maintainer's statement is still the founder's.
    expect(textOf(html)).toContain("stated by the founder, not verified");
    expect(html.match(/data-status="NOT_YET_RECORDED"/g)).toHaveLength(1);
  });

  it("reads the controller from the configuration when called, not at import", () => {
    try {
      vi.stubEnv("DATA_CONTROLLER", "");
      expect(loadControl().find((r) => r.asset === DATA_CONTROLLER_ASSET)?.status).toBe("NOT_YET_RECORDED");
      vi.stubEnv("DATA_CONTROLLER", "FICTIONAL Other Controller");
      vi.stubEnv("DATA_CONTROLLER_EMAIL", "other@example.test");
      expect(loadControl().find((r) => r.asset === DATA_CONTROLLER_ASSET)?.who).toBe(
        "FICTIONAL Other Controller. Write to other@example.test.",
      );
      // A name without an address names nobody, as for joining.
      vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
      expect(loadControl().find((r) => r.asset === DATA_CONTROLLER_ASSET)?.status).toBe("NOT_YET_RECORDED");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a control file with no data-controller row, two of them, or one that claims a controller itself", () => {
    const file = parseControl({
      rows: [
        { asset: "FICTIONAL asset", who: "FICTIONAL", status: "STATED", evidence: null },
        { asset: "Data controller", who: "Not yet named.", status: "NOT_YET_RECORDED", evidence: null },
      ],
    });
    expect(withConfiguredController(file, null)).toEqual(file);
    expect(() => withConfiguredController(file.slice(0, 1), null)).toThrow(/no "Data controller" row/);
    expect(() => withConfiguredController([...file, file[1]!], FICTIONAL_CONTROLLER)).toThrow(/appears twice/);
    const claimed = file.map((r) =>
      r.asset === "Data controller"
        ? { ...r, who: "FICTIONAL Somebody", status: "STATED" as const }
        : r,
    );
    expect(() => withConfiguredController(claimed, null)).toThrow(TransparencyError);
    expect(() => withConfiguredController(claimed, FICTIONAL_CONTROLLER)).toThrow(TransparencyError);
  });

  it("every evidence path is a file in the repository", () => {
    for (const row of loadControl()) {
      for (const e of row.evidence ?? []) {
        expect(existsSync(join(REPO_ROOT, e.path)), `${row.asset}: ${e.path}`).toBe(true);
      }
    }
  });

  it("refuses an unknown status, a RECORDED row without evidence, and evidence on a row not yet recorded", () => {
    const row = (fields: Record<string, unknown>) => ({
      rows: [
        {
          asset: "FICTIONAL asset",
          who: "FICTIONAL",
          status: "RECORDED",
          evidence: [{ path: "decisions/D-0011.md", label: "x" }],
          ...fields,
        },
      ],
    });
    for (const status of ["CONFIRM", "[CONFIRM]", "recorded", "VERIFIED", null]) {
      expect(() => parseControl(row({ status })), String(status)).toThrow(TransparencyError);
    }
    expect(() => parseControl(row({ evidence: null }))).toThrow(/must name its evidence/);
    expect(() => parseControl(row({ evidence: [] }))).toThrow(TransparencyError);
    expect(() => parseControl(row({ status: "NOT_YET_RECORDED" }))).toThrow(/cannot carry evidence/);
    for (const path of ["../secrets", "/etc/passwd", "https://example.test/x", "a b"]) {
      expect(() => parseControl(row({ evidence: [{ path, label: "x" }] })), path).toThrow(
        TransparencyError,
      );
    }
    expect(() => parseControl({ rows: "none" })).toThrow(TransparencyError);
  });
});

describe("the rules page names its own checks honestly", () => {
  const spec = readFileSync(join(WEB_ROOT, "SPEC.md"), "utf8");
  const ownership = spec.slice(spec.indexOf("## 14."), spec.indexOf("## 15."));
  const assigned = new Set(
    [...ownership.matchAll(/tests\/[a-z]+\.test\.ts/g)].map((m) => m[0]),
  );

  it("every ENFORCED or CHECKED rule names test files that SPEC §14 assigns to a module", () => {
    expect(assigned.size).toBeGreaterThan(10);
    for (const group of FLOOR_RULES) {
      for (const rule of group.rules) {
        if (rule.cls === "ENFORCED" || rule.cls === "CHECKED") {
          expect(rule.tests?.length, rule.id).toBeGreaterThan(0);
          for (const file of rule.tests ?? []) {
            expect(assigned.has(file), `${rule.id}: ${file}`).toBe(true);
          }
        } else {
          expect(rule.tests ?? [], rule.id).toEqual([]);
        }
      }
    }
  });

  it("every test file /rules names exists (after the merge, all of them)", () => {
    const named = new Set(FLOOR_RULES.flatMap((g) => g.rules.flatMap((r) => r.tests ?? [])));
    expect(named.size).toBeGreaterThan(10);
    for (const file of named) {
      expect(existsSync(join(WEB_ROOT, file)), file).toBe(true);
    }
  });

  it("says the founder default of invites, the exact order sentence, and who reads reports", () => {
    const rules = FLOOR_RULES.flatMap((g) => g.rules);
    const text = rules.map((r) => `${r.text} ${r.more ?? ""}`).join("\n");
    expect(text).toContain(`${DEFAULT_INVITES} is a founder default`);
    expect(rules.find((r) => r.id === "feed")?.more).toBe("No algorithm decides the order.");
    expect(NO_ALGORITHM_SENTENCE).toBe("No algorithm decides the order.");
    expect(text).toContain("Admins can read reported content through the queue only");
    expect(text).toMatch(/self-attested/);
    expect(rules.find((r) => r.id === "claims")?.cls).toBe("CHECKED");
  });
});

describe("the public pages, rendered (SPEC §17 items 17–20)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("/rules shows who decides, that the founder can change or remove any check without notice, and every rule with its class and tests", () => {
    const text = textOf(renderToStaticMarkup(createElement(RulesPage)));
    expect(text).toContain("Who decides today");
    expect(text).toContain(
      "These checks are code, and the founder can change or remove any of them without notice: nothing technical stops that. What they promise is bound by the contract: a change to a promise is announced 60 days ahead, with the reason, and you can leave with everything first. Every change is a commit in the our.one records, published with each release.",
    );
    expect(text).toContain(STATUS_LINE);
    for (const words of Object.values(ENFORCEMENT_WORDS)) expect(text).toContain(words);
    for (const rule of FLOOR_RULES.flatMap((g) => g.rules)) {
      expect(text, rule.id).toContain(rule.text);
      if (rule.more) expect(text, rule.id).toContain(rule.more);
      for (const file of rule.tests ?? []) expect(text, `${rule.id}: ${file}`).toContain(file);
    }
    // The sentences SPEC §17 items 9, 13 and 19 put on /rules.
    for (const sentence of [
      "Every account except the founder's is invited by a person.",
      "Nobody can export your data or edit what you wrote. The author of a post can delete replies to it, and an administrator can remove content with a statement of reasons.",
      "Usernames are unique, so trying to take one tells you whether it's in use — even by someone who blocked you.",
      "the person who sent it isn't told, but they can see that it is no longer waiting.",
    ]) {
      expect(text).toContain(sentence);
    }
    expect(text).not.toContain("Nobody can export, delete or edit anyone else's data.");
    expect(text).not.toContain("the only administrator.");
  });

  it("/rules cites the tests that assert replies and likes across a block, and that a muted person is not told", () => {
    const tests = (id: string) => FLOOR_RULES.flatMap((g) => g.rules).find((r) => r.id === id)!.tests!;
    expect(tests("blocking")).toEqual(expect.arrayContaining(["tests/posts.test.ts", "tests/likes.test.ts"]));
    expect(tests("muting")).toContain("tests/connections.test.ts");
  });

  it("/power shows every row, the configured controller, the status line and this server's version", () => {
    vi.stubEnv("OURS_VERSION", "v0-FICTIONAL-power");
    const text = textOf(renderToStaticMarkup(createElement(PowerPage)));
    for (const row of loadControl()) {
      expect(text, row.asset).toContain(row.asset);
      expect(text, row.asset).toContain(row.who);
    }
    expect(text).toContain(
      "Data controller stated in this server's configuration FICTIONAL Controller. Write to controller@example.test.",
    );
    expect(text).not.toContain("Not yet named.");
    expect(text).toContain(STATUS_LINE);
    expect(text).toContain("This page changes when control changes. Every change is a commit in the our.one records, published with each release.");
    expect(text).toContain("Running version: v0-FICTIONAL-power.");
  });

  it("/privacy and /power agree about the data controller, named or not", () => {
    const privacy = () => textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const power = () => textOf(renderToStaticMarkup(createElement(PowerPage)));

    expect(privacy()).toContain(
      "The data controller — the person or body answerable for your data — is FICTIONAL Controller , as stated in this server's configuration.",
    );
    expect(power()).toContain("Data controller stated in this server's configuration FICTIONAL Controller.");

    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    expect(privacy()).toContain("The data controller is not yet named");
    expect(privacy()).not.toContain("FICTIONAL Controller");
    expect(power()).toContain("Data controller not yet recorded Not yet named.");
    expect(power()).not.toContain("FICTIONAL Controller");
  });

  it("/privacy names no supervisory authority, lists who else sees data, and takes the email provider from the configuration", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    const text = textOf(html);
    expect(text).toContain("You can complain to the data protection authority where you live.");
    const start = html.indexOf('id="privacy-others"');
    const others = textOf(html.slice(start, html.indexOf("</section>", start)));
    for (const who of ["People on our.one", "The administrator", "Whoever holds an invite link", "Email provider", "Hosting"]) {
      expect(others).toContain(who);
    }
    expect(others).toContain("whoever it was shared with");
    expect(others).toContain("Sees the name and handle of the person who made it");
    // The test configuration writes mail to the outbox.
    expect(others).toContain("Email provider None. This server sends no email");
    expect(others).not.toContain("Resend");
    // MAIL_TRANSPORT=resend alone sends nothing (sendMail refuses), so
    // Resend is not named (final verification, honesty-6).
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    const refused = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(refused).toContain("Email provider None. No email is sent: this server's email setup is incomplete.");
    expect(refused).not.toContain("Resend");
    expect(refused).not.toContain("each message is written to a test outbox");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_FICTIONAL");
    vi.stubEnv("MAIL_FROM", "ours@example.test");
    const resend = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(resend).toContain("Resend delivers the emails our.one sends");
    expect(resend).not.toContain("This server sends no email");
  });

  it("/rules and /privacy say download and deletion work while the account is active, and a suspended person writes to the controller (final verification, honesty-2)", () => {
    const rule = FLOOR_RULES.flatMap((g) => g.rules).find((r) => r.id === "export-delete")!;
    expect(rule.text).toBe(
      "You can download your data, and delete your account, in Settings while your account is active. Deleting removes your posts, replies, likes, connections and sessions.",
    );
    expect(rule.more).toBe(
      "If your account is suspended, write to the data controller to get a copy or have it deleted; the address is on the privacy page once one is named.",
    );
    const rules = textOf(renderToStaticMarkup(createElement(RulesPage)));
    expect(rules).not.toContain("at any time");
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(privacy).toContain("See and take your data. While your account is active, download your profile, posts, replies and connections in");
    expect(privacy).toContain("Delete it. While your account is active, delete it in");
    expect(privacy).toContain(
      "If your account is suspended, you can't sign in to do either: write to the controller at controller@example.test to get a copy or have it deleted.",
    );
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    expect(textOf(renderToStaticMarkup(createElement(PrivacyPage)))).toContain(
      "write to the controller (not yet named) to get a copy or have it deleted.",
    );
  });

  it("the suspension notice says how to get a copy of your data or have it deleted, with or without a controller named", () => {
    const named = suspensionEmail("FICTIONAL statement of reasons.", "controller@example.test").body;
    expect(named).toContain(
      "While your account is suspended, you can't download your data or delete your account in Settings.\nTo get a copy or have it deleted, write to controller@example.test.",
    );
    const unnamed = suspensionEmail("FICTIONAL statement of reasons.", null).body;
    expect(unnamed).toContain(
      "To get a copy or have it deleted, write to the data controller; the address to write to is not named yet.",
    );
    expect(unnamed).not.toContain("@");
  });

  it("/rules names the administrator's exception to who sees a post, the username limit in tries, and cites the tests for both (final verification, honesty-9, -10, -11)", () => {
    const rules = FLOOR_RULES.flatMap((g) => g.rules);
    const audience = rules.find((r) => r.id === "audience")!;
    expect(audience.text).toContain("Nobody else sees either, except an administrator reading it because it was reported.");
    expect(audience.tests).toContain("tests/moderation.test.ts");
    const blocking = rules.find((r) => r.id === "blocking")!;
    expect(blocking.more).toContain("Trying a new username is limited to 5 tries a day, taken names included.");
    expect(blocking.tests).toContain("tests/accounts.test.ts");
    const accountsTests = readFileSync(join(WEB_ROOT, "tests/accounts.test.ts"), "utf8");
    expect(accountsTests).toMatch(/changeHandle\(.*\), "RATE_LIMITED"\)/);
    // The invite-only rule cites the test that runs the founder script twice (honesty-9).
    expect(rules.find((r) => r.id === "invite-only")!.tests).toContain("tests/accounts.test.ts");
    expect(accountsTests).toContain("scripts/seed-founder.ts");
    const text = textOf(renderToStaticMarkup(createElement(RulesPage)));
    expect(text).not.toContain("Nobody else sees either.");
    expect(text).not.toContain("Changing your username is limited to 5 times a day.");
  });

  it("no page says the records are public now: they are published with each release (final verification, honesty-8)", () => {
    const rows = Object.fromEntries(loadControl().map((r) => [r.asset, r]));
    expect(rows["The rules of our.one"]?.who).toBe(
      "The founder, under bootstrap authority. Decisions are published with each release in the our.one records.",
    );
    const rules = textOf(renderToStaticMarkup(createElement(RulesPage)));
    const power = textOf(renderToStaticMarkup(createElement(PowerPage)));
    const costs = textOf(renderToStaticMarkup(createElement(CostsPage)));
    expect(rules).toContain("Every decision is published with each release in the our.one records .");
    expect(power).toContain("The list is a file in the our.one records, published with each release: control.json .");
    expect(costs).toContain("The ledger is a file in the our.one records, published with each release: ledger.json .");
    const publicNow = /\b(?:are|is) public\b|\bpublic record\b|\bin the open code\b/i;
    for (const [page, text] of [["/rules", rules], ["/power", power], ["/costs", costs]] as const) {
      expect(text, page).not.toMatch(publicNow);
    }
    for (const row of loadControl()) expect(row.who, row.asset).not.toMatch(publicNow);
  });

  it("every public page and the not-found page render per request, so the version is this server's", () => {
    expect(PublicLayout.dynamic).toBe("force-dynamic");
    expect(RootNotFound.dynamic).toBe("force-dynamic");
  });

  it("the not-found page and the in-app footer show the version and the five links", () => {
    vi.stubEnv("OURS_VERSION", "v0-FICTIONAL-footer");
    for (const html of [
      renderToStaticMarkup(createElement(RootNotFound.default)),
      renderToStaticMarkup(createElement(InAppSiteFooter)),
    ]) {
      const text = textOf(html);
      expect(text).toContain("Version: v0-FICTIONAL-footer");
      for (const link of ["Open code", "Costs", "Who controls what", "Rules", "Privacy"]) {
        expect(text).toContain(link);
      }
      for (const href of ['href="/costs"', 'href="/power"', 'href="/rules"', 'href="/privacy"']) {
        expect(html).toContain(href);
      }
    }
  });

  it("on phones, the bottom of /settings and the in-app not-found page carry the footer", () => {
    for (const file of ["src/app/(app)/settings/page.tsx", "src/app/(app)/not-found.tsx"]) {
      const source = readFileSync(join(WEB_ROOT, file), "utf8");
      expect(source, file).toMatch(/import \{ InAppSiteFooter \} from "@\/components\/public\/InAppSiteFooter";/);
      expect(source, file).toMatch(/<InAppSiteFooter \/>\s*<\/>\s*\);\s*\}\s*$/);
    }
    // It hides only where the right column shows the same footer.
    const css = readFileSync(join(WEB_ROOT, "src/components/public/public.module.css"), "utf8");
    expect(css).toMatch(/@media \(min-width: 1000px\) \{\s*\.inAppFooter \{\s*display: none;/);
  });
});

describe("email sending: /privacy, /power and sendMail say the same thing (final verification, honesty-6/7)", () => {
  beforeEach(reset);
  afterEach(() => {
    vi.unstubAllEnvs();
    resendSend.mockClear();
  });

  const SETUPS: Record<EmailSending, Record<string, string>> = {
    outbox: {},
    refused: { MAIL_TRANSPORT: "resend" },
    resend: {
      NODE_ENV: "production",
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_FICTIONAL",
      MAIL_FROM: "ours@example.test",
    },
  };

  /** The /power hosting row as rendered text: asset, badge, who. */
  function hostingRow(): string {
    const html = renderToStaticMarkup(createElement(PowerPage));
    const start = html.indexOf(HOSTING_ASSET);
    return textOf(html.slice(start, html.indexOf("</li>", start)));
  }

  it("the three states follow the configuration, by the test sendMail makes", () => {
    const cases: [Record<string, string>, EmailSending][] = [
      [{}, "outbox"],
      [{ MAIL_TRANSPORT: "Resend" }, "outbox"], // anything but exactly "resend" is the outbox
      [{ MAIL_TRANSPORT: "resend" }, "refused"],
      [{ MAIL_TRANSPORT: "resend", NODE_ENV: "production" }, "refused"],
      [{ MAIL_TRANSPORT: "resend", NODE_ENV: "production", RESEND_API_KEY: "re_FICTIONAL" }, "refused"],
      [{ MAIL_TRANSPORT: "resend", NODE_ENV: "production", MAIL_FROM: "ours@example.test" }, "refused"],
      [{ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_FICTIONAL", MAIL_FROM: "ours@example.test" }, "refused"],
      [SETUPS.resend, "resend"],
      [{ ...SETUPS.resend, MAIL_TRANSPORT: "outbox" }, "outbox"],
    ];
    for (const [env, expected] of cases) {
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      expect(emailSending(), JSON.stringify(env)).toBe(expected);
    }
  });

  for (const sending of ["outbox", "refused", "resend"] as const) {
    it(`${sending}: sendMail does what both pages say`, async () => {
      for (const [key, value] of Object.entries(SETUPS[sending])) vi.stubEnv(key, value);
      const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(emailSending()).toBe(sending);
      const result = await sendMail(db(), {
        to: "anna_f@example.test",
        subject: "FICTIONAL",
        body: "FICTIONAL",
        kind: "sign_in",
      });
      const kept = await db().select().from(outbox);
      const [log] = await db().select().from(mailLog);
      quiet.mockRestore();
      if (sending === "outbox") {
        expect(result).toEqual({ ok: true });
        expect(kept).toHaveLength(1);
        expect(resendSend).not.toHaveBeenCalled();
      } else if (sending === "refused") {
        expect(result).toEqual({ ok: false, errorCode: "transport_refused" });
        expect(kept).toHaveLength(0);
        expect(log?.status).toBe("failed");
        expect(resendSend).not.toHaveBeenCalled();
      } else {
        expect(result).toEqual({ ok: true });
        expect(kept).toHaveLength(0);
        expect(resendSend).toHaveBeenCalledTimes(1);
      }

      const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
      expect(privacy).toContain(`Email provider ${EMAIL_PROVIDER_WORDS[sending]}`);
      expect(privacy.includes("Resend"), "/privacy names Resend").toBe(sending === "resend");
      // Hosting stays what the records say, whatever sends the email.
      expect(privacy).toContain("Hosting none yet — our.one is not deployed.");

      const row = hostingRow();
      expect(row.includes("Resend"), "/power names Resend").toBe(sending === "resend");
      expect(row).toBe(
        {
          outbox:
            "Hosting, database, email sending recorded None yet. our.one is not deployed. This server sends no email: each message is written to a test outbox instead. Record: Build record M-0010: nothing deployed",
          refused:
            "Hosting, database, email sending recorded None yet. our.one is not deployed. No email is sent: this server's email setup is incomplete. Record: Build record M-0010: nothing deployed",
          resend:
            "Hosting, database, email sending stated in this server's configuration Email: Resend delivers the emails this server sends. Hosting and database: none yet; our.one is not deployed. Record: Build record M-0010: nothing deployed",
        }[sending],
      );
    });
  }

  it("refuses a control file whose hosting row is missing, doubled, or says anything but that nothing is hosted", () => {
    const file = parseControl({
      rows: [
        { asset: HOSTING_ASSET, who: "None yet. our.one is not deployed.", status: "RECORDED", evidence: [{ path: "mandates/M-0010.md", label: "x" }] },
      ],
    });
    expect(withEmailSending(file, "outbox")[0]?.status).toBe("RECORDED");
    expect(withEmailSending(file, "resend")[0]).toMatchObject({ status: "STATED", statedBy: "configuration" });
    expect(() => withEmailSending([], "outbox")).toThrow(/no "Hosting, database, email sending" row/);
    expect(() => withEmailSending([...file, file[0]!], "outbox")).toThrow(/appears twice/);
    expect(() => withEmailSending([{ ...file[0]!, who: "FICTIONAL Host, Inc." }], "outbox")).toThrow(TransparencyError);
    expect(() => withEmailSending([{ ...file[0]!, status: "STATED" }], "outbox")).toThrow(TransparencyError);
  });
});

describe("the counts", () => {
  beforeEach(reset);

  it("counts accounts, friendships and posts in the last 7 days — numbers only", async () => {
    const now = at("2026-09-24T09:00:00Z");
    const a = await makeAccount();
    const b = await makeAccount();
    await makeAccount({ suspended: true });
    await befriend(a, b);
    await post(a, { at: plus.days(now, -1) });
    await post(b, { at: plus.days(now, -6) });
    await post(b, { at: plus.days(now, -8) });
    // One of the four accounts is suspended: the public count leaves it out (D-0012 §B).
    expect(await counts(db(), now)).toEqual({ accounts: 2, friendships: 1, postsLast7Days: 2 });
    const report = await health(() => db(), now);
    expect(report).toEqual({
      database: true,
      counts: { accounts: 2, friendships: 1, postsLast7Days: 2 },
    });
    expect(JSON.stringify(report)).not.toMatch(/example\.test|FICTIONAL/);
  });

  it("the /api/health route answers with the counts and a yes or no, and nothing else", async () => {
    await makeAccount({ displayName: "FICTIONAL Named Person" });
    db(); // points DATABASE_URL at this run's database
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      ok: true,
      database: true,
      counts: { accounts: 1, friendships: 0, postsLast7Days: 0 },
    });
    expect(text).not.toMatch(/FICTIONAL|example\.test|named_person/i);
  });

  it("the /api/health route says 503 and false, without the reason, when the database is not configured", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("DATABASE_URL", "");
    try {
      const { GET } = await import("@/app/api/health/route");
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, database: false, counts: null });
    } finally {
      vi.unstubAllEnvs();
      quiet.mockRestore();
    }
  });

  it("says only 'false' when the database cannot be reached, never the error's message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = await health(() => {
      throw new Error("connect ECONNREFUSED db.internal.example.test:5432 password=hunter2");
    });
    expect(report).toEqual({ database: false, counts: null });
    const logged = JSON.stringify(quiet.mock.calls);
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("db.internal");
    quiet.mockRestore();
  });
});
