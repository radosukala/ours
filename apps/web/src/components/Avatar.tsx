/**
 * A circle with initials (SPEC §9). The colour comes from hashing the
 * handle over eight muted hues, so a person keeps their colour everywhere.
 * No uploads.
 */

const HUES = [210, 250, 285, 330, 12, 35, 150, 185] as const;

export type AvatarSize = 40 | 48 | 80;

/** FNV-1a, enough to spread handles across the hues. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function initials(name: string, handle: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters =
    words.length >= 2
      ? [words[0]!, words[words.length - 1]!]
      : words.length === 1
        ? [words[0]!]
        : [handle];
  return letters
    .map((w) => Array.from(w.replace(/[^\p{L}\p{N}]/gu, ""))[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

export function Avatar({
  name,
  handle,
  size = 40,
}: {
  name: string;
  handle: string;
  size?: AvatarSize;
}) {
  const hue = HUES[hash(handle) % HUES.length]!;
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ "--avatar-hue": hue } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials(name, handle)}
    </span>
  );
}
