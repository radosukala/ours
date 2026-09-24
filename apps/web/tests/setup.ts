/**
 * Vitest global setup (SPEC §15): a fresh database for this run.
 *
 * Creates `ours_web_test_<random>` on the local server named by
 * TEST_DATABASE_ADMIN_URL (default postgresql://localhost:5432/postgres),
 * applies the migrations, hands the URL to the tests, and drops the
 * database when the run ends.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { migrateUrl } from "../scripts/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

async function onAdmin(adminUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export default async function setup(project: TestProject) {
  const adminUrl =
    process.env.TEST_DATABASE_ADMIN_URL ??
    "postgresql://localhost:5432/postgres";
  const name = `ours_web_test_${randomBytes(6).toString("hex")}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  await onAdmin(adminUrl, `create database "${name}"`);
  try {
    await migrateUrl(databaseUrl);
  } catch (error) {
    await onAdmin(adminUrl, `drop database if exists "${name}" with (force)`);
    throw error;
  }

  process.env.DATABASE_URL = databaseUrl;
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await onAdmin(adminUrl, `drop database if exists "${name}" with (force)`);
  };
}
