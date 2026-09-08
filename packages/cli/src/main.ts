#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { stringify } from "yaml";
import { admit, compile, digestOfFile, loadAuthority, summarise } from "@ours/kernel";
import { buildBundle, verifyBundle } from "@ours/verifier";
import type { Charter, CompileResult, Finding, Pin } from "@ours/schemas";

/**
 * The command line.
 *
 * The output is written for someone who does not know this codebase and does
 * not intend to learn it. A refusal that only a maintainer can interpret has
 * failed at the thing the whole project claims to do.
 */

const MARK: Record<Finding["outcome"], string> = {
  PASS: "  ok  ",
  REFUSED: "REFUSED",
  NOT_MACHINE_DECIDABLE: " open ",
};

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length > 0 && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line.length === 0 ? word : `${line} ${word}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

function report(result: CompileResult, mandateId: string): void {
  const s = summarise(result);
  console.log("");
  console.log(`  OURS Kernel 0.1 — authority check for ${mandateId}`);
  console.log("  " + "-".repeat(66));

  for (const f of result.findings) {
    console.log(`  [${MARK[f.outcome]}] ${f.rule}  (${f.enforcement})`);
    console.log(wrap(f.message, 64, "           "));
    console.log("");
  }

  console.log("  " + "-".repeat(66));
  console.log(`  ENFORCED   ${s.enforced.passed} passed, ${s.enforced.refused} refused`);
  console.log(`  CHECKED    ${s.checked.passed} passed, ${s.checked.refused} refused`);
  console.log(`  OPEN       ${s.notMachineDecidable} article(s) no machine can decide`);
  console.log("");
  console.log(
    wrap(
      "There is no combined total on purpose. What was verified is the decidable subset of the " +
        "constitution; the open articles are the size of the gap between what is written and what " +
        "was checked. A single number would hide it.",
      64,
      "  ",
    ),
  );
  console.log("");
  // Three lines and never a bare AUTHORISED. A well-formed draft used to
  // print the same word as an adopted mandate, and an agent gating on that
  // word could not tell that it held no authority to act.
  if (s.execution === "AUTHORISED_FOR_EXECUTION") {
    console.log("  RESULT: AUTHORISED FOR EXECUTION");
  } else if (s.execution === "VALID_AS_DRAFT") {
    console.log("  RESULT: VALID AS A DRAFT — not authorised for execution");
    for (const reason of s.waitingOn) console.log(wrap(reason, 64, "          "));
  } else {
    console.log("  RESULT: REFUSED");
  }
  console.log("");
}

/**
 * What the working tree has actually changed.
 *
 * Kept here rather than in the kernel, which stays pure and touches nothing.
 * Git is read for tracked modifications and for untracked files, because a
 * new file written outside a mandate's scope is the exact case that went
 * unnoticed under M-0001 — and `git diff` alone does not report it.
 */
async function workingTreePaths(root: string): Promise<string[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const collect = async (args: string[]): Promise<string[]> => {
    try {
      const { stdout } = await run("git", args, { cwd: root });
      return stdout.split("\n").filter((line) => line.trim().length > 0);
    } catch {
      return [];
    }
  };
  const [tracked, untracked] = await Promise.all([
    collect(["diff", "--name-only", "HEAD"]),
    collect(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...tracked, ...untracked])];
}

/** Every Markdown file under a root, relative to it — a community's public text. */
async function markdownUnder(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) out.push(path.relative(root, full));
    }
  };
  await walk(root);
  return out.sort();
}

/** The value after a flag, or undefined. */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Positional arguments: everything that is not a flag or a flag's value. */
function positionals(args: string[], valued: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string;
    if (a.startsWith("--")) {
      if (valued.includes(a)) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

/**
 * Sample records say so on every surface. A fictional community's chain
 * can validate exactly like a real one — that is the point of a fixture —
 * and the one thing the report must never let a reader forget is that
 * nobody in it exists.
 */
async function fictionalBanner(root: string): Promise<void> {
  const authority = await loadAuthority(root);
  if (authority.ok && authority.record.schema === "ours.charter/v0.1" && authority.record.fictional) {
    console.log("");
    console.log(`  FICTIONAL COMMUNITY — ${authority.record.cell}: sample records, labelled as such. Nobody here exists.`);
  }
}

async function main(): Promise<number> {
  const [command = "check", ...rest] = process.argv.slice(2);
  const repoRoot = process.env["OURS_ROOT"] ?? process.cwd();

  if (command === "check") {
    const rootArg = flagValue(rest, "--root");
    const root = rootArg !== undefined ? path.resolve(repoRoot, rootArg) : repoRoot;
    const sourceArg = flagValue(rest, "--source");
    const mandateId = positionals(rest, ["--root", "--source"])[0] ?? "M-0000";
    const changedPaths = rest.includes("--changed") ? await workingTreePaths(repoRoot) : [];
    // A community root's human sources are its public text; scan them, so
    // that the prohibited-claim check runs on the command a reader would run.
    const publicTextPaths = rootArg !== undefined ? await markdownUnder(root) : [];
    const result = await compile({
      root,
      mandateId,
      changedPaths,
      publicTextPaths,
      ...(sourceArg !== undefined ? { contractSourceDir: path.resolve(repoRoot, sourceArg) } : {}),
    });
    await fictionalBanner(root);
    if (rootArg !== undefined) console.log(`  Root: ${path.relative(repoRoot, root) || "."}`);
    report(result, mandateId);
    if (changedPaths.length > 0) {
      console.log(`  Scope evaluated against ${changedPaths.length} changed path(s).\n`);
    }
    // Only execution authority exits 0. A draft is not an error in the
    // record, but a process gating on this code must not proceed on it.
    return summarise(result).execution === "AUTHORISED_FOR_EXECUTION" ? 0 : 1;
  }

  if (command === "admit") {
    const [rootArg, toolId] = positionals(rest, ["--source"]);
    if (rootArg === undefined || toolId === undefined) {
      console.error("Usage: ours admit <community-root> <tool-id> [--source <dir>]");
      return 2;
    }
    const root = path.resolve(repoRoot, rootArg);
    const sourceArg = flagValue(rest, "--source");
    const result = await admit({
      root,
      toolId,
      ...(sourceArg !== undefined ? { sourceDir: path.resolve(repoRoot, sourceArg) } : {}),
    });
    await fictionalBanner(root);
    console.log("");
    console.log(`  OURS Kernel 0.1 — the gate for ${toolId} in ${path.relative(repoRoot, root) || "."}`);
    console.log("  " + "-".repeat(66));
    for (const f of result.findings) {
      console.log(`  [${MARK[f.outcome]}] ${f.rule}  (${f.enforcement})`);
      console.log(wrap(f.message, 64, "           "));
      console.log("");
    }
    console.log("  " + "-".repeat(66));
    console.log(
      result.authorized
        ? "  RESULT: PASSES THE GATE — eligible to be offered; the community decides its use"
        : "  RESULT: REFUSED AT THE GATE",
    );
    if (sourceArg === undefined) {
      console.log(wrap("No --source was given, so the implementation's contract was not checked. Passing the gate without it says nothing about code.", 64, "  "));
    }
    console.log("");
    return result.authorized ? 0 : 1;
  }

  if (command === "pin") {
    const [rootArg, ...files] = positionals(rest, ["--by"]);
    const by = flagValue(rest, "--by");
    if (rootArg === undefined || by === undefined || files.length === 0) {
      console.error("Usage: ours pin <community-root> --by <decision-id> <file> [<file>...]   (paths relative to the root)");
      return 2;
    }
    const root = path.resolve(repoRoot, rootArg);
    const authority = await loadAuthority(root);
    if (!authority.ok || authority.record.schema !== "ours.charter/v0.1") {
      console.error(`${rootArg} is not a community root: no charter at authority/CHARTER.yaml.`);
      return 1;
    }
    const charter: Charter = authority.record;
    const entries: Pin["files"] = [];
    for (const rel of files) {
      const digest = await digestOfFile(root, rel);
      if (digest === null) {
        console.error(`Cannot pin ${rel}: no such file under ${rootArg}.`);
        return 1;
      }
      entries.push({ path: rel, digest });
    }
    const pin: Pin = {
      schema: "ours.pin/v0.1",
      cell: charter.cell,
      pinned_by: by,
      pinned_at: new Date().toISOString().slice(0, 10),
      files: entries,
      ...(charter.fictional ? { fictional: true } : {}),
    };
    const header =
      `# The pin — the approved files and their digests, and the decision that approved them.\n` +
      `# A change to any file below without an amending decision is a refusal at the gate (S-PIN).\n` +
      (charter.fictional ? `# FICTIONAL COMMUNITY — sample records. Nobody here exists.\n` : "");
    await writeFile(path.join(root, "PIN.yaml"), header + stringify(pin), "utf8");
    await fictionalBanner(root);
    console.log(`Pinned ${entries.length} file(s) in ${rootArg} by ${by}. Verify with:  pnpm ours admit ${rootArg} <tool-id>`);
    return 0;
  }

  if (command === "export") {
    const rootArg = flagValue(rest, "--root");
    const root = rootArg !== undefined ? path.resolve(repoRoot, rootArg) : repoRoot;
    const [mandateId = "M-0000", outArg] = positionals(rest, ["--root"]);
    const out = outArg ?? path.join("exit", `bundle-${mandateId}.json`);
    const bundle = await buildBundle(root, mandateId);
    if (bundle === null) {
      console.error(`Cannot export ${mandateId}: its records did not resolve.`);
      return 1;
    }
    await writeFile(path.join(repoRoot, out), JSON.stringify(bundle, null, 2) + "\n", "utf8");
    await fictionalBanner(root);
    console.log(`Wrote ${out} — ${bundle.sources.length} source(s) embedded.`);
    console.log("Verify it with:  pnpm ours verify " + out);
    return 0;
  }

  if (command === "verify") {
    const file = rest[0];
    if (file === undefined) {
      console.error("Usage: ours verify <bundle.json>");
      return 2;
    }
    const raw = await readFile(path.isAbsolute(file) ? file : path.join(repoRoot, file), "utf8");
    const outcome = verifyBundle(JSON.parse(raw));
    for (const line of outcome.lines) console.log("  " + line);
    console.log("");
    console.log(outcome.ok ? "  BUNDLE VERIFIES" : "  BUNDLE FAILED VERIFICATION");
    console.log("");
    return outcome.ok ? 0 : 1;
  }

  console.error(
    [
      "OURS Kernel 0.1",
      "",
      "  ours check  [mandate-id] [--changed] [--root <community-root>] [--source <dir>]",
      "                                     validate an authority chain — the institution's, or a community's",
      "  ours admit  <community-root> <tool-id> [--source <dir>]",
      "                                     the gate for a service specification, and its implementation",
      "  ours pin    <community-root> --by <decision-id> <file>...",
      "                                     record the approved files' digests",
      "  ours export [mandate-id] [out]     write a self-contained proof bundle",
      "  ours verify <bundle.json>          verify a bundle with no repository",
      "",
    ].join("\n"),
  );
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
