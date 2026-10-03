/**
 * Where this server runs, and who administers it (D-0021 §C, M-0018, SPEC
 * §18.20). Every sentence a page says about hosting, the database, the
 * administrator or deployment comes from here, so it is true on the server
 * that renders it, before the deploy and after it.
 *
 * - **Deployed** means Vercel's production deployment, as the platform's
 *   own variables report it: `VERCEL=1` and `VERCEL_ENV=production`.
 *   Anywhere else (development, a preview, a test) this copy isn't the
 *   deployed site, and the pages say so.
 * - **A copy that isn't the deployed site still names what it runs on**
 *   (the verification of M-0018): Vercel, on a preview (`VERCEL=1` and
 *   `VERCEL_ENV=preview`; `vercel dev` runs on this machine, not Vercel),
 *   and Neon, when its database is Neon's. It says "None" only when neither
 *   is true.
 * - **The region** is `VERCEL_REGION`, which the platform sets for a running
 *   function.
 * - **The database** is named from its address's host, and the address is
 *   never shown: a host ending in `.neon.tech` is Neon. Its region is the
 *   label before `aws` or `azure`, when that label is a region code and not
 *   the endpoint's own name. Any other host isn't named.
 * - **The administrator** is a rule, not a reading: only the founder can be
 *   the administrator (D-0021 §I), true before the deploy and after it.
 *
 * Nothing here is typed in by a person, so nothing here can be wrong about
 * where the server runs. Who owns the accounts is the founder's statement.
 */
/** The environment, as the platform gives it. */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Whether this server may use a database on another machine: only on
 * Vercel's own deployments (production or a preview), and in the tests,
 * which imitate them. Anywhere else — `next dev`, `next start`, `vercel
 * dev`, a script — only a database on this machine is used, so a key left
 * in apps/web/.env.local reaches no local run (D-0021 §F; the re-check of
 * M-0018). getDb() and the pages read this one rule: a page never names a
 * database its server refuses (the re-check, RC3).
 */
export function remoteDatabaseAllowed(env: Env = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.VERCEL === "1" && (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview");
}

/** A region: its code, and the place it is in, when this file knows it. */
export type Region = { code: string; place: string | null };

/** The database, when its host is Neon's. */
export type NeonDatabase = { provider: "Neon"; region: Region | null };

export type Hosting =
  | {
      /** A copy that isn't the deployed site. */
      deployed: false;
      /** Present when this copy is a preview on Vercel. */
      vercel?: { region: Region | null };
      /** Present when this copy's database is Neon's. */
      database?: NeonDatabase;
    }
  | {
      deployed: true;
      /** Null when the platform doesn't report it. */
      region: Region | null;
      /** Null when the database's provider can't be named from its host. */
      database: NeonDatabase | null;
    };

/**
 * Vercel's function regions whose place the pages name: the one our.one
 * runs in, Cleveland, beside its database in Ohio (D-0022), Vercel's
 * default, and Europe's. Others show their code only.
 */
const VERCEL_PLACES: Readonly<Record<string, string>> = {
  cle1: "Cleveland, United States",
  fra1: "Frankfurt, Germany",
  cdg1: "Paris, France",
  arn1: "Stockholm, Sweden",
  dub1: "Dublin, Ireland",
  lhr1: "London, United Kingdom",
  iad1: "Washington, D.C., United States",
};

/** Neon's regions in Europe, and the ones in the United States. Others show their code only. */
const NEON_PLACES: Readonly<Record<string, string>> = {
  "eu-central-1": "Frankfurt, Germany",
  "eu-west-2": "London, United Kingdom",
  germanywestcentral: "Frankfurt, Germany",
  "us-east-1": "Virginia, United States",
  "us-east-2": "Ohio, United States",
  "us-west-2": "Oregon, United States",
};

/** A region code as the platform writes it: lower-case letters, digits and hyphens. */
const REGION_CODE = /^[a-z0-9-]{2,40}$/;

/** An AWS region code, as Neon's hosts carry it: "eu-central-1", "us-east-2". */
const AWS_REGION = /^[a-z]{2}-(?:north|south|east|west|central|northeast|southeast|northwest|southwest)-\d{1,2}$/;

/** An Azure region name, as Neon's hosts carry it: "germanywestcentral", "eastus2". */
const AZURE_REGION = /^[a-z]{4,30}\d?$/;

function region(code: string | undefined, places: Readonly<Record<string, string>>): Region | null {
  const trimmed = code?.trim().toLowerCase();
  if (!trimmed || !REGION_CODE.test(trimmed)) return null;
  return { code: trimmed, place: Object.prototype.hasOwnProperty.call(places, trimmed) ? places[trimmed]! : null };
}

/**
 * The database's provider and region, from the host in its address. Only
 * the host is read; nothing else in the address leaves this function.
 */
export function databaseFromUrl(url: string | undefined): NeonDatabase | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split(".");
  const n = labels.length;
  if (n < 4 || labels[n - 1] !== "tech" || labels[n - 2] !== "neon") return null;
  // The region is the label before the cloud, and never the first label,
  // which is the endpoint's own name (the verification of M-0018).
  const cloud = labels[n - 3];
  const label = n >= 5 ? labels[n - 4] : undefined;
  const code =
    label && ((cloud === "aws" && AWS_REGION.test(label)) || (cloud === "azure" && AZURE_REGION.test(label)))
      ? label
      : undefined;
  return { provider: "Neon", region: region(code, NEON_PLACES) };
}

/** Where this server runs, from the platform's own variables and the database's host. */
export function hosting(env: Env = process.env): Hosting {
  // A database the server would refuse to use isn't named (the re-check, RC3).
  const database = remoteDatabaseAllowed(env) ? databaseFromUrl(env.DATABASE_URL) : null;
  if (env.VERCEL === "1" && env.VERCEL_ENV === "production") {
    return { deployed: true, region: region(env.VERCEL_REGION, VERCEL_PLACES), database };
  }
  return {
    deployed: false,
    ...(env.VERCEL === "1" && env.VERCEL_ENV === "preview"
      ? { vercel: { region: region(env.VERCEL_REGION, VERCEL_PLACES) } }
      : {}),
    ...(database ? { database } : {}),
  };
}

/** A region in words: "Frankfurt, Germany (fra1)", or "region hkg1". */
export function regionWords(r: Region): string {
  return r.place ? `${r.place} (${r.code})` : `region ${r.code}`;
}

/** The sentence a copy that isn't the deployed site says about itself. */
export const NOT_DEPLOYED = "This copy of our.one isn't the deployed site.";

/** What a copy that isn't the deployed site runs on, or null when it runs on neither (it says "None" then). */
export function copyRunsOnWords(h: Extract<Hosting, { deployed: false }>): string | null {
  const parts: string[] = [];
  if (h.vercel) {
    parts.push(h.vercel.region ? `Vercel runs it, as a preview, in ${regionWords(h.vercel.region)}.` : "Vercel runs it, as a preview.");
  }
  if (h.database) {
    parts.push(
      h.database.region ? `Neon keeps its database, in ${regionWords(h.database.region)}.` : "Neon keeps its database.",
    );
  }
  return parts.length ? parts.join(" ") : null;
}

/** What runs this deployed server, in one or two sentences: the host and the database. */
export function runsOnWords(h: Extract<Hosting, { deployed: true }>): string {
  const host = h.region ? `Vercel runs this site, in ${regionWords(h.region)}.` : "Vercel runs this site.";
  const database = h.database
    ? h.database.region
      ? `Neon keeps its database, in ${regionWords(h.database.region)}.`
      : "Neon keeps its database."
    : "This server's configuration doesn't name its database's provider.";
  return `${host} ${database}`;
}

/* --------------------------------------------------------- administrator */

/**
 * Who can be the administrator: a rule, so it is as true before the deploy
 * as after it (D-0021 §I). On a real copy only the founder script and the
 * release make an administrator, each the first account only. The
 * fictional seed makes one too, for a development copy, and says that
 * account stands in for the founder (the verification of M-0018).
 */
export const ADMINISTRATOR_RULE = "Only the founder can be the administrator.";
