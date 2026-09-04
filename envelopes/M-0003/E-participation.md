# Envelope M-0003 · Part E — Participation and stewardship

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else is authority. Read `AGENTS.md` first, then `foundation/FEED-PILOT.md`
§8 and §9, the rulebook articles `R-VOTED-DEFAULTS`, `R-STEWARD-RECEIPTS`,
and `R-BOOTSTRAP-LABEL` in `rules/feed/RULEBOOK-0.1.md`.

**Depends on:** Parts A and B merged. Before starting:
`pnpm ours check M-0003` must authorise.

## What you build

The two acts a person can take on the institution during bootstrap —
endorse a default, propose an option — and the steward path that makes
moderation receipted. All three are **demand and stewardship, not
governance**, and the interface must say so where it matters, not in a
footnote.

### 1. Endorse a default

On every GOVERNED option (in `/settings`, beneath Part C's provenance line,
and on a public page `/defaults`), a signed-in person may endorse **one
value** of that option as the default for everyone; endorsing another value
replaces it; endorsing the current one is allowed. Table `endorsements`
(person, option_id, value, updated_at), unique on (person, option_id).

Public counts per value appear on `/defaults`, and beside each option in
settings, under this fixed label, in body type, unchanged:

> **Recorded as demand during founder bootstrap — not binding.** No member
> institution exists. When membership forms, these defaults are among the
> first put to a real vote.

Counts never render as a result, a winner, a percentage bar that implies a
decision, or anywhere a vote outcome would be rendered. A test asserts the
label is present wherever a count is.

### 2. Propose an option

`/propose`: one text field — *What would you like to be able to set, and
why?* — and a public list of proposals with an endorse control (same
mechanics, table `proposals` and `proposal_endorsements`). The list carries
the same demand label. Proposals are text only; no attachments, no
mentions. Rate-limit per person; reject empty text. The steward sees the
same list at `/steward/proposals` with a status they may set — `RECEIVED`,
`CONSIDERED`, `DECLINED` with a public reason, or `QUEUED` — and every
status change is a receipt (see §3). Nothing here creates an option; an
option is created only by a change to `rules/feed/options.yaml` under a
mandate, and the page says that.

### 3. Report → steward action → public receipt

- On every post and profile: **report**, with a reason from a short fixed
  list drawn from the rulebook (illegal content, harassment, spam,
  impersonation, other) and an optional note. Table `reports`.
- `/steward` (visible only to the steward role; during bootstrap exactly
  one person, set by an environment variable naming a handle — never
  hard-coded): a queue of reports with the content in context and three
  actions — hide the post, remove the post, suspend the person — each
  requiring a written reason. Table `steward_actions`.
- `/steward/receipts`: a **public** log of every action: date, action,
  rule cited, reason, and *appeal: none available during bootstrap —
  recorded as a known gap*. Private details are redacted: no reporter
  identity, no email, no post body for removed content; an action on a
  person names the handle only when the action is suspension. A test
  renders the receipt page and asserts none of the private fields appear.
- Hidden and removed posts render, in place, as *Removed by the steward —
  see receipt [id]* so absence is visible, not silent.

### 4. The steward role

One boolean derived from configuration, checked server-side on every
steward route and action. No admin interface exists beyond these pages.
The steward's own posts can be reported and the receipt page does not
special-case them.

## Tests

Endorsement uniqueness and replacement; counts on `/defaults` and in
settings each carry the label; the label text matches the rulebook article
verbatim; proposal creation, rate limit, and status receipts; the report
flow producing an action and a public receipt; redaction on the receipt
page; steward routes refused for non-stewards; a removed post's
placeholder links to its receipt; keyboard reachability.

## You may touch

```text
apps/feed/**   tests/**   receipts/builds/**
```

You may read `rules/feed/**`; you may not edit it. If the rulebook lacks a
report reason you need, stop and record the request — do not invent a
category.

## Stop conditions

- a count would have to be rendered where a vote result would be;
- any mechanic would attach a number, rank, badge, or standing to a person;
- the steward path would need to store or display a private detail on the
  public receipt;
- anything would require an email to be sent.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then write `receipts/builds/<date>-M-0003-E.md`: agent and model; files
touched; dependencies added with reasons; each test above and its result;
every failure including the fixed ones; what is still not true — no vote
exists, no appeal exists, one steward holds every action.
