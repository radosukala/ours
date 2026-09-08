import type { Charter, Decision, Finding, Mandate, Pin, Standing, ToolSpec, Vote } from "@ours/schemas";
import { OPTION_LAYERS } from "@ours/schemas";
import type { ParsedArticle } from "./articles.ts";

/**
 * The checks a community's records are held to — M-0006, revised after the
 * independent verification of 8 September 2026.
 *
 * Two families. `C-` rules are the community's own articles, from its
 * charter: who may decide, by what procedure. `S-` rules are the gate's
 * rules for a service specification, from `spec/SPEC.md`. Every decision in
 * the root is checked, not only the one the mandate cites — the
 * verification found the charter's own adoption vote could fall below its
 * threshold unnoticed. Each finding names the article and says why in a
 * sentence a person can read.
 */

export interface CommunityContext {
  charter: Charter;
  charterArticles: ParsedArticle[];
  standing: Standing | null;
  /** The decision the mandate cites. */
  decision: Decision;
  vote: Vote | null;
  mandate: Mandate;
  tool: ToolSpec | null;
  toolArticles: ParsedArticle[];
  pin: Pin | null;
  /** The pin's files as they are on disk now, digested by the caller. */
  pinDigests: { path: string; recorded: string; actual: string | null }[];
  /** The decision the pin names, as a record, or null if it does not exist. */
  pinnedBy: Decision | null;
  /** Every decision in this root. */
  decisions: Decision[];
  /** Every vote a decision in this root names, by vote id. */
  votes: Record<string, Vote>;
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

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function onOrBefore(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return !Number.isNaN(x) && !Number.isNaN(y) && x <= y;
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
      `Charter article(s) ${untagged.map((a) => a.id).join(", ")} carry no enforcement class. No article may be untagged.`,
    );
  }
  return pass(rule, `The charter's ${ctx.charter.articles.length} article(s) exist in its human source, each with a class.`);
}

/**
 * A charter is adopted by a decision of its own community, under its own
 * CHARTER procedure — or it is a status without an event. The vote behind
 * that decision is checked with every other by `C-DECISIONS/root`.
 */
function charterAdopted(ctx: CommunityContext): Finding {
  const rule = "S-CHARTER-ADOPTED";
  const id = ctx.charter.adopted_by;
  if (id === undefined) {
    return refuse(rule, `Charter ${ctx.charter.authority_id} names no adopting decision. A charter with a status and no adoption event is a draft that says otherwise.`);
  }
  const d = ctx.decisions.find((x) => x.decision_id === id);
  if (!d) return refuse(rule, `Charter ${ctx.charter.authority_id} says it was adopted by ${id}, and no such decision exists in this root.`);
  if (d.class !== "CHARTER") return refuse(rule, `${id} adopted the charter but is a ${d.class} decision; a charter is adopted by a CHARTER decision under its own procedure.`);
  if (PRE_ADOPTION.includes(String(d.status))) return refuse(rule, `${id}, which adopted the charter, is ${d.status}.`);
  return pass(rule, `Charter ${ctx.charter.authority_id} ${ctx.charter.version} was adopted by ${id}, a ${d.status} CHARTER decision; its vote is checked below with every other.`);
}

/** The mandate must name the charter that actually governs this root. */
function mandateCharter(ctx: CommunityContext): Finding {
  const rule = "S-CHARTER-NAMED";
  const expected = `${ctx.charter.cell}/${ctx.charter.version}`;
  const named = ctx.mandate.institution.charter_version;
  if (named !== expected) {
    return refuse(
      rule,
      `Mandate ${ctx.mandate.mandate_id} cites charter ${named ?? "none"}, but this root is governed by ${expected}. ` +
        `A mandate cannot be authorised by a charter that does not exist here.`,
    );
  }
  return pass(rule, `${ctx.mandate.mandate_id} is governed by charter ${expected}.`);
}

/** A community's decisions may grant only the mandate classes its charter allows. */
function charterGrants(ctx: CommunityContext): Finding {
  const rule = "S-CHARTER-GRANTS";
  const allowed = ctx.charter.may_grant_mandate_classes;
  if (allowed === undefined) {
    return open(rule, `Charter ${ctx.charter.authority_id} declares no limit on the mandate classes its decisions may grant, so none was evaluated. This is not a pass.`);
  }
  const over = ctx.decisions
    .map((d) => ({ id: d.decision_id, extra: (d.authorizes?.mandate_classes ?? []).filter((c) => !allowed.includes(c)) }))
    .filter((x) => x.extra.length > 0);
  if (over.length > 0) {
    return refuse(
      rule,
      over.map((x) => `${x.id} grants ${x.extra.join(", ")}`).join("; ") +
        `; the charter lets this community's decisions grant only ${allowed.join(", ")}. A decision cannot grant what its charter withholds.`,
    );
  }
  return pass(rule, `Every decision in this root grants only classes the charter allows (${allowed.join(", ")}).`);
}

/**
 * Who decided one decision, and by what procedure. Returns the standing
 * finding and the procedure finding for that decision, messages prefixed
 * with its id so that the root-wide findings read as a list.
 */
function procedureFor(
  d: Decision,
  vote: Vote | null,
  charter: Charter,
  standing: Standing | null,
): { participation: Finding; decisions: Finding } {
  const rule = "C-DECISIONS";
  const standingRule = "C-PARTICIPATION";
  const proc = charter.procedures[d.class];
  if (proc === undefined) {
    return {
      participation: pass(standingRule, `${d.decision_id}: not evaluated — no procedure exists for its class.`),
      decisions: refuse(rule, `Charter ${charter.authority_id} names no procedure for a ${d.class} decision, so ${d.decision_id} cannot have followed one.`),
    };
  }
  if (standing === null) {
    return {
      participation: refuse(standingRule, `No standing record exists in this root, so nobody can be shown to hold standing for ${d.decision_id}.`),
      decisions: refuse(rule, `${d.decision_id}: no standing record, so no procedure can be checked against it.`),
    };
  }

  if (proc.startsWith("delegated:")) {
    const role = proc.slice("delegated:".length);
    const holder = standing.roles[role];
    const actor = d.authority.actor;
    if (holder === undefined) {
      return {
        participation: refuse(standingRule, `The charter delegates ${d.class} decisions to the ${role}, and standing names nobody in that role.`),
        decisions: refuse(rule, `${d.decision_id}: delegated to a role nobody holds.`),
      };
    }
    if (actor.role !== role || actor.id !== holder) {
      return {
        participation: refuse(
          standingRule,
          `${d.decision_id} was decided by ${actor.id} as ${actor.role}; the charter delegates ${d.class} decisions to the ${role}, ` +
            `and standing names ${holder}. An actor without standing decides nothing.`,
        ),
        decisions: refuse(rule, `${d.decision_id}: its delegated procedure was not followed — see C-PARTICIPATION.`),
      };
    }
    return {
      participation: pass(standingRule, `${actor.id} holds the role ${role} that the charter delegates ${d.class} decisions to.`),
      decisions: pass(rule, `${d.decision_id} followed the delegated procedure for ${d.class}.`),
    };
  }

  // A vote procedure: the actor is the members, and the vote must exist and hold.
  const participation =
    d.authority.actor.id !== charter.actor.id
      ? refuse(
          standingRule,
          `${d.decision_id} names ${d.authority.actor.id} as its actor, but a ${d.class} decision under this charter is made by ` +
            `${charter.actor.id}, by ${proc}. An actor without standing decides nothing.`,
        )
      : pass(standingRule, `${d.decision_id} is decided by ${charter.actor.id}, who hold standing.`);

  if (vote === null) {
    return {
      participation,
      decisions: refuse(
        rule,
        `${d.decision_id} is a ${d.class} decision, which the charter decides by ${proc}, and it names no vote — or names one that does not exist. ` +
          `A decision without its vote is an announcement.`,
      ),
    };
  }
  const v = vote;
  const t = v.tally;
  const problems: string[] = [];
  for (const [name, value] of [
    ["for", t?.for],
    ["against", t?.against],
    ["abstain", t?.abstain],
    ["ballots_cast", v.ballots_cast],
    ["eligible", v.eligible],
  ] as [string, unknown][]) {
    if (!isCount(value)) problems.push(`${name} is ${String(value)}, not a non-negative integer`);
  }
  if (problems.length === 0) {
    if (v.eligible < 1) problems.push(`nobody was eligible`);
    if (v.decision_id !== d.decision_id) problems.push(`vote ${v.vote_id} belongs to ${v.decision_id}, not ${d.decision_id}`);
    if (v.cell !== charter.cell) problems.push(`vote ${v.vote_id} is a vote of ${v.cell}, not ${charter.cell}`);
    if (v.procedure !== proc) problems.push(`vote ${v.vote_id} was held by ${v.procedure}; the charter requires ${proc}`);
    if (t.for + t.against + t.abstain !== v.ballots_cast) problems.push(`the tally (${t.for}+${t.against}+${t.abstain}) does not equal the ${v.ballots_cast} ballots cast`);
    if (v.ballots_cast > v.eligible) problems.push(`${v.ballots_cast} ballots were cast by ${v.eligible} eligible members`);
    if (v.dissent_preserved !== true) problems.push(`dissent was not preserved — a vote's record keeps its dissent, or it is an announcement`);
  }
  // Standing is compared only when the standing record could have been the
  // count the vote used: dated on or before the vote closed. A later record
  // cannot contradict an earlier vote, and the message says so.
  let standingNote = "";
  if (problems.length === 0) {
    if (onOrBefore(standing.as_of, v.closed)) {
      if (v.eligible !== standing.count) problems.push(`the vote counts ${v.eligible} eligible members; standing as of ${standing.as_of} counted ${standing.count}`);
    } else {
      standingNote = ` Standing as of ${standing.as_of} postdates the vote; the eligible count is the vote's own record.`;
    }
  }
  if (problems.length > 0) {
    return { participation, decisions: refuse(rule, `${d.decision_id}: ${problems.join("; ")}.`) };
  }

  let met = false;
  let needed = "";
  if (proc === "majority-of-respondents") {
    const responding = t.for + t.against;
    met = t.for * 2 > responding;
    needed = `more than half of the ${responding} voting for or against`;
  } else if (proc === "two-thirds-of-members") {
    const threshold = Math.ceil((2 * v.eligible) / 3);
    met = t.for >= threshold;
    needed = `${threshold} of ${v.eligible} members`;
  } else {
    return { participation, decisions: refuse(rule, `The charter names a procedure this kernel does not know: ${proc}. Refused rather than guessed.`) };
  }
  if (!met) {
    return {
      participation,
      decisions: refuse(
        rule,
        `${d.decision_id} needed ${needed} and got ${t.for} for, ${t.against} against, ${t.abstain} abstaining. A vote below its threshold decides nothing.`,
      ),
    };
  }
  return {
    participation,
    decisions: pass(
      rule,
      `${d.decision_id}: ${t.for} for, ${t.against} against, ${t.abstain} abstaining of ${v.ballots_cast} ballots from ${v.eligible} members — ` +
        `${proc} met (${needed}). Dissent preserved.${standingNote}`,
    ),
  };
}

/** The mandate's own decision, in full. */
function procedure(ctx: CommunityContext): Finding[] {
  const { participation, decisions } = procedureFor(ctx.decision, ctx.vote, ctx.charter, ctx.standing);
  return [participation, decisions];
}

/** Every other decision in the root, aggregated — the charter's adoption among them. */
function rootProcedures(ctx: CommunityContext): Finding[] {
  const others = ctx.decisions.filter((d) => d.decision_id !== ctx.decision.decision_id);
  if (others.length === 0) {
    return [pass("C-DECISIONS/root", `No other decision exists in this root.`)];
  }
  const participationRefusals: string[] = [];
  const procedureRefusals: string[] = [];
  for (const d of others) {
    const vote = d.vote !== undefined ? (ctx.votes[d.vote] ?? null) : null;
    const { participation, decisions } = procedureFor(d, vote, ctx.charter, ctx.standing);
    if (participation.outcome === "REFUSED") participationRefusals.push(participation.message);
    if (decisions.outcome === "REFUSED") procedureRefusals.push(decisions.message);
  }
  const ids = others.map((d) => d.decision_id).join(", ");
  return [
    participationRefusals.length > 0
      ? refuse("C-PARTICIPATION/root", participationRefusals.join(" "))
      : pass("C-PARTICIPATION/root", `Every other decision in this root (${ids}) was made by an actor with standing.`),
    procedureRefusals.length > 0
      ? refuse("C-DECISIONS/root", procedureRefusals.join(" "))
      : pass("C-DECISIONS/root", `Every other decision in this root (${ids}) followed the charter's procedure for its class, with its vote checked.`),
  ];
}

/** The mandate names a tool that exists, belongs to this root, and is past adoption. */
function mandateTool(ctx: CommunityContext): Finding | null {
  const rule = "S-TOOL-NAMED";
  if (ctx.mandate.tool === undefined) return null;
  if (ctx.tool === null) {
    return refuse(rule, `Mandate ${ctx.mandate.mandate_id} implements tool ${ctx.mandate.tool}, and no such specification exists in this root.`);
  }
  const problem = toolStatusProblem(ctx.tool, ctx.charter);
  if (problem !== null) return refuse(rule, problem);
  return pass(rule, `${ctx.mandate.mandate_id} implements ${ctx.tool.tool_id} ${ctx.tool.version}, an adopted specification of this root.`);
}

/** A specification of another community, or one still a draft, is not admissible. */
export function toolStatusProblem(tool: ToolSpec, charter: Charter): string | null {
  if (tool.cell !== charter.cell) return `Specification ${tool.tool_id} belongs to ${tool.cell}, not ${charter.cell}.`;
  if (PRE_ADOPTION.includes(String(tool.status))) return `Specification ${tool.tool_id} is ${tool.status}. A draft specification admits nothing.`;
  return null;
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

/** Every option names the article and the adopted decision that gave it its default; a floor option is nobody's to override. */
export function optionProvenance(tool: ToolSpec, decisions: Decision[]): Finding {
  const rule = "S-OPTION-PROVENANCE";
  const problems: string[] = [];
  const seen = new Set<string>();
  const status = (id: string): string | undefined => decisions.find((d) => d.decision_id === id)?.status;
  for (const o of tool.options) {
    if (seen.has(o.option_id)) problems.push(`${o.option_id} appears twice`);
    seen.add(o.option_id);
    if (!(OPTION_LAYERS as readonly string[]).includes(o.layer)) problems.push(`${o.option_id} has layer ${o.layer}`);
    if (!tool.articles.some((a) => a.id === o.provenance.article)) problems.push(`${o.option_id} names article ${o.provenance.article}, which is not in the specification`);
    const s = status(o.provenance.decision);
    if (s === undefined) problems.push(`${o.option_id} names decision ${o.provenance.decision}, which does not exist in this root`);
    else if (PRE_ADOPTION.includes(String(s))) problems.push(`${o.option_id} names decision ${o.provenance.decision}, which is ${s}`);
    if (o.layer === "FLOOR" && o.person_may_override) problems.push(`${o.option_id} is FLOOR and marked overridable`);
    if (o.type === "enum" && (!o.values || !o.values.includes(o.default))) problems.push(`${o.option_id} has default ${String(o.default)}, which is not among its values`);
  }
  if (problems.length > 0) {
    return refuse(rule, `${tool.tool_id}: ${problems.join("; ")}. An option without provenance is a toggle somebody chose.`);
  }
  return pass(rule, `${tool.tool_id}: ${tool.options.length} option(s), each with an article and an adopted decision behind its default.`);
}

/**
 * The approved files match their pin, and the pin was made by a decision
 * that says it pins — not merely any adopted decision id. A pinned file
 * that changed without an amending decision is refused, naming the file.
 */
export function pinHolds(
  pin: Pin | null,
  pinDigests: CommunityContext["pinDigests"],
  pinnedBy: Decision | null,
  charterCell: string,
): Finding {
  const rule = "S-PIN";
  if (pin === null) {
    return open(rule, `No pin exists in this root, so no specification is held read-only against an implementer. Nothing was evaluated; this is not a pass.`);
  }
  if (pin.cell !== charterCell) {
    return refuse(rule, `The pin says it belongs to ${pin.cell}; this root is ${charterCell}. A pin of another community holds nothing here.`);
  }
  if (pinnedBy === null) {
    return refuse(rule, `The pin names ${pin.pinned_by} as the decision that approved these files, and no such decision exists.`);
  }
  if (PRE_ADOPTION.includes(String(pinnedBy.status))) {
    return refuse(rule, `The pin names ${pin.pinned_by}, which is ${pinnedBy.status}. A draft decision pins nothing.`);
  }
  if (pinnedBy.pins !== true) {
    return refuse(
      rule,
      `The pin names ${pin.pinned_by}, which does not record that it pins a specification (no \`pins: true\`). ` +
        `A pin needs a decision that names the amendment, not any adopted decision id.`,
    );
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
  return pass(rule, `${pin.files.length} pinned file(s) match the digests ${pin.pinned_by} — a decision that records it pins — approved on ${pin.pinned_at}.`);
}

export function runCommunityChecks(ctx: CommunityContext): Finding[] {
  const findings: Finding[] = [
    charterArticles(ctx),
    charterAdopted(ctx),
    charterGrants(ctx),
    mandateCharter(ctx),
    ...procedure(ctx),
    ...rootProcedures(ctx),
  ];
  const toolNamed = mandateTool(ctx);
  if (toolNamed !== null) findings.push(toolNamed);
  if (ctx.tool !== null) {
    findings.push(articleTests(ctx.tool, ctx.toolArticles));
    findings.push(optionProvenance(ctx.tool, ctx.decisions));
  }
  findings.push(pinHolds(ctx.pin, ctx.pinDigests, ctx.pinnedBy, ctx.charter.cell));
  return findings;
}
