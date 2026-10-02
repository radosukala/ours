/**
 * The build kit (M-0016; D-0019 §B to §G; SPEC §18.18): the tool in
 * kit/our-one.mjs, run as a builder's agent runs it, on FICTIONAL projects
 * made in a temporary folder for each test; the feed's own manifest; the
 * routes that serve the kit; /build; and the claims scan over the kit's
 * text.
 *
 * The denial paths come first: every check fails on a project that breaks
 * its rule, says how to fix it, and passes on one that keeps it. Then what
 * the tool must never do: reach the network, write a file init doesn't
 * name, or print a secret it finds.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import BuildPage, { metadata as buildMeta } from "@/app/(public)/build/page";
import { GET as getBuildMd } from "@/app/build.md/route";
import { GET as getKitFile, generateStaticParams } from "@/app/kit/[file]/route";
import MaintainersPage from "@/app/(public)/maintainers/page";
import ProjectsPage from "@/app/(public)/projects/page";
import { SiteFooter } from "@/components/RightColumn";
import { ALLOWLIST, formatHit, scanKitText, scanManifestText } from "@/core/claims";
import { KIT_DIR, KIT_FILES, kitToolFromFile } from "@/core/kit";
import { AGENT_LINE, KIT_TOOL } from "@/core/kit-info";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TOOL = join(KIT_DIR, "our-one.mjs");

type Finding = { message: string; file?: string; line?: number; fix?: string };
type Check = { id: string; title: string; class: string; outcome: "pass" | "fail" | "not-checked"; summary: string; findings: Finding[] };
type Report = {
  tool: string;
  version: string;
  rules: string;
  sha256: string;
  project: string;
  result: "ready" | "not-ready";
  checks: Check[];
  forAPerson: string[];
  notBuilt: string[];
};
type Tool = {
  RULES_BLOCK: string;
  RULES_VERSION: string;
  VERSION: string;
  TOP_KEYS: string[];
  DATA_KEYS: string[];
  importsOf: (text: string) => { spec: string; line: number }[];
  packageOf: (spec: string) => string | null;
};

let tool: Tool;
beforeAll(async () => {
  tool = (await import(pathToFileURL(TOOL).href)) as Tool;
});

const made: string[] = [];
afterEach(() => {
  while (made.length > 0) rmSync(made.pop()!, { recursive: true, force: true });
});

/** A FICTIONAL project in a temporary folder: these files, and a git repository unless `git` is false. */
function project(files: Record<string, string>, { git = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-kit-"));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

function run(dir: string, args: string[], input?: string) {
  const r = spawnSync(process.execPath, [TOOL, ...args, "--project", dir], { encoding: "utf8", input });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function report(dir: string): Report {
  const r = run(dir, ["check", "--json"]);
  return JSON.parse(r.stdout) as Report;
}

function check(dir: string, id: string): Check {
  const c = report(dir).checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
}

const MIT = "FICTIONAL licence text for tests.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n";

function manifest(over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
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
        sharedWith: [{ who: "Resend", what: "Your email address.", why: "To send sign-in links.", packages: ["resend"] }],
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

/** A project that keeps every rule. Each test breaks one thing. */
function good(): Record<string, string> {
  return {
    "package.json": JSON.stringify({ name: "fictional-tool", license: "MIT", dependencies: { pg: "8.0.0", resend: "6.0.0" } }),
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

/* ============================================================ the whole run */

describe("a project that keeps every rule", () => {
  it("passes every check, prints READY TO PROPOSE, and exits 0", () => {
    const dir = project(good());
    const r = report(dir);
    expect(r.checks.map((c) => [c.id, c.outcome])).toEqual(
      ["manifest", "licence", "agents", "data", "boundary", "leave", "tracking", "secrets", "costs", "claims"].map((id) => [id, "pass"]),
    );
    expect(r.result).toBe("ready");
    const text = run(dir, ["check"]);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("RESULT: READY TO PROPOSE.");
    expect(text.stdout).toContain("That's all passing means. It isn't listed, approved or");
  });

  it("names each check's class, lists what a person reads and what isn't built, and gives no score", () => {
    const r = report(project(good()));
    expect(Object.fromEntries(r.checks.map((c) => [c.id, c.class]))).toEqual({
      manifest: "STRUCTURAL",
      licence: "CHECKED",
      agents: "CHECKED",
      data: "STRUCTURAL",
      boundary: "CHECKED",
      leave: "CHECKED",
      tracking: "CHECKED",
      secrets: "CHECKED",
      costs: "CHECKED",
      claims: "CHECKED",
    });
    expect(r.forAPerson).toHaveLength(4);
    expect(r.notBuilt.map((s) => s.split(":")[0])).toEqual(["No keys", "Reach", "Leave", "The record", "Custody"]);
    const text = run(project(good()), ["check"]).stdout;
    expect(text).toContain("There is no score on purpose.");
    expect(text).not.toMatch(/\d+\s*\/\s*\d+|\d+%/);
  });

  it("a failing project prints NOT READY with the failing checks, and exits 1", () => {
    const files = good();
    delete files.LICENSE;
    const r = run(project(files), ["check"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("RESULT: NOT READY. 1 check fails:");
    expect(r.stdout).toContain("licence. Fix it and run the check again.");
  });

  it("the JSON names the tool, its version, rules and SHA-256, and the folder only by its name", () => {
    const dir = project(good());
    const r = report(dir);
    const sha = createHash("sha256").update(readFileSync(TOOL)).digest("hex");
    expect([r.tool, r.version, r.rules, r.sha256]).toEqual(["our-one", tool.VERSION, tool.RULES_VERSION, sha]);
    expect(r.project).toBe(dir.split(/[\\/]/).pop());
    expect(JSON.stringify(r)).not.toContain(dir);
  });
});

/* ============================================================ each check */

describe("manifest", () => {
  it("fails without our.one.json, on JSON that doesn't parse, on an unknown field, on TODO and on another rules version", () => {
    const none = good();
    delete none["our.one.json"];
    expect(check(project(none), "manifest").findings[0]!.message).toBe("This project has no our.one.json.");

    expect(check(project({ ...good(), "our.one.json": "{ nope" }), "manifest").summary).toBe("our.one.json isn't valid JSON.");

    const spelled = check(project({ ...good(), "our.one.json": manifest({ licence: "MIT" }) }), "manifest");
    expect(spelled.outcome).toBe("fail");
    expect(spelled.findings.map((f) => f.message)).toContain('Unknown field "licence". It is spelled "license", as in package.json.');

    const todo = check(project({ ...good(), "our.one.json": manifest({ name: "TODO: the project's name" }) }), "manifest");
    expect(todo.findings.map((f) => f.message)).toEqual(["name still says TODO."]);

    const rules = check(project({ ...good(), "our.one.json": manifest({ rules: "1" }) }), "manifest");
    expect(rules.findings.map((f) => f.message)).toEqual(['"rules" must be "0", the rules version this tool checks.']);
  });

  it("fails on a maintainer without a reachable contact, a source that isn't https, and an incomplete data entry", () => {
    const bad = manifest(
      { maintainers: [{ name: "FICTIONAL", contact: "not reachable" }], source: "http://example.test/x" },
      { collects: [{ what: "Your email address.", why: "", kept: "Forever." }] },
    );
    const messages = check(project({ ...good(), "our.one.json": bad }), "manifest").findings.map((f) => f.message);
    expect(messages).toEqual([
      "maintainers[0].contact must be an email address or an https:// link.",
      '"source" must be the https:// address of the project\'s public repository.',
      "data.collects[0].why is missing, or longer than 600 characters.",
    ]);
  });
});

describe("licence", () => {
  it("fails with no licence file, a licence that isn't open source, a file that holds another licence, or a different package.json", () => {
    const none = good();
    delete none.LICENSE;
    // Changed after the verification of M-0016 (T31): the repository's root is looked at too.
    expect(check(project(none), "licence").findings[0]!.message).toBe(
      "There is no licence file (LICENSE, LICENCE or COPYING) at the project's root, or at the repository's.",
    );
    const closed = check(project({ ...good(), "our.one.json": manifest({ license: "LicenseRef-Proprietary" }) }), "licence");
    expect(closed.findings[0]!.message).toBe('"LicenseRef-Proprietary" isn\'t on the tool\'s list of open-source licences.');
    const other = check(project({ ...good(), "our.one.json": manifest({ license: "Apache-2.0" }), "package.json": JSON.stringify({ license: "Apache-2.0" }) }), "licence");
    // Changed after the verification of M-0016 (T32): the full text, not a line naming it.
    expect(other.findings.map((f) => f.message)).toEqual(["No licence file holds the full text of Apache-2.0."]);
    const pkg = check(project({ ...good(), "package.json": JSON.stringify({ license: "ISC" }) }), "licence");
    expect(pkg.findings.map((f) => f.message)).toEqual(['package.json says "ISC", our.one.json says "MIT".']);
  });

  it("passes a choice of two open licences when the files hold both", () => {
    const files = {
      ...good(),
      "our.one.json": manifest({ license: "MIT OR Apache-2.0" }),
      "package.json": JSON.stringify({ license: "MIT OR Apache-2.0", dependencies: { pg: "1", resend: "1" } }),
      // The header a full Apache-2.0 text starts with (T32 asks for more than the name).
      // Changed after the re-check (C11): the header alone passed as the full text; the check now also asks for the terms' heading and the first grant, which every full text carries.
      "LICENSE-APACHE": "Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\nTERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n\n2. Grant of Copyright License.\nFICTIONAL test copy.\n",
    };
    expect(check(project(files), "licence").outcome).toBe("pass");
  });
});

describe("agents", () => {
  it("fails with no AGENTS.md, with no block, with a block changed by one word, and with another rules version", () => {
    const none = good();
    delete none["AGENTS.md"];
    expect(check(project(none), "agents").summary).toBe("There is no AGENTS.md.");
    expect(check(project({ ...good(), "AGENTS.md": "# AGENTS.md\n\nOur own rules.\n" }), "agents").summary).toBe("AGENTS.md has no rules block.");
    const changed = tool.RULES_BLOCK.replace("No ads and no tracking.", "Few ads and no tracking.");
    expect(check(project({ ...good(), "AGENTS.md": changed }), "agents").summary).toBe("The rules block in AGENTS.md was changed.");
    const other = tool.RULES_BLOCK.replace(/our\.one rules 0: begin/, "our.one rules 1: begin");
    expect(check(project({ ...good(), "AGENTS.md": other }), "agents").summary).toBe("AGENTS.md carries rules 1.");
  });

  it("passes the block with text around it, and with Windows line endings", () => {
    const around = `# AGENTS.md\n\nOur own notes.\n\n${tool.RULES_BLOCK.replace(/\n/g, "\r\n")}\r\n\nMore notes.\n`;
    expect(check(project({ ...good(), "AGENTS.md": around }), "agents").outcome).toBe("pass");
  });
});

describe("data", () => {
  it("fails when export or deletion isn't described", () => {
    const c = check(project({ ...good(), "our.one.json": manifest({}, { export: "", delete: "TODO: how" }) }), "data");
    expect(c.findings.map((f) => f.message)).toEqual([
      "data.export doesn't say how a person downloads their data.",
      "data.delete doesn't say how a person deletes their data.",
    ]);
  });

  // Changed after the verification of M-0016 (T16): good() uses a database and Resend, so an
  // empty data.collects now fails there unless data.noPersonalData says why.
  it("passes a project that keeps nothing about anyone, and fails an empty data.collects beside a database or a service", () => {
    const keepsNothing = {
      "package.json": JSON.stringify({ name: "fictional-tool", license: "MIT" }),
      "our.one.json": manifest({}, { collects: [], sharedWith: [], boundary: [] }),
      "src/app/page.tsx": "export default function Page() { return <p>FICTIONAL tool</p>; }\n",
    };
    const c = check(project(keepsNothing), "data");
    expect([c.outcome, c.summary]).toEqual(["pass", "It declares that it keeps nothing about anyone."]);
    const empty = check(project({ ...good(), "our.one.json": manifest({}, { collects: [] }) }), "data");
    expect(empty.findings.map((f) => f.message)).toEqual([
      "data.collects is empty, but the code uses a database or a file store, and data.sharedWith names services that receive something.",
    ]);
    const said = check(project({ ...good(), "our.one.json": manifest({}, { collects: [], noPersonalData: "It keeps only FICTIONAL recipes, about no one." }) }), "data");
    expect(said.outcome).toBe("pass");
  });
});

describe("boundary (rule 1)", () => {
  it("fails a store's client imported outside the boundary, by import, export, dynamic import or require", () => {
    for (const [file, code] of [
      ["src/app/a.ts", 'import { Pool } from "pg";'],
      ["src/app/b.ts", 'export { Pool } from "pg";'],
      ["src/app/c.ts", 'const pg = await import("pg");'],
      ["src/app/d.js", 'const mongoose = require("mongoose");'],
      ["src/app/e.ts", 'import { getFirestore } from "firebase/firestore";'],
      ["src/app/f.tsx", 'import { createClient } from "@supabase/supabase-js";'],
      ["src/app/g.ts", "const prisma = new PrismaClient();"],
    ] as [string, string][]) {
      const c = check(project({ ...good(), [file]: `${code}\n` }), "boundary");
      expect([file, c.outcome], code).toEqual([file, "fail"]);
      expect(c.findings[0]!.file).toBe(file);
      expect(c.findings[0]!.line).toBe(1);
      expect(c.findings[0]!.fix).toContain("Move this into src/data");
    }
  });

  it("fails when the code uses a store and no boundary is named, or the boundary is the whole project or missing", () => {
    expect(check(project({ ...good(), "our.one.json": manifest({}, { boundary: [] }) }), "boundary").summary).toBe(
      "The code uses a database or a file store, and no boundary is declared.",
    );
    const whole = check(project({ ...good(), "our.one.json": manifest({}, { boundary: ["."] }) }), "boundary");
    expect(whole.findings.map((f) => f.message)).toContain('"." isn\'t a folder inside the project.');
    const missing = check(project({ ...good(), "our.one.json": manifest({}, { boundary: ["src/data", "src/nowhere"] }) }), "boundary");
    expect(missing.findings.map((f) => f.message)).toEqual(['data.boundary names "src/nowhere", which doesn\'t exist.']);
  });

  it("ignores tests, type-only imports and a store's name in prose; passes code with no store at all", () => {
    const files = {
      ...good(),
      "tests/db.test.ts": 'import pg from "pg";\n',
      "src/app/types.ts": 'import type { Pool } from "pg";\n',
      "src/app/about.tsx": "export const t = 'We use pg and mongoose.';\n",
    };
    expect(check(project(files), "boundary").outcome).toBe("pass");
    const plain = { ...good(), "src/data/db.ts": "export const rows: string[] = [];\n" };
    expect(check(project(plain), "boundary").summary).toBe("No database or file-store client found in the code.");
  });

  it("is not checked, and says so, when there is no JavaScript or TypeScript", () => {
    const files = good();
    for (const f of Object.keys(files)) if (/\.(tsx?|js)$/.test(f)) delete files[f];
    const c = check(project({ ...files, "app.py": "import psycopg\n" }), "boundary");
    // Changed after the verification of M-0016 (T17): the summary names the code it didn't read.
    expect([c.outcome, c.summary]).toEqual([
      "not-checked",
      "No JavaScript or TypeScript found. In rules 0 the tool reads only those, so a person checks this. The tool doesn't read Python (app.py), so a person checks that code.",
    ]);
    expect(report(project({ ...files, "app.py": "import psycopg\n" })).result).toBe("ready");
  });
});

describe("leave (rule 3)", () => {
  it("fails an outside service the manifest doesn't name, by dependency or by import, and passes once it is named", () => {
    const dep = check(project({ ...good(), "package.json": JSON.stringify({ license: "MIT", dependencies: { pg: "1", resend: "1", stripe: "1" } }) }), "leave");
    // Changed after the verification of M-0016: the finding says how the service was found.
    expect(dep.findings.map((f) => [f.file, f.message])).toEqual([["package.json", "It depends on stripe, which sends data to Stripe, and data.sharedWith doesn't name it."]]);
    const imported = check(project({ ...good(), "src/ai.ts": 'import Anthropic from "@anthropic-ai/sdk";\n' }), "leave");
    expect(imported.findings.map((f) => [f.file, f.line, f.message])).toEqual([["src/ai.ts", 1, "It imports @anthropic-ai/sdk, which sends data to Anthropic, and data.sharedWith doesn't name it."]]);
    const named = manifest({}, {
      sharedWith: [
        { who: "Resend", what: "Your email address.", why: "To send sign-in links.", packages: ["resend"] },
        { who: "Anthropic", what: "What you ask.", why: "To answer it.", packages: ["@anthropic-ai/sdk"] },
      ],
    });
    expect(check(project({ ...good(), "our.one.json": named, "src/ai.ts": 'import Anthropic from "@anthropic-ai/sdk";\n' }), "leave").outcome).toBe("pass");
  });

  it("lets a whole scope be named at once", () => {
    const named = manifest({}, {
      sharedWith: [
        { who: "Resend", what: "Your email address.", why: "To send sign-in links.", packages: ["resend"] },
        { who: "Sentry", what: "Error reports.", why: "To fix errors.", packages: ["@sentry/"] },
      ],
    });
    const files = { ...good(), "our.one.json": named, "package.json": JSON.stringify({ license: "MIT", dependencies: { pg: "1", resend: "1", "@sentry/nextjs": "1" } }) };
    expect(check(project(files), "leave").outcome).toBe("pass");
  });
});

describe("tracking (rule 4)", () => {
  it("fails ads, Google Analytics and Tag Manager, session recording and data hubs, by package, import, script address or call", () => {
    const cases: [string, Record<string, string>][] = [
      ["a GA package", { "package.json": JSON.stringify({ license: "MIT", dependencies: { pg: "1", resend: "1", "react-ga4": "1" } }) }],
      ["firebase analytics", { "src/app/an.ts": 'import { getAnalytics } from "firebase/analytics";\n' }],
      ["a gtag script", { "public/index.html": '<script async src="https://www.googletagmanager.com/gtag/js?id=G-FICTIONAL"></script>\n' }],
      ["the Meta Pixel", { "src/app/px.tsx": 'const s = "https://connect.facebook.net/en_US/fbevents.js";\n' }],
      ["next third-parties", { "src/app/layout.tsx": 'import { GoogleAnalytics } from "@next/third-parties/google";\n' }],
      ["Sentry replay", { "src/app/sentry.ts": "Sentry.init({ integrations: [Sentry.replayIntegration()] });\n" }],
      ["Hotjar", { "src/app/hj.ts": 'import Hotjar from "@hotjar/browser";\n' }],
      ["Segment", { "package.json": JSON.stringify({ license: "MIT", dependencies: { pg: "1", resend: "1", "@segment/analytics-next": "1" } }) }],
    ];
    for (const [name, extra] of cases) {
      const c = check(project({ ...good(), ...extra }), "tracking");
      expect([name, c.outcome]).toEqual([name, "fail"]);
      expect(c.findings[0]!.fix).toContain("Rule 4 allows no ads and no tracking");
    }
  });

  it("doesn't count a tracker's name in prose, a test, or an address written without //", () => {
    const files = {
      ...good(),
      "README.md": "# FICTIONAL\n\nWe don't use google-analytics.com or Hotjar.\n",
      "tests/x.test.ts": 'const u = "https://connect.facebook.net/x.js";\n',
    };
    expect(check(project(files), "tracking").outcome).toBe("pass");
  });
});

describe("secrets (rule 8)", () => {
  /** Built at run time, so no secret-shaped string sits in this file. */
  const fakeStripe = ["sk", "live", "FICTIONAL0000000000000000"].join("_");
  const fakeAws = ["AKIA", "QQQQQQQQQQQQQQQQ"].join("");
  const fakeDb = ["postgres://fictional:", "s3cretFICTIONAL", "@db.example.com:5432/app"].join("");

  it("fails on a key the tool recognises, and prints where and what kind, never the key", () => {
    for (const [secret, kind] of [
      [fakeStripe, "a live Stripe key"],
      [fakeAws, "an AWS access key"],
      [fakeDb, "a database address with a password"],
    ] as const) {
      const dir = project({ ...good(), "src/config.ts": `export const k = "${secret}";\n` });
      const c = check(dir, "secrets");
      expect(c.findings.map((f) => [f.file, f.line, f.message])).toEqual([["src/config.ts", 1, `src/config.ts holds what looks like ${kind}.`]]);
      const text = run(dir, ["check"]);
      const json = run(dir, ["check", "--json"]);
      const hook = run(dir, ["check", "--hook"], '{"stop_hook_active":false}');
      for (const out of [text.stdout, text.stderr, json.stdout, hook.stderr, hook.stdout]) expect(out).not.toContain(secret);
      expect(text.stdout).not.toContain(secret.slice(4, 16));
    }
  });

  // Changed after the verification of M-0016 (T21, T23): an environment file git doesn't ignore
  // is read for secrets (a tracked .env.test of test defaults passes), and never printed.
  it("fails on an environment file git doesn't ignore when it holds a secret, and never prints it", () => {
    const dir = project({ ...good(), ".env": `STRIPE=${fakeStripe}\nSESSION_SECRET=FICTIONAL0123456789abcdef\n` });
    const c = check(dir, "secrets");
    expect(c.findings.map((f) => f.message)).toEqual([".env holds what looks like a live Stripe key.", ".env sets SESSION_SECRET, and git doesn't ignore the file."]);
    for (const out of [run(dir, ["check"]).stdout, run(dir, ["check", "--json"]).stdout]) {
      expect(out).not.toContain(fakeStripe);
      expect(out).not.toContain("FICTIONAL0123456789abcdef");
    }
  });

  it("passes .env.example, an ignored .env, AWS's documented example key, a local database and a placeholder password", () => {
    const files = {
      ...good(),
      ".env.example": "STRIPE=\nDATABASE_URL=\n",
      ".gitignore": ".env\n",
      ".env": `STRIPE=${fakeStripe}\n`,
      "docs/aws.md": "Example: AKIAIOSFODNN7EXAMPLE\n",
      "docker-compose.yml": "url: postgres://app:app-pass@db:5432/app\n",
      "src/env.ts": 'const u = "postgres://app:${DB_PASSWORD}@db.example.com/app";\n',
    };
    expect(check(project(files), "secrets").outcome).toBe("pass");
  });
});

describe("costs (rule 7)", () => {
  it("fails a missing file, a file that still says TODO, a file outside the project and a file git ignores", () => {
    const none = good();
    delete none["COSTS.md"];
    expect(check(project(none), "costs").summary).toBe("COSTS.md doesn't exist.");
    expect(check(project({ ...good(), "COSTS.md": "# Costs\n\n| Hosting | TODO |\n" }), "costs").summary).toBe("COSTS.md still says TODO.");
    expect(check(project({ ...good(), "our.one.json": manifest({ costs: "../costs.md" }) }), "costs").summary).toBe("The costs file is outside the project.");
    expect(check(project({ ...good(), ".gitignore": "COSTS.md\n" }), "costs").summary).toBe("git ignores COSTS.md.");
  });
});

describe("claims (rule 9)", () => {
  it("fails a phrase that presents the project as its users' property or as approved by our.one", () => {
    for (const phrase of ["A user-owned app.", "It is owned by its users.", "Its members now own it.", "Approved by our.one.", "An our.one-certified tool."]) {
      const c = check(project({ ...good(), "src/app/page.tsx": `export default function P() { return <p>${phrase}</p>; }\n` }), "claims");
      expect([phrase, c.outcome]).toEqual([phrase, "fail"]);
      expect(c.findings[0]!.file).toBe("src/app/page.tsx");
    }
    expect(check(project({ ...good(), "README.md": "# FICTIONAL\n\nListed by our.one.\n" }), "claims").outcome).toBe("fail");
  });

  it("lets through an exact sentence listed in claims.allowed, and fails a listed sentence that isn't there", () => {
    const sentence = "We call a tool owned by its users only when they decide its rules.";
    const allowed = manifest({ claims: { allowed: [{ file: "src/app/page.tsx", text: sentence, why: "A FICTIONAL definition, for tests." }] } });
    const page = `export default function P() { return <p>{"${sentence}"} None is yet.</p>; }\n`;
    expect(check(project({ ...good(), "our.one.json": allowed, "src/app/page.tsx": page }), "claims").outcome).toBe("pass");
    const stale = check(project({ ...good(), "our.one.json": allowed }), "claims");
    expect(stale.findings.map((f) => f.message)).toEqual(["claims.allowed lists a sentence that isn't in src/app/page.tsx."]);
  });

  // Changed after the verification of M-0016 (the agent trial; T39): code that writes pages
  // in .js or .ts is read too, and so are message files; tests are not.
  it("reads README.md, the code and its message files, not tests; and a file listed in claims.skip, with why, is left to a person", () => {
    expect(check(project({ ...good(), "tests/p.test.tsx": "<p>A user-owned app.</p>\n" }), "claims").outcome).toBe("pass");
    expect(check(project({ ...good(), "src/copy.ts": 'export const c = "A user-owned app.";\n' }), "claims").outcome).toBe("fail");
    const skipped = manifest({ claims: { skip: [{ file: "src/copy.ts", why: "FICTIONAL: the list of phrases a scanner refuses." }] } });
    const c = check(project({ ...good(), "our.one.json": skipped, "src/copy.ts": 'export const c = "A user-owned app.";\n' }), "claims");
    expect([c.outcome, c.summary]).toEqual(["pass", "No claim, beyond 1 file skipped by claims.skip, for a person to read."]);
  });
});

/* ============================================================ without git */

describe("a folder that isn't a git repository", () => {
  it("is read by walking it, without node_modules or build output, and says the environment files weren't checked", () => {
    // Changed after the verification of M-0016 (T40): the note is given when there is an
    // environment file it couldn't judge, and in the words for a folder git doesn't hold.
    const files = { ...good(), ".env": "SESSION_SECRET=FICTIONAL0123456789abcdef\n", "node_modules/x/index.js": 'import pg from "pg";\n', ".next/server/a.js": 'require("mongoose");\n' };
    const r = report(project(files, { git: false }));
    expect(r.result).toBe("ready");
    expect(r.checks.find((c) => c.id === "secrets")!.summary).toBe(
      "No secret the tool recognises. Not a git repository, so environment files weren't checked.",
    );
  });
});

/* ============================================================ init */

const INIT_FILES = [".claude/settings.json", ".github/workflows/our-one.yml", "AGENTS.md", "CLAUDE.md", "COSTS.md", "PITCH.md", "our.one.json"];

function filesIn(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split("\\").join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

describe("init", () => {
  it("creates exactly the files it names, and the check then fails until every TODO is filled in", () => {
    const dir = project({ "package.json": JSON.stringify({ name: "x", license: "MIT" }) });
    const r = run(dir, ["init"]);
    expect(r.status).toBe(0);
    expect(filesIn(dir)).toEqual([...INIT_FILES, "package.json"].sort());
    const m = JSON.parse(readFileSync(join(dir, "our.one.json"), "utf8")) as { license: string; rules: string };
    expect([m.rules, m.license]).toEqual(["0", "MIT"]);
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain(tool.RULES_BLOCK);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")) as { hooks: { Stop: { hooks: { type: string; command: string }[] }[] } };
    expect(settings.hooks.Stop[0]!.hooks[0]).toEqual({ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/scripts/our-one.mjs" check --hook' });
    expect(readFileSync(join(dir, ".github/workflows/our-one.yml"), "utf8")).toContain("run: node scripts/our-one.mjs check");
    const after = report(dir);
    expect(after.result).toBe("not-ready");
    expect(after.checks.find((c) => c.id === "agents")!.outcome).toBe("pass");
  });

  // Changed after the verification of M-0016 (H9): an existing CLAUDE.md is left as it is, with a
  // note, so that "overwrites nothing except the rules block and the hook" stays true.
  it("keeps every file that exists, puts back a changed rules block word for word, and keeps the rest of AGENTS.md", () => {
    const changed = tool.RULES_BLOCK.replace("No ads and no tracking.", "Some ads.");
    const files = {
      "our.one.json": '{"FICTIONAL": "kept as it is"}\n',
      "COSTS.md": "# FICTIONAL costs, kept\n",
      "PITCH.md": "# FICTIONAL pitch, kept\n",
      "AGENTS.md": `# Our agents\n\nOur own rule.\n\n${changed}\n\nAfter the block.\n`,
      "CLAUDE.md": "# FICTIONAL notes\n",
      ".github/workflows/our-one.yml": "# FICTIONAL workflow, kept\n",
    };
    const dir = project(files);
    const r = run(dir, ["init"]);
    for (const f of ["our.one.json", "COSTS.md", "PITCH.md", ".github/workflows/our-one.yml", "CLAUDE.md"]) expect(readFileSync(join(dir, f), "utf8"), f).toBe(files[f as keyof typeof files]);
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe(`# Our agents\n\nOur own rule.\n\n${tool.RULES_BLOCK}\n\nAfter the block.\n`);
    expect(r.stdout.replace(/\s+/g, " ")).toContain("CLAUDE.md doesn't import AGENTS.md. Add a line @AGENTS.md to it, so Claude Code reads the rules.");
  });

  it("adds its stop hook to an existing .claude/settings.json without removing anything, once", () => {
    const existing = { permissions: { allow: ["Bash(ls)"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo FICTIONAL" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "true" }] }] } };
    const dir = project({ ".claude/settings.json": JSON.stringify(existing) });
    run(dir, ["init"]);
    run(dir, ["init"]);
    const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8")) as typeof existing;
    expect(settings.permissions).toEqual(existing.permissions);
    expect(settings.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(settings.hooks.Stop).toHaveLength(2);
    expect(settings.hooks.Stop[0]).toEqual(existing.hooks.Stop[0]);
    expect(JSON.stringify(settings.hooks.Stop[1])).toContain("our-one.mjs");
  });

  it("leaves a .claude/settings.json it can't read alone, and says what to add", () => {
    const dir = project({ ".claude/settings.json": "{ not json" });
    const r = run(dir, ["init"]);
    expect(readFileSync(join(dir, ".claude/settings.json"), "utf8")).toBe("{ not json");
    expect(r.stdout).toContain(".claude/settings.json isn't valid JSON, so it was left alone.");
  });

  it("refuses to set up the home folder, and writes nothing there", () => {
    const home = project({});
    const r = spawnSync(process.execPath, [TOOL, "init", "--project", home], { encoding: "utf8", env: { ...process.env, HOME: home } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Refusing to set up");
    expect(filesIn(home)).toEqual([]);
  });
});

describe("links: the tool reads and writes only the project's own files", () => {
  it("init writes nothing through a link to a file or a folder outside the project", () => {
    const outside = project({ "victim.txt": "FICTIONAL file outside the project\n", "elsewhere/keep.txt": "kept\n" });
    const dir = project({});
    symlinkSync(join(outside, "victim.txt"), join(dir, "AGENTS.md"));
    symlinkSync(join(outside, "victim.txt"), join(dir, "CLAUDE.md"));
    symlinkSync(join(outside, "elsewhere"), join(dir, ".github"));
    symlinkSync(join(outside, "elsewhere"), join(dir, ".claude"));
    const r = run(dir, ["init"]);
    expect(r.status).toBe(0);
    expect(readFileSync(join(outside, "victim.txt"), "utf8")).toBe("FICTIONAL file outside the project\n");
    expect(filesIn(join(outside, "elsewhere"))).toEqual(["keep.txt"]);
    const said = r.stdout.replace(/\s+/g, " ");
    // Changed after the verification of M-0016 (T27): the note names hard links too.
    expect(said).toContain("AGENTS.md is a link, or a second name for a file elsewhere, so it was left alone.");
    expect(said).toContain("CLAUDE.md is a link, so it was left alone.");
    expect(said).toContain(".github/workflows/our-one.yml would be written outside the project, through a link, so it wasn't created.");
    expect(said).toContain(".claude/settings.json would be written outside the project, through a link, so it wasn't created.");
  });

  it("check doesn't read a manifest, an AGENTS.md or a costs file that is a link", () => {
    const outside = project({ "our.one.json": manifest(), "AGENTS.md": tool.RULES_BLOCK, "COSTS.md": "# Costs\n\nFICTIONAL, kept outside.\n" });
    const files = good();
    delete files["our.one.json"];
    delete files["AGENTS.md"];
    delete files["COSTS.md"];
    const dir = project(files);
    for (const f of ["our.one.json", "AGENTS.md", "COSTS.md"]) symlinkSync(join(outside, f), join(dir, f));
    const r = report(dir);
    // Changed after the verification of M-0016: the message is a sentence of its own.
    expect(r.checks.find((c) => c.id === "manifest")!.findings[0]!.message).toBe(
      "It is a link, and the check reads only the project's own files.",
    );
    expect(r.checks.find((c) => c.id === "agents")!.summary).toBe("There is no AGENTS.md.");
  });
});

/* ============================================================ the stop hook */

describe("check --hook (Claude Code's stop hook)", () => {
  it("stays silent and exits 0 when every check passes", () => {
    const r = run(project(good()), ["check", "--hook"], '{"stop_hook_active":false}');
    expect([r.status, r.stdout, r.stderr]).toEqual([0, "", ""]);
  });

  it("sends the agent back once, with what fails and how to fix it, by exit 2 and stderr", () => {
    const files = good();
    delete files.LICENSE;
    const r = run(project(files), ["check", "--hook"], '{"stop_hook_active":false}');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("our.one check: 1 check fails (rules 0).");
    expect(r.stderr).toContain("- licence: There is no licence file");
    expect(r.stderr).toContain("Don't change the check or the rules block to make it pass.");
  });

  it("then lets it stop, and tells the person what still fails", () => {
    const files = good();
    delete files.LICENSE;
    const r = run(project(files), ["check", "--hook"], '{"stop_hook_active":true}');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ systemMessage: "our.one check still fails: licence. Run: node scripts/our-one.mjs check" });
  });
});

/* ============================================================ the tool itself */

describe("what the tool never does", () => {
  const source = () => readFileSync(TOOL, "utf8");

  it("imports only Node's file, process, hash, path, URL and OS modules: nothing that reaches a network", () => {
    const imported = [...source().matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort();
    expect(imported).toEqual(["node:child_process", "node:crypto", "node:fs", "node:os", "node:path", "node:url"]);
    expect(source()).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(?:http|https|net|tls|dgram|dns)\b|\brequire\s*\(|\bimport\s*\(/);
  });

  it("runs no program but git, and git only to list files and to read the remote's address", () => {
    const calls = [...source().matchAll(/execFileSync\(\s*"([^"]+)",\s*\[([^\]]*)\]/g)].map((m) => `${m[1]} ${m[2]}`);
    // Changed after the verification of M-0016 (T26): git runs with the project's fsmonitor off,
    // and ls-files tags each file as tracked or not (T4).
    expect(calls).toEqual([
      'git "-c", "core.fsmonitor=false", "ls-files", "-z", "-t", "--cached", "--others", "--exclude-standard"',
      'git "-c", "core.fsmonitor=false", "remote", "get-url", "origin"',
    ]);
    const fromChildProcess = /^import \{([^}]*)\} from "node:child_process";$/m.exec(source())![1]!.split(",").map((x) => x.trim());
    expect(fromChildProcess).toEqual(["execFileSync"]);
  });

  it("parses the imports it looks for, and names the package each belongs to", () => {
    const found = tool.importsOf('import a, { b } from "x";\nimport "side";\nexport * from "y/z";\nconst c = require("w");\nconst d = await import("@s/p/q");\nimport type { T } from "t";\n');
    // Changed after the verification of M-0016 (T2, T18): a new parser, which reports in line order.
    expect(found.map((i) => [i.spec, i.line])).toEqual([["x", 1], ["side", 2], ["y/z", 3], ["w", 4], ["@s/p/q", 5]]);
    expect(["pg", "pg/lib", "@s/p/q", "./x", "@/core/db", "node:fs", "#internal", "https://x.test/y"].map(tool.packageOf)).toEqual(["pg", "pg", "@s/p", null, null, null, null, null]);
  });

  it("answers --version with its version, rules and SHA-256, and refuses an unknown command", () => {
    const v = spawnSync(process.execPath, [TOOL, "--version"], { encoding: "utf8" });
    const sha = createHash("sha256").update(readFileSync(TOOL)).digest("hex");
    expect(v.stdout).toBe(`${tool.VERSION} rules ${tool.RULES_VERSION} sha256 ${sha}\n`);
    const bad = spawnSync(process.execPath, [TOOL, "deploy"], { encoding: "utf8" });
    expect(bad.status).toBe(2);
    expect(spawnSync(process.execPath, [TOOL, "rules"], { encoding: "utf8" }).stdout).toBe(`${tool.RULES_BLOCK}\n`);
  });
});

/* ============================================================ the re-check's fixes (0.2.1) */

// Regression tests for the fixes of the re-check of M-0016 (C1 to C21 in
// tests/verify-m0016-recheck.test.ts): what each fix lets through must not
// open its denial path.
describe("after the re-check: what the fixes let through, and what they still fail", () => {
  it("reads code as code: a page's text, a string or a link is no code, but a query after a type's parameters, inside ${}, or beside a type-only name still counts", () => {
    const query = 'export async function people(db: any) {\n  return db.select().from("people");\n}\n';
    for (const [file, code] of [
      ["src/app/a.tsx", `const f: <T>(x: T) => T = (x) => x;\n${query}`],
      ["src/app/b.tsx", `export const id = <T,>(x: T) => x;\n${query}`],
      ["src/app/c.tsx", `export const P = () => <p>Read https://example.test/x first.</p>;\n${query}`],
      ["src/app/d.ts", "export const q = async (db: any) => `${await db.select().from(\"people\")}`;\n"],
      ["src/app/e.ts", 'import { type Pool, Client } from "pg";\nexport const c = new Client();\n'],
      ["src/lib/F.svelte", '<p>Upload a photo (image/*)</p>\n<script>\nimport pg from "pg";\n</script>\n'],
      ["src/app/g.ts", `export const glob = 2 /* an unclosed comment;\n${query}`],
      ["src/app/h.ts", 'import { writeFileSync } from "node:fs";\nexport const save = (id: string, photo: Buffer) => writeFileSync(`public/uploads/${id}.png`, photo);\n'],
    ] as [string, string][]) {
      expect([file, check(project({ ...good(), [file]: code }), "boundary").outcome]).toEqual([file, "fail"]);
    }
    expect(check(project({ ...good(), "src/app/doc.ts": 'export const doc = "Write db.select() in src/data.";\n' }), "boundary").outcome).toBe("pass");
    expect(check(project({ ...good(), "scripts/robots.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync("public/robots.txt", "User-agent: *\\n");\n' }), "boundary").outcome).toBe("pass");
  });

  it("counts a service's address the page loads (a <link>, a script), not a link a person follows", () => {
    const loads = check(project({ ...good(), "src/app/x.tsx": 'export const H = () => <><link rel="preconnect" href="https://api.stripe.com" /><script src="https://js.pusher.com/8.0/pusher.min.js"></script></>;\n' }), "leave");
    expect(loads.findings.map((f) => f.message)).toEqual([
      "It calls api.stripe.com, which sends data to Stripe, and data.sharedWith doesn't name it.",
      "It calls js.pusher.com, which sends data to Pusher, and data.sharedWith doesn't name it.",
    ]);
    const links = { "src/app/a.tsx": 'export const A = () => <a href={"https://pusher.com/docs"}>docs</a>;\n', "src/app/B.vue": '<template>\n  <a href="https://pusher.com/docs">docs</a>\n</template>\n<script setup>\nconst b = 1;\n</script>\n' };
    expect(check(project({ ...good(), ...links }), "leave").outcome).toBe("pass");
  });

  it("claims: the manifest's name is not our.one, and a denial reaches only as far as its own words", () => {
    expect(check(project({ ...good(), "README.md": "# FICTIONAL tool\n\nEvery service it uses is listed in our.one.json.\n" }), "claims").outcome).toBe("pass");
    for (const text of ["Not only approved by our.one, it is loved.", "It isn't a toy: it's approved by our.one.", "It isn't approved by our.one, but it's listed on our.one."]) {
      expect([text, check(project({ ...good(), "README.md": `# FICTIONAL tool\n\n${text}\n` }), "claims").outcome]).toEqual([text, "fail"]);
    }
    expect(check(project({ ...good(), "src/app/x.ts": "// A member-owned app.\nexport const x = 1;\n" }), "claims").outcome).toBe("fail");
  });

  it("a copy of another version of the tool is read for secrets, not as the project's code, and the report names it", () => {
    const key = ["sk", "live", "FICT10NAL0000000000000000"].join("_");
    const copy = readFileSync(TOOL, "utf8").replace(/Version [^,]+, rules 0\./, "Version 0.1.9, rules 0.");
    const dir = project({ ...good(), "scripts/our-one.mjs": `${copy}// ${key}\n` });
    const r = report(dir) as Report & { skipped: { tool: { file: string; version: string; rules: string }[] } };
    expect(r.skipped.tool).toEqual([{ file: "scripts/our-one.mjs", version: "0.1.9", rules: "0" }]);
    expect(r.checks.filter((c) => c.outcome === "fail").map((c) => [c.id, c.findings.map((f) => f.file)])).toEqual([["secrets", ["scripts/our-one.mjs"]]]);
    expect(run(dir, ["check"]).stdout.replace(/\s+/g, " ")).toContain(`Not read as the project's code: scripts/our-one.mjs, a copy of this tool (version 0.1.9, rules 0). This check is version ${tool.VERSION}.`);
  });

  it("init leaves AGENTS.md as it is when a block has lost its end marker, and removes a second block with only the blank lines around it", () => {
    const lines = tool.RULES_BLOCK.split("\n");
    const broken = `# AGENTS.md\n\n${lines.slice(0, -1).join("\n")}\n\nOur notes.\n`;
    const one = project({ "package.json": "{}", "AGENTS.md": broken });
    const said = run(one, ["init"]).stdout.replace(/\s+/g, " ");
    expect(readFileSync(join(one, "AGENTS.md"), "utf8")).toBe(broken);
    expect(said).toContain("AGENTS.md has a rules block that has lost its end marker, so init left the file as it is");
    expect(check(one, "agents").summary).toBe("The rules block in AGENTS.md has lost its end marker.");

    const changed = tool.RULES_BLOCK.replace("No ads and no tracking.", "Some ads.");
    const two = project({ "package.json": "{}", "AGENTS.md": `# AGENTS.md\n\nIntro.\n\n\nTwo blank lines above, kept.\n\n${tool.RULES_BLOCK}\n\n\n${changed}\n\n\nAfter.\n` });
    run(two, ["init"]);
    expect(readFileSync(join(two, "AGENTS.md"), "utf8")).toBe(`# AGENTS.md\n\nIntro.\n\n\nTwo blank lines above, kept.\n\n${tool.RULES_BLOCK}\n\nAfter.\n`);
  });

  it("the stop hook's own errors send the agent back once, then let it stop; and no folder that holds the home folder is set up or checked", () => {
    const outer = project({}, { git: false });
    const home = join(outer, "home");
    mkdirSync(home);
    const env = { ...process.env, HOME: home };
    const hook = (active: boolean) => spawnSync(process.execPath, [TOOL, "check", "--hook", "--project", outer], { encoding: "utf8", env, input: JSON.stringify({ stop_hook_active: active }) });
    const first = hook(false);
    expect([first.status, first.stdout, first.stderr]).toEqual([2, "", `Refusing to check ${outer}: run it inside the project's own folder.\n`]);
    const then = hook(true);
    expect([then.status, (JSON.parse(then.stdout) as { systemMessage: string }).systemMessage]).toEqual([0, `our.one check couldn't run: Refusing to check ${outer}: run it inside the project's own folder.`]);
    expect(spawnSync(process.execPath, [TOOL, "init", "--project", outer], { encoding: "utf8", env }).status).toBe(2);
    expect(filesIn(outer)).toEqual([]);
  });

  it("secrets: local defaults pass, but a remote database's password, a token in an address, a Redis password and any key beside a Firebase config still fail", () => {
    const remote = ["DATABASE_URL=postgres://app:", "Fict1onalPassw0rd", "@db.prod.example.net:5432/app\n"].join("");
    for (const env of [remote, "AUTH_SECRET=FICTIONAL0123456789abcdef\n", "WEBHOOK_TOKEN_URL=https://hooks.example.net/in?token=FICTIONAL0123456789\n", "DB_PASSWORD=123456\n"]) {
      expect([env.split("=")[0], check(project({ ...good(), ".env.test": env }), "secrets").outcome]).toEqual([env.split("=")[0], "fail"]);
    }
    expect(check(project({ ...good(), "src/data/r.ts": `export const u = "${["redis://default:", "Fict1onalPassw0rd", "@redis.prod.example.net:6379"].join("")}";\n` }), "secrets").outcome).toBe("fail");
    const firebaseKey = ["AI", "za", "Sy", "F".repeat(33)].join("");
    expect(check(project({ ...good(), "src/app/fb.ts": `export const firebaseConfig = { apiKey: "${firebaseKey}", authDomain: "fictional.firebaseapp.com" };\n` }), "secrets").outcome).toBe("pass");
  });

  it("costs, data, licence and tests: a total with no amount, a folder of tests outside a tree of pages, and a full text however it is wrapped", () => {
    expect(check(project({ ...good(), "COSTS.md": "# Costs\n\n| What | A month |\n|---|---|\n| Hosting | $5 |\n| **Total** | |\n" }), "costs").outcome).toBe("fail");
    expect(check(project({ ...good(), "our.one.json": manifest({}, { export: "Email the maintainer, who sends it within 30 days." }) }), "data").outcome).toBe("pass");
    expect(check(project({ ...good(), "tests/helpers.ts": 'import pg from "pg";\nexport const reset = () => new pg.Pool().query("truncate people");\n' }), "boundary").outcome).toBe("pass");
    expect(check(project({ ...good(), "src/routes/spec/+page.ts": 'import pg from "pg";\nexport const load = () => new pg.Pool().query("select 1");\n' }), "boundary").outcome).toBe("fail");
    const bsd = [
      "Copyright FICTIONAL Maintainer",
      "",
      "Redistribution and use in source and binary forms, with or without modification,",
      "are permitted provided that the following conditions are met:",
      "* Redistributions of source code must retain the above copyright",
      "  notice, this list of conditions and the following disclaimer.",
      "* Neither the names of the FICTIONAL project nor the names of its contributors may be used.",
      "THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS.",
      "",
    ].join("\n");
    const bsdProject = { ...good(), "our.one.json": manifest({ license: "BSD-3-Clause" }), "package.json": JSON.stringify({ license: "BSD-3-Clause", dependencies: { pg: "1", resend: "1" } }), LICENSE: bsd };
    expect(check(project(bsdProject), "licence").outcome).toBe("pass");
  });
});

/* ============================================================ the feed */

describe("the feed carries the same manifest and passes the same check (D-0019 §F)", () => {
  it("passes every check, none of them skipped", () => {
    const r = report(WEB_ROOT);
    expect(r.checks.filter((c) => c.outcome !== "pass").map((c) => [c.id, c.findings.map(formatFinding)])).toEqual([]);
    expect(r.result).toBe("ready");
  });

  // Changed after the verification of M-0016 (H4): the hosting and the database D-0013 chose are
  // named too, in words true before the deploy and after it.
  it("declares what /privacy says it keeps, word for word; Resend, the one service the code reaches; and the hosting and the database D-0013 chose", async () => {
    const { default: PrivacyPage } = await import("@/app/(public)/privacy/page");
    const page = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const m = JSON.parse(readFileSync(join(WEB_ROOT, "our.one.json"), "utf8")) as {
      data: { collects: { what: string; why: string; kept: string }[]; sharedWith: { who: string; packages: string[] }[] };
    };
    const titles = [...renderToStaticMarkup(createElement(PrivacyPage)).matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((x) => x[1]!.replace(/&#x27;/g, "'"));
    expect(m.data.collects.map((c) => c.what.split(": ")[0])).toEqual([...titles, "Seat requests"]);
    for (const c of m.data.collects.slice(0, titles.length)) {
      expect(page, c.what).toContain(c.what.slice(c.what.indexOf(": ") + 2));
      expect(page, c.why).toContain(c.why);
      expect(page, c.kept).toContain(c.kept);
    }
    expect(page).toContain("If you ask for a seat, we keep your email address to send you the join link.");
    expect(m.data.sharedWith.map((s) => [s.who, s.packages])).toEqual([["Resend", ["resend"]], ["Vercel", undefined], ["Neon", undefined]]);
  });
});

function formatFinding(f: Finding): string {
  return `${f.file ?? ""}${f.line ? `:${f.line}` : ""} ${f.message}`;
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

/* ============================================================ served files */

describe("the routes serve the kit's files, byte for byte (D-0019 §B)", () => {
  it("/build.md is kit/build.md, as Markdown", async () => {
    const res = getBuildMd();
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(join(KIT_DIR, "build.md")))).toBe(true);
  });

  it("/kit/our-one.mjs and /kit/our.one.schema.json are the files, and nothing else under /kit is served", async () => {
    expect(generateStaticParams()).toEqual([{ file: "our-one.mjs" }, { file: "our.one.schema.json" }]);
    for (const name of ["our-one.mjs", "our.one.schema.json"] as const) {
      const res = await getKitFile(new Request(`http://localhost/kit/${name}`), { params: Promise.resolve({ file: name }) });
      expect(res.headers.get("content-type")).toBe(KIT_FILES[name]);
      expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(join(KIT_DIR, name)))).toBe(true);
    }
    for (const name of ["README.md", "LICENSE", "build.md", "../package.json"]) {
      await expect(getKitFile(new Request("http://localhost/kit/x"), { params: Promise.resolve({ file: name }) })).rejects.toThrow();
    }
  });

  it("build.md names the tool's SHA-256, and /build's version and SHA-256 are the tool's", () => {
    const fromFile = kitToolFromFile();
    expect(KIT_TOOL).toEqual(fromFile);
    expect(readFileSync(join(KIT_DIR, "build.md"), "utf8")).toContain(`It must be:\n\n\`\`\`text\n${fromFile.sha256}\n\`\`\``);
    expect(readFileSync(join(KIT_DIR, "build.md"), "utf8")).toContain(`Version ${fromFile.version}, rules ${fromFile.rules},`);
  });

  it("the schema lists the fields the tool accepts and requires the ones it requires", () => {
    const schema = JSON.parse(readFileSync(join(KIT_DIR, "our.one.schema.json"), "utf8")) as {
      required: string[];
      properties: Record<string, unknown> & { data: { required: string[]; properties: Record<string, unknown> }; rules: { const: string } };
    };
    expect(Object.keys(schema.properties)).toEqual(tool.TOP_KEYS);
    expect(Object.keys(schema.properties.data.properties)).toEqual(tool.DATA_KEYS);
    expect(schema.required).toEqual(["rules", "name", "purpose", "maintainers", "source", "license", "costs", "data"]);
    expect(schema.properties.data.required).toEqual(["collects", "sharedWith", "export", "delete"]);
    expect(schema.properties.rules.const).toBe(tool.RULES_VERSION);
  });
});

/* ============================================================ the pages */

describe("/build (SPEC §18.18)", () => {
  const markup = () => renderToStaticMarkup(createElement(BuildPage));

  it("says first that it is being developed and that nothing collective is in force", () => {
    expect(buildMeta.title).toBe("Build on our.one");
    const text = textOf(markup());
    // Changed after D-0020 (M-0017): the page leads with the builders'
    // invitation, under its small capitals; the notice still comes first after it.
    expect(text.startsWith("Build with us Build something people can depend on. Being developed. The tools work today. The common agreement they follow is a draft that nobody has signed yet, and none of its collective rights is in force.")).toBe(true);
  });

  // Changed after D-0020 (M-0017): D-0020 §D retires the "On your own" column;
  // the page states our.one's own deal, with what holds it today under it.
  it("states the deal, what you get and give up, with what holds it today, and nothing absolute about building alone", () => {
    const text = textOf(markup());
    expect(text).toContain("What you get A defined scope, with ordinary product decisions yours.");
    expect(text).toContain("What you give up Selling the service, or the people who use it.");
    expect(text).toContain(
      "Today: none of this is in force yet. Proposals and needs open at launch, our.one takes no money until the holder exists, and the safeguards that keep data out of reach aren't built. The common agreement",
    );
    expect(text).not.toMatch(/On your own|If you stop, it stops/);
  });

  it("gives the one line for a coding agent, pointing at /build.md", () => {
    // Changed after D-0020 (M-0017): the line starts with the idea (D-0020 §D).
    expect(AGENT_LINE).toBe("Read https://our.one/build.md and follow it to help me bring my idea to our.one.");
    expect(markup()).toContain(`<code>${AGENT_LINE}</code>`);
    expect(readFileSync(join(KIT_DIR, "README.md"), "utf8")).toContain(AGENT_LINE);
  });

  it("lists the rules block's ten titles, in its order", () => {
    const fromBlock = [...tool.RULES_BLOCK.matchAll(/^\d+\. \*\*(.+?)\*\*/gm)].map((m) => m[1]!.replace(/:$/, "."));
    const section = markup().slice(markup().indexOf('id="build-rules"'), markup().indexOf('id="build-limits"'));
    const onPage = [...section.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1]!.replace(/&#x27;/g, "'"));
    expect(fromBlock).toHaveLength(10);
    expect(onPage).toEqual(fromBlock);
  });

  it("says passing makes a project ready to propose and nothing more, and that the safeguards aren't built", () => {
    const text = textOf(markup());
    expect(text).toContain("Passing makes a project ready to propose. Nothing more: it isn't listed, approved or protected. The people who would use it decide.");
    expect(text).toContain("aren't built yet. Every report lists them.");
    expect(text).not.toMatch(/\b(?:certified|guarantee|approved by our\.one)\b/i);
  });

  it("links the proposal to /maintainers, the files the site serves, and the tool's version and SHA-256", () => {
    const html = markup();
    for (const href of ['href="/maintainers"', 'href="/build.md"', 'href="/kit/our-one.mjs"', 'href="/kit/our.one.schema.json"']) expect(html).toContain(href);
    expect(textOf(html)).toContain(`Version ${KIT_TOOL.version}, rules ${KIT_TOOL.rules}. One file, with no dependencies and no network access. Its SHA-256: ${KIT_TOOL.sha256}`);
    expect(html).toContain("https://github.com/radosukala/ours/blob/main/apps/web/our.one.json");
    expect(html).toContain("https://github.com/radosukala/ours/tree/main/kit");
  });

  it("the footer's 'Build with us', /maintainers and /projects lead to /build", () => {
    expect(renderToStaticMarkup(createElement(SiteFooter))).toContain('<a href="/build">Build with us</a>');
    expect(renderToStaticMarkup(createElement(MaintainersPage))).toContain('<a href="/build">Build on our.one</a>');
    const projects = renderToStaticMarkup(createElement(ProjectsPage));
    expect(projects).toContain('href="/build"');
    // Changed after the verification of M-0016 (H3, H8): what passing means, and no "every project proposed".
    expect(textOf(projects)).toContain("Checked It passes the check any project proposed to our.one will go through (rules 0). Passing makes a project ready to propose, nothing more. How it's checked");
  });
});

/* ============================================================ the claims scan */

describe("the claims scan reads the kit's text (D-0019 §G)", () => {
  it("finds nothing in the kit, the feed's manifest or its rules block", () => {
    const { files, hits } = scanKitText(WEB_ROOT);
    expect(files).toEqual(["our.one.json", "AGENTS.md", "../../kit/build.md", "../../kit/README.md", "../../kit/our-one.mjs", "../../kit/our.one.schema.json"]);
    expect(hits.map(formatHit)).toEqual([]);
  });

  it("lets the manifest quote only a sentence the allowlist holds for that file, and still reads the rest of it", () => {
    const listed = ALLOWLIST.find((e) => e.file === "src/app/(public)/agreement/page.tsx" && e.sentence.startsWith("We call a service"))!;
    const ok = JSON.stringify({ claims: { allowed: [{ file: listed.file, text: listed.sentence, why: "FICTIONAL" }] } });
    expect(scanManifestText(ok, "our.one.json")).toEqual([]);
    const wrongFile = JSON.stringify({ claims: { allowed: [{ file: "src/app/(public)/projects/page.tsx", text: listed.sentence, why: "FICTIONAL" }] } });
    expect(scanManifestText(wrongFile, "our.one.json").map((h) => h.pattern)).toContain("claims.allowed");
    const elsewhere = JSON.stringify({ purpose: "A user-owned feed.", claims: { allowed: [{ file: listed.file, text: listed.sentence, why: "FICTIONAL" }] } });
    expect(scanManifestText(elsewhere, "our.one.json").map((h) => h.match)).toEqual(["user-owned"]);
  });
});

describe("the kit's files exist where the site reads them", () => {
  it("every served file is in kit/, and nothing else in kit/ is served", () => {
    for (const name of Object.keys(KIT_FILES)) expect(statSync(join(KIT_DIR, name)).isFile(), name).toBe(true);
    expect(readdirSync(KIT_DIR).sort()).toEqual(["LICENSE", "README.md", "build.md", "our-one.mjs", "our.one.schema.json"]);
    expect(existsSync(join(WEB_ROOT, "AGENTS.md"))).toBe(true);
  });
});
