# OURS · the service specification, and the gate

**Version:** 0.1  
**Status:** ADOPTED — drafted under `M-0006` on 8 September 2026 and approved by
the founder the same day, in conversation, under that mandate's human approvals;
**amended the same evening under `M-0006`** after the independent verification
found the check narrower than these words and sixteen ways past it — §4 and §5
are the amended text, and the founder's approval of the amendment is pending  
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
  authority/CHARTER.yaml   ours.charter/v0.1 — the root authority record of this root; names the
                           decision that adopted it and the mandate classes its decisions may grant
  standing.yaml            ours.standing/v0.1 — who belongs: the count and the roles; the register is private
  votes/V-n.yaml           ours.vote/v0.1 — ballots private, tally public, dissent kept
  decisions/D-n.md/.yaml   ours.decision/v0.1 — with `vote` naming the vote behind it, and
                           `pins: true` on a decision that approves and pins a specification
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
| `S-CHARTER-ADOPTED` | a charter that names no adopting decision; one whose adopting decision does not exist, is not of class `CHARTER`, or is a draft — its vote is checked with every other by `C-DECISIONS/root` | `ENFORCED` |
| `S-CHARTER-GRANTS` | a decision granting a mandate class the charter does not let this community's decisions grant | `ENFORCED` · a charter declaring no limit: reported open, never passed |
| `S-CHARTER-NAMED` | a mandate citing a charter that does not govern this root | `ENFORCED` |
| `S-TOOL-NAMED` | a mandate implementing a specification that does not exist here, belongs to another community, or is still a draft | `ENFORCED` |
| `C-PARTICIPATION` | a decision by an actor without standing — a vote-procedure decision not made by the members, or a delegated decision by someone who does not hold the role | `ENFORCED` — the charter's own article |
| `C-DECISIONS` | for **every** decision in the root, not only the one a mandate cites — the charter's own adoption among them: a decision without its vote; a vote for another decision or another community; a tally component that is not a non-negative integer; a tally that does not add up; ballots beyond the eligible; an eligible count that differs from a standing record dated on or before the vote closed; dissent not preserved; a vote below the charter's threshold for its class; a procedure the kernel does not know | `ENFORCED` — the charter's own article; reported for the cited decision, and as `C-DECISIONS/root` for all the others |
| `S-ARTICLE-TEST` | an article with no named test, a test that does not exist, or a test holding no article | `ENFORCED` |
| `S-OPTION-PROVENANCE` | an option without an article, without an adopted decision, a floor option marked overridable, a default outside its values, a duplicate | `ENFORCED` |
| `S-PIN` | a pinned file that changed, or vanished, after the decision that pinned it — a contract widened, a transition requirement weakened, a charter edited — without an amending decision; a pin by a decision that does not exist, is a draft, or does not record `pins: true`; a pin that names another community | `ENFORCED` · no pin: reported open, never passed |
| `S-CONTRACT-DECLARED` | over every file the runtime could execute (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`): the client `layer` referenced in any form but the receiver of a direct `layer.read/write/disclose(…)` call — an alias, a bracket, a destructuring, an argument, a parenthesis; a reserved method name called on any other receiver, or bare; a read without a literal field list, a write without an object literal of literal keys, a disclose without a literal list; an undeclared class, field, or origin, or a field an allowed origin's disclosure does not list; an import that is not the application's own file, the client, or a dependency the contract declares — a built-in module in any form, an I/O package by any subpath, a dynamic `import()`, `import = require()`, `import.meta`; any name in a value position that the application neither declares nor imports and that is not on the allowlist of globals that cannot reach outside the process — the ECMAScript built-ins, timers, and `console` — so `fetch`, `require`, `process`, `global`, `globalThis`, `Reflect`, `Proxy`, `Function`, `WebAssembly` and every name nobody listed are refused; the walk to the Function constructor — `.constructor`, `.prototype`, `__proto__`, `.callee`, `.caller` on any receiver, by dot or bracket — `arguments`, top-level `this`, and a `with` statement; a relative import of anything but a source or JSON file; a symbolic link anywhere in the tree. The source is bound with the TypeScript binder and no library, so that every global is visible as one. Not checked: what a declared dependency does inside itself | `ENFORCED` at admission · runtime confinement `DECLARED` until the runtime exists · without `--source`, reported open, never passed |

**Procedures the kernel knows:** `majority-of-respondents` — more than
half of those who voted for or against, an abstention being recorded and
not deciding; `two-thirds-of-members` — at least two thirds of the standing
count, rounded up; `delegated:<role>` — the person standing names in that
role. A charter naming any other procedure is refused rather than guessed,
and a charter whose words say something the kernel does not count — "those
who respond" where abstentions are meant to count — must say what it
means, or be amended: the fixture's own charter was, by its `D-4`. The
standing count is compared to a vote's eligible count only when the
standing record is dated on or before the vote closed; a later record
cannot contradict an earlier vote, and the finding says so.

## 5. The layer client — what an implementation may call

An implementation reaches the layer through one client and nothing else.
The static check enumerates these calls; the runtime, when it exists,
holds them.

```ts
layer.read("booking", ["id", "machine", "member", "start", "end", "status"]);   // a declared class; a literal field list, required
layer.write("booking", { machine, member, start, end, status: "booked" });        // a declared class; an object literal whose keys are the fields
layer.disclose("https://calendar.example", ["machine", "start", "end"]);        // a permitted origin; the listed fields
```

The identifier `layer` may appear in no other form: not aliased, not
indexed, not destructured, not passed, not parenthesised. Class names,
origins, field lists, and record keys are literals; a read that names no
fields is a read of all of them and is refused. Anything computed is
refused as undecidable, because a check that guesses is worse than one that
refuses.

Imports are an allowlist: the application's own source and JSON files by
relative path, the client package, and the package roots the contract
declares under `dependencies`. A built-in module in any form, a dynamic
`import()`, `import.meta`, a native addon, and a symbolic link are refused.
Every other name the application reaches must be declared, imported, or a
global on the allowlist — the ECMAScript built-ins, timers, and `console` —
or the implementation is refused: the check binds the source with no
library, so a global is visible as one, and it does not rely on listing
what is forbidden. The walk from any value to the Function constructor is
refused by name on every receiver.

What this check does not decide: what a declared dependency does inside
itself. A dependency the contract declares is the community's choice and
its risk, shown on the specification; the runtime's egress policy, when it
exists, is what would hold it.

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
