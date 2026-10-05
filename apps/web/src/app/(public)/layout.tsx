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
 * It reads the session only to choose between Sign in and Your feed
 * (`Account`, in PublicAccount.tsx), in a Suspense boundary of its own, and
 * never depends on the database being up for it (`isMemberHere`). Until it
 * knows, the header offers Sign in.
 *
 * Every page under it renders per request (SPEC §17 item 20), so the
 * footer's running version, the configured controller on /power and the
 * mail provider on /privacy are this server's now, never the values the
 * app happened to be built with.
 *
 * It carries the link card (D-0024 §E; SPEC §18.23): the title, the
 * description and the image (`CARD`) that X, Facebook, Slack and anything
 * that reads a page's card show. A page that sets none of its own gives its
 * link this one. It lives here and not in the root layout, which imports
 * nothing from the core: its base, the site's own address, is APP_URL
 * (`appUrl`). If that is missing the card is left without a base, which
 * costs the card, never a page. It reads no database.
 */
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Account, SignIn } from "@/components/PublicAccount";
import { SiteFooter } from "@/components/RightColumn";
import { SiteHeader, Wordmark } from "@/components/SiteHeader";
import { CARD, TAGLINE } from "@/components/public/door";
import { appUrl } from "@/core/config";

export const dynamic = "force-dynamic";

/** The site's own address, or undefined (and a line in the log) when it isn't set or isn't one. */
function siteBase(): URL | undefined {
  try {
    return new URL(appUrl());
  } catch {
    console.error("[ours] the link card has no base address: APP_URL is not set, or is not an address.");
    return undefined;
  }
}

export function generateMetadata(): Metadata {
  const base = siteBase();
  return {
    ...(base ? { metadataBase: base } : {}),
    // No title or description here: Next fills them from the page's own, so a shared link to /privacy
    // says what /privacy says, and the front door's says the front door's. A page with none of its own
    // takes the root layout's (the description is `DOOR_LEDE`).
    openGraph: {
      type: "website",
      siteName: "our.one",
      images: [{ url: CARD.path, width: CARD.width, height: CARD.height, alt: CARD.alt }],
    },
    twitter: {
      card: "summary_large_image",
      images: [{ url: CARD.path, alt: CARD.alt }],
    },
  };
}

/** The browser's bar in the pages' paper, light and dark (D-0020 §A). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#131a15" },
  ],
};

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
