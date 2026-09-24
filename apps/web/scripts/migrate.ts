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

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/** Apply every pending migration to the database at `url`. */
export async function migrateUrl(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
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
