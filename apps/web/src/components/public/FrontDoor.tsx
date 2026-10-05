/**
 * The front door, `/` (D-0020 §A; SPEC §18.19). The words are door.ts's,
 * in the order a stranger needs them:
 *
 * - the first screen (D-0024 §A): the message, what it is, the promise
 *   with the count against its threshold, what holds today, the form, and
 *   the builders' entrance as a text link;
 * - the idea: AI is changing who can build, so let's change who has a say;
 * - the projects: the feed first, then two labelled possibilities;
 * - what "ours" means, as the common agreement proposes it, with an
 *   illustration that says what it is;
 * - the builders' invitation: an idea first, the line for a coding agent,
 *   and what passing the check means;
 * - in the open: what is built, a draft, or not built;
 * - your part: the feed, a need, or an idea.
 *
 * The feed's panel carries its join form, the count and the lines under
 * them, the same as /feed's first screen: /contract counts "the number on
 * the front page", and the seat email says to ask again there.
 *
 * Presentational: src/app/(public)/page.tsx reads whether joining is open,
 * the count, the seats and the proposals address, so every state can be
 * rendered without a database. A number that could not be read is null,
 * and its line is left out. The feed's own page is /feed.
 */
import Link from "next/link";
import { OPEN_CODE_URL } from "@/components/RightColumn";
import { AGENT_LINE } from "@/core/kit-info";
import { Continuity } from "./Continuity";
import { CopyLine } from "./CopyLine";
import { Diagram } from "./Diagram";
import { DraftButton } from "./Draft";
import { CaughtUpMarker } from "@/components/Marker";
import { NEW_POSTS, PREVIEW_CAPTION, PREVIEW_LAST_VISIT, PREVIEW_NOW, SEEN_POST } from "./FeedPreview";
import { FirstScreenForm } from "./FirstScreenForm";
import { GetInForm } from "./GetInForm";
import {
  AGENT_FOOT,
  AGENT_HEADING,
  AUDIENCE_NOTE,
  AUDIENCE_QUOTE,
  BUILD_EXCHANGE,
  BUILD_HEADING,
  BUILD_LEDE,
  BUILD_LIMIT,
  BUILD_PAY,
  BUILD_STEPS,
  BUILD_TERMS,
  DOOR_EYEBROW,
  DOOR_HEADLINE,
  DOOR_WHAT,
  DOOR_STATUS,
  ENTRANCES,
  IDEA_CLOSE,
  IDEA_HEADING,
  IDEA_TEXT,
  MEMBER_JOIN,
  OPEN_FOOT,
  OPEN_HEADING,
  OPEN_INTRO,
  OPEN_ROWS,
  OURS_HEADING,
  OURS_LEDE,
  OURS_RIGHTS,
  OURS_STATUS,
  PART_HEADING,
  PART_INTRO,
  PART_OPTIONS,
  POSSIBILITIES,
  STRIP_LINE,
  WORK_NOTE,
  WORK_ROWS,
  partFoot,
} from "./door";
import styles from "./door.module.css";
import { MAINTAINER, THRESHOLD } from "./handover";
import { countLine, FREE_LINE, INVITE_CLOSED_LINE, joinLabel, memberCountLine, ofThreshold, seatLine } from "./join";
import { LEDE } from "./lede";
import { MemberJoin } from "./MemberJoin";
import { ServiceTabs, type Tab } from "./ServiceTabs";

export type FrontDoorProps = {
  /**
   * Whether the join form is shown: a data controller is named and the
   * client-address header is decided (`accountCreationOpen()` and
   * `clientIpHeader()`, the same gates as joining and as /feed).
   */
  joining: boolean;
  /** PROPOSALS_EMAIL, or null while it is unset. */
  email: string | null;
  /** The public count (`memberCount`), or null when it could not be read. */
  count?: number | null;
  /** Seats open now, or null when that could not be read (or joining is off). */
  seatsOpen?: number | null;
  /** Addresses waiting in line, or null when that could not be read (or joining is off). */
  seatsWaiting?: number | null;
  /** A member is shown their feed where a visitor is asked to join (D-0023 §C). */
  member?: boolean;
  /** How many needs have been named (D-0024 §C), or null when that could not be read. */
  needs?: number | null;
};

const ROMAN = ["i.", "ii.", "iii."] as const;

/** A heading written on several lines, read as one sentence. */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={line} className={styles.line}>
          {line}
          {i < lines.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

function External({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={className} rel="noopener noreferrer" target="_blank">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function FeedPanel({ joining, count, seatsOpen, seatsWaiting, member }: Omit<FrontDoorProps, "email">) {
  const seats = joining && seatsOpen !== null && seatsOpen !== undefined ? seatLine(seatsOpen) : null;
  return (
    <div className={styles.possibility}>
      <div className={styles.possibilityText}>
        <p className={styles.label}>The first project</p>
        <h3 className={styles.possibilityHeading}>
          <span className={styles.line}>Just your people. </span>
          <span className={styles.line}>Then you&apos;re done.</span>
        </h3>
        <p className={styles.possibilityBody}>{LEDE}</p>
        <div className={styles.join}>
          {member ? (
            <MemberJoin />
          ) : joining ? (
            <>
              <GetInForm label={joinLabel(seatsOpen ?? null, seatsWaiting ?? null)} />
              {seats ? <p className={styles.joinStrong}>{seats}</p> : null}
              <p className={styles.joinStrong}>{FREE_LINE}</p>
              <p className={styles.joinSmall}>
                {"We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in "}
                <Link href="/privacy">Privacy</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="notice">Joining opens soon.</p>
              <p className={styles.joinSmall}>{INVITE_CLOSED_LINE}</p>
            </>
          )}
          {count !== null && count !== undefined ? (
            <p className={styles.count}>{member ? memberCountLine(count) : countLine(count)}</p>
          ) : null}
        </div>
        <p>
          <Link href="/feed" className={styles.textLink}>
            More about the feed<span aria-hidden="true"> ↗</span>
          </Link>
        </p>
      </div>
      <div className={styles.slip}>
        <div className={styles.slipHead}>
          <strong>Your people</strong>
          <span>{PREVIEW_CAPTION}</span>
        </div>
        {NEW_POSTS.slice(0, 2).map((post) => (
          <div key={post.handle} className={styles.samplePost}>
            <span className={styles.avatar} aria-hidden="true">
              {post.name[0]}
            </span>
            <div>
              <strong>{post.name}</strong>
              <p>{post.text}</p>
            </div>
          </div>
        ))}
        {/* The app's own marker, above a post from before the last visit,
            as the app draws it (D-0015 §K; the verification of M-0017). */}
        <div className={styles.caughtUp}>
          <CaughtUpMarker since={PREVIEW_LAST_VISIT} now={PREVIEW_NOW} />
        </div>
        <div className={styles.samplePost}>
          <span className={styles.avatar} aria-hidden="true">
            {SEEN_POST.name[0]}
          </span>
          <div>
            <strong>{SEEN_POST.name}</strong>
            <p>{SEEN_POST.text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PossibilityPanel({ index }: { index: number }) {
  const p = POSSIBILITIES[index]!;
  return (
    <div className={styles.possibility}>
      <div className={styles.possibilityText}>
        <p className={styles.label}>{p.label}</p>
        <h3 className={styles.possibilityHeading}>
          <Lines lines={p.heading} />
        </h3>
        <p className={styles.possibilityBody}>{p.text}</p>
      </div>
      <div className={styles.slip}>
        <div className={styles.slipHead}>
          <strong>{p.card.title}</strong>
          <span>{p.card.tag}</span>
        </div>
        {p.id === "work" ? (
          <>
            <ul role="list" className={styles.workRows}>
              {WORK_ROWS.map((row) => (
                <li key={row}>
                  <span className={styles.paperDot} aria-hidden="true" />
                  {row}
                </li>
              ))}
            </ul>
            <p className={styles.slipNote}>{WORK_NOTE}</p>
          </>
        ) : (
          <>
            <p className={styles.letter}>&ldquo;{AUDIENCE_QUOTE}&rdquo;</p>
            <p className={styles.slipNote}>{AUDIENCE_NOTE}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function FrontDoor({ joining, email, count = null, seatsOpen = null, seatsWaiting = null, member = false, needs = null }: FrontDoorProps) {
  const heroSeats = joining && seatsOpen !== null ? seatLine(seatsOpen) : null;
  const tabs: Tab[] = [
    {
      id: "feed",
      label: "Your people",
      panel: <FeedPanel joining={joining} count={count} seatsOpen={seatsOpen} seatsWaiting={seatsWaiting} member={member} />,
    },
    ...POSSIBILITIES.map((p, i) => ({ id: p.id, label: p.tab, panel: <PossibilityPanel index={i} /> })),
  ];

  return (
    <div className={`wide ${styles.door}`}>
      {/* The first screen (D-0024 §A), in this order: the headline, what it
          is, the promise with the count against its threshold, what holds
          today, and one form; the builders' entrance as a text link; and the
          picture. On a wide screen the promise, the status and the form sit
          beside the headline (the grid's "act" area), so the form is in view
          without scrolling, and the picture is under what it is (the
          verification of M-0021, R2); the order in the page is the same. */}
      <div className={styles.wrap}>
        <section className={styles.hero} aria-labelledby="door-title">
          <p className={styles.eyebrow}>
            <span className={styles.dot} aria-hidden="true" />
            {DOOR_EYEBROW}
          </p>
          <h1 id="door-title" className={styles.headline}>
            <span className={styles.line}>{DOOR_HEADLINE[0]} </span>
            <span className={styles.line}>{DOOR_HEADLINE[1]} </span>
            <span className={styles.line}>
              {DOOR_HEADLINE[2]} <em className={styles.ours}>{DOOR_HEADLINE[3]}</em>
            </span>
          </h1>
          <p className={`${styles.lede} ${styles.heroWhat}`}>{DOOR_WHAT}</p>
          <div className={styles.heroAct}>
            {/* The promise, in the pledge's own words (D-0016 §C), with the
                public count against its threshold before it (D-0024 §B). */}
            <figure className={styles.heroPromise}>
              {count !== null ? <p className={styles.heroCount}>{ofThreshold(count)}</p> : null}
              <blockquote className={styles.heroPledge}>
                <p>
                  I&apos;ll never sell our.one. When {THRESHOLD}{" "}
                  people have joined, I hand over its domain, its data and the right to replace me to a{" "}
                  <span className={styles.nowrap}>not-for-profit</span> body of its members. Until then, I hold all three.
                </p>
              </blockquote>
              <figcaption className={styles.heroPledgeBy}>
                {MAINTAINER}, maintainer ·{" "}
                <Link href="/contract" className={styles.heroPledgeLink}>
                  How that works
                </Link>
              </figcaption>
            </figure>
            <p className={styles.heroStatus}>
              {DOOR_STATUS} <a href="#open">See where it stands.</a>
            </p>
            {member ? (
              <div className={styles.heroJoin}>
                <MemberJoin />
              </div>
            ) : joining ? (
              <FirstScreenForm
                label={joinLabel(seatsOpen, seatsWaiting)}
                lines={heroSeats ? [heroSeats, FREE_LINE] : [FREE_LINE]}
                needs={needs}
              />
            ) : (
              <div className={styles.heroJoin}>
                <p className="notice">Joining opens soon.</p>
                <p className={styles.joinSmall}>{INVITE_CLOSED_LINE}</p>
              </div>
            )}
            <p className={styles.heroBuild}>
              <Link href="/build" className={styles.textLink}>
                {ENTRANCES.builders}
                <span aria-hidden="true"> ↗</span>
              </Link>
            </p>
          </div>
          <Diagram />
        </section>
        <div className={styles.strip}>
          <p>{STRIP_LINE}</p>
          <ul role="list" className={styles.values}>
            <li>
              <External href={OPEN_CODE_URL}>Open code</External>
            </li>
            <li>
              <Link href="/costs">
                Public costs<span aria-hidden="true"> ↗</span>
              </Link>
            </li>
            <li>
              <Link href="/agreement">
                A path to user control<span aria-hidden="true"> ↗</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <section id="idea" className={`${styles.section} ${styles.acid}`} aria-labelledby="idea-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>The moment we&apos;re in</p>
            <h2 id="idea-title">
              <Lines lines={IDEA_HEADING} />
            </h2>
          </div>
          <div className={styles.ideaText}>
            {IDEA_TEXT.map((t) => (
              <p key={t}>{t}</p>
            ))}
            <p className={styles.quoteLine}>
              <span className={styles.line}>{IDEA_CLOSE[0]} </span>
              <em className={`${styles.line} ${styles.serif}`}>{IDEA_CLOSE[1]}</em>
            </p>
          </div>
        </div>
      </section>

      <section id="projects" className={styles.section} aria-labelledby="projects-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>A first project. A wider possibility.</p>
            <h2 id="projects-title">
              <Lines lines={["Start with your people.", "Think beyond the feed."]} />
            </h2>
          </div>
          <div className={styles.projectsIntro}>
            <p className={styles.muted}>
              The feed is the first project. The other two are possibilities to talk about, not announced projects.
            </p>
            <p>Choose a part of your life. Imagine having a say in the software behind it.</p>
          </div>
          <ServiceTabs tabs={tabs} label="A part of your life" />
          <div className={styles.proof}>
            <div>
              <p className={styles.eyebrowSmall}>The first maintainer</p>
              <p className={styles.proofName}>{MAINTAINER}, the founder · unpaid, by choice</p>
            </div>
            <div>
              <p>
                The feed will run under the common agreement, which every service on our.one will sign. Its code and
                its costs are open. Today the founder holds its domain, its data and its keys.
              </p>
              <p className={styles.proofLinks}>
                <Link href="/projects" className={styles.textLink}>
                  Every project, and what it&apos;s held to<span aria-hidden="true"> ↗</span>
                </Link>
                <Link href="/contract" className={styles.textLink}>
                  What the feed&apos;s contract promises<span aria-hidden="true"> ↗</span>
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="ours" className={`${styles.section} ${styles.ourSection}`} aria-labelledby="ours-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>What we mean by ours</p>
            <h2 id="ours-title">
              <Lines lines={OURS_HEADING} />
            </h2>
          </div>
          <p className={styles.oursLede}>{OURS_LEDE}</p>
          <div className={styles.oursGrid}>
            <div>
              <p className={styles.state}>Proposed</p>
              <ol role="list" className={styles.rights}>
                {OURS_RIGHTS.map((r, i) => (
                  <li key={r.title}>
                    <span aria-hidden="true">{ROMAN[i]}</span>
                    <div>
                      <strong>{r.title}</strong>
                      <p>{r.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className={styles.oursStatus}>
                {OURS_STATUS} <Link href="/agreement">Read the common agreement.</Link>
              </p>
            </div>
            <Continuity />
          </div>
        </div>
      </section>

      <section id="build" className={`${styles.section} ${styles.builders}`} aria-labelledby="build-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>An invitation to builders</p>
            <h2 id="build-title">
              <Lines lines={BUILD_HEADING} />
            </h2>
          </div>
          <div className={styles.builderGrid}>
            <div>
              <p className={styles.builderLede}>{BUILD_LEDE}</p>
              <p className={`${styles.builderLede} ${styles.builderPay}`}>{BUILD_PAY}</p>
              <ul role="list" className={styles.terms}>
                {BUILD_TERMS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div className={styles.builderActions}>
                <DraftButton kind="idea" label="Draft an idea first" email={email} className={`${styles.btn} ${styles.btnAcid}`} />
                <Link href="/maintainers" className={styles.textLink}>
                  The maintainer&apos;s deal<span aria-hidden="true"> ↗</span>
                </Link>
              </div>
              <p className={styles.builderLimit}>{BUILD_EXCHANGE}</p>
            </div>
            <div>
              <div className={styles.agentBox}>
                <div className={styles.agentTop}>
                  <span>our.one / build kit</span>
                  <span>Instructions, rules and a check</span>
                </div>
                <div className={styles.agentBody}>
                  <h3>
                    <Lines lines={AGENT_HEADING} />
                  </h3>
                  <p className={styles.agentLine}>
                    <code>{AGENT_LINE}</code>
                  </p>
                  <div className={styles.agentActions}>
                    <CopyLine text={AGENT_LINE} className={`${styles.btn} ${styles.btnAcid} ${styles.btnSmall}`} />
                    <a href="/build.md">Read build.md</a>
                  </div>
                </div>
                <p className={styles.agentFoot}>{AGENT_FOOT}</p>
              </div>
              <ol role="list" className={styles.kitSteps}>
                {BUILD_STEPS.map((s, i) => (
                  <li key={s.title}>
                    <strong>
                      {i + 1}. {s.title}
                    </strong>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
              <p className={styles.builderLimit}>
                {BUILD_LIMIT} <Link href="/build">How building on our.one works.</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="open" className={styles.section} aria-labelledby="open-title">
        <div className={styles.wrap}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Built in the open</p>
            <h2 id="open-title">
              <Lines lines={OPEN_HEADING} />
            </h2>
          </div>
          <p className={styles.openIntro}>{OPEN_INTRO}</p>
          <ul role="list" className={styles.openRows}>
            {OPEN_ROWS.map((row) => (
              <li key={row.title} className={styles.openRow}>
                <p
                  className={`${styles.state} ${
                    row.state === "Draft" ? styles.stateDraft : row.state === "Not built yet" ? styles.stateFuture : ""
                  }`}
                >
                  {row.state}
                </p>
                <div>
                  <h3>{row.title}</h3>
                  <p className={styles.openText}>{row.text}</p>
                </div>
                <p className={styles.openDetail}>
                  {row.detail}{" "}
                  {row.title === "The feed" ? (
                    <>
                      <Link href="/feed">The feed&apos;s page</Link>
                      {" · "}
                      <External href={OPEN_CODE_URL}>Its code</External>
                      {" · "}
                      <Link href="/costs">Its costs</Link>
                    </>
                  ) : row.title === "The builder kit" ? (
                    <Link href="/build">Build on our.one</Link>
                  ) : row.state === "Draft" ? (
                    <Link href="/agreement">Read the draft</Link>
                  ) : (
                    <Link href="/power">Who controls what</Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <p className={styles.openFoot}>
            <span>{OPEN_FOOT}</span>
            <Link href="/power">Who holds the power today</Link>
          </p>
        </div>
      </section>

      <section id="part" className={`${styles.section} ${styles.part}`} aria-labelledby="part-title">
        <div className={styles.wrap}>
          <div className={styles.partIntro}>
            <h2 id="part-title">
              <span className={styles.line}>{PART_HEADING[0]} </span>
              <span className={styles.line}>
                make <em className={styles.ours}>ours</em>?
              </span>
            </h2>
            <p>
              {PART_INTRO.map((line) => (
                <span key={line} className={styles.line}>
                  {line}{" "}
                </span>
              ))}
            </p>
          </div>
          <div className={styles.partOptions}>
            <div className={styles.partOption}>
              <p className={styles.eyebrowSmall}>{PART_OPTIONS.feed.eyebrow}</p>
              <h3>{PART_OPTIONS.feed.title}</h3>
              <p>{PART_OPTIONS.feed.text}</p>
              <div className={styles.partAction}>
                {/* A member is shown their feed where a visitor is asked to join (D-0023 §C). */}
                <Link href={member ? "/home" : "/feed"} className={`${styles.btn} ${styles.btnSolid}`}>
                  {member ? MEMBER_JOIN.link : joining ? "Join the feed" : "See the feed"}
                  <span aria-hidden="true" className={styles.arrow}>
                    ↗
                  </span>
                </Link>
              </div>
              {joining || member ? null : <p className={styles.partNote}>Joining opens soon.</p>}
            </div>
            <div className={styles.partOption}>
              <p className={styles.eyebrowSmall}>{PART_OPTIONS.need.eyebrow}</p>
              <h3>{PART_OPTIONS.need.title}</h3>
              <p>{PART_OPTIONS.need.text}</p>
              <div className={styles.partAction}>
                <DraftButton kind="need" label="Draft a need" email={email} className={`${styles.btn} ${styles.btnSolid}`} />
              </div>
            </div>
            <div className={styles.partOption}>
              <p className={styles.eyebrowSmall}>{PART_OPTIONS.idea.eyebrow}</p>
              <h3>{PART_OPTIONS.idea.title}</h3>
              <p>{PART_OPTIONS.idea.text}</p>
              <div className={styles.partAction}>
                <DraftButton kind="idea" label="Draft an idea" email={email} className={styles.btn} />
                <Link href="/build" className={styles.textLink}>
                  Start with the kit<span aria-hidden="true"> ↗</span>
                </Link>
              </div>
            </div>
          </div>
          <p className={styles.partFoot}>{partFoot(email !== null)}</p>
        </div>
      </section>
    </div>
  );
}
