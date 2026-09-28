/**
 * The web app manifest (SPEC §9 PWA; the name from SPEC §18.5): name
 * our.one, standalone, the theme
 * colours of the light tokens, and the SVG monogram.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "our.one",
    short_name: "our.one",
    description: "A home for friends and people you choose to follow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
