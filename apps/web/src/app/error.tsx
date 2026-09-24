"use client";

/**
 * Something failed on our side — most often the database could not be
 * reached. Say so plainly and offer a retry; never show the error's message,
 * which can carry a host name or a query.
 */
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="plain-page">
      <Link href="/" className="wordmark" aria-label="OURS, home">
        OURS
      </Link>
      <h1 className="plain-page__title">Something went wrong on our side</h1>
      <p className="muted">
        Nothing you did caused this. Try again in a moment.
      </p>
      <button type="button" className="btn btn--primary" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
