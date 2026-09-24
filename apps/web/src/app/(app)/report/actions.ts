"use server";

/**
 * Sending a report. The core decides everything: whether the reporter can
 * see the target (otherwise NOT_FOUND, as if it did not exist), that it is
 * not their own, the category, the details and the daily limit.
 */
import { getDb } from "@/core/db";
import { createReport } from "@/core/reports";
import type { ReportCategory, ReportTargetKind } from "@/core/schema";
import { run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitReport(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    // The casts only name the fields; createReport refuses any value that
    // is not a real kind or category.
    await createReport(getDb(), viewer.id, {
      kind: field(form, "kind") as ReportTargetKind,
      targetId: field(form, "id"),
      category: field(form, "category") as ReportCategory,
      details: field(form, "details"),
    });
  });
}
