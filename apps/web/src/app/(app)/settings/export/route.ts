/**
 * GET /settings/export: your data as a JSON download (SPEC §8 "Export and
 * delete").
 *
 * It takes nothing from the request: the account is the one signed in,
 * and there is no parameter that could name another. Signed out (or
 * suspended), it redirects to /signin like every page in (app). What the
 * file holds, and what it leaves out, is decided in core/export.ts; the
 * /settings page explains it.
 */
import { getDb } from "@/core/db";
import { exportAccount, exportFilename } from "@/core/export";
import { requireViewer } from "@/web/viewer";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const viewer = await requireViewer();
  const now = new Date();
  const data = await exportAccount(getDb(), viewer.id, now);
  const filename = exportFilename(data.account.handle, now);
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
