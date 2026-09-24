/**
 * What the author of a removed post or reply sees (SPEC §8 "What the author
 * sees"): "Removed: <category>. <reason>. If you think this is wrong, write
 * to <controller email>."
 *
 * The contact sentence appears only when a controller is named; without an
 * address there is nobody to write to, and the page does not invent one.
 */
import type { RemovalView } from "@/core/posts";

function sentence(text: string): string {
  const trimmed = text.trim().replace(/[.\s]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

export function removalText(
  removed: RemovalView,
  contactEmail: string | null | undefined,
): string {
  const parts = [
    `Removed: ${sentence(removed.category ?? "") || "no category given."}`,
    sentence(removed.reason ?? ""),
    contactEmail ? `If you think this is wrong, write to ${contactEmail}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
