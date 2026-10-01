/**
 * The front page `/` (SPEC §18.2, M-0011). Signed-in people go straight to
 * /home.
 *
 * This file reads, on the server, what the page shows, and
 * `components/public/FrontPage` renders it:
 *
 * - the public count, `memberCount`: accounts that exist and are not
 *   suspended, never the waiting list (D-0012 §B);
 * - whether the Get in form is shown: only while `accountCreationOpen()`
 *   and `clientIpHeader()` are both true, the gates joining has;
 * - the seats open and the addresses waiting, from `seatState`, only when
 *   the form is shown: the button's words follow both (D-0016 §B, as the
 *   verification of M-0014 corrected it).
 *
 * If the count or the seats cannot be read (the database is down, or not
 * there yet), that line is left out. The page still renders, with no error
 * and no number.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FRONT_PAGE_TITLE, FrontPage } from "@/components/public/FrontPage";
import { accountCreationOpen, clientIpHeader } from "@/core/config";
import { getDb } from "@/core/db";
import { memberCount, seatState } from "@/core/seats";
import { readSessionCookie } from "@/web/session";
import { getViewer } from "@/web/viewer";

export const metadata: Metadata = {
  title: { absolute: FRONT_PAGE_TITLE },
};

/**
 * Whether this request is signed in. Without a session cookie the database
 * is not touched for it; if the check fails, the visitor sees the front
 * page rather than an error.
 */
async function signedIn(): Promise<boolean> {
  if (!(await readSessionCookie())) return false;
  try {
    return (await getViewer()) !== null;
  } catch (error) {
    console.error(
      "[ours] front page: the session could not be checked:",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }
}

/** A number of people or seats, or null if it can't be shown as one. */
function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** `read`'s number, or null when it fails. Logged by name only: a message can carry a host. */
async function readNumber(what: string, read: () => Promise<number>): Promise<number | null> {
  try {
    return asCount(await read());
  } catch (error) {
    console.error(
      `[ours] front page: ${what} could not be read:`,
      error instanceof Error ? error.name : "unknown error",
    );
    return null;
  }
}

/** The seats open and the addresses waiting, each null when it can't be read. */
async function readSeats(): Promise<{ open: number | null; waiting: number | null }> {
  try {
    const state = await seatState(getDb());
    return { open: asCount(state.open), waiting: asCount(state.waiting) };
  } catch (error) {
    console.error(
      "[ours] front page: the seats could not be read:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { open: null, waiting: null };
  }
}

export default async function FrontPageRoute() {
  if (await signedIn()) redirect("/home");

  const joining = accountCreationOpen() && clientIpHeader() !== null;
  const [count, seats] = await Promise.all([
    readNumber("the count", () => memberCount(getDb())),
    joining ? readSeats() : Promise.resolve(null),
  ]);

  return (
    <FrontPage
      count={count}
      joining={joining}
      seatsOpen={seats?.open ?? null}
      seatsWaiting={seats?.waiting ?? null}
    />
  );
}
