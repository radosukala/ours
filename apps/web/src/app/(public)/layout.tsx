/**
 * The public pages (SPEC §9; D-0020 §B): the front door, the feed's page,
 * the framework and the records, signing in, joining and unsubscribing.
 *
 * - The header: the wordmark, the four places (the idea, projects, building
 *   and what's in the open) and Sign in, on every public page.
 * - The footer: the wordmark and the line, then the site footer: its
 *   links, the running version and the status line.
 *
 * It does not read the session, so these pages never depend on the
 * database being up.
 *
 * Every page under it renders per request (SPEC §17 item 20), so the
 * footer's running version, the configured controller on /power and the
 * mail provider on /privacy are this server's now, never the values the
 * app happened to be built with.
 */
import type { Viewport } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/RightColumn";
import { PublicNav } from "@/components/public/PublicNav";
import { TAGLINE } from "@/components/public/door";

export const dynamic = "force-dynamic";

/** The browser's bar in the pages' paper, light and dark (D-0020 §A). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#131a15" },
  ],
};

/** "our.one", with its dot in the accent. */
function Wordmark() {
  return (
    <>
      our<span className="public-wordmark__dot">.</span>one
    </>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public">
      <header className="public-header">
        <div className="public-header__bar">
          <Link href="/" className="public-wordmark" aria-label="our.one, home">
            <Wordmark />
          </Link>
          <PublicNav />
          <Link href="/signin" className="public-header__signin">
            Sign in
          </Link>
        </div>
      </header>
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
