/**
 * The front door, `/` (D-0020 §A; SPEC §18.19). Signed-in people go
 * straight to /home, as they did from the front page before it.
 *
 * This file reads, on the server, what the page shows, and
 * `components/public/FrontDoor` renders it:
 *
 * - whether the feed's join form is shown: only while
 *   `accountCreationOpen()` and `clientIpHeader()` are both true, the
 *   gates joining has, as on /feed;
 * - the public count, `memberCount` (D-0012 §B): /contract counts "the
 *   number on the front page";
 * - the seats open and the addresses waiting, only when the form is shown:
 *   the button's words follow both (D-0016 §B);
 * - PROPOSALS_EMAIL (`proposalsEmail()`): the drafts offer the visitor's
 *   own email app only while it is set.
 *
 * If the count or the seats cannot be read (the database is down, or not
 * there yet), that line is left out. The page still renders, with no error
 * and no number.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FrontDoor } from "@/components/public/FrontDoor";
import { DOOR_LEDE, DOOR_TITLE } from "@/components/public/door";
import { accountCreationOpen, clientIpHeader, proposalsEmail } from "@/core/config";
import { getDb } from "@/core/db";
import { memberCount, seatState } from "@/core/seats";
import { readSessionCookie } from "@/web/session";
import { getViewer } from "@/web/viewer";

export const metadata: Metadata = {
  title: { absolute: DOOR_TITLE },
  description: DOOR_LEDE,
};

/** Logged by name only: a message can carry a host. */
function logged(what: string, error: unknown): null {
  console.error(`[ours] front door: ${what}:`, error instanceof Error ? error.name : "unknown error");
  return null;
}

/**
 * Whether this request is signed in. Without a session cookie the database
 * is not touched for it; if the check fails, the visitor sees the front
 * door rather than an error.
 */
async function signedIn(): Promise<boolean> {
  if (!(await readSessionCookie())) return false;
  try {
    return (await getViewer()) !== null;
  } catch (error) {
    logged("the session could not be checked", error);
    return false;
  }
}

/** A number of people or seats, or null if it can't be shown as one. */
function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function readCount(): Promise<number | null> {
  try {
    return asCount(await memberCount(getDb()));
  } catch (error) {
    return logged("the count could not be read", error);
  }
}

async function readSeats(): Promise<{ open: number | null; waiting: number | null }> {
  try {
    const state = await seatState(getDb());
    return { open: asCount(state.open), waiting: asCount(state.waiting) };
  } catch (error) {
    logged("the seats could not be read", error);
    return { open: null, waiting: null };
  }
}

export default async function FrontDoorRoute() {
  if (await signedIn()) redirect("/home");

  const joining = accountCreationOpen() && clientIpHeader() !== null;
  const [count, seats] = await Promise.all([readCount(), joining ? readSeats() : Promise.resolve(null)]);

  return (
    <FrontDoor
      joining={joining}
      email={proposalsEmail()}
      count={count}
      seatsOpen={seats?.open ?? null}
      seatsWaiting={seats?.waiting ?? null}
    />
  );
}
