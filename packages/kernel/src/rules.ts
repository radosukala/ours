import type {
  Decision,
  EvidenceState,
  Finding,
  FoundingAuthority,
  Mandate,
} from "@ours/schemas";
import { EVIDENCE_STATES, MANDATE_CLASSES } from "@ours/schemas";
import { matchesAny } from "./glob.ts";

/**
 * The constitutional checks.
 *
 * Each one names the article it enforces and the class it is held at. A check
 * that a machine cannot decide returns NOT_MACHINE_DECIDABLE rather than
 * PASS, because reporting an undecidable article as passing is the precise
 * dishonesty this kernel exists to prevent.
 */

/** A prerequisite decision as the caller resolved it: its status, or null if absent. */
export interface PrerequisiteState {
  id: string;
  status: string | null;
}

/** The adoption finding. Named so a caller can tell a draft from a refusal. */
export const ADOPTION_RULE = "R-TRUTHFUL-STATUS/adoption";
/** The prerequisite finding. Same reason. */
export const PREREQUISITE_RULE = "R-SOURCE-HIERARCHY/prerequisite";

/** States before adoption. A record in one of these authorises nothing. */
const PRE_ADOPTION: readonly string[] = ["DRAFT", "PROPOSED"];

export interface CheckContext {
  authority: FoundingAuthority;
  decision: Decision;
  mandate: Mandate;
  /** Digest mismatches found by the caller, which owns filesystem access. */
  digestFailures: string[];
  /** Prerequisite decisions named by the decision or the mandate, resolved by the caller. */
  prerequisites: PrerequisiteState[];
  /** Paths a change proposes to touch. Empty when only validating a mandate. */
  changedPaths: string[];
  /** Public-facing text to scan for prohibited claims. */
  publicText: { path: string; text: string }[];
  now: Date;
}

function pass(rule: string, enforcement: Finding["enforcement"], message: string): Finding {
  return { rule, enforcement, outcome: "PASS", message };
}
function refuse(rule: string, enforcement: Finding["enforcement"], message: string): Finding {
  return { rule, enforcement, outcome: "REFUSED", message };
}
function undecidable(rule: string, message: string): Finding {
  return { rule, enforcement: "INTERPRETED", outcome: "NOT_MACHINE_DECIDABLE", message };
}

function isState(value: string): value is EvidenceState {
  return (EVIDENCE_STATES as readonly string[]).includes(value);
}

/** An agent may never originate authority, including its own. */
function humanAuthority(ctx: CheckContext): Finding {
  const rule = "R-HUMAN-AUTHORITY";
  const actor = ctx.decision.authority.actor;
  if (actor.kind !== "human") {
    return refuse(
      rule,
      "ENFORCED",
      `Decision ${ctx.decision.decision_id} was issued by ${actor.id}, which is an ${actor.kind}. ` +
        `Only a human may originate authority. An agent may draft a decision for review; it may not issue one.`,
    );
  }
  if (ctx.mandate.authority.actor.kind !== "human") {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${ctx.mandate.mandate_id} was granted by an ${ctx.mandate.authority.actor.kind}. ` +
        `Authority is granted by people, not by the thing that will carry it out.`,
    );
  }
  return pass(rule, "ENFORCED", `Authority originates with ${actor.id}, a human.`);
}

/** A lower source never overrides a higher one. */
function sourceHierarchy(ctx: CheckContext): Finding {
  const rule = "R-SOURCE-HIERARCHY";
  if (!ctx.authority.root) {
    return refuse(
      rule,
      "ENFORCED",
      `The authority record does not declare itself root, and no higher source was found above it.`,
    );
  }
  const authorised = ctx.authority.may_issue_decision_classes;
  if (!authorised.includes(ctx.decision.class)) {
    return refuse(
      rule,
      "ENFORCED",
      `Decision ${ctx.decision.decision_id} is class ${ctx.decision.class}, which ` +
        `${ctx.authority.authority_id} does not authorise. Permitted: ${authorised.join(", ")}.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    `${ctx.decision.decision_id} (${ctx.decision.class}) resolves to ${ctx.authority.authority_id}, which permits that class.`,
  );
}

/**
 * No material change without a valid mandate — and a mandate is not valid
 * merely because it parses. "Make it fair and deploy" is well-formed YAML.
 */
function typedMandate(ctx: CheckContext): Finding {
  const rule = "R-TYPED-MANDATE";
  const m = ctx.mandate;

  if (m.authority.source_decision !== ctx.decision.decision_id) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} cites decision ${m.authority.source_decision}, but was resolved against ${ctx.decision.decision_id}.`,
    );
  }
  if (!ctx.decision.authorizes.mandate_ids.includes(m.mandate_id)) {
    return refuse(
      rule,
      "ENFORCED",
      `Decision ${ctx.decision.decision_id} authorises mandates ` +
        `[${ctx.decision.authorizes.mandate_ids.join(", ") || "none"}]. ${m.mandate_id} is not among them.`,
    );
  }
  if (!(MANDATE_CLASSES as readonly string[]).includes(m.class)) {
    return refuse(rule, "ENFORCED", `Mandate class ${m.class} is not a recognised class.`);
  }

  const required: [string, unknown][] = [
    ["objective", m.objective],
    ["human_outcome", m.human_outcome],
    ["rollback.method", m.rollback?.method],
  ];
  for (const [field, value] of required) {
    if (typeof value !== "string" || value.trim().length === 0) {
      return refuse(rule, "ENFORCED", `Mandate ${m.mandate_id} has no ${field}.`);
    }
  }
  if (!Array.isArray(m.acceptance?.tests) || m.acceptance.tests.length === 0) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} names no acceptance test. A mandate whose success cannot be checked authorises anything.`,
    );
  }
  // Reject false precision: an objective too short to bound the work.
  if (m.objective.trim().length < 40) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} has an objective of ${m.objective.trim().length} characters. ` +
        `That is a wish, not a bound. State what must become true.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    `${m.mandate_id} is a well-formed ${m.class} mandate under ${ctx.decision.decision_id}.`,
  );
}

/** The mandate's class must be one the decision actually granted. */
function classAuthorised(ctx: CheckContext): Finding {
  const rule = "R-TYPED-MANDATE/class";
  const granted = ctx.decision.authorizes.mandate_classes;
  if (!granted.includes(ctx.mandate.class)) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${ctx.mandate.mandate_id} claims ${ctx.mandate.class} authority. ` +
        `Decision ${ctx.decision.decision_id} grants only [${granted.join(", ")}]. ` +
        `A mandate cannot widen the decision that authorises it.`,
    );
  }
  return pass(rule, "ENFORCED", `${ctx.mandate.class} is granted by ${ctx.decision.decision_id}.`);
}

/** Expired authority is not authority. */
function validityWindow(ctx: CheckContext): Finding {
  const rule = "R-SOURCE-HIERARCHY/window";
  const m = ctx.mandate;
  const from = Date.parse(m.authority.valid_from);
  const until = Date.parse(m.authority.expires_at);
  if (Number.isNaN(from) || Number.isNaN(until)) {
    return refuse(rule, "ENFORCED", `Mandate ${m.mandate_id} has an unparseable validity window.`);
  }
  if (until <= from) {
    return refuse(rule, "ENFORCED", `Mandate ${m.mandate_id} expires at or before it begins.`);
  }
  const now = ctx.now.getTime();
  if (now < from) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} is not yet valid. It begins ${m.authority.valid_from}.`,
    );
  }
  if (now > until) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} expired at ${m.authority.expires_at}. ` +
        `Expired authority is not authority; issue a new decision rather than extending this one.`,
    );
  }
  const decisionEnd = ctx.decision.expires_at ? Date.parse(ctx.decision.expires_at) : null;
  if (decisionEnd !== null && !Number.isNaN(decisionEnd) && until > decisionEnd) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} runs to ${m.authority.expires_at}, beyond decision ` +
        `${ctx.decision.decision_id} which ends ${ctx.decision.expires_at}. A mandate cannot outlive its source.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    `Authority is current: ${m.authority.valid_from} to ${m.authority.expires_at}.`,
  );
}

/** Denied stays denied. */
function scope(ctx: CheckContext): Finding {
  const rule = "R-SCOPE";
  const { allow, deny } = ctx.mandate.scope.paths;
  if (!Array.isArray(allow) || allow.length === 0) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${ctx.mandate.mandate_id} allows no path, so it authorises no work.`,
    );
  }
  for (const pattern of allow) {
    if (deny.includes(pattern)) {
      return refuse(
        rule,
        "ENFORCED",
        `Pattern ${pattern} appears in both allow and deny. A scope that contradicts itself decides nothing.`,
      );
    }
  }
  for (const filePath of ctx.changedPaths) {
    const denied = matchesAny(filePath, deny);
    if (denied !== null) {
      return refuse(
        rule,
        "ENFORCED",
        `${filePath} is denied by ${denied}. Denied stays denied — a mandate cannot widen its own scope.`,
      );
    }
    if (matchesAny(filePath, allow) === null) {
      return refuse(rule, "ENFORCED", `${filePath} is outside the allowed scope [${allow.join(", ")}].`);
    }
  }
  const scanned = ctx.changedPaths.length;
  if (scanned === 0) {
    // A check that evaluated nothing is not a check that passed. Reporting
    // this as PASS is how M-0001 wrote to a denied path with the trace
    // calling its scope coherent: the article was ENFORCED in the kernel and
    // DECLARED in practice, because no caller ever supplied the paths.
    return {
      rule,
      enforcement: "ENFORCED",
      outcome: "NOT_MACHINE_DECIDABLE",
      message:
        `The declared scope is coherent, but no changed paths were supplied, so nothing was ` +
        `evaluated against it. This is not a pass. Run with the working tree — ` +
        `\`ours check ${ctx.mandate.mandate_id} --changed\` — to decide it.`,
    };
  }
  return pass(rule, "ENFORCED", `All ${scanned} changed path(s) fall inside the allowed scope.`);
}

/** Completing a build never confers the authority to release it. */
function buildDeploySeparation(ctx: CheckContext): Finding {
  const rule = "R-BUILD-DEPLOY";
  const m = ctx.mandate;
  if (m.class === "BUILD" && m.release.production_allowed) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} holds BUILD authority and also permits production. ` +
        `Build and deploy are separate authorities; a build mandate cannot publish itself.`,
    );
  }
  if (m.class === "BUILD" && m.release.environments.length > 0) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} holds BUILD authority and names environments ` +
        `[${m.release.environments.join(", ")}]. Naming a deploy target requires DEPLOY authority.`,
    );
  }
  return pass(rule, "ENFORCED", `${m.class} authority does not carry release capability.`);
}

/**
 * A change declares how it is undone — and what survives being undone.
 * "Revert the commit" is a false statement about a destructive migration.
 */
function rollback(ctx: CheckContext): Finding {
  const rule = "R-ROLLBACK";
  const m = ctx.mandate;
  const residue = (m.rollback.irreversible_residue ?? "").trim();
  if (residue.length === 0) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} declares no irreversible residue. State what survives the rollback, or "none".`,
    );
  }
  const claimsNone = residue.toLowerCase() === "none";
  if (m.risk.reversibility === "DESTRUCTIVE" && claimsNone) {
    return refuse(
      rule,
      "ENFORCED",
      `Mandate ${m.mandate_id} is DESTRUCTIVE and claims no irreversible residue. ` +
        `A destructive change leaves something behind — dropped data, sent messages, third-party state. Name it.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    claimsNone
      ? `Reversal is ${m.risk.reversibility.toLowerCase()} and leaves no residue.`
      : `Reversal declared, with residue: ${residue}`,
  );
}

/** Draft, tested, deployed and observed are different things. */
function truthfulStatus(ctx: CheckContext): Finding {
  const rule = "R-TRUTHFUL-STATUS";
  const records = [
    ["authority", ctx.authority.status],
    ["decision", ctx.decision.status],
    ["mandate", ctx.mandate.status],
  ] as const;
  for (const [label, value] of records) {
    if (!isState(value)) {
      return refuse(
        rule,
        "ENFORCED",
        `The ${label} record carries status "${value}", which is not a recognised state.`,
      );
    }
  }
  return pass(
    rule,
    "ENFORCED",
    `States are distinct and recognised: authority ${ctx.authority.status}, ` +
      `decision ${ctx.decision.status}, mandate ${ctx.mandate.status}.`,
  );
}

/**
 * Adoption is an event. Until it has happened, a well-formed chain is a
 * draft, and a draft authorises nothing.
 *
 * The founding authority, three decisions and four mandates carried DRAFT
 * for nine days while being acted on, and nothing objected, because the
 * only status check asked whether the word was recognised. D-0004 named the
 * gap; this is the check that closes it, built under M-0004.
 */
function adoption(ctx: CheckContext): Finding {
  const rule = ADOPTION_RULE;
  const records: [string, string][] = [
    [ctx.authority.authority_id, ctx.authority.status],
    [ctx.decision.decision_id, ctx.decision.status],
    [ctx.mandate.mandate_id, ctx.mandate.status],
  ];
  const drafts = records.filter(([, status]) => PRE_ADOPTION.includes(status));
  if (drafts.length > 0) {
    return refuse(
      rule,
      "ENFORCED",
      `${drafts.map(([id, status]) => `${id} is ${status}`).join("; ")}. A draft is a well-formed ` +
        `chain and nothing more: it authorises no execution until the adopting authority flips its ` +
        `status and commits.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    `Every record in the chain is past adoption: ` +
      records.map(([id, status]) => `${id} ${status}`).join(", ") +
      `.`,
  );
}

/**
 * A record may name decisions that must be adopted before it acts. A
 * prerequisite that is missing or still a draft is not a delay; it is a
 * refusal, because the alternative is proceeding on the reading that
 * authorises more work.
 */
function prerequisites(ctx: CheckContext): Finding {
  const rule = PREREQUISITE_RULE;
  if (ctx.prerequisites.length === 0) {
    return pass(
      rule,
      "ENFORCED",
      `${ctx.decision.decision_id} and ${ctx.mandate.mandate_id} declare no prerequisite decisions.`,
    );
  }
  const unmet = ctx.prerequisites.filter(
    (p) => p.status === null || PRE_ADOPTION.includes(p.status),
  );
  if (unmet.length > 0) {
    return refuse(
      rule,
      "ENFORCED",
      `Prerequisite ` +
        unmet
          .map((p) => (p.status === null ? `${p.id} does not exist` : `${p.id} is ${p.status}`))
          .join("; ") +
        `. A record that names a prerequisite decision waits for it.`,
    );
  }
  return pass(
    rule,
    "ENFORCED",
    `Prerequisite decisions are adopted: ` +
      ctx.prerequisites.map((p) => `${p.id} ${p.status}`).join(", ") +
      `.`,
  );
}

/** A reference with a digest is a claim about bytes. */
function digestIntegrity(ctx: CheckContext): Finding {
  const rule = "R-SOURCE-HIERARCHY/digest";
  if (ctx.digestFailures.length > 0) {
    return refuse(
      rule,
      "ENFORCED",
      `A recorded digest does not match the file it names: ${ctx.digestFailures.join("; ")}. ` +
        `The document that was authorised is not the document on disk.`,
    );
  }
  return pass(rule, "ENFORCED", `Every recorded source digest matches its file.`);
}

/** Bootstrap may never render as ownership. */
function noFictionalOwnership(ctx: CheckContext): Finding {
  const rule = "R-NO-FICTIONAL-OWNERSHIP";
  if (ctx.authority.member_ownership_issued) {
    return pass(rule, "CHECKED", `Member ownership is recorded as issued; the prohibition does not apply.`);
  }
  const prohibited = [
    /\bmember-owned\b/i,
    /\bowned by (?:our |the )?members\b/i,
    /\bmembers own\b/i,
    /\bratified by (?:our |the )?members\b/i,
    /\btamper-proof\b/i,
    /\bnon-bypassable\b/i,
  ];
  const hits: string[] = [];
  for (const file of ctx.publicText) {
    for (const pattern of prohibited) {
      const found = file.text.match(pattern);
      if (found) hits.push(`${file.path}: "${found[0]}"`);
    }
  }
  if (hits.length > 0) {
    return refuse(
      rule,
      "CHECKED",
      `Public text claims what has not happened: ${hits.join("; ")}. ` +
        `Member ownership is not issued; the status labels change when the events occur.`,
    );
  }
  if (ctx.publicText.length === 0) {
    return {
      rule,
      enforcement: "CHECKED",
      outcome: "NOT_MACHINE_DECIDABLE",
      message:
        `No public surface exists yet, so this check had nothing to scan. It becomes meaningful at M-0001, ` +
        `when the first page is published. Reporting it as PASS would claim a verification that did not run.`,
    };
  }
  return pass(
    rule,
    "CHECKED",
    `Scanned ${ctx.publicText.length} public file(s); no prohibited ownership claim found.`,
  );
}

/**
 * Articles no machine can decide. They are reported, never counted as passed.
 * This is the honesty mechanism: a reader must be able to see the size of the
 * gap between what was written and what was verified.
 */
function interpretiveArticles(ctx: CheckContext): Finding[] {
  return [
    undecidable(
      "R-CHECKABLE-CLAIM",
      `Whether every number, date and absolute quantifier in the sources is supported by what its source ` +
        `actually says. Provenance can be required structurally; accuracy is confirmed by a named human. ` +
        `No confirmer is recorded for this run.`,
    ),
    undecidable(
      "R-SCOPE/runtime",
      `Whether an implementation stayed inside its envelope at runtime. Kernel 0.1 validates the declared ` +
        `scope but does not sandbox execution, so the envelope is advisory to the agent rather than enforced.`,
    ),
    {
      rule: "R-WEAKEST-LAYER",
      enforcement: "DECLARED",
      outcome: "NOT_MACHINE_DECIDABLE",
      // Phrased without the token the prohibited-claim scan looks for. That
      // scan cannot read polarity, so it flags a denial as readily as an
      // assertion — which is why it is CHECKED rather than ENFORCED. Here it
      // pushed the sentence toward plainer English than the double negative
      // it replaced, so the wording changed rather than the rule.
      message:
        `Weakest real enforcement layer: ${ctx.authority.weakest_enforcement_layer}. ` +
        `Every gate above can be removed by the founder without notice, so no gate here is beyond one person's reach.`,
    },
  ];
}

export function runChecks(ctx: CheckContext): Finding[] {
  return [
    humanAuthority(ctx),
    sourceHierarchy(ctx),
    typedMandate(ctx),
    classAuthorised(ctx),
    validityWindow(ctx),
    scope(ctx),
    buildDeploySeparation(ctx),
    rollback(ctx),
    truthfulStatus(ctx),
    adoption(ctx),
    prerequisites(ctx),
    digestIntegrity(ctx),
    noFictionalOwnership(ctx),
    ...interpretiveArticles(ctx),
  ];
}
