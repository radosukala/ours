# OURS

**The institution compiler.** `oursorg.com`

```text
AUTHORITY → MANDATE → SOFTWARE
```

Legitimate human authority is the source. A precise, testable mandate is the
language. Software is the compiled output.

## Status, truthfully

```text
AUTHORITY               FOUNDER BOOTSTRAP
MEMBER INSTITUTION      NOT YET FORMED
MEMBER OWNERSHIP        NOT YET ISSUED
LEGAL MEMBERSHIP        NOT YET ISSUED
KERNEL                  0.1 — TESTED, NOT DEPLOYED
PUBLIC SURFACE          NONE YET
```

Nobody has ratified anything. There are no members. Nothing here is
member-owned, and the founder can remove every check in this repository
without notice. Those labels change when the corresponding events actually
happen — see
[`authority/FOUNDING-AUTHORITY.md`](./authority/FOUNDING-AUTHORITY.md).

## What is here

Kernel 0.1: a deterministic validator that answers one question about a
proposed change —

> **Is this mandate authorized, by whom, and within what bounds?**

— and, when the answer is no, names the article that refused and says why in
a sentence a person can read.

It performs no network access and opens no database. That is what lets a
stranger reproduce the answer without an account.

## Check it yourself

```bash
pnpm install
pnpm ours check M-0000
```

You will see ten enforced articles pass, and **four articles reported as
open** — things no machine can decide, listed rather than quietly counted as
passing. There is deliberately no combined total. "Fourteen checks passed"
would tell you the constitution was verified; what was verified is its
decidable subset, and the open articles are the size of the gap.

Then break it on purpose:

```bash
pnpm test
```

Twenty of those tests are refusals. Each asserts not only that an invalid
chain was rejected, but that it was rejected for the *correct* reason — an
agent trying to issue a decision, a mandate outliving its decision, a build
mandate trying to deploy itself, a destructive change claiming it leaves
nothing behind.

## Verify without trusting this repository

```bash
pnpm ours export M-0000
pnpm ours verify exit/bundle-M-0000.json
```

The bundle embeds its sources and their digests. The verifier re-derives
every hash from the bundle's own bytes and re-walks the chain, with no
repository, no account, and no network. Copy it to an empty directory and it
still verifies. If it ever needs the kernel to check itself, the bundle
format is what should change.

## Layout

```text
foundation/     why this exists — thesis, kernel design, first product
authority/      who may decide anything at all, and what they may not claim
constitution/   project law during bootstrap, every article tagged
decisions/      what was decided, by whom, with the counter-case recorded
mandates/       what an implementer was actually authorised to do
packages/       schemas · kernel · cli · verifier
tests/          the denial suite comes first
receipts/       what was built, under whose authority
exit/           exported proof bundles
```

## Reading order

1. [`AGENTS.md`](./AGENTS.md) — the rules any agent works under here
2. [`foundation/THESIS.md`](./foundation/THESIS.md) — why this should exist,
   and what would falsify it
3. [`constitution/CONSTITUTION-0.1.md`](./constitution/CONSTITUTION-0.1.md) —
   the articles, each tagged with how it is actually held
4. [`mandates/M-0000.md`](./mandates/M-0000.md) — what built the kernel

## What this is not

Not a token, blockchain, or ownership scheme. Not a waitlist. Not a social
network with feature polls. Not democracy applied to code. Not a claim that
this project invented governance, policy-as-code, cooperatives, or AI coding
— [`foundation/THESIS.md`](./foundation/THESIS.md) §12 names the prior art,
including two shipping products that compile institutional policy today.

The narrow claim is that those compile *management's* authority. This one is
built to compile the authority of the people the software governs. That
distinction is the whole of it, and it is not proven yet.
