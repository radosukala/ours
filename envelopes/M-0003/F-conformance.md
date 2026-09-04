# Envelope M-0003 · Part F — Conformance and receipt

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else is authority. Read `AGENTS.md` first, then `foundation/FEED-PILOT.md`
§12, §16, §17, the rulebook, and every receipt in `receipts/builds/` for
`M-0003`.

**Depends on:** Parts A–E merged. Before starting:
`pnpm ours check M-0003` must authorise.

## What you produce

Evidence, not features. This part adds no product behavior; if a check
fails, you record the failure and stop rather than fix the product — a
fix is a new part under the same mandate, run by the founder, so that the
conformance report is written by someone who did not build what it judges.

### 1. Conformance report — `receipts/conformance/<date>-M-0003.md`

One table, every article of `rules/feed/RULEBOOK-0.1.md` and every
constitutional rule `M-0003` requires, each with: the check that holds it
(test file and name, kernel rule, or "none"); the class the article declares
(`ENFORCED` / `CHECKED` / `STRUCTURAL` / `INTERPRETED` / `DECLARED`); the
result (`PASS`, `FAIL`, `NOT_MACHINE_DECIDABLE`); and a sentence. Rules
follow the constitution's own honesty: **no combined total anywhere**, and
`DECLARED` articles appear in the same list at the same weight. Where a
class an article claims is not what the evidence supports, say so — that is
a finding, and it goes back to the founder as a proposed rulebook
correction, not a silent downgrade.

### 2. Prohibited-claim scan

Extend `tests/conformance/` with a test that calls the kernel's `compile`
with `publicTextPaths` set to every copy-bearing file in `apps/feed/src`
(collect `*.ts`, `*.tsx`, `*.md` under `src/`, including
`src/copy/bootstrap.ts`) and asserts `R-NO-FICTIONAL-OWNERSHIP` is not
`REFUSED`. Record the file count scanned in the report. If the scan flags
a denial rather than an assertion — the known false positive — the wording
changes, not the rule, and the receipt says which sentence.

### 3. Inspection

Run the application locally and inspect, recording what you saw as text
(and screenshots into the receipt if the tooling allows):

- `/home`, `/settings`, `/defaults`, `/contract`, `/u/[handle]`,
  `/steward/receipts` at 375 px and at desktop width, light and dark;
- the bootstrap label present on every route, in body type;
- every control keyboard reachable with a visible focus state; the hold
  gesture operable by keyboard; reduced motion honoured;
- no request to any third-party origin across a full session (sign in,
  post, follow, change a setting, endorse, report, export, delete).

### 4. The build receipt — `receipts/builds/<date>-M-0003.md`

The consolidated receipt for the mandate, in the register of
`receipts/builds/2026-08-30-M-0001.md`: what was built and by which agents
and models per part; every dependency added with its reason; the acceptance
tests of `M-0003` §"Acceptance tests" one by one with results; **every
refusal the kernel produced during the mandate and what it caught**; every
failure, including the ones fixed; the artifact — `pnpm --filter @ours/feed
build` output and its digest; rollback as the mandate states it; and a
section **What is still not true**: nothing deployed, no email provider, no
data controller named, no one signed up, no member, no vote, no appeal, the
rulebook and catalog `DRAFT` until adopted, the comprehension review not
run. State the mandate's evidence status: `TESTED` if every acceptance test
passed, else `FAILED` with the list.

### 5. The proposed release mandate — inside the receipt

You may not write to `mandates/**`. Per `R-HUMAN-AUTHORITY`, an agent that
believes work is needed produces a proposal for human review. Append to the
build receipt a section **Proposed M-0003-RELEASE (DRAFT for founder
review)** containing a complete `ours.mandate/v0.1` YAML block and its
human-readable summary, modelled on `mandates/M-0001-RELEASE.yaml`, with:
class `DEPLOY`; `source_decision: D-0003`; `external_systems` naming the
hosting, database, and email providers as placeholders to be chosen by the
founder; risk `MEDIUM` or higher with reversibility `REVERSIBLE` and an
honest `irreversible_residue` — personal data exists, posts have been read,
emails have been sent; `human_approvals` including `data-controller`,
`privacy-notice-legal-review`, `dns`, and `deploy`, each `founder`; a
stop condition that no one may be invited until a data controller is named
and the privacy notice has been reviewed; and acceptance tests that the
deployed digest equals the verified one, that the bootstrap label renders
in production, and that export works from the deployed instance. Mark every
fact you cannot know `[CONFIRM]`.

## You may touch

```text
tests/**   receipts/builds/**   receipts/conformance/**
```

**Not** `apps/feed/**` — this part judges the product; it does not change
it. If a finding requires a product change, it is recorded and the founder
decides the next part.

## Stop conditions

- a check cannot be run without changing the product;
- an acceptance test's result would have to be inferred rather than
  observed;
- the working tree contains changes outside `M-0003`'s scope — report the
  paths; do not clean them up.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then finish the consolidated receipt with one truthful state for the
mandate, and one line stating who should read it next: the founder, for
adoption of the rulebook and catalog, and for the decision whether to draft
`M-0003-RELEASE` from the proposal.
