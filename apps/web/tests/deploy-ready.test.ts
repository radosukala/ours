/**
 * Ready for the first deploy (D-0021, M-0018, SPEC §18.20): the pages say
 * where they run, the release step touches the database only in Vercel's
 * production build of the commit the founder names, and the weekly email
 * answers Vercel's scheduler.
 *
 * Denial paths first: every build the founder didn't name does nothing; a
 * copy that isn't the deployed site says so; nothing prints an address.
 * Every address, name and key here is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import { GET as cronGET, POST as cronPOST } from "@/app/api/cron/weekly-digest/route";
import { DEFAULT_INVITES } from "@/core/config";
import { createFirstAccount } from "@/core/founder";
import { ADMINISTRATOR_RULE, databaseFromUrl, type Env, hosting, NOT_DEPLOYED, runsOnWords } from "@/core/hosting";
import { accounts } from "@/core/schema";
import { HOSTING_FILE, loadControl } from "@/core/transparency";
import { describeError, releaseGate, runRelease } from "../scripts/release";
import { db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const page = (component: () => unknown) =>
  textOf(renderToStaticMarkup(createElement(component as () => React.ReactElement)));

/**
 * A FICTIONAL database address, assembled at run time: the kit's check
 * (rule 8) reads this file for secrets, and an address with a password
 * written out whole would look like one.
 */
const pg = (userinfo: string, host: string, rest = "/x") => ["postgresql:", "//", userinfo, "@", host, rest].join("");
const FICT_USERINFO = ["fict_user", "fict_pass_0123"].join(":");

/** A FICTIONAL Neon address: its host is the only part the pages may read. */
const NEON_URL = pg(FICT_USERINFO, "ep-fictional-pond-123456-pooler.eu-central-1.aws.neon.tech", "/neondb?sslmode=require");
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** Vercel's production settings, imitated. */
const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_REGION: "fra1" } as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ====================================================================== */
/* Where the site runs (D-0021 §C)                                         */
/* ====================================================================== */

describe("where this server runs", () => {
  it("anywhere but Vercel's production deployment, this copy isn't the deployed site", () => {
    expect(hosting({})).toEqual({ deployed: false });
    expect(hosting({ VERCEL: "1" })).toEqual({ deployed: false });
    // Changed after the verification of M-0018 (H1): a preview isn't the
    // deployed site, and now says that Vercel runs it.
    expect(hosting({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" })).toEqual({
      deployed: false,
      vercel: { region: { code: "fra1", place: "Frankfurt, Germany" } },
    });
    expect(hosting({ VERCEL: "1", VERCEL_ENV: "development" })).toEqual({ deployed: false });
    expect(hosting({ VERCEL_ENV: "production" })).toEqual({ deployed: false });
    expect(hosting({ VERCEL: "true", VERCEL_ENV: "production" })).toEqual({ deployed: false });
  });

  it("on it, the region comes from the platform and the database from its address's host only", () => {
    expect(hosting({ ...PRODUCTION, DATABASE_URL: NEON_URL })).toEqual({
      deployed: true,
      region: { code: "fra1", place: "Frankfurt, Germany" },
      database: { provider: "Neon", region: { code: "eu-central-1", place: "Frankfurt, Germany" } },
    });
    // An unknown region shows its code; no region, nothing.
    expect(hosting({ ...PRODUCTION, VERCEL_REGION: "hkg1" })).toMatchObject({ region: { code: "hkg1", place: null } });
    expect(hosting({ VERCEL: "1", VERCEL_ENV: "production" })).toMatchObject({ region: null, database: null });
    expect(hosting({ ...PRODUCTION, VERCEL_REGION: "FRA1 ; drop" })).toMatchObject({ region: null });
  });

  it("names only Neon, and only from the host: other hosts, look-alikes and nonsense name nothing", () => {
    expect(databaseFromUrl(undefined)).toBeNull();
    expect(databaseFromUrl("")).toBeNull();
    expect(databaseFromUrl("not a url")).toBeNull();
    expect(databaseFromUrl("postgresql://localhost:5432/ours")).toBeNull();
    expect(databaseFromUrl(pg("u:p", "db.example.test", "/x"))).toBeNull();
    expect(databaseFromUrl(pg("u:p", "neon.tech.example.test", "/x"))).toBeNull();
    expect(databaseFromUrl(pg("u:p", "ep-x.eu-central-1.aws.neon.tech.example.test", "/x"))).toBeNull();
    expect(databaseFromUrl(pg("u:p", "ep-x.germanywestcentral.azure.neon.tech", "/x"))).toEqual({
      provider: "Neon",
      region: { code: "germanywestcentral", place: "Frankfurt, Germany" },
    });
    expect(databaseFromUrl(pg("u:p", "ep-x.neon.tech", "/x"))).toBeNull();
    expect(databaseFromUrl(pg("u:p", "ep-x.us-east-2.aws.neon.tech", "/x"))).toEqual({
      provider: "Neon",
      region: { code: "us-east-2", place: "Ohio, United States" },
    });
  });

  it("says what runs it in plain words, and admits what it can't name", () => {
    expect(runsOnWords({ deployed: true, region: { code: "fra1", place: "Frankfurt, Germany" }, database: { provider: "Neon", region: { code: "eu-central-1", place: "Frankfurt, Germany" } } })).toBe(
      "Vercel runs this site, in Frankfurt, Germany (fra1). Neon keeps its database, in Frankfurt, Germany (eu-central-1).",
    );
    expect(runsOnWords({ deployed: true, region: null, database: null })).toBe(
      "Vercel runs this site. This server's configuration doesn't name its database's provider.",
    );
  });
});

describe("the pages, as a copy that isn't the deployed site", () => {
  it("/privacy says so at the top and in its hosting line; /power's hosting row is the record", () => {
    const privacy = page(PrivacyPage);
    expect(privacy).toContain(`${NOT_DEPLOYED} This notice describes what our.one keeps when it runs.`);
    expect(privacy).toContain(`Hosting ${HOSTING_FILE}`);
    expect(privacy).not.toMatch(/Vercel|Neon/);
    const row = loadControl(null).find((r) => r.asset === "Hosting, database, email sending")!;
    expect(row.status).toBe("RECORDED");
    expect(row.who.startsWith(HOSTING_FILE)).toBe(true);
  });

  // Changed after the verification of M-0018 (H1): a preview, and a copy
  // whose database is Neon's, say they aren't the deployed site and name
  // what they run on, instead of "None".
  it("a preview on Vercel is still a copy that isn't the deployed site, and says Vercel runs it", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_REGION", "fra1");
    expect(page(PrivacyPage)).toContain(NOT_DEPLOYED);
    expect(page(PowerPage)).toContain(`${NOT_DEPLOYED} Vercel runs it, as a preview, in Frankfurt, Germany (fra1).`);
    expect(page(PowerPage)).not.toContain(HOSTING_FILE);
    vi.unstubAllEnvs();
    vi.stubEnv("DATABASE_URL", NEON_URL);
    expect(page(PrivacyPage)).toContain(
      `Hosting ${NOT_DEPLOYED} Neon keeps its database, in Frankfurt, Germany (eu-central-1): everything this notice says is kept is stored there. As stated in this server's configuration.`,
    );
  });
});

describe("the pages, on Vercel's production deployment (imitated)", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(PRODUCTION)) vi.stubEnv(key, value);
    vi.stubEnv("DATABASE_URL", NEON_URL);
  });

  it("/power's hosting row names Vercel, Frankfurt, Neon and its region, as stated in this server's configuration", () => {
    const row = loadControl(null).find((r) => r.asset === "Hosting, database, email sending")!;
    expect(row).toMatchObject({ status: "STATED", statedBy: "configuration" });
    expect(row.who).toBe(
      "Vercel runs this site, in Frankfurt, Germany (fra1). Neon keeps its database, in Frankfurt, Germany (eu-central-1). This server sends no email: each message is written to a test outbox instead. The accounts are the founder's.",
    );
    const power = page(PowerPage);
    expect(power).toContain("Hosting, database, email sending stated in this server's configuration Vercel runs this site");
  });

  it("with Resend set, the row says Resend delivers the email", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_FICTIONAL");
    vi.stubEnv("MAIL_FROM", "ours@example.test");
    const row = loadControl(null).find((r) => r.asset === "Hosting, database, email sending")!;
    expect(row.who).toContain("Resend delivers the emails this server sends. The accounts are the founder's.");
  });

  it("/privacy has no 'isn't the deployed site' notice, and names Vercel and Neon with what each receives", () => {
    const privacy = page(PrivacyPage);
    expect(privacy).not.toContain(NOT_DEPLOYED);
    expect(privacy).toContain(
      // Changed after the verification of M-0018 (H11): Neon keeps everything
      // this notice says is kept, the seat requests below the table included.
      "Hosting Vercel runs our.one's server, in Frankfurt, Germany (fra1): every request to the site passes through it, with your IP address. Neon keeps our.one's database, in Frankfurt, Germany (eu-central-1): everything this notice says is kept is stored there. Both as stated in this server's configuration.",
    );
  });

  it("no page says our.one is not deployed, and no page shows any part of the database's address", () => {
    const pages = [page(PrivacyPage), page(PowerPage), page(RulesPage)];
    for (const text of pages) {
      expect(text).not.toMatch(/not deployed|isn't the deployed site|none yet/i);
      for (const part of ["fict_user", "fict_pass_0123", "ep-fictional-pond", "neondb", "sslmode", "neon.tech", NEON_URL]) {
        expect(text).not.toContain(part);
      }
    }
  });
});

describe("the administrator, as a rule (D-0021 §I)", () => {
  it("/privacy, /power and the house rules say only the founder can be the administrator, deployed or not", () => {
    for (const deployed of [false, true]) {
      vi.unstubAllEnvs();
      if (deployed) for (const [key, value] of Object.entries(PRODUCTION)) vi.stubEnv(key, value);
      expect(page(PrivacyPage)).toContain(`decides what happens. ${ADMINISTRATOR_RULE}`);
      expect(page(RulesPage)).toContain(`${ADMINISTRATOR_RULE} If you think a decision is wrong`);
      const row = loadControl(null).find((r) => r.asset === "Moderation")!;
      expect(row).toMatchObject({ status: "STATED", who: "The founder: only the founder can be the administrator." });
      for (const text of [page(PrivacyPage), page(RulesPage), page(PowerPage)]) {
        expect(text).not.toMatch(/until (our\.one|something) is deployed|No administrator exists/);
      }
    }
  });
});

/* ====================================================================== */
/* The release step (D-0021 §D)                                            */
/* ====================================================================== */

describe("the release gate", () => {
  const named = { ...PRODUCTION, VERCEL_GIT_COMMIT_SHA: SHA, OURS_RELEASE: SHA.slice(0, 7) };

  it("opens only for Vercel's production build of the commit OURS_RELEASE names", () => {
    expect(releaseGate(named)).toEqual({ run: true });
    expect(releaseGate({ ...named, OURS_RELEASE: SHA })).toEqual({ run: true });
    expect(releaseGate({ ...named, OURS_RELEASE: ` ${SHA.slice(0, 10).toUpperCase()} ` })).toEqual({ run: true });
  });

  it("stays shut for every other build, and says why", () => {
    const shut: [Env, RegExp][] = [
      [{}, /isn't a Vercel build/],
      [{ ...named, VERCEL: undefined }, /isn't a Vercel build/],
      [{ ...named, VERCEL_ENV: "preview" }, /isn't Vercel's production build/],
      [{ ...named, VERCEL_ENV: "development" }, /isn't Vercel's production build/],
      [{ ...named, OURS_RELEASE: undefined }, /OURS_RELEASE isn't set/],
      [{ ...named, OURS_RELEASE: "  " }, /OURS_RELEASE isn't set/],
      [{ ...named, OURS_RELEASE: "012345" }, /isn't a commit/],
      [{ ...named, OURS_RELEASE: "main" }, /isn't a commit/],
      [{ ...named, OURS_RELEASE: "0123456*" }, /isn't a commit/],
      [{ ...named, OURS_RELEASE: `${SHA}0` }, /isn't a commit/],
      [{ ...named, VERCEL_GIT_COMMIT_SHA: undefined }, /doesn't say which commit/],
      [{ ...named, VERCEL_GIT_COMMIT_SHA: "0123456" }, /doesn't say which commit/],
      [{ ...named, OURS_RELEASE: "fedcba9" }, /this build is commit 0123456789ab, and OURS_RELEASE names fedcba9/],
      [{ ...named, OURS_RELEASE: "123456789abcdef" }, /OURS_RELEASE names 123456789abc/],
    ];
    for (const [env, why] of shut) {
      const gate = releaseGate(env);
      expect(gate.run, JSON.stringify(env)).toBe(false);
      expect(gate.run ? "" : gate.why, JSON.stringify(env)).toMatch(why);
    }
  });
});

describe("the release itself (against the local test database)", () => {
  beforeEach(reset);

  const founder = {
    FOUNDER_EMAIL: "founder_fict@example.test",
    FOUNDER_HANDLE: "founder_fict",
    FOUNDER_NAME: "Founder (FICTIONAL)",
  };
  const env = (extra: Env = {}): Env => ({
    DATABASE_URL: process.env.DATABASE_URL,
    ...extra,
  });
  const logOf = (lines: string[]) => lines.join("\n");

  it("fails without a database address, and does nothing", async () => {
    const outcome = await runRelease({ ...founder }, db());
    expect(outcome.ok).toBe(false);
    expect(logOf(outcome.lines)).toContain("DATABASE_URL isn't set for production. Nothing was done.");
    expect(await db().select().from(accounts)).toHaveLength(0);
  });

  it("migrates, then makes the founder's account once, as the one administrator, and says only that", async () => {
    const first = await runRelease(env(founder), db());
    expect(first.ok).toBe(true);
    expect(first.lines).toEqual([
      "Release step: the migrations are applied.",
      `Release step: the founder's account is made, as the one administrator, with ${DEFAULT_INVITES} invites. Sign in at /signin.`,
    ]);
    const made = await db().select().from(accounts);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({
      email: "founder_fict@example.test",
      handle: "founder_fict",
      displayName: "Founder (FICTIONAL)",
      isAdmin: true,
      invitedBy: null,
      invitesRemaining: DEFAULT_INVITES,
    });
    const again = await runRelease(env(founder), db());
    expect(again).toEqual({
      ok: true,
      lines: ["Release step: the migrations are applied.", "Release step: an account exists already, so no account was made."],
    });
    expect(await db().select().from(accounts)).toHaveLength(1);
    for (const line of [...first.lines, ...again.lines]) {
      expect(line).not.toMatch(/founder_fict@|example\.test|FICTIONAL|postgres|localhost|#|token/i);
    }
  });

  it("makes nothing when any account exists, even another person's", async () => {
    await makeAccount({ handle: "anna_f" });
    const outcome = await runRelease(env(founder), db());
    expect(outcome.ok).toBe(true);
    expect(logOf(outcome.lines)).toContain("an account exists already");
    const rows = await db().select().from(accounts).where(eq(accounts.isAdmin, true));
    expect(rows).toHaveLength(0);
  });

  it("two releases at once make one account", async () => {
    const results = await Promise.all([runRelease(env(founder), db()), runRelease(env(founder), db())]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db().select().from(accounts)).toHaveLength(1);
  });

  it("with none of the founder's settings it makes nothing; with some, or one that isn't valid, it fails", async () => {
    const none = await runRelease(env(), db());
    expect(none.ok).toBe(true);
    expect(logOf(none.lines)).toContain("aren't set, so no account was made");

    const some = await runRelease(env({ FOUNDER_EMAIL: founder.FOUNDER_EMAIL }), db());
    expect(some.ok).toBe(false);
    expect(logOf(some.lines)).toContain("set all three");

    for (const bad of [
      { ...founder, FOUNDER_EMAIL: "not-an-address" },
      { ...founder, FOUNDER_HANDLE: "No Spaces Allowed" },
      { ...founder, FOUNDER_NAME: "Name @founder_fict" },
    ]) {
      const outcome = await runRelease(env(bad), db());
      expect(outcome.ok, JSON.stringify(bad)).toBe(false);
      const log = logOf(outcome.lines);
      expect(log).toContain("the founder's account settings aren't valid");
      // The validators' messages never repeat what they were given.
      for (const value of Object.values(bad)) expect(log).not.toContain(value);
    }
    expect(await db().select().from(accounts)).toHaveLength(0);
  });

  it("without a data controller it makes no account, and fails", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    const outcome = await runRelease(env(founder), db());
    expect(outcome.ok).toBe(false);
    expect(logOf(outcome.lines)).toContain("no data controller is named");
    expect(await db().select().from(accounts)).toHaveLength(0);
  });

  // Changed after the verification of M-0018 (R5): an error is told by what
  // it means and its code, never by its message, so nothing of the address
  // can reach the log; withoutAddress() is gone.
  it("a database error is printed as what it means and its code, without any part of the address", async () => {
    const outcome = await runRelease({ ...founder, DATABASE_URL: pg(FICT_USERINFO, "127.0.0.1:1", "/neondb") }, db());
    expect(outcome.ok).toBe(false);
    expect(outcome.lines).toEqual(["Release step: the migrations failed: the database refused the connection (ECONNREFUSED)."]);
    const withHost = Object.assign(new Error("getaddrinfo ENOTFOUND ep-x.eu-central-1.aws.neon.tech"), { code: "ENOTFOUND" });
    expect(describeError(withHost)).toBe("the database's host wasn't found (ENOTFOUND).");
    expect(describeError(new Error("database \"fict_db\" does not exist", { cause: { code: "3D000" } }))).toBe(
      "the database the address names doesn't exist (3D000).",
    );
    expect(describeError(new Error("something about fict_user at ep-x"))).toBe("Error, with no code.");
  });

  it("the shared first-account rule is the founder script's, with its lock", async () => {
    const now = new Date("2026-10-03T08:00:00Z");
    const one = { email: "a_fict@example.test", handle: "a_fict", displayName: "A (FICTIONAL)", invites: 3, now };
    const two = { ...one, email: "b_fict@example.test", handle: "b_fict" };
    const made = await Promise.all([createFirstAccount(db(), one), createFirstAccount(db(), two)]);
    expect(made.filter(Boolean)).toHaveLength(1);
    expect(await db().select().from(accounts)).toHaveLength(1);
    expect(read("scripts/seed-founder.ts")).toContain("isFictionalAddress(email)");
  });
});

describe("how Vercel runs it", () => {
  it("apps/web/vercel.json: the build command, Frankfurt, and the weekly email on Mondays at 08:00 UTC", () => {
    const config = JSON.parse(read("vercel.json")) as Record<string, unknown>;
    expect(config).toMatchObject({
      framework: "nextjs",
      buildCommand: "pnpm run vercel-build",
      regions: ["fra1"],
      crons: [{ path: "/api/cron/weekly-digest", schedule: "0 8 * * 1" }],
    });
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["vercel-build"]).toBe("tsx scripts/release.ts && next build");
    // The release step reads no .env file.
    expect(read("scripts/release.ts")).not.toMatch(/from "dotenv"|config\(\{/);
  });
});

/* ====================================================================== */
/* The weekly email on Vercel's schedule (D-0021 §E)                       */
/* ====================================================================== */

describe("the weekly email's route", () => {
  beforeEach(reset);

  it("answers GET exactly as POST, and refuses both without the secret", async () => {
    expect(cronGET).toBe(cronPOST);
    const url = "http://localhost:3000/api/cron/weekly-digest";
    const without = await cronGET(new Request(url));
    expect(without.status).toBe(401);
    const wrong = await cronGET(new Request(url, { headers: { authorization: "Bearer not-the-secret" } }));
    expect(wrong.status).toBe(401);
    const right = await cronGET(new Request(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(right.status).toBe(200);
    vi.stubEnv("CRON_SECRET", "");
    const off = await cronGET(new Request(url, { headers: { authorization: "Bearer " } }));
    expect(off.status).toBe(503);
  });
});
