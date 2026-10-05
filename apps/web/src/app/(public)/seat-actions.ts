"use server";

/**
 * The join forms (SPEC §18.4): ask for a seat, and, from the front door's
 * first screen, keep a need named beside the address (D-0024 §C).
 *
 * Every valid address gets the same answer. Whether it has an account, is
 * already in line or took a seat is worked out after the response
 * (`afterResponse`, SPEC §17 item 4), and the page says the same words to
 * everyone. Only four things are refused, and none of them says anything
 * about the address: seats being off ("Joining opens soon."), a malformed
 * address, a rate limit, and a need that is too long.
 *
 * The need rides on the seat request's gates and limits: it is read first,
 * so a bad one is refused before anything is counted, and it is kept only
 * after `requestSeat` has let the request through. It is kept without the
 * address (`nameNeed`). If keeping it fails, the request still stands: the
 * address is in line, or its link is on its way, and the failure is logged
 * by name; a second submit would keep the need again, which is the same
 * as naming it twice.
 */
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { nameNeed, normalizeNeed } from "@/core/needs";
import { requestSeat, SEATS_CLOSED } from "@/core/seats";
import { afterResponse, GENERIC_ERROR } from "@/web/actions";
import { clientIpHash } from "@/web/request";

/** Refused at the address, or, with `field`, at the need. */
export type SeatResult = { ok: true } | { error: string; field?: "need" };

export async function takeSeat(_previous: unknown, form: FormData): Promise<SeatResult> {
  const email = form.get("email");
  let need: string | null;
  try {
    need = normalizeNeed(form.get("need"));
  } catch (error) {
    unstable_rethrow(error);
    if (isCoreError(error)) return { error: error.message, field: "need" };
    throw error;
  }
  try {
    await requestSeat(getDb(), {
      email: typeof email === "string" ? email : "",
      ipHash: await clientIpHash(),
      defer: afterResponse,
    });
    if (need !== null) await keepNeed(need);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    if (isCoreError(error)) {
      return { error: error.code === "CLOSED" ? SEATS_CLOSED : error.message };
    }
    // Never the message: it can carry an address.
    console.error(
      "[ours] a seat request failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { error: GENERIC_ERROR };
  }
}

/** Keep the need; a failure is logged by name and the request stands. */
async function keepNeed(text: string): Promise<void> {
  try {
    await nameNeed(getDb(), { text });
  } catch (error) {
    unstable_rethrow(error);
    console.error("[ours] a need wasn't kept:", error instanceof Error ? error.name : "unknown error");
  }
}
