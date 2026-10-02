/**
 * Independent verification of M-0016's tool, kit/our-one.mjs, run
 * adversarially, as a builder's coding agent would run it. Written by an
 * agent that built none of it, against a92bbb5 (the build kit, 6925b1e and
 * 576df0a; the stopping rule in
 * receipts/conformance/2026-10-02-M-0016.verification.md). It changes no
 * product code, no record and no other test.
 *
 * Four areas, as the brief set them: projects that break a rule and still
 * pass; honest projects the tool fails; what it must never do (reach the
 * network, write a file init doesn't name or through a link, read outside
 * the project, print a secret, hang, crash); and the stop hook against
 * Claude Code's documented behaviour, with init and Node 18.
 *
 * - "DEFECT (SEVERITY): …" asserts what should be true. It FAILS on a92bbb5,
 *   and that failure is the evidence. It passes once fixed. The severity
 *   weighs how likely an ordinary coding agent is to produce the case by
 *   accident against how much harm it does. The comment above each gives
 *   its number in the verifier's report (T1 to T40).
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Where a measurement can't be repeated here, it is in the test's title:
 * timings on this machine (Apple silicon, Node v25.3.0), and one run under
 * Node v18.20.8 (npx -y node@18, the only network use besides pnpm install).
 *
 * Every project is FICTIONAL, made in a temporary folder and removed after
 * each test. Every secret-shaped string is assembled at run time from
 * parts, so none sits in this file: the feed's own check reads tests/ for
 * secrets.
 */
import { spawn, spawnSync } from "node:child_process";
import dns from "node:dns";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KIT_DIR } from "@/core/kit";

const TOOL = join(KIT_DIR, "our-one.mjs");

type Finding = { message: string; file?: string; line?: number; fix?: string };
type Check = { id: string; class: string; outcome: "pass" | "fail" | "not-checked"; summary: string; findings: Finding[] };
type Report = { result: "ready" | "not-ready"; project: string; checks: Check[] };
type Tool = {
  RULES_BLOCK: string;
  SECRETS: { kind: string; re: RegExp }[];
  CLAIMS: { re: RegExp }[];
  TRACKING: { name: string; hosts?: string[] }[];
  check: (root: string) => Report;
  init: (root: string) => { created: string[]; updated: string[]; kept: string[]; notes: string[] };
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "verify-m0016-")));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

type Run = { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; ms: number };

function run(dir: string, args: string[], input?: string, timeout = 60_000, env: NodeJS.ProcessEnv = process.env): Run {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [TOOL, ...args, "--project", dir], { encoding: "utf8", input, timeout, env });
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: Date.now() - t0 };
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

/** --hook with stdin written now, and closed later (or never); the exit code and what it printed. */
function runAsync(dir: string, args: string[], input: string, closeAfterMs: number | null, killAfterMs = 15_000): Promise<{ code: number | null; stdout: string; stderr: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [TOOL, ...args, "--project", dir], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
    child.stdin.on("error", () => undefined);
    child.stdin.write(input);
    const closer = closeAfterMs === null ? undefined : setTimeout(() => child.stdin.end(), closeAfterMs);
    const killer = setTimeout(() => child.kill(), killAfterMs);
    child.on("exit", (code) => {
      clearTimeout(killer);
      if (closer) clearTimeout(closer);
      resolve({ code, stdout, stderr, ms: Date.now() - t0 });
    });
  });
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

/** A copy of the tool at scripts/our-one.mjs, where build.md puts it. */
function copyTool(dir: string): string {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  const path = join(dir, "scripts/our-one.mjs");
  writeFileSync(path, readFileSync(TOOL));
  return path;
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

/** A project that keeps every rule (kit.test.ts's, as it is). Each test breaks one thing. */
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

function without(files: Record<string, string>, ...names: string[]): Record<string, string> {
  const out = { ...files };
  for (const n of names) delete out[n];
  return out;
}

const rep = (s: string, n: number) => s.repeat(n);
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

/* ============================================================ defects */

describe("defects (each FAILS on a92bbb5)", () => {
  // T1
  it("fixed (HIGH): run by a path that passes through a symbolic link (on macOS, /tmp and /var are such links; so is any folder a person reaches through one), the tool does nothing and exits 0: check on a failing project prints no report and returns success, init writes nothing, and the stop hook never sends the agent back, because the entry guard compares import.meta.url, which Node resolves through links, with argv[1], which it doesn't", () => {
    const real = project(without(good(), "LICENSE")); // one check fails
    copyTool(real);
    const links = project({}, { git: false });
    symlinkSync(real, join(links, "app"));
    const viaLink = join(links, "app");

    // The control: the same copy, by its real path, reports and fails.
    const direct = spawnSync(process.execPath, [join(real, "scripts/our-one.mjs"), "check"], { encoding: "utf8" });
    expect([direct.status, direct.stdout.includes("RESULT: NOT READY")]).toEqual([1, true]);

    const checked = spawnSync(process.execPath, [join(viaLink, "scripts/our-one.mjs"), "check"], { encoding: "utf8" });
    const hook = spawnSync("sh", ["-c", 'node "${CLAUDE_PROJECT_DIR}/scripts/our-one.mjs" check --hook'], {
      encoding: "utf8",
      input: '{"stop_hook_active":false}',
      env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`, CLAUDE_PROJECT_DIR: viaLink },
    });
    const fresh = project({ "package.json": "{}" });
    copyTool(fresh);
    symlinkSync(fresh, join(links, "fresh"));
    spawnSync(process.execPath, [join(links, "fresh/scripts/our-one.mjs"), "init"], { encoding: "utf8", cwd: fresh });

    expect([checked.status, checked.stdout.includes("RESULT: NOT READY")]).toEqual([1, true]);
    expect(hook.status).toBe(2);
    expect(existsSync(join(fresh, "our.one.json"))).toBe(true);
  });

  // T2
  it("fixed (MEDIUM): two patterns backtrack catastrophically on crafted text, so one small file stalls the check, the stop hook and our.one's own run on a proposed commit: `import` followed by whitespace is cubic in the import pattern (4 KB took 22 s on this machine, 8 KB 178 s, 20 KB didn't finish in 2 minutes), and the OpenAI key pattern is quadratic on repeated `sk-` (600 KB took 114 s)", () => {
    const spaces = project({ ...good(), "src/app/generated.ts": `import${rep(" ", 5000)}x\n` });
    const keys = project({ ...good(), "src/app/generated.ts": `export const s = "${rep("sk-", 150_000)}";\n` });
    const a = run(spaces, ["check", "--json"], undefined, 10_000);
    const b = run(keys, ["check", "--json"], undefined, 10_000);
    expect([a.signal, a.status]).toEqual([null, 0]);
    expect([b.signal, b.status]).toEqual([null, 0]);
  }, 60_000);

  // T3
  it.skipIf(isRoot)("fixed (MEDIUM): one file the user can't read (a key or a database file a container wrote as root) crashes every mode with exit 2 and the absolute path, so there is no report at all, and the stop hook then blocks again even when stop_hook_active is true: it never lets the agent stop, where D-0019 §D and /build say it sends the agent back once", () => {
    const dir = project({ ...good(), "certs/privkey.pem": "FICTIONAL, written by a container\n" });
    const path = join(dir, "certs/privkey.pem");
    chmodSync(path, 0o000);
    try {
      const json = run(dir, ["check", "--json"]);
      const hook = run(dir, ["check", "--hook"], '{"stop_hook_active":true}');
      expect([0, 1]).toContain(json.status);
      expect((JSON.parse(json.stdout) as Report).checks).toHaveLength(10);
      expect(hook.status).toBe(0);
    } finally {
      chmodSync(path, 0o644);
    }
  });

  // T4
  it("fixed (MEDIUM): when git doesn't ignore node_modules (after `git init` and an install, before any .gitignore; build.md says to run git init and never mentions a .gitignore), the check reads the dependencies' files as the project's: it fails on a private-key example in a package's bundled docs and on a store client inside a package, the hook sends the agent to move that 'secret' to an environment variable, and it slows down (one real package, Next.js 16, took 4.5 s and failed on its own docs)", () => {
    const keyExample = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const dir = project({
      ...good(),
      "node_modules/fictional-framework/docs/environment-variables.md": `An example:\n\n${keyExample}\nFICTIONAL\n`,
      "node_modules/fictional-orm/index.js": 'const pg = require("pg");\nmodule.exports = pg;\n',
    });
    const intoDependencies = report(dir)
      .checks.flatMap((c) => c.findings.map((f) => `${c.id}: ${f.file ?? ""} ${f.message}`))
      .filter((f) => f.includes("node_modules/"));
    expect(intoDependencies).toEqual([]);
  });

  // T5
  it("fixed (MEDIUM): a data.boundary that holds all of the project's code (\"src\", or \"src/**\", when everything is in src) passes, so rule 1 says nothing; the tool already refuses \".\" as the whole project, and naming the folder a failing import sits in is the quickest way out of a boundary failure", () => {
    const files = {
      ...good(),
      "src/app/api/people/route.ts": 'import { Pool } from "pg";\nexport async function GET() { return Response.json((await new Pool().query("select email from people")).rows); }\n',
    };
    for (const boundary of [["src"], ["src/**"]]) {
      const c = check(project({ ...files, "our.one.json": manifest({}, { boundary }) }), "boundary");
      expect([boundary, c.outcome]).toEqual([boundary, "fail"]);
    }
  });

  // T6
  it("fixed (MEDIUM): a store client made inside the boundary and handed out, a common way to write it (`export const prisma = new PrismaClient()`, then `prisma.user.findMany()` in every route), or a boundary file that re-exports the client (`export { Pool } from \"pg\"`), lets code anywhere query personal data while the boundary check passes", () => {
    const prisma = {
      ...good(),
      "package.json": pkg({ "@prisma/client": "6.0.0" }),
      "src/data/db.ts": 'import { PrismaClient } from "@prisma/client";\nexport const prisma = new PrismaClient();\n',
      "src/app/api/people/route.ts": 'import { prisma } from "@/data/db";\nexport async function GET() {\n  return Response.json(await prisma.user.findMany({ select: { email: true } }));\n}\n',
    };
    const reexport = {
      ...good(),
      "src/data/index.ts": 'export { Pool } from "pg";\n',
      "src/app/api/people/route.ts": 'import { Pool } from "@/data";\nexport async function GET() { return Response.json((await new Pool().query("select email from people")).rows); }\n',
    };
    expect(check(project(prisma), "boundary").outcome).toBe("fail");
    expect(check(project(reexport), "boundary").outcome).toBe("fail");
  });

  // T7
  it("fixed (MEDIUM): store clients common in small apps aren't on the list, so code anywhere uses them and the boundary check passes: Bun's and Node's built-in SQLite (bun:sqlite, node:sqlite), lowdb, Convex, Firebase's compat Firestore, Pinecone and Appwrite", () => {
    const cases: [string, string][] = [
      ["bun:sqlite", 'import { Database } from "bun:sqlite";\nexport const db = new Database("people.db");\n'],
      ["node:sqlite", 'import { DatabaseSync } from "node:sqlite";\nexport const db = new DatabaseSync("people.db");\n'],
      ["lowdb", 'import { JSONFilePreset } from "lowdb/node";\nexport const db = await JSONFilePreset("people.json", { people: [] });\n'],
      ["convex", 'import { ConvexHttpClient } from "convex/browser";\nexport const db = new ConvexHttpClient("https://fictional.example.test");\n'],
      ["firebase compat", 'import firebase from "firebase/compat/app";\nimport "firebase/compat/firestore";\nexport const db = firebase.firestore();\n'],
      ["pinecone", 'import { Pinecone } from "@pinecone-database/pinecone";\nexport const db = new Pinecone();\n'],
      ["appwrite", 'import { Client, Databases } from "appwrite";\nexport const db = new Databases(new Client());\n'],
    ];
    for (const [what, code] of cases) {
      const c = check(project({ ...good(), "src/app/api/people/route.ts": code }), "boundary");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T8
  it("fixed (MEDIUM): AI providers and gateways send what people type to an outside service without being named, and the leave check passes: the AI SDK with a gateway model id (`ai` alone), @ai-sdk/xai, @ai-sdk/amazon-bedrock, OpenRouter's provider, AWS Bedrock's client and fal.ai", () => {
    const cases: [string, string][] = [
      ["ai (gateway)", 'import { generateText } from "ai";\nexport const answer = (prompt: string) => generateText({ model: "openai/gpt-5", prompt });\n'],
      ["@ai-sdk/xai", 'import { xai } from "@ai-sdk/xai";\nexport const model = xai("grok-4");\n'],
      ["@ai-sdk/amazon-bedrock", 'import { bedrock } from "@ai-sdk/amazon-bedrock";\nexport const model = bedrock("x");\n'],
      ["@openrouter/ai-sdk-provider", 'import { createOpenRouter } from "@openrouter/ai-sdk-provider";\nexport const router = createOpenRouter();\n'],
      ["@aws-sdk/client-bedrock-runtime", 'import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";\nexport const client = new BedrockRuntimeClient();\n'],
      ["@fal-ai/client", 'import { fal } from "@fal-ai/client";\nexport const image = (prompt: string) => fal.subscribe("x", { input: { prompt } });\n'],
    ];
    for (const [what, code] of cases) {
      const c = check(project({ ...good(), "src/data/ai.ts": code }), "leave");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T9
  it("fixed (MEDIUM): a package listed under another service's entry counts as that service named: with only Resend in data.sharedWith, `packages: [\"resend\", \"stripe\", \"openai\"]` passes, and the report says 'Named: Resend, Stripe, OpenAI', which the manifest a person reads doesn't say", () => {
    const m = manifest({}, { sharedWith: [{ ...RESEND, packages: ["resend", "stripe", "openai"] }] });
    const c = check(project({ ...good(), "our.one.json": m, "src/data/pay.ts": 'import Stripe from "stripe";\nimport OpenAI from "openai";\nexport const s = new Stripe(""), o = new OpenAI();\n' }), "leave");
    expect(c.summary).not.toContain("Stripe");
    expect(c.outcome).toBe("fail");
  });

  // T10
  it("fixed (MEDIUM): session recording, which rule 4 forbids by name, passes when it comes from a service the tool lets be named (PostHog's startSessionRecording, Amplitude's session-replay plugin, Datadog RUM's replay, Mixpanel's record_sessions_percent) or from a recorder it doesn't know (rrweb, OpenReplay, Highlight)", () => {
    const named = (who: string, packages: string[]) => manifest({}, { sharedWith: [RESEND, { who, what: "Visits.", why: "To count visits.", packages }] });
    const cases: [string, Record<string, string>][] = [
      ["PostHog", { "package.json": pkg({ "posthog-js": "1" }), "our.one.json": named("PostHog", ["posthog-js"]), "src/app/ph.ts": 'import posthog from "posthog-js";\nposthog.init("phc_FICTIONAL", { api_host: "https://eu.i.posthog.com", session_recording: { maskAllInputs: false } });\nposthog.startSessionRecording();\n' }],
      ["Amplitude", { "package.json": pkg({ "@amplitude/analytics-browser": "1", "@amplitude/plugin-session-replay-browser": "1" }), "our.one.json": named("Amplitude", ["@amplitude/"]), "src/app/amp.ts": 'import * as amplitude from "@amplitude/analytics-browser";\nimport { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";\namplitude.add(sessionReplayPlugin({ sampleRate: 1 }));\n' }],
      ["Datadog", { "package.json": pkg({ "@datadog/browser-rum": "1" }), "our.one.json": named("Datadog", ["@datadog/"]), "src/app/dd.ts": 'import { datadogRum } from "@datadog/browser-rum";\ndatadogRum.init({ applicationId: "x", clientToken: "x", sessionReplaySampleRate: 100 });\ndatadogRum.startSessionReplayRecording();\n' }],
      ["Mixpanel", { "package.json": pkg({ "mixpanel-browser": "1" }), "our.one.json": named("Mixpanel", ["mixpanel-browser"]), "src/app/mp.ts": 'import mixpanel from "mixpanel-browser";\nmixpanel.init("FICTIONAL", { record_sessions_percent: 100 });\n' }],
      ["rrweb", { "package.json": pkg({ rrweb: "2" }), "src/app/rec.ts": 'import { record } from "rrweb";\nrecord({ emit(event) { navigator.sendBeacon("/api/recordings", JSON.stringify(event)); } });\n' }],
      ["OpenReplay", { "package.json": pkg({ "@openreplay/tracker": "1" }), "src/app/or.ts": 'import Tracker from "@openreplay/tracker";\nnew Tracker({ projectKey: "FICTIONAL" }).start();\n' }],
      ["Highlight", { "package.json": pkg({ "highlight.run": "1" }), "src/app/hl.ts": 'import { H } from "highlight.run";\nH.init("FICTIONAL");\n' }],
    ];
    for (const [what, extra] of cases) {
      const c = check(project({ ...good(), ...extra }), "tracking");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T11
  it("fixed (MEDIUM): Google Analytics and Tag Manager added as a Nuxt, Vue or Gatsby module configured by an ID (nuxt-gtag, @gtm-support/vue-gtm, gatsby-plugin-google-gtag), Firebase's compat analytics, and Meta's Conversions API SDK (the server-side pixel) all pass rule 4, which names Google Analytics, Tag Manager and pixels", () => {
    const cases: [string, Record<string, string>][] = [
      ["nuxt-gtag", { "package.json": pkg({ "nuxt-gtag": "3" }), "nuxt.config.ts": 'export default defineNuxtConfig({ modules: ["nuxt-gtag"], gtag: { id: "G-FICTION01" } });\n' }],
      ["@gtm-support/vue-gtm", { "package.json": pkg({ "@gtm-support/vue-gtm": "3" }), "src/main.ts": 'import { createGtm } from "@gtm-support/vue-gtm";\napp.use(createGtm({ id: "GTM-FICT01" }));\n' }],
      ["gatsby-plugin-google-gtag", { "package.json": pkg({ "gatsby-plugin-google-gtag": "5" }), "gatsby-config.js": 'module.exports = { plugins: [{ resolve: "gatsby-plugin-google-gtag", options: { trackingIds: ["G-FICTION01"] } }] };\n' }],
      ["firebase compat analytics", { "src/app/fb.ts": 'import firebase from "firebase/compat/app";\nimport "firebase/compat/analytics";\nfirebase.analytics();\n' }],
      ["Meta Conversions API", { "package.json": pkg({ "facebook-nodejs-business-sdk": "20" }), "src/data/capi.ts": 'import bizSdk from "facebook-nodejs-business-sdk";\nexport const { EventRequest, ServerEvent } = bizSdk;\n' }],
    ];
    for (const [what, extra] of cases) {
      const c = check(project({ ...good(), ...extra }), "tracking");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T12
  it("fixed (MEDIUM): the keys of services the tool's own lists name aren't recognised, so a key pasted into the code passes rule 8: Resend (the feed's own provider), Google AI (Gemini), Groq, Replicate, Hugging Face, a Stripe webhook secret and a Supabase secret key", () => {
    const cases: [string, string][] = [
      ["Resend", `export const mail = new Resend("${["re", "_", "Fict1onal", rep("Q", 24)].join("")}");\n`],
      ["Google AI", `export const ai = new GoogleGenerativeAI("${["AI", "za", "Sy", rep("F", 33)].join("")}");\n`],
      ["Groq", `export const groq = new Groq({ apiKey: "${["gsk", "_", rep("F1", 26)].join("")}" });\n`],
      ["Replicate", `export const r = new Replicate({ auth: "${["r8", "_", rep("F", 37)].join("")}" });\n`],
      ["Hugging Face", `export const hf = new HfInference("${["hf", "_", rep("F", 34)].join("")}");\n`],
      ["Stripe webhook", `export const endpointSecret = "${["wh", "sec", "_", rep("F", 32)].join("")}";\n`],
      ["Supabase", `export const admin = createClient(url, "${["sb", "_secret_", rep("F", 32)].join("")}");\n`],
    ];
    for (const [what, code] of cases) {
      const dir = project({ ...good(), "src/data/keys.ts": code });
      const c = check(dir, "secrets");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T13
  it("fixed (MEDIUM): a costs file that states no cost passes rule 7 as 'filled in': init's own table with the TODOs deleted, 'TBD' in every cell, or 'We will fill this in later.' An agent that can't know the costs reaches for exactly these", () => {
    const table = (cell: string, pay: string) =>
      `# Costs\n\nWhat it costs to run this project each month, and who pays. Keep it up to date (our.one rule 7).\n\n| What | Provider | A month | Paid by |\n|---|---|---|---|\n| Hosting | ${cell} | ${cell} | ${cell} |\n| Database | ${cell} | ${cell} | ${cell} |\n| Email | ${cell} | ${cell} | ${cell} |\n| Domain | ${cell} | ${cell} | ${cell} |\n\nThe maintainer's pay: ${pay}\n`;
    for (const [what, costs] of [
      ["TODOs deleted", table("", "")],
      ["TBD", table("TBD", "TBD")],
      ["later", "# Costs\n\nWe will fill this in later.\n"],
    ] as const) {
      const c = check(project({ ...good(), "COSTS.md": costs }), "costs");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T14
  it("fixed (MEDIUM): claims rule 9 names in so many words pass: 'Protected by our.one', 'an our.one-protected service', 'Listed on our.one'; and so do 'Owned by users, not investors' (no 'its' or 'the') and 'owned by <strong>its users</strong>' (a tag in the middle)", () => {
    for (const phrase of ["Protected by our.one.", "An our.one-protected service.", "Listed on our.one.", "Owned by users, not investors.", "It is owned by <strong>its users</strong>."]) {
      const c = check(project({ ...good(), "src/app/page.tsx": `export default function P() { return <p>${phrase}</p>; }\n` }), "claims");
      expect([phrase, c.outcome]).toEqual([phrase, "fail"]);
    }
  });

  // T15
  it("fixed (MEDIUM): the claims check doesn't read our.one.json, so `purpose: \"A community-owned market for FICTIONAL growers.\"` passes, in the one text our.one is sure to read; the repository's own scan reads the feed's manifest for the same reason (scanManifestText)", () => {
    const c = check(project({ ...good(), "our.one.json": manifest({ purpose: "A community-owned market for FICTIONAL growers." }) }), "claims");
    expect(c.outcome).toBe("fail");
  });

  // T16
  it("fixed (MEDIUM): data.collects: [] passes as 'keeps nothing about anyone' while the same manifest says it sends a person's email address to Resend and the code reaches a database; init writes collects: [] as the default, so a field nobody filled in passes (kit.test.ts's own 'keeps nothing' case is this project)", () => {
    const c = check(project({ ...good(), "our.one.json": manifest({}, { collects: [] }) }), "data");
    expect(c.summary).not.toBe("It declares that it keeps nothing about anyone.");
    expect(c.outcome).toBe("fail");
  });

  // T17
  it("fixed (MEDIUM): in a project with a JavaScript front end and a Python back end (for example Next.js and FastAPI), the boundary check passes with 'No database or file-store client found in the code' while the Python it never read connects to Postgres everywhere; a Python-only project is honestly 'not checked'", () => {
    const c = check(
      project({
        ...good(),
        "our.one.json": manifest({}, { boundary: [] }),
        "src/data/db.ts": "export const rows: string[] = [];\n",
        "api/main.py": "import psycopg\nfrom fastapi import FastAPI\napp = FastAPI()\nconn = psycopg.connect()\n",
      }),
      "boundary",
    );
    expect(c.outcome !== "pass" || /python|\.py\b|not read|weren't read|only reads/i.test(c.summary)).toBe(true);
  });

  // T18
  it("fixed (LOW): an import the pattern can't parse hides a store client from the boundary check: a comment inside a multi-line import's braces, or a dynamic import written with backquotes", () => {
    for (const code of ['import {\n  Pool, // the connection pool\n  Client,\n} from "pg";\n', 'import { Pool /* pool */ } from "pg";\n', "const pg = await import(`pg`);\n"]) {
      const c = check(project({ ...good(), "src/app/api/route.ts": code }), "boundary");
      expect([code, c.outcome]).toEqual([code, "fail"]);
    }
  });

  // T19
  it("fixed (LOW): a commented-out import (`// import { sql } from \"@vercel/postgres\";`, left after moving the code into the boundary) fails the boundary check as code that reaches a store", () => {
    const c = check(project({ ...good(), "src/app/page.tsx": '// import { sql } from "@vercel/postgres";\nexport default function Page() { return <p>FICTIONAL tool</p>; }\n' }), "boundary");
    expect(c.outcome).toBe("pass");
  });

  // T20
  it("fixed (LOW): test and setup files with common names other than the listed folders count as product code, so a test helper that resets the database fails rule 1: vitest.setup.ts, CRA's src/setupTests.ts, a Cypress component test (*.cy.tsx), __fixtures__", () => {
    for (const file of ["vitest.setup.ts", "src/setupTests.ts", "src/components/Button.cy.tsx", "src/__fixtures__/db.ts"]) {
      const c = check(project({ ...good(), [file]: 'import { Pool } from "pg";\nexport const reset = () => new Pool().query("truncate people");\n' }), "boundary");
      expect([file, c.outcome]).toEqual([file, "pass"]);
    }
  });

  // T21
  it("fixed (LOW): more secrets pass rule 8: an npm token in a tracked .npmrc, a Slack webhook address, a real password to a private-network database host (Railway's .railway.internal), a SQLAlchemy-style address (postgresql+psycopg2://), and environment files by other names (.dev.vars, which Cloudflare's tools use, and .envrc)", () => {
    const cases: [string, Record<string, string>][] = [
      ["npm token", { ".npmrc": `//registry.npmjs.org/:_authToken=${["npm", "_", rep("F", 36)].join("")}\n` }],
      ["Slack webhook", { "src/data/notify.ts": `await fetch("${["https://hooks.", "slack.com/services/", "T0FICTION/", "B0FICTION/", rep("F", 24)].join("")}", { method: "POST" });\n` }],
      ["private-network host", { "src/data/db.ts": `import pg from "pg";\nexport const pool = new pg.Pool({ connectionString: "${["postgresql://postgres:", "Fict1onalPassw0rd", "@postgres.railway.internal:5432/railway"].join("")}" });\n` }],
      ["SQLAlchemy", { "api/db.py": `engine = create_engine("${["postgresql+psycopg2://app:", "Fict1onalPassw0rd", "@db.prod.example.net/app"].join("")}")\n` }],
      [".dev.vars", { ".dev.vars": "SESSION_SECRET=FICTIONAL0123456789abcdef\n" }],
      [".envrc", { ".envrc": "export SESSION_SECRET=FICTIONAL0123456789abcdef\n" }],
    ];
    for (const [what, extra] of cases) {
      const c = check(project({ ...good(), ...extra }), "secrets");
      expect([what, c.outcome]).toEqual([what, "fail"]);
    }
  });

  // T22
  it("fixed (LOW): a tracked file over 1 MB is never read for secrets, yet the secrets check passes with 'No secret the tool recognises' and the stop hook stays silent; for example a committed build bundle with a key inlined", () => {
    const key = ["sk", "live", "FICT10NAL0000000000000000"].join("_");
    const dir = project({ ...good(), "public/assets/index.js": `${rep("// a line of a large generated bundle\n", 30_000)}const k = "${key}";\n` });
    expect(check(dir, "secrets").outcome).not.toBe("pass");
  });

  // T23
  it("fixed (LOW): a tracked .env.test holding only test defaults, which Next.js 16's own docs (dist/docs/01-app/02-guides/environment-variables.md, in the package) say 'should be included in your repository', fails rule 8 unread, with a fix that says to replace every secret in it", () => {
    const c = check(project({ ...good(), ".env.test": "NEXT_PUBLIC_SITE_URL=http://localhost:3000\n" }), "secrets");
    expect(c.outcome).toBe("pass");
  });

  // T24
  it("fixed (LOW): the check prints part or all of a secret that sits in our.one.json: a JSON parse error quotes the text around it ('sk_live_FI…' for an unquoted value), and the boundary check echoes a pasted database address, password and all, in every output mode", () => {
    const key = ["sk", "live", "FICT10NAL0000000000000000"].join("_");
    const unquoted = project({ ...good(), "our.one.json": `{"name": "FICTIONAL", "deployKey": ${key}}` });
    expect(everyOutput(unquoted)).not.toContain(key.slice(0, 10));
    const password = "Fict1onalPassw0rd";
    const pasted = project({ ...good(), "our.one.json": manifest({}, { boundary: ["src/data", ["postgres://app:", password, "@db.prod.example.net/app"].join("")] }) });
    expect(everyOutput(pasted)).not.toContain(password);
  });

  // T25
  it("fixed (LOW): the stop hook drops its input when stdin is still open as it reads (reading process.stdin.isTTY makes stdin non-blocking, so readFileSync(0) throws EAGAIN and the input becomes {}), and then blocks again although stop_hook_active is true: written at once and closed 1.5 s later, it exits 2", async () => {
    const dir = project(without(good(), "LICENSE"));
    const r = await runAsync(dir, ["check", "--hook"], '{"hook_event_name":"Stop","stop_hook_active":true}\n', 1500);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty("systemMessage");
  });

  // T26
  it("fixed (LOW): check runs whatever program the project's .git/config names as core.fsmonitor (git ls-files runs it), so a project handed over with its .git folder runs code on the checker's machine, our.one's own included, and that code can reach the network; `git -c core.fsmonitor=false` would close it", () => {
    const dir = project(good());
    const elsewhere = project({}, { git: false });
    const marker = join(elsewhere, "fsmonitor-ran");
    const program = join(elsewhere, "fsmonitor.sh");
    writeFileSync(program, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
    chmodSync(program, 0o755);
    spawnSync("git", ["config", "core.fsmonitor", program], { cwd: dir });
    run(dir, ["check", "--json"]);
    expect(existsSync(marker)).toBe(false);
  });

  // T27
  it("fixed (LOW): init writes through hard links: an AGENTS.md hard-linked to a file outside the project, or a .claude/settings.json hard-linked to the person's global Claude Code settings, is rewritten in place, so the file outside changes (the global settings gain a stop hook for every project)", () => {
    const outside = project({ "shared-AGENTS.md": "# Shared notes, outside the project\n", "global-settings.json": '{"permissions":{"allow":["Bash(ls)"]}}\n' }, { git: false });
    const dir = project({});
    linkSync(join(outside, "shared-AGENTS.md"), join(dir, "AGENTS.md"));
    mkdirSync(join(dir, ".claude"));
    linkSync(join(outside, "global-settings.json"), join(dir, ".claude/settings.json"));
    run(dir, ["init"]);
    expect(readFileSync(join(outside, "shared-AGENTS.md"), "utf8")).toBe("# Shared notes, outside the project\n");
    expect(readFileSync(join(outside, "global-settings.json"), "utf8")).toBe('{"permissions":{"allow":["Bash(ls)"]}}\n');
  });

  // T28
  it("fixed (LOW): the tool reads files outside the project through links: without git, a costs file named through a linked folder is read and passes; and init reads a linked package.json to fill in the licence", () => {
    const outside = project({ "COSTS.md": "# Costs\n\nFICTIONAL costs, kept outside the project and filled in.\n", "package.json": JSON.stringify({ license: "ISC" }) }, { git: false });
    const files = without(good(), "COSTS.md");
    const dir = project({ ...files, "our.one.json": manifest({ costs: "docs/COSTS.md" }) }, { git: false });
    symlinkSync(outside, join(dir, "docs"));
    expect(check(dir, "costs").outcome).toBe("fail");
    const fresh = project({});
    symlinkSync(join(outside, "package.json"), join(fresh, "package.json"));
    run(fresh, ["init"]);
    expect((JSON.parse(readFileSync(join(fresh, "our.one.json"), "utf8")) as { license: string }).license).not.toBe("ISC");
  });

  // T29
  it("fixed (LOW): init stops half-way with an error when it can't make a folder (.github is a file; .claude is a dangling link), after writing some files and before the report, instead of noting it and finishing", () => {
    const spare = project({}, { git: false });
    for (const make of [(d: string) => writeFileSync(join(d, ".github"), "not a folder\n"), (d: string) => symlinkSync(join(spare, "nowhere"), join(d, ".claude"))]) {
      const dir = project({ "package.json": "{}" });
      make(dir);
      const r = run(dir, ["init"]);
      expect([r.status, r.stderr]).toEqual([0, ""]);
      expect(r.stdout).toContain("Next: fill in every TODO");
    }
  });

  // T30
  it("fixed (LOW): a UTF-8 byte-order mark, which some Windows tools write, makes our.one.json 'not valid JSON' (an invisible character in the message, then five more checks fail with it), and makes the tool ignore package.json, so its dependencies drop out of the leave and tracking checks", () => {
    expect(check(project({ ...good(), "our.one.json": `﻿${manifest()}` }), "manifest").outcome).toBe("pass");
    expect(check(project({ ...good(), "package.json": `﻿${pkg({ stripe: "1" })}` }), "leave").outcome).toBe("fail");
  });

  // T31
  it("fixed (LOW): honest licences fail: a project in a monorepo whose LICENSE is at the repository's root, a REUSE-style LICENSES/ folder, and an OSI-approved licence the list lacks (LGPL-2.1-only); the last can never pass", () => {
    const repo = project({ LICENSE: MIT, ...Object.fromEntries(Object.entries(without(good(), "LICENSE")).map(([k, v]) => [`apps/x/${k}`, v])) });
    expect(check(join(repo, "apps/x"), "licence").outcome).toBe("pass");
    expect(check(project({ ...without(good(), "LICENSE"), "LICENSES/MIT.txt": MIT }), "licence").outcome).toBe("pass");
    const lgpl = { ...good(), "our.one.json": manifest({ license: "LGPL-2.1-only" }), "package.json": pkg({}, { license: "LGPL-2.1-only" }), LICENSE: "GNU LESSER GENERAL PUBLIC LICENSE\nVersion 2.1, February 1999\nFICTIONAL test copy.\n" };
    expect(check(project(lgpl), "licence").outcome).toBe("pass");
  });

  // T32
  it("fixed (LOW): a licence file that only names the licence passes as its full text, which build.md and the fix both ask for: 'Licensed under the Apache License, Version 2.0. See …' (the feed's licence, and the one the kit suggests), or the MIT licence's first phrase alone", () => {
    const apache = { ...good(), "our.one.json": manifest({ license: "Apache-2.0" }), "package.json": pkg({}, { license: "Apache-2.0" }), LICENSE: "Licensed under the Apache License, Version 2.0. See https://www.apache.org/licenses/LICENSE-2.0\n" };
    expect(check(project(apache), "licence").outcome).toBe("fail");
    expect(check(project({ ...good(), LICENSE: "Permission is hereby granted, free of charge\n" }), "licence").outcome).toBe("fail");
  });

  // T33
  it("fixed (LOW): init from a subfolder of a new project (the tool in scripts/, the agent's shell in src/) writes the whole set into src/ and says the tool 'isn't inside this project'; and in a monorepo it writes the workflow under apps/x/.github/workflows, which GitHub never runs, without a word", () => {
    const fresh = project({ "package.json": "{}", "src/app/page.tsx": "export default function Page() { return null; }\n" });
    copyTool(fresh);
    spawnSync(process.execPath, [join(fresh, "scripts/our-one.mjs"), "init"], { cwd: join(fresh, "src"), encoding: "utf8" });
    expect(existsSync(join(fresh, "src/our.one.json"))).toBe(false);
    const repo = project({ "package.json": "{}", "apps/x/package.json": "{}" });
    copyTool(join(repo, "apps/x"));
    const r = spawnSync(process.execPath, [join(repo, "apps/x/scripts/our-one.mjs"), "init", "--project", join(repo, "apps/x")], { encoding: "utf8" });
    const said = /repository'?s root|root of the repository/i.test(r.stdout.replace(/\s+/g, " "));
    expect(existsSync(join(repo, ".github/workflows/our-one.yml")) || said).toBe(true);
  });

  // T34
  it("fixed (LOW): init's refusal of the home folder is passed by a link to it, and check doesn't refuse the home folder at all: it would read every file there, ~/.ssh included", () => {
    const home = project({}, { git: false });
    const env = { ...process.env, HOME: home };
    const links = project({}, { git: false });
    symlinkSync(home, join(links, "home"));
    const viaLink = spawnSync(process.execPath, [TOOL, "init", "--project", join(links, "home")], { encoding: "utf8", env });
    expect([viaLink.status, existsSync(join(home, "our.one.json"))]).toEqual([2, false]);
    const checked = spawnSync(process.execPath, [TOOL, "check", "--project", home], { encoding: "utf8", env });
    expect(checked.status).toBe(2);
  });

  // T35
  it("fixed (LOW): data.export 'Not built yet.' and data.delete 'N/A' pass, and the summary says the project has 'export and deletion'", () => {
    for (const data of [{ export: "Not built yet." }, { delete: "N/A" }]) {
      const c = check(project({ ...good(), "our.one.json": manifest({}, data) }), "data");
      expect([data, c.outcome]).toEqual([data, "fail"]);
    }
  });

  // T36
  it("fixed (LOW): a second, changed copy of the rules block beside an intact one passes the agents check (agents read both), and init leaves a changed copy that comes after the intact block", () => {
    const changed = tool.RULES_BLOCK.replace(
      "4. **No ads and no tracking.** No ad networks or pixels, no Google Analytics or Tag Manager, no session recording, no data brokers or data hubs.",
      "4. **Ads are fine.** Use any analytics you like.",
    );
    const dir = project({ ...good(), "AGENTS.md": `# AGENTS.md\n\n${tool.RULES_BLOCK}\n\n${changed}\n` });
    expect(check(dir, "agents").outcome).toBe("fail");
    run(dir, ["init"]);
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).not.toContain("Ads are fine.");
  });

  // T37
  it("fixed (LOW): init removes what it doesn't understand in .claude/settings.json (a Stop written as an object, hooks written as a list), and leaves alone, as 'not valid JSON', a settings file that only starts with a byte-order mark", () => {
    for (const settings of [{ hooks: { Stop: { hooks: [{ type: "command", command: "echo FICTIONAL-object" }] } } }, { hooks: [{ Stop: "FICTIONAL-list" }] }]) {
      const dir = project({ ".claude/settings.json": JSON.stringify(settings) });
      run(dir, ["init"]);
      expect(readFileSync(join(dir, ".claude/settings.json"), "utf8")).toContain("FICTIONAL-");
    }
    const bom = project({ ".claude/settings.json": `﻿${JSON.stringify({ permissions: { allow: ["Bash(ls)"] } })}` });
    run(bom, ["init"]);
    expect(readFileSync(join(bom, ".claude/settings.json"), "utf8")).toContain("our-one.mjs");
  });

  // T38
  it("fixed (LOW): finding each import's line costs a scan from the file's start (lineAt), so a generated file with many imports is quadratic: 20,000 require() lines (520 KB) took 13 s in-process on this machine, past what a stop hook should take", () => {
    const dir = project({ ...good(), "src/generated/requires.js": rep('require("./x");\n', 35_000) });
    const r = run(dir, ["check", "--json"], undefined, 8_000);
    expect([r.signal, r.status]).toEqual([null, 0]);
  }, 30_000);

  // T39
  it("fixed (LOW): the claims check skips templates that render pages (.ejs, though the tracking check reads them) and the message files internationalised apps keep their copy in (messages/en.json), so 'A user-owned market.' passes there", () => {
    const cases: [string, string][] = [
      ["views/index.ejs", "<h1>A user-owned market.</h1>\n"],
      ["messages/en.json", JSON.stringify({ hero: "A user-owned market." })],
    ];
    for (const [file, text] of cases) {
      const c = check(project({ ...good(), [file]: text }), "claims");
      expect([file, c.outcome]).toEqual([file, "fail"]);
    }
  });

  // T40
  it("fixed (LOW): when git can't run (not installed, or refusing the folder as of 'dubious ownership'), the tool walks the folder instead without saying why: it tells a git repository that it is 'Not a git repository', and a tracked .env goes unflagged", () => {
    const dir = project({ ...good(), ".env": "SESSION_SECRET=FICTIONAL\n" });
    spawnSync("git", ["add", "-A"], { cwd: dir });
    const r = run(dir, ["check", "--json"], undefined, 60_000, { ...process.env, PATH: "/nonexistent" });
    const secrets = (JSON.parse(r.stdout) as Report).checks.find((c) => c.id === "secrets")!;
    expect(secrets.summary).not.toContain("Not a git repository");
  });
});

/* ============================================================ closed */

describe("closed: what the tool must never do", () => {
  it("closed: the tool makes no network request: its source imports only node:child_process, crypto, fs, os, path and url, with no fetch, socket, http, dns or dynamic import; and in-process runs of check() and init() on FICTIONAL projects open no socket, look up no name and call no fetch (each entry point patched to record and refuse)", () => {
    const source = readFileSync(TOOL, "utf8");
    const imported = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort();
    expect(imported).toEqual(["node:child_process", "node:crypto", "node:fs", "node:os", "node:path", "node:url"]);
    expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(?:http|https|net|tls|dgram|dns)\b|\bimport\s*\(|\brequire\s*\(/);
    const calls: string[] = [];
    const refuse = (what: string) => () => {
      calls.push(what);
      throw new Error(`${what}: no network in this test`);
    };
    const spies = [
      vi.spyOn(net.Socket.prototype, "connect").mockImplementation(refuse("net.Socket.connect")),
      vi.spyOn(tls, "connect").mockImplementation(refuse("tls.connect")),
      vi.spyOn(dns, "lookup").mockImplementation(refuse("dns.lookup")),
      vi.spyOn(http, "request").mockImplementation(refuse("http.request")),
      vi.spyOn(https, "request").mockImplementation(refuse("https.request")),
      vi.spyOn(globalThis, "fetch").mockImplementation(refuse("fetch")),
    ];
    try {
      expect(tool.check(project(good())).result).toBe("ready");
      expect(tool.init(project({ "package.json": "{}" })).created).toContain("our.one.json");
    } finally {
      for (const s of spies) s.mockRestore();
    }
    expect(calls).toEqual([]);
  });

  it("closed: for every kind of secret the tool recognises (a private key, AWS, GitHub, Slack, live Stripe, Anthropic, OpenAI and SendGrid keys, a database address with a password), no output mode (text, --json, --hook's stderr, --hook's stdout once stop_hook_active) carries the secret or any eight characters of it", () => {
    const kinds: [string, string, string][] = [
      ["a private key", ["-----BEGIN RSA ", "PRIVATE KEY-----\nMIIEFICT10NAL", rep("A", 40), "\n-----END RSA ", "PRIVATE KEY-----"].join(""), ["MIIEFICT10NAL", rep("A", 40)].join("")],
      ["an AWS access key", ["AKIA", "FICT10NALQQQQQQQ"].join(""), "FICT10NALQQQQQQQ"],
      ["a GitHub token", ["gh", "p_", rep("F", 18), rep("7", 18)].join(""), [rep("F", 18), rep("7", 18)].join("")],
      ["a Slack token", ["xo", "xb-", "1234567890-", rep("F", 24)].join(""), ["1234567890-", rep("F", 24)].join("")],
      ["a live Stripe key", ["sk", "live", "FICT10NAL0000000000000000"].join("_"), "FICT10NAL0000000000000000"],
      ["an Anthropic API key", ["sk-", "ant-", "api03-", rep("F", 40)].join(""), rep("F", 40)],
      ["an OpenAI API key", ["sk-", "proj-", rep("F", 20), "T3Blbk", "FJ", rep("G", 20)].join(""), [rep("F", 20), "T3Blbk", "FJ", rep("G", 20)].join("")],
      ["a SendGrid API key", ["SG", ".", rep("F", 22), ".", rep("G", 43)].join(""), [rep("F", 22), ".", rep("G", 43)].join("")],
      ["a database address with a password", ["postgres://app:", "Fict1onalPassw0rd", "@db.prod.example.net:5432/app"].join(""), "Fict1onalPassw0rd"],
    ];
    for (const [kind, secret, body] of kinds) {
      const dir = project({ ...good(), "src/data/config.ts": `export const k = ${JSON.stringify(secret)};\n` });
      expect(check(dir, "secrets").findings.map((f) => f.message)).toEqual([`src/data/config.ts holds what looks like ${kind}.`]);
      const out = everyOutput(dir);
      for (let i = 0; i + 8 <= body.length; i += 1) expect(out.includes(body.slice(i, i + 8)), `${kind}: ${i}`).toBe(false);
    }
  }, 120_000);

  it("closed: init writes nothing through a link at .github/workflows (inside a real .github), through a dangling link where it would create COSTS.md, or into a linked .claude whose settings.json exists; and run twice on a new project it leaves every file byte for byte and updates nothing", () => {
    const outside = project({ "keep.txt": "kept\n", "settings.json": '{"permissions":{}}\n' }, { git: false });
    const dir = project({ ".github/README.md": "# FICTIONAL\n" });
    symlinkSync(outside, join(dir, ".github/workflows"));
    symlinkSync(join(outside, "nowhere.md"), join(dir, "COSTS.md"));
    symlinkSync(outside, join(dir, ".claude"));
    const r = run(dir, ["init"]);
    expect(r.status).toBe(0);
    expect(existsSync(join(outside, "our-one.yml"))).toBe(false);
    expect(existsSync(join(outside, "nowhere.md"))).toBe(false);
    expect(readFileSync(join(outside, "settings.json"), "utf8")).toBe('{"permissions":{}}\n');

    const fresh = project({ "package.json": JSON.stringify({ license: "MIT" }) });
    run(fresh, ["init"]);
    const names = ["our.one.json", "AGENTS.md", "CLAUDE.md", "COSTS.md", "PITCH.md", ".claude/settings.json", ".github/workflows/our-one.yml"];
    const before = names.map((f) => readFileSync(join(fresh, f), "utf8"));
    const again = run(fresh, ["init"]);
    expect(names.map((f) => readFileSync(join(fresh, f), "utf8"))).toEqual(before);
    expect(again.stdout).not.toContain("Created:");
    expect(again.stdout).not.toContain("Updated:");
  });

  it("closed: init refuses the filesystem's root and the home folder written with a '.' segment or a trailing slash, and writes nothing there; a file given as --project, --project without a folder, --project=<dir>, an unknown option and two commands are usage errors (exit 2)", () => {
    expect(spawnSync(process.execPath, [TOOL, "init", "--project", "/"], { encoding: "utf8" }).status).toBe(2);
    const home = project({}, { git: false });
    const env = { ...process.env, HOME: home };
    for (const p of [`${home}/.`, `${home}/`]) expect(spawnSync(process.execPath, [TOOL, "init", "--project", p], { encoding: "utf8", env }).status).toBe(2);
    expect(existsSync(join(home, "our.one.json"))).toBe(false);
    const file = join(project({ "x.txt": "FICTIONAL\n" }), "x.txt");
    for (const args of [["check", "--project", file], ["check", "--project"], ["check", `--project=${home}`], ["check", "--fast"], ["check", "init"]]) {
      expect([args.join(" "), spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" }).status]).toEqual([args.join(" "), 2]);
    }
  });

  it("closed: --hook doesn't hang when stdin stays open (a passing project returns at once), and the secret, host and claims patterns other than the two in the DEFECT above are linear on crafted inputs of 300 KB to 1 MB (each under 2 s; most under 10 ms on this machine)", async () => {
    const open = await runAsync(project(good()), ["check", "--hook"], "", null, 10_000);
    expect(open.code).toBe(0);
    const inputs = [rep("sk-", 200_000), `-----BEGIN ${rep("A ", 400_000)}`, rep("postgres://a:", 50_000), rep("xoxb-", 100_000), rep("SG.", 200_000), rep("AKIA", 200_000), rep("ghp_", 200_000)];
    const time = (re: RegExp, text: string): number => {
      const t0 = performance.now();
      re.lastIndex = 0;
      const found = [...text.matchAll(re)];
      return found.length >= 0 ? performance.now() - t0 : Number.NaN;
    };
    for (const s of tool.SECRETS.filter((x) => x.kind !== "an OpenAI API key")) for (const text of inputs) expect([s.kind, time(s.re, text) < 2000]).toEqual([s.kind, true]);
    for (const c of tool.CLAIMS) expect(time(c.re, rep("owned by all of ", 60_000)) < 2000).toBe(true);
    for (const t of tool.TRACKING) {
      for (const host of t.hosts ?? []) {
        const re = new RegExp(`(?:https?:)?//(?:[a-z0-9-]+\\.)*${host.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "gi");
        expect([host, time(re, `//${rep("a.", 300_000)}`) < 2000]).toEqual([host, true]);
      }
    }
  }, 120_000);
});

describe("closed: the stop hook, init's files and Node 18", () => {
  it("closed: --hook speaks Claude Code's documented protocol: exit 2 with the failures on stderr the first time; with stop_hook_active true, exit 0 and a stdout that is exactly one JSON object holding a systemMessage; silent exit 0 when everything passes; stdin that isn't JSON counts as a first stop; and the settings init writes have the documented shape (hooks.Stop[].hooks[] of type command), with ${CLAUDE_PROJECT_DIR} in quotes", () => {
    const failing = project(without(good(), "LICENSE"));
    const first = run(failing, ["check", "--hook"], '{"stop_hook_active":false}');
    expect([first.status, first.stdout]).toEqual([2, ""]);
    expect(first.stderr).toContain("- licence: There is no licence file");
    const second = run(failing, ["check", "--hook"], '{"session_id":"FICTIONAL","hook_event_name":"Stop","stop_hook_active":true}');
    expect([second.status, second.stderr]).toEqual([0, ""]);
    expect(Object.keys(JSON.parse(second.stdout) as object)).toEqual(["systemMessage"]);
    expect(second.stdout.trim().split("\n")).toHaveLength(1);
    expect(run(failing, ["check", "--hook"], "not json").status).toBe(2);
    const passing = run(project(good()), ["check", "--hook"], '{"stop_hook_active":false}');
    expect([passing.status, passing.stdout, passing.stderr]).toEqual([0, "", ""]);

    const fresh = project({ "package.json": "{}" });
    run(fresh, ["init"]);
    const settings = JSON.parse(readFileSync(join(fresh, ".claude/settings.json"), "utf8")) as unknown;
    expect(settings).toEqual({ hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/scripts/our-one.mjs" check --hook' }] }] } });
  });

  it("closed: the workflow init writes is well-formed (parsed with yaml 2.9.0 during verification: on push and pull_request, contents: read, one job on ubuntu-latest with actions/checkout@v6, actions/setup-node@v6 on Node 22, and `node scripts/our-one.mjs check`); here, its exact text: two-space indentation, no tabs. Whether the two v6 tags exist on GitHub wasn't checked: no network", () => {
    const fresh = project({ "package.json": "{}" });
    run(fresh, ["init"]);
    const yml = readFileSync(join(fresh, ".github/workflows/our-one.yml"), "utf8");
    expect(yml).not.toContain("\t");
    for (const line of yml.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"))) expect(line.match(/^ */)![0].length % 2).toBe(0);
    expect(yml.split("\n").filter((l) => !l.startsWith("#"))).toEqual([
      "name: our.one check",
      "on:",
      "  push:",
      "  pull_request:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  check:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v6",
      "      - uses: actions/setup-node@v6",
      "        with:",
      "          node-version: 22",
      "      - run: node scripts/our-one.mjs check",
      "",
    ]);
  });

  it("closed: Node 18 — the source uses none of the APIs added after Node 18 that a tool like this might reach for (toSorted and its kin, Object.groupBy, Array.fromAsync, Promise.withResolvers, import.meta.dirname, fs.globSync, process.loadEnvFile, String isWellFormed), and its regular expressions use only the g, i and m flags (not v, which needs Node 20); and under Node v18.20.8 (npx -y node@18) check printed READY TO PROPOSE on a passing project, init created all seven files, and --hook with stop_hook_active true printed the systemMessage and exited 0", () => {
    const source = readFileSync(TOOL, "utf8");
    expect(source).not.toMatch(/\.toSorted\(|\.toReversed\(|\.toSpliced\(|\.with\(|Object\.groupBy\(|Map\.groupBy\(|Array\.fromAsync\(|Promise\.withResolvers|import\.meta\.(?:dirname|filename)|globSync|loadEnvFile|\.isWellFormed\(/);
    const flags = new Set([...source.matchAll(/\/([dgimsuyv]+)(?=[\s,;).\]])/g)].map((m) => m[1]));
    expect([...flags].sort()).toEqual(["g", "gi", "i", "m"]);
  });
});

describe("closed: honest projects and import forms", () => {
  it("closed: the boundary check sees import-equals, `import * as`, `export *`, `export { } from`, multi-line imports, imports in .vue, .svelte and .astro files, and `const require = createRequire(import.meta.url)`", () => {
    const cases: [string, string][] = [
      ["src/app/a.ts", 'import pg = require("pg");\n'],
      ["src/app/b.ts", 'import * as pg from "pg";\n'],
      ["src/app/c.ts", 'export * from "pg";\n'],
      ["src/app/d.ts", 'export { Pool as P } from "pg";\n'],
      ["src/app/e.ts", 'import {\n  Pool,\n  Client,\n} from "pg";\n'],
      ["src/app/F.vue", '<script setup lang="ts">\nimport pg from "pg";\n</script>\n<template><p>FICTIONAL</p></template>\n'],
      ["src/app/G.svelte", '<script>\nimport pg from "pg";\n</script>\n<p>FICTIONAL</p>\n'],
      ["src/app/h.astro", '---\nimport pg from "pg";\n---\n<p>FICTIONAL</p>\n'],
      ["src/app/i.mjs", 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const pg = require("pg");\n'],
    ];
    for (const [file, code] of cases) expect([file, check(project({ ...good(), [file]: code }), "boundary").outcome]).toEqual([file, "fail"]);
  });

  it("closed: honest projects pass: our.one.json with Windows line endings, LICENSE-MIT or LICENSE.txt, a code comment that names trackers without their addresses, a real key in .env.example is still found, and check run from a subfolder with the tool in scripts/ checks the project's root", () => {
    expect(check(project({ ...good(), "our.one.json": manifest().replace(/\n/g, "\r\n") }), "manifest").outcome).toBe("pass");
    for (const name of ["LICENSE-MIT", "LICENSE.txt"]) expect(check(project({ ...without(good(), "LICENSE"), [name]: MIT }), "licence").outcome).toBe("pass");
    expect(check(project({ ...good(), "src/app/x.ts": "// No Google Analytics, no Hotjar and no Meta Pixel here.\nexport const x = 1;\n" }), "tracking").outcome).toBe("pass");
    const key = ["sk", "live", "FICT10NAL0000000000000000"].join("_");
    expect(check(project({ ...good(), ".env.example": `STRIPE_SECRET_KEY=${key}\n` }), "secrets").findings.map((f) => f.file)).toEqual([".env.example"]);
    const dir = project(good());
    copyTool(dir);
    const sub = spawnSync(process.execPath, [join(dir, "scripts/our-one.mjs"), "check", "--json"], { cwd: join(dir, "src"), encoding: "utf8" });
    const r = JSON.parse(sub.stdout) as Report;
    expect([sub.status, r.project, r.result]).toEqual([0, dir.split("/").pop(), "ready"]);
  });
});
