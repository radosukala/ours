/**
 * POST /api/cron/weekly-digest (SPEC §8): runs the weekly email once.
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`. With CRON_SECRET unset
 * the route refuses every request: a missing setting switches the feature
 * off, it is never defaulted. Only POST is exported, so any other method is
 * refused by the framework. The answer carries counts, never a message
 * from an error.
 */
import { cronSecret } from "@/core/config";
import { getDb } from "@/core/db";
import { runWeeklyDigest } from "@/core/digest";
import { timingSafeEqualStr } from "@/core/ids";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function refuse(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) return refuse(503, "The weekly email is switched off.");

  const given = request.headers.get("authorization") ?? "";
  if (!timingSafeEqualStr(given, `Bearer ${secret}`)) {
    return refuse(401, "Not allowed.");
  }

  try {
    const run = await runWeeklyDigest(getDb(), new Date());
    return Response.json({ ok: true, ...run }, { headers: NO_STORE });
  } catch (error) {
    console.error(
      "[ours] weekly email run failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return refuse(500, "The weekly email run failed.");
  }
}
