"use client";

/**
 * Something failed on our side — most often the database could not be
 * reached. Say so plainly and offer a retry; never show the error's message,
 * which can carry a host name or a query.
 *
 * It has the header every page has (D-0023 §A, §B): the wordmark with its
 * rust dot and the four places. Its right side stays empty: with the
 * database unreachable, who is reading can't be known.
 */
import { SiteHeader } from "@/components/SiteHeader";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="public">
      <SiteHeader>{null}</SiteHeader>
      <main id="main" className="plain-page">
        <h1 className="plain-page__title">Something went wrong on our side</h1>
        <p className="muted">
          Nothing you did caused this. Try again in a moment.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => reset()}>
          Try again
        </button>
      </main>
    </div>
  );
}
