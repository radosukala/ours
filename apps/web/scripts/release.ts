/**
 * The release step (D-0021 §D, M-0018, SPEC §18.20). Vercel's production
 * build runs it before `next build`: apps/web/vercel.json runs
 * `pnpm run vercel-build`.
 *
 * It does something only in Vercel's production build of the one commit
 * the founder names in OURS_RELEASE, the go M-0012 requires. Any other
 * build (another commit, a preview, a local build) touches no database, and
 * says why. A push alone never reaches the database: BUILD doesn't become
 * DEPLOY by itself (AGENTS.md §8).
 *
 * In that build it:
 *
 * 1. applies the migrations to DATABASE_URL. Without an address the build
 *    fails: a release without its database would deploy a broken site;
 * 2. creates the founder's administrator account from FOUNDER_EMAIL,
 *    FOUNDER_HANDLE and FOUNDER_NAME, only if no account exists, under the
 *    founder script's lock (`createFirstAccount`), and only while a data
 *    controller is named. With none of the three set it makes nothing; with
 *    some, or with one that isn't valid, the build fails.
 *
 * Its log says what it did and nothing else: never an address, a link, a
 * key, or the database's address. An error from the database is printed
 * with the address's parts taken out.
 *
 * It reads no .env file: on Vercel there is none, and locally it does
 * nothing.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { accountCreationOpen, DEFAULT_INVITES } from "../src/core/config";
import { closeDb, type Db, getDb } from "../src/core/db";
import { isCoreError } from "../src/core/errors";
import { createFirstAccount } from "../src/core/founder";
import type { Env } from "../src/core/hosting";
import { normEmail, validDisplayName, validHandle } from "../src/core/validate";
import { migrateUrl } from "./migrate";

export type ReleaseGate = { run: true } | { run: false; why: string };

const COMMIT_NAMED = /^[0-9a-f]{7,40}$/;
const COMMIT_BUILT = /^[0-9a-f]{40}$/;

/** Whether this build may touch the database: Vercel's production build of the commit OURS_RELEASE names. */
export function releaseGate(env: Env): ReleaseGate {
  if (env.VERCEL !== "1") return { run: false, why: "this isn't a Vercel build" };
  if (env.VERCEL_ENV !== "production") return { run: false, why: "this isn't Vercel's production build" };
  const named = env.OURS_RELEASE?.trim().toLowerCase() ?? "";
  if (!named) {
    return { run: false, why: "OURS_RELEASE isn't set, so no commit is named for release (M-0012)" };
  }
  if (!COMMIT_NAMED.test(named)) {
    return { run: false, why: "OURS_RELEASE isn't a commit: it must be 7 to 40 hexadecimal characters" };
  }
  const built = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? "";
  if (!COMMIT_BUILT.test(built)) {
    return { run: false, why: "the platform doesn't say which commit this build is" };
  }
  if (!built.startsWith(named)) {
    return {
      run: false,
      why: `this build is commit ${built.slice(0, 12)}, and OURS_RELEASE names ${named.slice(0, 12)}`,
    };
  }
  return { run: true };
}

/** A database error's message with the address's host, user and password taken out. */
export function withoutAddress(message: string, url: string): string {
  let parts: string[] = [];
  try {
    const u = new URL(url);
    parts = [u.hostname, decodeURIComponent(u.username), decodeURIComponent(u.password), u.host];
  } catch {
    return "(an error from a database whose address can't be read)";
  }
  let out = message.split(url).join("***");
  for (const part of parts) {
    if (part && part.length >= 3) out = out.split(part).join("***");
  }
  return out;
}

/** An error's message, with its cause's when it has one (drizzle wraps the database's own error). */
function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : "";
  const first = error.message.split("\n")[0] ?? "";
  return cause && cause !== first ? `${first} (${cause})` : first;
}

export type ReleaseOutcome =
  | { ok: true; lines: string[] }
  | { ok: false; lines: string[] };

/**
 * The release itself, once the gate is open. `db` is the database the
 * account is made in (the one at env.DATABASE_URL; a test passes its own).
 */
export async function runRelease(env: Env, db?: Db): Promise<ReleaseOutcome> {
  const lines: string[] = [];
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    lines.push("Release step: DATABASE_URL isn't set for production. Nothing was done.");
    return { ok: false, lines };
  }
  try {
    await migrateUrl(url);
  } catch (error) {
    lines.push(`Release step: the migrations failed: ${withoutAddress(messageOf(error), url)}`);
    return { ok: false, lines };
  }
  lines.push("Release step: the migrations are applied.");

  const settings = [env.FOUNDER_EMAIL, env.FOUNDER_HANDLE, env.FOUNDER_NAME].map((v) => v?.trim() ?? "");
  const set = settings.filter((v) => v !== "").length;
  if (set === 0) {
    lines.push("Release step: FOUNDER_EMAIL, FOUNDER_HANDLE and FOUNDER_NAME aren't set, so no account was made.");
    return { ok: true, lines };
  }
  if (set < 3) {
    lines.push("Release step: set all three of FOUNDER_EMAIL, FOUNDER_HANDLE and FOUNDER_NAME, or none. No account was made.");
    return { ok: false, lines };
  }

  let email: string;
  let handle: string;
  let displayName: string;
  try {
    email = normEmail(settings[0]);
    handle = validHandle(settings[1]);
    displayName = validDisplayName(settings[2]);
  } catch (error) {
    // The validators' messages never repeat what they were given.
    const why = isCoreError(error) ? error.message : "a setting isn't valid";
    lines.push(`Release step: the founder's account settings aren't valid: ${why} No account was made.`);
    return { ok: false, lines };
  }
  if (!accountCreationOpen()) {
    lines.push("Release step: no data controller is named (DATA_CONTROLLER and DATA_CONTROLLER_EMAIL), so no account can be made. No account was made.");
    return { ok: false, lines };
  }

  try {
    const created = await createFirstAccount(db ?? getDb(), {
      email,
      handle,
      displayName,
      invites: DEFAULT_INVITES,
      now: new Date(),
    });
    lines.push(
      created
        ? `Release step: the founder's account is made, as the one administrator, with ${DEFAULT_INVITES} invites. Sign in at /signin.`
        : "Release step: an account exists already, so no account was made.",
    );
    return { ok: true, lines };
  } catch (error) {
    lines.push(`Release step: the founder's account wasn't made: ${withoutAddress(messageOf(error), url)}`);
    return { ok: false, lines };
  }
}

async function main(): Promise<void> {
  const gate = releaseGate(process.env);
  if (!gate.run) {
    console.log(`Release step: nothing done, because ${gate.why}.`);
    return;
  }
  const outcome = await runRelease(process.env);
  for (const line of outcome.lines) (outcome.ok ? console.log : console.error)(line);
  if (!outcome.ok) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error("Release step failed:", error instanceof Error ? error.name : "an error");
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
