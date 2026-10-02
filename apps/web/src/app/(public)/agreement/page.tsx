/**
 * /agreement (SPEC §18.17, M-0015, D-0017, D-0018 §B): the common agreement
 * every service on our.one will run under, in readable words. It is being
 * developed, and it says so first: none of its collective rights is in
 * force yet, and every part says what holds it today (D-0017 §B).
 *
 * The data line's seven safeguards (D-0017 §I, adopted by D-0018 §A) are
 * each marked as not built or not yet: none is built, and the page must
 * never say otherwise (D-0018's prohibition).
 *
 * This file holds the /agreement copy, so it is the one file where the
 * claims scan lets three sentences through, in their exact words: the
 * definition of "owned", the sentence that applies it, and promise 1's
 * denial, in its form (D-0018 §E; the allowlist entries, with
 * their reason, are in core/claims.ts). Each is one string literal, so it
 * reads the same to the scan as to a person. Every sentence about the
 * handover uses the status line's form, "go to".
 */
import type { Metadata } from "next";
import type React from "react";
import Link from "next/link";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import styles from "@/components/public/public.module.css";
import { repositoryUrl } from "@/components/public/repository";
import { controller } from "@/core/config";

/** Rendered per request: the data controller comes from the configuration, as on /privacy and /power. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The common agreement",
  description:
    "The terms every service on our.one will run under, being developed in public: what the people who use a service get, what the people who run it get, and the line on your data.",
};

type Clause = {
  /** The clause, shown in bold. */
  title: string;
  /** What it means, in a sentence or two. */
  text: string;
  /** What holds it today, after "Today: ". */
  today: string;
};

/** What the people who use a service get (D-0017 §B). */
const USER_RIGHTS: readonly Clause[] = [
  {
    title: "Decide its essential rules, together.",
    text: "Its purpose and the rules that matter, by a way of deciding that the service names in advance. Ordinary product work is left to whoever runs it.",
    today: "Not in force anywhere yet. On the feed, the founder decides.",
  },
  {
    title: "Approve its budget.",
    text: "What it costs, what whoever runs it is paid, and what is kept in reserve.",
    today: "Not in force anywhere yet. The feed's costs are public, and the founder pays them.",
  },
  {
    title: "Change who runs it, and keep the service going.",
    text: "Someone new is appointed, and the service carries on with its data and its people.",
    today: `Not in force anywhere yet. For the feed, the contract promises that at ${THRESHOLD} people, as it counts them, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members. Each other service will name when its users get this right.`,
  },
  {
    title: "Take your own data and leave.",
    text: "Download it, and delete it all, whenever you want.",
    today: "In force on the feed while your account is active: your profile, posts, replies and connections, in Settings. If your account is suspended, write to the data controller and it is done for you. Held by the contract, the code and the law (GDPR).",
  },
  {
    title: "See the costs and the rules.",
    text: "What it costs to run, what whoever runs it is paid, who holds each key, and every change to its rules.",
    today: "In force on the feed: the Costs, Who controls what and Rules pages, and the public records of every decision.",
  },
  {
    title: "Nobody sells it.",
    text: "Neither a service nor any part of it will be sold, and nobody will invest in it for a return.",
    today: "Promised. On the feed, held by the contract (promise 1).",
  },
  {
    title: "Your privacy stays yours.",
    text: "No vote of a service's users can expose or sell a person's data or private connections.",
    today: "There are no votes yet. When there are, this draft is what promises it.",
  },
];

/** What the people who build and run a service get (D-0017 §C). */
const MAINTAINER_GETS: readonly string[] = [
  "A defined job. The scope is written down, and ordinary product decisions are theirs.",
  "Agreed pay, once the service is funded, for an agreed term, with a way to renew. The pay is public.",
  "Fair notice, fair terms if the agreement ends, and a way to settle disputes.",
  "Their name on their work, and a reputation they keep.",
  "Their copyright. They keep it, and grant whoever comes next the rights needed to keep the service going.",
];

/** What they give up (D-0017 §C). */
const MAINTAINER_GIVES_UP: readonly string[] = [
  "Selling the service, or the people who use it.",
  "Money from anyone who expects a return from the service.",
  "The list of users. They get the access a service needs, and it can be withdrawn.",
];

type Safeguard = {
  name: string;
  does: string;
  /** What holds it today; null where the configuration says (the law: who the controller is). */
  today: string | null;
};

/**
 * The data line's seven safeguards (D-0017 §I; D-0018 §A), each with its
 * status today. None is built.
 */
const SAFEGUARDS: readonly Safeguard[] = [
  {
    name: "The law",
    does: "The holder is the data controller, and whoever runs a service may use your data only on its documented instructions.",
    today: null,
  },
  {
    name: "The agreement",
    does: "No selling your data, and no using it for anything but the service.",
    today: "Written here. Nobody has signed it yet.",
  },
  {
    name: "No keys",
    does: "Whoever runs a service never gets the database or the production secrets.",
    today: "Not built. The founder holds every key.",
  },
  {
    name: "Reach",
    does: "A service reads and writes only what it has declared.",
    today: "Not built for any service. A check for it exists in the project's open code, tested only on a fictional example.",
  },
  {
    name: "Leave",
    does: "Your data goes only where the service has named.",
    today: "Not built.",
  },
  {
    name: "The record",
    does: "Every time a service reads your data, it is recorded where you can see it.",
    today: "Not built.",
  },
  {
    name: "Custody",
    does: "The holder owns the accounts, the database and the backups.",
    today: "Not yet. No holder exists.",
  },
];

/** This page's own source, linked from its last paragraph. */
const AGREEMENT_SOURCE = "apps/web/src/app/(public)/agreement/page.tsx";

/** The public records of every decision, linked from right 5. */
const RECORDS_LINK_TEXT = "the public records of every decision";

function Today({ children }: { children: React.ReactNode }) {
  return <p className={styles.heldBy}>Today: {children}</p>;
}

/** A right's "Today" line, with the records linked where it names them. */
function RightToday({ today }: { today: string }) {
  const at = today.indexOf(RECORDS_LINK_TEXT);
  if (at === -1) return <Today>{today}</Today>;
  return (
    <Today>
      {today.slice(0, at)}
      <a href={repositoryUrl("decisions", true)} rel="noopener noreferrer" target="_blank">
        {RECORDS_LINK_TEXT}
      </a>
      {today.slice(at + RECORDS_LINK_TEXT.length)}
    </Today>
  );
}

/** The law's "Today", from this server's configuration (as /privacy and /power read it). */
function lawToday(): string {
  const named = controller();
  return named
    ? `Not yet. No holder exists, and ${named.name} is the feed's data controller.`
    : "Not yet. No holder exists, and no data controller is named yet.";
}

export default function AgreementPage() {
  return (
    <article className={styles.page}>
      <h1 className="headline">The common agreement</h1>
      <p className="lede">
        The terms every service on our.one will run under: between the people
        who use a service and the people who build and run it.
      </p>
      <p className="notice">
        Being developed. None of the collective rights below is in force yet,
        and each part says what holds it today.
      </p>

      <section aria-labelledby="agreement-meaning">
        <h2 id="agreement-meaning">What ownership means here</h2>
        <blockquote>
          <p>
            <strong>
              {"Owned by its users means: its users, together, decide its essential rules, approve its budget, and can change who runs it while the service keeps going."}{" "}
              Nobody can sell that away from them, and each person can always
              take their own data and leave.
            </strong>
          </p>
        </blockquote>
        <p>
          {"We call a service owned by its users only when all of that holds."}{" "}
          None does yet.
        </p>
        <p>
          This is about control. It isn&apos;t shares: there is nothing to
          trade, and nobody receives a payout.
        </p>
      </section>

      <section aria-labelledby="agreement-users">
        <h2 id="agreement-users">1. What the people who use a service get</h2>
        <ol className={styles.promiseList}>
          {USER_RIGHTS.map((r) => (
            <li key={r.title} className={styles.promiseItem}>
              <p>
                <strong>{r.title}</strong> {r.text}
              </p>
              <RightToday today={r.today} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="agreement-maintainers">
        <h2 id="agreement-maintainers">
          2. What the people who build and run a service get
        </h2>
        <ul className="prose">
          {MAINTAINER_GETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Today>
          No one has signed this agreement yet. The feed&apos;s maintainer is
          the founder, unpaid by choice.
        </Today>
      </section>

      <section aria-labelledby="agreement-gives-up">
        <h2 id="agreement-gives-up">3. What they give up</h2>
        <ul className="prose">
          {MAINTAINER_GIVES_UP.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Today>
          No one has signed this agreement yet. On the feed, the contract&apos;s
          promise 1 holds the sale and the money.
        </Today>
      </section>

      <section aria-labelledby="agreement-data">
        <h2 id="agreement-data">4. Your data: a line nobody running a service should be able to cross</h2>
        <p>
          Whoever runs a service must never be able to take your data for
          their own use, or to sell it. Your data and your connections will be
          kept together by the holder, a body that holds them for the users, so
          that no service failing or leaving takes them with it. Until the
          holder exists, the founder keeps the feed&apos;s.
        </p>
        <p>Seven safeguards are meant to hold that line. None of them is built yet:</p>
        <ul className={styles.items}>
          {SAFEGUARDS.map((s) => (
            <li key={s.name} className={styles.item}>
              <h3 className={styles.itemTitle}>{s.name}</h3>
              <dl className={styles.facts}>
                <dt>What</dt>
                <dd>{s.does}</dd>
                <dt>Today</dt>
                <dd>{s.today ?? lawToday()}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <p>
          Until all seven exist for a service, it gets nothing of yours from
          our.one: no data, no connections, no sign-in. The feed is the one
          exception: the founder holds it until the holder exists.
        </p>
        <p>
          Even then, a service could misuse what it is allowed to show you or
          send. That can be recorded and challenged; it can&apos;t be
          prevented.
        </p>
      </section>

      <section aria-labelledby="agreement-kinds">
        <h2 id="agreement-kinds">5. Two kinds of project</h2>
        <dl className={styles.facts}>
          <dt>Independent</dt>
          <dd>
            Whoever runs it holds everything: the accounts, the data and the
            name. It gets nothing of yours from our.one, and if our.one lists
            it at all, the listing says so.
          </dd>
          <dt>Protected</dt>
          <dd>
            The holder keeps the name, the domain, the data, the deploys and
            the funds, and whoever runs it works with access that can be
            withdrawn. The test: someone new can be appointed and carry on,
            and whoever ran it before can&apos;t stop them.
          </dd>
        </dl>
        <Today>
          There are no protected services yet besides the feed, which the
          founder holds until the holder exists.
        </Today>
      </section>

      <section aria-labelledby="agreement-money">
        <h2 id="agreement-money">6. Money</h2>
        <ul className="prose">
          <li>
            Shared costs are public, and the people who pay them approve them.
            Nobody earns a margin without doing the work.
          </li>
          <li>
            our.one takes no money for anyone until the holder exists. After
            that, a protected service&apos;s funds are kept by the holder, and
            whoever runs it is paid from them as their agreement says.
          </li>
          <li>
            What a service brings in isn&apos;t what whoever runs it earns: it
            also pays for hosting, support, security and reserves.
          </li>
        </ul>
        <Today>
          our.one takes no money. The founder pays the feed&apos;s costs, which
          are public on <Link href="/costs">Costs</Link>.
        </Today>
      </section>

      <section aria-labelledby="agreement-start">
        <h2 id="agreement-start">7. How a service starts</h2>
        <ol className="prose">
          <li>Someone proposes a service, or people name a need.</li>
          <li>
            A proposal says what the need is, what people would have to
            change, the price, the scope and the budget, including the pay of
            whoever runs it, and what it asks for now.
          </li>
          <li>
            People say they&apos;re interested, try it, or say they&apos;d
            pay. These are counted apart, and none of them is a payment.
          </li>
          <li>
            When the people who use a protected service first pay for it, its
            name, its data and its funds go to the holder, which is set up then
            if it doesn&apos;t exist yet.
          </li>
        </ol>
        <p className={styles.heldBy}>
          Today: proposals are read by hand.{" "}
          <Link href="/maintainers">Build the next one</Link>
        </p>
      </section>

      <section aria-labelledby="agreement-feed">
        <h2 id="agreement-feed">8. The feed, the first project</h2>
        <ul className="prose">
          <li>
            Run by {MAINTAINER}, the founder, through Ctrl AI, Inc., the
            founder&apos;s company. Unpaid, by choice.
          </li>
          <li>Today the founder holds its domain, its data and its keys.</li>
          <li>
            {`The contract promises: at ${THRESHOLD} people, as it counts them, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.`}
          </li>
          <li>
            If that count is never reached, none of it goes to that body. The
            promise not to sell still holds.
          </li>
        </ul>
        <p className={styles.links}>
          <Link href="/projects">Its project page</Link>
          <Link href="/contract">The contract</Link>
        </p>
      </section>

      <p>
        This agreement is a draft, developed in public: every change is a
        commit to{" "}
        <a href={repositoryUrl(AGREEMENT_SOURCE)} rel="noopener noreferrer" target="_blank">
          its source
        </a>
        , which anyone can read. The terms you join the feed under are the
        contract.
      </p>
    </article>
  );
}
