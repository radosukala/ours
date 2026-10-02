/**
 * Independent re-check of M-0016 (the build kit; D-0019, SPEC §18.18): the
 * last round of the verification whose stopping rule is declared in
 * receipts/conformance/2026-10-02-M-0016.verification.md. After it, every
 * finding is fixed or recorded, with no further round. Written by an agent
 * that built none of the kit, against 25ce8f0 (the tool 0.2.0, which fixed
 * round one's 57 defects). It changes no product code, no record and no
 * other test.
 *
 * What was re-checked:
 * 1. each of round one's 57 fixes, against close variants of its case, and
 *    whether a renamed or adapted test lost its force;
 * 2. what the rewrite broke or opened: the comment stripper and the import
 *    parser, honest projects it fails, rule-breaking projects it passes,
 *    what it prints, its speed on crafted and on ordinary input, the stop
 *    hook against Claude Code 2.1.185 (the binary on this machine), and
 *    init;
 * 3. the new copy: /build, /projects, build.md, the README, the rules
 *    block, SPEC §18.18's note and the feed's our.one.json, against the
 *    records and the code;
 * 4. the feed, checked as apps/web/AGENTS.md says.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Assertions before
 *   the last are evidence, and pass; the last FAILS on 25ce8f0, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows. The number (C1 to C23) is
 *   the re-checker's report's.
 * - "closed: …" is a check that was tried and held. It passes.
 * - Severity as round one used it: HIGH, something stated as decided, in
 *   force or approved that isn't; MEDIUM, a rule that silently fails to hold
 *   on ordinary input, or a statement the code or the records contradict;
 *   LOW, rarer cases, wording and small gaps.
 *
 * Timings in titles were measured on this machine (Apple silicon, Node
 * v25.3.0); the assertions leave a wide margin. Every project, person and
 * address is FICTIONAL, made in a temporary folder and removed after each
 * test. Every secret-shaped string is assembled at run time from parts, so
 * none sits in this file: the feed's own check reads tests/ for secrets.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import BuildPage from "@/app/(public)/build/page";
import { KIT_DIR } from "@/core/kit";
import { KIT_TOOL } from "@/core/kit-info";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TOOL = join(KIT_DIR, "our-one.mjs");
/** The agent trial's project, its tracked files as committed (7ec16d8), made with tool 0.1.0. */
const TRIAL = join(ROOT, "receipts/conformance/2026-10-02-M-0016-agent-trial/book-club");
/** Tool 0.1.0, the copy the trial's project carries (SHA-256 ab12bc2e…, as its REPORT says). */
const TOOL_0_1_0 = realpathSync(join(TRIAL, "scripts/our-one.mjs"));

const read = (path: string) => readFileSync(join(WEB, path), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
/** A record as a reader reads it: markdown emphasis and code marks dropped, whitespace collapsed. */
const record = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/[*`]/g, "").replace(/\s+/g, " ");

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

type Finding = { message: string; file?: string; line?: number; fix?: string };
type Check = { id: string; class: string; outcome: "pass" | "fail" | "not-checked"; summary: string; findings: Finding[] };
type Report = { result: "ready" | "not-ready"; checks: Check[] };
type Tool = {
  RULES_BLOCK: string;
  RULES_VERSION: string;
};

let tool: Tool;
beforeAll(async () => {
  tool = (await import(pathToFileURL(TOOL).href)) as Tool;
});

const made: string[] = [];
afterEach(() => {
  while (made.length > 0) rmSync(made.pop()!, { recursive: true, force: true });
});

/** A FICTIONAL project in a temporary folder, by its real path: these files, and a git repository unless `git` is false. */
function project(files: Record<string, string>, { git = true } = {}): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "recheck-m0016-")));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

/** The trial's project, copied into a fresh repository with every file added, as our.one would receive it. */
function trialProject(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "recheck-m0016-trial-")));
  made.push(dir);
  cpSync(TRIAL, dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

type Run = { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; ms: number };

function run(dir: string, args: string[], input?: string, timeout = 60_000, tool_ = TOOL): Run {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [tool_, ...args, "--project", dir], { encoding: "utf8", input, timeout });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: Date.now() - t0 };
}

function report(dir: string, tool_ = TOOL): Report {
  return JSON.parse(run(dir, ["check", "--json"], undefined, 60_000, tool_).stdout) as Report;
}

function check(dir: string, id: string, tool_ = TOOL): Check {
  const c = report(dir, tool_).checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
}

/** Every output mode a person or an agent sees: text, --json, and --hook both times. */
function everyOutput(dir: string): string {
  return [
    run(dir, ["check"]),
    run(dir, ["check", "--json"]),
    run(dir, ["check", "--hook"], '{"stop_hook_active":false}'),
    run(dir, ["check", "--hook"], '{"stop_hook_active":true}'),
  ]
    .flatMap((r) => [r.stdout, r.stderr])
    .join("\n");
}

const MIT = "FICTIONAL licence text for tests.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n";
const RESEND = { who: "Resend", what: "Your email address.", why: "To send sign-in links.", packages: ["resend"] };

function manifest(over: Record<string, unknown> = {}, data: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      rules: "0",
      name: "FICTIONAL tool",
      purpose: "Keeps a FICTIONAL list for the people who use it.",
      maintainers: [{ name: "FICTIONAL Maintainer", contact: "maintainer@example.test" }],
      source: "https://example.test/fictional/tool",
      license: "MIT",
      costs: "COSTS.md",
      data: {
        collects: [{ what: "Your email address.", why: "To sign you in.", kept: "Until you delete your account." }],
        sharedWith: [RESEND],
        boundary: ["src/data"],
        export: "Settings, then Download.",
        delete: "Settings, then Delete account.",
        ...data,
      },
      ...over,
    },
    null,
    2,
  );
}

function pkg(deps: Record<string, string> = {}, over: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: "fictional-tool", license: "MIT", dependencies: { pg: "8.0.0", resend: "6.0.0", ...deps }, ...over });
}

/** A FICTIONAL project that keeps every rule (round one's, as it is). Each test changes one thing. */
function good(): Record<string, string> {
  return {
    "package.json": pkg(),
    LICENSE: MIT,
    "AGENTS.md": `# AGENTS.md\n\n${tool.RULES_BLOCK}\n`,
    "our.one.json": manifest(),
    "COSTS.md": "# Costs\n\nHosting: a FICTIONAL host, nothing a month, paid by the maintainer.\n",
    "src/data/db.ts": 'import pg from "pg";\nexport const pool = new pg.Pool();\n',
    "src/mail.ts": 'import { Resend } from "resend";\nexport const mail = new Resend();\n',
    "src/app/page.tsx": "export default function Page() { return <p>FICTIONAL tool</p>; }\n",
    "README.md": "# FICTIONAL tool\n\nA tool for tests.\n",
  };
}

const rep = (s: string, n: number) => s.repeat(n);

/** An ordinary React file of about `bytes` bytes: the same small component, over and over. */
function ordinaryTsx(bytes: number): string {
  const unit = [
    'import { useState } from "react";',
    "export function Row({ name, count }: { name: string; count: number }) {",
    "  const [open, setOpen] = useState(false);",
    "  return (",
    '    <li className="row" onClick={() => setOpen(!open)}>',
    "      <span>{name}</span> <span>{count} items</span>",
    "    </li>",
    "  );",
    "}",
    "",
  ].join("\n");
  return unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes);
}

/** Every eight-character piece of `secret` that appears in `out`. */
function piecesIn(out: string, secret: string): string[] {
  const found: string[] = [];
  for (let i = 0; i + 8 <= secret.length; i += 1) if (out.includes(secret.slice(i, i + 8))) found.push(secret.slice(i, i + 8));
  return found;
}

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on 25ce8f0)", () => {
  // C1
  it("fixed (HIGH): the fix changed rules version 0 without a new rules version or a decision: rule 8 became 'No secrets or data in the repository' (D-0019 §C's rule 8 is 'No secrets in the code') with a new duty over people's data, and rule 10 gained 'Ask the person for anything only they know' — D-0019 prohibits 'changing the rules without a new rules version and a decision', and kit/README.md says the same; the block still says version 0, so the trial's project, whose block nobody touched, now fails 'agents' with 'The rules block in AGENTS.md was changed'", () => {
    const d19 = record("decisions/D-0019.md");
    expect(d19).toContain("| 8 | No secrets in the code. | CHECKED for the patterns the tool knows |");
    expect(d19).toContain("A change to the rules is a new rules version, by a new decision.");
    expect(d19).toContain("Changing the rules without a new rules version and a decision.");
    expect(record("kit/README.md")).toContain("A change to the rules is a new rules version, by a new decision.");

    // Rules 0 as tool 0.1.0 wrote it into the trial's project, and as 0.2.0 writes it.
    const trialAgents = readFileSync(join(TRIAL, "AGENTS.md"), "utf8");
    const block = /<!-- our\.one rules (\S+): begin[\s\S]*?<!-- our\.one rules \1: end -->/.exec(trialAgents);
    expect(block?.[1]).toBe("0");
    expect(tool.RULES_VERSION).toBe("0");
    expect(block?.[0]).toContain("8. **No secrets in the code.** Keys and passwords live in the environment, never in a file the repository tracks.");
    expect(tool.RULES_BLOCK).toContain("8. **No secrets or data in the repository.** Keys and passwords live in the environment, and people's data in the store, never in a file the repository tracks.");
    expect(tool.RULES_BLOCK).toContain("Ask the person for anything only they know, and never invent it.");

    // The trial's project, whose block nobody changed, is told it was changed.
    expect(check(project({ ...good(), "AGENTS.md": trialAgents }), "agents").summary).toBe("The rules block in AGENTS.md was changed.");

    // The defect: one version, two texts, and no decision names another version.
    const decisions = readdirSync(join(ROOT, "decisions"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(join(ROOT, "decisions", f), "utf8"))
      .join("\n");
    const sameText = flat(block?.[0] ?? "") === flat(tool.RULES_BLOCK);
    const newVersionDecided = tool.RULES_VERSION !== block?.[1] && new RegExp(`rules version ${tool.RULES_VERSION}\\b`).test(decisions);
    expect(sameText || newVersionDecided).toBe(true);
  });

  // C2
  it("fixed (MEDIUM): the new comment stripper reads page text as JavaScript, so ordinary words hide what follows them: in JSX text a URL's '//' blanks the rest of its line and 'image/*' blanks everything up to the next '*/', in a .tsx page as in a Vue template, and so does a regular expression holding '/*' after return; claims, a Google tag, a store import and a query written after them all pass — a regression, since 0.1.0 (the trial's copy) read page text as it is and fails each", () => {
    const cases: { id: string; what: string; files: Record<string, string>; trigger: string; plain: string }[] = [
      {
        id: "claims",
        what: "a URL in JSX text, then a claim on the same line",
        files: { "src/app/page.tsx": "export default function Page() {\n  return <p>Read https://example.test/terms first. This app is member-owned.</p>;\n}\n" },
        trigger: "https://example.test/terms",
        plain: "the terms",
      },
      {
        id: "tracking",
        what: "'image/*' in JSX text, then a Google tag",
        files: {
          "src/app/page.tsx": 'import Script from "next/script";\nexport default function Page() {\n  return (\n    <main>\n      <p>Upload a photo (image/*).</p>\n      <Script src="https://www.googletagmanager.com/gtag/js?id=G-FICTION01" />\n    </main>\n  );\n}\n',
        },
        trigger: "image/*",
        plain: "an image",
      },
      {
        id: "boundary",
        what: "'image/*' in a Vue template, above the script that imports pg",
        files: { "src/components/Upload.vue": '<template>\n  <p>Upload a photo (image/*).</p>\n</template>\n<script setup lang="ts">\nimport pg from "pg";\nconst pool = new pg.Pool();\n</script>\n' },
        trigger: "image/*",
        plain: "an image",
      },
      {
        id: "boundary",
        what: "'image/*' in JSX text, then a query in the same file",
        files: {
          "src/app/upload.tsx": 'export default function Upload() {\n  return <p>Upload a photo (image/*).</p>;\n}\nexport async function people(db: { select: () => { from: (t: string) => unknown } }) {\n  return db.select().from("people");\n}\n',
        },
        trigger: "image/*",
        plain: "an image",
      },
      {
        id: "boundary",
        what: "a regular expression holding '/*' after return, then a query",
        files: { "src/app/paths.ts": 'export function isRoot(p: string) {\n  return /^\\/*$/.test(p);\n}\nexport async function people(db: { select: () => { from: (t: string) => unknown } }) {\n  return db.select().from("people");\n}\n' },
        trigger: "/^\\/*$/",
        plain: "/^\\/+$/",
      },
    ];
    for (const c of cases) {
      // Without the words that open the "comment", 0.2.0 sees it.
      const plain = Object.fromEntries(Object.entries(c.files).map(([f, t]) => [f, t.replace(c.trigger, c.plain)]));
      expect([c.what, check(project({ ...good(), ...plain }), c.id).outcome]).toEqual([c.what, "fail"]);
    }
    // 0.1.0 read the page as it is, and caught the first three.
    for (const c of cases.slice(0, 3)) expect([c.what, check(project({ ...good(), ...c.files }), c.id, TOOL_0_1_0).outcome]).toEqual([c.what, "fail"]);

    // The defect: with them, 0.2.0 passes each.
    const outcomes = cases.map((c) => [c.what, check(project({ ...good(), ...c.files }), c.id).outcome]);
    expect(outcomes).toEqual(cases.map((c) => [c.what, "fail"]));
  });

  // C3
  it("fixed (MEDIUM): T5's fix doesn't hold in a real project: a data.boundary of \"src\" that holds all of the app's code fails only while every code file is inside it, so the config file every Next.js project keeps at its root (next.config.ts, or eslint.config.mjs) makes it pass, and rule 1 again says nothing", () => {
    expect(flat(read("SPEC.md"))).toContain("a boundary that holds all the code fails;");
    const files = {
      ...good(),
      "our.one.json": manifest({}, { boundary: ["src"] }),
      "src/app/api/people/route.ts": 'import { Pool } from "pg";\nexport async function GET() { return Response.json((await new Pool().query("select email from people")).rows); }\n',
    };
    // T5's own case, every code file in src, fails.
    expect(check(project(files), "boundary").outcome).toBe("fail");

    // The defect: one config file outside src, and it passes.
    for (const config of ["next.config.ts", "eslint.config.mjs"]) {
      const c = check(project({ ...files, [config]: "export default {};\n" }), "boundary");
      expect([config, c.outcome]).toEqual([config, "fail"]);
    }
  });

  // C4
  it("fixed (MEDIUM): T6's fix knows a handed-out client only by the names prisma, db.select/insert/update/delete/execute/transaction/query, pool.query, supabase and sql``, so the commonest shapes still pass: a Prisma client handed out as db (create-t3-app's `db.post.findMany()`), Kysely's `db.selectFrom()`, and the MongoDB driver's `db.collection()` — routes anywhere query people's data while the boundary check passes", () => {
    const route = (q: string) => `import { db } from "@/data/db";\nexport async function GET() {\n  return Response.json(await ${q});\n}\n`;
    // T6's own case, the client named prisma, fails.
    const prisma = {
      ...good(),
      "package.json": pkg({ "@prisma/client": "6.0.0" }),
      "src/data/db.ts": 'import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();\n',
      "src/app/api/people/route.ts": 'import { prisma } from "@/data/db";\nexport async function GET() {\n  return Response.json(await prisma.user.findMany({ select: { email: true } }));\n}\n',
    };
    expect(check(project(prisma), "boundary").outcome).toBe("fail");

    const cases: [string, Record<string, string>][] = [
      [
        "Prisma handed out as db",
        {
          "package.json": pkg({ "@prisma/client": "6.0.0" }),
          "src/data/db.ts": 'import { PrismaClient } from "@prisma/client";\nexport const db = new PrismaClient();\n',
          "src/app/api/people/route.ts": route("db.user.findMany({ select: { email: true } })"),
        },
      ],
      [
        "Kysely",
        {
          "package.json": pkg({ kysely: "0.27.0" }),
          "src/data/db.ts": 'import { Kysely, PostgresDialect } from "kysely";\nimport pg from "pg";\nexport const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool() }) });\n',
          "src/app/api/people/route.ts": route('db.selectFrom("people").select("email").execute()'),
        },
      ],
      [
        "MongoDB",
        {
          "package.json": pkg({ mongodb: "6.0.0" }),
          "src/data/db.ts": 'import { MongoClient } from "mongodb";\nexport const db = new MongoClient("mongodb://localhost").db("app");\n',
          "src/app/api/people/route.ts": route('db.collection("people").find().toArray()'),
        },
      ],
    ];
    const outcomes = cases.map(([what, files]) => [what, check(project({ ...good(), ...files }), "boundary").outcome]);
    expect(outcomes).toEqual(cases.map(([what]) => [what, "fail"]));
  });

  // C5
  it("fixed (MEDIUM): our.one's own copy of the check — the run D-0019 §D and build.md say counts — fails any project that carries another version of the tool, on that copy's own code: its fs writes fail 'boundary' and its rules text fails 'claims'; the trial's project, as committed with 0.1.0, fails exactly so under 0.2.0, and a project that passes with this tool fails under a copy one comment newer", () => {
    expect(record("decisions/D-0019.md")).toContain("Runs its own copy of the check on the commit named");
    expect(flat(readFileSync(join(KIT_DIR, "build.md"), "utf8"))).toContain("our.one runs its own copy of the check on the commit you name.");

    // The trial's project, under the tool /build now offers: every boundary and claims finding is in its copy of the tool.
    const trial = report(trialProject());
    for (const id of ["boundary", "claims"]) {
      const c = trial.checks.find((x) => x.id === id)!;
      expect([id, c.outcome, [...new Set(c.findings.map((f) => f.file))]]).toEqual([id, "fail", ["scripts/our-one.mjs"]]);
    }

    // A FICTIONAL project that passes with its own copy of this tool, where build.md puts it.
    const dir = project(good());
    mkdirSync(join(dir, "scripts"));
    copyFileSync(TOOL, join(dir, "scripts/our-one.mjs"));
    expect(spawnSync(process.execPath, [join(dir, "scripts/our-one.mjs"), "check"], { encoding: "utf8" }).status).toBe(0);

    // The defect: our.one's copy, one comment newer, fails it.
    const later = join(project({}, { git: false }), "our-one.mjs");
    writeFileSync(later, `${readFileSync(TOOL, "utf8")}// FICTIONAL: a later version of the tool.\n`);
    expect(report(dir, later).result).toBe("ready");
  });

  // C6
  it("fixed (MEDIUM): the claims scan, now over all code and message files, is quadratic on ordinary input: it rebuilds the whole file's line table for every string of a JSON file, and builds its text with += while reading the last character at each space, so V8 flattens the string each time — measured: a messages/en.json of 5,000 strings (228 KB) took 5.4 s, 10,000 strings 24 s, 20,000 strings more than 60 s; one ordinary 400 KB .tsx file 1.6 s, 800 KB 6.2 s, 990 KB 9.1 s; Next.js's own dist (8,005 files) 107 s, 69 s of it in normaliseText's space(); a project with nothing of the kind 0.15 s", () => {
    const timed = (files: Record<string, string>) => run(project({ ...good(), ...files }), ["check", "--json"], undefined, 8_000);
    const control = timed({});
    expect([control.signal, control.status]).toEqual([null, 0]);

    const messages = JSON.stringify(Object.fromEntries(Array.from({ length: 10_000 }, (_, i) => [`key${i}`, `FICTIONAL message number ${i}`])), null, 2);
    const i18n = timed({ "messages/en.json": messages });
    const big = timed({ "src/app/rows.tsx": ordinaryTsx(990_000) });
    expect({ messages: i18n.signal === null && i18n.ms < 5_000, bigFile: big.signal === null && big.ms < 5_000 }).toEqual({ messages: true, bigFile: true });
  }, 60_000);

  // C7
  it("fixed (LOW): the new scanner and parser that SPEC §18.18 calls linear are quadratic on crafted code: the stripper rescans to the end of the line from every '/' after '(' when a '[' never closes ('(/[' repeated: 60 KB took 2.3 s, 120 KB 9.2 s), and importsOf searches back to the file's start for 'import' or 'export' from every from\"…\" (40,000 lines of from\"a\", 320 KB, took 12.9 s) — T2's class, one small file stalling the check and the stop hook", () => {
    expect(flat(read("SPEC.md"))).toContain("with a linear parser for imports");
    const a = run(project({ ...good(), "src/app/gen.ts": rep("(/[", 40_000) }), ["check", "--json"], undefined, 5_000);
    const b = run(project({ ...good(), "src/app/gen.ts": rep('from"a"\n', 40_000) }), ["check", "--json"], undefined, 5_000);
    expect([a.signal, b.signal]).toEqual([null, null]);
  }, 30_000);

  // C8
  it("fixed (LOW): T24's fix redacts a secret only when it is whole, and quoted() cuts a manifest value to 57 characters first: a database address pasted into data.boundary, with a longer user name, is printed with 24 of its password's 27 characters in every output mode (text, --json, --hook), while the secrets check reports finding it — D-0019 prohibits a tool that 'prints a secret it finds'", () => {
    const password = "Fict1onalPassw0rdLongEnough";
    const address = ["postgres://application_user_name:", password, "@db.prod.example.net:5432/app"].join("");
    const dir = project({ ...good(), "our.one.json": manifest({}, { boundary: ["src/data", address] }) });
    expect(check(dir, "secrets").findings.map((f) => f.message)).toEqual(["our.one.json holds what looks like a database address with a password."]);
    // T24's own case, a short address, is redacted whole.
    const short = project({ ...good(), "our.one.json": manifest({}, { boundary: ["src/data", ["postgres://app:", password, "@db.prod.example.net/app"].join("")] }) });
    expect(piecesIn(everyOutput(short), password)).toEqual([]);

    // The defect: cut before it is redacted.
    expect(piecesIn(everyOutput(dir), password)).toEqual([]);
  });

  // C9
  it("fixed (LOW): on its own errors --hook exits 2, which blocks the stop, and does so again when stop_hook_active is true, so the agent is sent back with '… isn't a folder.' at every stop (Claude Code 2.1.185 only stops it at its block cap); init's note for a folder inside a larger repository suggests a relative --project for the root's settings, which resolves against the hook's working folder, and Claude Code runs a hook in the session's current folder (its log says it falls back to the original one only when that is gone)", () => {
    const repo = project({ "package.json": "{}", "apps/x/package.json": JSON.stringify({ name: "fictional", license: "MIT" }) });
    const sub = join(repo, "apps/x");
    mkdirSync(join(sub, "scripts"));
    copyFileSync(TOOL, join(sub, "scripts/our-one.mjs"));
    const init = spawnSync(process.execPath, [join(sub, "scripts/our-one.mjs"), "init", "--project", sub], { encoding: "utf8" });
    expect(flat(init.stdout)).toContain("or add the stop hook to the root's settings with --project apps/x.");

    // The hook as that note writes it, run from inside apps/x.
    const hook = (active: boolean) =>
      spawnSync(process.execPath, [join(sub, "scripts/our-one.mjs"), "check", "--hook", "--project", "apps/x"], {
        cwd: sub,
        encoding: "utf8",
        input: `${JSON.stringify({ hook_event_name: "Stop", stop_hook_active: active })}\n`,
      });
    expect([hook(false).status, hook(false).stderr]).toEqual([2, `${join(sub, "apps/x")} isn't a folder.\n`]);

    // The defect: it never lets the agent stop.
    expect(hook(true).status).toBe(0);
  });

  // C10
  it("fixed (LOW): init changes AGENTS.md outside the rules block: it collapses every run of blank lines in the file (a PEP 8 sample in a code fence loses its two blank lines) and says 'Updated: AGENTS.md (the rules block)' though the block was intact; and when the block has lost its end marker, init adds a second block, the check says to run init, and the second init deletes the person's own section between the stray marker and the new block — build.md says init 'overwrites nothing, except the rules block'", () => {
    expect(flat(readFileSync(join(KIT_DIR, "build.md"), "utf8"))).toContain("`init` creates what is missing and overwrites nothing, except the rules block in `AGENTS.md`");
    const sample = "```python\nimport os\n\n\ndef main():\n    pass\n```";
    const before = `# AGENTS.md\n\nOur FICTIONAL notes.\n\n${sample}\n\n${tool.RULES_BLOCK}\n`;
    const one = project({ "package.json": "{}", "AGENTS.md": before });
    const said = run(one, ["init"]).stdout;

    const lines = tool.RULES_BLOCK.split("\n");
    const broken = `# AGENTS.md\n\n${lines.slice(0, -1).join("\n")}\n\n## Our own section\n\nFICTIONAL: deploy only on Fridays.\n`;
    const two = project({ "package.json": "{}", "AGENTS.md": broken });
    run(two, ["init"]);
    const agents = check(two, "agents");
    expect(agents.findings.map((f) => f.fix)).toEqual(["run node scripts/our-one.mjs init. It puts the block back word for word."]);
    run(two, ["init"]);

    expect({
      sampleKept: readFileSync(join(one, "AGENTS.md"), "utf8").includes(sample),
      saidUpdated: /Updated:\s+AGENTS\.md/.test(said),
      sectionKept: readFileSync(join(two, "AGENTS.md"), "utf8").includes("FICTIONAL: deploy only on Fridays."),
    }).toEqual({ sampleKept: true, saidUpdated: false, sectionKept: true });
  });

  // C11
  it("fixed (LOW): the licence signatures put single spaces where the official texts wrap, so a full licence text wrapped another way fails as 'a line naming it isn't enough' — the trial's own MIT LICENSE rewrapped at 60 columns fails, as do 89 of the 1,106 MIT licence files (Babel's: 'obtaining / a copy') and yaml's ISC in this repository's node_modules, npm's own ISC text ('this / software', in the npm on this machine) and BSD-3-Clause texts that wrap 'are / met:' (libvpx's, in Homebrew) — while the two header lines of Apache-2.0 alone pass as its full text (T32's case, one line longer)", () => {
    const trialLicence = readFileSync(join(TRIAL, "LICENSE"), "utf8");
    expect(check(project({ ...good(), LICENSE: trialLicence }), "licence").outcome).toBe("pass");
    const rewrap = (text: string, width: number) =>
      text
        .split(/\n\s*\n/)
        .map((para) => {
          const out: string[] = [];
          let line = "";
          for (const word of para.split(/\s+/).filter(Boolean)) {
            if (line && line.length + word.length + 1 > width) {
              out.push(line);
              line = word;
            } else line = line ? `${line} ${word}` : word;
          }
          return [...out, line].join("\n");
        })
        .join("\n\n");
    const isc = [
      "ISC License",
      "",
      "Copyright FICTIONAL Maintainer",
      "",
      "Permission to use, copy, modify, and/or distribute this",
      "software for any purpose with or without fee is hereby",
      "granted, provided that the above copyright notice and this",
      "permission notice appear in all copies.",
      "",
    ].join("\n");
    const outcomes = {
      mitRewrapped: check(project({ ...good(), LICENSE: rewrap(trialLicence, 60) }), "licence").outcome,
      iscAsNpmWrapsIt: check(project({ ...good(), "our.one.json": manifest({ license: "ISC" }), "package.json": pkg({}, { license: "ISC" }), LICENSE: isc }), "licence").outcome,
      apacheHeaderOnly: check(
        project({ ...good(), "our.one.json": manifest({ license: "Apache-2.0" }), "package.json": pkg({}, { license: "Apache-2.0" }), LICENSE: "Apache License\nVersion 2.0, January 2004\n" }),
        "licence",
      ).outcome,
    };
    expect(outcomes).toEqual({ mitRewrapped: "pass", iscAsNpmWrapsIt: "pass", apacheHeaderOnly: "fail" });
  });

  // C12
  it("fixed (LOW): T23's fix doesn't hold for the commonest test defaults: a tracked .env.test with a local DATABASE_URL (which the database-address rule itself lets through), NEXTAUTH_URL or AUTH_TRUST_HOST fails rule 8 by name — SECRET_NAME matches DATABASE_URL and any name holding AUTH — with a fix to remove the file and replace the secret", () => {
    const local = ["postgresql://postgres:", "postgres", "@localhost:5432/app_test"].join("");
    // The same address in code passes; T23's own case passes.
    expect(check(project({ ...good(), "src/data/url.ts": `export const url = "${local}";\n` }), "secrets").outcome).toBe("pass");
    expect(check(project({ ...good(), ".env.test": "NEXT_PUBLIC_SITE_URL=http://localhost:3000\n" }), "secrets").outcome).toBe("pass");

    const cases = [`DATABASE_URL=${local}\n`, "NEXTAUTH_URL=http://localhost:3000\n", "AUTH_TRUST_HOST=true\n"];
    const outcomes = cases.map((env) => [env.split("=")[0], check(project({ ...good(), ".env.test": env }), "secrets").outcome]);
    expect(outcomes).toEqual(cases.map((env) => [env.split("=")[0], "pass"]));
  });

  // C13
  it("fixed (LOW): the new costs rules fail honest costs files: a table with a Total row whose empty cells are the usual markdown ('A row of the table in COSTS.md is empty.'), and any to-do app's, since the placeholder test is case-insensitive and 'Todo' reads as TODO ('COSTS.md still says TODO')", () => {
    const total = "# Costs\n\n| What | Provider | A month | Paid by |\n|---|---|---|---|\n| Hosting | FICTIONAL host | $5 | the maintainer |\n| Database | FICTIONAL database | $0 | the maintainer |\n| **Total** | | $5 | |\n\nThe maintainer's pay: none.\n";
    const todo = "# Costs of the FICTIONAL Todo app\n\nHosting: $5 a month, paid by the maintainer. The maintainer's pay: none.\n";
    const outcomes = { total: check(project({ ...good(), "COSTS.md": total }), "costs").outcome, todo: check(project({ ...good(), "COSTS.md": todo }), "costs").outcome };
    expect(outcomes).toEqual({ total: "pass", todo: "pass" });
  });

  // C14
  it("fixed (LOW): the denial rule lets a phrase through only right after the negation, so honest denials still fail rule 9 — 'not approved or listed by our.one', 'Not affiliated with or endorsed by our.one', 'It will not be listed on our.one' — the class the agent trial reported ('Honest denials fail')", () => {
    // The denial the fix let through passes.
    expect(check(project({ ...good(), "README.md": "# FICTIONAL tool\n\nThis project is not approved by our.one.\n" }), "claims").outcome).toBe("pass");
    const denials = ["This project is not approved or listed by our.one.", "Not affiliated with or endorsed by our.one.", "It will not be listed on our.one until people choose it."];
    const outcomes = denials.map((d) => [d, check(project({ ...good(), "README.md": `# FICTIONAL tool\n\n${d}\n` }), "claims").outcome]);
    expect(outcomes).toEqual(denials.map((d) => [d, "pass"]));
  });

  // C15
  it("fixed (LOW): the leave check counts any address of a service's domain written in code as a call that sends it data, so ordinary links fail rule 3 — a forum link to community.auth0.com, a docs link to docs.pinecone.io in an article, a link to pusher.com — each reported as 'It calls …, which sends data to …'", () => {
    const pages: [string, string][] = [
      ["community.auth0.com", 'export const Footer = () => <a href="https://community.auth0.com/t/fictional">Why we left Auth0</a>;\n'],
      ["docs.pinecone.io", 'export const Article = () => <p>Read <a href="https://docs.pinecone.io/guides/indexes">how vector indexes work</a>.</p>;\n'],
      ["pusher.com", 'export const Post = () => <p>A history of <a href="https://pusher.com/websockets">websockets</a>.</p>;\n'],
    ];
    const outcomes = pages.map(([host, code]) => [host, check(project({ ...good(), "src/app/links.tsx": code }), "leave").outcome]);
    expect(outcomes).toEqual(pages.map(([host]) => [host, "pass"]));
  });

  // C16
  it("fixed (LOW): honest code fails rule 1: imports and re-exports that bring only types, written with inline type modifiers (`import { type Pool } from \"pg\"`, `export { type InferSelectModel } from \"drizzle-orm\"`, the form typescript-eslint's consistent-type-imports writes) while `import type` passes; a string that shows an import as text; and a static site's build script that writes its sitemap (failing data too). The re-export and the sitemap are new in 0.2.0; the other two were in 0.1.0 as well", () => {
    expect(check(project({ ...good(), "src/app/types.ts": 'import type { Pool } from "pg";\nexport type P = Pool;\n' }), "boundary").outcome).toBe("pass");
    const site = {
      ...good(),
      "package.json": JSON.stringify({ name: "fictional-site", license: "MIT" }),
      "our.one.json": manifest({}, { collects: [], sharedWith: [], boundary: [] }),
      "src/data/db.ts": "export const pages = ['/', '/about'];\n",
      "src/mail.ts": "export const none = true;\n",
      "scripts/sitemap.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync("public/sitemap.xml", "<urlset></urlset>");\n',
    };
    const siteReport = report(project(site));
    const outcomes = {
      inlineTypeImport: check(project({ ...good(), "src/app/types.ts": 'import { type Pool } from "pg";\nexport type P = Pool;\n' }), "boundary").outcome,
      inlineTypeReexport: check(project({ ...good(), "src/data/types.ts": 'export { type InferSelectModel } from "drizzle-orm";\n' }), "boundary").outcome,
      importAsText: check(project({ ...good(), "src/app/snippet.ts": "export const sample = \"import pg from 'pg'\";\n" }), "boundary").outcome,
      sitemapBoundary: siteReport.checks.find((c) => c.id === "boundary")!.outcome,
      sitemapData: siteReport.checks.find((c) => c.id === "data")!.outcome,
    };
    expect(outcomes).toEqual({ inlineTypeImport: "pass", inlineTypeReexport: "pass", importAsText: "pass", sitemapBoundary: "pass", sitemapData: "pass" });
  });

  // C17
  it("fixed (LOW): T35's and T16's fixes match only exact non-answers, so close variants pass and the summary says the project has 'export and deletion': data.export 'Not yet implemented.', data.delete 'Planned for a later version.', and data.noPersonalData 'N/A' beside a database", () => {
    expect(check(project({ ...good(), "our.one.json": manifest({}, { export: "Not built yet." }) }), "data").outcome).toBe("fail");
    const variants: [string, Record<string, unknown>][] = [
      ["export: Not yet implemented.", { export: "Not yet implemented." }],
      ["delete: Planned for a later version.", { delete: "Planned for a later version." }],
      ["noPersonalData: N/A", { collects: [], noPersonalData: "N/A" }],
    ];
    const outcomes = variants.map(([what, data]) => [what, check(project({ ...good(), "our.one.json": manifest({}, data) }), "data").outcome]);
    expect(outcomes).toEqual(variants.map(([what]) => [what, "fail"]));
  });

  // C18
  it("fixed (LOW): two secrets of kinds the tool recognises still pass rule 8: a Redis address with a password and no user name (redis://:password@host, the form Redis documents), and a Gemini key written in the same file as a Firebase web config (the exemption for Firebase's public key covers any Google key within 400 characters of 'authDomain')", () => {
    const gemini = ["AI", "za", "Sy", rep("F", 33)].join("");
    expect(check(project({ ...good(), "src/data/ai.ts": `export const ai = new GoogleGenerativeAI("${gemini}");\n` }), "secrets").outcome).toBe("fail");
    const cases: [string, string][] = [
      ["redis without a user name", `export const url = "${["redis://:", "Fict1onalPassw0rd", "@redis.prod.example.net:6379"].join("")}";\n`],
      ["a Gemini key beside a Firebase config", `export const firebaseConfig = { apiKey: "public", authDomain: "fictional.firebaseapp.com" };\nexport const ai = new GoogleGenerativeAI("${gemini}");\n`],
    ];
    const outcomes = cases.map(([what, code]) => [what, check(project({ ...good(), "src/data/config.ts": code }), "secrets").outcome]);
    expect(outcomes).toEqual(cases.map(([what]) => [what, "fail"]));
  });

  // C19
  it("fixed (LOW): the new import parser takes the nearest 'import' or 'export' before a from\"…\" as the statement's start, so a name holding either word drops the whole import, and a store client outside the boundary passes: `import importDb from \"better-sqlite3\"`, `import { Pool as exportPool } from \"pg\"`", () => {
    expect(check(project({ ...good(), "src/app/csv.ts": 'import Database from "better-sqlite3";\nexport const db = new Database("people.db");\n' }), "boundary").outcome).toBe("fail");
    const cases = ['import importDb from "better-sqlite3";\nexport const db = new importDb("people.db");\n', 'import { Pool as exportPool } from "pg";\nexport const pool = new exportPool();\n'];
    const outcomes = cases.map((code) => [code.split("\n")[0], check(project({ ...good(), "src/app/csv.ts": code }), "boundary").outcome]);
    expect(outcomes).toEqual(cases.map((code) => [code.split("\n")[0], "fail"]));
  });

  // C20
  it("fixed (LOW): any folder named tests, fixtures, spec or e2e is taken for tests at any depth, so a product's own pages there are never read for rules 1, 4 and 9: a football club's src/app/fixtures/page.tsx (or a school's src/app/tests/) can import pg, load Google's tag and say 'member-owned' and pass (0.1.0 did the same; round one didn't report it)", () => {
    const page = 'import Script from "next/script";\nimport { Pool } from "pg";\nexport default async function Page() {\n  const r = await new Pool().query("select * from matches");\n  return <main><p>A member-owned football club. {r.rowCount}</p><Script src="https://www.googletagmanager.com/gtag/js?id=G-FICTION01" /></main>;\n}\n';
    // The same page anywhere else fails all three.
    const elsewhere = report(project({ ...good(), "src/app/matches/page.tsx": page }));
    expect(["boundary", "tracking", "claims"].map((id) => elsewhere.checks.find((c) => c.id === id)!.outcome)).toEqual(["fail", "fail", "fail"]);
    const there = report(project({ ...good(), "src/app/fixtures/page.tsx": page }));
    expect(["boundary", "tracking", "claims"].map((id) => [id, there.checks.find((c) => c.id === id)!.outcome])).toEqual([
      ["boundary", "fail"],
      ["tracking", "fail"],
      ["claims", "fail"],
    ]);
  });

  // C21
  it("fixed (LOW): T34's fix refuses the home folder and the filesystem's root only, so check run on any folder that holds the home folder (its parent, /Users or /home) reads every file under it, ~/.ssh included: with HOME pointed at a FICTIONAL folder, it reported the key in home/.ssh", () => {
    const outer = project({}, { git: false });
    const home = join(outer, "home");
    mkdirSync(join(home, ".ssh"), { recursive: true });
    writeFileSync(join(home, ".ssh/id_fictional"), [["-----BEGIN OPENSSH", "PRIVATE KEY-----"].join(" "), "FICTIONAL", ["-----END OPENSSH", "PRIVATE KEY-----"].join(" "), ""].join("\n"));
    const env = { ...process.env, HOME: home };
    expect(spawnSync(process.execPath, [TOOL, "check", "--project", home], { encoding: "utf8", env }).status).toBe(2);
    const r = spawnSync(process.execPath, [TOOL, "check", "--json", "--project", outer], { encoding: "utf8", env });
    expect(r.status).toBe(2);
  });

  // C22
  it("DEFECT (LOW): /build says the one trial 'built a small fictional app and passed the check', beside 'Version 0.2.0' and its SHA-256; the trial passed 0.1.0 (ab12bc2e…, its REPORT says), and 0.2.0 fails the trial's project as committed on agents, boundary and claims", () => {
    const text = textOf(renderToStaticMarkup(createElement(BuildPage)));
    expect(text).toContain("So far it has been tried once: an agent in Claude Code, given this line and a person's answers, built a small fictional app and passed the check.");
    expect(text).toContain(`Version ${KIT_TOOL.version}`);
    expect(record("receipts/conformance/2026-10-02-M-0016-agent-trial/REPORT.md")).toContain("ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7");
    expect(KIT_TOOL.sha256).not.toBe("ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7");
    const r = report(trialProject());
    expect(r.checks.filter((c) => c.outcome === "fail").map((c) => c.id)).toEqual(["agents", "boundary", "claims"]);

    expect(/passed the check/.test(text) && !/0\.1\.0/.test(text)).toBe(false);
  });

  // C23
  it("DEFECT (LOW): the feed's our.one.json names Vercel and Neon in sentences that turn false on M-0012's deploy ('our.one isn't deployed there yet', 'No database is set up there yet'), and M-0012 has no step that updates them, though the adapted tests say the words are 'true before the deploy and after it'; it cites D-0013 for an EU region D-0013 doesn't set (only the draft M-0012 does); and SPEC §18.18 item 2 still gives Resend as the feed's one outside service", () => {
    type Shared = { who: string; why: string };
    const m = JSON.parse(read("our.one.json")) as { data: { sharedWith: Shared[] } };
    const vercel = m.data.sharedWith.find((s) => s.who === "Vercel")!;
    const neon = m.data.sharedWith.find((s) => s.who === "Neon")!;
    expect(vercel.why).toContain("our.one isn't deployed there yet.");
    expect(neon.why).toContain("in an EU region, as D-0013 and M-0012 set. No database is set up there yet.");
    const m12 = record("mandates/M-0012.md");
    expect(m12).toContain("Status: DRAFT");
    expect(m12).toContain("Neon: a database in an EU region.");
    const d13 = record("decisions/D-0013.md");
    expect(d13).toContain("Database: Neon.");
    expect(read("tests/kit.test.ts")).toContain("in words true before the deploy and after it");

    expect({
      staysTrueAfterDeploy: ![vercel.why, neon.why].some((w) => /\byet\b/.test(w)) || /our\.one\.json/.test(m12),
      regionSourced: !/as D-0013 and M-0012 set/.test(neon.why) || /\bregion\b/i.test(d13),
      specCurrent: !flat(read("SPEC.md")).includes("Resend as its one outside service"),
    }).toEqual({ staysTrueAfterDeploy: true, regionSourced: true, specCurrent: true });
  });
});

/* -------------------------------------------------------------- closed */

describe("closed (each passes on 25ce8f0)", () => {
  it("closed: the feed passes, run as apps/web/AGENTS.md says — `node kit/our-one.mjs check --project apps/web` from the repository's root: READY TO PROPOSE, exit 0, no check failing or skipped, in under a second on this machine; and this file, which the feed's check reads for secrets, keeps it passing", () => {
    expect(flat(read("AGENTS.md"))).toContain("node kit/our-one.mjs check --project apps/web");
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("RESULT: READY TO PROPOSE.");
    expect(r.stdout).not.toContain("[ FAIL ]");
    expect(r.stdout).not.toContain("[ n/a  ]");
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("closed: round one's 57 defects are now 57 'fixed' tests (17 and 40), none left as DEFECT; their assertions are the ones committed as written (a013ebd, 93928ac), titles aside, and the one closed test adapted (the feed's sharedWith) still pins Resend as the one service the code reaches; each passes in this suite", () => {
    const honesty = read("tests/verify-m0016-honesty.test.ts");
    const tool_ = read("tests/verify-m0016-tool.test.ts");
    expect((honesty.match(/\bit\("fixed \((?:HIGH|MEDIUM|LOW)\)/g) ?? []).length).toBe(17);
    expect((tool_.match(/\bit(?:\.skipIf\(isRoot\))?\("fixed \((?:HIGH|MEDIUM|LOW)\)/g) ?? []).length).toBe(40);
    expect(`${honesty}${tool_}`).not.toMatch(/\bit(?:\.skipIf\(isRoot\))?\("DEFECT/);
    expect(honesty).toContain('expect(known).toEqual(["resend"]);');
  });

  it("closed: the stop hook as Claude Code 2.1.185 feeds it (the binary writes the input and a newline, then ends stdin, and ignores an EPIPE after that): exit 2 with what fails on stderr the first time; exit 0 with one systemMessage while stop_hook_active is true; silent exit 0 when the project is ready, without reading its input; and T25's case holds (stdin closed 1.5 s after writing)", async () => {
    const asClaudeCode = (dir: string, input: object, closeAfterMs = 0): Promise<{ code: number | null; stdout: string; stderr: string }> =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [TOOL, "check", "--hook", "--project", dir], { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
        child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
        child.stdin.on("error", () => undefined);
        child.stdin.write(`${JSON.stringify(input)}\n`, "utf8");
        const closer = setTimeout(() => child.stdin.end(), closeAfterMs);
        const killer = setTimeout(() => child.kill(), 15_000);
        child.on("close", (code) => {
          clearTimeout(closer);
          clearTimeout(killer);
          resolve({ code, stdout, stderr });
        });
      });
    const files = good();
    files.LICENSE = "FICTIONAL: not a licence.\n";
    const failing = project(files);
    const first = await asClaudeCode(failing, { hook_event_name: "Stop", stop_hook_active: false });
    expect([first.code, first.stdout]).toEqual([2, ""]);
    expect(first.stderr).toContain("- licence: LICENSE: No licence file holds the full text of MIT.");
    const again = await asClaudeCode(failing, { hook_event_name: "Stop", stop_hook_active: true }, 1_500);
    expect([again.code, Object.keys(JSON.parse(again.stdout) as object)]).toEqual([0, ["systemMessage"]]);
    const ready = await asClaudeCode(project(good()), { hook_event_name: "Stop", stop_hook_active: false });
    expect(ready).toEqual({ code: 0, stdout: "", stderr: "" });
  }, 30_000);

  it("closed: T1 holds for every way to reach the file — a symbolic link to its folder, a hard link to the file, and a relative path from another folder all run the check (exit 1 and a report on a project with no licence)", () => {
    const files = good();
    delete files.LICENSE;
    const dir = project(files);
    mkdirSync(join(dir, "scripts"));
    copyFileSync(TOOL, join(dir, "scripts/our-one.mjs"));
    const links = project({}, { git: false });
    const viaHardLink = join(links, "our-one.mjs");
    linkSync(join(dir, "scripts/our-one.mjs"), viaHardLink);
    for (const [how, argv, cwd] of [
      ["a hard link", [viaHardLink, "check", "--project", dir], links],
      ["a relative path", ["scripts/our-one.mjs", "check"], dir],
    ] as const) {
      const r = spawnSync(process.execPath, [...argv], { cwd, encoding: "utf8" });
      expect([how, r.status, r.stdout.includes("RESULT: NOT READY")]).toEqual([how, 1, true]);
    }
  });

  it("closed: redaction holds for a whole secret quoted from the manifest — a live Stripe key, a GitHub token and a Slack token put in data.boundary, each short enough not to be cut, appear in no output mode, not even eight characters of one (so C8 is the cut alone)", () => {
    const secrets = [["sk", "live", "FICT10NAL0000000000000000"].join("_"), ["gh", "p_", rep("F", 18), rep("7", 18)].join(""), ["xo", "xb-", "1234567890-", rep("F", 24)].join("")];
    for (const secret of secrets) {
      const dir = project({ ...good(), "our.one.json": manifest({}, { boundary: ["src/data", secret] }) });
      const body = secret.slice(4);
      expect(piecesIn(everyOutput(dir), body)).toEqual([]);
    }
  });

  it("closed: what build.md and the report ask a proposal to say is what D-0017 §G asks — the need, what people would change, the price, the scope and the budget with the maintainer's pay, what it asks for now, and what has to happen first; and the tool, under Node v18.20.8 (npx -y node@18), ran check, init and --hook as under Node 25 (measured; not repeatable here without the network)", () => {
    const g = record("decisions/D-0017.md");
    for (const part of [
      "the need, and the experience it offers;",
      "what users would have to change or move;",
      "the price, the scope and the operating budget, including the maintainer's pay;",
      "what it asks for now;",
      "what has to happen before work starts, and what happens if it doesn't.",
    ]) {
      expect(g).toContain(part);
    }
    expect(flat(readFileSync(join(KIT_DIR, "build.md"), "utf8"))).toContain(
      "It asks what the common agreement asks of every proposal: the need, what people would have to change, the price, the scope and the budget with the maintainer's pay, what it asks for now, and what has to happen first.",
    );
  });
});
