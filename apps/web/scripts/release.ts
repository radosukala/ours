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
 * The founder's settings are checked before the database is touched, and
 * the migrations run one release at a time, under a lock (the verification
 * of M-0018).
 *
 * Its log says what it did and nothing else: never an address, a link, a
 * key, or any part of the database's address. An error from the database
 * is printed as what it means and its code, never its message.
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

/** What a database error means, by its code, in words that name nothing of the address. */
const ERROR_WORDS: Readonly<Record<string, string>> = {
  "28P01": "the database refused the password",
  "28000": "the database refused the user",
  "3D000": "the database the address names doesn't exist",
  "42P07": "something the migrations create exists already",
  "42710": "something the migrations create exists already",
  "23505": "a row the release adds exists already",
  ECONNREFUSED: "the database refused the connection",
  ECONNRESET: "the database closed the connection",
  ENOTFOUND: "the database's host wasn't found",
  EAI_AGAIN: "the database's host couldn't be looked up",
  ETIMEDOUT: "the connection to the database timed out",
};

/** pg's own words for a server without TLS, which the release requires: they name nothing of the address. */
const NO_TLS = "The server does not support SSL connections";

/** The first code on an error, its cause, or the errors it gathers (a host with several addresses). */
function codeOf(error: unknown, depth = 0): string | null {
  if (depth > 4 || typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && /^[A-Z0-9_]{2,20}$/.test(code)) return code;
  const nested = [(error as { cause?: unknown }).cause, ...(((error as { errors?: unknown }).errors as unknown[]) ?? [])];
  for (const inner of nested) {
    const found = codeOf(inner, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * A database error in the build log: what it means and its code, never its
 * message, which can name the database, a user or a host (the verification
 * of M-0018).
 */
export function describeError(error: unknown): string {
  const code = codeOf(error);
  if (code) return ERROR_WORDS[code] ? `${ERROR_WORDS[code]} (${code}).` : `error code ${code}.`;
  const messages = [error, (error as { cause?: unknown } | null)?.cause].map((e) => (e instanceof Error ? e.message : ""));
  if (messages.some((m) => m.startsWith(NO_TLS))) return "the database doesn't offer TLS, which the release requires.";
  return `${error instanceof Error ? error.name : "an error"}, with no code.`;
}

export type ReleaseOutcome =
  | { ok: true; lines: string[] }
  | { ok: false; lines: string[] };

type FounderSettings = { email: string; handle: string; displayName: string } | null;

/**
 * The founder's three settings, checked before the database is touched (the
 * verification of M-0018): none set, nothing to make; all three valid and a
 * controller named, the account to make; anything else, the reason the
 * build fails.
 */
function founderSettings(env: Env): { ok: true; founder: FounderSettings; line?: string } | { ok: false; line: string } {
  const settings = [env.FOUNDER_EMAIL, env.FOUNDER_HANDLE, env.FOUNDER_NAME].map((v) => v?.trim() ?? "");
  const set = settings.filter((v) => v !== "").length;
  if (set === 0) {
    return {
      ok: true,
      founder: null,
      line: "Release step: FOUNDER_EMAIL, FOUNDER_HANDLE and FOUNDER_NAME aren't set, so no account was made.",
    };
  }
  if (set < 3) {
    return { ok: false, line: "Release step: set all three of FOUNDER_EMAIL, FOUNDER_HANDLE and FOUNDER_NAME, or none. No account was made." };
  }
  try {
    const founder = {
      email: normEmail(settings[0]),
      handle: validHandle(settings[1]),
      displayName: validDisplayName(settings[2]),
    };
    if (!accountCreationOpen()) {
      return {
        ok: false,
        line: "Release step: no data controller is named (DATA_CONTROLLER and DATA_CONTROLLER_EMAIL), so no account can be made. No account was made.",
      };
    }
    return { ok: true, founder };
  } catch (error) {
    // The validators' messages never repeat what they were given.
    const why = isCoreError(error) ? error.message : "a setting isn't valid";
    return { ok: false, line: `Release step: the founder's account settings aren't valid: ${why} No account was made.` };
  }
}

/**
 * The release itself, once the gate is open. `db` is the database the
 * account is made in (the one at env.DATABASE_URL; a test passes its own).
 * The settings are checked first, so a build that fails on them leaves the
 * database as it was (the verification of M-0018).
 */
export async function runRelease(env: Env, db?: Db): Promise<ReleaseOutcome> {
  const lines: string[] = [];
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    lines.push("Release step: DATABASE_URL isn't set for production. Nothing was done.");
    return { ok: false, lines };
  }
  const settings = founderSettings(env);
  if (!settings.ok) {
    lines.push(settings.line);
    return { ok: false, lines };
  }
  try {
    new URL(url);
  } catch {
    lines.push("Release step: the migrations failed: (an error from a database whose address can't be read)");
    return { ok: false, lines };
  }
  try {
    await migrateUrl(url);
  } catch (error) {
    lines.push(`Release step: the migrations failed: ${describeError(error)}`);
    return { ok: false, lines };
  }
  lines.push("Release step: the migrations are applied.");

  if (!settings.founder) {
    if (settings.line) lines.push(settings.line);
    return { ok: true, lines };
  }
  try {
    const created = await createFirstAccount(db ?? getDb(), {
      ...settings.founder,
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
    lines.push(`Release step: the founder's account wasn't made: ${describeError(error)}`);
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
