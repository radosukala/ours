/**
 * The public pages (SPEC §9; D-0020 §B): the front door, the feed's page,
 * the framework and the records, signing in, joining and unsubscribing.
 *
 * - The header (`SiteHeader`): the wordmark, the four places (the idea,
 *   projects, building and what's in the open), and Sign in, or, for a
 *   member, Your feed (D-0023 §B, §C).
 * - The footer: the wordmark and the line, then the site footer: its
 *   links, the running version and the status line.
 *
 * It reads the session only to choose between Sign in and Your feed, in a
 * Suspense boundary of its own, and never depends on the database being up
 * for it (`isMemberHere`). Until it knows, the header offers Sign in.
 *
 * Every page under it renders per request (SPEC §17 item 20), so the
 * footer's running version, the configured controller on /power and the
 * mail provider on /privacy are this server's now, never the values the
 * app happened to be built with.
 */
import type { Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/RightColumn";
import { SiteHeader, Wordmark } from "@/components/SiteHeader";
import { TAGLINE } from "@/components/public/door";
import { isMemberHere } from "@/web/viewer";

export const dynamic = "force-dynamic";

/** The browser's bar in the pages' paper, light and dark (D-0020 §A). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#131a15" },
  ],
};

function SignIn() {
  return (
    <Link href="/signin" className="public-header__signin">
      Sign in
    </Link>
  );
}

/** Sign in for a visitor; Your feed for a member (D-0023 §B, §C). */
async function Account() {
  if (!(await isMemberHere())) return <SignIn />;
  return (
    <Link href="/home" className="public-header__signin">
      Your feed
    </Link>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public">
      <SiteHeader>
        <Suspense fallback={<SignIn />}>
          <Account />
        </Suspense>
      </SiteHeader>
      <main id="main" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <div className="public-footer__bar">
          <div className="public-footer__lead">
            <p className="public-wordmark" aria-hidden="true">
              <Wordmark />
            </p>
            <p className="public-footer__line">{TAGLINE}</p>
          </div>
          <SiteFooter />
        </div>
      </footer>
    </div>
  );
}
