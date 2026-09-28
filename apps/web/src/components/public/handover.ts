/**
 * The facts the front page, /contract and the status line write (SPEC
 * §18.1, §18.11), each in one place.
 *
 * The threshold comes from its one constant in core/config; the notice
 * period and the maintainer's name are written here. All three await the
 * founder's confirmation (D-0012; SPEC §18.11), so a confirmed change is
 * one line.
 */
import { HANDOVER_THRESHOLD } from "@/core/config";

/** A count as people read it, with thousands separators: 1,284. */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** The handover threshold as every page writes it: "100,000". */
export const THRESHOLD = formatCount(HANDOVER_THRESHOLD);

/** Days of notice before a change to promises 3 to 7 applies. */
export const NOTICE_DAYS = 60;

/** The maintainer's name as the site signs it. */
export const MAINTAINER = "Rado";
