import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Tests run against a real Postgres. tests/setup.ts creates a fresh
 * database for the run and drops it afterwards; files run one at a time
 * because they share it and each one truncates between tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // SPEC §15: fixed, FICTIONAL values. Controller-gate tests override
    // DATA_CONTROLLER* locally.
    env: {
      NODE_ENV: "test",
      SESSION_SECRET:
        "test-secret-0123456789abcdef0123456789abcdef0123456789abcdef0123",
      MAIL_TRANSPORT: "outbox",
      DATA_CONTROLLER: "FICTIONAL Controller",
      DATA_CONTROLLER_EMAIL: "controller@example.test",
      APP_URL: "http://localhost:3000",
      CRON_SECRET: "test-cron-secret-FICTIONAL",
    },
  },
});
