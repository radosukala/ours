/**
 * The public ledger and the control map (SPEC §11), read from the
 * versioned files in apps/web/transparency/.
 *
 * The files are imported as data, so they travel with the build and no
 * path is resolved at run time. Nothing is validated at import (SPEC §2
 * rule 10): `loadLedger()` and `loadControl()` validate when called and
 * throw `TransparencyError` for anything they do not recognise.
 *
 * The ledger holds only recorded facts, stated commitments and labelled
 * estimates (D-0011 §C.2, M-0010). So the validator is strict:
 *
 * - an entry whose status is not RECORDED, PROPOSED, ESTIMATE or CREDIT is
 *   refused, never guessed at;
 * - a kind must match its status: a contribution counts as received and an
 *   expense as paid only when RECORDED; a pledge is a `commitment` until
 *   it is received; a figure is an `estimate` until it is invoiced;
 *   provider credits are `credit`s, never money.
 *
 * A refused entry refuses the whole ledger: a page that silently dropped
 * one entry would show sums that are not the ledger's.
 */
import controlFile from "../../transparency/control.json";
import ledgerFile from "../../transparency/ledger.json";

export class TransparencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransparencyError";
  }
}

/* ---------------------------------------------------------------- ledger */

export const LEDGER_STATUSES = [
  "RECORDED",
  "PROPOSED",
  "ESTIMATE",
  "CREDIT",
] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

export const LEDGER_KINDS = [
  "contribution",
  "expense",
  "commitment",
  "estimate",
  "credit",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Which statuses each kind may carry. Anything else is refused. */
const KIND_STATUSES: Record<LedgerKind, readonly LedgerStatus[]> = {
  // Received money. A pledge is a commitment until it arrives.
  contribution: ["RECORDED"],
  // A paid cost. A figure is an estimate until it is invoiced.
  expense: ["RECORDED"],
  // A stated commitment, proposed or recorded; never counted as received.
  commitment: ["PROPOSED", "RECORDED"],
  // A labelled estimate; never counted as paid.
  estimate: ["ESTIMATE"],
  // A provider credit: shown as a credit, never as money.
  credit: ["CREDIT"],
};

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  status: LedgerStatus;
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  /** In the ledger's currency, not negative. */
  amount: number;
  /** e.g. "per year", for recurring estimates. */
  period: string | null;
  /** Whether founder money is repayable, as stated. */
  repayable: string | null;
  /** A repository path to the evidence, or null when there is none yet. */
  evidence: string | null;
  note: string | null;
};

export type Ledger = {
  scope: string;
  currency: string;
  contributionsOpen: boolean;
  unpaidWork: string;
  entries: LedgerEntry[];
};

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(o: Obj, key: string, where: string): string {
  const value = o[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new TransparencyError(`${where}: "${key}" must be a non-empty string.`);
  }
  return value;
}

function optStr(o: Obj, key: string, where: string): string | null {
  const value = o[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new TransparencyError(`${where}: "${key}" must be a non-empty string or null.`);
  }
  return value;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_ID = /^L-\d{4}$/;

function isLedgerStatus(value: unknown): value is LedgerStatus {
  return (LEDGER_STATUSES as readonly unknown[]).includes(value);
}

function isLedgerKind(value: unknown): value is LedgerKind {
  return (LEDGER_KINDS as readonly unknown[]).includes(value);
}

function parseEntry(raw: unknown, index: number): LedgerEntry {
  const where = `ledger entry ${index + 1}`;
  if (!isObj(raw)) throw new TransparencyError(`${where}: not an object.`);
  const id = str(raw, "id", where);
  if (!ENTRY_ID.test(id)) {
    throw new TransparencyError(`${where}: id "${id}" is not of the form L-0000.`);
  }
  const at = `ledger entry ${id}`;
  if (!isLedgerStatus(raw.status)) {
    throw new TransparencyError(
      `${at}: status ${JSON.stringify(raw.status)} is not one of ${LEDGER_STATUSES.join(", ")}. It is not shown.`,
    );
  }
  if (!isLedgerKind(raw.kind)) {
    throw new TransparencyError(
      `${at}: kind ${JSON.stringify(raw.kind)} is not one of ${LEDGER_KINDS.join(", ")}.`,
    );
  }
  if (!KIND_STATUSES[raw.kind].includes(raw.status)) {
    throw new TransparencyError(
      `${at}: a ${raw.kind} cannot have status ${raw.status} (allowed: ${KIND_STATUSES[raw.kind].join(", ")}).`,
    );
  }
  const date = str(raw, "date", at);
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new TransparencyError(`${at}: date "${date}" is not YYYY-MM-DD.`);
  }
  const amount = raw.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new TransparencyError(`${at}: amount must be a number, not negative.`);
  }
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    throw new TransparencyError(`${at}: amount has more than two decimal places.`);
  }
  return {
    id,
    kind: raw.kind,
    status: raw.status,
    date,
    description: str(raw, "description", at),
    amount,
    period: optStr(raw, "period", at),
    repayable: optStr(raw, "repayable", at),
    evidence: optStr(raw, "evidence", at),
    note: optStr(raw, "note", at),
  };
}

/** Validate a ledger document. Throws TransparencyError on anything unknown. */
export function parseLedger(raw: unknown): Ledger {
  if (!isObj(raw)) throw new TransparencyError("ledger: not an object.");
  const currency = str(raw, "currency", "ledger");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TransparencyError(`ledger: currency "${currency}" is not a three-letter code.`);
  }
  if (typeof raw.contributions_open !== "boolean") {
    throw new TransparencyError('ledger: "contributions_open" must be true or false.');
  }
  if (!Array.isArray(raw.entries)) {
    throw new TransparencyError('ledger: "entries" must be a list.');
  }
  const entries = raw.entries.map(parseEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new TransparencyError(`ledger: entry ${entry.id} appears twice.`);
    }
    seen.add(entry.id);
  }
  return {
    scope: str(raw, "scope", "ledger"),
    currency,
    contributionsOpen: raw.contributions_open,
    unpaidWork: str(raw, "unpaid_work", "ledger"),
    entries,
  };
}

/** The ledger in apps/web/transparency/ledger.json, validated. */
export function loadLedger(): Ledger {
  return parseLedger(ledgerFile);
}

export type LedgerSummary = {
  currency: string;
  /** kind contribution, status RECORDED. */
  received: { entries: LedgerEntry[]; total: number };
  /** kind expense, status RECORDED. */
  paid: { entries: LedgerEntry[]; total: number };
  /** received − paid, or null when nothing has been received. */
  remaining: number | null;
  /** Commitments and estimates, each shown with its status in words. */
  coming: LedgerEntry[];
  /** Provider credits: not money, shown apart. */
  credits: LedgerEntry[];
  scope: string;
  unpaidWork: string;
  contributionsOpen: boolean;
};

/** Sum in cents, so 0.1 + 0.2 is 0.3. */
function total(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
}

/**
 * The four sections of /costs (SPEC §11):
 *
 * - received: contributions that are RECORDED — nothing else;
 * - paid: expenses that are RECORDED — nothing else;
 * - remaining: received minus paid, or null (nothing received yet);
 * - coming: commitments and estimates, whatever their status.
 *
 * A PROPOSED commitment is never received; an ESTIMATE is never paid.
 */
export function ledgerSummary(ledger: Ledger = loadLedger()): LedgerSummary {
  const received = ledger.entries.filter(
    (e) => e.kind === "contribution" && e.status === "RECORDED",
  );
  const paid = ledger.entries.filter(
    (e) => e.kind === "expense" && e.status === "RECORDED",
  );
  const coming = ledger.entries.filter(
    (e) => e.kind === "commitment" || e.kind === "estimate",
  );
  const credits = ledger.entries.filter((e) => e.kind === "credit");
  const receivedTotal = total(received);
  const paidTotal = total(paid);
  return {
    currency: ledger.currency,
    received: { entries: received, total: receivedTotal },
    paid: { entries: paid, total: paidTotal },
    remaining:
      received.length === 0
        ? null
        : (Math.round(receivedTotal * 100) - Math.round(paidTotal * 100)) / 100,
    coming,
    credits,
    scope: ledger.scope,
    unpaidWork: ledger.unpaidWork,
    contributionsOpen: ledger.contributionsOpen,
  };
}

/** A ledger status in words, for the page. */
export function ledgerStatusWords(entry: Pick<LedgerEntry, "kind" | "status">): string {
  switch (entry.status) {
    case "RECORDED":
      return entry.kind === "commitment" ? "recorded commitment, not yet received" : "recorded";
    case "PROPOSED":
      return "proposed, not yet confirmed";
    case "ESTIMATE":
      return "estimate, not yet invoiced";
    case "CREDIT":
      return "credit from a provider, not money";
  }
}

/* --------------------------------------------------------------- control */

export const CONTROL_STATUSES = ["RECORDED", "STATED", "NOT_YET_RECORDED"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];

export type Evidence = { path: string; label: string };

export type ControlRow = {
  asset: string;
  who: string;
  status: ControlStatus;
  /** Repository paths (from the repository root), or null when there is none. */
  evidence: Evidence[] | null;
};

/** A repository-relative path: no scheme, no leading slash, no "..". */
const REPO_PATH = /^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_.\-/]+$/;

function parseEvidence(raw: unknown, at: string): Evidence[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TransparencyError(`${at}: evidence must be null or a non-empty list.`);
  }
  return raw.map((item, i) => {
    const where = `${at}, evidence ${i + 1}`;
    if (!isObj(item)) throw new TransparencyError(`${where}: not an object.`);
    const path = str(item, "path", where);
    if (!REPO_PATH.test(path)) {
      throw new TransparencyError(`${where}: "${path}" is not a repository path.`);
    }
    return { path, label: str(item, "label", where) };
  });
}

/** Validate a control document. Throws TransparencyError on anything unknown. */
export function parseControl(raw: unknown): ControlRow[] {
  if (!isObj(raw) || !Array.isArray(raw.rows)) {
    throw new TransparencyError('control: expected an object with a "rows" list.');
  }
  return raw.rows.map((row: unknown, index: number) => {
    const where = `control row ${index + 1}`;
    if (!isObj(row)) throw new TransparencyError(`${where}: not an object.`);
    const asset = str(row, "asset", where);
    const at = `control row "${asset}"`;
    const status = row.status;
    if (!(CONTROL_STATUSES as readonly unknown[]).includes(status)) {
      throw new TransparencyError(
        `${at}: status ${JSON.stringify(status)} is not one of ${CONTROL_STATUSES.join(", ")}.`,
      );
    }
    const evidence = parseEvidence(row.evidence, at);
    if (status === "RECORDED" && !evidence) {
      throw new TransparencyError(`${at}: a RECORDED row must name its evidence.`);
    }
    if (status === "NOT_YET_RECORDED" && evidence) {
      throw new TransparencyError(`${at}: a NOT_YET_RECORDED row cannot carry evidence.`);
    }
    return {
      asset,
      who: str(row, "who", at),
      status: status as ControlStatus,
      evidence,
    };
  });
}

/** The rows in apps/web/transparency/control.json, validated. */
export function loadControl(): ControlRow[] {
  return parseControl(controlFile);
}

/** A control status in words, for the page. */
export function controlStatusWords(status: ControlStatus): string {
  switch (status) {
    case "RECORDED":
      return "recorded";
    case "STATED":
      return "stated by the founder, not verified";
    case "NOT_YET_RECORDED":
      return "not yet recorded";
  }
}
