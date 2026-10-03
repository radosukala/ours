/**
 * A member's places in the app (SPEC §9; D-0023 §B, §D): the feed,
 * notifications (unread count), people (pending requests), the profile,
 * settings and, for administrators, moderation. The header's `MemberLinks`
 * and the phone's `TabBar` draw them. The left navigation they once drew,
 * with its Post pill, is gone (D-0023 §A).
 *
 * The composer on /home has id="compose"; /home#compose focuses it.
 */
import type { IconName } from "./Icon";

export type NavCounts = { unread: number; pending: number };

export type NavViewer = { handle: string; displayName: string; isAdmin?: boolean };

export function countLabel(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function navItems(viewer: NavViewer, counts: NavCounts) {
  return [
    // The feed, named the feed: our.one's home is its front door (D-0023 §D).
    { href: "/home", label: "Feed", icon: "home" as IconName, count: 0 },
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
