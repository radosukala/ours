"use server";

/**
 * The front page's Get in form (SPEC §18.4). STUB: the signature is fixed;
 * Builder B implements it.
 */
export type SeatResult = { ok: true } | { error: string };

export async function takeSeat(_previous: unknown, _form: FormData): Promise<SeatResult> {
  return { error: "Joining opens soon." };
}
