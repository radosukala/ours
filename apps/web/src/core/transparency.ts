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
 *   provider credits are `credit`s, never money;
 * - a RECORDED contribution or expense names its evidence (SPEC §17 item
 *   16; D-0011 §C.2: "costs paid, with redacted evidence"): money counted
 *   as received or paid on nobody's record is refused;
 * - the evidence of a RECORDED entry is a file under receipts/, with a file
 *   extension (the final verification's honesty-5): "none", "TBD", "." or
 *   a bare folder names no record, and is refused.
 *
 * A refused entry refuses the whole ledger: a page that silently dropped
 * one entry would show sums that are not the ledger's.
 *
 * Two rows of the control map are filled in from this server's
 * configuration, so /privacy and /power never disagree: the data
 * controller (SPEC §17 item 18) and the email-sending part of "Hosting,
 * database, email sending" (the final verification's honesty-6/7), which
 * comes from `emailSending`, the same test `sendMail` makes. See
 * `loadControl`.
 */
import {
  controller as configuredController,
  isProduction,
  mailTransport,
  resendSettings,
} from "./config";
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
  /**
   * A repository path to the evidence, or null when there is none yet.
   * Never null for a RECORDED contribution or expense.
   */
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

/** A repository-relative path: no scheme, no leading slash, no "..". */
const REPO_PATH = /^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_.\-/]+$/;

/**
 * The evidence of a RECORDED ledger entry: a file under receipts/, each
 * folder and the file named, and the file with an extension
 * (receipts/2026/L-0003-invoice.pdf). Not "none", "TBD", "n/a", ".", "-" or
 * "receipts/", which name no record. tests/transparency.test.ts checks that
 * every evidence path in ledger.json is a file in the repository.
 */
const RECEIPT_PATH = /^receipts\/(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.[A-Za-z0-9]+$/;

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
  const evidence = optStr(raw, "evidence", at);
  if (evidence !== null && !REPO_PATH.test(evidence)) {
    throw new TransparencyError(`${at}: evidence "${evidence}" is not a repository path.`);
  }
  if (
    raw.status === "RECORDED" &&
    (raw.kind === "contribution" || raw.kind === "expense") &&
    evidence === null
  ) {
    throw new TransparencyError(
      `${at}: a RECORDED ${raw.kind} must name its evidence. It is not counted as ${raw.kind === "contribution" ? "received" : "paid"} without it.`,
    );
  }
  if (raw.status === "RECORDED" && evidence !== null && !RECEIPT_PATH.test(evidence)) {
    throw new TransparencyError(
      `${at}: evidence "${evidence}" names no record. A RECORDED entry's evidence is a file under receipts/, with its extension (receipts/…/invoice.pdf).`,
    );
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
    evidence,
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
  /**
   * Where a STATED row's statement comes from: the founder (in the file),
   * or this server's configuration (the data controller, SPEC §17 item 18;
   * email sent through Resend, see `withEmailSending`).
   */
  statedBy?: "founder" | "configuration";
};

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

/** The asset name of the row this server fills in from its configuration. */
export const DATA_CONTROLLER_ASSET = "Data controller";

/**
 * The data-controller row as this server shows it (SPEC §17 item 18):
 *
 * - with `DATA_CONTROLLER` and `DATA_CONTROLLER_EMAIL` set, the configured
 *   controller, STATED, as "stated in this server's configuration" — the
 *   same name /privacy shows, and the same setting that opens joining;
 * - otherwise the file's row, which says not yet recorded.
 *
 * No record in the repository names a controller, so the configured row
 * carries no evidence. The file must have the row: a /power with nothing to
 * say about the controller would be a silent gap.
 */
export function withConfiguredController(
  rows: ControlRow[],
  configured: { name: string; email: string } | null,
): ControlRow[] {
  const at = rows.findIndex((r) => r.asset === DATA_CONTROLLER_ASSET);
  if (at === -1) {
    throw new TransparencyError(`control: there is no "${DATA_CONTROLLER_ASSET}" row.`);
  }
  if (rows.findIndex((r, i) => i > at && r.asset === DATA_CONTROLLER_ASSET) !== -1) {
    throw new TransparencyError(`control: "${DATA_CONTROLLER_ASSET}" appears twice.`);
  }
  const fileRow = rows[at]!;
  if (fileRow.status !== "NOT_YET_RECORDED") {
    throw new TransparencyError(
      `control row "${DATA_CONTROLLER_ASSET}": the file says only that it is not yet recorded; a controller comes from this server's configuration.`,
    );
  }
  if (!configured) return rows;
  const shown: ControlRow = {
    asset: DATA_CONTROLLER_ASSET,
    who: `${configured.name}. Write to ${configured.email}.`,
    status: "STATED",
    evidence: null,
    statedBy: "configuration",
  };
  return rows.map((r, i) => (i === at ? shown : r));
}

/* ---------------------------------------------------------- email sending */

/**
 * What this server does with an email, by the same test `sendMail`
 * (core/mail.ts) makes:
 *
 * - "outbox": MAIL_TRANSPORT is not "resend"; each message is written to
 *   the test outbox and sent to nobody;
 * - "resend": MAIL_TRANSPORT is "resend", NODE_ENV is production, and
 *   RESEND_API_KEY and MAIL_FROM are both set; messages go to Resend;
 * - "refused": MAIL_TRANSPORT is "resend" but the rest is missing; the
 *   transport refuses, and nothing is sent or written to the outbox.
 *
 * /privacy and /power both read it, so they never disagree, and neither
 * names Resend as a recipient of data it is never sent.
 * tests/transparency.test.ts checks it against what `sendMail` does.
 */
export type EmailSending = "outbox" | "resend" | "refused";

export function emailSending(): EmailSending {
  if (mailTransport() !== "resend") return "outbox";
  return isProduction() && resendSettings() ? "resend" : "refused";
}

/** /privacy's "Email provider" line, for each `EmailSending`. */
export const EMAIL_PROVIDER_WORDS: Readonly<Record<EmailSending, string>> = {
  outbox: "None. This server sends no email: each message is written to a test outbox instead.",
  resend:
    "Resend delivers the emails OURS sends: sign-in and join links, the weekly email and notices. It receives your email address and each email's subject and text.",
  refused: "None. No email is sent: this server's email setup is incomplete.",
};

/** The asset name of the row whose email-sending part this server fills in. */
export const HOSTING_ASSET = "Hosting, database, email sending";

/** What the file says of hosting, which only a record changes. */
const HOSTING_NONE = "None yet. OURS is not deployed.";

/**
 * The hosting row as this server shows it: the file's record that nothing
 * is hosted, with the email-sending part from `emailSending`.
 *
 * - "outbox" and "refused": still RECORDED, with what happens to email;
 * - "resend": STATED, as "stated in this server's configuration", like a
 *   configured data controller: no record names Resend, only this server's
 *   settings do. The hosting part and its record stay as the file has them.
 *
 * The file's row must say exactly that nothing is hosted, RECORDED: the
 * words here are written for that row and no other.
 */
export function withEmailSending(rows: ControlRow[], sending: EmailSending): ControlRow[] {
  const at = rows.findIndex((r) => r.asset === HOSTING_ASSET);
  if (at === -1) {
    throw new TransparencyError(`control: there is no "${HOSTING_ASSET}" row.`);
  }
  if (rows.findIndex((r, i) => i > at && r.asset === HOSTING_ASSET) !== -1) {
    throw new TransparencyError(`control: "${HOSTING_ASSET}" appears twice.`);
  }
  const fileRow = rows[at]!;
  if (fileRow.status !== "RECORDED" || fileRow.who !== HOSTING_NONE) {
    throw new TransparencyError(
      `control row "${HOSTING_ASSET}": the file must say "${HOSTING_NONE}" (RECORDED); email sending comes from this server's configuration.`,
    );
  }
  const shown: ControlRow =
    sending === "resend"
      ? {
          ...fileRow,
          who: "Email: Resend delivers the emails this server sends. Hosting and database: none yet; OURS is not deployed.",
          status: "STATED",
          statedBy: "configuration",
        }
      : {
          ...fileRow,
          who:
            sending === "outbox"
              ? `${HOSTING_NONE} This server sends no email: each message is written to a test outbox instead.`
              : `${HOSTING_NONE} No email is sent: this server's email setup is incomplete.`,
        };
  return rows.map((r, i) => (i === at ? shown : r));
}

/**
 * The rows /power shows: apps/web/transparency/control.json, validated,
 * with the data-controller row from this server's configuration (see
 * `withConfiguredController`) and the email-sending part of the hosting
 * row (see `withEmailSending`). Pass `configured` or `sending` to show
 * another configuration; by default each is read now, not at import.
 */
export function loadControl(
  configured: { name: string; email: string } | null = configuredController(),
  sending: EmailSending = emailSending(),
): ControlRow[] {
  return withEmailSending(withConfiguredController(parseControl(controlFile), configured), sending);
}

/** A control status in words, for the page. */
export function controlStatusWords(
  status: ControlStatus,
  statedBy: ControlRow["statedBy"] = "founder",
): string {
  switch (status) {
    case "RECORDED":
      return "recorded";
    case "STATED":
      return statedBy === "configuration"
        ? "stated in this server's configuration"
        : "stated by the founder, not verified";
    case "NOT_YET_RECORDED":
      return "not yet recorded";
  }
}
