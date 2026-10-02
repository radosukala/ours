/**
 * /projects (SPEC §18.17, M-0015, D-0018 §C): every service on our.one is
 * a project with a page that says who runs it, what it costs and what its
 * users control. The feed is the first, under the same common agreement as
 * every one after it, with its exception stated (D-0017 §D): it runs before
 * its data safeguards exist, run by the founder until the holder exists.
 *
 * The feed's description is the front page's lede, imported (D-0016 §A),
 * so the two can't drift apart. The promise at the threshold uses the
 * status line's form, "go to", so the claims scan has nothing to let
 * through here.
 */
import type { Metadata } from "next";
import Link from "next/link";
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
      <h1 className="headline">Projects</h1>
      <p className="lede">
        Every service on our.one is a project, run under the common agreement,
        with a page that says who runs it, what it costs and what its users
        control.
      </p>

      <section aria-labelledby="project-feed">
        <h2 id="project-feed">The feed, the first project</h2>
        <p>{LEDE}</p>
        <dl className={styles.facts}>
          <dt>Run by</dt>
          <dd>{MAINTAINER}, the founder</dd>
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
            {`At ${THRESHOLD} people, as the contract counts them, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.`}
          </dd>
          <dt>Under the common agreement</dt>
          <dd>
            In force: you can take your data and leave, and see its costs and
            rules. Promised: nobody sells it. Not yet: deciding its rules,
            approving its budget, changing who runs it.
          </dd>
          <dt>Its exception</dt>
          <dd>
            It is the one service that runs before its data safeguards exist.
            The founder runs it until the holder exists.
          </dd>
        </dl>
        <p className={styles.links}>
          <Link href="/contract">The contract</Link>
          <Link href="/agreement">The common agreement</Link>
        </p>
      </section>

      <section aria-labelledby="project-next">
        <h2 id="project-next">The next one</h2>
        <p>
          Not chosen yet. Propose a service, or tell us what you need.
        </p>
        <p>
          <Link href="/maintainers">Build the next one</Link>
        </p>
      </section>
    </article>
  );
}
