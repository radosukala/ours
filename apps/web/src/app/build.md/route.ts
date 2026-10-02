/**
 * /build.md: the instructions a coding agent follows (D-0019 §B, M-0016),
 * served as Markdown from kit/build.md in the commit that was built. A
 * builder gives their agent one line that points here (/build).
 *
 * Static: read once, when the site is built.
 */
import { kitResponse } from "@/core/kit";

export const dynamic = "force-static";

export function GET(): Response {
  return kitResponse("build.md");
}
