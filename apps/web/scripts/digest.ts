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
import { closeDb, getDb } from "../src/core/db";
import { runWeeklyDigest } from "../src/core/digest";

async function main(): Promise<void> {
  config({ path: [".env.local", ".env"], quiet: true });
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
  console.error("The weekly email run failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
