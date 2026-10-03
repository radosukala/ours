/**
 * /projects (SPEC §18.17, M-0015, D-0018 §C): every service on our.one is
 * a project with a page that says who runs it, what it costs and what its
 * users control. The feed is the first, under the same common agreement as
 * every one after it, with its exception stated (D-0017 §D): it runs
 * although none of its data safeguards is built, held by the founder as the
 * contract says.
 * Whether it moves to the holder before the contract's count is open
 * (D-0017 §K.4), and the page says so (the re-check of M-0015).
 *
 * The feed's description is its lede, imported (D-0016 §A), so the two
 * can't drift apart. The promise at the threshold uses the status line's
 * form, "go to", so the claims scan has nothing to let through here.
 *
 * Since D-0020 §B, the page also shows the front door's two possibilities,
 * each labelled, with no project announced. The drafts are where D-0020 §E
 * puts them: the front door, /build and /maintainers (the verification of
 * M-0017).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { POSSIBILITIES } from "@/components/public/door";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import { LEDE } from "@/components/public/lede";
import styles from "@/components/public/public.module.css";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Every service on our.one is a project with a page like this: who runs it, what it costs, and what its users control. The feed is the first.",
};

export default function ProjectsPage() {
  return (
    <article className={styles.page}>
      <p className={styles.kicker}>A first project. A wider possibility.</p>
      <h1 className="headline">Projects</h1>
      <p className="lede">
        Every service on our.one will be a project with a page like this one:
        who runs it, what it costs, and what its users control. The common
        agreement they will run under is being developed.
      </p>

      <section aria-labelledby="project-feed">
        <h2 id="project-feed">The feed, the first project</h2>
        <p>{LEDE}</p>
        <dl className={styles.facts}>
          <dt>Run by</dt>
          <dd>{MAINTAINER}, the founder, through Ctrl AI, Inc., the founder&apos;s company</dd>
          <dt>Paid</dt>
          <dd>None, by choice</dd>
          <dt>Costs</dt>
          <dd>
            Public, on <Link href="/costs">Costs</Link>
          </dd>
          <dt>Held today</dt>
          <dd>The founder holds its domain, its data and its keys.</dd>
          <dt>Promised</dt>
          <dd>
            {`At ${THRESHOLD} people, as the contract counts them, its domain, its data and the right to replace the maintainer go to a `}
            <span className={styles.nowrap}>not-for-profit</span>
            {" body of its members. If that count is never reached, nothing is handed over, and the promise not to sell still holds."}
          </dd>
          <dt>Its users&apos; rights today</dt>
          <dd>
            Held by the contract: taking your data and leaving (in Settings, or
            on request if your account is suspended), and seeing its costs and
            rules. Promised: nobody sells it. Not yet: deciding its rules,
            approving its budget, changing who runs it.
          </dd>
          <dt>Checked</dt>
          <dd>
            {"It passes the check any project proposed to our.one will go through (rules 0). Passing makes a project ready to propose, nothing more. "}
            <Link href="/build">How it&apos;s checked</Link>
          </dd>
          <dt>Its exception</dt>
          <dd>
            It is the one service that runs before its data safeguards exist.
            The founder holds it, as the contract says. Whether it moves to the
            holder before the contract&apos;s count is reached is still open.
          </dd>
        </dl>
        <p className={styles.links}>
          <Link href="/feed" className={styles.pairLink}>
            The feed&apos;s page
          </Link>
          <Link href="/contract" className={styles.pairLink}>
            The contract
          </Link>
          <Link href="/agreement" className={styles.pairLink}>
            The common agreement
          </Link>
        </p>
      </section>

      <section aria-labelledby="project-possible">
        <h2 id="project-possible">Possibilities, not projects</h2>
        <p>
          Two examples of what could come next. Neither is a project: nothing
          is announced, and no one has proposed either to our.one.
        </p>
        <ul role="list" className={styles.items}>
          {POSSIBILITIES.map((p) => (
            <li key={p.id} className={styles.item}>
              <p className={styles.meta}>{p.label}</p>
              <h3 className={styles.itemTitle}>{p.heading.join(" ")}</h3>
              <p>{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="project-next">
        <h2 id="project-next">The next one</h2>
        <p>
          Not chosen yet. Propose a service, or tell us what you need. Either
          can start before any code.
        </p>
        <p className={styles.links}>
          <Link href="/build" className={styles.pairLink}>
            Build on our.one
          </Link>
          <Link href="/maintainers" className={styles.pairLink}>
            Build the next one
          </Link>
        </p>
      </section>
    </article>
  );
}
