#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compile, summarise } from "@ours/kernel";
import { buildBundle, verifyBundle } from "@ours/verifier";
import type { CompileResult, Finding } from "@ours/schemas";

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

async function main(): Promise<number> {
  const [command = "check", ...rest] = process.argv.slice(2);
  const root = process.env["OURS_ROOT"] ?? process.cwd();

  if (command === "check") {
    const mandateId = rest.find((a) => !a.startsWith("--")) ?? "M-0000";
    const changedPaths = rest.includes("--changed") ? await workingTreePaths(root) : [];
    const result = await compile({ root, mandateId, changedPaths });
    report(result, mandateId);
    if (changedPaths.length > 0) {
      console.log(`  Scope evaluated against ${changedPaths.length} changed path(s).\n`);
    }
    // Only execution authority exits 0. A draft is not an error in the
    // record, but a process gating on this code must not proceed on it.
    return summarise(result).execution === "AUTHORISED_FOR_EXECUTION" ? 0 : 1;
  }

  if (command === "export") {
    const mandateId = rest[0] ?? "M-0000";
    const out = rest[1] ?? path.join("exit", `bundle-${mandateId}.json`);
    const bundle = await buildBundle(root, mandateId);
    if (bundle === null) {
      console.error(`Cannot export ${mandateId}: its records did not resolve.`);
      return 1;
    }
    await writeFile(path.join(root, out), JSON.stringify(bundle, null, 2) + "\n", "utf8");
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
    const raw = await readFile(path.isAbsolute(file) ? file : path.join(root, file), "utf8");
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
      "  ours check  [mandate-id]           validate an authority chain",
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
