# Envelope M-0003 · Part D — Ranking contract and "why this item"

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else is authority. Read `AGENTS.md` first, then `foundation/FEED-PILOT.md`
§7, and `rules/feed/RANKING-CONTRACT-0.1.md` from Part A.

**Depends on:** Parts A and B merged. Before starting:
`pnpm ours check M-0003` must authorise.

## What you build

The home stream's ordering as a contract that is structurally incapable of
using the signals it prohibits, and an explanation for every item generated
by the same function that ordered it.

### 1. The ranking module — `apps/feed/src/ranking/`

```ts
// The whole point of this type is what it does not contain.
export interface RankInput {
  postId: string;
  authorId: string;
  createdAt: Date;
  parentId: string | null;
  followedSince: Date;     // when the viewer followed the author
  lastSeenAt: Date | null; // viewer's last visit, for catch-up mode
}

export type Mode = "chronological" | "catch-up";

export interface Ranked {
  postId: string;
  position: number;
  why: Why;                // produced in the same call, from the same inputs
}

export interface Why {
  contract: "RC-0.1";
  mode: Mode;
  because: string;         // "You follow @handle · posted 2 h ago · chronological order"
  signalsUsed: ("follow" | "time" | "unread")[];
  signalsNeverUsed: string[]; // the contract's prohibited list, verbatim
}

export function rank(items: RankInput[], mode: Mode, now: Date): Ranked[];
```

`rank` is pure. The `Why` for each item is built inside `rank` from the
values that determined its position — not assembled afterwards in the
view. `chronological` orders by `createdAt` descending. `catch-up` places
posts newer than `lastSeenAt` first, grouped by author in order of that
author's newest post, then the rest chronologically; describe exactly this
in the contract page and in each `because`.

### 2. The structural guarantee — a test that is a type check

In `tests/conformance/ranking-contract.test.ts`, using vitest's
`expectTypeOf`, assert that `RankInput` has none of: `dwellMs`,
`predictedEngagement`, `reactionCount`, `likeCount`, `viewCount`, `boosted`,
`paid`, `advertiserId`, `inferredAge`, `inferredGender`,
`inferredLocation`, or any key matching `/engagement|boost|paid|ad|infer/i`
— enumerate the contract's prohibited list as a `const` array and derive the
assertions from it, so adding a prohibited field to the type fails
`pnpm typecheck` and `pnpm test`. Also assert at runtime that
`rank(...)[n].why.signalsNeverUsed` equals the contract's prohibited list
verbatim, read from the contract file, so the two cannot drift.

### 3. "Why this item" in the stream

Every item in `/home` carries a control labelled **why?** that opens an
inline disclosure showing the `Why` fields in plain sentences — who you
follow, when it was posted, which mode ordered it, the contract version,
the signals used, and *never used: …* — with a link to `/contract`. The
disclosure renders the `Why` object the ranker returned; it computes
nothing itself.

### 4. The contract page — `/contract`

Renders `rules/feed/RANKING-CONTRACT-0.1.md` from the repository file, plus
the live prohibited list from the ranking module beside the contract's
list, with a visible check that they are identical. If they differ, the
page says so in body type rather than hiding it.

### 5. Mode selection

`feed.ranking_mode` is a GOVERNED option in the catalog (default
`chronological`); Part C's `effectiveSettings` supplies it. Changing it is a
personal override; the stream re-orders and every `why` changes with it.
The default's provenance line appears in settings as for any GOVERNED
option — do not build a second selector with its own state.

### 6. Emergency fallback

If ranking throws for any reason, the stream renders in `chronological`
order with a body-type line: *Ordering fell back to chronological because
the ranking module failed; this event is logged.* Log the event without
personal data.

## Tests

The type-level assertion; ordering for both modes with fixtures; every
`Ranked.why.because` mentions the follow, the time, and the mode; the
disclosure renders the ranker's `Why` and nothing else (snapshot the object
passed to the component); the contract page's two lists match; the
fallback path; keyboard reachability of every **why?** control.

## You may touch

```text
apps/feed/**   tests/**   receipts/builds/**
```

You may read `rules/feed/**`; you may not edit it. If the contract's
prohibited list and this envelope's list differ, **the contract wins** —
derive from the file, and record the difference in the receipt.

## Stop conditions

- an explanation would have to be written beside the ranking rather than
  produced by it;
- the ranking would need any field the contract prohibits, for any
  reason, including "just for the fallback";
- the contract file is missing or unparseable — report, do not
  improvise.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then write `receipts/builds/<date>-M-0003-D.md`: agent and model; files
touched; dependencies added with reasons; each test above and its result;
every failure including the fixed ones; what is still not true.
