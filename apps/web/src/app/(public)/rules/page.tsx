/**
 * /rules (SPEC §6, §10, §12, §17 item 19): the floor rules, each with how
 * it is held, and who decides today. Plain words; says plainly who decides,
 * and that the founder can change or remove any check without notice
 * (FOUNDING-AUTHORITY §6: saying so is a requirement, not a disclaimer).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { FLOOR_RULES } from "@/components/public/floorRules";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { EnforcementLegend, RuleList } from "@/components/public/RuleList";
import { STATUS_LINE } from "@/components/RightColumn";

export const metadata: Metadata = {
  title: "Rules",
  description: "The rules OURS runs on, and how each one is held.",
};

export default function RulesPage() {
  return (
    <article className={styles.page}>
      <h1 className="headline">Rules</h1>
      <p className="lede">
        The rules OURS runs on, in plain words. Each one says how it&apos;s
        held: by the code, by a check, by a person, or only on paper so far.
      </p>

      <section aria-labelledby="rules-who">
        <h2 id="rules-who">Who decides today</h2>
        <p>
          The founder, under bootstrap authority: the starting authority of
          the person who began OURS, used in the open. Every decision is a
          public record in the{" "}
          <a
            href={repositoryUrl("decisions", true)}
            rel="noopener noreferrer"
            target="_blank"
          >
            open code
          </a>
          .
        </p>
        <p>
          The founder can change or remove any of these checks
          without notice; every change is a public commit.
        </p>
        <p className="muted">{STATUS_LINE}</p>
        <p>
          <Link href="/power">Who controls what</Link> lists the rest.
        </p>
      </section>

      <section aria-labelledby="rules-how">
        <h2 id="rules-how">How a rule is held</h2>
        <EnforcementLegend />
      </section>

      <RuleList groups={FLOOR_RULES} />
    </article>
  );
}
