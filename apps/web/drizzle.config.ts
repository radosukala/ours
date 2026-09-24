import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

// `drizzle-kit generate` reads only the schema; the URL matters for
// commands that talk to a database. Migrations are applied with
// `pnpm --filter @ours/web db:migrate` (scripts/migrate.ts), not drizzle-kit.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgresql://localhost:5432/ours_web_dev",
  },
  strict: true,
  verbose: true,
});
