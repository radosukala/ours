/**
 * /join — choose a name and a username after following an emailed join
 * link (SPEC §8 "Join from an invite", step 3). /auth sets the signed
 * `ours_join` cookie and sends the person here.
 *
 * While no data controller is named, no account can be created, and the
 * page says so instead of showing the form (SPEC §8 "Controller gate").
 */
import { DEFAULT_INVITES } from "@/core/config";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { accountCreationOpen } from "@/core/config";
import { getDb } from "@/core/db";
import { describePendingJoin, JOIN_EXPIRED } from "@/core/invites";
import { LinkButton } from "@/components/Button";
import { readJoinCookie } from "@/web/session";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = {
  title: "Join",
  robots: { index: false, follow: false },
};

export default async function JoinPage() {
  // Per request, never prerendered: whether accounts can be created is
  // read from the environment when the page is asked for, not at build.
  await connection();
  if (!accountCreationOpen()) {
    return (
      <section className="stack stack--lg">
        <h1 className="headline">Join our.one</h1>
        <p className="notice">
          our.one isn&apos;t open for new accounts yet.{" "}
          <Link href="/privacy">Read why in the privacy notice.</Link>
        </p>
      </section>
    );
  }

  const cookie = await readJoinCookie();
  const pending = cookie ? await describePendingJoin(getDb(), cookie, new Date()) : null;

  if (!pending) {
    return (
      <section className="stack stack--lg">
        <h1 className="headline">Join our.one</h1>
        <p className="lede">{JOIN_EXPIRED}</p>
        <div>
          <LinkButton href="/signin" kind="outline">
            Sign in instead
          </LinkButton>
        </div>
      </section>
    );
  }

  return (
    <section className="stack stack--lg">
      <div className="stack">
        <h1 className="headline">Join our.one</h1>
        {pending.seat ? (
          <p className="lede">
            {`You took a seat on our.one. Choose your name and username, then bring your people: you'll have ${DEFAULT_INVITES} invites.`}
          </p>
        ) : (
          <p className="lede">
            {pending.inviter.displayName} (@{pending.inviter.handle}) invited you.
            When you join, you&apos;re friends.
          </p>
        )}
        <p className="muted small">Joining as {pending.email}</p>
      </div>
      <JoinForm />
    </section>
  );
}
