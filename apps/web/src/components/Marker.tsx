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
  // lines: "You're caught up. You've seen everything since 3h ago."
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

/** "You're caught up. You've seen everything since 3h ago." */
export function CaughtUpMarker({ since, now }: { since: Date; now?: Date }) {
  const short = relativeTime(since, now);
  const when =
    short === "now"
      ? "just now"
      : /^\d+[mhd]$/.test(short)
        ? `${short} ago`
        : short;
  return (
    <Marker
      title="You're caught up"
      text={`You've seen everything since ${when}.`}
    />
  );
}

/** "That's everything from the last 14 days." */
export function EndMarker() {
  return (
    <Marker text={`That's everything from the last ${FEED_WINDOW_DAYS} days.`} />
  );
}
