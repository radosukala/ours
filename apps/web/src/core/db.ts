/**
 * The database handle.
 *
 * `getDb()` creates the pool the first time it is called, never at import
 * (SPEC §2 rule 10): a missing DATABASE_URL becomes an error when a query
 * is attempted, which the boundary can catch and name, instead of a crash
 * while a page module is loading. In development the pool is kept on
 * globalThis so hot reloads do not open a new pool on every edit.
 */
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;

/** The top-level drizzle instance. */
export type Database = NodePgDatabase<Schema>;

/**
 * What every core function takes: the database or a transaction. Both
 * satisfy this type, so a function can be called inside or outside one.
 */
export type Db = PgDatabase<
  NodePgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

type Holder = { url: string; pool: Pool; db: Database };

declare global {
  var __oursWebDb: Holder | undefined;
}

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function create(url: string): Holder {
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal(url) ? false : { rejectUnauthorized: true },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    // An idle client lost its connection; the pool replaces it. Logged,
    // never thrown, so a database restart does not take the server down.
    console.error("[ours] idle database client error:", error.message);
  });
  return { url, pool, db: drizzle(pool, { schema }) };
}

/** The shared database handle, created on first use. */
export function getDb(): Database {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  const held = globalThis.__oursWebDb;
  if (held && held.url === url) return held.db;
  if (held) void held.pool.end().catch(() => undefined);
  const next = create(url);
  globalThis.__oursWebDb = next;
  return next.db;
}

/** Close the shared pool (scripts and tests). Safe to call more than once. */
export async function closeDb(): Promise<void> {
  const held = globalThis.__oursWebDb;
  globalThis.__oursWebDb = undefined;
  if (held) await held.pool.end();
}

/**
 * Run `fn` in a transaction. Inside an existing transaction this opens a
 * savepoint, so a core function that needs atomicity can use it whether or
 * not its caller already opened one.
 */
export async function withTx<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
