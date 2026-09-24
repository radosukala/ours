"use server";

/**
 * /settings actions (SPEC §8 "Sign out", §10). Each one gets the viewer
 * itself and acts only on the viewer's own account. The name, username and
 * the followers setting show in the navigation and the composer, so those
 * revalidate the whole layout.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  saveProfile,
  setAcceptsFollowers,
  setWeeklyEmail,
} from "@/core/accounts";
import { revokeAllSessions, revokeSession } from "@/core/auth";
import { getDb } from "@/core/db";
import { type ActionResult, run } from "@/web/actions";
import { clearSessionCookie, currentSessionId } from "@/web/session";
import { requireViewer } from "@/web/viewer";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function saveProfileAction(
  form: FormData,
): Promise<ActionResult<{ handle: string }>> {
  return run(async () => {
    const viewer = await requireViewer();
    const saved = await saveProfile(getDb(), viewer.id, {
      displayName: text(form, "displayName"),
      handle: text(form, "handle"),
      bio: text(form, "bio"),
    });
    revalidatePath("/", "layout");
    return saved;
  });
}

export async function setAcceptsFollowersAction(
  value: boolean,
): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await setAcceptsFollowers(getDb(), viewer.id, value);
    revalidatePath("/", "layout");
  });
}

export async function setWeeklyEmailAction(value: boolean): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await setWeeklyEmail(getDb(), viewer.id, value);
    revalidatePath("/settings");
  });
}

/** Sign out: revoke this session only. */
export async function signOutAction(): Promise<void> {
  await requireViewer();
  const sessionId = await currentSessionId();
  if (sessionId) await revokeSession(getDb(), sessionId);
  await clearSessionCookie();
  redirect("/signin?signed_out=1");
}

/** Sign out everywhere: revoke every session of the account, this one too. */
export async function signOutEverywhereAction(): Promise<void> {
  const viewer = await requireViewer();
  await revokeAllSessions(getDb(), viewer.id);
  await clearSessionCookie();
  redirect("/signin?signed_out=1");
}
