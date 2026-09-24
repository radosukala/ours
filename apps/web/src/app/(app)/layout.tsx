/**
 * The signed-in shell (SPEC §9, §10).
 *
 *   <700px      the page's own <PageHeader> is the sticky top bar; the
 *               centre is full width; a fixed bottom tab bar (52px plus
 *               the safe-area inset), and content padded above it
 *   700–999px   icon-only left navigation (72px) and the 600px centre
 *   ≥1000px     navigation, centre and the right column (invite card,
 *               footer); labels appear in the navigation at ≥1280px
 *
 * It requires a viewer and redirects to /signin otherwise. A layout is not
 * re-rendered on client navigation, so every page and action in (app)
 * still calls requireViewer() itself. The unread and pending counts here
 * refresh on a full load, router.refresh(), or an action that calls
 * revalidatePath("/", "layout").
 */
import { getDb } from "@/core/db";
import { countIncomingRequests, countUnread } from "@/core/notifications";
import { Nav } from "@/components/Nav";
import { RightColumn } from "@/components/RightColumn";
import { TabBar } from "@/components/TabBar";
import { requireViewer } from "@/web/viewer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer();
  const db = getDb();
  const [unread, pending] = await Promise.all([
    countUnread(db, viewer.id),
    countIncomingRequests(db, viewer.id),
  ]);
  const navViewer = { handle: viewer.handle, displayName: viewer.displayName };
  const counts = { unread, pending };

  return (
    <div className="app">
      <Nav viewer={navViewer} counts={counts} />
      <main id="main" className="app-main">
        {children}
      </main>
      <RightColumn invitesRemaining={viewer.invitesRemaining} />
      <TabBar viewer={navViewer} counts={counts} />
    </div>
  );
}
