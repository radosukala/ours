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
 * - signed out, no data controller named: "OURS isn't open for new
 *   accounts yet." and no form;
 * - signed out: an email field.
 *
 * The code is in the address, so the page is never indexed, and the
 * referrer policy (next.config.ts) keeps it from leaking to other sites.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/core/db";
import { INVITE_UNUSABLE, inviteForViewer } from "@/core/invites";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { getViewer } from "@/web/viewer";
import { AddFriendForm, JoinRequestForm } from "./InviteForms";

export const metadata: Metadata = {
  title: "Invite",
  robots: { index: false, follow: false },
};

const PITCH =
  "A home for friends and people you choose to follow. Their posts, in order, with an end when you're caught up.";

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
            {viewer ? "Go home" : "About OURS"}
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

  const heading = `${inviter.displayName} (@${inviter.handle}) invited you to connect on OURS`;

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
            OURS isn&apos;t open for new accounts yet.{" "}
            <Link href="/privacy">Read why in the privacy notice.</Link>
          </p>
          <p className="muted small">
            Already on OURS? <Link href="/signin" className="link">Sign in</Link>, then
            open this link again.
          </p>
        </>
      ) : null}

      {state.kind === "can_join" ? (
        <>
          <p className="lede">{PITCH}</p>
          <JoinRequestForm code={code} />
          <p className="muted small">
            Already on OURS? <Link href="/signin" className="link">Sign in</Link>, then
            open this link again.
          </p>
        </>
      ) : null}
    </section>
  );
}
