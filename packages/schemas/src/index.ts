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

/**
 * A community's charter — `ours.charter/v0.1`, built under M-0006.
 *
 * It is the root authority record of a community's own root of records,
 * read by the kernel exactly as the institution's founding authority is,
 * and it is the community's law: its articles carry classes like the
 * constitution's. The founding team is not the actor; the members are.
 */
export interface Charter extends Omit<FoundingAuthority, "schema"> {
  schema: "ours.charter/v0.1";
  /** The community's identifier; its records live under communities/<cell>/. */
  cell: string;
  version: string;
  /** True for sample records. Rendered on every surface that shows them. */
  fictional?: boolean;
  /** The CHARTER-class decision of this community that adopted the charter. Required by S-CHARTER-ADOPTED. */
  adopted_by?: string;
  /** The mandate classes this community's decisions may grant. Checked by S-CHARTER-GRANTS. */
  may_grant_mandate_classes?: MandateClass[];
  purpose: string;
  participation: string;
  /** Decision class → procedure: a vote rule, or `delegated:<role>`. */
  procedures: Record<string, string>;
  money: string;
  privacy: string;
  continuity: string;
  /** Article ids the charter's human source must carry, each with a class. */
  articles: string[];
  /** The steps to community control, done or not — never summarised as a percentage. */
  control: { steps: { step: string; done: boolean }[] };
}

export type AuthorityRecord = FoundingAuthority | Charter;

/** Who belongs — `ours.standing/v0.1`. The register is private; the count is the projection. */
export interface Standing {
  schema: "ours.standing/v0.1";
  cell: string;
  as_of: string;
  count: number;
  /** Role → the id of the person holding it. */
  roles: Record<string, string>;
  founding_team?: string[];
  /** Where the private register lives; never a path in this repository. */
  register: string;
  participation_rule: string;
  fictional?: boolean;
}

/** A vote — `ours.vote/v0.1`. Ballots are private; the tally is public; dissent is kept. */
export interface Vote {
  schema: "ours.vote/v0.1";
  vote_id: string;
  cell: string;
  decision_id: string;
  procedure: string;
  opened: string;
  closed: string;
  eligible: number;
  ballots_cast: number;
  tally: { for: number; against: number; abstain: number };
  ballots: string;
  dissent_preserved: boolean;
  dissent_note?: string;
  fictional?: boolean;
}

/** One class of data an application may reach, and the article that permits it. */
export interface ContractAccess {
  class: string;
  fields: string[];
  article: string;
}

/** One permitted disclosure: origin, the fields that may leave, the article, the purpose. */
export interface Disclosure {
  origin: string;
  fields: string[];
  article: string;
  purpose: string;
}

/** The data contract — what an application may reach, write, disclose, and import. */
export interface Contract {
  reads: ContractAccess[];
  writes: ContractAccess[];
  disclosures: Disclosure[];
  retention: string;
  /** Package roots the implementation may import besides its own files and the client. Absent means none. */
  dependencies?: string[];
}

export const OPTION_LAYERS = ["FLOOR", "GOVERNED", "PERSONAL"] as const;
export type OptionLayer = (typeof OPTION_LAYERS)[number];

/** A consequential option of a tool, with its provenance — carried forward from the feed pilot. */
export interface ToolOption {
  option_id: string;
  title: string;
  layer: OptionLayer;
  type: "enum" | "boolean" | "number";
  values?: (string | number | boolean)[];
  default: string | number | boolean;
  person_may_override: boolean;
  provenance: { article: string; decision: string };
  why: string;
  recourse: string;
}

export interface ToolArticle {
  id: string;
  title: string;
  /** Test ids in the specification's `tests` that hold this article. */
  tests: string[];
}

export interface ToolTest {
  id: string;
  name: string;
  /** The article this test holds. */
  holds: string;
}

export interface ToolRecordMeaning {
  name: string;
  meaning: string;
  fields: string[];
}

export interface Transition {
  record: string;
  requirement: string;
  verified_by: string;
}

/**
 * The service specification — `ours.tool/v0.1`.
 *
 * Durable, and the community's: the meaning of records, the behaviours as
 * articles, the options, the contract, the tests, and what a replacement
 * must carry across. Not a language: it has no control flow, no
 * expressions, and no type system, and M-0006 stops if it acquires any.
 */
export interface ToolSpec {
  schema: "ours.tool/v0.1";
  tool_id: string;
  cell: string;
  title: string;
  version: string;
  status: EvidenceState;
  human_source: SourceRef;
  fictional?: boolean;
  records: ToolRecordMeaning[];
  articles: ToolArticle[];
  options: ToolOption[];
  contract: Contract;
  tests: ToolTest[];
  transition: Transition[];
}

/** The pin — `ours.pin/v0.1`: the approved files and their digests, and the decision that pinned them. */
export interface Pin {
  schema: "ours.pin/v0.1";
  cell: string;
  pinned_by: string;
  pinned_at: string;
  files: { path: string; digest: string }[];
  fictional?: boolean;
}

/**
 * Cost as a column — LIFECYCLE.md §4, adopted with D-0004.
 *
 * Present so a record can carry what a change cost, beside what it decided.
 * STRUCTURAL only: the kernel does not evaluate these. Every number carries
 * its source or the word ESTIMATED; a blank is allowed and an invented
 * figure is not.
 */
export interface CostFields {
  hours?: number | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  usd?: number | null;
  wall_minutes?: number | null;
  source: string;
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
  /** Decisions that must be ADOPTED before this one acts. Checked under M-0004. */
  prerequisite_decisions?: string[];
  /** In a community root: the vote that produced this decision, checked against the charter's procedure. */
  vote?: string;
  /** In a community root: this decision approves and pins a specification. Required of any decision a pin names. */
  pins?: boolean;
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
  cost?: CostFields;
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
    /** Decisions that must be ADOPTED before this mandate may execute. */
    prerequisite_decisions?: string[];
  };
  institution: {
    constitution_version: string;
    cell: string;
    charter_version: string | null;
  };
  /** In a community root: the service specification this mandate implements. */
  tool?: string;
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
  limits?: {
    dependency_policy?: string;
    stop_conditions?: string[];
    /** The ceiling a build may spend — LIFECYCLE.md §4. Not evaluated. */
    budget_usd?: number | null;
  };
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
  cost?: CostFields;
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
