/**
 * The record types the kernel operates on.
 *
 * These are deliberately narrow. Kernel 0.1 exists to answer one question —
 * is this mandate authorized, by whom, within what bounds — and every field
 * here earns its place by being needed to answer it. A field that only
 * describes something, without being checked, belongs in the Markdown source
 * beside it, not in the machine projection.
 */

/** Truthful status. These never collapse into a single mark of approval. */
export const EVIDENCE_STATES = [
  "PROPOSED",
  "ADOPTED",
  "IMPLEMENTED",
  "TESTED",
  "DEPLOYED",
  "OBSERVED",
  "BLOCKED",
  "FAILED",
  "REVERSED",
  "SUPERSEDED",
  "DRAFT",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const DECISION_CLASSES = [
  "CONSTITUTIONAL",
  "CHARTER",
  "POLICY",
  "PRODUCT_MANDATE",
  "OPERATIONAL",
  "EMERGENCY",
  "ADJUDICATIVE",
] as const;
export type DecisionClass = (typeof DECISION_CLASSES)[number];

/**
 * Agent authority classes. BUILD and DEPLOY are separate on purpose and are
 * never held together by default — see Constitution R-BUILD-DEPLOY.
 */
export const MANDATE_CLASSES = [
  "READ",
  "DRAFT",
  "TEST",
  "BUILD",
  "DEPLOY",
  "OPERATE",
  "EMERGENCY",
] as const;
export type MandateClass = (typeof MANDATE_CLASSES)[number];

/**
 * How a rule is actually held today.
 *
 * This is the honesty mechanism. A conformance report that counts passing
 * checks without reporting these classes is claiming a verification the
 * constitution cannot support, because most constitutional language is not
 * machine-decidable.
 */
export const ENFORCEMENT_CLASSES = [
  "ENFORCED",
  "CHECKED",
  "STRUCTURAL",
  "INTERPRETED",
  "DECLARED",
] as const;
export type EnforcementClass = (typeof ENFORCEMENT_CLASSES)[number];

export type ActorKind = "human" | "agent";

export interface Actor {
  id: string;
  kind: ActorKind;
  role: string;
}

export interface SourceRef {
  path: string;
  /** Recorded content digest. When present it must match the file's bytes. */
  digest?: string;
}

export interface FoundingAuthority {
  schema: "ours.authority/v0.1";
  authority_id: string;
  title: string;
  status: EvidenceState;
  human_source: SourceRef;
  root: boolean;
  actor: Actor;
  may_issue_decision_classes: DecisionClass[];
  member_institution_formed: boolean;
  member_ownership_issued: boolean;
  legal_membership_issued: boolean;
  weakest_enforcement_layer: string;
  weakest_layer_note?: string;
}

export interface Decision {
  schema: "ours.decision/v0.1";
  decision_id: string;
  title: string;
  status: EvidenceState;
  class: DecisionClass;
  authority: {
    source: string;
    actor: Actor;
    procedure: string;
    higher_sources: SourceRef[];
  };
  human_source: SourceRef;
  outcome: string;
  authorizes: {
    mandate_classes: MandateClass[];
    mandate_ids: string[];
  };
  prohibits?: string[];
  effective_from: string;
  expires_at: string | null;
  dissent: unknown[];
  dissent_note?: string;
  appeal?: { available: boolean; reason?: string };
}

export type Reversibility = "ADDITIVE" | "REVERSIBLE" | "DESTRUCTIVE";

export interface Mandate {
  schema: "ours.mandate/v0.1";
  mandate_id: string;
  title: string;
  status: EvidenceState;
  class: MandateClass;
  authority: {
    source_decision: string;
    granted_by: string;
    actor: Actor;
    valid_from: string;
    expires_at: string;
  };
  institution: {
    constitution_version: string;
    cell: string;
    charter_version: string | null;
  };
  human_source: SourceRef;
  objective: string;
  human_outcome: string;
  adopted_constraints: string[];
  hypotheses?: string[];
  scope: {
    repositories: string[];
    paths: { allow: string[]; deny: string[] };
    external_systems: string[];
  };
  risk: {
    class: "LOW" | "MEDIUM" | "HIGH";
    reversibility: Reversibility;
    affected_groups: string[];
  };
  requirements: {
    constitutional_rules: string[];
    security?: string[];
    privacy?: string[];
  };
  acceptance: { tests: string[]; evidence: string[] };
  limits?: { dependency_policy?: string; stop_conditions?: string[] };
  release: {
    deploy_authority_required: boolean;
    environments: string[];
    production_allowed: boolean;
  };
  rollback: {
    method: string;
    /**
     * What survives the rollback: dropped data, sent messages, executed
     * payments, third-party state, anything a person already saw. "none" is
     * a claim, and a destructive change may not make it.
     */
    irreversible_residue: string;
  };
  human_approvals: Record<string, string>;
}

/** One rule's verdict. Never summarised without its enforcement class. */
export interface Finding {
  rule: string;
  enforcement: EnforcementClass;
  outcome: "PASS" | "REFUSED" | "NOT_MACHINE_DECIDABLE";
  message: string;
}

export interface CompileResult {
  authorized: boolean;
  findings: Finding[];
}
