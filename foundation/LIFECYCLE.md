# OURS · the lifecycle of a change

**Version:** 0.1  
**Status:** ADOPTED · DIRECTION — adopted with `D-0004` on 8 September 2026, from
[`P-0001`](../proposals/P-0001.md)  
**Prepared:** 4 September 2026  
**Depends on:** [THESIS.md](./THESIS.md) §5,
[INSTITUTION-COMPILER.md](./INSTITUTION-COMPILER.md) §8 and §10,
[`constitution/CONSTITUTION-0.1.md`](../constitution/CONSTITUTION-0.1.md)  
**Not:** a claim that every station exists today — §6 says which do

## 1. Why this document exists

The thesis says implementation is becoming abundant and that the scarce
parts are deciding what should exist and proving that it behaves. Said that
way, it is a claim. OURS is built to make it a measurement: every change
passes through named stations, each station produces a record, and each
record carries who acted, why the station exists, how it is held, and what
it cost. A person can then read, for any change, how much of it was
judgment, how much was verification, and how much was code — and see for
themselves that the part which used to buy control is the cheap one.

The product-level differentiator is that every setting carries its reason.
The institution-level differentiator is the same thing one level up:
**every station carries its reason.**

## 2. The ring

```text
 STANDING → PROPOSAL → DELIBERATION → DECISION → MANDATE → ENVELOPE → BUILD
    ▲                                                                   │
    │                                                                   ▼
 AMENDMENT ← EXIT ← CORRECTION ← OBSERVATION ← AUDIT ← RELEASE ← VERIFICATION
```

It is a ring, not a line. Observation feeds the next proposal, and the
constitution, the kernel, and this document change only by going around it.

## 3. The stations

Each station is described the same way: what it produces, who acts, why
the station exists, how it is held today, and what cost it records.

### 1 · Standing

- **Produces:** the rules of who may propose, deliberate, decide, be heard
  as affected, steward, or operate — and the private register of who
  currently holds each.
- **Actor:** the constitution and Cell charters; identity assurance
  appropriate to the decision class.
- **Why this station exists:** a vote without standing is a poll. Standing
  is what separates member sovereignty from token-weighted or
  engagement-weighted theatre, and it is where affected non-members are
  given a voice.
- **Held today:** founder bootstrap — one person holds all standing;
  affected-person standing `DECLARED`.
- **Cost recorded:** none.

### 2 · Proposal — `P-xxxx`

- **Produces:** the problem, the affected people, the requested decision
  and its class, the alternatives, the evidence, a cost estimate, the
  risk, the counter-case, and the unresolved questions.
- **Actor:** anyone with standing. Agents may draft, labelled as drafts.
- **Why:** a decision without a proposal hides the alternatives that lost.
  The proposal is where *why not the other thing?* is answerable.
- **Held today:** `P-0001` is the first. Earlier decisions record its
  absence as a gap.
- **Cost recorded:** the proposer's hours, `ESTIMATED`.

### 3 · Deliberation

- **Produces:** a dated log of positions, evidence, conflicts of interest,
  corrections, and preserved dissent, appended to the proposal.
- **Actor:** those with standing; agents as labelled drafters. Engagement
  volume is not evidence.
- **Why:** the record of how minds changed is what lets a later member
  audit a decision instead of taking it on trust — and what lets dissent
  outlive the decision it lost.
- **Held today:** the log inside `P-0001`; `STRUCTURAL` once the proposal
  schema requires it.
- **Cost recorded:** participant hours, `ESTIMATED` unless timed.

### 4 · Decision — `D-xxxx`

- **Produces:** outcome, class, authority and procedure, reasons,
  preserved dissent, effective and expiry dates, the appeal path, the
  mandates it authorizes and the classes it grants, and its prohibitions.
- **Actor:** the body the decision class assigns. Bootstrap: the founder.
- **Why:** it converts deliberation into authority with a boundary. Its
  class sets the procedure; its expiry stops authority from becoming
  permanent by neglect.
- **Held today:** `ENFORCED` by the kernel for issuer, class, hierarchy,
  and window. The adoption event itself — status flip, committed by the
  adopting authority, reported by the kernel — is proposed in §7.
- **Cost recorded:** procedure hours per participant.

### 5 · Mandate — `M-xxxx`

- **Produces:** typed implementation authority: objective, human outcome,
  constraints, scope, risk, requirements, acceptance tests, evidence,
  stop conditions, rollback and its residue, budget, human approvals.
- **Actor:** derived from the decision by a steward; adopted by the
  deciding authority.
- **Why:** a decision says what should become true; a mandate says what
  may be touched to make it true. Without it, an agent's interpretation of
  the decision becomes the authority.
- **Held today:** `ENFORCED` — the kernel refuses ill-formed,
  unauthorized, expired, self-deploying, or residue-less mandates.
- **Cost recorded:** `limits.budget_usd` — the ceiling a build may spend
  (proposed field).

### 6 · Envelope

- **Produces:** the narrowing of one mandate to one task: paths, tools,
  credentials, cost limit, what to output, stop conditions.
- **Actor:** a steward. The agent that receives it is replaceable, and its
  provider is named.
- **Why:** authority is capability-scoped, not only prose. The envelope is
  the mandate an agent can actually hold — and the reason no agent needs
  the conversation that produced it.
- **Held today:** `DECLARED` — envelopes are text; runtime confinement
  does not exist (`R-SCOPE/runtime`). Scope is `ENFORCED` afterwards,
  against the working tree.
- **Cost recorded:** none.

### 7 · Build

- **Produces:** candidate artifacts and a build receipt: agent, model,
  provider, scope touched, dependencies with reasons, tests run, every
  failure including the fixed ones, and cost.
- **Actor:** an agent, or a person acting as one.
- **Why:** this is the station that used to be the whole company. It is
  recorded so that its cost can be compared with the rest, and so that a
  receipt proves what happened rather than that it was wise.
- **Held today:** receipts exist for `M-0000` to `M-0002`; cost fields are
  proposed.
- **Cost recorded:** tokens in and out, USD, wall minutes — source: the
  provider's usage record.

### 8 · Verification

- **Produces:** the conformance report — every article mapped to a check,
  its class, and its result; product tests including denial paths; the
  prohibited-claim scan; accessibility; the artifact digest. No combined
  total anywhere.
- **Actor:** someone who did not build it — a different agent or a person.
  The builder's green run is evidence; it is not verification.
- **Why:** tests can prove something other than the authorized outcome.
  Separation of duties is what makes *verified* mean more than *the
  builder was satisfied*.
- **Held today:** `CHECKED` for the kernel's own rules;
  `receipts/conformance/` is empty until `M-0003` Part F.
- **Cost recorded:** the verifier's, in the same fields as build.

### 9 · Release — `M-xxxx-RELEASE`

- **Produces:** separate `DEPLOY` authority; one exact digest to one named
  environment; a named data controller wherever personal data exists; the
  release receipt binding digest, authority, operator, time, configuration
  class, and rollback target.
- **Actor:** the deploy authority — never the builder by default.
- **Why:** build and deploy held together is how a verified thing becomes
  a different running thing. Release is where *what runs is what was
  verified* is asserted and checked.
- **Held today:** `ENFORCED` for digest equality at the gate; `DECLARED`
  for attestation that production runs it. The `M-0001-RELEASE` receipt
  was never written — a recorded debt.
- **Cost recorded:** operator minutes; infrastructure cost per period.

### 10 · Audit

- **Produces:** the public trace, the exported bundle, and a verifier that
  runs with no account and no network.
- **Actor:** anyone. This is the station that belongs to strangers.
- **Why:** every other station is what OURS says about itself. This is the
  one where a person who trusts nobody here can check.
- **Held today:** exists — `pnpm ours export`, `pnpm ours verify`, and the
  trace page.
- **Cost recorded:** none to the auditor.

### 11 · Observation — `O-xxxx`

- **Produces:** measured outcomes, incidents, costs, complaints, appeals,
  unintended effects — and the mandate's hypotheses closed as
  `CONFIRMED`, `REFUTED`, or `UNTESTED`.
- **Actor:** stewards, with affected persons' reports as input.
- **Why:** a mandate is a bet. Without observation the bet is never
  settled, and *it shipped* quietly becomes *it worked*.
- **Held today:** `observations/` is empty. The state `OBSERVED` has never
  been earned by anything.
- **Cost recorded:** measurement and steward hours.

### 12 · Correction

- **Produces:** an appeal and its resolution; or a reversal under its own
  mandate; or a continuation decision. History is append-only: a reversal
  adds a record, it never rewrites one.
- **Actor:** the appellate body — none during bootstrap, recorded as a
  gap; the deciding authority for reversal.
- **Why:** an institution that cannot reverse is a deployment pipeline
  with opinions. The reversal proof is the falsification test for the
  whole ring.
- **Held today:** no appeal exists; the first reversal is scheduled on the
  feed pilot's first release.
- **Cost recorded:** as decision and mandate.

### 13 · Exit

- **Produces:** the exit pack — source, records, schemas, build
  instructions, a person's own data in interoperable form — and the fork
  drill's receipt.
- **Actor:** any member; the institution maintains the capability.
- **Why:** exit is the guarantee behind every other station. A ring nobody
  can leave is a well-documented enclosure.
- **Held today:** the authority-chain bundle only; a person's data export
  arrives with the feed pilot; no fork drill has run.
- **Cost recorded:** maintenance of the capability, per period.

### 14 · Amendment

- **Produces:** a new version of the constitution, a rule, a kernel check,
  or this document — produced by passing through the ring, with the
  previous version retained as `SUPERSEDED`.
- **Actor:** the amending authority the constitution names. Bootstrap: the
  founder, under `R-AMENDMENT`.
- **Why:** a process that can be changed outside itself is not a
  constraint. Self-hosting is what makes the rest of the ring credible.
- **Held today:** `STRUCTURAL` for the receipt, `DECLARED` for everything
  else, because during bootstrap the amender is the founder and nothing
  constrains that.
- **Cost recorded:** as decision.

## 4. Cost as a column

Proposed fields, adopted with `D-0004`. Earlier receipts are back-filled
from the provider's usage record where it exists, marked `ESTIMATED` where
it does not, and left blank rather than invented.

| Record | Fields | Source |
|---|---|---|
| proposal | `cost.proposer_hours` | proposer, `ESTIMATED` |
| deliberation | `cost.participant_hours` | per participant, `ESTIMATED` unless timed |
| decision | `cost.procedure_hours` | per participant |
| mandate | `limits.budget_usd` | the ceiling |
| build receipt | `cost.tokens_in` · `cost.tokens_out` · `cost.usd` · `cost.wall_minutes` | the provider's usage record |
| conformance report | as build | the verifier's usage record |
| release receipt | `cost.operator_minutes` · `cost.infrastructure_usd_per_month` | operator; provider invoice |
| observation | `cost.steward_hours` · incident cost | steward |

Every number carries its source or the word `ESTIMATED` — `R-CHECKABLE-CLAIM`
applies to costs as to anything else. The ledger then shows, per change,
three totals: **judgment** (stations 1–5, 11–12), **verification and
release** (8–10), and **code** (7). The thesis predicts the last is the
smallest. If for some change it is not, the thesis is wrong about that
change, and the ledger says so rather than the summary.

## 5. The ledger

A page generated from the records, as the trace is: one row per change,
one column per station, each cell a state and a link to its record with the
cost beneath. Tapping a column heading answers *why does this station
exist?* with the text of §3. No cell is hand-written. It is the thing a
person is shown when they ask how OURS builds — and inside a product, the
settings page is the same idea at the scale of one option.

## 6. What is true today

| Station | Today |
|---|---|
| 1 Standing | founder bootstrap; affected-person standing `DECLARED` |
| 2 Proposal | `P-0001` is the first; `D-0000`–`D-0003` have none |
| 3 Deliberation | `P-0001`'s log is the first preserved one |
| 4 Decision | `D-0000`–`D-0003`; adoption first recorded as an event for `D-0003` |
| 5 Mandate | `M-0000`–`M-0003`; no budget field in the schema yet |
| 6 Envelope | `envelopes/M-0003/`; no runtime confinement |
| 7 Build | receipts for `M-0000`–`M-0002`; no cost fields yet |
| 8 Verification | `receipts/conformance/` empty; first report due with `M-0003` Part F |
| 9 Release | `M-0001-RELEASE` executed; its receipt never written |
| 10 Audit | trace, export, verifier — exist |
| 11 Observation | none; `OBSERVED` never earned |
| 12 Correction | no appeal; first reversal scheduled on the feed pilot's first release |
| 13 Exit | authority bundle only; data export arrives with the pilot; no fork drill |
| 14 Amendment | founder, receipted; unconstrained during bootstrap |

## 7. Rules that follow — proposed

1. No decision without a proposal, from `D-0004` on.
2. Adoption is an event: a status flip committed by the adopting
   authority. The kernel reports (`CHECKED`) and, once the older records
   are reconciled, refuses (`ENFORCED`) a mandate whose decision is
   `DRAFT`.
3. Every receipt carries its cost fields with sources, or `ESTIMATED`.
4. A mandate's hypotheses are closed by an observation record before the
   change is called `OBSERVED`.
5. Verification is written by someone who did not build.
6. Stations are added, removed, or reordered only by amendment — through
   the ring.

## 8. What this document does not claim

Not that any station is beyond the founder's reach (`R-WEAKEST-LAYER`).
Not that the ring answers every threat in `INSTITUTION-COMPILER.md` §20.
Not that cost recorded proves value delivered. It claims one thing: that a
change's path can be read end to end, and that the reading shows where the
cost went.
