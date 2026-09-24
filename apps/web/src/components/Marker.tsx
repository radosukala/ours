/**
 * Markers in the feed (SPEC §9): a centred block with a thin rule on each
 * side. The caught-up marker sits immediately before the first item at or
 * before the previous visit; the end marker closes the 14-day window.
 */
import { FEED_WINDOW_DAYS } from "@/core/config";
import { relativeTime } from "./RelativeTime";

export function Marker({
  title,
  text,
}: {
  title?: string;
  text?: string;
}) {
  // A separator's children are not read out, so its name carries both
  // lines: "You're caught up. You've seen everything from before your last visit, 3 hours ago."
  const label = [title ? `${title}.` : null, text].filter(Boolean).join(" ");
  return (
    <div className="marker" role="separator" aria-label={label}>
      <span className="marker__rule" aria-hidden="true" />
      <span className="marker__body">
        {title ? <strong className="marker__title">{title}</strong> : null}
        {text ? <span className="marker__text">{text}</span> : null}
      </span>
      <span className="marker__rule" aria-hidden="true" />
    </div>
  );
}

/** "You're caught up. You've seen everything from before your last visit, 3 hours ago." */
export function CaughtUpMarker({ since, now }: { since: Date; now?: Date }) {
  return (
    <Marker
      title="You're caught up"
      text={`You've seen everything from before your last visit, ${visitWords(since, now)}.`}
    />
  );
}

/** "just now", "5 minutes ago", "1 hour ago", "3 days ago", or "on 12 Sept". */
function visitWords(since: Date, now?: Date): string {
  const short = relativeTime(since, now);
  if (short === "now") return "just now";
  const m = /^(\d+)([mhd])$/.exec(short);
  if (!m) return `on ${short}`;
  const n = Number(m[1]);
  const unit = { m: "minute", h: "hour", d: "day" }[m[2] as "m" | "h" | "d"];
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** "That's everything from the last 14 days." */
export function EndMarker() {
  return (
    <Marker text={`That's everything from the last ${FEED_WINDOW_DAYS} days.`} />
  );
}
