import type { Charter, Decision, Finding, Mandate, Pin, Standing, ToolSpec, Vote } from "@ours/schemas";
import { OPTION_LAYERS } from "@ours/schemas";
import type { ParsedArticle } from "./articles.ts";

/**
 * The checks a community's records are held to — M-0006.
 *
 * Two families. `C-` rules are the community's own articles, from its
 * charter: who may decide, by what procedure. `S-` rules are the gate's
 * rules for a service specification, from `spec/SPEC.md`: every article has
 * a test, every option has provenance, the approved files match their pin,
 * and a mandate names a charter and a tool that exist. Each finding names
 * the article and says why in a sentence a person can read, like every
 * other check in this kernel.
 */

export interface CommunityContext {
  charter: Charter;
  charterArticles: ParsedArticle[];
  standing: Standing | null;
  decision: Decision;
  vote: Vote | null;
  mandate: Mandate;
  tool: ToolSpec | null;
  toolArticles: ParsedArticle[];
  pin: Pin | null;
  /** The pin's files as they are on disk now, digested by the caller. */
  pinDigests: { path: string; recorded: string; actual: string | null }[];
  /** The status of the decision the pin names, or null if it does not exist. */
  pinnedByStatus: string | null;
  /** Decisions that exist in this root, by id → status, for option provenance. */
  decisions: Record<string, string>;
}

const PRE_ADOPTION: readonly string[] = ["DRAFT", "PROPOSED"];

function pass(rule: string, message: string): Finding {
  return { rule, enforcement: "ENFORCED", outcome: "PASS", message };
}
function refuse(rule: string, message: string): Finding {
  return { rule, enforcement: "ENFORCED", outcome: "REFUSED", message };
}
function open(rule: string, message: string): Finding {
  return { rule, enforcement: "ENFORCED", outcome: "NOT_MACHINE_DECIDABLE", message };
}

/** Every article the charter lists must exist in its human source with a class. */
function charterArticles(ctx: CommunityContext): Finding {
  const rule = "S-CHARTER-ARTICLES";
  const missing = ctx.charter.articles.filter((id) => !ctx.charterArticles.some((a) => a.id === id));
  if (missing.length > 0) {
    return refuse(
      rule,
      `The charter lists ${missing.join(", ")} but its human source has no such article. ` +
        `An article that exists only in the projection is not law.`,
    );
  }
  const untagged = ctx.charterArticles.filter(
    (a) => ctx.charter.articles.includes(a.id) && a.classes.length === 0,
  );
  if (untagged.length > 0) {
    return refuse(
      rule,
      `Charter article(s) ${untagged.map((a) => a.id).join(", ")} carry no enforcement class. ` +
        `No article may be untagged.`,
    );
  }
  return pass(
    rule,
    `The charter's ${ctx.charter.articles.length} article(s) exist in its human source, each with a class.`,
  );
}

/** The mandate must name the charter that actually governs this root. */
function mandateCharter(ctx: CommunityContext): Finding {
  const rule = "S-CHARTER-NAMED";
  const expected = `${ctx.charter.cell}/${ctx.charter.version}`;
  const named = ctx.mandate.institution.charter_version;
  if (named !== expected) {
    return refuse(
      rule,
      `Mandate ${ctx.mandate.mandate_id} cites charter ${named ?? "none"}, but this root is governed by ` +
        `${expected}. A mandate cannot be authorised by a charter that does not exist here.`,
    );
  }
  return pass(rule, `${ctx.mandate.mandate_id} is governed by charter ${expected}.`);
}

/**
 * Who decided, and by what procedure. The charter names a procedure per
 * decision class — a vote rule, or a delegation to a role — and the
 * decision must satisfy it: a vote with a tally that meets the threshold
 * against the standing count, or an actor who actually holds the role.
 */
function procedure(ctx: CommunityContext): Finding[] {
  const rule = "C-DECISIONS";
  const standingRule = "C-PARTICIPATION";
  const d = ctx.decision;
  const proc = ctx.charter.procedures[d.class];
  if (proc === undefined) {
    return [
      refuse(
        rule,
        `Charter ${ctx.charter.authority_id} names no procedure for a ${d.class} decision, so ` +
          `${d.decision_id} cannot have followed one.`,
      ),
    ];
  }
  if (ctx.standing === null) {
    return [
      refuse(
        standingRule,
        `No standing record exists in this root, so nobody can be shown to hold standing for ${d.decision_id}.`,
      ),
    ];
  }

  if (proc.startsWith("delegated:")) {
    const role = proc.slice("delegated:".length);
    const holder = ctx.standing.roles[role];
    const actor = d.authority.actor;
    if (holder === undefined) {
      return [
        refuse(standingRule, `The charter delegates ${d.class} decisions to the ${role}, and standing names nobody in that role.`),
      ];
    }
    if (actor.role !== role || actor.id !== holder) {
      return [
        refuse(
          standingRule,
          `${d.decision_id} was decided by ${actor.id} as ${actor.role}; the charter delegates ${d.class} ` +
            `decisions to the ${role}, and standing names ${holder}. An actor without standing decides nothing.`,
        ),
      ];
    }
    return [
      pass(standingRule, `${actor.id} holds the role ${role} that the charter delegates ${d.class} decisions to.`),
      pass(rule, `${d.decision_id} followed the delegated procedure for ${d.class}.`),
    ];
  }

  // A vote procedure: the actor is the members, and the vote must exist.
  const findings: Finding[] = [];
  if (d.authority.actor.id !== ctx.charter.actor.id) {
    findings.push(
      refuse(
        standingRule,
        `${d.decision_id} names ${d.authority.actor.id} as its actor, but a ${d.class} decision under this charter ` +
          `is made by ${ctx.charter.actor.id}, by ${proc}. An actor without standing decides nothing.`,
      ),
    );
  } else {
    findings.push(pass(standingRule, `${d.decision_id} is decided by ${ctx.charter.actor.id}, who hold standing.`));
  }

  if (ctx.vote === null) {
    findings.push(
      refuse(
        rule,
        `${d.decision_id} is a ${d.class} decision, which the charter decides by ${proc}, and it names no vote ` +
          `— or names one that does not exist. A decision without its vote is an announcement.`,
      ),
    );
    return findings;
  }
  const v = ctx.vote;
  const problems: string[] = [];
  if (v.decision_id !== d.decision_id) problems.push(`vote ${v.vote_id} belongs to ${v.decision_id}, not ${d.decision_id}`);
  if (v.cell !== ctx.charter.cell) problems.push(`vote ${v.vote_id} is a vote of ${v.cell}, not ${ctx.charter.cell}`);
  if (v.procedure !== proc) problems.push(`vote ${v.vote_id} was held by ${v.procedure}; the charter requires ${proc}`);
  const t = v.tally;
  if (t.for + t.against + t.abstain !== v.ballots_cast) problems.push(`the tally (${t.for}+${t.against}+${t.abstain}) does not equal the ${v.ballots_cast} ballots cast`);
  if (v.ballots_cast > v.eligible) problems.push(`${v.ballots_cast} ballots were cast by ${v.eligible} eligible members`);
  if (v.eligible !== ctx.standing.count) problems.push(`the vote counts ${v.eligible} eligible members; standing counts ${ctx.standing.count}`);
  if (problems.length > 0) {
    findings.push(refuse(rule, `${d.decision_id}: ${problems.join("; ")}.`));
    return findings;
  }

  let met = false;
  let needed = "";
  if (proc === "majority-of-respondents") {
    const responding = t.for + t.against;
    met = t.for * 2 > responding;
    needed = `more than half of the ${responding} responding`;
  } else if (proc === "two-thirds-of-members") {
    const threshold = Math.ceil((2 * v.eligible) / 3);
    met = t.for >= threshold;
    needed = `${threshold} of ${v.eligible} members`;
  } else {
    findings.push(refuse(rule, `The charter names a procedure this kernel does not know: ${proc}. Refused rather than guessed.`));
    return findings;
  }
  if (!met) {
    findings.push(
      refuse(
        rule,
        `${d.decision_id} needed ${needed} and got ${t.for} for, ${t.against} against, ${t.abstain} abstaining. ` +
          `A vote below its threshold decides nothing.`,
      ),
    );
  } else {
    findings.push(
      pass(
        rule,
        `${d.decision_id}: ${t.for} for, ${t.against} against, ${t.abstain} abstaining of ${v.ballots_cast} ballots ` +
          `from ${v.eligible} members — ${proc} met (${needed}). Dissent ${v.dissent_preserved ? "preserved" : "NOT preserved"}.`,
      ),
    );
  }
  return findings;
}

/** The mandate names a tool that exists, and the tool belongs to this root. */
function mandateTool(ctx: CommunityContext): Finding | null {
  const rule = "S-TOOL-NAMED";
  if (ctx.mandate.tool === undefined) return null;
  if (ctx.tool === null) {
    return refuse(rule, `Mandate ${ctx.mandate.mandate_id} implements tool ${ctx.mandate.tool}, and no such specification exists in this root.`);
  }
  if (ctx.tool.cell !== ctx.charter.cell) {
    return refuse(rule, `Specification ${ctx.tool.tool_id} belongs to ${ctx.tool.cell}, not ${ctx.charter.cell}.`);
  }
  return pass(rule, `${ctx.mandate.mandate_id} implements ${ctx.tool.tool_id} ${ctx.tool.version}, a specification of this root.`);
}

/** Every article of a specification is held by at least one named test, and every test holds a real article. */
export function articleTests(tool: ToolSpec, toolArticles: ParsedArticle[]): Finding {
  const rule = "S-ARTICLE-TEST";
  const problems: string[] = [];
  const testIds = new Set(tool.tests.map((t) => t.id));
  for (const article of tool.articles) {
    if (!toolArticles.some((a) => a.id === article.id)) {
      problems.push(`${article.id} is listed but absent from the specification's human source`);
      continue;
    }
    const parsed = toolArticles.find((a) => a.id === article.id);
    if (parsed && parsed.classes.length === 0) problems.push(`${article.id} carries no enforcement class`);
    if (article.tests.length === 0) problems.push(`${article.id} names no test`);
    for (const t of article.tests) {
      if (!testIds.has(t)) problems.push(`${article.id} names test ${t}, which does not exist`);
    }
  }
  for (const t of tool.tests) {
    if (!tool.articles.some((a) => a.id === t.holds)) problems.push(`test ${t.id} claims to hold ${t.holds}, which is not an article`);
  }
  if (problems.length > 0) {
    return refuse(rule, `${tool.tool_id}: ${problems.join("; ")}. An article without a test is a wish, and a test without an article holds nothing.`);
  }
  return pass(rule, `${tool.tool_id}: ${tool.articles.length} article(s), each held by a named test; ${tool.tests.length} test(s), each holding an article.`);
}

/** Every option names the article and the decision that gave it its default; a floor option is nobody's to override. */
export function optionProvenance(tool: ToolSpec, decisions: Record<string, string>): Finding {
  const rule = "S-OPTION-PROVENANCE";
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const o of tool.options) {
    if (seen.has(o.option_id)) problems.push(`${o.option_id} appears twice`);
    seen.add(o.option_id);
    if (!(OPTION_LAYERS as readonly string[]).includes(o.layer)) problems.push(`${o.option_id} has layer ${o.layer}`);
    if (!tool.articles.some((a) => a.id === o.provenance.article)) problems.push(`${o.option_id} names article ${o.provenance.article}, which is not in the specification`);
    const status = decisions[o.provenance.decision];
    if (status === undefined) problems.push(`${o.option_id} names decision ${o.provenance.decision}, which does not exist in this root`);
    else if (PRE_ADOPTION.includes(status)) problems.push(`${o.option_id} names decision ${o.provenance.decision}, which is ${status}`);
    if (o.layer === "FLOOR" && o.person_may_override) problems.push(`${o.option_id} is FLOOR and marked overridable`);
    if (o.type === "enum" && (!o.values || !o.values.includes(o.default))) problems.push(`${o.option_id} has default ${String(o.default)}, which is not among its values`);
  }
  if (problems.length > 0) {
    return refuse(rule, `${tool.tool_id}: ${problems.join("; ")}. An option without provenance is a toggle somebody chose.`);
  }
  return pass(rule, `${tool.tool_id}: ${tool.options.length} option(s), each with an article and an adopted decision behind its default.`);
}

/**
 * The approved files match their pin. A pinned file that changed without an
 * amending decision is refused, and the message says which file — the
 * contract, the transition requirements, the charter — so that "widened"
 * and "weakened" are named by what they touched.
 */
export function pinHolds(
  pin: Pin | null,
  pinDigests: CommunityContext["pinDigests"],
  pinnedByStatus: string | null,
): Finding {
  const rule = "S-PIN";
  if (pin === null) {
    return open(rule, `No pin exists in this root, so no specification is held read-only against an implementer. Nothing was evaluated; this is not a pass.`);
  }
  if (pinnedByStatus === null) {
    return refuse(rule, `The pin names ${pin.pinned_by} as the decision that approved these files, and no such decision exists.`);
  }
  if (PRE_ADOPTION.includes(pinnedByStatus)) {
    return refuse(rule, `The pin names ${pin.pinned_by}, which is ${pinnedByStatus}. A draft decision pins nothing.`);
  }
  const drifted = pinDigests.filter((f) => f.actual !== f.recorded);
  if (drifted.length > 0) {
    return refuse(
      rule,
      drifted
        .map((f) =>
          f.actual === null
            ? `${f.path} was pinned by ${pin.pinned_by} and no longer exists`
            : `${f.path} changed after ${pin.pinned_by} pinned it (recorded ${f.recorded.slice(0, 19)}…, now ${f.actual.slice(0, 19)}…)`,
        )
        .join("; ") +
        `. A specification, contract, or transition requirement changed without an amending decision is refused, not diffed.`,
    );
  }
  return pass(rule, `${pin.files.length} pinned file(s) match the digests ${pin.pinned_by} approved on ${pin.pinned_at}.`);
}

export function runCommunityChecks(ctx: CommunityContext): Finding[] {
  const findings: Finding[] = [charterArticles(ctx), mandateCharter(ctx), ...procedure(ctx)];
  const toolNamed = mandateTool(ctx);
  if (toolNamed !== null) findings.push(toolNamed);
  if (ctx.tool !== null) {
    findings.push(articleTests(ctx.tool, ctx.toolArticles));
    findings.push(optionProvenance(ctx.tool, ctx.decisions));
  }
  findings.push(pinHolds(ctx.pin, ctx.pinDigests, ctx.pinnedByStatus));
  return findings;
}
