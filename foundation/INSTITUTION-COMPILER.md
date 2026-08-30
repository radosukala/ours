# OURS · institution compiler

**Version:** 0.1  
**Status:** FOUNDING KERNEL · TECHNICAL AND INSTITUTIONAL DESIGN DIRECTION  
**Depends on:** [THESIS.md](./THESIS.md)  
**Not:** executable code, legal advice, an adopted member constitution, or a
claim of production enforcement

## 1. Purpose

The institution compiler connects legitimate human authority to the software
that actually runs.

Its job is not merely to generate code. Its job is to prevent these gaps:

- a discussion being mistaken for a decision;
- a decision being too ambiguous to implement safely;
- an agent expanding its own task;
- an implementation violating a higher right;
- tests proving something other than the authorized outcome;
- public source differing from production;
- an operator bypassing the published process;
- a legal owner retaining power that members supposedly hold;
- a running product drifting away from its declared rules;
- a community being unable to correct, reverse, or leave.

The minimum successful compiler produces an inspectable chain:

```text
AUTHORITY
  ↓
DECISION
  ↓
MANDATE
  ↓
BUILD
  ↓
CONFORMANCE
  ↓
RELEASE AUTHORITY
  ↓
RUNNING ARTIFACT
  ↓
OUTCOME / APPEAL / REVERSAL
```

## 2. Institutional source and software projection

OURS maintains two connected but non-identical representations.

### Authoritative human source

Human-readable documents and decisions define:

- purpose;
- rights;
- duties;
- who has standing;
- authority and delegation;
- interpretation and appeal;
- amendment procedures;
- unresolved discretion.

### Executable projection

Machine-readable artifacts encode only what can legitimately and usefully be
made executable:

- permissions and prohibitions;
- thresholds and time limits;
- required evidence;
- authority scopes;
- risk classes;
- release conditions;
- data boundaries;
- deterministic invariants;
- statistical outcome checks;
- rollback and stop triggers.

Every executable rule identifies the human source, version, interpreter, and
approval that gave it force. A machine projection must never silently become
the constitution.

## 3. Core vocabulary

| Term | Meaning |
|---|---|
| **Person** | A human being. Personhood assurance and legal identity are separate questions. |
| **Participant** | A person interacting with OURS without necessarily holding membership. |
| **Member** | A person or permitted legal member holding an actually issued membership interest with defined rights and duties. |
| **Affected person** | Someone materially affected by a Product Cell who may receive standing even when not a member. |
| **Steward** | A human with bounded, reviewable authority to make or execute decisions. |
| **Operator** | A human or organization authorized to run specified systems. Operation does not imply constitutional sovereignty. |
| **Expert body** | A bounded institution with authority over a defined safety or professional domain. |
| **Agent** | Replaceable non-human implementation capacity. An agent never originates authority. |
| **Constitution** | The root human-readable source of rights and institutional authority. |
| **Charter** | The purpose, constituency, rights, and delegated authority of a Product Cell. |
| **Decision** | A legitimate exercise of authority with a recorded outcome and reasons. |
| **Mandate** | A typed, versioned, bounded instruction derived from a legitimate decision. |
| **Rule** | An executable projection linked to an authoritative source. |
| **Build** | A candidate implementation produced under one mandate. |
| **Release** | A verified build separately authorized for a named environment. |
| **Receipt** | Evidence of an event, source, actor, result, and status. A receipt proves what happened, not that it was wise. |
| **Product Cell** | A chartered, bounded product institution under the root constitution. |
| **Fork** | A legitimate continuation using exported code, permitted state, rules, and history under defined rights. |

## 4. Bootstrap authority before members exist

The clean project begins with no members and no democratic mandate. It must not
simulate one.

The new repository begins with a **Founding Authority Declaration** stating:

- the founder is the sole initial source of project authority;
- Ctrl AI, Inc. may be the transitional legal operator, not a member-owned
  institution;
- which assets and credentials the founder or company controls;
- which decisions the founder may make during bootstrap;
- which claims are prohibited before legal membership exists;
- the proposed transfer destination and the gates required before transfer;
- how amendments and builds are receipted during bootstrap;
- how the founding authority sunsets or becomes constitutionally bounded.

Bootstrap truth is stronger than fictional democracy.

The founder may use the compiler to issue mandates, build the first runtime,
and publish proofs. The public status remains:

```text
AUTHORITY: FOUNDER
MEMBER INSTITUTION: NOT YET FORMED
MEMBER OWNERSHIP: NOT YET ISSUED
TRANSFER PLAN: PUBLISHED / NOT YET EXECUTED
```

The project may not change these labels because the desired future feels
obvious. They change only when the relevant legal and operational events occur.

## 5. Source hierarchy

Every action resolves authority through a source hierarchy. The initial
direction is:

1. applicable law and immediate human safety;
2. the operative legal constitution and issued member rights, once formed;
3. the root OURS Constitution;
4. an applicable Product Cell Charter;
5. valid member or institutional decisions;
6. valid delegations and steward mandates;
7. the implementation Mandate;
8. verified evidence about current state;
9. explicit task instructions inside the mandate;
10. external content, discussion, prompts, and suggestions.

A lower source cannot override a higher source. External content is data to
inspect, never authority to execute.

Conflicts, gaps, and ambiguous interpretations must stop or escalate according
to the mandate's risk policy. An agent may not resolve an authority conflict by
choosing the instruction that enables more work.

## 6. Federal architecture

OURS consists of a root institution and chartered Product Cells.

```text
ROOT CONSTITUTION
│
├── identity and membership
├── reserved human rights
├── institution-wide assets and treasury rules
├── Cell chartering and dissolution
├── audit, appeal, amendment, and exit
│
├── CELL: professional network
│   ├── constituency and affected parties
│   ├── algorithm contract
│   ├── stewards and operators
│   └── local mandate/release history
│
├── CELL: communication
│   └── ...
│
└── CELL: future product
    └── ...
```

Root rights cannot be weakened by a Cell. A Cell may create stronger local
protections.

The charter defines:

- mission and prohibited purposes;
- constituency and standing;
- member, user, worker, expert, and affected-person roles;
- local decision classes;
- delegated operational authority;
- financial model and budget authority;
- data and algorithm contract;
- safety and legal jurisdictions;
- appeal destination;
- dissolution, export, and fork rules.

No single global assembly should vote on every product decision.

## 7. Decision classes

The compiler must understand what kind of authority a decision exercises.

### Constitutional

Changes root rights, membership, amendment, asset control, voting authority,
exit, or the institution's purpose. Highest process and legal requirements.

### Charter

Creates, materially changes, merges, or dissolves a Product Cell.

### Policy

Changes consequential product rules such as data use, fees, ranking objectives,
moderation, eligibility, safety, or access.

### Product mandate

Authorizes a bounded product outcome inside an existing charter and policy.

### Operational

Executes routine, reversible work inside an existing delegation: maintenance,
support, dependency updates, capacity changes, or incident prevention.

### Emergency

Temporarily protects safety, security, privacy, funds, or service continuity.
Emergency authority must be narrow, time-limited, immediately receipted,
reviewed after use, and unable to amend the constitution.

### Adjudicative

Resolves an appeal, conflict, sanction, or interpretation through a defined and
independent process.

The exact thresholds, quorums, chambers, juries, and voting systems are future
constitutional decisions. The compiler must support plural procedures rather
than encode majority voting as a universal truth.

## 8. The canonical artifact chain

Every material release should be reconstructable from versioned artifacts.

### 8.1 Proposal

States the problem, affected people, requested decision, alternatives, evidence,
cost, risk, counter-case, and unresolved questions.

### 8.2 Deliberation record

Preserves structured positions, evidence, conflicts of interest, material
dissent, and corrections. Engagement volume is not evidence or authority.

### 8.3 Decision receipt

Records:

- decision and version;
- authority and procedure;
- participants and conflicts where appropriate;
- sources considered;
- exact outcome;
- reasons and preserved dissent;
- effective date, expiry, and appeal path;
- whether the result authorizes a mandate.

### 8.4 Mandate

Compiles the legitimate decision into implementation authority. A social post,
chat, meeting transcript, or proposal thread is never an implementation
mandate.

### 8.5 Build receipt

Records the agent/provider, context sources, repository state, files and systems
changed, dependencies, tests, artifacts, cost, failures, unresolved risk, and
truthful status.

### 8.6 Conformance report

Maps constitutional rules, charter rules, policy, acceptance criteria, and
security/privacy/accessibility requirements to actual checks and results.

### 8.7 Release receipt

Connects a specific artifact digest to deploy authority, environment,
configuration class, migration set, operator, time, rollback, and public
verification.

### 8.8 Observation

Records measured outcomes, incidents, costs, complaints, appeals, unintended
effects, and whether the original hypothesis survived contact with reality.

### 8.9 Reversal or continuation

Closes the loop with an explicit decision to retain, change, stop, or reverse.

## 9. Mandate intermediate representation

The first machine-addressable object should be `ours.mandate/v0.1`.

Illustrative shape:

```yaml
schema: ours.mandate/v0.1
mandate_id: M-0001
title: Build the first public authority trace

authority:
  source_decision: D-0001
  class: BUILD
  granted_by: founder-bootstrap
  valid_from: 2026-09-01T00:00:00Z
  expires_at: 2026-09-08T00:00:00Z

institution:
  constitution_version: ours-constitution/0.1
  cell: root
  charter_version: null

objective: >
  Publish a page that lets a visitor reconstruct the authority, mandate,
  build, verification, and release behind the running page.

human_outcome: >
  A visitor can verify that production derives from named authority rather
  than trusting a claim.

adopted_constraints:
  - Do not imply legal membership or member ownership exists.
  - No personal data is public.
  - The implementation agent cannot authorize deployment.

hypotheses:
  - A non-technical visitor can understand the trace in under two minutes.

scope:
  repositories: [ours]
  paths:
    allow: [app/proof/**, packages/kernel/**, tests/**, docs/**]
    deny: [infra/production-secrets/**]
  external_systems: []

risk:
  class: LOW
  reversibility: ADDITIVE
  affected_groups: [public-visitors]

requirements:
  security: [no-secret-exposure]
  privacy: [no-private-identity-projection]
  accessibility: [wcag-aa-target]
  constitutional_rules: [R-HUMAN-AUTHORITY, R-TRUTHFUL-STATUS]

acceptance:
  tests:
    - An invalid authority chain is rejected.
    - Every rendered release link resolves to a versioned source.
    - The page states BOOTSTRAP AUTHORITY without member-owned language.
  evidence:
    - production artifact digest
    - conformance report
    - narrow-mobile and desktop inspection

limits:
  budget_usd: 50
  dependency_policy: justify-new
  stop_conditions:
    - authority validation fails
    - private data appears in a public projection

release:
  deploy_authority_required: true
  environments: [preview]
  production_allowed: false
  rollback: remove additive route and restore prior manifest

human_approvals:
  ambiguity: founder
  deploy: founder
```

The format will evolve. Its essential property is that an agent can determine
both what it may do and what it must refuse.

## 10. Compiler stages

### Stage 1: Resolve authority

Validate that the decision exists, its actor had authority, required procedure
completed, no higher source blocks it, and the mandate is still valid.

### Stage 2: Type-check the mandate

Reject missing scope, undefined outcomes, unverifiable acceptance criteria,
conflicting rules, unauthorized risk, absent rollback, or hidden discretion.

Not all ambiguity can be removed. Material ambiguity becomes a named human
decision point rather than an agent guess.

### Stage 3: Construct the task envelope

Select the minimum sources, tools, data, credentials, and environment necessary.
Authority is capability-scoped rather than expressed only as prose.

### Stage 4: Build in isolation

Agents work in a sandbox or bounded repository context. They may draft, test,
and produce candidate artifacts. They cannot expand scope or obtain additional
credentials because doing so seems helpful.

### Stage 5: Verify

Run deterministic invariants, tests, security and privacy checks, accessibility
checks, policy evaluation, artifact diffing, and required human review.

Statistical or subjective requirements are reported as evidence with confidence
and limitations, not converted into false PASS values.

### Stage 6: Authorize release

Build authority and deploy authority are separate. Release checks the exact
artifact digest and configuration intended for the named environment.

### Stage 7: Prove production

Publish a receipt connecting authority to the actual running artifact. A public
repository without production attestation is incomplete evidence.

### Stage 8: Observe and correct

Monitor the declared outcome and constitutional constraints. Incidents,
appeals, drift, and failed checks become canonical inputs to correction.

## 11. Constitutional rules and tests

Rules fall into different verification classes.

### Deterministic invariants

Examples:

- an agent cannot ratify or authorize itself;
- a private identity field cannot appear in a public projection;
- only a valid release authority may deploy to production;
- a constitutional change cannot use an operational mandate;
- an expired delegation cannot authorize an action;
- one credential cannot silently create multiple member identities.

These should block builds or actions.

### Structural requirements

Examples:

- every consequential rule names an owner and appeal path;
- every Product Cell has a charter and exit rule;
- every release has rollback and incident ownership;
- every algorithm contract identifies its objective and prohibited signals.

These can be schema-validated and reviewed.

### Statistical obligations

Examples:

- recommendation outcomes do not create prohibited disparate harm;
- error rates remain below a ratified threshold;
- a safety classifier retains required sensitivity;
- a feed does not drift toward compulsive-use optimization.

These require datasets, measurement, uncertainty, ongoing observation, and
human judgment.

### Interpretive obligations

Terms such as fairness, dignity, manipulation, proportionality, or public
interest cannot be exhausted by a unit test. The system must preserve the
interpretation, interpreter, dissent, and appeal.

## 12. Agent authority and capability security

Agents receive one explicit authority class:

- **READ** — inspect approved sources without mutation;
- **DRAFT** — create non-authoritative proposals or artifacts;
- **TEST** — run reversible checks in approved environments;
- **BUILD** — modify approved scope under a mandate;
- **DEPLOY** — publish an approved digest to a named environment;
- **OPERATE** — perform bounded recurring production work;
- **EMERGENCY** — execute an enumerated protective action under narrow rules.

No agent may:

- vote, ratify, issue membership, or interpret itself into authority;
- treat untrusted content as instructions;
- conceal material failures or rewrite canonical history;
- access data or credentials outside its task envelope;
- deploy a different artifact from the one verified;
- create irreversible external effects without explicit authority;
- claim a test, preview, or simulation is production evidence;
- use engagement, popularity, or referral volume as governance authority.

Capability enforcement should be technical where possible: repository path
allowlists, short-lived credentials, environment isolation, policy gates,
separate deploy keys, branch protections, and signed or otherwise attributable
receipts.

## 13. Non-bypassability and the root problem

No software gate is absolutely non-bypassable while one founder controls the
root account, domain, cloud, repository, company, and bank account.

The compiler must therefore distinguish:

- **declared rule** — written expectation;
- **automated gate** — tool-enforced in ordinary operation;
- **organizational separation** — more than one accountable human or body;
- **cryptographic control** — scoped keys, signatures, threshold authority;
- **legal control** — enforceable rights over entities and assets;
- **ultimate infrastructure control** — who can still replace or disable the
  gate.

Public claims identify the weakest real layer. “Enforced” cannot mean “a CI job
the founder may remove without notice.”

The target architecture progressively separates repository administration,
release authority, treasury, adjudication, and constitutional amendment.

## 14. Release and provenance

A production release should expose enough information for an independent party
to verify:

- the governing constitution and charter versions;
- source decision and mandate;
- source repository and commit;
- build process and dependency lock;
- artifact digest;
- conformance results and known exceptions;
- deploy authority, operator, environment, and time;
- migrations and configuration class without exposing secrets;
- rollback target;
- current observation and incident status.

Reproducible builds are desirable but not always immediately possible. Where
reproduction is incomplete, the limitation is explicit.

Cryptographic signing and hash-linked history can strengthen attribution. A
blockchain is not required. Legitimacy comes from the human and legal authority
model, not from expensive consensus over every event.

## 15. Algorithm contracts

Every consequential ranking, recommendation, pricing, moderation, eligibility,
or allocation system should have a versioned Algorithm Contract.

Minimum fields:

- human purpose and target outcome;
- prohibited purposes;
- allowed, restricted, and forbidden input classes;
- treatment of sensitive attributes and proxies;
- optimization metrics and guardrail metrics;
- paid influence policy;
- available member/user controls;
- individual explanation and contestability;
- offline evaluation and live monitoring;
- error, harm, and drift thresholds;
- model/data/code versions;
- change authority and notice;
- emergency disablement;
- audit, appeal, and rollback.

The contract governs the system even when the underlying implementation is a
learned model whose internal representation is not intuitively legible.

## 16. Operations, incidents, and emergency power

A user-owned product still needs professional operation.

Each production system names:

- service owner and on-call responsibility;
- operational budget and service target;
- data controller/processor roles;
- security and privacy incident process;
- support and moderation processes;
- backup and restore evidence;
- dependency and provider risks;
- emergency actions and their limits;
- post-incident review and member notice.

Emergency authority may pause writes, isolate a compromised service, rotate a
credential, roll back a release, or protect a person. It may not permanently
change constitutional rights, seize assets, hide its use, or renew itself
without review.

Governance that cannot respond to an incident is not sovereignty. It is a
meeting schedule.

## 17. Legal and asset control

The new repository must maintain an Asset and Authority Map.

For every material asset it records:

| Asset | Current legal owner | Current technical controller | Intended constitutional owner/controller | Transfer or control mechanism | Recovery and dispute path |
|---|---|---|---|---|---|
| legal entity | TBD | TBD | TBD | legal instrument | TBD |
| domain | founder/related entity | registrar account | member institution or purpose-bound holder | assignment + account control | TBD |
| trademark | TBD | n/a | purpose-bound holder | assignment/license | TBD |
| repository | founder/company | hosting admins | institution | org governance + license | mirror/fork |
| infrastructure | company | operator credentials | institution through delegated operators | contract + scoped access | provider migration |
| treasury | company/TBD | bank/payment admins | institution | legal account + approval policy | succession |
| member register | data controller | production operators | institution subject to privacy law | governance + DPA | export/correction |
| public event history | project | repository/storage admins | public/institution | open license + mirrors | independent verification |

The exact legal structure requires licensed advice. A cooperative, membership
entity, public-benefit structure, foundation, trust, or combination may serve
different needs. Code must not silently choose the legal constitution.

Ctrl AI, Inc. may bootstrap development as a disclosed transitional operator.
Its control is a current fact and a transfer problem, not proof of member
ownership.

## 18. Privacy, identity, and standing

Public verifiability does not require publishing private identity or activity.

The architecture separates:

- public constitutional events and aggregate evidence;
- member-visible institutional records;
- private account, identity, safety, and recovery data;
- sealed or access-controlled adjudication evidence;
- purpose-bound operational telemetry.

Personhood assurance, account authentication, legal identity, age assurance,
professional credentials, residence, membership, and affected-person standing
are different claims. A Product Cell requests only the proof level required for
its purpose.

No universal public reputation score should emerge from participation. No
identity provider should become an unreviewable constitutional gatekeeper.

Children and vulnerable people require specific rights, minimization,
age-appropriate participation, independent safeguards, and legal review.

## 19. Exit and fork as infrastructure

Exit is not a sentence in terms of service. It is a maintained capability.

Depending on rights and privacy, an Exit Pack can include:

- source code and dependency manifests;
- constitutions, charters, mandates, decisions, and public receipts;
- schemas and migration history;
- reproducible or documented build instructions;
- the member's own data in interoperable form;
- portable relationship edges where counterparties have consented;
- public institutional state;
- trademark and naming rules;
- operating instructions and known limitations.

It must not include another person's private data merely because a fork is
constitutionally permitted.

Fork drills should occur before a crisis. A fork that has never been attempted
is an aspiration.

## 20. Threat model

The kernel is incomplete unless it anticipates attacks on both software and
legitimacy.

- **Founder capture:** transitional control never transfers.
- **Capital capture:** financing terms indirectly acquire constitutional power.
- **Steward capture:** operators coordinate, withhold information, or entrench
  themselves.
- **Majority abuse:** a popular decision violates minority or affected-person
  rights.
- **Apathy:** a small active group governs a passive membership.
- **Sybil attack:** one actor manufactures identities or participation.
- **Bribery and coercion:** formally equal votes are economically controlled.
- **Governance spam:** proposal volume exhausts attention and slows operation.
- **Agent scope expansion:** an agent interprets usefulness as permission.
- **Prompt injection:** external content attempts to become authority.
- **Policy drift:** human text, machine rules, tests, and production diverge.
- **Artifact substitution:** a verified build is not what gets deployed.
- **Root bypass:** an administrator removes or routes around enforcement.
- **Legal mismatch:** public governance has no effect on asset ownership.
- **Privacy leakage:** transparency exposes personal or safety-sensitive data.
- **Emergency normalization:** temporary powers become routine government.
- **Metric capture:** what is easy to measure silently replaces the human
  objective.
- **Safety theater:** many receipts create volume without proving outcomes.
- **Adoption failure:** the institution works but no personally valuable
  product gives people reason to join.

Each implemented feature must identify the threats it reduces and the new
power it creates.

## 21. Implementation principles

1. Start with one authority path, not a universal governance language.
2. Preserve authoritative human text beside executable projections.
3. Make ambiguity and discretion visible.
4. Separate build from deployment authority.
5. Enforce the narrowest capability technically available.
6. Publish truthful status: proposed, adopted, implemented, tested, deployed,
   observed, blocked, or reversed.
7. Treat receipts as evidence, not moral legitimacy.
8. Test unauthorized paths, not only successful ones.
9. Make rollback and export part of initial design.
10. Keep providers, models, frameworks, and infrastructure replaceable.
11. Do not build generalized machinery before one real loop needs it.
12. Let the institution learn from failure without rewriting history.

## 22. Open design questions

- What is the smallest legitimate membership unit?
- Which rights are individual and which are collective?
- How is affected-person standing established?
- Which decisions require direct member authority, elected bodies, sampled
  juries, professional review, or delegated stewardship?
- How do members replace stewards without making operation unstable?
- What is the appellate institution and how is it independent?
- Which constitutional rules can be executable without erasing discretion?
- What provider-neutral interface should agents implement?
- What attestation proves that production runs the verified artifact?
- How is the root key progressively dissolved into institutional control?
- What legal structure can bind domain, trademark, code, data, and treasury to
  the same authority model?
- What first Product Cell creates enough personal value to validate the system?

The first product should answer some of these through use. It should not pretend
to settle all of them before the first build.

