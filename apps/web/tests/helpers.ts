/**
 * Test helpers (SPEC §15). Every person here is FICTIONAL, with an
 * example.test address.
 *
 * The factories insert rows directly: they are fixtures that set up a
 * state, not the product's way of reaching it. Tests of behaviour call the
 * core functions.
 */
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, inject } from "vitest";
import { closeDb, type Database, getDb } from "@/core/db";
import { newId } from "@/core/ids";
import * as schema from "@/core/schema";
import {
  accounts,
  type Account,
  type Audience,
  blocks,
  follows,
  friendships,
  mutes,
  type Post,
  posts,
} from "@/core/schema";

/**
 * The database for this test run: always the one tests/setup.ts created.
 * A DATABASE_URL inherited from the shell or a .env file is never used,
 * because reset() empties every table of whatever database it is given.
 */
export function db(): Database {
  const url = inject("databaseUrl");
  if (process.env.DATABASE_URL !== url) process.env.DATABASE_URL = url;
  return getDb();
}

afterAll(async () => {
  await closeDb();
});

const TABLES = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`);

const TEST_DATABASE = /^ours_web_test_[0-9a-f]+$/;

/** Empty every table — only ever in a database tests/setup.ts created. */
export async function reset(): Promise<void> {
  const result = await db().execute(sql`select current_database() as name`);
  const name = String((result.rows[0] as { name?: unknown } | undefined)?.name);
  if (!TEST_DATABASE.test(name)) {
    throw new Error(`reset() refused: "${name}" is not a test database.`);
  }
  await db().execute(sql.raw(`truncate table ${TABLES.join(", ")} cascade`));
}

/** A fixed clock: `at("2026-09-01T12:00:00Z")`. */
export function at(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`bad date: ${iso}`);
  return date;
}

/** Minutes, hours and days after a date. */
export const plus = {
  minutes: (d: Date, n: number) => new Date(d.getTime() + n * 60_000),
  hours: (d: Date, n: number) => new Date(d.getTime() + n * 3_600_000),
  days: (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000),
};

type Ref = string | { id: string };
const idOf = (ref: Ref) => (typeof ref === "string" ? ref : ref.id);

let counter = 0;

/** A FICTIONAL account. */
export async function makeAccount(
  options: {
    handle?: string;
    displayName?: string;
    email?: string;
    acceptsFollowers?: boolean;
    isAdmin?: boolean;
    suspended?: boolean;
    invitesRemaining?: number;
    invitedBy?: Ref | null;
    weeklyEmail?: boolean;
    createdAt?: Date;
  } = {},
): Promise<Account> {
  counter += 1;
  const handle =
    options.handle ??
    `p${counter}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 20);
  const [row] = await db()
    .insert(accounts)
    .values({
      id: newId(),
      email: (options.email ?? `${handle}@example.test`).toLowerCase(),
      handle,
      displayName: options.displayName ?? `FICTIONAL ${handle}`,
      bio: "FICTIONAL test person",
      invitedBy: options.invitedBy ? idOf(options.invitedBy) : null,
      acceptsFollowers: options.acceptsFollowers ?? false,
      isAdmin: options.isAdmin ?? false,
      suspendedAt: options.suspended ? new Date() : null,
      invitesRemaining: options.invitesRemaining ?? 10,
      weeklyEmail: options.weeklyEmail ?? true,
      adultConfirmedAt: options.createdAt ?? new Date(),
      createdAt: options.createdAt ?? new Date(),
    })
    .returning();
  if (!row) throw new Error("makeAccount: insert returned nothing");
  return row;
}

/** A friendship row for the pair (ordered a < b). */
export async function befriend(a: Ref, b: Ref, createdAt?: Date): Promise<void> {
  const [x, y] = [idOf(a), idOf(b)].sort();
  await db()
    .insert(friendships)
    .values({ aId: x!, bId: y!, createdAt: createdAt ?? new Date() });
}

/** A follow a → b. */
export async function follow(a: Ref, b: Ref, createdAt?: Date): Promise<void> {
  await db()
    .insert(follows)
    .values({
      followerId: idOf(a),
      followeeId: idOf(b),
      createdAt: createdAt ?? new Date(),
    });
}

/** A post by `a`. */
export async function post(
  a: Ref,
  options: { audience?: Audience; body?: string; at?: Date } = {},
): Promise<Post> {
  const [row] = await db()
    .insert(posts)
    .values({
      id: newId(),
      authorId: idOf(a),
      body: options.body ?? "A FICTIONAL post.",
      audience: options.audience ?? "friends",
      createdAt: options.at ?? new Date(),
    })
    .returning();
  if (!row) throw new Error("post: insert returned nothing");
  return row;
}

/**
 * A block row a → b, and nothing else. The core's block() also removes the
 * friendship, follows and requests; this fixture does not, so a test can
 * check that the predicate denies on the block alone.
 */
export async function block(a: Ref, b: Ref): Promise<void> {
  await db()
    .insert(blocks)
    .values({ blockerId: idOf(a), blockedId: idOf(b) });
}

/** A mute a → b. */
export async function mute(a: Ref, b: Ref): Promise<void> {
  await db()
    .insert(mutes)
    .values({ muterId: idOf(a), mutedId: idOf(b) });
}
