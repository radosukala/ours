"use client";

/**
 * A member's own links, on the right of the header in the app (D-0023 §B):
 * the feed, notifications and people, with their counts, and a menu with
 * the profile, settings and, for administrators, moderation. On a phone
 * the bottom bar carries the first three, and the menu stays.
 *
 * The menu is a <details>: it opens and closes by keyboard and touch
 * without script, and closes when one of its links is followed.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Avatar } from "./Avatar";
import { countLabel, isCurrent, type NavCounts, type NavViewer, navItems } from "./Nav";

export function MemberLinks({ viewer, counts }: { viewer: NavViewer; counts: NavCounts }) {
  const pathname = usePathname() ?? "";
  const menu = useRef<HTMLDetailsElement>(null);
  const items = navItems(viewer, counts);
  const bar = items.filter((item) => ["/home", "/notifications", "/people"].includes(item.href));
  const mine = items.filter((item) => !bar.includes(item));
  const close = () => {
    if (menu.current) menu.current.open = false;
  };

  return (
    <div className="member">
      <nav className="member__links" aria-label="Yours">
        {bar.map((item) => {
          const current = isCurrent(pathname, item.href, item.aliases);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="member__link"
              aria-current={current ? "page" : undefined}
              aria-label={
                item.count > 0 ? `${item.label}, ${countLabel(item.count)} ${item.countNoun ?? "new"}` : undefined
              }
            >
              {item.label}
              {item.count > 0 ? (
                <span className="badge member__badge" aria-hidden="true">
                  {countLabel(item.count)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <details className="menu member__menu" ref={menu}>
        <summary className="member__me" aria-label={`${viewer.displayName}: your profile and settings`}>
          <Avatar name={viewer.displayName} handle={viewer.handle} size={40} />
          <span className="member__me-caret" aria-hidden="true">
            ▾
          </span>
        </summary>
        <ul className="menu__list">
          {mine.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="menu__item"
                aria-current={isCurrent(pathname, item.href, item.aliases) ? "page" : undefined}
                onClick={close}
              >
                {item.label === "Profile" ? "Your profile" : item.label}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
