/**
 * The public pages (SPEC §9): landing, rules, privacy, costs, power,
 * invite, sign-in, join and unsubscribe. One centred column of 600px with
 * the wordmark header and the footer: open code, costs, who controls what,
 * rules, privacy, the running version and the status line.
 *
 * It does not read the session, so these pages never depend on the
 * database being up.
 *
 * Every page under it renders per request (SPEC §17 item 20), so the
 * footer's running version, the configured controller on /power and the
 * mail provider on /privacy are this server's now, never the values the
 * app happened to be built with.
 */
import Link from "next/link";
import { SiteFooter } from "@/components/RightColumn";

export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public">
      <header className="public-header">
        <Link href="/" className="wordmark" aria-label="OURS, home">
          OURS
        </Link>
        <Link href="/signin" className="public-header__signin">
          Sign in
        </Link>
      </header>
      <main id="main" className="public-main">
        {children}
      </main>
      <footer className="public-footer">
        <SiteFooter />
      </footer>
    </div>
  );
}
