/**
 * The public ledger, the control map, the rules page's claims about its
 * own tests, and the counts (SPEC §10, §11; D-0011 §C; M-0010: "a
 * [CONFIRM] fact is rendered as not yet recorded, never resolved").
 *
 * Denial paths first: a proposal is never received, an estimate is never
 * paid, and an entry whose status is unknown is refused, not guessed at.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ControlList } from "@/components/public/ControlList";
import { FLOOR_RULES, NO_ALGORITHM_SENTENCE } from "@/components/public/floorRules";
import { LedgerView } from "@/components/public/LedgerView";
import { DEFAULT_INVITES } from "@/core/config";
import { counts, health } from "@/core/health";
import {
  controlStatusWords,
  ledgerStatusWords,
  ledgerSummary,
  loadControl,
  loadLedger,
  parseControl,
  parseLedger,
  TransparencyError,
} from "@/core/transparency";
import { at, befriend, db, makeAccount, plus, post, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");

type RawEntry = Record<string, unknown>;

function entry(fields: RawEntry): RawEntry {
  return {
    id: "L-0100",
    kind: "expense",
    status: "RECORDED",
    date: "2026-09-24",
    description: "FICTIONAL entry",
    amount: 10,
    evidence: null,
    note: null,
    ...fields,
  };
}

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
  it("renders NOT_YET_RECORDED as 'not yet recorded'", () => {
    expect(controlStatusWords("NOT_YET_RECORDED")).toBe("not yet recorded");
    const rows = loadControl();
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
    // The operator row says in its own words that its facts are not yet recorded.
    expect(html).toContain("responsibility for OURS are not yet recorded");
    expect(html).toContain("stated by the founder, not verified");
  });

  it("holds the rows of SPEC §11, in order, with their statuses", () => {
    const rows = loadControl();
    expect(rows.map((r) => [r.asset, r.status])).toEqual([
      ["The rules of OURS", "RECORDED"],
      ["The domain our.one", "RECORDED"],
      ["The operator", "STATED"],
      ["The code", "RECORDED"],
      ["Hosting, database, email sending", "RECORDED"],
      ["Releases", "RECORDED"],
      ["Moderation", "RECORDED"],
      ["Money", "RECORDED"],
      ["Data controller", "NOT_YET_RECORDED"],
      ["If the founder stops", "NOT_YET_RECORDED"],
    ]);
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

  it("the test files of this module and the foundation that /rules names exist", () => {
    const here = [
      "tests/digest.test.ts",
      "tests/claims.test.ts",
      "tests/visibility.test.ts",
    ];
    const named = new Set(FLOOR_RULES.flatMap((g) => g.rules.flatMap((r) => r.tests ?? [])));
    for (const file of here) {
      expect(named.has(file), file).toBe(true);
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
    expect(await counts(db(), now)).toEqual({ accounts: 3, friendships: 1, postsLast7Days: 2 });
    const report = await health(() => db(), now);
    expect(report).toEqual({
      database: true,
      counts: { accounts: 3, friendships: 1, postsLast7Days: 2 },
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
