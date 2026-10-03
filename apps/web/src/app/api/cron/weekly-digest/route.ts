/**
 * GET or POST /api/cron/weekly-digest (SPEC §8, §18.20): runs the weekly
 * email once.
 *
 * Requires `Authorization: Bearer ${CRON_SECRET}`. With CRON_SECRET unset
 * the route refuses every request: a missing setting switches the feature
 * off, it is never defaulted. Vercel's scheduler calls with GET, sending
 * CRON_SECRET as that header (D-0021 §E; apps/web/vercel.json schedules it
 * on Mondays at 08:00 UTC); a person or a script can POST. Both methods are
 * the same handler. HEAD, which Next.js would answer by running GET, is
 * refused here; OPTIONS is answered by the framework with the methods
 * allowed, and runs nothing (the verification of M-0018). The answer
 * carries counts, never a message from an error. A second call in the same
 * week sends nothing new: each person gets at most one a week.
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

/** Vercel's scheduler calls with GET (D-0021 §E): the same handler, the same secret. */
export const GET = POST;

/** HEAD runs nothing: without it, Next.js would answer HEAD by running GET. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET, POST", ...NO_STORE } });
}
