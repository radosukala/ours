"use server";

/**
 * Finish joining (SPEC §8 "Join from an invite", steps 3–4). The pending
 * join comes from the signed `ours_join` cookie, never from the form.
 * `completeJoin` re-checks everything in one transaction; on success the
 * join cookie is deleted, the session cookie is set, and the new person
 * goes to /home.
 */
import { redirect } from "next/navigation";
import { pendingJoinFromCookie } from "@/core/auth";
import { getDb } from "@/core/db";
import { CoreError } from "@/core/errors";
import { completeJoin, JOIN_EXPIRED } from "@/core/invites";
import { type ActionResult, run } from "@/web/actions";
import {
  clearJoinCookie,
  readJoinCookie,
  setSessionCookie,
} from "@/web/session";

export type JoinFormState =
  | (ActionResult & { values: { displayName: string; handle: string; adult: boolean } })
  | null;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function completeJoinAction(
  _prev: JoinFormState,
  form: FormData,
): Promise<JoinFormState> {
  const values = {
    displayName: text(form, "displayName").slice(0, 200),
    handle: text(form, "handle").slice(0, 100),
    adult: form.get("adult") === "yes",
  };
  const result = await run(async () => {
    const db = getDb();
    const now = new Date();
    const pending = await pendingJoinFromCookie(db, await readJoinCookie(), now);
    if (!pending) throw new CoreError("NOT_FOUND", JOIN_EXPIRED);
    const { session } = await completeJoin(db, {
      pendingJoinId: pending.id,
      displayName: values.displayName,
      handle: values.handle,
      adultConfirmed: values.adult,
      now,
    });
    await setSessionCookie(session.cookieValue, session.expiresAt);
    await clearJoinCookie();
  });
  if (result.ok) redirect("/home");
  return { ...result, values };
}
