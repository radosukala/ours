# OURS Constitution 0.1

**Status:** DRAFT — not yet adopted
**Class:** Root human-readable source
**Date drafted:** 30 August 2026
**Authority:** founder bootstrap — see
[`authority/FOUNDING-AUTHORITY.md`](../authority/FOUNDING-AUTHORITY.md)
**Adopted:** NOT YET — requires founder review

> This is project law during bootstrap. It is **not** a legal constitution,
> not a member instrument, and not enforceable by anyone against the founder.
> It binds the build. It does not yet bind the builder.

## Preamble

Software increasingly decides how people work, speak, earn, and relate, and
the people it decides for hold no authority over it. OURS exists to make that
authority real: to carry a legitimate human decision, without a break in the
chain, to the artifact actually running — and to make every step of that
carriage inspectable, reversible, and checkable by someone who trusts nobody
here.

This document governs how OURS builds itself. It is written to be replaced by
one that members adopt.

## How to read the rules

Every article declares how it is actually held today:

| Class | Meaning |
|---|---|
| `ENFORCED` | a named machine check blocks the action |
| `CHECKED` | a machine reports it; it does not block |
| `STRUCTURAL` | a schema requires it to be present and well-formed |
| `INTERPRETED` | a named human decides, with a named appeal path |
| `DECLARED` | a written expectation with no mechanism yet |

An article's class is a fact about this repository, not an aspiration. When a
mechanism is built, the class changes and the change is receipted.

**No article may be untagged.** A conformance report that counts passing
checks must report the class of each, because "10 constitutional checks
passed" is a false summary of a document most of whose articles no machine
can decide.

---

## Article R-HUMAN-AUTHORITY — Authority originates with people

Only a human may originate authority. An agent may draft, propose, test,
build, and report. An agent may never originate, expand, extend, renew,
delegate, or ratify authority — including its own.

An agent that believes work is needed, and finds no mandate covering it,
produces a proposed mandate for human review. It does not produce the work.

**Class:** `ENFORCED` · `kernel: actor.kind !== "agent"` for decision issuance
**Interpretation of "originate":** `INTERPRETED` — founder, during bootstrap

## Article R-SOURCE-HIERARCHY — Lower sources never override higher

Authority resolves through the hierarchy in `AGENTS.md` §3. A lower source
never overrides a higher one. Where two sources conflict, the action stops
and escalates; it does not proceed on the reading that authorizes more work.

**Class:** `ENFORCED` for the ordering of recorded sources ·
`INTERPRETED` for whether a given conflict is material

## Article R-TYPED-MANDATE — No material change without a valid mandate

No material change to software, configuration, or public claim occurs except
under a mandate that validates against the mandate schema, resolves to a
decision, and is within its validity window.

Ambiguity that is material to the outcome is not resolved by the agent. It is
named in the mandate as a human decision point.

A mandate is not valid merely because it parses. "Make it fair and deploy" is
a well-formed sentence and an invalid mandate.

**Class:** `ENFORCED` · `kernel: validateMandate` + `resolveAuthority`
**Whether a given change is "material":** `INTERPRETED` — founder

## Article R-SCOPE — Denied stays denied

A mandate declares the paths, repositories, and external systems its
implementation may touch. What is denied remains denied. An agent may not
widen its own scope, and may not treat a denial as an obstacle to route
around.

**Class:** `ENFORCED` at validation for declared scope ·
`DECLARED` for runtime filesystem confinement, which Kernel 0.1 does not yet
implement — the envelope is currently advisory to the agent, not a sandbox

## Article R-TRUTHFUL-STATUS — States do not collapse

Every public statement carries exactly one state: `PROPOSED`, `ADOPTED`,
`IMPLEMENTED`, `TESTED`, `DEPLOYED`, `OBSERVED`, `BLOCKED`, `FAILED`,
`REVERSED`, `SUPERSEDED`.

Adopted does not mean implemented. Tested does not mean deployed. Deployed
does not mean observed. No interface may compress these into a single mark of
approval.

**Class:** `ENFORCED` for the enumeration · `CHECKED` for whether the state
asserted matches the evidence · `INTERPRETED` for `OBSERVED`

## Article R-CHECKABLE-CLAIM — A claim carries its source

Any statement containing a number, a date, or an absolute quantifier is a
factual claim. It carries a resolvable source, and a named human has
confirmed the source supports it.

Structural provenance is not accuracy. A link proves a claim has a source; it
does not prove the source says what the claim says. Both are required, and
the second is always human.

**Class:** `STRUCTURAL` for source presence · `INTERPRETED` for accuracy —
named confirmer recorded with the claim

## Article R-PUBLIC-PRIVATE — Verifiability never requires exposure

No private identity, personal data, credential, or secret appears in any
public record, receipt, projection, or proof bundle. Public verifiability is
achieved with digests, aggregates, and references — never by publishing the
person.

A fork or exit right does not entitle anyone to another person's private
data.

**Class:** `ENFORCED` · `kernel: no field marked private in a public
projection` · `CHECKED` for secret-shaped strings in receipts

## Article R-BUILD-DEPLOY — Build and deploy are separate authorities

`BUILD` modifies approved scope. `DEPLOY` publishes an approved digest to a
named environment. No actor holds both by default, and completing a build
never confers the authority to release it.

**Class:** `ENFORCED` · `kernel: capability sets are disjoint by construction`

## Article R-EXACT-ARTIFACT — What was verified is what runs

A release names one artifact digest. The digest deployed must equal the
digest verified. Substitution — however small, however urgent — is a
constitutional failure and not an operational shortcut.

**Class:** `ENFORCED` at the release gate for digest equality ·
`DECLARED` for attestation that the running artifact is that digest, which
requires production infrastructure Kernel 0.1 does not have

## Article R-ROLLBACK — A change declares how it is undone

Every release names an actionable reversal. A change that cannot be fully
reversed declares its **irreversible residue** — the part that persists after
rollback: dropped data, sent messages, executed payments, third-party state,
anything a person already saw.

A rollback plan that says "revert the commit" for a change containing a
destructive migration is a false statement in a document whose purpose is
truthfulness.

**Class:** `ENFORCED` · a destructive operation without a declared residue
fails validation · `INTERPRETED` for whether a declared residue is complete

## Article R-NO-FICTIONAL-OWNERSHIP — Bootstrap may never render as ownership

While founder bootstrap authority is operative, nothing may state or imply
that OURS is member-owned, that members exist, that anyone has ratified
anything, or that any gate is beyond the founder's reach.

The status labels change when the events occur. They do not change because
the outcome feels inevitable.

**Class:** `ENFORCED` · `kernel: prohibited-claim check over public text`

---

## Article R-AMENDMENT — How this document changes

During bootstrap, the founder may amend this constitution by issuing a
decision that names the articles changed and the reason. Every amendment
produces a receipt. No amendment is silent, and no version is deleted;
superseded text is retained and marked `SUPERSEDED`.

After member formation, this article is replaced by a member procedure. That
procedure is an open question and is not decided here.

**Class:** `STRUCTURAL` for the receipt · `DECLARED` for everything else,
because during bootstrap the founder is also the amender and no mechanism
constrains that

## Article R-WEAKEST-LAYER — Claim only what actually holds

Every enforcement claim states the weakest real layer holding it. The layers,
strongest last: `DECLARED`, `AUTOMATED GATE`, `ORGANIZATIONAL SEPARATION`,
`CRYPTOGRAPHIC CONTROL`, `LEGAL CONTROL`, `ULTIMATE INFRASTRUCTURE CONTROL`.

Today every gate in this repository sits at `AUTOMATED GATE`, beneath a
single person who can remove it without notice. Nothing here may be described
as non-bypassable, tamper-proof, or guaranteed.

**Class:** `DECLARED` — and this article is the reason the honest answer to
"is this enforced?" is currently "by a CI job the founder controls"

---

## Unresolved

These are not omissions. They are decisions that belong to members and are
recorded as open rather than settled by code:

- the smallest legitimate membership unit;
- which rights are individual and which collective;
- how affected-person standing is established;
- which decisions need direct authority, elected bodies, sampled juries,
  professional review, or delegated stewardship;
- quorum, threshold, and voting method — noting that a quorum nobody can
  reach is a way of saying no;
- how stewards are replaced without destabilising operation;
- the appellate body and how it is independent;
- the legal form binding entity, domain, brand, code, data, and treasury to
  the same authority model;
- economic rights and duties of members.

Code must not choose any of these by accident.
