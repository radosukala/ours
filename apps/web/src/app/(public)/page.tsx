/**
 * The front door, `/` (D-0020 §A; SPEC §18.19), for everyone: a member
 * stays, and is shown their feed where a visitor is asked to join (D-0023
 * §C). Nothing sends a member away from it.
 *
 * This file reads, on the server, what the page shows, and
 * `components/public/FrontDoor` renders it:
 *
 * - whether the feed's join form is shown: only while
 *   `accountCreationOpen()` and `clientIpHeader()` are both true, the
 *   gates joining has, as on /feed;
 * - the public count, `memberCount` (D-0012 §B): /contract counts "the
 *   number on the front page";
 * - how many apps have been named, `needCount` (D-0024 §C): a number, never
 *   the words. The form asks "Which app would you take back?" only while that
 *   number can be read: until the release's migration has made the table, the
 *   form asks for the address alone;
 * - the seats open and the addresses waiting, only when the form is shown:
 *   the button's words follow both (D-0016 §B);
 * - PROPOSALS_EMAIL (`proposalsEmail()`): the drafts offer the visitor's
 *   own email app only while it is set.
 *
 * If the count, the number of named apps or the seats cannot be read (the
 * database is down, or not there yet, or the table of named apps is not
 * there until the release applies its migration), that line is left out.
 * The page still renders, with no error and no number.
 */
import type { Metadata } from "next";
import { FrontDoor } from "@/components/public/FrontDoor";
import { DOOR_LEDE, DOOR_TITLE } from "@/components/public/door";
import { accountCreationOpen, clientIpHeader, proposalsEmail } from "@/core/config";
import { getDb } from "@/core/db";
import { needCount } from "@/core/needs";
import { memberCount, seatState } from "@/core/seats";
import { isMemberHere } from "@/web/viewer";

export const metadata: Metadata = {
  title: { absolute: DOOR_TITLE },
  description: DOOR_LEDE,
};

/** Logged by name only: a message can carry a host. */
function logged(what: string, error: unknown): null {
  console.error(`[ours] front door: ${what}:`, error instanceof Error ? error.name : "unknown error");
  return null;
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

async function readNeeds(): Promise<number | null> {
  try {
    return asCount(await needCount(getDb()));
  } catch (error) {
    return logged("the number of named apps could not be read", error);
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
  // The header asks the same (isMemberHere), so the page and its header agree (D-0023 §C).
  const member = await isMemberHere();

  const joining = accountCreationOpen() && clientIpHeader() !== null;
  const [count, needs, seats] = await Promise.all([
    readCount(),
    joining && !member ? readNeeds() : Promise.resolve(null),
    joining ? readSeats() : Promise.resolve(null),
  ]);

  return (
    <FrontDoor
      joining={joining}
      email={proposalsEmail()}
      count={count}
      needs={needs}
      seatsOpen={seats?.open ?? null}
      seatsWaiting={seats?.waiting ?? null}
      member={member}
    />
  );
}
