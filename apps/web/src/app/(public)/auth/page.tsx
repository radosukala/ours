"use client";

/**
 * /auth#<token> (SPEC §8): the page every emailed link opens.
 *
 * The token travels in the fragment, which browsers never send to a
 * server, so a mail scanner that fetches the link uses nothing up. This
 * page reads it, takes it out of the address bar and history at once, and
 * passes it to one server action. It runs once, even when React mounts
 * effects twice in development.
 *
 * A browser already signed in as another account is not switched (SPEC
 * §17 item 5): the link is left unused, and the page offers to sign out,
 * after which the person opens the link from their email again.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(app)/settings/actions";
import { Button, LinkButton } from "@/components/Button";
import { openEmailLinkAction } from "./actions";

const FAILED = "Something went wrong. Please try again.";

type Refusal = { error: string; signedInAs: string | null };

export default function AuthPage() {
  const router = useRouter();
  const started = useRef(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.replace(/^#/, "");
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        const result = await openEmailLinkAction(token);
        if (result.ok) {
          router.replace(result.next);
        } else {
          setRefusal({
            error: result.error,
            signedInAs: "signedInAs" in result ? result.signedInAs : null,
          });
        }
      } catch {
        setRefusal({ error: FAILED, signedInAs: null });
      }
    })();
  }, [router]);

  if (refusal?.signedInAs) {
    return (
      <div className="stack stack--lg">
        <div className="stack">
          <h1 className="headline">You&apos;re already signed in</h1>
          <p className="lede" role="alert">
            {refusal.error}
          </p>
          <p className="muted">
            The link hasn&apos;t been used. It still works until it expires.
          </p>
        </div>
        <div className="stack">
          <form action={signOutAction}>
            <Button type="submit" kind="primary">
              Sign out of @{refusal.signedInAs}
            </Button>
          </form>
          <div>
            <LinkButton href="/home" kind="outline">
              Stay signed in
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  if (refusal) {
    return (
      <div className="stack stack--lg">
        <div className="stack">
          <h1 className="headline">This link can&apos;t be used</h1>
          <p className="lede" role="alert">
            {refusal.error}
          </p>
        </div>
        <div>
          <LinkButton href="/signin" kind="primary">
            Get a new sign-in link
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1 className="headline">Signing you in…</h1>
      <p className="lede" role="status">
        One moment.
      </p>
      <noscript>
        <p className="notice notice--error">
          Signing in needs JavaScript. Turn it on and open the link again.
        </p>
      </noscript>
    </div>
  );
}
