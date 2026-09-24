"use server";

/**
 * Delete your account (SPEC §8 "Export and delete"). The core checks the
 * typed username and deletes in one transaction; then this browser's
 * cookies are cleared and the person leaves for the public goodbye page,
 * since no signed-in page exists for them any more.
 */
import { redirect } from "next/navigation";
import { deleteAccount } from "@/core/accounts";
import { getDb } from "@/core/db";
import type { DeleteState } from "@/components/settings/DeleteAccountForm";
import { run } from "@/web/actions";
import { clearJoinCookie, clearSessionCookie } from "@/web/session";
import { requireViewer } from "@/web/viewer";

export async function deleteAccountAction(
  _previous: DeleteState,
  form: FormData,
): Promise<DeleteState> {
  const viewer = await requireViewer();
  const typed = form.get("confirm");
  const result = await run(async () => {
    await deleteAccount(getDb(), viewer.id, typeof typed === "string" ? typed : "");
  });
  if (!result.ok) return result;
  await clearSessionCookie();
  await clearJoinCookie();
  redirect("/signin/goodbye");
}
