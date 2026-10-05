/**
 * The signed-in shell (SPEC §9, §10; D-0023): one our.one, signed in or
 * not. The header every visitor gets, with the four places and, on its
 * right, the member's own links; the page's column; and the panel, which
 * says what our.one is beside the feed (D-0023 §D).
 *
 *   <700px      the header, the page (its <PageHeader> the sticky bar), the
 *               panel after it, and the bottom tab bar (52px plus the
 *               safe-area inset)
 *   700–999px   the header carries the member's links beside the wordmark
 *               and the places on a row of their own; the page's column
 *               sits under the wordmark, and the panel follows it
 *   ≥1000px     the page's column and the panel side by side
 *
 * It requires a viewer and redirects to /signin otherwise. A layout is not
 * re-rendered on client navigation, so every page and action in (app)
 * still calls requireViewer() itself. The unread and pending counts here
 * refresh on a full load, router.refresh(), or an action that calls
 * revalidatePath("/", "layout").
 *
 * The panel's "N of 100,000 people are in." (D-0024 §D) is the public count.
 * If it can't be read the line is left out: the feed never waits on it.
 */
import { proposalsEmail } from "@/core/config";
import { getDb } from "@/core/db";
import { countIncomingRequests, countUnread } from "@/core/notifications";
import { memberCount } from "@/core/seats";
import { MemberLinks } from "@/components/MemberLinks";
import { RightColumn } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { requireViewer } from "@/web/viewer";

/** The public count for the panel, or null when it can't be read. Logged by name only. */
async function readCount(): Promise<number | null> {
  try {
    const n = await memberCount(getDb());
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch (error) {
    console.error("[ours] the panel's count could not be read:", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer();
  const db = getDb();
  const [unread, pending, count] = await Promise.all([
    countUnread(db, viewer.id),
    countIncomingRequests(db, viewer.id),
    readCount(),
  ]);
  const navViewer = {
    handle: viewer.handle,
    displayName: viewer.displayName,
    isAdmin: viewer.isAdmin,
  };
  const counts = { unread, pending };

  return (
    <div className="public app-shell">
      <SiteHeader member>
        <MemberLinks viewer={navViewer} counts={counts} />
      </SiteHeader>
      <div className="app">
        <main id="main" className="app-main">
          {children}
        </main>
        <RightColumn invitesRemaining={viewer.invitesRemaining} email={proposalsEmail()} count={count} />
      </div>
      <TabBar viewer={navViewer} counts={counts} />
    </div>
  );
}
