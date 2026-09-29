/**
 * The front page (SPEC §18.15, M-0013, D-0015, which amends D-0012 §D). The
 * copy is the specification's, word for word, in the order a stranger
 * needs it: what our.one is and why they would want it, how it works, who
 * runs it and what holds each promise, then the questions.
 *
 * - The first screen: the headline, the lede, Get in, the maintainer's
 *   promise as a signed card, and a picture of a feed that ends.
 * - Where did your friends go?: the court's 7% finding, linked to its
 *   source, and an illustration.
 * - How it works, in three steps.
 * - Keep your people. Change who runs it.: WhatsApp in three dated lines,
 *   the maintainer, the handover promise, what holds it today, and the
 *   count, shown as a rank (no progress bar).
 * - Fair questions, and a last way to get in.
 *
 * Every sentence about the handover is in this file, listed by exact text
 * in the claims scan's ALLOWLIST (src/core/claims.ts). The handover is
 * written as a promise with its conditions, never as something that has
 * happened, and the page says what happens if the threshold is never
 * reached.
 *
 * Presentational: src/app/(public)/page.tsx reads the count and the seats
 * on the server and passes them in, so every state can be rendered without
 * a database. A number that could not be read is null, and its line is
 * left out: the page renders with no error and no number.
 */
import Link from "next/link";
import { OPEN_CODE_URL } from "@/components/RightColumn";
import { DEFAULT_INVITES } from "@/core/config";
import { FeedContrast } from "./FeedContrast";
import { FeedPreview } from "./FeedPreview";
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

/** The headline, one line each (D-0015 §A). */
export const HEADLINE = ["Just your people.", "Then you're done."] as const;

/** The metadata title (SPEC §18.15). */
export const FRONT_PAGE_TITLE = `our.one · ${HEADLINE[0]} ${HEADLINE[1]}`;

/** The lede (D-0015 §B). */
export const LEDE =
  "our.one shows you posts from the people you choose, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can put your phone down.";

/** The count, shown as the rank the next person would have. */
export function countLine(n: number): string {
  if (n === 0) return "Nobody is in yet. You'd be #1.";
  if (n === 1) return "1 person is in. You'd be #2.";
  return `${formatCount(n)} people are in. You'd be #${formatCount(n + 1)}.`;
}

/** Under the form, while joining is open (SPEC §18.15 item 1.3). */
export const FREE_LINE = `Free to join. You get ${DEFAULT_INVITES} invites to bring your people.`;

/** The seat line (D-0015 §D): shown only when no seat is open. */
export function seatLine(open: number): string | null {
  return open <= 0 ? "No seats open right now. Leave your address and you'll get the next one." : null;
}

/** The court's finding (D-0015 §E), and its source: ECF No. 705, page 8. */
export const FRIENDS_SOURCE =
  "https://storage.courtlistener.com/recap/gov.uscourts.dcd.224921/gov.uscourts.dcd.224921.705.0.pdf";

/** WhatsApp in three dated lines, each linked to its source (SPEC §18.15). */
const STORY: readonly { year: string; text: string; source: string }[] = [
  {
    year: "2012",
    text: "WhatsApp wrote: “when advertising is involved you the user are the product.” It charged its users instead.",
    source: "https://blog.whatsapp.com/why-we-don-t-sell-ads",
  },
  {
    year: "2014",
    text: "Facebook agreed to buy it for about $19 billion.",
    source: "https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/",
  },
  {
    year: "2025",
    text: "Ads came to WhatsApp.",
    source: "https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html",
  },
];

const STEPS: readonly { title: string; text: string }[] = [
  {
    title: "Get in",
    text: "Your email, a name and a username. It's free, and you need to be 18 or older.",
  },
  {
    title: "Bring your people",
    text: `You get ${DEFAULT_INVITES} invites. It stays quiet until the people you care about are here, so send them to the ones you'd actually want to hear from.`,
  },
  {
    title: "Catch up, then close it",
    text: "Their posts, newest first. When there's nothing new, it says so.",
  },
];

const QUESTIONS: readonly { question: string; answer: string }[] = [
  {
    question: "Is it free?",
    answer: "Yes. Today I pay the bills, and every cost is public.",
  },
  {
    question: "What if my friends aren't on it?",
    answer: `At first they won't be. That's what your ${DEFAULT_INVITES} invites are for.`,
  },
  {
    question: "Can I post photos?",
    answer: "Not yet. Posts are words for now.",
  },
  {
    question: "Is there an app?",
    answer: "Not yet. our.one works in your phone's browser, and you can add it to your home screen.",
  },
  {
    question: "Why should I believe you?",
    answer:
      "Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost.",
  },
  {
    question: `What if it never gets to ${THRESHOLD}?`,
    answer:
      "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything.",
  },
  {
    question: "What's a maintainer?",
    answer: `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, a body of its members holds it, and can replace me.`,
  },
];

export function FrontPage({ count, joining, seatsOpen }: FrontPageProps) {
  const seats = seatsOpen === null ? null : seatLine(seatsOpen);
  return (
    <article className={`${styles.front} front-wide`}>
      {/* The first screen (SPEC §18.15 item 1): what it is, one action and
          the promise, beside a picture of the product. */}
      <div className={styles.fold}>
        <div className={styles.heroColumn}>
          <header className={styles.hero}>
            <h1 className={`headline ${styles.frontHeadline}`}>
              <span>{HEADLINE[0]}</span> <span>{HEADLINE[1]}</span>
            </h1>
            <p className={`lede ${styles.frontLede}`}>{LEDE}</p>
          </header>

          <section className={styles.getIn} aria-labelledby="front-get-in">
            <h2 id="front-get-in" className="visually-hidden">
              Get in
            </h2>
            {joining ? (
              <>
                <GetInForm />
                {seats ? <p className={styles.seats}>{seats}</p> : null}
                <p className={styles.free}>{FREE_LINE}</p>
                <p className="muted small">
                  {"We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in "}
                  <Link href="/privacy" className="link">
                    Privacy
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <p className="notice">Joining opens soon.</p>
                <p className={styles.haveInvite}>
                  Have an invite? Open the link you were sent.{" "}
                  <Link href="/signin" className="link">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </section>

          <figure className={styles.pledge}>
            <span className={styles.pledgeFace} aria-hidden="true">
              {MAINTAINER[0]}
            </span>
            <blockquote className={styles.pledgeWords}>
              <p>
                I&apos;ll never sell our.one. When {THRESHOLD}{" "}
                people have joined, I hand it to a not-for-profit body of its members, and they can replace me.
              </p>
            </blockquote>
            <figcaption className={styles.pledgeBy}>
              {MAINTAINER}, maintainer ·{" "}
              <a href="#front-runs" className="link">
                How that works
              </a>
            </figcaption>
          </figure>
        </div>
        <FeedPreview />
      </div>

      <section className={styles.frontSection} aria-labelledby="front-friends">
        <div className={styles.friends}>
          <div className={styles.friendsText}>
            <h2 id="front-friends">Where did your friends go?</h2>
            <p className={styles.stat} aria-hidden="true">
              7%
            </p>
            <p className={styles.body}>
              In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.
            </p>
            <p className={styles.source}>
              {"Source: "}
              <a href={FRIENDS_SOURCE} rel="noopener noreferrer" target="_blank">
                the court&apos;s opinion in FTC v. Meta
              </a>
              {", page 8, citing Meta's own figures."}
            </p>
            <p className={styles.body}>On our.one, your feed is only the people you chose, and then it ends.</p>
          </div>
          <FeedContrast />
        </div>
      </section>

      <section className={styles.frontSection} aria-labelledby="front-how">
        <h2 id="front-how">How it works</h2>
        <ol role="list" className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className={styles.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.frontSection} aria-labelledby="front-runs">
        <h2 id="front-runs">Keep your people. Change who runs it.</h2>
        <div className={styles.runs}>
          <div className={styles.runsStory}>
            <p className={styles.storyLabel}>WhatsApp, in three dates</p>
            <ol role="list" className={styles.story}>
              {STORY.map((s) => (
                <li key={s.year}>
                  <span className={styles.year}>{s.year}</span>
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
          </div>
          <div className={styles.runsPromise}>
            <p>
              our.one has a maintainer: me, {MAINTAINER}. I run it under a public contract, and that contract is the terms you join under. Two of its promises can never be changed: no sale, and the handover. The rest can change only with {NOTICE_DAYS}{" "}
              days&apos; notice, and you can always leave with everything.
            </p>
            <p>
              When {THRESHOLD}{" "}
              people have joined, I hand over our.one&apos;s domain, its data and
              the right to replace whoever runs it to a not-for-profit body of its
              members, founded by their vote.
            </p>
            <p>Today these promises are held by that contract, not yet by law.</p>
            {count !== null ? <p className={styles.count}>{countLine(count)}</p> : null}
            <p className={styles.links}>
              <Link href="/contract" className={styles.more}>
                Read the contract
              </Link>
              <Link href="/costs" className={styles.more}>
                See every cost
              </Link>
              <a href={OPEN_CODE_URL} className={styles.more} rel="noopener noreferrer" target="_blank">
                Read the code
              </a>
            </p>
          </div>
        </div>
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

      {joining ? (
        <section className={styles.close} aria-labelledby="front-close">
          <h2 id="front-close">Bring your people.</h2>
          <a href="#front-get-in" className="btn btn--primary btn--large">
            Get in
          </a>
        </section>
      ) : null}
    </article>
  );
}
