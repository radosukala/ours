import type { Metadata, Viewport } from "next";
import { DOOR_LEDE, TAGLINE } from "@/components/public/door";
import "./globals.css";

/**
 * Where the link card's image lives, for a crawler: the site's own address,
 * APP_URL, read here as `appUrl()` reads it (the root layout imports
 * nothing from the core, so `next build` touches no database). Without
 * one the image's path is left relative, and the platform's own address
 * stands in.
 */
function metadataBase(): URL | undefined {
  const value = process.env.APP_URL?.replace(/\/+$/, "");
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * A page with no description of its own takes the front door's (D-0023).
 * Every page carries the link card (D-0024 §D): the page's own title and
 * description, and one committed image, public/card.png, the headline on
 * the paper.
 */
export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: { default: "our.one", template: "%s · our.one" },
  description: DOOR_LEDE,
  openGraph: {
    siteName: "our.one",
    type: "website",
    images: [{ url: "/card.png", width: 1200, height: 630, alt: TAGLINE }],
  },
  twitter: { card: "summary_large_image", images: ["/card.png"] },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#131a15" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
