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
 * - **The region** is `VERCEL_REGION`, which the platform sets for a running
 *   function.
 * - **The database** is named from its address's host, and the address is
 *   never shown: a host ending in `.neon.tech` is Neon, and its region is
 *   the label before `aws` or `azure`. Any other host isn't named.
 * - **The administrator** is a rule, not a reading: only the founder can be
 *   the administrator (D-0021 §I), true before the deploy and after it.
 *
 * Nothing here is typed in by a person, so nothing here can be wrong about
 * where the server runs. Who owns the accounts is the founder's statement.
 */
/** The environment, as the platform gives it. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A region: its code, and the place it is in, when this file knows it. */
export type Region = { code: string; place: string | null };

export type Hosting =
  | { deployed: false }
  | {
      deployed: true;
      /** Null when the platform doesn't report it. */
      region: Region | null;
      /** Null when the database's provider can't be named from its host. */
      database: { provider: "Neon"; region: Region | null } | null;
    };

/** Vercel's function regions in Europe, and its default (D-0021 §D). Others show their code only. */
const VERCEL_PLACES: Readonly<Record<string, string>> = {
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

/** A region code as the platform or the host writes it: lower-case letters, digits and hyphens. */
const REGION_CODE = /^[a-z0-9-]{2,40}$/;

function region(code: string | undefined, places: Readonly<Record<string, string>>): Region | null {
  const trimmed = code?.trim().toLowerCase();
  if (!trimmed || !REGION_CODE.test(trimmed)) return null;
  return { code: trimmed, place: Object.prototype.hasOwnProperty.call(places, trimmed) ? places[trimmed]! : null };
}

/**
 * The database's provider and region, from the host in its address. Only
 * the host is read; nothing else in the address leaves this function.
 */
export function databaseFromUrl(url: string | undefined): { provider: "Neon"; region: Region | null } | null {
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
  const cloud = labels[n - 3];
  const code = cloud === "aws" || cloud === "azure" ? labels[n - 4] : undefined;
  return { provider: "Neon", region: region(code, NEON_PLACES) };
}

/** Where this server runs, from the platform's own variables and the database's host. */
export function hosting(env: Env = process.env): Hosting {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production") return { deployed: false };
  return {
    deployed: true,
    region: region(env.VERCEL_REGION, VERCEL_PLACES),
    database: databaseFromUrl(env.DATABASE_URL),
  };
}

/** A region in words: "Frankfurt, Germany (fra1)", or "region hkg1". */
export function regionWords(r: Region): string {
  return r.place ? `${r.place} (${r.code})` : `region ${r.code}`;
}

/** The sentence a copy that isn't the deployed site says about itself. */
export const NOT_DEPLOYED = "This copy of our.one isn't the deployed site.";

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
 * as after it (D-0021 §I). Only the founder script and the release make an
 * administrator, and each makes the first account only.
 */
export const ADMINISTRATOR_RULE = "Only the founder can be the administrator.";
