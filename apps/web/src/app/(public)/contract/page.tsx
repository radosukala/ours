/**
 * /contract (SPEC §18.3, M-0011, D-0012 §A and §B): the maintainer's
 * promises, each with what holds it today — this contract, the code, or
 * the law — the handover promise with its conditions, and what happens if
 * the threshold is never reached. The copy is the specification's, word
 * for word.
 *
 * Before the threshold these are promises, and the page says so: nothing
 * here tells the handover as done.
 *
 * This file holds the /contract copy, so it is the one file where the
 * claims scan lets promise 1 through, in its exact words (SPEC §18.7; the
 * allowlist entry, with its reason, is in core/claims.ts).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { MAINTAINER, NOTICE_DAYS, THRESHOLD } from "@/components/public/handover";
import styles from "@/components/public/public.module.css";
import { OPEN_CODE_URL } from "@/components/RightColumn";

export const metadata: Metadata = {
  title: "The contract",
};

type ContractPromise = {
  /** The promise, shown in bold. */
  promise: string;
  /** What holds it today, after "Held today by: ". */
  heldBy: string;
  /** A page that shows it held, linked from the "Held today by" line. */
  link?: { label: string; href: string; external?: boolean };
};

/** The promises, numbered as the page numbers them (promise 8 names 1, 2 and 3 to 7). */
const PROMISES: readonly ContractPromise[] = [
  {
    promise: "Neither our.one nor any part of it will be sold, and nobody will invest in it for a return.",
    heldBy: "this contract. This promise can never be changed.",
  },
  {
    promise: `At ${THRESHOLD} members, I hand over the domain, the data and the right to replace the maintainer to a not-for-profit body of the members, founded by their vote under rules published before that day. The count is the number on the front page: accounts that exist and are not suspended.`,
    heldBy: "this contract. This promise can never be changed.",
  },
  {
    promise: "Your feed is your people, in order. No ranking, no ads, no selling your data.",
    heldBy: "this contract and the code.",
  },
  {
    promise: "You can leave with everything: download your profile, posts, replies and connections, and delete it all, whenever you want. For anything else we hold about you, write to us. If your account is suspended, write to us and we will do it for you.",
    heldBy: "this contract, the code and the law (GDPR).",
  },
  {
    promise: "Every cost is public. Money buys no reach and no say.",
    heldBy: "this contract.",
    link: { label: "Costs", href: "/costs" },
  },
  {
    promise: "The code is public, under an open licence (Apache-2.0): anyone can read it, run it or copy it.",
    heldBy: "this contract and the licence.",
    link: { label: "Open code", href: OPEN_CODE_URL, external: true },
  },
  {
    promise: "Who holds each key is public.",
    heldBy: "this contract.",
    link: { label: "Who controls what", href: "/power" },
  },
  {
    promise: `Changes come with notice. Any change to this contract is announced ${NOTICE_DAYS} days ahead, with the reason, and you can leave with everything before it applies. Promises 1 and 2 can't be changed at all.`,
    heldBy: "this contract.",
  },
];

function HeldBy({ heldBy, link }: Pick<ContractPromise, "heldBy" | "link">) {
  return (
    <p className={styles.heldBy}>
      Held today by: {heldBy}
      {link ? (
        <>
          {" "}
          {link.external ? (
            <a href={link.href} rel="noopener noreferrer" target="_blank">
              {link.label}
            </a>
          ) : (
            <Link href={link.href}>{link.label}</Link>
          )}
        </>
      ) : null}
    </p>
  );
}

export default function ContractPage() {
  return (
    <article className={styles.page}>
      <h1 className="headline">The contract</h1>
      <p className="lede">
        Between the people who use our.one and its maintainer. Most terms of
        service list what you can&apos;t do. This one lists what the
        maintainer can&apos;t do, and says what holds each promise today:
        this contract, the code, or the law.
      </p>
      <p>
        The maintainer keeps our.one running and safe, acts on reports, and
        pays the bills. Today that is me, {MAINTAINER}, through my company,
        Ctrl AI, Inc. Until {THRESHOLD}{" "}
        members I also hold the domain, the data and the keys, and I&apos;m
        not paid.
      </p>
      <p>
        These are the feed&apos;s terms. The feed will also run under the{" "}
        <Link href="/agreement">common agreement</Link>, which every service
        on our.one will sign. It is being developed in public.
      </p>

      <ol className={styles.promiseList}>
        {PROMISES.map((p) => (
          <li key={p.promise} className={styles.promiseItem}>
            <p>
              <strong>{p.promise}</strong>
            </p>
            <HeldBy heldBy={p.heldBy} link={p.link} />
          </li>
        ))}
      </ol>

      <section aria-labelledby="contract-never">
        <h2 id="contract-never">If it never gets to {THRESHOLD}</h2>
        <p>
          Nothing is handed over. Promise 1 still holds, the code stays open,
          and you can leave with everything.
        </p>
      </section>

      <p>
        Until {THRESHOLD}, these are my promises, written into the terms you
        join under. That is weaker than a law, and this page says so.
      </p>
    </article>
  );
}
