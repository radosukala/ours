/**
 * Apply the SQL migrations in drizzle/ to DATABASE_URL.
 *
 *   pnpm --filter @ours/web db:migrate
 *
 * tests/setup.ts imports `migrateUrl` to prepare the test database.
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { connectionOptions, isLocal } from "../src/core/db";

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Apply every pending migration to the database at `url`, with the site's
 * TLS rule (`connectionOptions`), one run at a time: a session-wide lock is
 * held while they run, so a second run waits, then finds nothing to do (the
 * verification of M-0018). Ending the session releases the lock.
 */
export async function migrateUrl(url: string): Promise<void> {
  const options = connectionOptions(url);
  const lock = new pg.Client(options);
  await lock.connect();
  try {
    await lock.query("select pg_advisory_lock(hashtextextended('ours:migrations', 0))");
    const pool = new pg.Pool({ ...options, max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await pool.end();
    }
  } finally {
    await lock.end();
  }
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main(): Promise<void> {
  config({ path: [".env.local", ".env"], quiet: true });
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }
  if (!isLocal(url)) {
    console.error(
      "Refused: db:migrate runs only against a database on this machine. The deployed site's database is migrated by Vercel's production build (D-0021 §D, §F).",
    );
    process.exit(1);
  }
  await migrateUrl(url);
  console.log(`Migrations applied to ${redact(url)}`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
