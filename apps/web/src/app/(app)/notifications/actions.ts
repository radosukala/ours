"use server";

/**
 * /notifications' server action (SPEC §8, §10): opening the page marks
 * everything read and sets notifications_seen_at, then revalidates the
 * layout so the navigation's unread count clears.
 *
 * It is an action, called once the page is on screen, because Next does not
 * allow revalidatePath during a render — and because a page load is the
 * only proof the person actually opened their notifications.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { markAllRead } from "@/core/inbox";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

export async function markNotificationsReadAction() {
  return run(async () => {
    const viewer = await requireViewer();
    await markAllRead(getDb(), viewer.id);
    revalidatePath("/", "layout");
  });
}
