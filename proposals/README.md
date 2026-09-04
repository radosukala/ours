# Proposals

A proposal is the head of the chain: the record of what was asked for,
which alternatives were considered, who argued what, and what stayed
unresolved — written **before** a decision and kept after it, so that a
decision can be audited rather than trusted.

## What a proposal contains

- the problem, and the people it affects;
- the decision requested, and its class;
- the alternatives, each with its counter-case;
- the evidence, each item with a source a person can check;
- cost and risk, estimated and marked so;
- the questions the proposer could not resolve;
- a **deliberation log**: dated, attributed positions, appended as they
  arrive and never edited afterwards — dissent stays.

## Status

`PROPOSED` → decided by a `D-xxxx` (adopted or declined — both are kept)
→ `SUPERSEDED` if a later proposal replaces it.

## Who may propose

Anyone with standing. During founder bootstrap that is the founder. An
agent may draft a proposal, and its entries in the deliberation log are
labelled as an agent's drafts; it may not decide.

## What a proposal is not

Authority. Nothing in a proposal may be acted on until a decision adopts
it. A proposal that everyone agrees with is still a proposal.

The record shape is `ours.proposal/v0.1`, kept beside each proposal as
`P-xxxx.yaml`. See [`foundation/LIFECYCLE.md`](../foundation/LIFECYCLE.md)
for where proposals sit in the whole ring.
