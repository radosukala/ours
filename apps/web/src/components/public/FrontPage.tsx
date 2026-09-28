/**
 * The front page (SPEC §18.2, M-0011, D-0012 §D). The copy is the
 * specification's, word for word: the headline, the lede, the live count
 * shown as a rank (no progress bar), how to get in, the promise, why a
 * maintainer and not an owner (each sentence linked to its source, SPEC
 * §18.9), and fair questions. The footer comes from the public layout.
 *
 * The handover is written as a promise with its conditions, never as
 * something that has happened, and the page says what happens if the
 * threshold is never reached.
 *
 * Presentational: src/app/(public)/page.tsx reads the count and the seats
 * on the server and passes them in, so every state can be rendered without
 * a database. A number that could not be read is null, and its line is
 * left out: the page renders with no error and no number.
 */
import Link from "next/link";
import { LinkButton } from "@/components/Button";
import { GetInForm } from "./GetInForm";
import { formatCount, MAINTAINER, NOTICE_DAYS, THRESHOLD } from "./handover";
import styles from "./public.module.css";

export type FrontPageProps = {
  /** The public count (`memberCount`), or null when it could not be read. */
  count: number | null;
  /**
   * Whether the Get in form is shown: a data controller is named and the
   * client-address header is decided (`accountCreationOpen()` and
   * `clientIpHeader()`, the same gates as joining).
   */
  joining: boolean;
  /** Seats open now, or null when that could not be read (or joining is off). */
  seatsOpen: number | null;
};

/** The headline, one line each (D-0012 §D). */
export const HEADLINE = ["Today it's mine.", `At ${THRESHOLD} members, I give it away.`] as const;

/** The metadata title (SPEC §18.2). */
export const FRONT_PAGE_TITLE = `our.one · ${HEADLINE[0]} ${HEADLINE[1]}`;

/** The count, shown as the rank the next person would have. */
export function countLine(n: number): string {
  if (n === 0) return "Nobody is in yet. You'd be #1.";
  if (n === 1) return "1 person is in. You'd be #2.";
  return `${formatCount(n)} people are in. You'd be #${formatCount(n + 1)}.`;
}

/** The line under the form: how many seats are open. */
export function seatLine(open: number): string {
  if (open <= 0) return "No seats open right now. Leave your address and you'll get the next one.";
  if (open === 1) return "1 seat open.";
  return `${formatCount(open)} seats open.`;
}

/** Why a maintainer, not an owner: each sentence and its source (SPEC §18.9). */
const STORY: readonly { text: string; source: string }[] = [
  {
    text: "In 2012, WhatsApp wrote: “when advertising is involved you the user are the product.” It charged $0.99 a year after the first.",
    source: "https://blog.whatsapp.com/why-we-don-t-sell-ads",
  },
  {
    text: "In 2014, Facebook bought it for about $19 billion.",
    source: "https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/",
  },
  {
    text: "In 2016, WhatsApp began sharing users' phone numbers with Facebook.",
    source:
      "https://www.eff.org/deeplinks/2016/08/what-facebook-and-whatsapps-data-sharing-plans-really-mean-user-privacy-0",
  },
  {
    text: "In 2018, one of its founders said: “I sold my users' privacy.”",
    source: "https://www.cnbc.com/2018/09/26/whatsapp-co-founder-explains-why-he-left-facebook.html",
  },
  {
    text: "In 2025, ads came to WhatsApp.",
    source: "https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html",
  },
];

const QUESTIONS: readonly { question: string; answer: string }[] = [
  {
    question: "Why should I believe you?",
    answer:
      "Don't take my word for it. Read the contract: it is the terms you join under. The code is open, and every cost is public.",
  },
  {
    question: "Why not hand it over now?",
    answer: `A proper not-for-profit body costs money and time, and I've built things before that nobody used. If ${THRESHOLD} people want this, it deserves one, with their say.`,
  },
  {
    question: `What if it never gets to ${THRESHOLD}?`,
    answer:
      "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything.",
  },
  {
    question: `What happens at ${THRESHOLD}?`,
    answer:
      "Members vote to found a not-for-profit body under rules published before that day. It gets the domain, the data and the right to replace the maintainer.",
  },
  {
    question: "What's a maintainer?",
    answer: `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, a body of its members holds it, and can replace me.`,
  },
];

export function FrontPage({ count, joining, seatsOpen }: FrontPageProps) {
  return (
    <article className={styles.front}>
      <header className={styles.hero}>
        <h1 className={`headline ${styles.frontHeadline}`}>
          <span>{HEADLINE[0]}</span> <span>{HEADLINE[1]}</span>
        </h1>
        <p className="lede">
          our.one is a social network for your people: their posts, in order,
          with an end when you&apos;re caught up. No ads. No ranking.
        </p>
        {count !== null ? <p className={styles.count}>{countLine(count)}</p> : null}
      </header>

      <section className={`${styles.frontSection} ${styles.getIn}`} aria-labelledby="front-get-in">
        <h2 id="front-get-in">Get in</h2>
        {joining ? (
          <>
            <GetInForm />
            {seatsOpen !== null ? <p className={styles.seats}>{seatLine(seatsOpen)}</p> : null}
            <p className="muted small">
              We keep your address only to send you the link, and only until
              you&apos;re invited or you ask us to delete it.{" "}
              <Link href="/privacy" className="link">
                Privacy
              </Link>
            </p>
          </>
        ) : (
          <p className="notice">Joining opens soon.</p>
        )}
        <div className={styles.haveInvite}>
          <p>Have an invite? Open the link you were sent.</p>
          <LinkButton href="/signin" kind="outline">
            Sign in
          </LinkButton>
        </div>
      </section>

      <section className={styles.frontSection} aria-labelledby="front-promise">
        <h2 id="front-promise">The promise</h2>
        <p>
          When {THRESHOLD}{" "}
          people have joined, I hand over our.one&apos;s domain, its data and
          the right to replace whoever runs it to a not-for-profit body of its
          members, founded by their vote.
        </p>
        <p>
          Until then I run it as its maintainer, under a public contract. Two
          of its promises can never be changed: no sale, and the handover. The
          rest can change only with {NOTICE_DAYS}{" "}
          days&apos; notice, and you can always leave with everything.
        </p>
        <p>
          <Link href="/contract" className={styles.more}>
            Read the contract
          </Link>
        </p>
        <p className={styles.signature}>{MAINTAINER}, maintainer</p>
      </section>

      <section className={styles.frontSection} aria-labelledby="front-why">
        <h2 id="front-why">Why a maintainer, not an owner</h2>
        <ol role="list" className={styles.story}>
          {STORY.map((s) => (
            <li key={s.source}>
              <a href={s.source} rel="noopener noreferrer" target="_blank">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
        <p className={styles.moral}>
          <strong>
            An owner can sell it, change it or shut it down. A maintainer does
            the job, or is replaced.
          </strong>
        </p>
      </section>

      <section className={styles.frontSection} aria-labelledby="front-questions">
        <h2 id="front-questions">Fair questions</h2>
        <dl className={styles.questions}>
          {QUESTIONS.map((q) => (
            <div key={q.question}>
              <dt>{q.question}</dt>
              <dd>{q.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
