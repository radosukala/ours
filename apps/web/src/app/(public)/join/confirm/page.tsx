/**
 * /join/confirm (SPEC §17 item 1): a join link was opened by someone who
 * already has an account. They are signed in, and nothing else has
 * happened. This page asks "Add <Name> (@handle) as a friend?" with Add
 * and Not now; only Add applies the invite.
 *
 * The invite comes from the signed `ours_invite` cookie (15 minutes), and
 * counts only for the account it was set for. Anything else (no cookie,
 * another account, an invite no longer usable) gets the one generic
 * sentence.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { inviteOfferFromCookie } from "@/core/auth";
import { getDb } from "@/core/db";
import {
  INVITE_UNUSABLE,
  type InvitePageState,
  inviteOfferForViewer,
} from "@/core/invites";
import { Avatar } from "@/components/Avatar";
import { LinkButton } from "@/components/Button";
import { readInviteCookie } from "@/web/session";
import { getViewer } from "@/web/viewer";
import { ConfirmForms } from "./ConfirmForms";

export const metadata: Metadata = {
  title: "Add a friend",
  robots: { index: false, follow: false },
};

export default async function ConfirmInvitePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");

  const now = new Date();
  const offer = inviteOfferFromCookie(await readInviteCookie(), now);
  const state: InvitePageState =
    offer && offer.accountId === viewer.id
      ? await inviteOfferForViewer(getDb(), {
          inviteId: offer.inviteId,
          viewerId: viewer.id,
          now,
        })
      : { kind: "unusable" };

  if (state.kind === "can_add") {
    const { inviter } = state.invite;
    return (
      <section className="stack stack--lg">
        <Avatar name={inviter.displayName} handle={inviter.handle} size={80} />
        <div className="stack">
          <h1 className="headline">
            Add {inviter.displayName} (@{inviter.handle}) as a friend?
          </h1>
          <p className="lede">
            You opened an invite link from @{inviter.handle}. You&apos;re signed
            in, and nothing else has happened yet.
          </p>
          <p className="muted">
            If you add them, you&apos;re friends: each of you sees the
            other&apos;s posts for friends.
          </p>
        </div>
        <ConfirmForms />
      </section>
    );
  }

  if (state.kind === "already_friends") {
    const { inviter } = state.invite;
    return (
      <section className="stack stack--lg">
        <h1 className="headline">
          You&apos;re already friends with {inviter.displayName} (@{inviter.handle})
        </h1>
        <div>
          <LinkButton href="/home" kind="outline">
            Open your feed
          </LinkButton>
        </div>
      </section>
    );
  }

  return (
    <section className="stack stack--lg">
      <h1 className="headline">{INVITE_UNUSABLE}</h1>
      <div>
        <LinkButton href="/home" kind="outline">
          Open your feed
        </LinkButton>
      </div>
    </section>
  );
}
