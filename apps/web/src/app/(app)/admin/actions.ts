"use server";

/**
 * The moderation decisions, and the two seat controls. Each one asks the
 * core, which refuses anyone who is not an active administrator with the
 * same NOT_FOUND as a missing report, and records who decided and when. A
 * decision notifies other people, so the shell's counts are refreshed.
 */
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { dismissReport, removeContent, suspendAccount } from "@/core/reports";
import { forgetWaitlistAddress, openSeats } from "@/core/seats";
import { afterResponse, run } from "@/web/actions";
import { requireViewer } from "@/web/viewer";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** A whole number as typed, or NaN, which the core refuses. */
function wholeNumber(text: string): number {
  const digits = text.trim();
  return /^[0-9]{1,6}$/.test(digits) ? Number(digits) : Number.NaN;
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

/**
 * Open seats (SPEC §18.4). The oldest addresses in line are invited in the
 * same step; their emails go after the response.
 */
export async function openSeatsAction(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    const result = await openSeats(getDb(), viewer.id, wholeNumber(field(form, "count")), {
      defer: afterResponse,
    });
    revalidatePath("/", "layout");
    return result;
  });
}

/** Remove an address from the line, when its owner asks (SPEC §18.4). */
export async function forgetAction(_previous: unknown, form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    await forgetWaitlistAddress(getDb(), viewer.id, field(form, "email"));
    revalidatePath("/", "layout");
  });
}
