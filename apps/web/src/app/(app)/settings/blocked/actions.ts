"use server";

/**
 * Undo a block or a mute from /settings/blocked. The rules live in M2's
 * core/connections.ts; these actions only pass the viewer's own id.
 */
import { revalidatePath } from "next/cache";
import { unblock, unmute } from "@/core/connections";
import { getDb } from "@/core/db";
import { type ActionResult, run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

export async function unblockAction(personId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unblock(getDb(), viewer.id, String(personId));
    revalidatePath("/settings/blocked");
  });
}

export async function unmuteAction(personId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await unmute(getDb(), viewer.id, String(personId));
    revalidatePath("/settings/blocked");
  });
}
