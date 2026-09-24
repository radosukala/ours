"use client";

/**
 * The bottom tab bar on phones (<700px, SPEC §9): 52px plus the safe-area
 * inset. Home, People, ＋ (compose), Notifications, Profile. Every target
 * is at least 44px.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { countLabel, isCurrent, type NavCounts, type NavViewer } from "./Nav";

export function TabBar({ viewer, counts }: { viewer: NavViewer; counts: NavCounts }) {
  const pathname = usePathname() ?? "";
  const items = [
    { href: "/home", label: "Home", icon: "home" as const, count: 0 },
    { href: "/people", label: "People", icon: "people" as const, count: counts.pending },
    { href: "/home#compose", label: "New post", icon: "plus" as const, count: 0, compose: true },
    { href: "/notifications", label: "Notifications", icon: "bell" as const, count: counts.unread },
    {
      href: `/u/${viewer.handle}`,
      label: "Profile",
      icon: "person" as const,
      count: 0,
      aliases: [`/@${viewer.handle}`],
    },
  ];
  return (
    <nav className="tabbar" aria-label="Main">
      {items.map((item) => {
        const current = !item.compose && isCurrent(pathname, item.href, item.aliases);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`tabbar__item${item.compose ? " tabbar__item--compose" : ""}`}
            aria-current={current ? "page" : undefined}
            aria-label={
              item.count > 0 ? `${item.label}, ${countLabel(item.count)} new` : item.label
            }
          >
            <span className="tabbar__icon">
              <Icon name={item.icon} size={26} strokeWidth={current ? 2.25 : 1.75} />
              {item.count > 0 ? (
                <span className="badge tabbar__badge" aria-hidden="true">
                  {countLabel(item.count)}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
