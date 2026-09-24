/**
 * Text with its web addresses made into links (SPEC §9).
 *
 * Safe by construction: the text is split into plain strings and links and
 * rendered as React nodes — no HTML is ever parsed or injected. Only http
 * and https addresses become links; each opens in a new tab with
 * rel="nofollow noopener noreferrer ugc", and the visible text is cut at 40
 * characters. No preview is fetched.
 */
import { Fragment } from "react";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?'"*_~]+$/;
const MAX_DISPLAY = 40;

type Piece = { text: string } | { href: string; display: string; raw: string };

/** Drop trailing punctuation, and a closing bracket that has no opener. */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (
      url.endsWith(close) &&
      url.split(close).length > url.split(open).length
    ) {
      url = url.slice(0, -1).replace(TRAILING, "");
    }
  }
  return url;
}

function toHref(url: string): string | null {
  const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function displayUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return bare.length > MAX_DISPLAY ? `${bare.slice(0, MAX_DISPLAY - 1)}…` : bare;
}

export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = trimUrl(match[0]);
    const href = raw ? toHref(raw) : null;
    if (!href) continue;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ href, display: displayUrl(raw), raw });
    last = start + raw.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

export function Linkify({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((piece, i) =>
        "href" in piece ? (
          <a
            key={i}
            href={piece.href}
            rel="nofollow noopener noreferrer ugc"
            target="_blank"
            title={piece.raw.length > MAX_DISPLAY ? piece.raw : undefined}
          >
            {piece.display}
          </a>
        ) : (
          <Fragment key={i}>{piece.text}</Fragment>
        ),
      )}
    </>
  );
}
