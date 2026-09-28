"use server";

/**
 * The front page's Get in form (SPEC §18.4): ask for a seat.
 *
 * Every valid address gets the same answer. Whether it has an account, is
 * already in line or took a seat is worked out after the response
 * (`afterResponse`, SPEC §17 item 4), and the page says the same words to
 * everyone. Only three things are refused, and none of them says anything
 * about the address: seats being off ("Joining opens soon."), a malformed
 * address, and a rate limit.
 */
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { requestSeat, SEATS_CLOSED } from "@/core/seats";
import { afterResponse, GENERIC_ERROR } from "@/web/actions";
import { clientIpHash } from "@/web/request";

export type SeatResult = { ok: true } | { error: string };

export async function takeSeat(_previous: unknown, form: FormData): Promise<SeatResult> {
  const email = form.get("email");
  try {
    await requestSeat(getDb(), {
      email: typeof email === "string" ? email : "",
      ipHash: await clientIpHash(),
      defer: afterResponse,
    });
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
