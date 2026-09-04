# Envelope M-0003 · Part B — Application foundation

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else is authority. Read `AGENTS.md` first, then `foundation/FEED-PILOT.md`
§3, §9, §10, §11, and the records Part A produced in `rules/feed/`.

**Depends on:** Part A merged. Before starting: `pnpm ours check M-0003`
must authorise.

## What you build

`apps/feed` — a workspace package `@ours/feed`: the smallest familiar feed
that a person alone can use, with export and deletion working before
anything else is considered done.

### Stack (from `FEED-PILOT.md` §11 — direction, each piece replaceable)

- Next.js, App Router, TypeScript strict, inside the pnpm workspace; add
  the app to `pnpm-workspace.yaml` if needed and keep root scripts working.
- Postgres through Drizzle, with migrations committed. Local development
  uses a Postgres reachable by `DATABASE_URL`; document one command to start
  one (a compose file is acceptable). Nothing here provisions anything
  remote.
- Sign-in by emailed link. **In this mandate no email provider exists**: the
  link is written to the server log in development, behind an interface
  with one method, so a provider is configuration for the release mandate.
  Sessions are httpOnly cookies. No social login, no passwords.
- Every new dependency is named in the receipt with the reason it was
  preferred to writing the code (`dependency_policy: justify-new`).

### Data model

`people` (id, handle, display_name, email, adult_attested_at, created_at),
`sign_in_tokens`, `sessions`, `posts` (id, author, body, link_url,
parent_id for replies, created_at, hidden_at), `follows` (follower,
followed, created_at). Reserve nothing for engagement metrics: no like,
view, or dwell columns exist. Reaction counts are an absence catalogued in
Part A with its reason.

### Routes

| Route | What |
|---|---|
| `/sign-in` | email field, the adults-only attestation checkbox (required, timestamped), the emailed-link flow |
| `/u/[handle]` | public profile: display name, a short professional headline, links, the person's posts; **no follower count** (`R-NO-STATUS-COUNTERS`) |
| `/home` | the stream — posts from people you follow, chronological, **paged** with a "show more" control (Part C adds the other behaviors); replies threaded one level |
| `/compose` | text, optional link; reply from a post |
| `/settings` | placeholder page that reads `rules/feed/options.yaml` and lists option titles only; Part C builds the real page |
| `/export` | one action returns JSON: profile, posts, replies, follows, settings, plus the rulebook, catalog, and ranking contract text |
| `/account/delete` | one action, one confirmation; removes personal data; shows the residue statement before confirming |

### Constraints that are tests

- **No third-party origin.** Content Security Policy with `default-src
  'self'`; system font stack, no remote font; no analytics, no tracking
  pixel, no external script. A test renders each route and asserts no
  request leaves the origin.
- **Bootstrap label.** A persistent, body-type line on every page:
  *OURS Feed is a founder-run pilot. No member institution exists; the
  founder, not members, set every default.* This text lives in one file,
  `apps/feed/src/copy/bootstrap.ts`, so Part F can scan it.
- **Register of an interface used daily.** Design per `D-0001`'s adopted
  direction: neutral system UI sans for prose, true monospace for
  identifiers and states, near-monochrome, generous whitespace,
  document-like structure, status by typography not colour. Legible in
  light and dark; landmarks, visible focus, reduced motion respected.
- **Deletion residue stated in the product.** Replies others wrote under a
  deleted post remain, attributed to their authors; a post someone already
  read cannot be unread. This sentence is shown before confirmation and
  the test asserts it.
- **No prohibited claim.** Nothing in the copy says or implies members
  exist, that anything is member-owned, or that any gate is tamper-proof.

### Tests — `tests/e2e/feed-foundation.test.ts` and unit tests beside code

Sign-in round trip with the logged link; adult attestation required;
profile renders without counts; a followed person's post appears in
`/home` and an unfollowed person's does not; paging works; export returns
the person's data and the three record texts; deletion removes the person
and their profile and keeps others' replies; CSP header present; no
outbound request. Use whichever browser-test tool you justify; keep it
runnable with `pnpm test` or a documented `pnpm test:e2e`.

## You may touch

```text
apps/feed/**   tests/**   receipts/builds/**
package.json   pnpm-lock.yaml   pnpm-workspace.yaml   tsconfig.json
vitest.config.ts   .gitignore
```

You may **read** `rules/feed/**` and `packages/schemas/**`; you may not edit
them — if the records are missing something the app needs, stop and write
the request into the receipt for Part A's author or the founder.

## Stop conditions

- a feature would require a third-party origin at runtime;
- the schema in `rules/feed/options.yaml` does not carry something the
  placeholder settings page needs;
- anything would name a data controller, resolve a `[CONFIRM]` fact, or
  provision a remote resource;
- you find yourself designing a like, a counter, a recommendation, or a
  notification — none is in this part, and two are prohibited by the
  rulebook.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then write `receipts/builds/<date>-M-0003-B.md`: agent and model; files
touched; dependencies added with reasons; each test above and its result;
every failure including the fixed ones; what is still not true — nothing is
deployed, no email provider exists, no one has signed up.
