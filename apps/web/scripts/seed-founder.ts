/**
 * Create the first account: no inviter, an administrator, with invites.
 *
 *   pnpm --filter @ours/web seed:founder -- --email ada@example.test \
 *     --handle ada_fict --name "Ada (FICTIONAL)" [--invites 10]
 *
 * Under M-0010 only fictional data exists: the address must end in
 * example.test, and nothing here lifts that. Seeding a real person belongs
 * to a later release mandate, which changes this file under its own
 * authority.
 *
 * Like every account, it can be created only while a data controller is
 * named (DATA_CONTROLLER and DATA_CONTROLLER_EMAIL): a missing human
 * decision switches account creation off, including here.
 *
 * It makes the FIRST account only, and refuses once any account exists:
 * /rules says every account except the founder's is invited by a person
 * (the second verification's honesty defect 9). The check and the insert
 * share one transaction under an advisory lock, so two runs at once cannot
 * both pass it (`createFirstAccount`, which the release step shares).
 *
 * The deployed site's founder account is not made here: Vercel's
 * production build makes it from the founder's own settings (D-0021 §D,
 * scripts/release.ts). This script stays fictional-only.
 */
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createEmailToken } from "../src/core/auth";
import { accountCreationOpen, appUrl, DEFAULT_INVITES } from "../src/core/config";
import { closeDb, getDb, isLocal } from "../src/core/db";
import { isCoreError } from "../src/core/errors";
import { createFirstAccount } from "../src/core/founder";
import { normEmail, validDisplayName, validHandle } from "../src/core/validate";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** True for example.test and its subdomains, the only addresses allowed here. */
export function isFictionalAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return domain === "example.test" || domain.endsWith(".example.test");
}

async function main(): Promise<void> {
  config({ path: [".env.local", ".env"], quiet: true });
  // Before anything connects: a local script uses only a database on this
  // machine (D-0021 §F; the verification of M-0018).
  const target = process.env.DATABASE_URL?.trim();
  if (target && !isLocal(target)) {
    fail("Refused: this script runs only against a database on this machine (D-0021 §F).");
  }

  const { values } = parseArgs({
    // pnpm forwards a literal "--"; ignore it.
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      email: { type: "string" },
      handle: { type: "string" },
      name: { type: "string" },
      invites: { type: "string" },
    },
    allowPositionals: false,
  });
  if (!values.email || !values.handle || !values.name) {
    fail(
      'Usage: seed:founder -- --email <address> --handle <handle> --name "<display name>" [--invites N]',
    );
  }

  let email: string;
  let handle: string;
  let name: string;
  try {
    email = normEmail(values.email);
    handle = validHandle(values.handle);
    name = validDisplayName(values.name);
  } catch (error) {
    fail(isCoreError(error) ? error.message : String(error));
  }

  if (!isFictionalAddress(email)) {
    fail(
      "Refused: under M-0010 only fictional accounts exist. Use an address ending in example.test.",
    );
  }
  if (!accountCreationOpen()) {
    fail(
      "Refused: no data controller is named. Set DATA_CONTROLLER and DATA_CONTROLLER_EMAIL first.",
    );
  }

  const invites = values.invites ? Number(values.invites) : DEFAULT_INVITES;
  if (!Number.isInteger(invites) || invites < 0 || invites > 1000) {
    fail("--invites must be a whole number from 0 to 1000.");
  }

  const db = getDb();
  const now = new Date();
  const created = await createFirstAccount(db, { email, handle, displayName: name, invites, now });
  if (!created) {
    fail(
      "Refused: an account already exists. The founder's account is the first one; every other account is invited by a person.",
    );
  }

  const token = await createEmailToken(db, { email, purpose: "sign_in", now });
  console.log(`Created @${handle} (administrator, ${invites} invites).`);
  console.log("Sign in within 15 minutes, once:");
  console.log(`  ${appUrl()}/auth#${token}`);
}

main()
  .catch((error: unknown) => {
    console.error("seed:founder failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
