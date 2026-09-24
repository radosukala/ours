/**
 * The signed-in person for this request.
 *
 * `getViewer()` is cached per request with React `cache`, so a layout, a
 * page and its components can all ask without extra queries.
 *
 * Every page and every server action that needs a viewer calls
 * `requireViewer()` itself. The (app) layout also calls it, but a layout is
 * not re-rendered on client navigation, so it is never the only check.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import { sessionFromCookie, viewerAccount } from "@/core/auth";
import { getDb } from "@/core/db";
import { readSessionCookie } from "./session";

export type Viewer = {
  id: string;
  handle: string;
  displayName: string;
  isAdmin: boolean;
  acceptsFollowers: boolean;
  invitesRemaining: number;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const raw = await readSessionCookie();
  if (!raw) return null;
  const db = getDb();
  const accountId = await sessionFromCookie(db, raw, new Date());
  if (!accountId) return null;
  return viewerAccount(db, accountId);
});

/** The viewer, or a redirect to /signin. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/signin");
  return viewer;
}
