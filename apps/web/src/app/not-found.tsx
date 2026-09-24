/**
 * Not found. Also what a person sees for anything they may not see
 * (SPEC §2 rule 3): a hidden post and a missing one look the same.
 */
import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="plain-page">
      <Link href="/" className="wordmark" aria-label="OURS, home">
        OURS
      </Link>
      <h1 className="plain-page__title">Nothing here</h1>
      <p className="muted">This page doesn&apos;t exist, or isn&apos;t available.</p>
      <Link href="/" className="btn btn--primary">
        Go to OURS
      </Link>
    </main>
  );
}
