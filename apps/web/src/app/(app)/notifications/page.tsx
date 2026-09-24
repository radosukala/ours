/**
 * /notifications: the newest 100, grouped by nothing (SPEC §8). Opening the
 * page marks all read and sets notifications_seen_at (see
 * NotificationList and actions.ts), and the navigation's count clears.
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { controller } from "@/core/config";
import { getDb } from "@/core/db";
import { listNotifications } from "@/core/inbox";
import { countUnread } from "@/core/notifications";
import { requireViewer } from "@/web/viewer";
import { NotificationList } from "./NotificationList";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const [items, unread] = await Promise.all([
    listNotifications(db, viewer.id),
    countUnread(db, viewer.id),
  ]);
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationList
        items={items}
        hasUnread={unread > 0}
        contactEmail={controller()?.email ?? null}
      />
    </>
  );
}
