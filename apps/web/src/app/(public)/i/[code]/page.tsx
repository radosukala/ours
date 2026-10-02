/**
 * /i/<code> — an invite link (SPEC §8 "Join from an invite").
 *
 * The core decides what this page shows (`inviteForViewer`); the page only
 * renders it:
 *
 * - not usable (unknown, used, expired, revoked, inviter suspended or gone,
 *   or a block either way): one generic message;
 * - signed in: "Add <Name> as a friend", or "You're already friends", or
 *   "This is your own invite" with its note;
 * - signed out, no data controller named: "our.one isn't open for new
 *   accounts yet." and no form;
 * - signed out: an email field, then, while joining is open as the front
 *   page counts it (a client-address header named as well), "Free to
 *   join." and a link to the promise on the front page.
 *
 * A signed-out visitor reads the front page's lede, word for word, as
 * what our.one is (D-0016 §I). Accepting an invite makes the two friends,
 * as before, and nothing more (D-0016 §N).
 *
 * The code is in the address, so the page is never indexed, and the
 * referrer policy (next.config.ts) keeps it from leaking to other sites.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { clientIpHeader } from "@/core/config";
import { getDb } from "@/core/db";
import { INVITE_UNUSABLE, inviteForViewer } from "@/core/invites";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { LEDE } from "@/components/public/lede";
import styles from "@/components/public/public.module.css";
import { getViewer } from "@/web/viewer";
import { AddFriendForm, JoinRequestForm } from "./InviteForms";

export const metadata: Metadata = {
  title: "Invite",
  robots: { index: false, follow: false },
};

/** What our.one is: the front page's lede (D-0016 §I). */
const PITCH = LEDE;

function Inviter({ displayName, handle }: { displayName: string; handle: string }) {
  return <Avatar name={displayName} handle={handle} size={80} />;
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const viewer = await getViewer();
  const state = await inviteForViewer(getDb(), {
    code,
    viewerId: viewer?.id ?? null,
    now: new Date(),
  });

  if (state.kind === "unusable") {
    return (
      <section className="stack stack--lg">
        <h1 className="headline">{INVITE_UNUSABLE}</h1>
        <div>
          <LinkButton href={viewer ? "/home" : "/"} kind="outline">
            {viewer ? "Go home" : "About our.one"}
          </LinkButton>
        </div>
      </section>
    );
  }

  const { inviter } = state.invite;

  if (state.kind === "own") {
    return (
      <section className="stack stack--lg">
        <Inviter {...inviter} />
        <h1 className="headline">This is your own invite</h1>
        {state.note ? (
          <p className="lede">
            Your note: <strong>{state.note}</strong>
          </p>
        ) : null}
        <p className="muted">
          Send this link to the person you made it for. When they join, you
          become friends.
        </p>
        <div>
          <LinkButton href="/people/invites" kind="outline">
            Your invites
          </LinkButton>
        </div>
      </section>
    );
  }

  const heading = `${inviter.displayName} (@${inviter.handle}) invited you to connect on our.one`;

  return (
    <section className="stack stack--lg">
      <Inviter {...inviter} />
      <h1 className="headline">{heading}</h1>

      {state.kind === "already_friends" ? (
        <>
          <p className="notice">You&apos;re already friends.</p>
          <div>
            <LinkButton href={`/u/${encodeURIComponent(inviter.handle)}`} kind="outline">
              See {inviter.displayName}&apos;s profile
            </LinkButton>
          </div>
        </>
      ) : null}

      {state.kind === "can_add" ? (
        <AddFriendForm code={code} name={inviter.displayName} />
      ) : null}

      {state.kind === "closed" ? (
        <>
          <p className="lede">{PITCH}</p>
          <p className="notice">
            our.one isn&apos;t open for new accounts yet.{" "}
            <Link href="/privacy">Read why in the privacy notice.</Link>
          </p>
          <p className="muted small">
            Already on our.one? <Link href="/signin" className="link">Sign in</Link>, then
            open this link again.
          </p>
        </>
      ) : null}

      {state.kind === "can_join" ? (
        <>
          <p className="lede">{PITCH}</p>
          <JoinRequestForm code={code} />
          {/* Only while joining is open as the front page counts it: in
              production without the client-address header, the form
              refuses and the front page says "Joining opens soon." The
              link is the card's (text colour, underlined, 44px on touch). */}
          {clientIpHeader() !== null ? (
            <p className="muted small">
              Free to join.{" "}
              <Link href="/feed#front-runs" className={styles.pledgeLink}>
                The promise behind our.one
              </Link>
            </p>
          ) : null}
          <p className="muted small">
            Already on our.one? <Link href="/signin" className="link">Sign in</Link>, then
            open this link again.
          </p>
        </>
      ) : null}
    </section>
  );
}
