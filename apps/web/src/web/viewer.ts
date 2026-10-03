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

/**
 * Whether this request is a member's, for the public pages' header and
 * their join forms (D-0023 §B, §C): the header, the front door and /feed
 * all ask here, so a page never tells one reader two things. Without a
 * session cookie the database isn't touched, and outside a request (a
 * test) there is no cookie. If the database can't be read, nobody is shown
 * as a member: the header offers Sign in, and the page its visitor's view
 * (the verification of M-0020, H5). So the public pages never depend on
 * the database being up. Cached per request, so it is asked, and an error
 * logged, once.
 */
export const isMemberHere = cache(async (): Promise<boolean> => {
  let raw: string | null;
  try {
    raw = await readSessionCookie();
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    return (await getViewer()) !== null;
  } catch (error) {
    console.error(
      "[ours] the session could not be checked:",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }
});
