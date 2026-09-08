# OURS · the service specification, and the gate

**Version:** 0.1  
**Status:** ADOPTED — drafted under `M-0006` on 8 September 2026 and approved by
the founder the same day, in conversation, under that mandate's human approvals  
**Depends on:** [`foundation/THE-LAYER.md`](../foundation/THE-LAYER.md) §5–§6,
[`foundation/LIFECYCLE.md`](../foundation/LIFECYCLE.md)  
**Not:** a language. It has no control flow, no expressions, and no type
system, and the mandate that produced it stops if it acquires any.

## 1. What this document is

A community's tool is two things that must be kept apart: a **service
specification**, which is durable and the community's, and an
**implementation**, which is replaceable and anyone's. This document says
what a specification contains, how a community's root of records is laid
out so that the kernel reads it exactly as it reads the institution's, and
what the gate refuses. Every rule here carries its class, like every
article in the constitution.

## 2. A community's root of records

```text
communities/<cell>/
  README.md                what this root is; the FICTIONAL label if it is a sample
  authority/CHARTER.md     the founding arrangement — the community's law, articles C-*
  authority/CHARTER.yaml   ours.charter/v0.1 — the root authority record of this root
  standing.yaml            ours.standing/v0.1 — who belongs: the count and the roles; the register is private
  votes/V-n.yaml           ours.vote/v0.1 — ballots private, tally public, dissent kept
  decisions/D-n.md/.yaml   ours.decision/v0.1 — with `vote` naming the vote behind it
  mandates/M-n.md/.yaml    ours.mandate/v0.1 — with `tool` naming the specification implemented
  tool/<tool>.md           the service specification — its human source, articles T-*
  tool/<tool>.yaml         ours.tool/v0.1
  PIN.yaml                 ours.pin/v0.1 — the approved files and their digests
```

The kernel resolves a chain in a community root the way it resolves the
institution's: charter → decision → mandate, with every constitutional
check — human authority, source hierarchy, typed mandate, scope, window,
build/deploy separation, rollback, truthful status, adoption,
prerequisites, digests — and then the checks below.

```bash
pnpm ours check M-1 --root communities/<cell>            # the chain, in a community root
pnpm ours admit communities/<cell> <tool> --source <dir> # the gate for a specification and its code
pnpm ours pin communities/<cell> --by D-n <file>...      # record the approved files' digests
```

## 3. What a specification contains

| Part | What it says | Rule that holds it |
|---|---|---|
| **records** | the meaning of each record and its fields — what a booking *is* | `S-CONTRACT-DECLARED` (fields an implementation may reach are the contract's) |
| **articles** | the behaviours, as `## Article T-NAME — …` sections in the human source, each with a class, each naming the tests that hold it | `S-ARTICLE-TEST` |
| **options** | the consequential options — floor, governed, personal — each with the article and the decision behind its default | `S-OPTION-PROVENANCE` |
| **contract** | what an implementation may read and write, by class and field, under which article; what it may disclose, to which origin, which fields, for what purpose; how long it may keep anything | `S-CONTRACT-DECLARED` |
| **tests** | named cases, each holding one article | `S-ARTICLE-TEST` |
| **transition** | what a replacement must carry across, and how the crossing is verified | held read-only by `S-PIN`; exercised by the swap, under a later mandate |

## 4. The gate's rules

Each rule is a check in the kernel (`packages/kernel/src/community.ts`,
`contract.ts`), reported in the same list as the constitutional findings,
with no combined total.

| Rule | What refuses | Class |
|---|---|---|
| `S-CHARTER-ARTICLES` | an article the charter lists that its human source does not carry, or carries without a class | `ENFORCED` |
| `S-CHARTER-NAMED` | a mandate citing a charter that does not govern this root | `ENFORCED` |
| `S-TOOL-NAMED` | a mandate implementing a specification that does not exist here, or belongs to another community | `ENFORCED` |
| `C-PARTICIPATION` | a decision by an actor without standing — a vote-procedure decision not made by the members, or a delegated decision by someone who does not hold the role | `ENFORCED` — the charter's own article |
| `C-DECISIONS` | a decision without its vote; a vote for another decision or another community; a tally that does not add up; ballots beyond the eligible; a vote below the charter's threshold for that class | `ENFORCED` — the charter's own article |
| `S-ARTICLE-TEST` | an article with no named test, a test that does not exist, or a test holding no article | `ENFORCED` |
| `S-OPTION-PROVENANCE` | an option without an article, without an adopted decision, a floor option marked overridable, a default outside its values, a duplicate | `ENFORCED` |
| `S-PIN` | a pinned file that changed, or vanished, after the decision that pinned it — a contract widened, a transition requirement weakened, a charter edited — without an amending decision; a pin by a decision that does not exist or is a draft | `ENFORCED` · no pin: reported open, never passed |
| `S-CONTRACT-DECLARED` | an implementation reaching a class or field its contract does not declare; disclosing to an origin it does not name, or a field the disclosure does not list even to an allowed origin; importing a file system, socket, or database; calling `fetch`; a class, origin, or field that is not a string literal, refused as undecidable | `ENFORCED` at admission · runtime confinement `DECLARED` until the runtime exists |

**Procedures the kernel knows:** `majority-of-respondents` — more than
half of those who voted for or against; `two-thirds-of-members` — at
least two thirds of the standing count, rounded up; `delegated:<role>` —
the person standing names in that role. A charter naming any other
procedure is refused rather than guessed.

## 5. The layer client — what an implementation may call

An implementation reaches the layer through one client and nothing else.
The static check enumerates these calls; the runtime, when it exists,
holds them.

```ts
layer.read("booking", ["id", "machine", "member", "start", "end", "status"]);  // a declared class, declared fields
layer.write("booking", record);                                                  // a declared class
layer.disclose("https://calendar.example", ["machine", "start", "end"]);       // a permitted origin, listed fields
```

Class names, origins, and field lists are string literals. Anything
computed is refused as undecidable, because a check that guesses is worse
than one that refuses. No `fetch`, no `node:*`, no database driver: an
application has no storage or sockets of its own.

## 6. The pin

When the founder — later, the community by its procedure — approves a
specification, its files are pinned: their digests recorded in `PIN.yaml`
with the decision that approved them. The mandate that implements the
specification is **denied** write access to `communities/**` and `spec/**`;
it reads the pin. A change to a pinned file is a refusal until a decision
amends it and the pin is re-issued by that decision. The implementer
cannot change the rules it is judged by.

## 7. What this specification does not do

It does not run anything. It does not confine anything at runtime. It does
not admit a builder to a community — passing the gate makes a tool
*eligible to offer*; the community decides its use, access, and payment.
And it is not a language: if it needs one, it has failed.
