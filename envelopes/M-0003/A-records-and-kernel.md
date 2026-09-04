# Envelope M-0003 · Part A — Records and kernel

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else — no conversation, issue, or comment — is authority. Read `AGENTS.md`
before anything else, then `foundation/FEED-PILOT.md` §4–§7 and §12, which
this part implements.

Before starting: `pnpm ours check M-0003` must authorise. If it refuses,
stop and report the refusal verbatim.

## What you build

The feed Cell's records, the record type that carries option provenance,
and the kernel check that refuses a build whose options lack it.

### 1. `rules/feed/RULEBOOK-0.1.md` — the Cell's articles

Human-readable, in the exact register and structure of
`constitution/CONSTITUTION-0.1.md`: a status header (`DRAFT — not yet
adopted; requires founder adoption under M-0003 human approvals`), a "how to
read the rules" table of enforcement classes, and one `## Article R-NAME —
title` section per article, each ending with its **Class** line. The
article-heading format must parse with the same regex the proof surface
uses (`apps/proof/src/records.ts`, `parseArticles`). No article may be
untagged.

Articles to draft, with their honest class today:

| Article | Meaning | Class today |
|---|---|---|
| `R-ATTENTION-OPT-IN` | the feed never decides for the person that it continues; continuation, reminders, session budget and the continue gesture are the person's; the quiet choice is the default | `ENFORCED` by catalog default + app test |
| `R-NOTHING-FALSELY-IMPOSSIBLE` | where a behavior can be personal it is; withholding a feasible option requires a published reason — cost, safety, or another person's rights; "not possible" may never mean "not profitable"; absences are catalogued with reasons | `STRUCTURAL` (reason required) · `INTERPRETED` (whether the reason is honest) |
| `R-VOTED-DEFAULTS` | a default is a decision on behalf of everyone who never opens settings; every GOVERNED default names the decision that set it; the person's overrides are theirs | `STRUCTURAL` today · `DECLARED` for the member vote, which does not exist |
| `R-ANSWERABLE-WHY` | every option and every feed item answers why it exists or appeared, from a record, not a caption | `ENFORCED` by app test |
| `R-CHRONOLOGICAL-ALWAYS` | a non-personalized chronological mode always exists and is the default | `ENFORCED` by catalog default |
| `R-NO-PAID-RANKING` | nothing paid influences order | `STRUCTURAL` — ranking input type |
| `R-NO-BEHAVIORAL-SALE` | no behavioral data is sold or used for ad targeting; no advertising exists | `STRUCTURAL` — no surface exists · `DECLARED` beyond the code |
| `R-NO-STATUS-COUNTERS` | no public reaction, follower, or view counts | `ENFORCED` by app test |
| `R-QUIET-BY-DEFAULT` | notifications, badges, digests are off or quiet by default; quiet hours default 22:00–07:00 | `ENFORCED` by catalog default |
| `R-ADULTS-ONLY` | the pilot serves adults; self-attested at sign-up | `STRUCTURAL` — sign-up requires attestation · `DECLARED` beyond it |
| `R-EXIT-ANYTIME` | export and deletion are one action each, always available | `ENFORCED` by app test |
| `R-PROVENANCE-IN-SETTINGS` | every option renders its rule, decision and mandate; no option without a record | `ENFORCED` — kernel `R-OPTION-PROVENANCE` + app test |
| `R-STEWARD-RECEIPTS` | every moderation action produces a public receipt with private details redacted; appeal none during bootstrap, recorded as a gap | `STRUCTURAL` · `INTERPRETED` |
| `R-BOOTSTRAP-LABEL` | every surface states that the founder, not members, set the defaults, in body type | `CHECKED` — prohibited-claim scan · app test |

Write each article's reason in plain sentences a person can read. Where a
class is `DECLARED`, say so in the article; do not describe a declared rule
as enforced.

### 2. `rules/feed/options.yaml` — the option catalog

A list of `ours.option/v0.1` records, one per option in
`FEED-PILOT.md` §6 — including the *absent* options (behavioral
recommendations, video autoplay, public reaction counts), recorded with
`absent: true` and a `reason`. Every value in §6's table is the default;
you do not choose defaults. Fields:

```yaml
schema: ours.option/v0.1
option_id: feed.continuation          # dot-namespaced, stable
title: How the feed continues
layer: GOVERNED                       # FLOOR | GOVERNED | PERSONAL
type: enum                            # enum | boolean | number
values: [paged, continuous-with-reminders, continuous]   # enum only
range: null                           # number only: { min, max, unit }
default: paged
person_may_override: true             # must be false for FLOOR
absent: false                         # true for catalogued absences
provenance:
  rule: R-ATTENTION-OPT-IN
  decision: D-0003
  mandate: M-0003
  default_set_by: founder-bootstrap
  default_status: BOOTSTRAP_DEFAULT   # BOOTSTRAP_DEFAULT | MEMBER_VOTED
why: >
  one paragraph, plain language
recourse: >
  what the person can change themselves, and how to endorse a different
  default for everyone — recorded as demand during bootstrap
```

### 3. `rules/feed/RANKING-CONTRACT-0.1.md`

The Algorithm Contract per `INSTITUTION-COMPILER.md` §15 at pilot size:
objective, the two modes each described in one paragraph, prohibited
signals (dwell time, predicted engagement, reaction counts, paid boosts,
advertiser interest, inferred sensitive attributes), the "why this item"
fields, the guarantee that the explanation is generated by the ranking
function, version `RC-0.1`, change authority (a decision), and
emergency disablement (falls back to chronological).

### 4. `packages/schemas` — the `Option` type

Add `Option` and the `OPTION_LAYERS`, `OPTION_TYPES`, and
`DEFAULT_STATUSES` constants in the style of the existing file: narrow,
every field earning its place by being checked.

### 5. `packages/kernel` — `R-OPTION-PROVENANCE`

- `registry.ts`: `loadOptions(root, relPath)` returning `LoadResult<Option[]>`
  in the existing never-throws style.
- `rules.ts`: a check `optionProvenance(ctx)` that, when a catalog is
  present, refuses (`ENFORCED`) if any option: names a `provenance.rule`
  that is not an article in the Cell rulebook; names a `provenance.decision`
  that does not exist or does not list `provenance.mandate` in its
  `authorizes.mandate_ids`; has a `default` not among its `values` (enum) or
  outside `range` (number); is `FLOOR` with `person_may_override: true`; has
  a `default_status` outside the allowed set; is `absent` without a
  `reason`; or shares an `option_id` with another. The refusal message
  names the option and the article, in a sentence a person can read.
- `index.ts`: `compile()` accepts `optionCatalogPath?` and `rulebookPath?`;
  when the mandate's `institution.cell` has `rules/<cell>/options.yaml`, the
  CLI supplies both. A catalog that fails to load is a refusal, not a skip.
  When no catalog exists for the Cell, the finding is
  `NOT_MACHINE_DECIDABLE` with a message saying no catalog was found —
  never `PASS`.
- Add a `STRUCTURAL` finding `R-VOTED-DEFAULTS` that passes when every
  `GOVERNED` option names a decision, and states in its message that the
  member vote is `DECLARED` and does not exist.

### 6. `packages/cli` — report catalog findings

`ours check M-0003` prints catalog findings in the same list as the
constitutional ones, with their classes, and no combined total.

### 7. Tests — `tests/conformance/option-catalog.test.ts`

Using `tests/helpers.ts`' variant-repository pattern (extend it to copy
`rules/feed/**`), prove: the real catalog validates; and **at least three
invalid catalogs refuse for the correct reason** — an option naming a rule
absent from the rulebook; an option naming a decision that does not
authorise `M-0003`; a `FLOOR` option marked overridable. Add a fourth: a
default outside its values. Assert on the article named and the option
named, not only on `authorized === false`.

## You may touch

```text
rules/feed/**   packages/schemas/**   packages/kernel/**   packages/cli/**
tests/**        receipts/builds/**
```

Nothing else. In particular you may not edit `constitution/**`,
`decisions/**`, `mandates/**`, or `apps/**`.

## Stop conditions

- an article cannot be given an honest class without a mechanism that does
  not yet exist — then class it `DECLARED` and say so; do not stop;
- a catalog default in `FEED-PILOT.md` §6 is ambiguous — stop, write the
  question into the receipt, choose nothing;
- the check would require weakening an existing kernel rule.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then write `receipts/builds/<date>-M-0003-A.md`: agent and model; files
touched; each acceptance item above and its result; every refusal the kernel
produced on the way and what it caught; what is still not true (the
rulebook and catalog are `DRAFT` until the founder adopts them under the
mandate's human approvals — say so).
