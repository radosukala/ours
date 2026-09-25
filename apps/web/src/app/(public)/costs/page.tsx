/**
 * /costs (SPEC §11, D-0011 §C.2): the public ledger, from
 * transparency/ledger.json. Only recorded facts, stated commitments and
 * labelled estimates. If the ledger holds anything the validator does not
 * recognise, no figures are shown at all.
 */
import type { Metadata } from "next";
import { LedgerView } from "@/components/public/LedgerView";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { STATUS_LINE } from "@/components/RightColumn";
import { type LedgerSummary, ledgerSummary, TransparencyError } from "@/core/transparency";

export const metadata: Metadata = {
  title: "Costs",
  description: "What OURS has received, paid and expects to pay, in public.",
};

const LEDGER_PATH = "apps/web/transparency/ledger.json";

function summaryOrProblem(): { summary: LedgerSummary } | { problem: string } {
  try {
    return { summary: ledgerSummary() };
  } catch (error) {
    if (error instanceof TransparencyError) return { problem: error.message };
    throw error;
  }
}

export default function CostsPage() {
  const result = summaryOrProblem();

  return (
    <article className={styles.page}>
      <h1 className="headline">Costs</h1>
      <p className="lede">
        What OURS has received, what it has paid, and what&apos;s coming. A
        promise is shown as a promise until the money arrives, and a figure
        as an estimate until there&apos;s an invoice.
      </p>

      {"problem" in result ? (
        <p className="notice notice--error" role="alert">
          The ledger can&apos;t be shown right now, so no figures are shown:{" "}
          {result.problem}
        </p>
      ) : (
        <>
          <p>{result.summary.scope}</p>
          <LedgerView summary={result.summary} />
          <section aria-labelledby="costs-work">
            <h2 id="costs-work">Unpaid work</h2>
            <p>{result.summary.unpaidWork}</p>
          </section>
          <section aria-labelledby="costs-contributions">
            <h2 id="costs-contributions">Contributions</h2>
            {result.summary.contributionsOpen ? (
              <>
                <p>Contributions: open.</p>
                <p>
                  {"They're asked for as 'Support OURS'. They won't be tax-deductible unless the recipient qualifies, and they don't buy reach or a say."}
                </p>
              </>
            ) : (
              <>
                <p>Contributions: not open yet.</p>
                <p>
                  {"When they open, they'll be asked for as 'Support OURS'. They won't be tax-deductible unless the recipient qualifies, and they don't buy reach or a say."}
                </p>
              </>
            )}
          </section>
        </>
      )}

      <p className={styles.meta}>
        The ledger is a file in the OURS records, published with each
        release:{" "}
        <a href={repositoryUrl(LEDGER_PATH)} rel="noopener noreferrer" target="_blank">
          ledger.json
        </a>
        . Every change to it is a commit in the OURS records, published with each release.
      </p>
      <p className="muted">{STATUS_LINE}</p>
    </article>
  );
}
