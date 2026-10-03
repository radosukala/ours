import type { Metadata, Viewport } from "next";
import { DOOR_LEDE } from "@/components/public/door";
import "./globals.css";

/** A page with no description of its own takes the front door's (D-0023). */
export const metadata: Metadata = {
  title: { default: "our.one", template: "%s · our.one" },
  description: DOOR_LEDE,
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
