"use client";

/**
 * /auth#<token> (SPEC §8): the page every emailed link opens.
 *
 * The token travels in the fragment, which browsers never send to a
 * server, so a mail scanner that fetches the link uses nothing up. This
 * page reads it, takes it out of the address bar and history at once, and
 * hands it to one server action. It runs once, even when React mounts
 * effects twice in development.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LinkButton } from "@/components/Button";
import { openEmailLinkAction } from "./actions";

const FAILED = "Something went wrong. Please try again.";

export default function AuthPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

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
          setError(result.error);
        }
      } catch {
        setError(FAILED);
      }
    })();
  }, [router]);

  if (error) {
    return (
      <div className="stack stack--lg">
        <div className="stack">
          <h1 className="headline">This link can&apos;t be used</h1>
          <p className="lede" role="alert">
            {error}
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
