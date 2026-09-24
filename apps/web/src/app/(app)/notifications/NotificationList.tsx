"use client";

/**
 * The list on /notifications. Once it is on screen it marks everything
 * read (a server action that also revalidates the layout, so the unread
 * count in the navigation clears). What was new when the page opened stays
 * marked as new for this visit, even after the server says it is read.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { EmptyState } from "@/components/EmptyState";
import { NotificationRow } from "@/components/NotificationRow";
import type { NotificationView } from "@/core/inbox";
import { markNotificationsReadAction } from "./actions";

export function NotificationList({
  items,
  hasUnread,
  contactEmail,
}: {
  items: NotificationView[];
  /** Anything unread at all, including notifications this list hides. */
  hasUnread: boolean;
  contactEmail: string | null;
}) {
  const [newOnOpen] = useState<ReadonlySet<string>>(
    () => new Set(items.filter((n) => n.readAt === null).map((n) => n.id)),
  );
  const [, startTransition] = useTransition();
  const marked = useRef(false);

  useEffect(() => {
    if (!hasUnread || marked.current) return;
    marked.current = true;
    startTransition(async () => {
      await markNotificationsReadAction();
    });
  }, [hasUnread]);

  if (items.length === 0) {
    return <EmptyState text="No notifications yet." />;
  }
  return (
    <ol role="list" aria-label="Notifications">
      {items.map((n) => (
        <li key={n.id}>
          <NotificationRow notification={n} unread={newOnOpen.has(n.id)} contactEmail={contactEmail} />
        </li>
      ))}
    </ol>
  );
}
