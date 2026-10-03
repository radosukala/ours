/**
 * Independent verification of M-0018 (ready for the first deploy: the site
 * says where it runs; D-0021, SPEC §18.20), the honesty and rendering lens.
 * Written by an agent that did not build it, against d26556a (the build is
 * bee6e3b; d26556a adds only the stopping rule). It changes no product
 * code, no record and no other test.
 *
 * What was read: D-0021 (§I included), M-0018, P-0014 and its evidence,
 * the amended M-0012, D-0012 §C, D-0013 §D, D-0017 §A, D-0020, AGENTS.md
 * and FOUNDING-AUTHORITY; hosting.ts, transparency.ts, founder.ts, the
 * /privacy, /power and /rules pages, floorRules.ts, control.json and SPEC
 * §18.20; every page under src/app/(public), the public components,
 * door.ts, kit/build.md, kit/README.md, our.one.json, apps/web/README.md
 * and package.json; the root README's new first section; the claims scan;
 * the fictional seed; and the five older test files M-0018 changed
 * (`git diff 80579b3 bee6e3b -- apps/web/tests`).
 *
 * What was rendered: /privacy, /power and /rules with renderToStaticMarkup
 * under vi.stubEnv, in every state below; the other public pages, the
 * layout and the not-found page as an imitated production deployment.
 *
 * What was served: a local production build of this worktree (`next build`
 * lists every public page as ƒ, rendered per request), run with `next
 * start` on port 3527, with FICTIONAL settings, a local database made for
 * it and dropped afterwards, and a preload that refused any connection
 * leaving the machine (none was attempted). /privacy, /power and /rules
 * were fetched in 18 states, and all twenty public routes in two (an
 * imitated production deployment, and a plain local copy). What was served
 * is what the renders here show. No browser was used.
 *
 * The states: no VERCEL variables; VERCEL_ENV preview and development;
 * production with the region fra1, iad1, an unknown code, none, empty or
 * malformed; DATABASE_URL a Neon host in eu-central-1 (pooled, and with a
 * cell label), in us-east-2, on Azure, with no region label, or of the old
 * `cloud` shape, another host, three look-alikes, malformed, unset; a
 * preview and a local copy with a Neon address; and email to the outbox,
 * refused, or through Resend.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on bee6e3b, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity, as earlier rounds used it: HIGH, something stated as in force,
 * built or approved that isn't; MEDIUM, a statement the code or the records
 * contradict, a layer of checking that silently doesn't run, or a page out
 * of step with its records; LOW, wording, polish, small gaps.
 *
 * Every person, address and database here is FICTIONAL, and every database
 * address is put together at run time, because the kit's rule 8 reads this
 * file. Nothing here connects anywhere: the pages rendered read no
 * database, and where a route would, the seats module is mocked.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

const seats = vi.hoisted(() => ({
  memberCount: vi.fn<() => Promise<number>>(),
  seatState: vi.fn<() => Promise<{ open: number; waiting: number }>>(),
}));
vi.mock("@/core/seats", () => ({
  memberCount: seats.memberCount,
  seatState: seats.seatState,
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => false }));

import AgreementPage from "@/app/(public)/agreement/page";
import BuildPage from "@/app/(public)/build/page";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import FeedPageRoute from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import FrontDoorRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import RulesPage from "@/app/(public)/rules/page";
import NotFound from "@/app/not-found";
import { OPEN_CODE_URL } from "@/components/RightColumn";
import { DOOR_LEDE } from "@/components/public/door";
import { publicTextFiles, scanRepoPublicText, scanText } from "@/core/claims";
import { databaseFromUrl, hosting } from "@/core/hosting";
import { type ControlRow, EMAIL_PROVIDER_WORDS, type EmailSending, emailSending, loadControl } from "@/core/transparency";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** A git command's output (local history only). */
function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

/** Every .ts and .tsx file under src, relative to apps/web, with forward slashes. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) out.push(relative(WEB, path).split(sep).join("/"));
    }
  };
  walk(join(WEB, "src"));
  return out.sort();
}

/**
 * A FICTIONAL database address, put together at run time: the kit's rule 8
 * reads this file, and an address with a password written out whole would
 * look like one.
 */
const pg = (host: string, rest = "/neondb?sslmode=require") =>
  ["postgresql:", "//", ["fict_user", "fict_pass_0123"].join(":"), "@", host, rest].join("");

const NEON_EU = pg("ep-fictional-pond-123456-pooler.eu-central-1.aws.neon.tech");
const NEON_US = pg("ep-fictional-pond-123456.us-east-2.aws.neon.tech");

/** Every part of these addresses that a page must never show. The region label is the one part a page may name. */
const ADDRESS_PARTS = ["fict_user", "fict_pass_0123", "ep-fictional-pond", "pooler", "neondb", "sslmode", "neon.tech", "db.example.test", "evil-neon", "c-2.", "not a url"];

/** The variables the pages read about where they run and what they do with email. */
const KEYS = ["VERCEL", "VERCEL_ENV", "VERCEL_REGION", "DATABASE_URL", "MAIL_TRANSPORT", "RESEND_API_KEY", "MAIL_FROM"] as const;

/** Exactly these settings, and none of the others in KEYS; NODE_ENV stays "test" unless given. */
function setEnv(vars: Record<string, string | undefined>): void {
  for (const key of KEYS) vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "test");
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
}

/** Vercel's production deployment, imitated: the platform's own variables. */
const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_REGION: "fra1" } as const;

/** The three things a server can do with an email (`emailSending`), as settings. */
const SENDING: { name: EmailSending; vars: Record<string, string> }[] = [
  { name: "outbox", vars: {} },
  { name: "refused", vars: { MAIL_TRANSPORT: "resend" } },
  { name: "resend", vars: { NODE_ENV: "production", MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_FICTIONAL", MAIL_FROM: "ours@example.test" } },
];

/** A <dt>'s <dd> on /privacy, as a reader reads it. */
function privacyLine(label: string, html = render(PrivacyPage)): string {
  const m = new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`).exec(html);
  return m ? textOf(m[1]!) : "";
}

/** /power's hosting row, as this server shows it. */
function hostingRow(): ControlRow {
  const row = loadControl().find((r) => r.asset === "Hosting, database, email sending");
  if (!row) throw new Error("no hosting row");
  return row;
}

/** The root README's first section (the quoted block for visitors from our.one), as a reader reads it. */
function readmeFirstSection(raw = false): string {
  const lines = readRoot("README.md").split("\n");
  const at = lines.findIndex((l) => l.includes("Coming from our.one?"));
  if (at === -1) return "";
  const quoted: string[] = [];
  for (let i = at; i < lines.length && lines[i]!.startsWith(">"); i++) quoted.push(lines[i]!);
  const text = quoted.join("\n");
  if (raw) return text;
  return text
    .replace(/^>\s?/gm, "")
    .replace(/[*`]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

beforeEach(() => {
  seats.memberCount.mockReset();
  seats.seatState.mockReset();
  seats.memberCount.mockResolvedValue(12);
  seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on bee6e3b)", () => {
  it("DEFECT (MEDIUM): off Vercel's production deployment the hosting lines say 'None' without looking where the server runs — on a Vercel preview (VERCEL=1, VERCEL_ENV=preview) Vercel hosts the copy and every request passes through it, and on a copy whose DATABASE_URL is Neon's (the founder's own .env.local held the database's address, P-0014's evidence) Neon keeps its data; yet /privacy's 'Who else receives your data' says 'Hosting: None: this copy of our.one isn't the deployed site.' and /power's row says 'None: …' as RECORDED. D-0021 §C has /privacy name Vercel and Neon 'when the server runs on them', and asks of a preview only that it say it isn't the deployed site (served so on 3527)", () => {
    const d0021 = record("decisions/D-0021.md");
    expect(d0021).toContain("/privacy names Vercel and Neon among those who receive data, with what each receives, when the server runs on them.");
    expect(d0021).toContain("Anywhere else, in development, in a preview or in a test, the page says that this copy isn't the deployed site.");
    expect(record("proposals/P-0014.evidence-conversation-2026-10-03.md")).toContain("added to env local database");

    /** Whether /privacy's hosting line and /power's row name the provider, without saying there is none. */
    const names = (provider: string) => {
      const notNone = (s: string) => !/^None\b|\bHosting and database: none\b/i.test(s);
      const privacy = privacyLine("Hosting");
      const row = hostingRow().who;
      return { privacy: privacy.includes(provider) && notNone(privacy), power: row.includes(provider) && notNone(row) };
    };

    setEnv({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" });
    // Right, and wanted: a preview says it isn't the deployed site.
    expect(textOf(render(PrivacyPage))).toContain("This copy of our.one isn't the deployed site.");
    const preview = names("Vercel");

    setEnv({ DATABASE_URL: NEON_EU });
    const neon = names("Neon");

    // The defect: both say there is no host and no database where there is.
    expect({ preview, neon }).toEqual({ preview: { privacy: true, power: true }, neon: { privacy: true, power: true } });
  });

  it("DEFECT (MEDIUM): apps/web/README.md says '**Nothing is deployed.**' twice and 'No domain, provider account or real person's data is used', and package.json's description 'nothing is deployed' — each false the day our.one deploys (the release makes the founder's own account; M-0012 sends real email through Resend, at the domain our.one). That README is what GitHub shows at OPEN_CODE_URL, the 'Open code' link in every public footer, and where the root README's new section sends visitors from our.one ('The site and the feed: apps/web'); D-0020 §F and D-0021 §C want every status true on the deployed site and off it, and M-0018 left these unchanged", () => {
    expect(OPEN_CODE_URL).toBe("https://github.com/radosukala/ours/tree/main/apps/web");
    expect(textOf(renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page")))).toContain("Open code");
    expect(readmeFirstSection(true)).toContain("(./apps/web)");
    const turns = /nothing is deployed|no domain, provider account or real person's data is used/i;
    const description = (JSON.parse(read("package.json")) as { description: string }).description;
    expect({ readme: turns.test(flat(read("README.md"))), packageJson: turns.test(description) }).toEqual({ readme: false, packageJson: false });
  });

  it("DEFECT (LOW): deployed, a Neon host with no region label (`ep-….aws.neon.tech`, four labels) shows its first label, the endpoint's own name, as the region — 'Neon keeps its database, in region ep-fictional-pond-123456.' on /power, and the same on /privacy (served so on 3527): the part of the database's address that names it (D-0021 §C: 'the address itself is never shown'; M-0018: 'the database's address appears on no page'). A region shown should be a region code, or nothing", () => {
    const url = pg("ep-fictional-pond-123456.aws.neon.tech");
    expect(new URL(url).hostname.split(".")).toHaveLength(4);
    setEnv({ ...PRODUCTION, DATABASE_URL: url });
    const shown = { privacy: render(PrivacyPage).includes("ep-fictional-pond"), power: render(PowerPage).includes("ep-fictional-pond") };
    expect(shown).toEqual({ privacy: false, power: false });
  });

  it("DEFECT (LOW): deployed, /power's hosting row ends 'The accounts are the founder's.' under the badge 'stated in this server's configuration', with D-0021 §C as its one record; no setting can say whose accounts these are (hosting.ts itself calls it 'the founder's statement'), D-0021 doesn't say it, and the record that does, D-0013 §D ('All three are the founder's accounts.'), isn't cited", () => {
    expect(record("decisions/D-0013.md")).toContain("All three are the founder's accounts.");
    expect(record("decisions/D-0021.md")).not.toMatch(/accounts are the founder's|founder's accounts/);
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU });
    const row = hostingRow();
    const saysIt = row.who.includes("The accounts are the founder's");
    const cited = (row.evidence ?? []).some((e) => e.path === "decisions/D-0013.md") || row.who.includes("D-0013");
    expect(saysIt && row.statedBy === "configuration" && !cited).toBe(false);
  });

  it("DEFECT (LOW): deployed with a database the configuration doesn't name — another host, a look-alike, a malformed or a missing address — /privacy's hosting line names Vercel, says 'This server's configuration doesn't name its database's provider.', then 'Both as stated in this server's configuration.': both of one, the second being the configuration naming nothing (served so on 3527)", () => {
    const lines = [pg("db.example.test", "/ours"), pg("neon.tech.example.test"), "not a url", undefined].map((url) => {
      setEnv({ ...PRODUCTION, DATABASE_URL: url });
      return privacyLine("Hosting");
    });
    for (const line of lines) expect(line).not.toContain("Neon");
    expect(lines.filter((l) => l.includes("Both as stated"))).toEqual([]);
  });

  it("DEFECT (LOW): /power says 'This page changes when control changes. Every change is a commit in the our.one records, published with each release.' Since M-0018 its hosting row is the server's: deployed, moving the database to another region in Vercel's settings moves 'Neon keeps its database' from Frankfurt to Ohio with no commit, and the deploy itself turns the file's 'None: …' into 'Vercel runs this site, …' by none either; the line under it, 'The list is a file in the our.one records', links a file that says 'None: …'", () => {
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU });
    const frankfurt = hostingRow().who;
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_US });
    const ohio = hostingRow().who;
    expect(frankfurt).toContain("Frankfurt");
    expect(ohio).toContain("Ohio");
    const html = render(PowerPage);
    const claim = /<p>([^<]*Every change is a commit[^<]*)<\/p>/.exec(html)?.[1] ?? "";
    expect(claim === "" || /configuration|settings|server/i.test(claim)).toBe(true);
  });

  it("DEFECT (LOW): the README's first section, written for visitors from our.one, says 'our.one is a friends feed, and the first project of a network its founder is starting'; the records make our.one the network and the feed its first project — D-0017 §A ('our.one becomes a network of services … The feed is the first project'), D-0012 §C (our.one the name 'for the product and the network'), and the front door those visitors come from ('Starting with a friends feed. Building toward much more.')", () => {
    const d0017 = record("decisions/D-0017.md");
    expect(d0017).toContain("our.one becomes a network of services:");
    expect(d0017).toContain("The feed is the first project, under the same framework.");
    expect(record("decisions/D-0012.md")).toContain("It replaces the brand OURS of D-0004 for the product and the network.");
    expect(DOOR_LEDE).toContain("Starting with a friends feed.");
    const section = readmeFirstSection();
    expect(section).toContain("Coming from our.one?");
    expect(/\bour\.one is a (?:friends )?feed\b|\bour\.one is [^.]*\bthe first project of a network\b/i.test(section)).toBe(false);
  });

  it("DEFECT (LOW): the same section ends 'The rest of this page is about OURS, the institution behind it.' — an institution behind our.one, today; the page's own status says MEMBER INSTITUTION NOT YET FORMED (AGENTS.md §2), and its next lines call the institution sentence 'a sentence about what OURS is for, not a description of what exists'", () => {
    const readme = readRoot("README.md");
    expect(readme).toMatch(/MEMBER INSTITUTION\s+NOT YET FORMED/);
    expect(readRoot("AGENTS.md")).toMatch(/MEMBER INSTITUTION\s+NOT YET FORMED/);
    expect(flat(readme)).toContain("It is a sentence about what OURS is for, not a description of what exists.");
    expect(readmeFirstSection()).not.toMatch(/\bthe institution behind\b/i);
  });

  it("DEFECT (LOW): the claims scan has no rule for the status D-0021 prohibits — 'our.one is deployed.', 'our.one is live.', 'Nothing is deployed.' and 'our.one is not deployed yet.' all pass it — so a status that turns at the deploy is caught only on the three pages deploy-ready.test.ts renders; apps/web/README.md's 'Nothing is deployed.' (above) is that kind, as were two of the M-0017 verification's findings ('This line hasn't been tried yet.', kit/README's 'Not deployed yet.'), and the scan reads neither apps/web/README.md nor the root README", () => {
    expect(record("decisions/D-0021.md")).toContain(
      "a page that says our.one is deployed, or names a host, a database or an administrator, unless the server rendering it runs there or holds it;",
    );
    expect(publicTextFiles(WEB)).not.toContain("README.md");
    const samples = ["our.one is deployed.", "our.one is live.", "Nothing is deployed.", "our.one is not deployed yet."];
    expect(samples.map((s) => scanText(s, null).length > 0)).toEqual([true, true, true, true]);
  });

  it("DEFECT (LOW): /power cites 'Founding authority, section 4' twice (the domain our.one, and the money); that section's control map says 'production infrastructure | none provisioned', which the deploy makes false — our.one on Vercel and Neon in the founder's accounts (D-0013 §D, M-0012), with a Vercel project the founder has already made (P-0014). authority/** is outside M-0018's paths, so this is the founder's to amend, by a record", () => {
    const cites = loadControl().flatMap((r) => (r.evidence ?? []).filter((e) => e.path === "authority/FOUNDING-AUTHORITY.md"));
    expect(cites.length).toBeGreaterThanOrEqual(2);
    expect(cites.every((e) => /section 4/.test(e.label))).toBe(true);
    expect(readRoot("authority/FOUNDING-AUTHORITY.md")).not.toMatch(/\|\s*production infrastructure\s*\|\s*none provisioned\s*\|/);
  });

  it("DEFECT (LOW): deployed, /privacy says Neon keeps the database and 'everything in the table above is stored there'; the seat line — the address of everyone who asks for a seat, the `waitlist` table — is told in the paragraph below the table, and is stored there too; the feed's manifest says Neon holds 'everything in data.collects', which lists the seat requests", () => {
    expect(read("src/core/schema.ts")).toMatch(/pgTable\(\s*"waitlist",\s*\{\s*email: text\("email"\)/);
    const manifest = JSON.parse(read("our.one.json")) as { data: { collects: { what: string }[]; sharedWith: { who: string; what: string }[] } };
    expect(manifest.data.collects.some((c) => /^Seat requests/.test(c.what))).toBe(true);
    expect(manifest.data.sharedWith.find((s) => s.who === "Neon")?.what).toContain("everything in data.collects");
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU });
    const html = render(PrivacyPage);
    const line = privacyLine("Hosting", html);
    expect(line).toContain("Neon keeps");
    const tableHasSeats = /<h3[^>]*>[^<]*[Ss]eat[^<]*<\/h3>/.test(html);
    expect(line.includes("table above") && !/seat/i.test(line) && !tableHasSeats).toBe(false);
  });

  it("DEFECT (LOW): the rule 'Only the founder can be the administrator.' is shown as true before the deploy, but the documented way to run a copy (apps/web/README's 'Run it locally': seed:fictional) makes 'Ada Quillon', who 'Runs the allotment rota', the administrator — never called the founder, while the same copy's /contract says the maintainer who acts on reports is Rado. D-0021 §I's reason, repeated in hosting.ts ('only the founder script and the release make an administrator'), misses this third path, which sets is_admin itself, outside createFirstAccount. (The rule holds there only by /rules' own definition: Ada is that copy's first, uninvited account.)", () => {
    expect(read("README.md")).toContain("seed:fictional");
    expect(textOf(render(ContractPage))).toMatch(/acts on reports, and pays the bills\. Today that is me, Rado/);
    const seed = read("scripts/seed-fictional.ts");
    const people = [...seed.matchAll(/\{ key: "(\w+)", handle: "[^"]+", name: "([^"]+)", about: "([^"]*)"([^}]*)\}/g)].map((m) => ({
      name: m[2]!,
      about: m[3]!,
      rest: m[4]!,
    }));
    expect(people.length).toBeGreaterThan(0);
    const admins = seed.includes("createFirstAccount") ? people.slice(0, 1) : people.filter((p) => /isAdmin: true/.test(p.rest));
    const ruleNamesTheFounder = textOf(render(RulesPage)).includes("Only the founder can be the administrator.");
    const notCalledTheFounder = admins.filter((p) => !/founder/i.test(`${p.name} ${p.about}`)).map((p) => p.name);
    expect(ruleNamesTheFounder ? notCalledTheFounder : []).toEqual([]);
  });

  it("DEFECT (LOW): one of the five adapted tests now says the opposite of what it checks — verify-m0017-honesty.test.ts's 'closed: … the hosting line it carries is the one M-0012's precondition 11 names, unchanged' asserts M-0018's changed line ('This copy of our.one isn't the deployed site. …'); the comment inside says 'Changed under M-0018', but the title, which is what a run and a receipt show, still says unchanged", () => {
    const source = read("tests/verify-m0017-honesty.test.ts");
    const at = source.indexOf("This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.");
    expect(at).toBeGreaterThan(-1);
    const titleAt = source.lastIndexOf('\n  it("', at);
    const title = source.slice(titleAt, source.indexOf('", () => {', titleAt));
    expect(title).toContain("closed:");
    expect(title).not.toMatch(/\bunchanged\b/);
  });
});

/* -------------------------------------------------------------- closed */

/** The platform's region: what a page should say of it, or null for nothing. */
const REGIONS: { value: string | undefined; words: string | null }[] = [
  { value: "fra1", words: "Frankfurt, Germany (fra1)" },
  { value: "iad1", words: "Washington, D.C., United States (iad1)" },
  { value: "hkg1", words: "region hkg1" },
  { value: undefined, words: null },
  { value: "", words: null },
  { value: "FRA1 ; drop", words: null },
];

/** The database's address: whether a page should name Neon, and its region's words. */
const DATABASES: { name: string; url: string | undefined; neon: boolean; words: string | null }[] = [
  { name: "Neon in eu-central-1, pooled", url: NEON_EU, neon: true, words: "Frankfurt, Germany (eu-central-1)" },
  { name: "Neon with a cell label", url: pg("ep-fictional-pond-123456-pooler.c-2.eu-central-1.aws.neon.tech"), neon: true, words: "Frankfurt, Germany (eu-central-1)" },
  { name: "Neon in us-east-2", url: NEON_US, neon: true, words: "Ohio, United States (us-east-2)" },
  { name: "Neon on Azure", url: pg("ep-fictional-pond-123456.germanywestcentral.azure.neon.tech"), neon: true, words: "Frankfurt, Germany (germanywestcentral)" },
  { name: "another host", url: pg("db.example.test", "/ours"), neon: false, words: null },
  { name: "a look-alike ending elsewhere", url: pg("ep-fictional-pond-123456.eu-central-1.aws.neon.tech.example.test"), neon: false, words: null },
  { name: "a look-alike's own domain", url: pg("eu-central-1.aws.evil-neon.tech"), neon: false, words: null },
  { name: "neon.tech under another domain", url: pg("neon.tech.example.test"), neon: false, words: null },
  { name: "malformed", url: "not a url", neon: false, words: null },
  { name: "unset", url: undefined, neon: false, words: null },
];

describe("closed (each passes on bee6e3b)", () => {
  it("closed: on Vercel's production deployment (imitated) every hosting sentence is true in every state tried — the region fra1, iad1, an unknown code, none, empty or malformed, times a Neon host in eu-central-1 (pooled, with a cell label), in us-east-2 or on Azure, another host, three look-alikes, malformed or unset — /privacy and /power name Vercel with the platform's region (its place when known, its code otherwise, nothing when none or malformed), Neon only for a host under .neon.tech with the region before aws or azure, nothing for any other, the same words on both pages, STATED as the configuration's, and neither page says this copy isn't the deployed site (served the same on 3527)", () => {
    for (const r of REGIONS) {
      for (const d of DATABASES) {
        setEnv({ ...PRODUCTION, VERCEL_REGION: r.value, DATABASE_URL: d.url });
        const where = `${String(r.value)} × ${d.name}`;
        const row = hostingRow();
        expect(row, where).toMatchObject({ status: "STATED", statedBy: "configuration" });
        for (const text of [privacyLine("Hosting"), row.who]) {
          expect(text, where).toMatch(/^Vercel runs /);
          if (r.words) expect(text, where).toContain(`, in ${r.words}`);
          else expect(text, where).toMatch(/^Vercel runs (?:our\.one's server:|this site\.)/);
          if (d.neon) {
            expect(text, where).toMatch(/Neon keeps (?:our\.one's|its) database/);
            if (d.words) expect(text, where).toContain(`database, in ${d.words}`);
            else expect(text, where).toMatch(/Neon keeps (?:our\.one's|its) database[.:]/);
          } else {
            expect(text, where).not.toContain("Neon");
            expect(text, where).toContain("This server's configuration doesn't name its database's provider.");
          }
        }
        for (const page of [PrivacyPage, PowerPage, RulesPage]) {
          expect(textOf(render(page)), where).not.toMatch(/isn't the deployed site|not deployed/i);
        }
      }
    }
  });

  it("closed: no page shows any part of a database address — user, password, endpoint, pooler, database name, query, cell label, another host, a look-alike, a malformed value — on /privacy, /power or /rules, deployed, in a preview or on a local copy, in every state tried but the region-less host above (Neon's old `cloud` shape included); the served pages, flight data included, carried none either (3527)", () => {
    for (const d of [...DATABASES, { name: "Neon, the old cloud shape", url: pg("ep-fictional-pond-123456.cloud.neon.tech") }]) {
      for (const [name, vars] of [
        ["deployed", PRODUCTION],
        ["a preview", { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" }],
        ["a local copy", {}],
      ] as const) {
        setEnv({ ...vars, DATABASE_URL: d.url });
        for (const page of [PrivacyPage, PowerPage, RulesPage]) {
          const html = render(page);
          for (const part of ADDRESS_PARTS) expect(html.includes(part), `${part}: ${d.name}, ${name}`).toBe(false);
        }
      }
    }
  });

  it("closed: anywhere but Vercel's production deployment — no VERCEL variables, VERCEL=1 alone, VERCEL_ENV development (as `vercel dev` runs), VERCEL_ENV production without VERCEL=1, VERCEL='true' — /privacy opens with 'This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.' and neither /privacy nor /power names Vercel, Neon or a region, so D-0021's prohibition holds: a host is named only where the server runs; a preview says it isn't the deployed site too", () => {
    const elsewhere: [string, Record<string, string>][] = [
      ["no VERCEL variables", {}],
      ["VERCEL=1 alone", { VERCEL: "1" }],
      ["vercel dev", { VERCEL: "1", VERCEL_ENV: "development", VERCEL_REGION: "dev1" }],
      ["VERCEL_ENV=production without VERCEL=1", { VERCEL_ENV: "production", VERCEL_REGION: "fra1" }],
      ["VERCEL='true'", { VERCEL: "true", VERCEL_ENV: "production", VERCEL_REGION: "fra1" }],
    ];
    for (const [name, vars] of elsewhere) {
      setEnv(vars);
      const privacy = textOf(render(PrivacyPage));
      const power = textOf(render(PowerPage));
      expect(privacy, name).toContain("This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.");
      for (const text of [privacy, power]) expect(text, name).not.toMatch(/Vercel|Neon|\(fra1\)|dev1|eu-central-1/);
    }
    setEnv({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" });
    expect(textOf(render(PrivacyPage))).toContain("This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.");
  });

  it("closed: email, deployed or not, is what sendMail would do — outbox, refused and Resend each give /privacy's line and /power's sentence for that case, Resend is named on either page only when it sends, and /privacy and /power never disagree about it", () => {
    for (const deployed of [true, false]) {
      for (const s of SENDING) {
        setEnv({ ...(deployed ? { ...PRODUCTION, DATABASE_URL: NEON_EU } : {}), ...s.vars });
        const where = `${deployed ? "deployed" : "not deployed"}, ${s.name}`;
        expect(emailSending(), where).toBe(s.name);
        const privacy = render(PrivacyPage);
        const row = hostingRow().who;
        expect(privacyLine("Email provider", privacy), where).toBe(EMAIL_PROVIDER_WORDS[s.name]);
        expect(textOf(privacy).includes("Resend"), where).toBe(s.name === "resend");
        expect(row.includes("Resend"), where).toBe(s.name === "resend");
        const sentence = {
          outbox: "This server sends no email: each message is written to a test outbox instead.",
          refused: "No email is sent: this server's email setup is incomplete.",
          resend: "Resend delivers the emails this server sends.",
        }[s.name];
        expect(row, where).toContain(sentence);
      }
    }
  });

  it("closed: the administrator rule holds as written in every state — /privacy, /power's Moderation row and /rules say 'Only the founder can be the administrator.' deployed, in a preview or not, with every email setting, and no page says an administrator exists or doesn't; it agrees with /rules' other lines ('A person reads every report', 'Only an administrator can open the report queue', the founder's account the first, uninvited one), /contract (the maintainer 'acts on reports … Today that is me, Rado') and SPEC §18.20; and no code path promotes an account: the only `isAdmin: true` in src is createFirstAccount's insert, nothing sets is_admin later, and the founder script and the release both go through it (the fictional seed is the exception above)", () => {
    for (const vars of [{}, { ...PRODUCTION, DATABASE_URL: NEON_EU }, { VERCEL: "1", VERCEL_ENV: "preview" }]) {
      for (const s of SENDING) {
        setEnv({ ...vars, ...s.vars });
        const privacy = textOf(render(PrivacyPage));
        const power = textOf(render(PowerPage));
        const rules = textOf(render(RulesPage));
        expect(privacy).toContain("decides what happens. Only the founder can be the administrator.");
        expect(power).toContain("Moderation stated by the founder, not verified The founder: only the founder can be the administrator.");
        expect(rules).toContain("Only the founder can be the administrator. If you think a decision is wrong, write to the data controller");
        for (const text of [privacy, power, rules]) {
          expect(text).not.toMatch(/No administrator exists|until (?:our\.one|something) is deployed|the founder will be the only one|has no administrator|is the only administrator/i);
        }
      }
    }
    const rules = textOf(render(RulesPage));
    expect(rules).toContain("A person reads every report and decides what happens.");
    expect(rules).toContain("Only an administrator can open the report queue.");
    expect(rules).toContain("Every account except the founder's is invited by a person.");
    expect(rules).toContain("The founder's account is the first one, so nobody could invite it.");
    expect(textOf(render(ContractPage))).toMatch(/acts on reports, and pays the bills\. Today that is me, Rado/);
    expect(flat(read("SPEC.md")).replace(/[*`]/g, "")).toContain(
      "\"Only the founder can be the administrator.\" on /privacy and in the house rules, and \"The founder: only the founder can be the administrator.\" in /power's Moderation row.",
    );

    const files = sourceFiles();
    expect(files.filter((f) => /isAdmin:\s*true/.test(read(f)))).toEqual(["src/core/founder.ts"]);
    expect(files.filter((f) => /\.set\(\s*\{[^}]*\bisAdmin\b/.test(read(f)))).toEqual([]);
    expect(read("src/core/founder.ts")).toMatch(/invitedBy: null,[\s\S]*isAdmin: true,/);
    expect(read("scripts/release.ts")).toContain("createFirstAccount(");
    expect(read("scripts/seed-founder.ts")).toContain("createFirstAccount(");
  });

  it("closed: 'The accounts are the founder's.' holds, as the founder's word in the records — D-0013 §D: 'Hosting: Vercel. Database: Neon. Email: Resend. All three are the founder's accounts.'; M-0012 names each external system '(founder's account)'; and the pages agree: /contract 'I also hold the domain, the data and the keys', /projects 'The founder holds its domain, its data and its keys.' (its badge and record are the defect above)", () => {
    expect(record("decisions/D-0013.md")).toMatch(/Hosting: Vercel\. - Database: Neon\. - Email: Resend\. All three are the founder's accounts\./);
    const m0012 = readRoot("mandates/M-0012.yaml");
    for (const system of ["vercel (founder's account)", "neon (founder's account)", "resend (founder's account)"]) expect(m0012).toContain(system);
    expect(textOf(render(ContractPage))).toContain("I also hold the domain, the data and the keys");
    expect(textOf(render(ProjectsPage))).toContain("The founder holds its domain, its data and its keys.");
  });

  it("closed: what /privacy says Vercel, Neon and Resend receive, deployed, is what each receives and what the feed's manifest says — Vercel: every request, with the visitor's IP address (our.one.json: 'Everything the site serves and receives, while it runs there'); Neon: the database (our.one.json: 'The database, which holds everything in data.collects'); Resend, only when it sends: the address and each email's subject and text, word for word the manifest's (apart from the seat line and the preview, above)", () => {
    const manifest = JSON.parse(read("our.one.json")) as { data: { sharedWith: { who: string; what: string }[] } };
    const shared = Object.fromEntries(manifest.data.sharedWith.map((s) => [s.who, s.what]));
    expect(shared.Vercel).toBe("Everything the site serves and receives, while it runs there.");
    expect(shared.Neon).toBe("The database, which holds everything in data.collects, while it is kept there.");
    expect(shared.Resend).toBe("Your email address, and each email's subject and text.");
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU, ...SENDING[2]!.vars });
    const html = render(PrivacyPage);
    const line = privacyLine("Hosting", html);
    expect(line).toContain("Vercel runs our.one's server, in Frankfurt, Germany (fra1): every request to the site passes through it, with your IP address.");
    expect(line).toContain("Neon keeps our.one's database, in Frankfurt, Germany (eu-central-1)");
    expect(privacyLine("Email provider", html)).toContain("It receives your email address and each email's subject and text.");
  });

  it("closed: nothing is frozen at build time — the public layout and /privacy are force-dynamic, so `next build` lists /power, /privacy and /rules as ƒ (built here, served on 3527), and hosting(), emailSending() and loadControl() read the environment when called: two renders in one process, under two environments, differ; so VERCEL_REGION, which Vercel gives a running function and not a build, reaches the pages", () => {
    expect(read("src/app/(public)/layout.tsx")).toContain('export const dynamic = "force-dynamic";');
    expect(read("src/app/(public)/privacy/page.tsx")).toContain('export const dynamic = "force-dynamic";');
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU });
    const first = [render(PowerPage), render(PrivacyPage)];
    setEnv({ ...PRODUCTION, VERCEL_REGION: "iad1", DATABASE_URL: NEON_US });
    const second = [render(PowerPage), render(PrivacyPage)];
    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect(textOf(second[0]!)).toContain("Vercel runs this site, in Washington, D.C., United States (iad1). Neon keeps its database, in Ohio, United States (us-east-2).");
    expect(hosting({ ...PRODUCTION, VERCEL_REGION: undefined })).toEqual({ deployed: true, region: null, database: null });
  });

  it("closed: deployed (imitated), no public page says our.one isn't deployed, or anything true only before the deploy — the front door, /feed, /projects, /build, /maintainers, /agreement, /contract, /costs, /rules, /power, /privacy, the layout and the not-found page say nothing of being not deployed, a test copy, tested or built locally, or not yet live (served the same, all twenty public routes, on 3527); and off it, the only such line is /privacy's and /power's 'this copy of our.one isn't the deployed site'", async () => {
    const turns = /not (?:yet )?deployed|isn't (?:yet )?deployed|isn't the deployed site|nothing is deployed|tested locally|built locally|a test copy|not (?:yet )?live|isn't live/i;
    const pages = async (): Promise<[string, string][]> => [
      ["/", renderToStaticMarkup((await FrontDoorRoute()) as ReactElement)],
      ["/feed", renderToStaticMarkup((await FeedPageRoute()) as ReactElement)],
      ["/projects", render(ProjectsPage)],
      ["/build", render(BuildPage)],
      ["/maintainers", render(MaintainersPage)],
      ["/agreement", render(AgreementPage)],
      ["/contract", render(ContractPage)],
      ["/costs", render(CostsPage)],
      ["/rules", render(RulesPage)],
      ["/power", render(PowerPage)],
      ["/privacy", render(PrivacyPage)],
      ["the layout", renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"))],
      ["not found", render(NotFound)],
    ];
    setEnv({ ...PRODUCTION });
    for (const [where, html] of await pages()) expect(textOf(html), where).not.toMatch(turns);
    setEnv({});
    const off = (await pages()).filter(([, html]) => turns.test(textOf(html))).map(([where]) => where);
    expect(off).toEqual(["/power", "/privacy"]);
  });

  it("closed: the README's first section holds where it can be checked — the founder decides under bootstrap authority and no member ownership has been issued (AGENTS.md §2), the agreement is a draft (/agreement: 'No one has signed this agreement yet.'), its links name folders that exist, the receipts include verifications by agents that didn't build what they checked (receipts/conformance), the history is kept with its mistakes (D-0021 §A; P-0014's fcec996 is in it), and 'Whether it is deployed, and where, the site itself says on its Who controls what page' is true in both states; nothing in it turns at the deploy (apart from the two lines above); and the site's claims rules, run on it, find only 'handed to' in 'handed to an agent as a bounded task', the handover rule reading words, not meaning: it is about mandates, not the handover", () => {
    const section = readmeFirstSection();
    expect(section).toMatch(/the founder decides, under bootstrap authority/i);
    expect(section).toMatch(/no member ownership has been issued/i);
    const agents = readRoot("AGENTS.md");
    expect(agents).toMatch(/AUTHORITY\s+FOUNDER BOOTSTRAP/);
    expect(agents).toMatch(/MEMBER OWNERSHIP\s+NOT YET ISSUED/);
    expect(section).toMatch(/common agreement[^.]* is a draft/i);
    expect(textOf(render(AgreementPage))).toContain("No one has signed this agreement yet.");

    const links = [...readmeFirstSection(true).matchAll(/\]\(\.\/([^)]+)\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const link of links) expect(statSync(join(ROOT, link)).isDirectory(), link).toBe(true);

    expect(section).toMatch(/independent verifications, by agents that didn't build what they checked/);
    expect(readdirSync(join(ROOT, "receipts/conformance")).filter((f) => f.endsWith(".verification.md")).length).toBeGreaterThan(0);
    expect(section).toMatch(/history is kept on purpose, first drafts and mistakes included/i);
    expect(record("decisions/D-0021.md")).toContain("No new repository, and no history rewritten.");
    expect(git(["cat-file", "-t", "fcec996"]).trim()).toBe("commit");

    expect(section).toMatch(/Whether it is deployed, and where, the site itself says on its Who controls what page/);
    setEnv({});
    expect(hostingRow().who).toContain("isn't the deployed site");
    setEnv({ ...PRODUCTION, DATABASE_URL: NEON_EU });
    expect(hostingRow().who).toContain("Vercel runs this site, in Frankfurt, Germany (fra1).");
    expect(textOf(render(PowerPage))).toMatch(/^Who controls what /);

    expect(section).not.toMatch(/\b(?:is not|isn't|not yet) deployed\b|nothing is deployed|\bis live\b|\blaunched\b|tested locally/i);
    const hits = scanText(section, null).map((h) => h.match);
    expect(hits.filter((m) => m !== "handed to")).toEqual([]);
    if (hits.length > 0) expect(section).toContain("handed to an agent as a bounded task");
  });

  it("closed: the claims scan reads every file M-0018 added or changed under src and transparency — hosting.ts, founder.ts, transparency.ts, privacy/page.tsx, floorRules.ts, the weekly email's route and control.json — and finds nothing in its whole list; /privacy, /power and /rules, rendered in every state tried, pass it too; no new sentence names an owner but the founder, and none says user control, a holder or a safeguard exists", () => {
    const changed = git(["diff", "--name-only", "80579b3", "bee6e3b", "--", "apps/web/src", "apps/web/transparency"])
      .split("\n")
      .filter(Boolean)
      .map((p) => p.replace(/^apps\/web\//, ""));
    expect(changed.sort()).toEqual([
      "src/app/(public)/privacy/page.tsx",
      "src/app/api/cron/weekly-digest/route.ts",
      "src/components/public/floorRules.ts",
      "src/core/founder.ts",
      "src/core/hosting.ts",
      "src/core/transparency.ts",
      "transparency/control.json",
    ]);
    const files = publicTextFiles(WEB);
    for (const file of changed) expect(files, file).toContain(file);
    expect(scanRepoPublicText(WEB).hits).toEqual([]);
    // Each page read as claims.test.ts reads it: the HTML and its text, with
    // the allowlist of the file its words come from (/rules: floorRules.ts).
    const pages: [unknown, string | null][] = [
      [PrivacyPage, null],
      [PowerPage, null],
      [RulesPage, "src/components/public/floorRules.ts"],
    ];
    const hits = (page: unknown, file: string | null) => {
      const html = render(page);
      return [...scanText(html, file), ...scanText(textOf(html), file)].map((h) => h.match);
    };
    for (const r of REGIONS.slice(0, 3)) {
      for (const d of DATABASES) {
        for (const s of SENDING) {
          setEnv({ ...PRODUCTION, VERCEL_REGION: r.value, DATABASE_URL: d.url, ...s.vars });
          for (const [page, file] of pages) expect(hits(page, file), `${String(r.value)} × ${d.name} × ${s.name}`).toEqual([]);
        }
      }
    }
    for (const vars of [{}, { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_REGION: "fra1" }, { DATABASE_URL: NEON_EU }]) {
      setEnv(vars);
      for (const [page, file] of pages) expect(hits(page, file)).toEqual([]);
    }
  });

  it("closed: the five older test files M-0018 changed kept their force — each assertion on the old words now asserts the new words exactly where the old ones were (the Moderation row, the hosting row in all three email states, /privacy's notice and hosting line); withHosting is refused for the same four bad files withEmailSending was; verify-honesty follows the first-account insert to founder.ts and still checks the script calls it; no assertion was dropped, none skipped, and each change says 'Changed under M-0018' (one title is the defect above)", () => {
    const adapted = ["transparency.test.ts", "verify-honesty.test.ts", "verify-m0015-honesty.test.ts", "verify-m0017-honesty.test.ts", "verify2-honesty.test.ts"];
    const changed = git(["diff", "--name-only", "80579b3", "bee6e3b", "--", "apps/web/tests"]).split("\n").filter(Boolean).sort();
    expect(changed).toEqual(["apps/web/tests/deploy-ready.test.ts", ...adapted.map((f) => `apps/web/tests/${f}`)].sort());
    const count = (lines: string[], re: RegExp) => lines.filter((l) => re.test(l)).length;
    const added: string[] = [];
    for (const f of adapted) {
      const diff = git(["diff", "--unified=0", "80579b3", "bee6e3b", "--", `apps/web/tests/${f}`]).split("\n");
      const minus = diff.filter((l) => l.startsWith("-") && !l.startsWith("---"));
      const plus = diff.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      added.push(...plus);
      expect(count(plus, /expect\(/), f).toBeGreaterThanOrEqual(count(minus, /expect\(/));
      expect(count(plus, /toThrow\(/), f).toBeGreaterThanOrEqual(count(minus, /toThrow\(/));
      expect(plus.filter((l) => /\.(?:skip|todo|only)\(|skipIf|runIf/.test(l)), f).toEqual([]);
      expect(plus.some((l) => l.includes("Changed under M-0018")), f).toBe(true);
      const before = git(["show", `80579b3:apps/web/tests/${f}`]);
      const after = git(["show", `bee6e3b:apps/web/tests/${f}`]);
      expect((after.match(/expect\(/g) ?? []).length, f).toBeGreaterThanOrEqual((before.match(/expect\(/g) ?? []).length);
    }
    const words = added.join("\n");
    for (const now of [
      "The founder: only the founder can be the administrator.",
      "None: this copy of our.one isn't the deployed site.",
      "This copy of our.one isn't the deployed site. This notice describes what our.one keeps when it runs.",
      "createFirstAccount\\(",
      "src/core/founder.ts",
      "withHosting([{ ...file[0]!, who: \"FICTIONAL Host, Inc.\" }], \"outbox\", here)).toThrow(TransparencyError)",
    ]) {
      expect(words, now).toContain(now);
    }
  });

  it("closed: the places the pages name are the providers' — Vercel's fra1 Frankfurt, cdg1 Paris, arn1 Stockholm, dub1 Dublin, lhr1 London and iad1 Washington, D.C.; AWS's eu-central-1 Frankfurt, eu-west-2 London, us-east-1 Virginia, us-east-2 Ohio and us-west-2 Oregon; Azure's germanywestcentral Frankfurt (checked against the providers' published region names as the verifier knows them, with no network); and the region the pages name is the one apps/web/vercel.json sets, D-0021 §D's Frankfurt", () => {
    const vercel: Record<string, string> = {
      fra1: "Frankfurt, Germany",
      cdg1: "Paris, France",
      arn1: "Stockholm, Sweden",
      dub1: "Dublin, Ireland",
      lhr1: "London, United Kingdom",
      iad1: "Washington, D.C., United States",
    };
    for (const [code, place] of Object.entries(vercel)) {
      expect(hosting({ ...PRODUCTION, VERCEL_REGION: code }), code).toMatchObject({ region: { code, place } });
    }
    const aws: Record<string, string> = {
      "eu-central-1": "Frankfurt, Germany",
      "eu-west-2": "London, United Kingdom",
      "us-east-1": "Virginia, United States",
      "us-east-2": "Ohio, United States",
      "us-west-2": "Oregon, United States",
    };
    for (const [code, place] of Object.entries(aws)) {
      expect(databaseFromUrl(pg(`ep-fictional-pond-123456.${code}.aws.neon.tech`)), code).toEqual({ provider: "Neon", region: { code, place } });
    }
    expect(databaseFromUrl(pg("ep-fictional-pond-123456.germanywestcentral.azure.neon.tech"))).toEqual({
      provider: "Neon",
      region: { code: "germanywestcentral", place: "Frankfurt, Germany" },
    });
    expect((JSON.parse(read("vercel.json")) as { regions: string[] }).regions).toEqual(["fra1"]);
    expect(record("decisions/D-0021.md")).toContain("The functions run in Frankfurt (fra1), beside the database.");
  });
});
