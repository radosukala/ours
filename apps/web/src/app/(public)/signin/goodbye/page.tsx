/**
 * Where /settings/delete ends (SPEC §8 "Export and delete"). Public,
 * because the account it belonged to no longer exists.
 */
import type { Metadata } from "next";
import { LinkButton } from "@/components/Button";

export const metadata: Metadata = { title: "Goodbye" };

export default function GoodbyePage() {
  return (
    <div className="stack stack--lg">
      <div className="stack">
        <h1 className="headline">Goodbye</h1>
        <p className="lede">Your account and everything you posted is gone.</p>
        <p className="muted">
          You&apos;ve been signed out. If someone invites you again, you can
          join with a new account.
        </p>
      </div>
      <div>
        <LinkButton href="/" kind="outline">
          Go to the front page
        </LinkButton>
      </div>
    </div>
  );
}
