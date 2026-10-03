# OURS

> **Coming from our.one?** This is its code and its records, in one public
> repository.
>
> - **our.one** is a friends feed, and the first project of a network its
>   founder is starting, to bring people and builders together to create
>   services their users can control. Today the founder decides, under
>   bootstrap authority. The common agreement those services would sign is
>   a draft, and no member ownership has been issued.
> - **The site and the feed:** [`apps/web`](./apps/web). Whether it is
>   deployed, and where, the site itself says on its *Who controls what*
>   page.
> - **The builder kit:** [`kit`](./kit), the instructions a coding agent
>   follows, the rules and the check.
> - **The records:** a change is proposed ([`proposals`](./proposals)),
>   decided ([`decisions`](./decisions)), handed to an agent as a bounded
>   task ([`mandates`](./mandates)), and receipted
>   ([`receipts`](./receipts)). The receipts include independent
>   verifications, by agents that didn't build what they checked.
> - **The history is kept on purpose,** first drafts and mistakes included.
>   The receipts cite its commits, so anyone can check how each change was
>   made.
>
> The rest of this page is about OURS, the institution behind it.

**The enduring institution people belong to.** `oursorg.com` · communities'
tools at `our.one`

> OURS is the enduring institution people belong to. Applications are
> replaceable services operating under its members' authority. The compiler
> connects their decisions to verified changes; the runtime holds the
> resulting permissions.

That is the direction adopted under `D-0006` on 8 September 2026. It is a
sentence about what OURS is for, not a description of what exists. What
exists is below, truthfully.

```text
AUTHORITY → MANDATE → SOFTWARE
```

## Status, truthfully

```text
AUTHORITY               FOUNDER BOOTSTRAP
MEMBER INSTITUTION      NOT YET FORMED
MEMBER OWNERSHIP        NOT YET ISSUED
LEGAL MEMBERSHIP        NOT YET ISSUED
THE LAYER               ADOPTED AS DIRECTION — THE GATE BUILT, NOTHING RUNS
THE GATE                authority, adoption, and community checks TESTED — on a fictional fixture
RUNTIME                 NONE
KERNEL                  0.1 — TESTED
AUTHORITY TRACE         served at oursorg.com — receipted 8 September, reproduced modulo its build date
FIRST COMMUNITY         NOT CHOSEN
```

Nobody has ratified anything. There are no members. No ownership has been
issued to anyone, and the founder can remove every check in this repository
without notice. Those labels change when the corresponding events actually
happen — see
[`authority/FOUNDING-AUTHORITY.md`](./authority/FOUNDING-AUTHORITY.md).

## What a person keeps

Under the layer, a person's identity, standing, data, and relationships —
and a community's rules, records, money, and names — are held by the
institution in trust, and an application is a replaceable tenant with a
contract that says what it may reach. **None of this exists yet.** The
table of what the layer holds, with a class beside every row, is
[`foundation/THE-LAYER.md`](./foundation/THE-LAYER.md) §4; today every row
reads *nobody — nothing exists*.

## How an application is admitted

Through the gate, which is the compiler's job:

- **the authority chain** — who decided, under what procedure, within what
  scope, and whether a draft is pretending to be an authorisation. The
  chain exists; the draft check is `M-0004`'s first job;
- **conformance** — every article of a tool's specification maps to a named
  test (`M-0006`);
- **the data contract** — what a tool may reach and disclose, field by
  field: statically under `M-0006`, at runtime under a later mandate;
- **the pin** — an implementer cannot change the rules it is judged by
  (`M-0006`).

Passing the gate makes a builder eligible to *offer* a tool. The community
whose data and rules it would touch decides its use.

## How a community decides

By the ring — proposal, deliberation, decision, mandate, build,
verification, release, audit, observation, correction, exit, amendment — at
the community's own scale, under its own charter, with standing and votes
the gate counts. [`foundation/LIFECYCLE.md`](./foundation/LIFECYCLE.md)
describes every station and how each is held today. OURS governs itself
with the same ring, which is why this repository is mostly records.

## Check it yourself

```bash
pnpm install
pnpm ours check M-0000
```

You will see the enforced articles pass and the open ones listed rather
than counted as passing. There is deliberately no combined total: a single
number would say the constitution was verified, when what was verified is
the part of it a machine can decide.

Then break it on purpose:

```bash
pnpm test
```

Most of those tests are refusals. Each asserts not only that an invalid
chain was rejected, but that it was rejected for the *correct* reason.

## Verify without trusting this repository

```bash
pnpm ours export M-0000
pnpm ours verify exit/bundle-M-0000.json
```

The bundle embeds its sources and their digests. The verifier re-derives
every hash from the bundle's own bytes and re-walks the chain, with no
repository, no account, and no network.

## Layout

```text
foundation/     why this exists — thesis, the layer, the gate's design, the lifecycle
authority/      who may decide anything at all, and what they may not claim
constitution/   project law during bootstrap, every article tagged
proposals/      what was asked for, the alternatives, and who argued what
decisions/      what was decided, by whom, with the counter-case recorded
mandates/       what an implementer was actually authorised to do
envelopes/      one mandate, narrowed to one part, for one agent
packages/       schemas · kernel · cli · verifier
tests/          the denial suite comes first
receipts/       what was built, under whose authority
observations/   what happened afterwards — empty until something is observed
exit/           exported proof bundles
spec/           the service specification format, and the gate's rules
communities/    each community's own records, read like the institution's — a fictional fixture today
```

## Reading order

1. [`AGENTS.md`](./AGENTS.md) — the rules any agent works under here
2. [`foundation/THESIS.md`](./foundation/THESIS.md) — why this should exist,
   and what would falsify it
3. [`foundation/THE-LAYER.md`](./foundation/THE-LAYER.md) — what the
   institution holds, what an application is, what replacement must
   preserve
4. [`constitution/CONSTITUTION-0.1.md`](./constitution/CONSTITUTION-0.1.md) —
   the articles, each tagged with how it is actually held
5. [`foundation/LIFECYCLE.md`](./foundation/LIFECYCLE.md) — the ring,
   station by station

## What this is not

Not a token, blockchain, or ownership scheme. Not an app store. Not a
waitlist. Not a social network with feature polls. Not democracy applied to
code. Not a claim that this project invented governance, policy-as-code,
cooperatives, user-held data, or AI coding —
[`foundation/THESIS.md`](./foundation/THESIS.md) §12 names the prior art.
The narrow claim is that none of it makes standing, admission by the users'
constitution, and holding in trust one object with the data layer. That
claim is not proven yet.
