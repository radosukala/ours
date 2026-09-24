/**
 * GET /api/health (SPEC §10): counts only — accounts, friendships, posts
 * in the last 7 days — and whether the database answered, as true or
 * false. No names, no ids, never an error's message.
 */
import { getDb } from "@/core/db";
import { health } from "@/core/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await health(getDb);
  return Response.json(
    {
      ok: result.database,
      database: result.database,
      counts: result.counts,
    },
    {
      status: result.database ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
