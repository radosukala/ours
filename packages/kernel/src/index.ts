import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AuthorityRecord,
  Charter,
  CompileResult,
  Decision,
  Finding,
  Mandate,
  SourceRef,
} from "@ours/schemas";
import { parseArticles } from "./articles.ts";
import { articleTests, optionProvenance, pinHolds, runCommunityChecks } from "./community.ts";
import type { CommunityContext } from "./community.ts";
import { checkContract } from "./contract.ts";
import { digestOfFile } from "./digest.ts";
import {
  listDecisions,
  loadAuthority,
  loadDecision,
  loadMandate,
  loadPin,
  loadStanding,
  loadToolSpec,
  loadVote,
} from "./registry.ts";
import { ADOPTION_RULE, PREREQUISITE_RULE, runChecks } from "./rules.ts";
import type { PrerequisiteState } from "./rules.ts";

export { runChecks, ADOPTION_RULE, PREREQUISITE_RULE } from "./rules.ts";
export type { CheckContext, PrerequisiteState } from "./rules.ts";
export { digestOf, digestOfFile } from "./digest.ts";
export { matchesPattern, matchesAny } from "./glob.ts";
export {
  loadAuthority,
  loadDecision,
  loadMandate,
  loadStanding,
  loadVote,
  loadToolSpec,
  loadPin,
  listDecisions,
} from "./registry.ts";
export { parseArticles } from "./articles.ts";
export type { ParsedArticle } from "./articles.ts";
export { runCommunityChecks, articleTests, optionProvenance, pinHolds } from "./community.ts";
export type { CommunityContext } from "./community.ts";
export { checkContract, scanSource, CONTRACT_RULE } from "./contract.ts";
export type { ContractProblem } from "./contract.ts";

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
  /**
   * In a community root, where the implementation's source lives — the
   * static contract check runs against it. Absent, the contract is not
   * checked and no finding pretends it was.
   */
  contractSourceDir?: string;
}

function refusal(rule: string, message: string): CompileResult {
  return {
    authorized: false,
    findings: [{ rule, enforcement: "ENFORCED", outcome: "REFUSED", message }],
  };
}

async function readText(root: string, rel: string): Promise<string> {
  try {
    return await readFile(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
}

interface CommunityRecords {
  charter: Charter;
  charterArticles: CommunityContext["charterArticles"];
  standing: CommunityContext["standing"];
  pin: CommunityContext["pin"];
  pinDigests: CommunityContext["pinDigests"];
  pinnedByStatus: string | null;
  decisions: Record<string, string>;
}

/** Everything a community root carries besides the chain, loaded once. */
async function loadCommunity(root: string, charter: Charter): Promise<CommunityRecords> {
  const charterArticles = parseArticles(await readText(root, charter.human_source.path));
  const standing = await loadStanding(root);
  const pin = await loadPin(root);
  const pinDigests = pin.ok
    ? await Promise.all(
        pin.record.files.map(async (f) => ({
          path: f.path,
          recorded: f.digest,
          actual: await digestOfFile(root, f.path),
        })),
      )
    : [];
  const pinnedBy = pin.ok ? await loadDecision(root, pin.record.pinned_by) : null;
  return {
    charter,
    charterArticles,
    standing: standing.ok ? standing.record : null,
    pin: pin.ok ? pin.record : null,
    pinDigests,
    pinnedByStatus: pinnedBy === null ? null : pinnedBy.ok ? String(pinnedBy.record.status) : null,
    decisions: await listDecisions(root),
  };
}

/**
 * The community checks, when the root is a community's. The institution's
 * root has a founding authority and no charter, so it gets none of these
 * and no finding says it was checked for them: there is nothing to check.
 */
async function communityFindings(
  root: string,
  authority: AuthorityRecord,
  decision: Decision,
  mandate: Mandate,
  contractSourceDir: string | undefined,
): Promise<Finding[]> {
  if (authority.schema !== "ours.charter/v0.1") return [];
  const charter: Charter = authority;
  const records = await loadCommunity(root, charter);
  const vote = decision.vote !== undefined ? await loadVote(root, decision.vote) : null;
  const tool = mandate.tool !== undefined ? await loadToolSpec(root, mandate.tool) : null;
  const toolRecord = tool !== null && tool.ok ? tool.record : null;
  const toolArticles = toolRecord ? parseArticles(await readText(root, toolRecord.human_source.path)) : [];
  const ctx: CommunityContext = {
    ...records,
    decision,
    vote: vote !== null && vote.ok ? vote.record : null,
    mandate,
    tool: toolRecord,
    toolArticles,
  };
  const findings = runCommunityChecks(ctx);
  if (contractSourceDir !== undefined && toolRecord !== null) {
    findings.push(await checkContract(toolRecord, contractSourceDir));
  }
  return findings;
}

export interface AdmitOptions {
  root: string;
  toolId: string;
  sourceDir?: string;
}

/**
 * The gate for a tool on its own, without a mandate: is this specification
 * admissible — every article held by a test, every option with provenance,
 * the approved files unchanged, and, if a source tree is given, the
 * implementation inside its contract. Passing makes a builder eligible to
 * offer the tool. The community decides its use; this decides nothing else.
 */
export async function admit(options: AdmitOptions): Promise<CompileResult> {
  const { root, toolId } = options;
  const authority = await loadAuthority(root);
  if (!authority.ok || authority.record.schema !== "ours.charter/v0.1") {
    return refusal(
      "S-CHARTER-NAMED",
      `${root} is not a community root: no charter at authority/CHARTER.yaml. A tool is admitted to a community, not to a directory.`,
    );
  }
  const charter: Charter = authority.record;
  const tool = await loadToolSpec(root, toolId);
  if (!tool.ok) {
    return refusal("S-TOOL-NAMED", `No specification ${toolId} in ${root}: ${tool.reason}.`);
  }
  const records = await loadCommunity(root, charter);
  const toolArticles = parseArticles(await readText(root, tool.record.human_source.path));
  const findings: Finding[] = [
    articleTests(tool.record, toolArticles),
    optionProvenance(tool.record, records.decisions),
    pinHolds(records.pin, records.pinDigests, records.pinnedByStatus),
  ];
  if (options.sourceDir !== undefined) {
    findings.push(await checkContract(tool.record, options.sourceDir));
  }
  return { authorized: findings.every((f) => f.outcome !== "REFUSED"), findings };
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

  // A community's root carries its charter's law and the gate's rules for a
  // specification beside the constitutional chain, in the same list.
  const community = await communityFindings(
    root,
    authority.record,
    decision.record,
    mandate.record,
    options.contractSourceDir,
  );
  const all = [...findings, ...community];

  return { authorized: all.every((f) => f.outcome !== "REFUSED"), findings: all };
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
