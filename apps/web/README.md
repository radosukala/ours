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

**Status.** The foundation (schema, identity, sessions, the visibility
predicate, the shell) is IMPLEMENTED and TESTED locally. The modules
(accounts, connections, posts, safety, public pages) are stubs until their
builders replace them, so most routes do not exist yet.

## Run it locally

Needs Node 22+, pnpm, and a local Postgres.

```sh
pnpm install                                   # from the repository root
cp apps/web/.env.example apps/web/.env.local   # then fill in SESSION_SECRET
createdb ours_web_dev
pnpm --filter @ours/web db:migrate
pnpm --filter @ours/web seed:fictional         # add --reset to start over
pnpm --filter @ours/web dev                    # http://localhost:3000
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

## Test

```sh
pnpm --filter @ours/web test        # vitest against a real Postgres
pnpm --filter @ours/web typecheck
pnpm --filter @ours/web lint
pnpm --filter @ours/web build
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
| `scripts/` | migrate and seeds; the claims scan and weekly digest come with the public-pages module |

## Licence

Apache License 2.0 — see [`LICENSE`](./LICENSE).
