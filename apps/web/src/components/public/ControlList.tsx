/**
 * Who controls what (/power), from transparency/control.json: each row in
 * plain words, with its status as a badge and its evidence as links into
 * the public repository. A row with no recorded fact says "not yet
 * recorded" (D-0011 §C.3). The data-controller row comes from this server's
 * configuration when it names one, and its badge says so (SPEC §17 item 18).
 */
import { type ControlRow, type ControlStatus, controlStatusWords } from "@/core/transparency";
import styles from "./public.module.css";
import { repositoryUrl } from "./repository";

const BADGE: Record<ControlStatus, string> = {
  RECORDED: styles.badgeRecorded ?? "",
  STATED: styles.badgeStated ?? "",
  NOT_YET_RECORDED: styles.badgeNotYet ?? "",
};

export function ControlStatusBadge({
  status,
  statedBy,
}: {
  status: ControlStatus;
  statedBy?: ControlRow["statedBy"];
}) {
  return (
    <span className={`${styles.badge} ${BADGE[status]}`} data-status={status}>
      {controlStatusWords(status, statedBy)}
    </span>
  );
}

export function ControlList({ rows }: { rows: ControlRow[] }) {
  return (
    <ul className={styles.items}>
      {rows.map((row) => (
        <li key={row.asset} className={styles.item}>
          <div className={styles.itemHead}>
            <h2 className={styles.itemTitle}>{row.asset}</h2>
            <ControlStatusBadge status={row.status} statedBy={row.statedBy} />
          </div>
          <p>{row.who}</p>
          {row.evidence ? (
            <p className={styles.meta}>
              {row.evidence.length === 1 ? "Record: " : "Records: "}
              {row.evidence.map((e, i) => (
                <span key={`${e.path}-${i}`}>
                  {i > 0 ? " · " : null}
                  <a href={repositoryUrl(e.path)} rel="noopener noreferrer" target="_blank">
                    {e.label}
                  </a>
                </span>
              ))}
            </p>
          ) : (
            <p className={styles.meta}>No record yet.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
