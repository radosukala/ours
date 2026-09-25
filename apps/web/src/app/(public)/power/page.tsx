/**
 * /power (SPEC §11, D-0011 §C.3): who controls what, from
 * transparency/control.json, in plain words, with the status line and the
 * running version. A row with no recorded fact says "not yet recorded".
 * Two rows come from this server's configuration (see `loadControl`): the
 * data controller, and what this server does with email, by the same test
 * sendMail makes, so /privacy and /power never disagree.
 */
import type { Metadata } from "next";
import { ControlList } from "@/components/public/ControlList";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { STATUS_LINE } from "@/components/RightColumn";
import { runningVersion } from "@/core/config";
import { type ControlRow, loadControl, TransparencyError } from "@/core/transparency";

export const metadata: Metadata = {
  title: "Who controls what",
  description: "Who controls each part of OURS today, and what is not yet recorded.",
};

const CONTROL_PATH = "apps/web/transparency/control.json";

function rowsOrProblem(): { rows: ControlRow[] } | { problem: string } {
  try {
    return { rows: loadControl() };
  } catch (error) {
    if (error instanceof TransparencyError) return { problem: error.message };
    throw error;
  }
}

export default function PowerPage() {
  const result = rowsOrProblem();

  return (
    <article className={styles.page}>
      <h1 className="headline">Who controls what</h1>
      <p className="lede">{STATUS_LINE}</p>
      <p>
        Each part of OURS, who controls it today, and whether that is
        recorded, only stated, or not yet recorded at all.
      </p>

      {"problem" in result ? (
        <p className="notice notice--error" role="alert">
          This list can&apos;t be shown right now: {result.problem}
        </p>
      ) : (
        <ControlList rows={result.rows} />
      )}

      <p>This page changes when control changes. Every change is a commit in the OURS records, published with each release.</p>
      <p className={styles.meta}>
        The list is a file in the OURS records, published with each
        release:{" "}
        <a href={repositoryUrl(CONTROL_PATH)} rel="noopener noreferrer" target="_blank">
          control.json
        </a>
        . Running version: {runningVersion()}.
      </p>
    </article>
  );
}
