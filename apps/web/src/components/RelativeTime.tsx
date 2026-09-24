/**
 * Relative time (SPEC §9): `now`, `Xm`, `Xh`, `Xd`, then a date — `12 Sep`,
 * or `12 Sep 2025` in another year. The title holds the full date and time.
 *
 * Dates are shown in UTC: the server renders them and does not know the
 * reader's time zone, and a page that asked would need a script to find out.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

/** The short form: now, 5m, 3h, 2d, 12 Sep, 12 Sep 2025. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < MINUTE) return "now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  if (seconds < 7 * DAY) return `${Math.floor(seconds / DAY)}d`;
  return date.getUTCFullYear() === now.getUTCFullYear()
    ? DAY_MONTH.format(date)
    : DAY_MONTH_YEAR.format(date);
}

/** The full form for a title attribute: "1 September 2026 at 12:00 UTC". */
export function fullTime(date: Date): string {
  return `${FULL.format(date)} UTC`;
}

export function RelativeTime({
  date,
  now,
  className,
}: {
  date: Date;
  now?: Date;
  className?: string;
}) {
  return (
    <time
      className={className}
      dateTime={date.toISOString()}
      title={fullTime(date)}
      suppressHydrationWarning
    >
      {relativeTime(date, now)}
    </time>
  );
}
