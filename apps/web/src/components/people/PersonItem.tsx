/**
 * One person in a list: avatar, name and @handle linking to the profile,
 * an optional line under it, and optional actions on the right.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { fullTime } from "@/components/RelativeTime";
import styles from "./people.module.css";

export function profileHref(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`;
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A calendar date, "24 Sep 2026", for "Friends since …" lines (UTC, like RelativeTime). */
export function SinceDate({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={fullTime(date)}>
      {DAY_MONTH_YEAR.format(date)}
    </time>
  );
}

export function PersonItem({
  person,
  meta,
  actions,
}: {
  person: { handle: string; displayName: string };
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const href = profileHref(person.handle);
  return (
    <li className="person">
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <Avatar name={person.displayName} handle={person.handle} size={40} />
      </Link>
      <div className="person__text">
        <Link href={href} className="person__name">
          {person.displayName}
        </Link>
        <span className="person__handle">@{person.handle}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {actions ? <div className="person__actions">{actions}</div> : null}
    </li>
  );
}

/** A list of PersonItem rows. */
export function PeopleList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul className={styles.list} role="list" aria-label={label}>
      {children}
    </ul>
  );
}
