# OURS web

A home for friends and the people you choose to follow: mutual friendship,
one-way following, posts to the people you chose, in order, with an end when
you're caught up. Accounts exist only by invitation.

This package is one core (`src/core`, plain TypeScript over Postgres, no
framework imports) and the first web application on it (Next.js). The
specification is [`SPEC.md`](./SPEC.md).

**Authority.** Built under [`M-0010`](../../mandates/M-0010.yaml) (BUILD),
from [`D-0011`](../../decisions/D-0011.md). **Nothing is deployed.** No
domain, provider account or real person's data is used; all seed and test
data is FICTIONAL, with `example.test` addresses, and mail goes to a local
`outbox` table, never to a real address.

**Status.** The core and the web application are IMPLEMENTED and TESTED
locally. **Nothing is deployed**; release is a separate decision.

What "tested" means here:

- **The core** — sign-in by link, invites and joining, friends and follows,
  blocks and mutes, posts, replies and likes, the feed with its end,
  notifications, reports and moderation, export and deletion, the weekly
  email, the ledger and the control map — is tested by calling its
  functions against a real, throwaway Postgres, refusals first.
- **The public pages** are tested by rendering their components to HTML
  in the test process: `/costs`, `/privacy`, `/power` and `/rules` whole,
  the footer and the not-found page. The landing page's words are compared
  with D-0011's working copy in its source. The claims scan reads the files
  SPEC §12 and §17 name.
- **Some server actions and route handlers** (signing in, joining, the
  export, the health count, the weekly-email route) are called directly
  in tests, with Next's request functions replaced by test doubles.
- **Not tested here:** no test drives a browser or sends an HTTP request to
  a running server, and no signed-in page is rendered in a test.

Nine agents that did not build it verified it in two rounds and a
re-check. Each finding is a test in `tests/verify-*.test.ts`,
`tests/verify2-*.test.ts` and `tests/verify3-recheck.test.ts`, and
[`SPEC.md`](./SPEC.md) §17 records the decisions on them. The build
receipt for M-0010 is in
[`receipts/builds/2026-09-24-M-0010.md`](../../receipts/builds/2026-09-24-M-0010.md),
with screenshots and the residual risks. The verification report for
M-0010 is in
[`receipts/conformance/2026-09-24-M-0010.verification.md`](../../receipts/conformance/2026-09-24-M-0010.verification.md).
No human has reviewed the code yet.

## Run it locally

Needs Node 22+, pnpm, and a local Postgres.

```sh
pnpm install                                   # from the repository root
cp apps/web/.env.example apps/web/.env.local   # then fill in SESSION_SECRET
createdb ours_web_dev
pnpm --filter @ours/web db:migrate
pnpm --filter @ours/web seed:fictional         # add --reset to start over
pnpm --filter @ours/web dev                    # http://localhost:3000 (APP_URL must match)
```

`seed:fictional` prints a one-time sign-in link for its FICTIONAL
administrator, valid for 15 minutes. Mail the app sends in development is
written to the `outbox` table.

New accounts can be created only while `DATA_CONTROLLER` and
`DATA_CONTROLLER_EMAIL` are set. Leaving them blank switches joining off;
it is never defaulted. The seed scripts follow the same rule, so for local
work name a FICTIONAL controller in `.env.local`, as the tests do
(`DATA_CONTROLLER="FICTIONAL Controller"`,
`DATA_CONTROLLER_EMAIL=controller@example.test`).

`DATA_CONTROLLER_REPRESENTATIVE` names the controller's representative in
the EU (GDPR Article 27) on `/privacy`, reached at the controller's address.
A controller inside the EU needs none; blank names none and switches nothing
off.

Two more settings are human decisions for a deployment, never defaults:

- **`CLIENT_IP_HEADER`** names the header the host sets with the visitor's
  address, one a visitor cannot write (for example `x-vercel-forwarded-for`).
  Per-address limits on sign-in and join requests read it. In development it
  defaults to `x-forwarded-for`; in production, while it is blank, sign-in
  and join requests are switched off.
- **`MAIL_TRANSPORT=resend`** with `RESEND_API_KEY` and `MAIL_FROM` sends
  real email: sign-in and join links, the weekly email, and the notice that
  explains a suspension to the suspended person. Anything else writes to the
  local `outbox` table.

## Test

```sh
pnpm --filter @ours/web test        # vitest against a real Postgres
pnpm --filter @ours/web typecheck
pnpm --filter @ours/web lint
pnpm --filter @ours/web build
pnpm --filter @ours/web claims      # the claims scan over the files SPEC §12 and §17 name; exits 1 on a hit
pnpm --filter @ours/web digest      # run the weekly email once, into the outbox
```

The tests create a fresh database (`ours_web_test_<random>`) on the server
at `TEST_DATABASE_ADMIN_URL` (default `postgresql://localhost:5432/postgres`),
migrate it, and drop it afterwards.

## Where things are

| Path | What |
|---|---|
| `src/core/` | identity, connections, posts, permissions — every read, write and permission decision |
| `src/core/visibility.ts` | the one SQL predicate for who may see a post |
| `src/web/` | cookies, the signed-in viewer, the server-action wrapper |
| `src/app/` | routes; `(public)` and `(app)` layouts |
| `src/components/` | UI; class vocabulary documented at the top of `src/app/globals.css` |
| `drizzle/` | generated SQL migrations (from `src/core/schema.ts`) |
| `scripts/` | migrate, seeds, the claims scan, the weekly digest |
| `transparency/` | the public ledger and who controls what, rendered by `/costs` and `/power`; every change is a commit |

## Licence

Apache License 2.0 — see [`LICENSE`](./LICENSE).
