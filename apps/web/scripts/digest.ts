/**
 * Run the weekly email once, locally (SPEC §8).
 *
 *   pnpm --filter @ours/web digest
 *
 * The same run the cron route makes. Under M-0010 the mail transport is
 * the outbox, so nothing reaches a real address: the emails are written to
 * the `outbox` table. Running it twice in one week sends nothing new.
 */
import { config } from "dotenv";
import { closeDb, getDb, isLocal } from "../src/core/db";
import { runWeeklyDigest } from "../src/core/digest";

async function main(): Promise<void> {
  config({ path: [".env.local", ".env"], quiet: true });
  // A local script uses only a database on this machine (D-0021 §F; the
  // verification of M-0018). The deployed site's weekly email runs on
  // Vercel's schedule.
  const url = process.env.DATABASE_URL?.trim();
  if (url && !isLocal(url)) {
    console.error("Refused: this script runs only against a database on this machine (D-0021 §F).");
    process.exit(1);
  }
  try {
    const run = await runWeeklyDigest(getDb(), new Date());
    console.log(
      `Weekly email for the week of ${run.weekStart}: ` +
        `${run.sent} sent, ${run.skipped} skipped (nothing to say), ${run.failed} failed.`,
    );
    if (run.failed > 0) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  // Never the message: it can carry an address (the verification of M-0018).
  console.error("The weekly email run failed:", error instanceof Error ? error.name : "unknown error");
  process.exit(1);
});
