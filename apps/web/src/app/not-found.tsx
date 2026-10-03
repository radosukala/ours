/**
 * Not found. Also what a person sees for anything they may not see
 * (SPEC §2 rule 3): a hidden post and a missing one look the same.
 *
 * It has the header every page has (D-0023 §A, §B): the wordmark with its
 * rust dot, the four places, and Sign in or Your feed, read in a Suspense
 * boundary of its own as the public layout reads it. It shows the footer,
 * with the running version (SPEC §17 item 20), and renders per request so
 * that version is this server's, not the build's.
 */
import Link from "next/link";
import { Suspense } from "react";
import { Account, SignIn } from "@/components/PublicAccount";
import { SiteFooter } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="public">
      <SiteHeader>
        <Suspense fallback={<SignIn />}>
          <Account />
        </Suspense>
      </SiteHeader>
      <main id="main" className="plain-page">
        <h1 className="plain-page__title">Nothing here</h1>
        <p className="muted">This page doesn&apos;t exist, or isn&apos;t available.</p>
        <Link href="/" className="btn btn--primary">
          Go to our.one
        </Link>
        <footer>
          <SiteFooter />
        </footer>
      </main>
    </div>
  );
}
