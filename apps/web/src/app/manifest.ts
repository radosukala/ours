/**
 * The web app manifest (SPEC §9 PWA; the name from SPEC §18.5): name
 * our.one, standalone, the theme
 * colours of the light tokens, and the SVG monogram. It describes our.one
 * as the front door does: the network, of which the feed is the first
 * project (D-0023).
 */
import type { MetadataRoute } from "next";
import { DOOR_LEDE } from "@/components/public/door";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "our.one",
    short_name: "our.one",
    description: DOOR_LEDE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f3eb",
    theme_color: "#f5f3eb",
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
