/**
 * The words on the front page's join button (D-0016 §B, SPEC §18.16): what
 * the form will do with the address. The form (`takeSeat`, SPEC §18.4)
 * only ever joins: with a seat open it sends the link, and with none it
 * puts the address in line.
 *
 * A plain module, so the front page (a server component) and the form (a
 * client component) both read the same words.
 */

/** A seat is open, or the seats can't be read. */
export const JOIN_LABEL = "Join our.one";

/** No seat is open: the address will wait in line. */
export const WAITING_LIST_LABEL = "Join the waiting list";

/**
 * The label for the seats open now. When they can't be read (null), a seat
 * may be open, so the button says "Join our.one"; the answer after joining
 * is true either way (D-0015 §H).
 */
export function joinLabel(seatsOpen: number | null): string {
  return seatsOpen !== null && seatsOpen <= 0 ? WAITING_LIST_LABEL : JOIN_LABEL;
}
