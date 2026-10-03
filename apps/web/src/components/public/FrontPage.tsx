/**
 * The front page (SPEC §18.15, as §18.16 amends it; M-0013 and M-0014;
 * D-0015, as D-0016 amends it). The copy is the specification's, word for
 * word, in the order a stranger needs it: what our.one is and why they
 * would want it, how it works, why it exists and who runs it, what holds
 * each promise, then the questions and whom they would bring.
 *
 * - The first screen: the headline, the lede, joining, a picture of a
 *   feed that ends, and the maintainer's promise as a signed card. On a
 *   phone they come in that order, so the product comes before the
 *   promise; from 900px the picture stands beside the rest (D-0016 §D).
 * - Where did your friends go?: the court's 7% finding, linked to its
 *   source, and an illustration.
 * - How it works, in three steps.
 * - Keep your people. Change who runs it.: why our.one exists, WhatsApp in
 *   three dated lines, the maintainer, the handover promise, what holds it
 *   today, and the count, shown as a rank (no progress bar).
 * - Fair questions, and a last way to join: who would you like to hear
 *   from?
 *
 * Every sentence about the handover is in this file, listed by exact text
 * in D-0016 or in the claims scan's ALLOWLIST (src/core/claims.ts), which
 * holds every one its rules catch (D-0016 §N). The handover is written as
 * a promise with its conditions, never as something that has happened,
 * and the page says what happens if the threshold is never reached.
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
import { MAINTAINER, NOTICE_DAYS, THRESHOLD } from "./handover";
import { countLine, FREE_LINE, INVITE_CLOSED_LINE, JOIN_LABEL, joinLabel, memberCountLine, seatLine } from "./join";
import { LEDE } from "./lede";
import { MemberJoin } from "./MemberJoin";
import styles from "./public.module.css";

export type FrontPageProps = {
  /** The public count (`memberCount`), or null when it could not be read. */
  count: number | null;
  /**
   * Whether the join form is shown: a data controller is named and the
   * client-address header is decided (`accountCreationOpen()` and
   * `clientIpHeader()`, the same gates as joining).
   */
  joining: boolean;
  /** Seats open now, or null when that could not be read (or joining is off). */
  seatsOpen: number | null;
  /**
   * Addresses waiting in line, or null when that could not be read (or
   * joining is off). With one waiting, a new address waits too, whatever
   * is open (`joinLabel`).
   */
  seatsWaiting?: number | null;
  /** A member is shown their feed where a visitor is asked to join (D-0023 §C). */
  member?: boolean;
};

/** The headline, one line each (D-0015 §A; D-0016 keeps it). */
export const HEADLINE = ["Just your people.", "Then you're done."] as const;

/** The metadata title (SPEC §18.15). */
export const FRONT_PAGE_TITLE = `our.one · ${HEADLINE[0]} ${HEADLINE[1]}`;

/**
 * The lede (D-0016 §A): what our.one is, then how it reads. It lives in
 * lede.ts because the invite page shows it too, word for word (D-0016 §I).
 */
export { LEDE };

/**
 * The count line, the free line, the closed line and the seat line live in
 * join.ts since D-0020, because the front door shows them too (the contract
 * counts "the number on the front page", and the seat email says to ask
 * again there). They are re-exported here, word for word.
 */
export { countLine, FREE_LINE, INVITE_CLOSED_LINE, seatLine } from "./join";

/** The court's finding (D-0015 §E), and its source: ECF No. 705, pages 8 and 9. */
export const FRIENDS_SOURCE =
  "https://storage.courtlistener.com/recap/gov.uscourts.dcd.224921/gov.uscourts.dcd.224921.705.0.pdf";

/**
 * WhatsApp in three dated lines, each linked to its source (SPEC §18.15).
 * The 2025 line is what Meta announced, linked to its own announcement:
 * ads in Status, in the Updates tab, away from personal chats (D-0016 §F).
 */
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
    text: "WhatsApp announced ads in Status, in its Updates tab.",
    source: "https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/",
  },
];

const STEPS: readonly { title: string; text: string }[] = [
  {
    title: "Join",
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

/** Why our.one exists (D-0016 §E), in the maintainer's voice: the section's first words. */
export const REASON_LEAD = "The people make the network.";
export const REASON =
  "You bring the friendships, the conversations and the reasons to come back, so you should have a say in what it becomes. A simple feed is where our.one starts. The bigger purpose is a network whose people choose who looks after it.";

const QUESTIONS: readonly { question: string; answer: string }[] = [
  {
    question: "Is it free?",
    answer: "Yes. Today I pay the bills, and every cost is public.",
  },
  {
    question: "What if my friends aren't on it?",
    answer:
      "At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together.",
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
      "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all.",
  },
  {
    question: "What's a maintainer?",
    answer: `The one who keeps it running. Today that's me, and today I also hold everything. After ${THRESHOLD}, I hand over the domain, the data and the right to replace me to a not-for-profit body of its members.`,
  },
];

/** The close (D-0016 §B), only while the form is shown. */
export const CLOSE_HEADING = "Who would you like to hear from?";
export const CLOSE_LINE = "Join, then send them an invite.";

export function FrontPage({ count, joining, seatsOpen, seatsWaiting = null, member = false }: FrontPageProps) {
  const seats = seatsOpen === null ? null : seatLine(seatsOpen);
  const label = joining ? joinLabel(seatsOpen, seatsWaiting) : JOIN_LABEL;
  return (
    <article className={`${styles.front} front-wide`}>
      {/* The first screen (SPEC §18.16 item 1): what it is, one action, a
          picture of the product, and the promise. In this order on a
          phone; from 900px the picture stands on the right, beside the
          other three. */}
      <div className={styles.fold}>
        <header className={styles.hero}>
          <h1 className={`headline ${styles.frontHeadline}`}>
            <span>{HEADLINE[0]}</span> <span>{HEADLINE[1]}</span>
          </h1>
          <p className={`lede ${styles.frontLede}`}>{LEDE}</p>
        </header>

        <section className={styles.getIn} aria-labelledby="front-get-in">
          <h2 id="front-get-in" className="visually-hidden">
            {JOIN_LABEL}
          </h2>
          {member ? (
            <MemberJoin />
          ) : joining ? (
            <>
              <GetInForm label={label} />
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
              <p className={styles.haveInvite}>{INVITE_CLOSED_LINE}</p>
            </>
          )}
        </section>

        <FeedPreview />

        <figure className={styles.pledge}>
          <span className={styles.pledgeFace} aria-hidden="true">
            {MAINTAINER[0]}
          </span>
          <blockquote className={styles.pledgeWords}>
            <p>
              I&apos;ll never sell our.one. When {THRESHOLD}{" "}
              people have joined, I hand over its domain, its data and the right to replace me to a{" "}
              <span className={styles.nowrap}>not-for-profit</span> body of its members. Until then, I hold all three.
            </p>
          </blockquote>
          <figcaption className={styles.pledgeBy}>
            {MAINTAINER}, maintainer ·{" "}
            <a href="#front-runs" className={styles.pledgeLink}>
              How that works
            </a>
          </figcaption>
        </figure>
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
              {", pages 8 and 9, citing Meta's own figures."}
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
        <div className={styles.reason}>
          <p className={styles.reasonLead}>{REASON_LEAD}</p>
          <p className={styles.reasonText}>{REASON}</p>
        </div>
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
              days&apos; notice. In Settings, you can download your profile, posts, replies and connections, and delete it all. If your account is suspended, write to us and we will do it for you.
            </p>
            <p>
              When {THRESHOLD}{" "}
              people have joined, I hand over our.one&apos;s domain, its data and
              the right to replace whoever runs it to a not-for-profit body of its
              members, founded by their vote.
            </p>
            <p>
              Today I hold the domain, the data and the keys. The members&apos; body has not been formed, and the handover has not happened.
            </p>
            {count !== null ? <p className={styles.count}>{member ? memberCountLine(count) : countLine(count)}</p> : null}
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

      {joining && !member ? (
        <section className={styles.close} aria-labelledby="front-close">
          <h2 id="front-close">{CLOSE_HEADING}</h2>
          <p className={styles.closeLine}>{CLOSE_LINE}</p>
          <a href="#front-get-in" className="btn btn--primary btn--large">
            {label}
          </a>
        </section>
      ) : null}
    </article>
  );
}
