import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CompileResult, Finding, SourceRef } from "@ours/schemas";
import { digestOfFile } from "./digest.ts";
import { loadAuthority, loadDecision, loadMandate } from "./registry.ts";
import { ADOPTION_RULE, PREREQUISITE_RULE, runChecks } from "./rules.ts";
import type { PrerequisiteState } from "./rules.ts";

export { runChecks, ADOPTION_RULE, PREREQUISITE_RULE } from "./rules.ts";
export type { CheckContext, PrerequisiteState } from "./rules.ts";
export { digestOf, digestOfFile } from "./digest.ts";
export { matchesPattern, matchesAny } from "./glob.ts";
export { loadAuthority, loadDecision, loadMandate } from "./registry.ts";

/**
 * The compiler.
 *
 * Given a repository and a mandate id, it answers one question: is this
 * mandate authorized, by whom, and within what bounds. When the answer is no
 * it names the article that refused and says why in a sentence a person can
 * read.
 *
 * It performs no network access and opens no database. That is not
 * minimalism for its own sake — it is what lets a stranger with a checkout
 * and no account reproduce the answer.
 */

export interface CompileOptions {
  root: string;
  mandateId: string;
  /** Paths a proposed change would touch, checked against mandate scope. */
  changedPaths?: string[];
  /** Public-facing files scanned for prohibited claims. */
  publicTextPaths?: string[];
  /** Injected so a test can fix the clock. Authority is time-dependent. */
  now?: Date;
}

function refusal(rule: string, message: string): CompileResult {
  return {
    authorized: false,
    findings: [{ rule, enforcement: "ENFORCED", outcome: "REFUSED", message }],
  };
}

async function verifyDigests(root: string, refs: (SourceRef | undefined)[]): Promise<string[]> {
  const failures: string[] = [];
  for (const ref of refs) {
    if (!ref?.digest) continue;
    const actual = await digestOfFile(root, ref.path);
    if (actual === null) {
      failures.push(`${ref.path} is referenced with a digest but does not exist`);
    } else if (actual !== ref.digest) {
      failures.push(`${ref.path} recorded ${ref.digest} but is ${actual}`);
    }
  }
  return failures;
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { root, mandateId } = options;
  const now = options.now ?? new Date();

  const mandate = await loadMandate(root, mandateId);
  if (!mandate.ok) {
    return refusal(
      "R-TYPED-MANDATE",
      `No mandate ${mandateId}: ${mandate.reason}. Without a mandate there is no authority to act, ` +
        `and the correct output is a proposed mandate for human review rather than the work.`,
    );
  }

  const decisionId = mandate.record.authority?.source_decision;
  if (typeof decisionId !== "string" || decisionId.length === 0) {
    return refusal(
      "R-TYPED-MANDATE",
      `Mandate ${mandateId} cites no source decision. A mandate with no decision behind it is a wish.`,
    );
  }

  const decision = await loadDecision(root, decisionId);
  if (!decision.ok) {
    return refusal(
      "R-SOURCE-HIERARCHY",
      `Mandate ${mandateId} cites decision ${decisionId}, but ${decision.reason}. ` +
        `A mandate cannot be authorised by a decision that does not exist.`,
    );
  }

  const authority = await loadAuthority(root);
  if (!authority.ok) {
    return refusal(
      "R-SOURCE-HIERARCHY",
      `No root authority record: ${authority.reason}. Nothing in this repository can be authorised ` +
        `until the source of authority is declared.`,
    );
  }

  const digestFailures = await verifyDigests(root, [
    authority.record.human_source,
    decision.record.human_source,
    mandate.record.human_source,
    ...(decision.record.authority?.higher_sources ?? []),
  ]);

  const publicText: { path: string; text: string }[] = [];
  for (const relPath of options.publicTextPaths ?? []) {
    try {
      publicText.push({ path: relPath, text: await readFile(path.join(root, relPath), "utf8") });
    } catch {
      // A public file that cannot be read is not silently treated as clean.
      publicText.push({ path: relPath, text: "" });
    }
  }

  // Prerequisite decisions, named by the decision or the mandate, resolved
  // here because the kernel's rules stay pure and the registry is the
  // caller's. A prerequisite that cannot be loaded is reported as absent,
  // not skipped.
  const prerequisiteIds = [
    ...new Set([
      ...(decision.record.prerequisite_decisions ?? []),
      ...(mandate.record.authority.prerequisite_decisions ?? []),
    ]),
  ];
  const prerequisites: PrerequisiteState[] = [];
  for (const id of prerequisiteIds) {
    const loaded = await loadDecision(root, id);
    prerequisites.push({ id, status: loaded.ok ? loaded.record.status : null });
  }

  const findings = runChecks({
    authority: authority.record,
    decision: decision.record,
    mandate: mandate.record,
    digestFailures,
    prerequisites,
    changedPaths: options.changedPaths ?? [],
    publicText,
    now,
  });

  return { authorized: findings.every((f) => f.outcome !== "REFUSED"), findings };
}

/**
 * What a result means for acting on it. Three states, never a bare
 * "authorised": a chain can be well-formed and still be a draft, and for
 * nine days this repository could not tell the difference.
 */
export type ExecutionState = "AUTHORISED_FOR_EXECUTION" | "VALID_AS_DRAFT" | "REFUSED";

export interface Summary {
  authorized: boolean;
  /** Authorised for execution, valid only as a draft, or refused outright. */
  execution: ExecutionState;
  /** The adoption and prerequisite messages behind a VALID_AS_DRAFT, for the reader. */
  waitingOn: string[];
  enforced: { passed: number; refused: number };
  checked: { passed: number; refused: number };
  notMachineDecidable: number;
}

/**
 * Counts, broken out by how each article is actually held.
 *
 * There is deliberately no single total. "11 constitutional checks passed"
 * would tell a reader that the constitution was verified, when what was
 * verified is the decidable subset — and the size of the undecidable
 * remainder is the honest part of the report.
 */
export function summarise(result: CompileResult): Summary {
  const count = (cls: string, outcome: Finding["outcome"]) =>
    result.findings.filter((f) => f.enforcement === cls && f.outcome === outcome).length;
  const refusals = result.findings.filter((f) => f.outcome === "REFUSED");
  const adoptionRules: readonly string[] = [ADOPTION_RULE, PREREQUISITE_RULE];
  const onlyAdoption =
    refusals.length > 0 && refusals.every((f) => adoptionRules.includes(f.rule));
  const execution: ExecutionState =
    refusals.length === 0 ? "AUTHORISED_FOR_EXECUTION" : onlyAdoption ? "VALID_AS_DRAFT" : "REFUSED";
  return {
    authorized: result.authorized,
    execution,
    waitingOn: onlyAdoption ? refusals.map((f) => f.message) : [],
    enforced: { passed: count("ENFORCED", "PASS"), refused: count("ENFORCED", "REFUSED") },
    checked: { passed: count("CHECKED", "PASS"), refused: count("CHECKED", "REFUSED") },
    notMachineDecidable: result.findings.filter((f) => f.outcome === "NOT_MACHINE_DECIDABLE").length,
  };
}
