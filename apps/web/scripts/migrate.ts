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
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { connectionOptions, isLocal } from "../src/core/db";
import { describeError } from "../src/core/db-errors";

export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

/**
 * Apply every pending migration to the database at `url`, with the site's
 * TLS rule (`connectionOptions(url)`), one run at a time.
 *
 * Everything happens on one connection, in one transaction, under a lock
 * that belongs to the transaction (`pg_advisory_xact_lock`): a second run
 * waits, then finds nothing to do, and the lock ends with the transaction,
 * even through a pooler that hands each transaction to a different server
 * connection (the re-check of M-0018, RC5). A failure rolls back all of it,
 * the bookkeeping table included. The connection's errors reach the caller
 * as a rejected query, never as an unhandled event (RC6).
 *
 * The bookkeeping is drizzle's, so `drizzle-kit` and earlier databases
 * agree: the table drizzle.__drizzle_migrations, a migration applied when
 * its folder time is later than the last one recorded, its statements
 * split at drizzle's breakpoints.
 */
export async function migrateUrl(url: string): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const client = new pg.Client(connectionOptions(url));
  client.on("error", () => undefined);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended('ours:migrations', 0))");
    await client.query('create schema if not exists "drizzle"');
    await client.query(
      'create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)',
    );
    const { rows } = await client.query<{ created_at: string | null }>(
      'select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1',
    );
    const last = rows[0]?.created_at == null ? null : Number(rows[0].created_at);
    for (const migration of migrations) {
      if (last !== null && last >= migration.folderMillis) continue;
      for (const statement of migration.sql) await client.query(statement);
      await client.query('insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)', [
        migration.hash,
        migration.folderMillis,
      ]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
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
  // No address: the log names nothing of the database (the re-check of M-0018, RC10).
  console.log("Migrations applied.");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    // What it means and its code, never its message (the re-check of M-0018, RC10).
    console.error(`Migration failed: ${describeError(error)}`);
    process.exit(1);
  });
}
