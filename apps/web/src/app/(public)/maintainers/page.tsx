/**
 * /maintainers, "Build the next one" (SPEC §18.17, M-0015, D-0018 §C and
 * §D): what a maintainer does, what they get and what they give up, how to
 * propose a service, and how anyone can name a need.
 *
 * Proposals and needs go by email, read by hand: no form and nothing
 * stored here (D-0017 §H). The address is PROPOSALS_EMAIL, the founder's
 * choice (`proposalsEmail()`); while it is empty the page says proposals
 * open at launch and shows no address, because a missing human decision
 * switches a feature off. Rendered per request, because the address comes
 * from the environment.
 *
 * Nothing here promises income (D-0017's prohibition): people are paid by
 * those who choose their service, and the page says what that means.
 */
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/public/public.module.css";
import { proposalsEmail } from "@/core/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build the next one",
  description:
    "Build, improve and run a service on our.one, paid by the people who choose it, under the common agreement. How to propose one, and how to name a need.",
};

/** The subject lines the two mailto links carry. */
const PROPOSAL_SUBJECT = "A proposal for our.one";
const NEED_SUBJECT = "A need for our.one";

function mailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

export default function MaintainersPage() {
  const email = proposalsEmail();

  return (
    <article className={styles.page}>
      <h1 className="headline">Build the next one</h1>
      <p className="lede">
        The feed is our first project. We&apos;re looking for people to build,
        improve and run the next ones, paid by the people who choose them,
        under the common agreement.
      </p>
      <p>
        {"Start with your coding agent: "}
        <Link href="/build">Build on our.one</Link>
        {" has the line to give it, the rules it follows and the check it runs."}
      </p>

      <section aria-labelledby="maintainers-job">
        <h2 id="maintainers-job">What the job is</h2>
        <p>
          You build a service, improve it and run it: you keep it working and
          safe, and you answer for it to the people who use it.
        </p>
      </section>

      <section aria-labelledby="maintainers-get">
        <h2 id="maintainers-get">What you get</h2>
        <ul className="prose">
          <li>A defined job. The scope is written down, and ordinary product decisions are yours.</li>
          <li>Agreed pay, once the service is funded, for an agreed term, with a way to renew. Your pay is public.</li>
          <li>Fair notice, fair terms if the agreement ends, and a way to settle disputes.</li>
          <li>Your name on your work, and a reputation you keep.</li>
          <li>Your copyright. You keep it, and grant whoever comes next the rights needed to keep the service going.</li>
        </ul>
        <p>
          If people choose your service and pay for it, you&apos;re paid what
          your agreement says. our.one takes no money for anyone until the
          holder exists. After that, a protected service&apos;s funds are kept
          by the holder, and only shared costs are taken from them, in public.
        </p>
      </section>

      <section aria-labelledby="maintainers-give-up">
        <h2 id="maintainers-give-up">What you give up</h2>
        <ul className="prose">
          <li>Selling the service, or the people who use it.</li>
          <li>Money from anyone who expects a return from the service.</li>
          <li>The list of users. You get the access your service needs, and it can be withdrawn.</li>
        </ul>
      </section>

      <section aria-labelledby="maintainers-data">
        <h2 id="maintainers-data">Your users&apos; data</h2>
        <p>
          It is meant to stay out of your reach: you would get only what your
          service declares, through the holder, and never the database or the
          list of people. None of that is built yet, so until it is, a new
          service gets nothing of theirs from our.one.{" "}
          <Link href="/agreement">The common agreement</Link> has the details.
        </p>
      </section>

      <section aria-labelledby="maintainers-propose">
        <h2 id="maintainers-propose">Propose a service</h2>
        <p>Write to us with:</p>
        <ul className="prose">
          <li>the need, and who has it;</li>
          <li>what people would have to change to use your service;</li>
          <li>the price, the scope and the budget, including your pay;</li>
          <li>what you&apos;re asking for now: feedback, people to try it, or people who would pay.</li>
        </ul>
        <p>
          We read every proposal by hand, and check it against the common
          agreement and the law.
        </p>
        {email ? (
          <p>
            Send it to <a href={mailto(email, PROPOSAL_SUBJECT)}>{email}</a>.
          </p>
        ) : (
          <p className="notice">Proposals open at launch.</p>
        )}
      </section>

      <section aria-labelledby="maintainers-need">
        <h2 id="maintainers-need">Need something?</h2>
        <p>
          You don&apos;t have to build anything. Tell us what you need, and
          what you use or pay for it today.
        </p>
        {email ? (
          <p>
            Write to <a href={mailto(email, NEED_SUBJECT)}>{email}</a>.
          </p>
        ) : (
          <p className="notice">This opens at launch, too.</p>
        )}
      </section>

      <section aria-labelledby="maintainers-today">
        <h2 id="maintainers-today">Where it stands today</h2>
        <p>
          No one has signed the common agreement yet, there are no protected
          services besides the feed, and none of the data safeguards is built.
          This page is how it starts.
        </p>
        <p>
          <Link href="/projects">Projects</Link>
        </p>
      </section>
    </article>
  );
}
