"use client";

/**
 * The left navigation (SPEC §9), shown at 700px and wider: icon-only below
 * 1280px, icon and label above. The wordmark, Home, Notifications (unread
 * count), People (pending requests), Profile, Settings, a Post pill that
 * goes to the composer on /home, and the account chip at the bottom.
 *
 * The composer on /home has id="compose"; /home#compose focuses it.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";

export type NavCounts = { unread: number; pending: number };

export type NavViewer = { handle: string; displayName: string; isAdmin?: boolean };

export function countLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function navItems(viewer: NavViewer, counts: NavCounts) {
  return [
    { href: "/home", label: "Home", icon: "home" as IconName, count: 0 },
    {
      href: "/notifications",
      label: "Notifications",
      icon: "bell" as IconName,
      count: counts.unread,
      countNoun: "unread",
    },
    {
      href: "/people",
      label: "People",
      icon: "people" as IconName,
      count: counts.pending,
      countNoun: counts.pending === 1 ? "request" : "requests",
    },
    {
      href: `/u/${viewer.handle}`,
      label: "Profile",
      icon: "person" as IconName,
      count: 0,
      aliases: [`/@${viewer.handle}`],
    },
    { href: "/settings", label: "Settings", icon: "gear" as IconName, count: 0 },
    // Only administrators see the moderation queue in the navigation; for
    // everyone else /admin is not found.
    ...(viewer.isAdmin
      ? [{ href: "/admin", label: "Moderation", icon: "flag" as IconName, count: 0 }]
      : []),
  ];
}

export function isCurrent(pathname: string, href: string, aliases: string[] = []): boolean {
  return [href, ...aliases].some(
    (h) => pathname === h || pathname.startsWith(`${h}/`),
  );
}

export function Nav({ viewer, counts }: { viewer: NavViewer; counts: NavCounts }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav__inner">
        <Link href="/home" className="nav__brand" aria-label="our.one home">
          <span className="wordmark">our.one</span>
        </Link>
        <ul className="nav__list">
          {navItems(viewer, counts).map((item) => {
            const current = isCurrent(pathname, item.href, item.aliases);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="nav__item"
                  aria-current={current ? "page" : undefined}
                  aria-label={
                    item.count > 0
                      ? `${item.label}, ${countLabel(item.count)} ${item.countNoun ?? "new"}`
                      : undefined
                  }
                  title={item.label}
                >
                  <span className="nav__icon">
                    <Icon name={item.icon} size={26} strokeWidth={current ? 2.25 : 1.75} />
                    {item.count > 0 ? (
                      <span className="badge nav__badge" aria-hidden="true">
                        {countLabel(item.count)}
                      </span>
                    ) : null}
                  </span>
                  <span className="nav__label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/home#compose"
          className="btn btn--primary btn--large nav__post"
          aria-label="New post"
        >
          <span className="nav__post-label" aria-hidden="true">
            Post
          </span>
          <span className="nav__post-icon" aria-hidden="true">
            <Icon name="plus" size={24} />
          </span>
        </Link>
        <Link href="/settings" className="nav__chip" aria-label="Your account settings">
          <Avatar name={viewer.displayName} handle={viewer.handle} size={40} />
          <span className="nav__chip-text">
            <span className="nav__chip-name">{viewer.displayName}</span>
            <span className="nav__chip-handle">@{viewer.handle}</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
