/**
 * /privacy (SPEC §2 rule 6, §5, §10, §17 item 17): built from the
 * configuration and the data model. Who is responsible (or that nobody is
 * named yet, in which case nobody new can join); what is kept, table by
 * table, in plain words, why and for how long; who else receives it; your
 * rights; how to reach the controller.
 *
 * Rendered per request, because the controller and the mail transport come
 * from the environment. It names no supervisory authority: no record states
 * the controller's jurisdiction yet (FOUNDING-AUTHORITY §3 leaves it to be
 * confirmed), so it says "the data protection authority where you live".
 *
 * The email-provider line comes from `emailSending`, the same test
 * `sendMail` makes and /power reads, so Resend is named only where email
 * is actually sent through it (the final verification's honesty-6/7).
 * Download and deletion work while an account is active; a suspended
 * person writes to the controller (honesty-2).
 */
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/public/public.module.css";
import {
  controller,
  EMAIL_TOKEN_TTL_MINUTES,
  PENDING_JOIN_TTL_MINUTES,
  SESSION_TTL_DAYS,
} from "@/core/config";
import { EMAIL_PROVIDER_WORDS, emailSending } from "@/core/transparency";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What OURS keeps about you, why, for how long, and who else receives it.",
};

type Kept = { title: string; what: string; why: string; howLong: string };

const NOT_REMOVED_YET = "They are not removed automatically yet.";

/** One entry per table in the data model (SPEC §5), in plain words. */
const KEPT: Kept[] = [
  {
    title: "Your account",
    what: "Your email address, handle, display name and bio; who invited you; your settings (whether you accept followers, whether you get the weekly email); how many invites you have left; when you joined and when you confirmed you're 18 or older; when you last opened your feed and your notifications; and whether you are an administrator or suspended.",
    why: "To sign you in, show your profile to the people you're connected with, and mark where you were caught up.",
    howLong: "Until you delete your account.",
  },
  {
    title: "Sign-in and join links",
    what: "Your email address, a scrambled copy of the link's code (never the code itself), and when the link was made, when it expires and when it was used.",
    why: `So each link works once, for ${EMAIL_TOKEN_TTL_MINUTES} minutes.`,
    howLong: `${NOT_REMOVED_YET} They are deleted when you delete your account.`,
  },
  {
    title: "Joining in progress",
    what: "Your email address and which invite you're using.",
    why: `To hold your place for up to ${PENDING_JOIN_TTL_MINUTES} minutes while you choose a handle.`,
    howLong: `${NOT_REMOVED_YET} It is deleted when you delete your account.`,
  },
  {
    title: "Sessions",
    what: "A random code for each browser you're signed in on, and when it started, when it ends and whether you signed out. No IP address and no device details.",
    why: "To keep you signed in.",
    howLong: `A session works for up to ${SESSION_TTL_DAYS} days. The records go when you delete your account.`,
  },
  {
    title: "Invites",
    what: "A scrambled copy of each invite's code, your private note (\"for Anna\"), when it was made, used or revoked, and who joined with it.",
    why: "So an invite works once, and you can see who joined with yours.",
    howLong: "Until you delete your account.",
  },
  {
    title: "Connections",
    what: "Friend requests and their answers, friendships, follows, blocks and mutes, each with a date.",
    why: "They decide who sees what.",
    howLong: "Until you end them, or until either person deletes their account.",
  },
  {
    title: "Posts, replies and likes",
    what: "What you write, who it's for and when; which posts you like; and, if something was removed, the category and reason.",
    why: "To show them to the people you chose.",
    howLong: "Until you delete them, or your account.",
  },
  {
    title: "Notifications",
    what: "What happened (a request, a reply, a like, a new follower and so on), who did it, when, and when you read it.",
    why: "To tell you.",
    howLong: "Until you delete your account, or the other person deletes theirs.",
  },
  {
    title: "Reports",
    what: "Who reported what, the category and any details they gave, and the decision with its reasons and who made it.",
    why: "So a person can act on reports and explain each decision.",
    howLong: `Kept as the record of each decision. ${NOT_REMOVED_YET} If the person who reported deletes their account, their name is removed from the report.`,
  },
  {
    title: "Limits on repeated actions",
    what: "Your account's id, or a scrambled code made from your email or network address, and a time. Not the address itself. A limit on one invite link holds that invite's id, and a limit on one join in progress holds that join's id.",
    why: "To stop floods of emails, posts, replies, requests, invites and reports.",
    howLong: "Entries older than 24 hours are removed whenever a new one is counted.",
  },
  {
    title: "Email records",
    what: "Which kind of email was sent to which account (a sign-in or join link, the weekly email, or a notice such as the reasons for a suspension), whether it went, and when. Not your address.",
    why: "To see whether emails arrive.",
    howLong: `${NOT_REMOVED_YET} When you delete your account, they no longer point to it.`,
  },
  {
    title: "Weekly email record",
    what: "For each week, whether your weekly email was sent, skipped or failed.",
    why: "So you get at most one a week.",
    howLong: "Until you delete your account.",
  },
  {
    title: "Test outbox",
    what: "Only on a server set to write email to a test outbox instead of sending it: each email's address, subject and text.",
    why: "To build and test OURS without emailing anyone.",
    howLong: `${NOT_REMOVED_YET} What was written to your address is deleted when you delete your account.`,
  },
];

/**
 * Who delivers email, from this server's configuration (SPEC §17 item 17),
 * by the same test sendMail makes (`emailSending`).
 */
function emailProvider(): string {
  return EMAIL_PROVIDER_WORDS[emailSending()];
}

export default function PrivacyPage() {
  const named = controller();

  return (
    <article className={styles.page}>
      <h1 className="headline">Privacy</h1>
      <p className="lede">
        What OURS keeps about you, why, for how long, and who else receives
        it.
      </p>
      <p className="notice">
        OURS is not deployed yet. This notice describes what it keeps when
        it runs.
      </p>

      <section aria-labelledby="privacy-who">
        <h2 id="privacy-who">Who is responsible</h2>
        {named ? (
          <p>
            The data controller — the person or body answerable for your
            data — is <strong>{named.name}</strong>, as stated in this
            server&apos;s configuration. Write to{" "}
            <a href={`mailto:${named.email}`}>{named.email}</a>.
          </p>
        ) : (
          <p>
            The data controller is not yet named — no new accounts can be
            created until it is.
          </p>
        )}
      </section>

      <section aria-labelledby="privacy-kept">
        <h2 id="privacy-kept">What is kept, why, and for how long</h2>
        <ul className={styles.items}>
          {KEPT.map((k) => (
            <li key={k.title} className={styles.item}>
              <h3 className={styles.itemTitle}>{k.title}</h3>
              <dl className={styles.facts}>
                <dt>What</dt>
                <dd>{k.what}</dd>
                <dt>Why</dt>
                <dd>{k.why}</dd>
                <dt>How long</dt>
                <dd>{k.howLong}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <p>
          Three cookies, all needed for the site to work: one keeps you
          signed in; one holds your place for up to {PENDING_JOIN_TTL_MINUTES}{" "}
          minutes while you join; and one holds, for up to 15 minutes, an
          invite you opened while you already had an account, until you
          choose whether to add that person. No other cookies, no analytics,
          no tracking, and nothing is loaded from other sites.
        </p>
      </section>

      <section aria-labelledby="privacy-others">
        <h2 id="privacy-others">Who else receives your data</h2>
        <dl className={styles.facts}>
          <dt>People on OURS</dt>
          <dd>
            Anyone signed in whom you haven&apos;t blocked, and who
            hasn&apos;t blocked you, can see your name, handle and bio. Your
            posts are seen only by the audience you choose, your replies by
            whoever can see the post, and your likes only by the post&apos;s
            author.
          </dd>
          <dt>The administrator</dt>
          <dd>
            Reads what is reported — a post, a reply or a profile — whoever
            it was shared with, sees who reported it, and decides what
            happens. No administrator exists until OURS is deployed; the
            founder will be the only one.
          </dd>
          <dt>Whoever holds an invite link</dt>
          <dd>
            Sees the name and handle of the person who made it, whether or
            not they have an account.
          </dd>
          <dt>Email provider</dt>
          <dd>{emailProvider()}</dd>
          <dt>Hosting</dt>
          <dd>none yet — OURS is not deployed.</dd>
        </dl>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your rights</h2>
        <ul className="prose">
          <li>
            <strong>See and take your data.</strong> While your account is
            active, download everything in{" "}
            <Link href="/settings/export">Settings → Export</Link>.
          </li>
          <li>
            <strong>Correct it.</strong> Change your name and bio in{" "}
            <Link href="/settings">Settings</Link>.
          </li>
          <li>
            <strong>Delete it.</strong> While your account is active, delete
            it in <Link href="/settings/delete">Settings → Delete</Link>.
            Your posts, replies, likes, connections and sessions go with it.
          </li>
          <li>
            <strong>If your account is suspended,</strong> you can&apos;t
            sign in to do either: write to the controller
            {named ? (
              <>
                {" "}
                at <a href={`mailto:${named.email}`}>{named.email}</a>
              </>
            ) : (
              " (not yet named)"
            )}{" "}
            to get a copy or have it deleted.
          </li>
          <li>
            <strong>Stop the weekly email</strong> in Settings, or with the
            link at the bottom of any weekly email.
          </li>
          <li>
            <strong>Ask, or object.</strong> For anything else about your
            data, write to the controller
            {named ? (
              <>
                {" "}
                at <a href={`mailto:${named.email}`}>{named.email}</a>.
              </>
            ) : (
              " (not yet named)."
            )}
          </li>
          <li>
            <strong>Complain.</strong> You can complain to the data
            protection authority where you live.
          </li>
        </ul>
      </section>

      <section aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Contact</h2>
        {named ? (
          <p>
            {named.name}: <a href={`mailto:${named.email}`}>{named.email}</a>
          </p>
        ) : (
          <p>
            Not yet named — no new accounts can be created until it is.
          </p>
        )}
      </section>
    </article>
  );
}
