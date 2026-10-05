/**
 * The words around the feed's join form (D-0016 §B, SPEC §18.16): the
 * button's, which say what the form will do with the address, and the
 * lines under it. The form (`takeSeat`, SPEC §18.4) only ever joins: with
 * a seat open it sends the link, and with none it puts the address in line.
 *
 * A plain module, so the feed's page and the front door (server
 * components) and the form (a client component) all read the same words
 * (D-0020 §B).
 */
import { DEFAULT_INVITES } from "@/core/config";
import { formatCount, THRESHOLD } from "./handover";

/** A seat is open and nobody waits, or the seats can't be read. */
export const JOIN_LABEL = "Join our.one";

/** No seat is open, or others wait: the address will wait in line. */
export const WAITING_LIST_LABEL = "Join the waiting list";

/**
 * The label for the seats now. "Join our.one" only when a seat is open and
 * nobody waits for one: with an address already waiting, a new address
 * goes in line behind it, because the line goes first (seats.ts,
 * requestSeat; the verification of M-0014). A seat is open while others
 * wait after a seat email fails, or after an address leaves the line.
 *
 * When the seats can't be read (null), a seat may be open, so the button
 * says "Join our.one"; the answer after joining is true either way (D-0015
 * §H).
 */
export function joinLabel(seatsOpen: number | null, waiting: number | null = null): string {
  if (seatsOpen === null) return JOIN_LABEL;
  return seatsOpen <= 0 || (waiting ?? 0) > 0 ? WAITING_LIST_LABEL : JOIN_LABEL;
}

/** The count, shown as the rank the next person would have. */
export function countLine(n: number): string {
  if (n === 0) return "Nobody is in yet. You'd be #1.";
  if (n === 1) return "1 person is in. You'd be #2.";
  return `${formatCount(n)} people are in. You'd be #${formatCount(n + 1)}.`;
}

/** The count against the handover's threshold (D-0024 §B): "1 of 100,000". A number, never a bar. */
export function ofThreshold(n: number): string {
  return `${formatCount(n)} of ${THRESHOLD}`;
}

/** The count for a member, who is already among them: no rank (D-0023 §C). */
export function memberCountLine(n: number): string {
  if (n === 1) return "1 person is in.";
  return `${formatCount(n)} people are in.`;
}

/** Under the form, while joining is open (SPEC §18.15 item 1.3). */
export const FREE_LINE = `Free to join. You get ${DEFAULT_INVITES} invites to bring your people.`;

/**
 * While joining is closed (SPEC §18.15 item 3). It states a fact and
 * promises nothing: an invite may have expired by the time joining opens
 * (the re-check of M-0013).
 */
export const INVITE_CLOSED_LINE = "Have an invite? It can't be used until joining opens.";

/**
 * The seat line (D-0016 §B): shown only when no seat is open, under the
 * form, whose button then says "Join the waiting list". Opening seats
 * invites the longest-waiting addresses first (SPEC §18.4), so it promises
 * a place in line, not the next seat (the verification of M-0013).
 */
export function seatLine(open: number): string | null {
  return open <= 0 ? "No seats are open right now. Seats go to whoever has waited longest." : null;
}
