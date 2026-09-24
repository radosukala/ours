"use client";

/**
 * /unsubscribe: reads the token from the address's fragment (which never
 * reaches the server), removes it from the address bar and history, and
 * asks the server to stop the weekly email.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/web/actions";
import styles from "./public.module.css";

function readFragment(): string {
  const raw = window.location.hash.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Take the token out of the address bar and history. */
function clearFragment(): void {
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

type State =
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "refused"; message: string };

export function Unsubscribe({
  stop,
}: {
  stop: (token: string) => Promise<ActionResult>;
}) {
  const [state, setState] = useState<State>({ kind: "working" });
  // Read once: the fragment is cleared right after, and in development
  // React runs this effect twice.
  const token = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let latest = 0;

    // Only the answer to the most recent link is shown.
    const submit = (value: string) => {
      const call = ++latest;
      stop(value)
        .then((result) => {
          if (cancelled || call !== latest) return;
          setState(
            result.ok ? { kind: "done" } : { kind: "refused", message: result.error },
          );
        })
        .catch(() => {
          if (cancelled || call !== latest) return;
          setState({ kind: "refused", message: "Something went wrong. Please try again." });
        });
    };

    if (token.current === null) {
      token.current = readFragment();
      clearFragment();
    }
    submit(token.current);

    // Another link opened in this same tab changes only the fragment and
    // does not reload the page: answer for that link, not the old one.
    const onHashChange = () => {
      const next = readFragment();
      if (!next) return;
      token.current = next;
      clearFragment();
      setState({ kind: "working" });
      submit(next);
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [stop]);

  if (state.kind === "working") {
    return (
      <p className="muted" role="status">
        Stopping the weekly email…
      </p>
    );
  }

  if (state.kind === "done") {
    return (
      <div className={styles.result} role="status">
        <p className="lede">Done. You won&apos;t get the weekly email any more.</p>
        <p className="muted">
          You can turn it back on at any time in{" "}
          <Link href="/settings" className="link">
            Settings
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={styles.result} role="alert">
      <p className="lede">{state.message}</p>
      <p className="muted">
        Open the link from the email again, or turn the weekly email off in{" "}
        <Link href="/settings" className="link">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
