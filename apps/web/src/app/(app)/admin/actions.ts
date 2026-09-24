"use server";

/**
 * The moderation decisions. Each one asks the core, which refuses anyone
 * who is not an active administrator with the same NOT_FOUND as a missing
 * report, and records who decided and when. A decision notifies other
 * people, so the shell's counts are refreshed.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { dismissReport, removeContent, suspendAccount } from "@/core/reports";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function removeReported(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    await removeContent(getDb(), viewer.id, field(form, "reportId"), {
      category: field(form, "category"),
      reason: field(form, "reason"),
    });
    revalidatePath("/", "layout");
  });
}

export async function suspendReported(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    await suspendAccount(getDb(), viewer.id, field(form, "reportId"), {
      reason: field(form, "reason"),
    });
    revalidatePath("/", "layout");
  });
}

export async function dismissReported(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    await dismissReport(getDb(), viewer.id, field(form, "reportId"), {
      note: field(form, "note"),
    });
    revalidatePath("/", "layout");
  });
}
