/**
 * Independent verification of M-0016 (the build kit; D-0019, SPEC §18.18),
 * the honesty and rendering lens. Written by an agent that did not build
 * it, against a92bbb5 (the build is 6925b1e and 576df0a; the records are
 * a2a2254). It changes no product code, no record and no other test.
 *
 * Stopping rule, declared before the first test was written. Every sentence
 * that kit/build.md, kit/README.md, the rules block, the tool's printed
 * messages (init, check, --json, --hook), apps/web/our.one.json,
 * apps/web/AGENTS.md, /build and the changed /maintainers and /projects put
 * in front of a person or an agent, each read against:
 *
 * 1. the records: AGENTS.md §6, §7, §9 and §10; D-0017, D-0018, D-0019,
 *    P-0012 and its evidence, M-0016 and the amended M-0012; /agreement,
 *    /contract and /privacy as they render;
 * 2. what the code does: the tool run on FICTIONAL projects made in a
 *    temporary folder (with git, without it, inside a larger repository,
 *    through a symbolic link), the feed's schema and code, the routes;
 * 3. whether build.md can be followed as written: its commands, their
 *    order, a monorepo, Windows, and before our.one is deployed;
 * 4. rendering: /build from a production build (`next build`, then
 *    `next start` on port 3320 with FICTIONAL settings) in headless Chrome
 *    at 320, 375 and 1280px, light and dark, measured over the DevTools
 *    protocol: the outline, landmarks, contrast, sideways scroll, what
 *    wraps and where, tap targets, link names; and /build.md, /kit/… over
 *    HTTP.
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on a92bbb5, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 * - What only a server or a browser can see is a measurement named in the
 *   test's title; the test asserts what the source can show.
 *
 * Severity, as earlier rounds used it: HIGH, something stated as in force,
 * built or approved that isn't; MEDIUM, a statement the code or the records
 * contradict, a layer of enforcement that silently doesn't run, or a page
 * out of step with its records; LOW, wording, polish, small gaps.
 *
 * Every project, person and address here is FICTIONAL. Secret-shaped
 * strings are built at run time, so that the feed's own check, which reads
 * this file, finds none in it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import AgreementPage from "@/app/(public)/agreement/page";
import BuildPage from "@/app/(public)/build/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import ProjectsPage from "@/app/(public)/projects/page";
import { dynamic as buildMdDynamic, GET as getBuildMd } from "@/app/build.md/route";
import {
  dynamic as kitDynamic,
  dynamicParams as kitDynamicParams,
  generateStaticParams,
  GET as getKitFile,
} from "@/app/kit/[file]/route";
import { proposalsEmail } from "@/core/config";
import { KIT_DIR, KIT_FILES } from "@/core/kit";
import { KIT_TOOL } from "@/core/kit-info";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TOOL = join(KIT_DIR, "our-one.mjs");

const read = (path: string) => readFileSync(join(WEB, path), "utf8");
const kitText = (name: string) => readFileSync(join(KIT_DIR, name), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const BUILD_MD = kitText("build.md");

/** A record as a reader reads it: markdown emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0")
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

/** The text of each <dd> after a <dt> whose label matches, in order. */
function ddAfter(markup: string, label: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`, "g");
  for (const m of markup.matchAll(re)) out.push(textOf(m[1]!));
  return out;
}

/** The inside of `<section aria-labelledby="id">`. */
function sectionOf(markup: string, id: string): string {
  return new RegExp(`<section aria-labelledby="${id}">([\\s\\S]*?)</section>`).exec(markup)?.[1] ?? "";
}

/** /build's rules, as the page lists them: each title with its "how it is checked" line. */
function rulesOnPage(): { title: string; checked: string }[] {
  const section = sectionOf(render(BuildPage), "build-rules");
  return [...section.matchAll(/<strong>([^<]+)<\/strong><\/p><p[^>]*>([^<]+)<\/p>/g)].map((m) => ({
    title: decode(m[1]!),
    checked: decode(m[2]!),
  }));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The body of the first rule for exactly this selector in a stylesheet. */
function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

/* ---------------------------------------------------- the tool, as run */

type Finding = { message: string; file?: string; line?: number; fix?: string };
type Check = { id: string; title: string; class: string; outcome: "pass" | "fail" | "not-checked"; summary: string; findings: Finding[] };
type Report = { result: "ready" | "not-ready"; checks: Check[]; forAPerson: string[]; notBuilt: string[] };
type Tool = {
  RULES_BLOCK: string;
  STORES: string[];
  SERVICES: { name: string; packages: string[] }[];
  TRACKING: { name: string; packages?: string[] }[];
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
  vi.unstubAllEnvs();
});

/** A FICTIONAL project in a temporary folder: these files, and a git repository unless `git` is false. */
function project(files: Record<string, string>, { git = true } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-verify-m0016-"));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

/** The tool, run as an agent runs it on a project: `node our-one.mjs <args> --project <dir>`. */
function run(dir: string, args: string[], input?: string) {
  const r = spawnSync(process.execPath, [TOOL, ...args, "--project", dir], { encoding: "utf8", input });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function report(dir: string): Report {
  return JSON.parse(run(dir, ["check", "--json"]).stdout) as Report;
}

function check(dir: string, id: string): Check {
  const c = report(dir).checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
}

const MIT = "FICTIONAL licence text for tests.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n";

const RESEND = { who: "Resend", what: "Your email address.", why: "To send sign-in links.", packages: ["resend"] };

function manifest(data: Record<string, unknown> = {}): string {
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
    },
    null,
    2,
  );
}

/** A FICTIONAL project that keeps every rule (the same as tests/kit.test.ts's). Each test changes one thing. */
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

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on a92bbb5)", () => {
  it("DEFECT (MEDIUM): the tool runs nothing and exits 0 when it is started by a path that goes through a symbolic link, so `check` and the stop hook 'pass' a project that has no our.one.json at all — a green result from a check that never ran (kit/our-one.mjs:1421-1422 compares import.meta.url, which Node resolves to the real path, with process.argv[1], which it does not; measured: `node /tmp/…/scripts/our-one.mjs check` on macOS, where /tmp is a link, prints nothing and exits 0)", () => {
    const real = realpathSync(project({}, { git: false }));
    mkdirSync(join(real, "scripts"));
    copyFileSync(TOOL, join(real, "scripts", "our-one.mjs"));
    const holder = realpathSync(mkdtempSync(join(tmpdir(), "ours-verify-m0016-link-")));
    made.push(holder);
    const link = join(holder, "the-project");
    symlinkSync(real, link, "dir");
    const by = (base: string, args: string[], input?: string) =>
      spawnSync(process.execPath, [join(base, "scripts", "our-one.mjs"), ...args], { cwd: real, encoding: "utf8", input });

    // By its own path, the same file checks the project: no our.one.json, so not ready.
    const direct = by(real, ["check"]);
    expect(direct.status).toBe(1);
    expect(direct.stdout).toContain("RESULT: NOT READY");
    expect(by(real, ["check", "--hook"], '{"stop_hook_active":false}').status).toBe(2);

    // The defect: by a path through a link, nothing runs, and the exit code says all is well.
    const viaLink = by(link, ["check"]);
    const hook = by(link, ["check", "--hook"], '{"stop_hook_active":false}');
    expect({ check: [viaLink.status, viaLink.stdout.includes("RESULT: NOT READY")], hook: hook.status }).toEqual({
      check: [1, true],
      hook: 2,
    });
  });

  it("DEFECT (MEDIUM): Claude Code runs a Stop hook every time the agent ends a response, not only when the work is done, so once init has run, each time the agent stops to ask the person something the hook sends it back with 'still says TODO … Fix: Fill it in.' for the maintainer, the contact and the costs and 'run … check until it passes, then finish', and nothing tells it to ask the person rather than invent what only the person knows (rule 9, 'Say only what is true'); /build describes the hook only as running 'whenever the agent tries to finish' (kit/our-one.mjs:658 and 1070-1079)", () => {
    const dir = project({ "package.json": JSON.stringify({ name: "fictional-tool", license: "MIT" }), LICENSE: MIT });
    expect(run(dir, ["init"]).status).toBe(0);
    const settings = readFileSync(join(dir, ".claude/settings.json"), "utf8");
    expect(settings).toContain("check --hook");
    expect(flat(BUILD_MD)).toContain("Replace every TODO with the person's answers.");

    // What the agent is sent back with when it stops, with the person's answers still to come.
    const r = run(dir, ["check", "--hook"], '{"stop_hook_active":false}');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("maintainers[0].contact still says TODO.");
    expect(r.stderr).toMatch(/COSTS\.md[^\n]*TODO/);

    // The defect: it never says to ask the person for what it can't know.
    expect(r.stderr).toMatch(/\bask (?:the person|them)\b/i);
  });

  it("DEFECT (MEDIUM): /projects shows the check as a fact about the feed — 'Checked: It passes the same check as every project proposed to our.one, rules 0.' — without saying what passing means; P-0012 adopted 'Every place that shows the check says that passing makes a project ready to propose, nothing more' against the risk of a check read as approval (D-0019 §E), and this is the one place that shows a result without it", () => {
    expect(record("proposals/P-0012.md")).toContain(
      "A check can be read as approval. Every place that shows the check says that passing makes a project ready to propose, nothing more.",
    );
    expect(record("decisions/D-0019.md")).toContain("A project that passes the check is ready to propose. Nothing more.");
    expect(textOf(render(BuildPage))).toContain("Passing makes a project ready to propose. Nothing more");

    const showing = ddAfter(render(ProjectsPage), "[^<]+").filter((dd) => /\bpass(?:es|ing)?\b[^.]*\bcheck\b/i.test(dd));
    for (const dd of showing) expect(dd).toMatch(/\bready to propose\b/i);
  });

  it("DEFECT (MEDIUM): the feed's our.one.json names Resend as its one outside service, but M-0012 — amended by D-0019 to deploy this build — runs the feed on Vercel with Neon as its database, and build.md tells every other builder that hosting and the database are outside services to name in data.sharedWith; nothing in M-0012 brings the manifest up to date, so on deploy the reference manifest /build links to leaves out the two services that hold everything", () => {
    const m0012 = record("mandates/M-0012.md");
    expect(m0012).toContain("Vercel, with Neon as the database and Resend for email");
    expect(m0012).toContain("D-0019 §I");
    expect(flat(BUILD_MD)).toContain("Which outside services will it use: hosting, a database, email");
    expect(flat(BUILD_MD)).toContain("each outside service that receives anything about a person");
    expect(render(BuildPage)).toContain("https://github.com/radosukala/ours/blob/main/apps/web/our.one.json");

    const shared = (JSON.parse(read("our.one.json")) as { data: { sharedWith: { who: string }[] } }).data.sharedWith.map((s) => s.who);
    const namesBoth = shared.some((w) => /Vercel/i.test(w)) && shared.some((w) => /Neon/i.test(w));
    const deployUpdatesIt = /our\.one\.json/.test(m0012);
    expect(namesBoth || deployUpdatesIt).toBe(true);
  });

  it("DEFECT (MEDIUM): /build says 'Ten rules, from the common agreement' and the rules block written into every project says 'These rules come from the common agreement', but D-0019 §C says three of them go further than the agreement's words and wait for the founder's approval (§K.1) — /agreement says nothing of session recording, data hubs or a boundary in code — so an agent's own reading is presented as the agreement's", () => {
    // record() drops markdown's asterisks, so D-0019's "(*)" reads "()" here.
    const d19 = record("decisions/D-0019.md");
    expect(d19).toContain("The rules are the common agreement's, put in terms an agent can act on. Three of them go further than the agreement's words");
    expect(d19).toContain("The founder's approval of rules version 0, above all the three marked");
    expect(d19).toContain("the three marked () wait for the founder's approval (§K.1)");
    const agreement = textOf(render(AgreementPage));
    for (const term of [/session record/i, /data hubs?/i, /\bboundary\b/i]) expect(agreement).not.toMatch(term);

    const said = [
      ["/build", textOf(sectionOf(render(BuildPage), "build-rules"))],
      ["the rules block", flat(tool.RULES_BLOCK)],
    ] as const;
    for (const [where, text] of said) {
      if (/\bfrom the common agreement\b/i.test(text)) {
        expect([where, /\bfurther\b|\bbeyond\b|not in the agreement|our\.one's own|\bthree of them\b/i.test(text)]).toEqual([where, true]);
      }
    }
  });

  it("DEFECT (MEDIUM): in a folder inside a larger repository — the case build.md tells agents to handle with --project — init writes .github/workflows/our-one.yml inside that folder, where GitHub never runs a workflow (it reads only the repository's root .github/workflows), and reports it as created; neither init nor build.md says to move it, so 'The check, on every push and pull request' silently never runs", () => {
    expect(flat(BUILD_MD)).toContain("If the project is a folder inside a larger repository, run the tool with `--project <folder>`");
    expect(flat(BUILD_MD)).toContain("| `.github/workflows/our-one.yml` | The check, on every push and pull request |");

    const repo = project({ "apps/fictional/package.json": JSON.stringify({ name: "fictional", license: "MIT" }) });
    const sub = join(repo, "apps/fictional");
    const r = run(sub, ["init"]);
    expect(r.status).toBe(0);

    const runsAtRoot = existsSync(join(repo, ".github/workflows/our-one.yml"));
    const initSays = flat(r.stdout)
      .split(/(?<=[.:])\s+/)
      .some((s) => /workflow/i.test(s) && /\broot\b/i.test(s));
    const text = flat(BUILD_MD);
    const start = text.indexOf("inside a larger repository");
    const paragraph = start === -1 ? "" : text.slice(start, text.indexOf("## 3.", start));
    const buildMdSays = /workflow/i.test(paragraph) && /\broot\b/i.test(paragraph);
    expect(runsAtRoot || initSays || buildMdSays).toBe(true);
  });

  it("DEFECT (MEDIUM): rule 4's 'no session recording', one of the three rules D-0019 marks as going further than the agreement, passes Amplitude's session-replay plugin and PostHog's recording turned on in code, because the tool knows both only as services to name: once they are in data.sharedWith the check reports 'No … session recording … the tool knows', while it does catch Sentry's replay by package and by call", () => {
    // The tool counts Sentry's replay as session recording.
    const sentry = good();
    sentry["package.json"] = JSON.stringify({ name: "fictional-tool", license: "MIT", dependencies: { pg: "8.0.0", resend: "6.0.0", "@sentry/replay": "7.0.0" } });
    expect(check(project(sentry), "tracking").outcome).toBe("fail");

    const files = good();
    files["package.json"] = JSON.stringify({
      name: "fictional-tool",
      license: "MIT",
      dependencies: { pg: "8.0.0", resend: "6.0.0", "@amplitude/analytics-browser": "2.0.0", "@amplitude/plugin-session-replay-browser": "1.0.0", "posthog-js": "1.0.0" },
    });
    files["src/analytics.ts"] = [
      'import * as amplitude from "@amplitude/analytics-browser";',
      'import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";',
      'import posthog from "posthog-js";',
      "amplitude.add(sessionReplayPlugin({ sampleRate: 1 }));",
      'posthog.init("FICTIONAL", { session_recording: { maskAllInputs: false } });',
      "posthog.startSessionRecording();",
      "",
    ].join("\n");
    files["our.one.json"] = manifest({
      sharedWith: [
        RESEND,
        { who: "Amplitude", what: "What each person does on the site.", why: "FICTIONAL product analytics.", packages: ["@amplitude/"] },
        { who: "PostHog", what: "What each person does on the site.", why: "FICTIONAL product analytics.", packages: ["posthog-js"] },
      ],
    });
    const r = report(project(files));
    expect(r.checks.find((c) => c.id === "leave")!.outcome).toBe("pass");

    const tracking = r.checks.find((c) => c.id === "tracking")!;
    const found = JSON.stringify(tracking.findings);
    expect({ outcome: tracking.outcome, amplitude: /amplitude/i.test(found), posthog: /posthog/i.test(found) }).toEqual({
      outcome: "fail",
      amplitude: true,
      posthog: true,
    });
  });

  it("DEFECT (LOW): 'the same check as every project proposed to our.one' (/projects) and 'the same rules as every project proposed to it' (apps/web/AGENTS.md) speak of proposed projects as if there were some; proposals open at launch and none has been made, and 'every' is a claim that needs a source (AGENTS.md §10)", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "");
    expect(proposalsEmail()).toBeNull();
    expect(textOf(render(MaintainersPage))).toContain("Proposals open at launch.");

    const texts: [string, string][] = [
      ["/projects", textOf(render(ProjectsPage))],
      ["apps/web/AGENTS.md", flat(read("AGENTS.md"))],
    ];
    expect(texts.filter(([, t]) => /\bevery project proposed\b/i.test(t)).map(([where]) => where)).toEqual([]);
  });

  it("DEFECT (LOW): build.md tells the agent that init 'overwrites nothing, except the rules block in AGENTS.md … and the stop hook it adds to .claude/settings.json' (the tool's header, SPEC §18.18 and M-0016's acceptance say the same); init also rewrites an existing CLAUDE.md — appends '@AGENTS.md' and trims its end — which none of them names", () => {
    const original = "# FICTIONAL notes\n\nOur own instructions.\n\n\n";
    const dir = project({ "CLAUDE.md": original });
    expect(run(dir, ["init"]).status).toBe(0);
    const changed = readFileSync(join(dir, "CLAUDE.md"), "utf8") !== original;

    // The paragraph that makes the claim, whole.
    const at = BUILD_MD.indexOf("overwrites nothing");
    const claim = at === -1 ? "" : flat(BUILD_MD.slice(BUILD_MD.lastIndexOf("\n\n", at), BUILD_MD.indexOf("\n\n", at)));
    expect(!changed || claim === "" || /CLAUDE\.md/.test(claim)).toBe(true);
  });

  it("DEFECT (LOW): rule 9 says not to present a project 'as approved, listed or protected by our.one', but the claims check knows only the first: a README saying 'protected by our.one' or 'Listed on our.one' passes, while /build says of rule 9 'The check knows the phrases'", () => {
    expect(tool.RULES_BLOCK).toContain("Don't present it as its users' property, or as approved, listed or protected by our.one.");
    const approved = good();
    approved["README.md"] = "# FICTIONAL tool\n\nApproved by our.one.\n";
    expect(check(project(approved), "claims").outcome).toBe("fail");

    const outcomes = ["A FICTIONAL tool, protected by our.one.", "Listed on our.one."].map((phrase) => {
      const files = good();
      files["README.md"] = `# FICTIONAL tool\n\n${phrase}\n`;
      return [phrase, check(project(files), "claims").outcome];
    });
    expect(outcomes).toEqual([
      ["A FICTIONAL tool, protected by our.one.", "fail"],
      ["Listed on our.one.", "fail"],
    ]);
  });

  it("DEFECT (LOW): /build's 'how it is checked' lines drop the limits D-0019 §C gives two of them — rule 1's 'The check reads the imports.' holds only for JavaScript and TypeScript, and rule 9's 'The check knows the phrases.' only for the phrases the tool knows — where the lines for rules 3, 4 and 8 say 'many' and 'the common'", () => {
    const d19 = record("decisions/D-0019.md");
    expect(d19).toContain("CHECKED for JavaScript and TypeScript, by imports");
    expect(d19).toContain("CHECKED for the phrases the tool knows");
    const rules = rulesOnPage();
    expect(rules).toHaveLength(10);
    const line = (start: string) => rules.find((r) => r.title.startsWith(start))?.checked ?? "";

    expect({
      boundary: /JavaScript|TypeScript/.test(line("Keep personal data inside the boundary")),
      claims: /\b(?:common|some|many|it knows|the tool knows)\b/.test(line("Say only what is true")),
    }).toEqual({ boundary: true, claims: true });
  });

  it("DEFECT (LOW): build.md's set-up commands are for a POSIX shell only — 'mkdir -p scripts' and 'curl -fsSL …' fail in Windows PowerShell, where -p is ambiguous (-Path or -PipelineVariable) and, in Windows PowerShell 5.1, curl is Invoke-WebRequest — and build.md says nothing about Windows, though /build names agents (Codex, Cursor) that on Windows may run commands in PowerShell (not measured: no Windows machine here)", () => {
    expect(textOf(render(BuildPage))).toMatch(/\bCodex\b|\bCursor\b|\bClaude Code\b/);
    const posixOnly = /mkdir -p|curl -fsSL/.test(BUILD_MD);
    expect(!posixOnly || /\bWindows\b|PowerShell/.test(BUILD_MD)).toBe(true);
  });

  it("DEFECT (LOW): two of /build's links don't say where they go when read out of their sentence, as a screen reader's list of links reads them — 'source' (the kit's folder on GitHub) and 'our.one.json' (the feed's manifest on GitHub, beside 'The schema of our.one.json') — and both open a new tab; M-0015's rendering round fixed the same on /agreement ('Its project page')", () => {
    const names = [...render(BuildPage).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => textOf(m[1]!));
    expect(names).toContain("The schema of our.one.json");
    expect(names.filter((n) => /^(?:source|our\.one\.json)$/i.test(n))).toEqual([]);
  });

  it("DEFECT (LOW): 'Apache-2.0' and 'SHA-256' break at their hyphens on a phone — Chrome at 320px sets 'the Apache-' / '2.0 licence.', and at 414px 'Its SHA-' / '256:' (next start, light and dark; both whole at 375px) — where the site keeps such a name whole with .nowrap, as M-0015's round did for 'not-for-profit'", () => {
    const html = render(BuildPage);
    const loose = ["Apache-2.0", "SHA-256"].map((word) => {
      const plain = html.split(word).length - 1;
      const kept = html.split(new RegExp(`<span class="[^"]*nowrap[^"]*">${word.replace(/[.-]/g, "\\$&")}</span>`)).length - 1;
      return [word, plain - kept];
    });
    expect(loose).toEqual([
      ["Apache-2.0", 0],
      ["SHA-256", 0],
    ]);
  });

  it("DEFECT (LOW): /build says the kit is 'written for coding agents that can read a web page and run commands, such as Claude Code, Codex and Cursor' — a claim about two other companies' products with no source, and no receipt shows the kit tried with either (M-0016's hypothesis is open, and its verification's agent trial has not run)", () => {
    expect(record("mandates/M-0016.yaml")).toContain("A coding agent given only the line on /build can set a project up and reach a passing check without other help.");
    const text = textOf(render(BuildPage));
    const receipts = walk(join(ROOT, "receipts"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const unsourced = ["Codex", "Cursor"].filter((name) => new RegExp(`\\b${name}\\b`).test(text) && !new RegExp(`\\b${name}\\b`).test(receipts));
    expect(unsourced).toEqual([]);
  });

  it("DEFECT (LOW): /build's 'Today:' line says 'Proposals and needs open at launch' whatever PROPOSALS_EMAIL says; with an address set — as M-0012 requires before the deploy — /maintainers takes proposals and /agreement says 'Today: proposals are read by hand.', while /build still says they open at launch (M-0015's round fixed the same on /agreement)", () => {
    expect(record("mandates/M-0012.md")).toContain("Where proposals go: choose the address and set PROPOSALS_EMAIL");
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    expect(proposalsEmail()).toBe("proposals@example.test");
    expect(render(MaintainersPage)).toContain("mailto:proposals@example.test");
    expect(textOf(render(AgreementPage))).toContain("Today: proposals are read by hand.");

    expect(textOf(render(BuildPage))).not.toContain("Proposals and needs open at launch");
  });

  it("DEFECT (LOW): kit/README.md, in the public repository, gives the one line for an agent and says the files are 'Served at' /build.md and /kit/…, with no status; nothing is deployed (M-0016; M-0012 is a draft), so today the line points at a page our.one doesn't serve, and AGENTS.md §6 asks every public statement to carry its state, as apps/web's own package says 'nothing is deployed'", () => {
    expect(record("mandates/M-0016.md")).toContain("Nothing is deployed.");
    expect(record("mandates/M-0012.md")).toContain("Status: DRAFT");
    expect(read("package.json")).toContain("nothing is deployed");
    const readme = kitText("README.md");
    if (/Served at|https:\/\/our\.one\/build\.md/.test(readme)) {
      expect(readme).toMatch(/\bnot (?:yet )?deployed\b|\bonce our\.one is deployed\b|\bisn't deployed\b|\buntil\b[^.]*\bdeploy/i);
    }
  });
});

/* -------------------------------------------------------------- closed */

describe("closed (each passes on a92bbb5)", () => {
  it("closed: the served files — /build.md, /kit/our-one.mjs and /kit/our.one.schema.json are kit/'s bytes, prerendered, with their content types, and nothing else under /kit is served (next start on a production build of a92bbb5: 200 with text/markdown, text/javascript and application/schema+json, byte-identical to kit/ at 8,352, 71,470 and 4,335 bytes, the tool's SHA-256 ab12bc2e…0a7fa7 as build.md and /build give it; /kit/README.md, /kit/LICENSE, /kit/build.md, /kit/x, /kit/OUR-ONE.MJS, /kit/../package.json, /kit/%2e%2e%2fpackage.json and /kit each 404; `next build` lists /build.md as static and the two files as SSG; Chrome shows all three as text, no download)", async () => {
    expect([buildMdDynamic, kitDynamic, kitDynamicParams]).toEqual(["force-static", "force-static", false]);
    expect(generateStaticParams()).toEqual([{ file: "our-one.mjs" }, { file: "our.one.schema.json" }]);
    const md = getBuildMd();
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(Buffer.from(await md.arrayBuffer()).equals(readFileSync(join(KIT_DIR, "build.md")))).toBe(true);
    for (const name of ["our-one.mjs", "our.one.schema.json"] as const) {
      const res = await getKitFile(new Request(`http://localhost/kit/${name}`), { params: Promise.resolve({ file: name }) });
      expect(res.headers.get("content-type")).toBe(KIT_FILES[name]);
      expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(join(KIT_DIR, name)))).toBe(true);
    }
    for (const name of ["README.md", "LICENSE", "build.md", "OUR-ONE.MJS", "../package.json"]) {
      await expect(getKitFile(new Request("http://localhost/kit/x"), { params: Promise.resolve({ file: name }) })).rejects.toThrow();
    }
    const sha = createHash("sha256").update(readFileSync(TOOL)).digest("hex");
    expect(KIT_TOOL.sha256).toBe(sha);
    expect(BUILD_MD).toContain(sha);
    expect(render(BuildPage)).toContain(sha);
  });

  it("closed: /build's structure — inside the public layout, one h1, an outline h1 → h2 → h3 that never skips a level, every section labelled by its own heading, one header, one main#main, one footer and one navigation 'About our.one' (the same outline in Chrome on next start at 320, 375 and 1280px)", () => {
    const html = renderToStaticMarkup(createElement(PublicLayout, null, createElement(BuildPage)));
    const headings = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => `${m[1]} ${textOf(m[2]!)}`);
    expect(headings).toEqual([
      "h1 Build on our.one",
      "h2 Two ways to build",
      "h3 On your own",
      "h3 On our.one",
      "h2 Start with your coding agent",
      "h2 What your agent does",
      "h2 The rules",
      "h2 What the check can tell, and what it can't",
      "h2 Then propose it",
      "h2 The tools",
    ]);
    const levels = headings.map((h) => Number(h[1]));
    expect(levels.every((l, i) => i === 0 || l <= levels[i - 1]! + 1)).toBe(true);
    for (const m of html.matchAll(/<section aria-labelledby="([a-z-]+)"><(h[23]) id="([a-z-]+)"/g)) expect(m[1]).toBe(m[3]);
    expect(html.match(/<section\b/g)).toHaveLength(7);
    expect(html.match(/<section aria-labelledby=/g)).toHaveLength(7);
    expect([html.match(/<header\b/g)?.length, html.match(/<main id="main"/g)?.length, html.match(/<footer\b/g)?.length]).toEqual([1, 1, 1]);
    expect([...html.matchAll(/<nav\b[^>]*\baria-label="([^"]+)"/g)].map((m) => m[1])).toEqual(["About our.one"]);
  });

  it("closed: layout — no sideways scroll and nothing past the window's edge at 320, 375 or 1280px, light or dark; the agent line wraps inside its box (3 lines at 320px, 2 at 375 and 1280px) and the SHA-256 breaks anywhere (3 lines at 320px, 2 at 375 and 1280px); the two ways stack below 640px and stand side by side, 294px each, at 1280px (Chrome on next start, measured over the DevTools protocol; the same at 320px on /projects and /maintainers)", () => {
    const css = read("src/components/public/public.module.css");
    expect(cssRule(css, ".prompt code")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(cssRule(css, ".prompt code")).toMatch(/user-select:\s*all/);
    expect(cssRule(css, ".hash")).toMatch(/word-break:\s*break-all/);
    expect(cssRule(css, ".way")).toMatch(/min-width:\s*0/);
    expect(flat(css)).toContain("@media (min-width: 640px) { .ways { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }");
    const html = render(BuildPage);
    expect(html).toMatch(/<p class="[^"]*prompt[^"]*"><code>Read https:\/\/our\.one\/build\.md and use it to build my app for our\.one\.<\/code><\/p>/);
    expect(html).toMatch(new RegExp(`<code class="[^"]*hash[^"]*">${KIT_TOOL.sha256}</code>`));
  });

  it("closed: contrast — every new class's text against its own background meets WCAG 1.4.3 in both themes (from globals.css, as Chrome measured it: text 18.51:1 light and 17.24:1 dark; the agent line on its tint 17.52:1 and 14.59:1; the muted 'Today:' and rules lines, 14px, 6.12:1 and 4.58:1). The boxes' borders (1.12:1 light, 1.65:1 dark) and the prompt's tint (1.06:1, 1.18:1) are decorative — each box is named by its own heading or holds its own text — so 1.4.11 asks nothing of them", () => {
    const css = read("src/app/globals.css");
    const vars = (block: string) =>
      Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
    const lightStart = css.indexOf(":root {");
    const light = vars(css.slice(lightStart, css.indexOf("}", lightStart)));
    const darkAt = css.indexOf(":root {", css.indexOf("@media (prefers-color-scheme: dark)"));
    const dark = vars(css.slice(darkAt, css.indexOf("}", darkAt)));
    const lum = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
    };
    const measured = [light, dark].map((t) => [ratio(t.text!, t.bg!), ratio(t.text!, t.hover!), ratio(t.muted!, t.bg!)]);
    expect(measured).toEqual([
      [18.51, 17.52, 6.12],
      [17.24, 14.59, 4.58],
    ]);
    for (const row of measured) for (const r of row) expect(r).toBeGreaterThanOrEqual(4.5);
    const pub = read("src/components/public/public.module.css");
    expect(cssRule(pub, ".heldBy")).toMatch(/color:\s*var\(--muted\)/);
    expect(cssRule(pub, ".way")).toMatch(/border:\s*1px solid var\(--border\)/);
    expect([ratio(light.border!, light.bg!), ratio(dark.border!, dark.bg!)]).toEqual([1.12, 1.65]);
  });

  it("closed: links and touch — the two links outside the tools list sit inside sentences (WCAG 2.5.8's inline exception), and the tools list's five, one to an item, are 35px or more apart (Chrome at 375px with a coarse pointer: 17–18px tall, so 24px circles centred on them never meet, 2.5.8's spacing exception); each internal link goes to a route the app has, and the two that leave the site open a new tab with rel=\"noopener noreferrer\"; /projects' two new paired links are 46.5px tall on a touch screen", () => {
    const html = render(BuildPage);
    const tools = sectionOf(html, "build-tools");
    const items = [...tools.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(items).toHaveLength(5);
    for (const li of items) expect(li.match(/<a\b/g)).toHaveLength(1);
    for (const m of html.replace(tools, "").matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const link = /<a\b[^>]*>([\s\S]*?)<\/a>/.exec(m[1]!);
      if (link) expect(textOf(m[1]!).length, textOf(link[1]!)).toBeGreaterThan(textOf(link[1]!).length + 20);
    }
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(anchors.length).toBe(7);
    for (const m of anchors) {
      const attrs = m[1]!;
      const href = /href="([^"]+)"/.exec(attrs)![1]!;
      if (href.startsWith("https://")) {
        expect(attrs).toContain('target="_blank"');
        expect(attrs).toContain('rel="noopener noreferrer"');
        expect(href.startsWith("https://github.com/radosukala/ours/")).toBe(true);
      } else {
        const route: Record<string, string> = {
          "/agreement": "src/app/(public)/agreement/page.tsx",
          "/maintainers": "src/app/(public)/maintainers/page.tsx",
          "/build.md": "src/app/build.md/route.ts",
          "/kit/our-one.mjs": "src/app/kit/[file]/route.ts",
          "/kit/our.one.schema.json": "src/app/kit/[file]/route.ts",
        };
        expect(route[href], href).toBeDefined();
        expect(existsSync(join(WEB, route[href]!)), href).toBe(true);
      }
    }
    expect(read("src/app/(public)/projects/page.tsx")).toContain('<Link href="/build" className={styles.pairLink}>');
  });

  it("closed: the tool's other claims about itself — nothing in it needs more than Node 18 (no API added after it: toSorted, groupBy, withResolvers, fromAsync, import.meta.dirname, globSync, RegExp.escape, Set methods, import attributes; the regular expressions use no v flag), and it still makes no network request and runs git only to list files and read the remote's address (tests/kit.test.ts holds both; whether a Node 18 binary runs it was not tried: none on this machine)", () => {
    const src = readFileSync(TOOL, "utf8");
    const newer = [
      /\.to(?:Sorted|Reversed|Spliced)\(/,
      /\b(?:Object|Map)\.groupBy\b/,
      /Promise\.withResolvers/,
      /Array\.fromAsync/,
      /import\.meta\.(?:dirname|filename)/,
      /\bglobSync\b/,
      /RegExp\.escape/,
      /Error\.isError/,
      /\.isWellFormed\(/,
      /\.(?:union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/,
      /process\.getBuiltinModule/,
      /\bwith\s*\{\s*type\s*:/,
      /\/[dgimsuy]*v[dgimsuy]*\.(?:test|exec)\(/,
    ];
    expect(newer.filter((re) => re.test(src)).map(String)).toEqual([]);
    expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(?:http|https|net|tls|dgram|dns)\b/);
    expect([...src.matchAll(/execFileSync\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["git", "git"]);
  });

  it("closed: 'when it finds a secret it prints where, never the secret' — a FICTIONAL GitHub token, Slack token, private key and database address with a password, each found and named by file, line and kind, appear in none of check, --json and --hook; and a bare key in an our.one.json that doesn't parse is never printed whole (V8's parse error shows 10 characters either side of the error, so at most the key's first 10, prefix included — measured with Node 25)", () => {
    const secrets: [string, string, string][] = [
      ["ghp_" + "FICTIONAL".padEnd(36, "0"), "a GitHub token", 'export const t = "SECRET";\n'],
      [["xoxb", "FICTIONAL0123456789"].join("-"), "a Slack token", 'export const t = "SECRET";\n'],
      [["-----BEGIN", "PRIVATE KEY-----\nFICTIONALKEYBODY0123456789\n-----END", "PRIVATE KEY-----"].join(" "), "a private key", "SECRET\n"],
      [["postgres://fictional:", "pw-FICTIONAL-0123", "@db.example.com:5432/app"].join(""), "a database address with a password", 'export const u = "SECRET";\n'],
    ];
    for (const [secret, kind, template] of secrets) {
      const dir = project({ ...good(), "src/config.ts": template.replace("SECRET", secret) });
      const c = check(dir, "secrets");
      expect(c.findings.map((f) => [f.file, f.line, f.message]), kind).toEqual([["src/config.ts", 1, `src/config.ts holds what looks like ${kind}.`]]);
      const outs = [run(dir, ["check"]), run(dir, ["check", "--json"]), run(dir, ["check", "--hook"], '{"stop_hook_active":false}')];
      const body = secret.includes("KEYBODY") ? "FICTIONALKEYBODY0123456789" : secret;
      for (const o of outs) expect(`${o.stdout}${o.stderr}`, kind).not.toContain(body);
    }
    const bare = ["sk", "live", "FICTIONALQRSTUVWXYZ0123456789"].join("_");
    const dir = project({ ...good(), "our.one.json": `{\n  "rules": "0",\n  "note": ${bare}\n}\n` });
    for (const o of [run(dir, ["check"]), run(dir, ["check", "--json"]), run(dir, ["check", "--hook"], '{"stop_hook_active":false}')]) {
      expect(`${o.stdout}${o.stderr}`).not.toContain(bare);
      expect(`${o.stdout}${o.stderr}`).not.toContain(bare.slice(0, 11));
    }
  });

  it("closed: the CI workflow init writes runs the check on every push and pull request, with read-only permissions, and fails when a rule fails (the check exits 1 when not ready); its actions are actions/checkout@v6 and actions/setup-node@v6 with Node 22 (whether those two tags exist could not be checked here: no network beyond localhost)", () => {
    const dir = project({ "package.json": JSON.stringify({ name: "fictional", license: "MIT" }) });
    expect(run(dir, ["init"]).status).toBe(0);
    const wf = readFileSync(join(dir, ".github/workflows/our-one.yml"), "utf8");
    expect(wf).toMatch(/^on:\n {2}push:\n {2}pull_request:\n/m);
    expect(wf).toContain("permissions:\n  contents: read\n");
    expect(wf).toContain("      - uses: actions/checkout@v6\n      - uses: actions/setup-node@v6\n        with:\n          node-version: 22\n      - run: node scripts/our-one.mjs check\n");
    expect(run(dir, ["check"]).status).toBe(1);
  });

  it("closed: the stop hook as /build and build.md describe it — silent and exit 0 when the project is ready; exit 2 with what fails on stderr the first time; then exit 0 with a systemMessage for the person while stop_hook_active is true, which is what Claude Code's own guidance for Stop hooks asks ('check stop_hook_active in the input and return success while it's true', in the 2.1.185 binary on this machine)", () => {
    expect(run(project(good()), ["check", "--hook"], '{"stop_hook_active":false}')).toEqual({ status: 0, stdout: "", stderr: "" });
    const files = good();
    delete files.LICENSE;
    const dir = project(files);
    const first = run(dir, ["check", "--hook"], '{"stop_hook_active":false}');
    expect([first.status, first.stdout]).toEqual([2, ""]);
    expect(first.stderr).toContain("- licence: There is no licence file");
    const then = run(dir, ["check", "--hook"], '{"stop_hook_active":true}');
    expect(then.status).toBe(0);
    expect((JSON.parse(then.stdout) as { systemMessage: string }).systemMessage).toContain("our.one check still fails: licence.");
  });

  it("closed: the feed's our.one.json against its code — its fourteen kinds of data cover the schema's twenty-one tables (seat_state holds no one's data); no file outside src/core and scripts imports a database client or runs a query (pages and actions hand getDb to src/core); the only outside service in the code is Resend: no other dependency the tool knows, no tracker, no fetch, no next/font/google and no script from another site", () => {
    const m = JSON.parse(read("our.one.json")) as { data: { collects: { what: string }[]; sharedWith: { who: string; packages: string[] }[]; boundary: string[] } };
    const kinds = m.data.collects.map((c) => c.what.split(":")[0]!);
    const tables = [...read("src/core/schema.ts").matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((x) => x[1]!);
    const kindOf: Record<string, string | null> = {
      accounts: "Your account",
      invites: "Invites",
      email_tokens: "Sign-in and join links",
      pending_joins: "Joining in progress",
      sessions: "Sessions",
      friend_requests: "Connections",
      friendships: "Connections",
      follows: "Connections",
      blocks: "Connections",
      mutes: "Connections",
      posts: "Posts, replies and likes",
      replies: "Posts, replies and likes",
      likes: "Posts, replies and likes",
      reports: "Reports",
      notifications: "Notifications",
      rate_events: "Limits on repeated actions",
      outbox: "Test outbox",
      mail_log: "Email records",
      digest_deliveries: "Weekly email record",
      seat_state: null,
      waitlist: "Seat requests",
    };
    expect(tables.sort()).toEqual(Object.keys(kindOf).sort());
    expect(new Set(Object.values(kindOf).filter((k): k is string => k !== null))).toEqual(new Set(kinds));
    expect(m.data.boundary).toEqual(["src/core", "scripts"]);

    const outside = walk(join(WEB, "src")).filter((f) => /\.(?:ts|tsx)$/.test(f) && !f.startsWith(join(WEB, "src/core")));
    for (const f of outside) {
      const text = readFileSync(f, "utf8");
      const stores = tool.importsOf(text).filter((i) => tool.STORES.some((s) => (s.endsWith("/") ? i.spec.startsWith(s) : i.spec === s || i.spec.startsWith(`${s}/`))));
      expect(stores, f).toEqual([]);
      expect(text, f).not.toMatch(/\b(?:db|tx|getDb\(\))\.(?:select|insert|update|delete|execute|transaction|query)\b/);
      expect(text, f).not.toMatch(/\bfetch\s*\(|next\/font\/google|<script[^>]+src="https?:/);
    }
    const deps = Object.keys((JSON.parse(read("package.json")) as { dependencies: Record<string, string> }).dependencies);
    const known = deps.filter((d) => tool.SERVICES.some((s) => s.packages.some((p) => (p.endsWith("/") ? d.startsWith(p) : d === p))));
    expect(known).toEqual(["resend"]);
    expect(deps.filter((d) => tool.TRACKING.some((t) => (t.packages ?? []).some((p) => (p.endsWith("/") ? d.startsWith(p) : d === p))))).toEqual([]);
    expect(m.data.sharedWith.map((s) => [s.who, s.packages])).toEqual([["Resend", ["resend"]]]);
  });

  it("closed: 'It passes' is true — the feed passes the check run as apps/web/AGENTS.md says, `node kit/our-one.mjs check --project apps/web` from the repository's root: READY TO PROPOSE, no check skipped, exit 0", () => {
    expect(flat(read("AGENTS.md"))).toContain("node kit/our-one.mjs check --project apps/web");
    const r = spawnSync(process.execPath, ["kit/our-one.mjs", "check", "--project", "apps/web"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("RESULT: READY TO PROPOSE.");
    expect(r.stdout).not.toContain("[ n/a  ]");
    expect(r.stdout).not.toContain("[ FAIL ]");
  });

  it("closed: no income promised, no ownership claimed, no 'first' or 'only' against the world, no safeguard told as built, no form, and passing never called approval — in /build, /maintainers' and /projects' new lines, build.md, the README, the rules block and the tool's printed report", () => {
    const report = run(project(good()), ["check"]).stdout;
    const texts: [string, string][] = [
      ["/build", textOf(render(BuildPage))],
      ["build.md", flat(BUILD_MD)],
      ["README", flat(kitText("README.md"))],
      ["the rules block", flat(tool.RULES_BLOCK)],
      ["the report", flat(report)],
    ];
    for (const [where, text] of texts) {
      expect(text, where).not.toMatch(/\bearn(?:s|ing)? a living\b|\bincome\b|\bguarantee/i);
      expect(text, where).not.toMatch(/\b(?:users?|members?|people)[- ]owned\b|\bowned by (?:its|the|our) (?:users|members|people)\b/i);
      expect(text, where).not.toMatch(/\b(?:certified|endorsed)\b/i);
      expect(text, where).not.toMatch(/\bthe (?:first|only) (?:platform|network|social network|app|place|system|company|institution|one)\b|\b(?:first|only) (?:ever|in the world)\b/i);
      for (const s of text.split(/(?<=[.!?])\s+/)) {
        if (/\bbuilt\b/i.test(s) && /safeguard|no keys|record of every|log of every|custody/i.test(s)) expect(s, where).toMatch(/\bnot\b|n't\b|\byet\b|\bnone\b/i);
        if (/\bthe first project\b/i.test(s)) expect(s, where).toMatch(/\bfeed\b/i);
        if (/\bpass(?:es|ing)?\b/i.test(s) && /\b(?:approved|listed|protected)\b/i.test(s)) expect(s, where).toMatch(/\bisn't\b|\bdoesn't\b|\bnot\b|\bnever\b|\bDon't\b/i);
      }
    }
    expect(render(BuildPage)).not.toMatch(/<(?:form|input|button|textarea|select)\b/);
    expect(textOf(render(MaintainersPage))).toContain("Start with your coding agent: Build on our.one has the line to give it, the rules it follows and the check it runs.");
  });

  it("closed: D-0019, M-0016 and the M-0012 amendment describe what was built — the ten checks in D-0019 §C's order with its classes, the four questions for a person and the five safeguards not built, in every printed report and in --json; M-0012.md's tenth precondition and its YAML's two new lines say the same thing, D-0019 is among its prerequisites, and the build commits touched only kit/, apps/web/ and receipts/, M-0016's allowed paths (git show --stat 6925b1e 576df0a a92bbb5)", () => {
    const r = report(project(good()));
    expect(r.checks.map((c) => `${c.id} ${c.class}`)).toEqual([
      "manifest STRUCTURAL",
      "licence CHECKED",
      "agents CHECKED",
      "data STRUCTURAL",
      "boundary CHECKED",
      "leave CHECKED",
      "tracking CHECKED",
      "secrets CHECKED",
      "costs CHECKED",
      "claims CHECKED",
    ]);
    expect([r.forAPerson.length, r.notBuilt.map((s) => s.split(":")[0])]).toEqual([4, ["No keys", "Reach", "Leave", "The record", "Custody"]]);
    expect(record("decisions/D-0019.md")).toContain("These are D-0018 §A's safeguards: no keys, reach and leave at runtime, the record, and custody.");
    const m12 = record("mandates/M-0012.md");
    expect(m12).toContain("10. The build kit: approve rules version 0 and the exact wording of /build and build.md (D-0019 §I).");
    const yaml = readFileSync(join(ROOT, "mandates/M-0012.yaml"), "utf8");
    expect(yaml).toContain("- the founder approves rules version 0 and the exact wording of /build and build.md (D-0019 §I)");
    expect(yaml).toMatch(/prerequisite_decisions: \[[^\]]*\bD-0019\b[^\]]*\]/);
    expect(readFileSync(join(ROOT, "mandates/M-0016.yaml"), "utf8")).toMatch(/allow:\n\s+- kit\/\*\*\n\s+- apps\/web\/\*\*\n\s+- receipts\/builds\/\*\*\n\s+- receipts\/conformance\/\*\*/);
  });
});
