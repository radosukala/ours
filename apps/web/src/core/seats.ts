/**
 * Seats and the waiting list (SPEC §18.4, M-0011). STUB: the signatures are
 * fixed; Builder B implements them. Until then every function refuses.
 */
import type { Db } from "./db";
import type { Defer } from "./mail";

/** Accounts that exist and are not suspended: the public count (D-0012 §B). */
export async function memberCount(_db: Db): Promise<number> {
  throw new Error("seats.memberCount is not implemented yet (SPEC §18.4).");
}

/** How many seats are open, and how many addresses wait in line. */
export async function seatState(_db: Db): Promise<{ open: number; waiting: number }> {
  throw new Error("seats.seatState is not implemented yet (SPEC §18.4).");
}

/**
 * Take a seat, or wait in line. Same answer and same work in the request
 * for every address; the rest runs after the response (SPEC §18.4).
 */
export async function requestSeat(
  _db: Db,
  _input: { email: string; ipHash: string; now?: Date; defer?: Defer },
): Promise<void> {
  throw new Error("seats.requestSeat is not implemented yet (SPEC §18.4).");
}

/** Administrator only: open seats, inviting the oldest waiting first. */
export async function openSeats(
  _db: Db,
  _adminId: string,
  _count: number,
  _opts?: { now?: Date; defer?: Defer },
): Promise<{ opened: number; invited: number }> {
  throw new Error("seats.openSeats is not implemented yet (SPEC §18.4).");
}

/** Administrator only: remove an address from the line at its owner's request. */
export async function forgetWaitlistAddress(
  _db: Db,
  _adminId: string,
  _email: string,
): Promise<void> {
  throw new Error("seats.forgetWaitlistAddress is not implemented yet (SPEC §18.4).");
}
