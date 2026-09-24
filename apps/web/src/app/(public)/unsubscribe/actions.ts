"use server";

/**
 * Stop the weekly email from the link in it (SPEC §8). No sign-in is
 * needed — the signed token is the permission — so, unlike the (app)
 * actions, this one does not call requireViewer(): a person who is signed
 * out, or signed in as someone else, can still stop the email that was
 * sent to them. The core checks the signature.
 */
import { digestUnsubscribe } from "@/core/digest";
import { getDb } from "@/core/db";
import { type ActionResult, run } from "@/web/actions";

export async function unsubscribeAction(token: unknown): Promise<ActionResult> {
  return run(async () => {
    await digestUnsubscribe(getDb(), token);
  });
}
