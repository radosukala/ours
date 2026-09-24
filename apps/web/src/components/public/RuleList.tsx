/**
 * The floor rules on /rules, grouped, each with how it is held and, where
 * a test checks it, the test files by name (links into the open code).
 */
import styles from "./public.module.css";
import { repositoryUrl } from "./repository";

/**
 * How a rule is held (AGENTS.md §7):
 *
 * - ENFORCED: the code refuses, and the named test files check it;
 * - CHECKED: a check reports, and a person reads what it flags;
 * - INTERPRETED: a named person decides, with a way to ask again;
 * - DECLARED: written down, with nothing checking it yet.
 */
export type EnforcementClass = "ENFORCED" | "CHECKED" | "INTERPRETED" | "DECLARED";

export type FloorRule = {
  id: string;
  text: string;
  /** A sentence after the rule, e.g. who decides or what isn't checked. */
  more?: string;
  cls: EnforcementClass;
  /** For ENFORCED and CHECKED: the test files, relative to apps/web. */
  tests?: string[];
};

export type RuleGroup = { title: string; rules: FloorRule[] };

export const ENFORCEMENT_WORDS: Record<EnforcementClass, string> = {
  ENFORCED: "The code refuses anything else, and the named tests check that it does.",
  CHECKED: "A check reports problems. It can't be sure, so a person reads what it finds.",
  INTERPRETED: "A named person decides, and you can ask them to look again.",
  DECLARED: "Written down. Nothing checks it yet.",
};

const BADGE: Record<EnforcementClass, string> = {
  ENFORCED: styles.badgeRecorded ?? "",
  CHECKED: styles.badgeStated ?? "",
  INTERPRETED: styles.badgeStated ?? "",
  DECLARED: styles.badgeNotYet ?? "",
};

export function EnforcementBadge({ cls }: { cls: EnforcementClass }) {
  return (
    <span className={`${styles.badge} ${BADGE[cls]}`} data-class={cls}>
      {cls}
    </span>
  );
}

export function EnforcementLegend() {
  const classes = Object.keys(ENFORCEMENT_WORDS) as EnforcementClass[];
  return (
    <dl className={styles.legend}>
      {classes.map((cls) => (
        <div key={cls}>
          <dt>
            <EnforcementBadge cls={cls} />
          </dt>
          <dd>{ENFORCEMENT_WORDS[cls]}</dd>
        </div>
      ))}
    </dl>
  );
}

function slug(title: string): string {
  return `rules-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function RuleList({ groups }: { groups: RuleGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={slug(group.title)}>
          <h2 id={slug(group.title)}>{group.title}</h2>
          <ul className={styles.items}>
            {group.rules.map((rule) => (
              <li key={rule.id} className={styles.item} id={rule.id}>
                <p>{rule.text}</p>
                {rule.more ? <p>{rule.more}</p> : null}
                <p className={styles.checkedBy}>
                  <EnforcementBadge cls={rule.cls} />
                  {rule.tests && rule.tests.length > 0 ? (
                    <>
                      {" Checked by "}
                      {rule.tests.map((file, i) => (
                        <span key={file}>
                          {i > 0 ? ", " : null}
                          <a
                            href={repositoryUrl(`apps/web/${file}`)}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <code>{file}</code>
                          </a>
                        </span>
                      ))}
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
