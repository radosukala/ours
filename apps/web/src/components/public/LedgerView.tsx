/**
 * What OURS costs (/costs), from transparency/ledger.json through
 * `ledgerSummary` (SPEC §11). Four sections — received, paid, remaining,
 * coming — each entry with its status in words. A proposal is shown as a
 * proposal and an estimate as an estimate; neither is ever added to what
 * was received or paid.
 */
import {
  type LedgerEntry,
  type LedgerStatus,
  type LedgerSummary,
  ledgerStatusWords,
} from "@/core/transparency";
import styles from "./public.module.css";
import { repositoryUrl } from "./repository";

const BADGE: Record<LedgerStatus, string> = {
  RECORDED: styles.badgeRecorded ?? "",
  PROPOSED: styles.badgeProposed ?? "",
  ESTIMATE: styles.badgeEstimate ?? "",
  CREDIT: styles.badgeCredit ?? "",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-09-24" → "24 Sep 2026", without time zones getting involved. */
export function ledgerDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}

export function money(amount: number, currency: string): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function Entry({ entry, currency }: { entry: LedgerEntry; currency: string }) {
  return (
    <li className={styles.item} data-entry={entry.id}>
      <div className={styles.itemHead}>
        <h3 className={styles.itemTitle}>{entry.description}</h3>
        <span className={styles.amount}>
          {money(entry.amount, currency)}
          {entry.period ? ` ${entry.period}` : null}
        </span>
      </div>
      <p>
        <span
          className={`${styles.badge} ${BADGE[entry.status]}`}
          data-status={entry.status}
        >
          {ledgerStatusWords(entry)}
        </span>
      </p>
      <dl className={styles.facts}>
        <dt>Date</dt>
        <dd>{ledgerDate(entry.date)}</dd>
        {entry.repayable ? (
          <>
            <dt>Repayable</dt>
            <dd>{entry.repayable}</dd>
          </>
        ) : null}
        <dt>Evidence</dt>
        <dd>
          {entry.evidence ? (
            <a href={repositoryUrl(entry.evidence)} rel="noopener noreferrer" target="_blank">
              {entry.evidence}
            </a>
          ) : (
            "none recorded yet"
          )}
        </dd>
        {entry.note ? (
          <>
            <dt>Note</dt>
            <dd>{entry.note}</dd>
          </>
        ) : null}
        <dt>Entry</dt>
        <dd className={styles.meta}>{entry.id}</dd>
      </dl>
    </li>
  );
}

function Entries({
  entries,
  currency,
  empty,
}: {
  entries: LedgerEntry[];
  currency: string;
  empty: string;
}) {
  if (entries.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className={styles.items}>
      {entries.map((entry) => (
        <Entry key={entry.id} entry={entry} currency={currency} />
      ))}
    </ul>
  );
}

export function LedgerView({ summary }: { summary: LedgerSummary }) {
  const { currency } = summary;
  return (
    <>
      <section aria-labelledby="costs-received" data-section="received">
        <h2 id="costs-received">Received</h2>
        {summary.received.entries.length > 0 ? (
          <p className={styles.big}>{money(summary.received.total, currency)}</p>
        ) : null}
        <Entries
          entries={summary.received.entries}
          currency={currency}
          empty="Nothing received yet."
        />
      </section>

      <section aria-labelledby="costs-paid" data-section="paid">
        <h2 id="costs-paid">Paid</h2>
        {summary.paid.entries.length > 0 ? (
          <p className={styles.big}>{money(summary.paid.total, currency)}</p>
        ) : null}
        <Entries
          entries={summary.paid.entries}
          currency={currency}
          empty="No costs recorded as paid yet."
        />
      </section>

      <section aria-labelledby="costs-remaining" data-section="remaining">
        <h2 id="costs-remaining">Remaining</h2>
        {summary.remaining === null ? (
          <p className="muted">Nothing received yet.</p>
        ) : (
          <>
            <p className={styles.big}>{money(summary.remaining, currency)}</p>
            <p className="muted">What was received, minus what was paid.</p>
          </>
        )}
      </section>

      <section aria-labelledby="costs-coming" data-section="coming">
        <h2 id="costs-coming">Coming</h2>
        <p className="muted">
          Commitments and estimates. None of these is counted above until it
          is recorded as received or paid.
        </p>
        <Entries
          entries={summary.coming}
          currency={currency}
          empty="Nothing coming is recorded yet."
        />
      </section>

      {summary.credits.length > 0 ? (
        <section aria-labelledby="costs-credits" data-section="credits">
          <h2 id="costs-credits">Credits</h2>
          <p className="muted">
            Credits from providers. They are not money and are not counted
            above.
          </p>
          <Entries entries={summary.credits} currency={currency} empty="" />
        </section>
      ) : null}
    </>
  );
}
