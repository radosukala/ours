# OURS · first product

**Product:** OURS Kernel 0.1  
**Status:** BUILD DIRECTION · NOT YET IMPLEMENTED  
**Depends on:** [THESIS.md](./THESIS.md) and
[INSTITUTION-COMPILER.md](./INSTITUTION-COMPILER.md)

## 1. Product definition

> **OURS Kernel is a provider-neutral authority-to-software runtime that
> validates a legitimate mandate, gives an agent only the capabilities that
> mandate allows, verifies the result against constitutional rules, and
> produces an independently checkable release trace.**

The first user is OURS itself.

The first product is not a framework presentation. It is one working,
self-hosted causal loop.

## 2. The first proof

Kernel 0.1 must demonstrate four events:

1. **A valid mandate changes software.**
2. **An invalid mandate cannot change software.**
3. **Only a separately authorized artifact reaches a named deployment.**
4. **The change can be reversed and independently reconstructed.**

The proof is complete only when a visitor can move from the running page back
through:

```text
RUNNING ARTIFACT
→ release receipt
→ conformance report
→ build receipt
→ mandate
→ decision
→ founding authority
```

and when a local verifier can reproduce the authority and digest checks without
access to OURS infrastructure.

## 3. Honest bootstrap

The compiler cannot emerge from authority it has not yet encoded.

The repository therefore begins with a small manual bootstrap:

1. The founder writes and signs or otherwise attributes
   `FOUNDING-AUTHORITY.md`.
2. The founder adopts `CONSTITUTION-0.1.md` as project law during bootstrap.
3. The founder issues `D-0000` authorizing the construction of Kernel 0.1.
4. `D-0000` compiles manually into the first typed mandate, `M-0000`.
5. An agent builds the minimum validator and proof surface from `M-0000`.
6. From that point, material builds must pass through the kernel.

This is analogous to bootstrapping a compiler with an earlier implementation.
The manual seed is not hidden. Its scope and privileged status are visible.

The first self-hosted mandate, `M-0001`, must be processed by Kernel 0.1 rather
than manually trusted.

## 4. M-0001: the self-hosting change

The recommended first self-hosted change is:

> **Build the public Authority Trace that explains why the Authority Trace
> itself is running.**

It is intentionally recursive and easy to verify.

The candidate experience:

```text
OURSORG.COM / PROOF / M-0001

RUNNING                         VERIFIED
RELEASE                         R-0001
AUTHORIZED BY                   D-0001
IMPLEMENTATION MANDATE          M-0001
ROOT SOURCE                     FOUNDING AUTHORITY 0.1
AGENT                           named provider + model + task digest
CONSTITUTIONAL CHECKS           8 / 8
PRODUCT TESTS                   14 / 14
KNOWN LIMITATIONS               3
DEPLOYED                        exact time + artifact digest
ROLLBACK                        ready

[READ THE DECISION]
[READ THE MANDATE]
[VERIFY LOCALLY]
[DOWNLOAD THE EXIT PACK]
```

The page must state that founder authority—not member authority—authorized the
release.

## 5. M-0002: the refusal proof

A governance product that only demonstrates successful happy paths proves very
little.

M-0002 should deliberately request something invalid, for example:

- deploy to production with BUILD authority only;
- read a denied secret path;
- claim member ownership exists;
- modify a path outside the allowlist;
- omit rollback for a high-risk change;
- use an expired decision.

The kernel must reject the task before agent execution or block the resulting
artifact before release. The public proof should show:

- which source rejected it;
- which rule applied;
- whether any side effect occurred;
- how the request could become valid through legitimate authority.

The refusal is a first-class product artifact, not a test hidden in CI.

## 6. M-0003: reversal

The first deployed change must be reversed under a separate authorized mandate,
then optionally redeployed.

This proves:

- the rollback instruction was real;
- the prior artifact remained available;
- release authority is distinct from build authority;
- state and schema changes can be reversed or safely continued;
- the receipt history is append-only rather than rewritten to show only the
  preferred final state.

## 7. Kernel 0.1 components

### 7.1 Source registry

A versioned registry of constitutions, charters, decisions, mandates, rules,
build receipts, releases, observations, and reversals.

Git is sufficient for Kernel 0.1. A database should not be introduced until a
real runtime requirement needs one.

### 7.2 Schema package

Machine schemas and human-readable documentation for:

- authority declarations;
- source documents;
- decisions;
- mandates;
- executable rules;
- build/conformance/release receipts;
- observations, appeals, and reversals.

Every record carries an ID, schema version, status, source references, content
digest, actor, and time.

### 7.3 Authority resolver

A deterministic library that answers:

- Does this source exist and match its digest?
- Was the actor allowed to issue this decision?
- Does the decision authorize this mandate class?
- Has the authority expired, been superseded, appealed, or revoked?
- Does a higher rule prohibit the request?
- Is human interpretation still required?

### 7.4 Mandate type-checker

Validates required scope, objectives, adopted constraints, risk,
constitutional mappings, evidence, stop conditions, approvals, and rollback.

It must reject false precision. “Make it fair and deploy” is not a valid
mandate merely because it parses as YAML.

### 7.5 Capability envelope

Compiles a valid mandate into the narrowest practical execution environment:

- allowed repository and paths;
- read/write permissions;
- permitted commands or tools;
- network policy;
- data classes;
- short-lived credentials;
- time and cost limits;
- explicit external systems;
- build versus deploy capability.

Kernel 0.1 may enforce only a subset technically. Every unenforced field must be
reported as declaration-only rather than called a gate.

### 7.6 Agent adapter

*Superseded by `D-0006` on 8 September 2026: any spec-driven pipeline
under an OURS service specification serves this role, and OURS builds no
adapter of its own — see `THE-LAYER.md` §5. The text below is retained.*

A provider-neutral interface for giving the same task envelope to a coding
agent and collecting structured output.

Kernel 0.1 needs one working adapter and a documented second-provider fixture.
It does not need to orchestrate every model.

### 7.7 Conformance runner

Runs:

- authority and mandate validation;
- deterministic constitutional rules;
- repository and artifact diff checks;
- product tests;
- security, privacy, accessibility, and dependency checks required by the
  mandate;
- receipt completeness;
- prohibited-claim checks;
- deploy-digest verification.

### 7.8 Release gate

Accepts one exact build digest, one deploy authorization, and one named
environment. It refuses artifact substitution, missing approvals, expired
authority, or a failed required check.

### 7.9 Offline verifier

A small CLI that accepts an exported proof bundle and verifies:

- record digests and references;
- the authority chain;
- mandate validity;
- conformance result signatures/attribution where implemented;
- release artifact digest;
- append-only event linkage.

The verifier must not require an OURS account or API.

### 7.10 Public proof surface

A human-readable web projection over the same records consumed by the verifier.
It must not maintain a separate hand-written story.

## 8. Proposed clean repository shape

```text
ours/
├── README.md
├── AGENTS.md
├── LICENSE
├── authority/
│   └── FOUNDING-AUTHORITY.md
├── constitution/
│   └── CONSTITUTION-0.1.md
├── decisions/
│   ├── D-0000.md
│   └── D-0000.yaml
├── mandates/
│   ├── M-0000.md
│   └── M-0000.yaml
├── rules/
│   └── root/
├── receipts/
│   ├── builds/
│   ├── conformance/
│   └── releases/
├── observations/
├── packages/
│   ├── schemas/
│   ├── kernel/
│   ├── cli/
│   ├── verifier/
│   └── agent-adapter/
├── apps/
│   └── proof/
├── tests/
│   ├── authority/
│   ├── adversarial/
│   ├── conformance/
│   └── e2e/
└── exit/
    └── README.md
```

`AGENTS.md` should point coding agents to the source hierarchy and state that a
conversation is not build authority. CI, not agent memory, must enforce the
machine-checkable portion.

## 9. Suggested implementation boundary

The initial technical direction is:

- TypeScript for schemas, validator, CLI, and proof application;
- JSON Schema or another widely supported schema format for portable records;
- YAML or JSON machine records paired with Markdown human sources;
- Git as the canonical bootstrap record;
- a pure deterministic authority kernel without network access;
- a small web projection, not an administration platform;
- CI as the first conformance and release gate;
- provider-neutral agent envelopes;
- no database until participation or operational state requires one;
- no blockchain;
- no custom model training;
- no production personal data.

These are implementation directions, not irreversible constitutional choices.
The first Change Pack may alter them with reasons.

## 10. What Kernel 0.1 deliberately does not build

- public membership enrollment;
- legal membership or ownership issuance;
- a Founding Million or any artificial cap;
- voting, delegation, juries, or election systems;
- a social feed;
- a professional-network replacement;
- tokens, wallets, or tradable rights;
- a treasury;
- a universal natural-language constitution compiler;
- automated resolution of constitutional ambiguity;
- a proprietary cloud platform;
- multi-tenant enterprise governance;
- a general-purpose policy language;
- an autonomous production operator;
- claims that the system is tamper-proof or legally member-owned.

These exclusions protect the proof from becoming another speculative platform.

## 11. Required rules for Kernel 0.1

At minimum, the first constitution and kernel should represent and test:

1. **Human authority:** an agent cannot originate or expand authority.
2. **Source hierarchy:** lower sources cannot override higher ones.
3. **Typed mandate:** no material build without a valid mandate.
4. **Scope:** denied paths and systems remain denied.
5. **Truthful status:** draft, tested, deployed, and observed are distinct.
6. **Public/private boundary:** no private identity or secrets in public proof.
7. **Build/deploy separation:** BUILD cannot publish to production.
8. **Exact artifact:** deployed digest must match the authorized build.
9. **Rollback:** a release must name an actionable reversal.
10. **No fictional ownership:** bootstrap status cannot render as member-owned.

## 12. Proof gates

Kernel 0.1 is not complete because the interface looks convincing. It passes
only when:

- a valid authority chain deterministically validates;
- at least five materially invalid chains fail for the correct reasons;
- an agent completes M-0001 without receiving deploy capability;
- an out-of-scope write is blocked or detected before release;
- required constitutional rules map to actual checks;
- a separately authorized exact digest reaches preview or production;
- the public page resolves every source and truthfully names limitations;
- a clean machine verifies the exported proof offline;
- a different agent/provider can consume the same mandate without rewriting
  its authority semantics;
- M-0003 demonstrates reversal;
- a fork drill starts the public proof from the Exit Pack;
- an external reader can correctly answer who authorized the release, what the
  agent could do, what was tested, what remains unproven, and how to reverse it.

## 13. Evidence states

Every public statement uses one of these states:

- **PROPOSED** — an idea awaiting authority;
- **ADOPTED** — legitimately decided, not necessarily implemented;
- **IMPLEMENTED** — present in a candidate artifact;
- **TESTED** — named checks passed in a named environment;
- **DEPLOYED** — an exact artifact is running in a named environment;
- **OBSERVED** — real use or outcomes were measured;
- **BLOCKED** — a named condition prevents progress;
- **FAILED** — a required test or outcome did not hold;
- **REVERSED** — a prior change was explicitly undone;
- **SUPERSEDED** — a later legitimate source replaced it without erasing it.

The UI must not compress these into a green check.

## 14. First external validation

Before membership or a broad launch, Kernel 0.1 should face three kinds of
external review.

### Comprehension

Five people unfamiliar with the repository inspect one Authority Trace. They
must correctly identify authority, mandate, agent scope, production status,
known limitations, and reversal without coaching.

### Adversarial review

Security, governance, and legal reviewers try to locate bypasses, false
ownership claims, missing standing, privacy leakage, and root-control theater.

### Portability

A second small project uses the kernel for one reversible change. This tests
whether the system is a reusable institution compiler or only documentation
tailored to OURS.

No broad category claim should precede these tests.

## 15. Selecting the first Product Cell

The first Product Cell comes after the kernel proof. It should score well on:

- immediate personal value without governance participation;
- a rule or algorithm whose objective matters visibly;
- an incumbent incentive conflict people already understand;
- incremental adoption rather than an all-or-nothing migration;
- low initial safety and regulatory risk;
- portable user data and relationships;
- measurable outcomes and switching behavior;
- sustainable aligned revenue;
- a bounded constituency able to make legitimate decisions.

A professional network is a credible candidate, not an adopted decision. A
product governing children's digital lives is a powerful North Star but a poor
first Cell because the standing, safety, privacy, and legal model is unusually
complex.

## 16. Distribution principle

The framework is not the shareable object. Proof is.

Potential public artifacts include:

- “Why is this code running?” — an interactive Authority Trace;
- a visible refused mandate;
- an Algorithm Contract that lets a person change modes and inspect why an item
  appeared;
- a public rollback;
- an Exit Pack that boots independently;
- side-by-side outcomes under a profit objective and a member-ratified
  objective.

The message should lead to one checkable action, not require reading the whole
thesis.

## 17. Stop conditions

Pause generalization and reassess if:

- the mandate schema becomes a large language before one loop works;
- agents routinely require discussion history outside their mandate;
- an operator can bypass the release gate without a visible event;
- external reviewers cannot distinguish authority from implementation;
- the public trace is understandable only to developers;
- receipts grow faster than useful evidence;
- the project starts promising ownership before legal control changes;
- the first Cell requires a mass network before offering personal value;
- the team uses expected virality as a substitute for observed adoption.

## 18. Kernel 0.1 outcome

At completion, OURS should be able to make one narrow, truthful claim:

> **This running software came from this human authority, through this bounded
> mandate, was built by this replaceable agent, passed these exact checks, was
> deployed under separate authority, and can be independently verified and
> reversed.**

That is enough for version 0.1. Everything larger must be earned from it.

