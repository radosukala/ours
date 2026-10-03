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

/**
 * Whether an address names a database on this machine: localhost, its IPv4
 * and IPv6 forms, or a local socket (no host). The local scripts and the
 * development server use only such a database, so a real key left in
 * .env.local never reaches a local run (D-0021 §F; the verification of
 * M-0018).
 */
export function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[(.*)\]$/, "$1");
    if (host === "") return true;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export type ConnectionOptions = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: true };
  enableChannelBinding?: boolean;
};

/**
 * How to connect to the database at `url`, one rule for the site, the
 * migrations and the release (the verification of M-0018):
 *
 * - TLS, with the certificate checked, for any host but this machine, and
 *   for this machine too when the address asks for it (`sslmode`, as Neon
 *   writes it);
 * - the address's own `sslmode` and `channel_binding` are taken out and
 *   said to pg directly, so pg prints no warning about them into a log.
 */
export function connectionOptions(url: string): ConnectionOptions {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // An address that can't be read: pg reports it; the rule stays the same.
    return {
      connectionString: url,
      ssl: isLocal(url) ? false : { rejectUnauthorized: true },
    };
  }
  const mode = u.searchParams.get("sslmode");
  const binding = u.searchParams.get("channel_binding");
  u.searchParams.delete("sslmode");
  u.searchParams.delete("channel_binding");
  const tls = !isLocal(url) || (mode !== null && mode !== "disable");
  return {
    connectionString: u.toString(),
    ssl: tls ? { rejectUnauthorized: true } : false,
    ...(binding === "require" ? { enableChannelBinding: true } : {}),
  };
}

function create(url: string): Holder {
  const pool = new Pool({
    ...connectionOptions(url),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    // An idle client lost its connection; the pool replaces it. Logged,
    // never thrown, so a database restart does not take the server down.
    // Never the message: it can carry the database's host (the verification of M-0018).
    console.error("[ours] idle database client error:", error.name);
  });
  return { url, pool, db: drizzle(pool, { schema }) };
}

/** The shared database handle, created on first use. */
export function getDb(): Database {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  // A local run never reaches the real database, whatever .env.local says
  // (D-0021 §F; the verification of M-0018).
  if (process.env.NODE_ENV === "development" && !isLocal(url)) {
    throw new Error("In development, our.one uses only a database on this machine (D-0021 §F).");
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
