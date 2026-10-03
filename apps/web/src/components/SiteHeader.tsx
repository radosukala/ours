/**
 * The header on every page, signed in or not (D-0020 §B, D-0023 §B): the
 * wordmark, which goes to the front door; the four places; and on its
 * right what the reader is offered — Sign in for a visitor, their feed for
 * a member on a public page, and in the app the member's own links
 * (`MemberLinks`). `member` marks the app's header, which carries more on
 * its right and so gives the places a row of their own sooner.
 */
import Link from "next/link";
import { PublicNav } from "./public/PublicNav";

/** "our.one", with its dot in the accent. */
export function Wordmark() {
  return (
    <>
      our<span className="public-wordmark__dot">.</span>one
    </>
  );
}

export function SiteHeader({ children, member = false }: { children: React.ReactNode; member?: boolean }) {
  return (
    <header className={member ? "public-header public-header--member" : "public-header"}>
      <div className="public-header__bar">
        <Link href="/" className="public-wordmark" aria-label="our.one, home">
          <Wordmark />
        </Link>
        <PublicNav />
        <div className="public-header__account">{children}</div>
      </div>
    </header>
  );
}
