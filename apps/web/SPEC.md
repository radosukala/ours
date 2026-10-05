# OURS web — specification v0

**Authority:** built under [`M-0010`](../../mandates/M-0010.md) (BUILD),
from [`D-0011`](../../decisions/D-0011.md). Nothing here is deployed.
**Written by:** the architect, before any code. Builders implement this
document. **They do not change it.** Anything that seems to need a change is
reported to the architect, who decides and edits this file.
**Status:** PROPOSED specification → IMPLEMENTED → TESTED as the build
proceeds. The receipt records which.

---

## 1. What it is

A home for friends and the people you choose to follow.

- **Friendship** is mutual: both people agree.
- **Following** is one-way, and only possible toward someone who has chosen
  to accept followers.
- You see the posts of the people you chose, newest first. A marker shows
  where you were caught up, and the feed ends after fourteen days.
- Accounts exist only by invitation. The first act is *Connect with me on
  OURS*.

The core holds identity, connections, posts and permissions. The web
application is one client of the core. iOS and Android come later on the
same core, which is why the core has no framework imports.

**Working copy** (from `D-0011` §B; it passes the claims scan):

> **OURS** · Stay connected. On our terms.
> A home for friends and people you choose to follow. Their posts, in
> order, with an end when you're caught up.
> We're building OURS so our connections can stay with us as apps
> change — and the people using it can control its future.
> Open code. Public costs. Clear rules.
> Connect with me on OURS.

**Status line**, on every page that describes control: *Founder-led and
founder-funded at launch. Working toward control by the people using it.*

## 2. Hard rules for every builder

1. **Everything goes through the core.** Every read and every write goes
   through `src/core/*`. Pages, server actions and route handlers never
   query the database directly.
2. **Every permission decision is made in the core** and tested there.
3. **Refusals do not leak existence.** If a viewer may not see something,
   the core behaves as if it does not exist (`NOT_FOUND`). A post you may not
   see, a person who blocked you, and a used invite are
   indistinguishable from nothing.
4. **Fictional data only.** Seeds and tests use invented people, labelled
   `FICTIONAL`. Use `example.test` for email domains, never real domains.
5. **No real email.** In this mandate the mail transport is `outbox`, which
   writes to a table. The `resend` transport exists but refuses to run
   unless `NODE_ENV=production` and its variables are set.
6. **A missing human decision switches a feature off; it is never
   defaulted.** Accounts cannot be created unless `DATA_CONTROLLER` and
   `DATA_CONTROLLER_EMAIL` are set.
7. **Nothing that is not in this spec,** in particular:
   - no search, suggestions, contact upload, public graph, ranking, ads,
     photos, link previews or direct messages;
   - no analytics or tracking scripts;
   - no third-party requests from the browser: no web fonts, no CDNs.
8. **Minimal dependencies** (§3). Anything new is justified in your report.
9. **Plain words on the product pages.** Do not use *compiler*, *mandate*,
   *governance* or *constitution* there. On the public `/power` and
   `/rules` pages, say plainly who decides.
10. **Never throw at module import.** Validate lazily, fail at use, and
    catch at the boundary. A missing variable is an error at the moment it
    is needed, not at `import`.
11. **Stay in your files** (§14). Do not edit a file another module owns.
    If you need a change there, report it.

## 3. Stack

| Choice | Version | Why |
|---|---|---|
| Next.js (App Router), React | `next@16.2.7`, `react@19.2.4`, `react-dom@19.2.4` | same stack as oursnow and the founder's other projects |
| TypeScript, strict | `typescript@5.9.3` | as in the monorepo |
| Drizzle ORM + node-postgres | `drizzle-orm@^0.45`, `pg@^8`, `drizzle-kit@^0.31` (dev) | as in oursnow; SQL you can read |
| ids | `ulid@^3` | sortable, no coordination |
| production mail | `resend@^6` | as in oursnow; used only in production |
| tests | `vitest@4.1.11` | as in the monorepo |
| dev tools | `tsx`, `dotenv`, `eslint@9`, `eslint-config-next@16.2.7`, `@types/*` | as in oursnow |

**Not used:** Tailwind, UI kits, icon libraries, form libraries, zod, state
libraries or date libraries. The CSS is hand-written, and the icons are
inline SVG components.

The package is named `@ours/web`, in the pnpm workspace (`apps/*`). The code
is Apache-2.0, and `apps/web/LICENSE` is the Apache License 2.0 text.

## 4. Layout

```text
apps/web/
  SPEC.md  README.md  LICENSE  .env.example
  package.json  tsconfig.json  next.config.ts  drizzle.config.ts
  vitest.config.ts  eslint.config.mjs
  drizzle/                    generated SQL migrations (never hand-edited after commit)
  transparency/
    ledger.json               the public ledger (§11)
    control.json              who controls what (§11)
  scripts/
    migrate.ts                apply migrations to DATABASE_URL
    seed-founder.ts           create the first account (no inviter), admin, N invites
    seed-fictional.ts         FICTIONAL people, connections and posts for local UI work
    claims-scan.ts            the claims scan as a CLI (§12)
    digest.ts                 run the weekly digest once (local)
  src/
    core/                     no imports from next/*, react or src/web; pure TS over the db
    web/                      Next-specific glue: cookies, the viewer, action helpers
    app/                      routes (§10)
    components/               UI components (§9)
    styles/globals.css        tokens and base styles (§9)
  tests/                      vitest against a real Postgres
```

Path alias: `@/*` → `src/*`.

## 5. Data model

All timestamps are `timestamptz`. Ids are ulid `text` unless stated. Emails
are stored lowercased and trimmed. Handles are stored lowercased and match
`^[a-z0-9_]{3,20}$`. Reserved handles: `admin`, `ours`, `api`, `home`,
`settings`, `people`, `notifications`, `signin`, `join`, `rules`,
`privacy`, `costs`, `power`, `report`, `about`, `help`, `support`,
`official`, `root`, `system`, `null`, `undefined`.

### `accounts`

| column | type | notes |
|---|---|---|
| id | text pk | |
| email | text not null unique | lowercased |
| handle | text not null unique | lowercased |
| display_name | text not null | 1–50 chars after trim |
| bio | text not null default `''` | ≤160 chars |
| invited_by | text null → accounts.id **on delete set null** | null only for a seeded founder |
| invites_remaining | integer not null default 10 | `DEFAULT_INVITES = 10`, a founder default recorded on `/rules` |
| accepts_followers | boolean not null default false | |
| weekly_email | boolean not null default true | |
| is_admin | boolean not null default false | |
| suspended_at | timestamptz null | |
| adult_confirmed_at | timestamptz not null | self-attested 18+ at joining |
| feed_last_visit_at | timestamptz null | |
| feed_previous_visit_at | timestamptz null | |
| notifications_seen_at | timestamptz null | |
| created_at | timestamptz not null default now() | |

### `email_tokens`

A link sent by email, either to sign in or to join from an invite.

| column | type | notes |
|---|---|---|
| id | text pk | |
| token_hash | text not null unique | sha256 hex of the raw token; the raw token exists only in the email |
| email | text not null | |
| purpose | text not null | `'sign_in' \| 'join'` |
| invite_id | text null → invites.id on delete cascade | set only for `'join'` |
| created_at | timestamptz not null default now() | |
| expires_at | timestamptz not null | created + 15 min |
| used_at | timestamptz null | |

### `pending_joins`

A verified email waiting to choose a handle.

| column | type | notes |
|---|---|---|
| id | text pk | |
| email | text not null | |
| invite_id | text not null → invites.id on delete cascade | |
| created_at | timestamptz not null default now() | |
| expires_at | timestamptz not null | created + 60 min |
| completed_at | timestamptz null | |

### `sessions`

| column | type | notes |
|---|---|---|
| id | text pk | 32 random bytes, base64url; the cookie carries `id.hmac(id)` |
| account_id | text not null → accounts.id on delete cascade | |
| created_at | timestamptz not null default now() | |
| expires_at | timestamptz not null | created + 60 days |
| revoked_at | timestamptz null | |

No IP address or user agent is stored.

### `invites`

| column | type | notes |
|---|---|---|
| id | text pk | |
| code_hash | text not null unique | sha256 hex of the code; the code (22 chars base64url of 16 random bytes) is shown to the inviter once |
| inviter_id | text not null → accounts.id on delete cascade | |
| note | text not null default `''` | ≤40 chars, private to the inviter ("for Anna") |
| created_at | timestamptz not null default now() | |
| expires_at | timestamptz not null | created + 30 days |
| used_at | timestamptz null | |
| used_by | text null → accounts.id on delete set null | |
| revoked_at | timestamptz null | |

**Accounting.** Creating an invite decrements `invites_remaining`, and it
is refused at 0. Revoking an unused invite refunds one. An invite that
expires unused is marked expired (`revoked_at = expires_at`) and refunded
lazily, whenever the inviter's invites are listed or a new one is created.

### `friend_requests`

| column | type | notes |
|---|---|---|
| id | text pk | |
| from_id | text not null → accounts.id on delete cascade | |
| to_id | text not null → accounts.id on delete cascade | |
| status | text not null | `'pending' \| 'accepted' \| 'declined' \| 'cancelled' \| 'expired'` |
| created_at | timestamptz not null default now() | |
| responded_at | timestamptz null | |

A partial unique index allows at most one pending request per unordered
pair: `(least(from_id,to_id), greatest(from_id,to_id)) where status =
'pending'`. A pending request older than 30 days counts as expired and is
marked so lazily.

### `friendships`

| column | type | notes |
|---|---|---|
| a_id | text not null → accounts.id on delete cascade | always the smaller id |
| b_id | text not null → accounts.id on delete cascade | always the larger id |
| created_at | timestamptz not null default now() | |
| pk (a_id, b_id); check a_id < b_id | | |

### `follows`

| column | type | notes |
|---|---|---|
| follower_id | text not null → accounts.id on delete cascade | |
| followee_id | text not null → accounts.id on delete cascade | |
| created_at | timestamptz not null default now() | |
| pk (follower_id, followee_id); check follower_id <> followee_id | | |

### `blocks`, `mutes`

`blocks(blocker_id, blocked_id, created_at)` and `mutes(muter_id,
muted_id, created_at)`. Both columns in each table reference accounts on
delete cascade. Primary key on the pair, and a check that the two differ.

### `posts`

| column | type | notes |
|---|---|---|
| id | text pk | |
| author_id | text not null → accounts.id on delete cascade | |
| body | text not null | 1–2000 chars after trim |
| audience | text not null | `'friends' \| 'followers'` (followers means friends *and* followers) |
| created_at | timestamptz not null default now() | |
| removed_at | timestamptz null | |
| removal_category | text null | |
| removal_reason | text null | the statement of reasons shown to the author |

Index: `(author_id, created_at desc)`.

### `replies`

`id, post_id → posts.id on delete cascade, author_id → accounts.id on delete
cascade, body (1–1000), created_at, removed_at, removal_category,
removal_reason`. Index: `(post_id, created_at)`.

### `likes`

`(post_id → posts on delete cascade, account_id → accounts on delete
cascade, created_at)`. Primary key on the pair.

### `notifications`

| column | type | notes |
|---|---|---|
| id | text pk | |
| recipient_id | text not null → accounts.id on delete cascade | |
| kind | text not null | `'friend_request' \| 'friend_accepted' \| 'invite_joined' \| 'reply' \| 'like' \| 'content_removed' \| 'report_outcome' \| 'new_follower'` |
| actor_id | text null → accounts.id on delete cascade | |
| post_id | text null → posts.id on delete cascade | |
| reply_id | text null → replies.id on delete cascade | |
| report_id | text null → reports.id on delete cascade | |
| body | text null | only for `content_removed` and `report_outcome`: the statement of reasons |
| created_at | timestamptz not null default now() | |
| read_at | timestamptz null | |

Index: `(recipient_id, created_at desc)`.

### `reports`

| column | type | notes |
|---|---|---|
| id | text pk | |
| reporter_id | text null → accounts.id on delete set null | |
| target_kind | text not null | `'post' \| 'reply' \| 'account'` |
| target_post_id | text null → posts.id on delete set null | |
| target_reply_id | text null → replies.id on delete set null | |
| target_account_id | text null → accounts.id on delete set null | |
| category | text not null | `'spam' \| 'harassment' \| 'illegal' \| 'other'` |
| details | text not null default `''` | ≤500 |
| status | text not null default `'open'` | `'open' \| 'actioned' \| 'dismissed'` |
| decided_by | text null → accounts.id on delete set null | |
| decided_at | timestamptz null | |
| decision_note | text null | |
| created_at | timestamptz not null default now() | |

### `rate_events`

`id, key text, created_at` with an index on `(key, created_at)`. The keys:

- `signin:email:<h>`, `signin:ip:<h>`
- `join:email:<h>`, `join:ip:<h>`
- `post:<accountId>`, `reply:<accountId>`
- `friendreq:<accountId>`, `report:<accountId>`, `invite:<accountId>`

`<h>` is `rateKeyHash(value)` from `core/limits.ts`: an HMAC under the
session secret, purpose-tagged, because a plain sha256 of an address can be
reversed by trying them all. Every call prunes **all** keys' rows older
than 24 hours, so a key that is never hit again does not stay. *(Architect
decision, 24 September, after the foundation review.)*

### `outbox`

The development mail transport. Columns: `id, to_address, subject, body,
kind, created_at`.

### `mail_log`

| column | type | notes |
|---|---|---|
| id | text pk | |
| kind | text not null | `'sign_in' \| 'join' \| 'digest'` |
| account_id | text null → accounts.id on delete set null | |
| status | text not null | `'sent' \| 'failed'` |
| error_code | text null | |
| created_at | timestamptz not null default now() | |

No address is stored here.

### `digest_deliveries`

`(account_id → accounts on delete cascade, week_start date, status,
created_at)`. Primary key `(account_id, week_start)`.

## 6. Permissions

This is the part everything else rests on. Here *V* is the viewer and *A*
is an author.

**Relationships:**

- `blocked(V,A)`: a block exists V→A **or** A→V.
- `active(X)`: account X exists and `suspended_at is null`.
- `friends(V,A)`: a friendship row for the pair exists, and not
  `blocked(V,A)`.
- `follows(V,A)`: a follow V→A exists, `A.accepts_followers`, and not
  `blocked(V,A)`.

**Posts and replies:**

- `canSeePost(V,P)` holds when all of these are true:
  - `P.removed_at is null`;
  - `active(P.author)`;
  - not `blocked(V, P.author)`;
  - and one of: `V = P.author`, or `P.audience='friends' and
    friends(V,A)`, or `P.audience='followers' and (friends(V,A) or
    follows(V,A))`.
- **The author's own removed post** stays visible to the author, marked
  removed, with its statement of reasons.
- **Replies to P visible to V:** those where `canSeePost(V,P)`, the reply
  is not removed, `active(reply.author)`, and not `blocked(V,
  reply.author)`. The replier's own removed reply stays visible to them,
  marked.
- `canReply(V,P)` = `canSeePost(V,P)` and `active(V)`.
- `canLike(V,P)` = `canSeePost(V,P)` and `active(V)`.
- **Likes.** Only `P.author` sees who liked P and how many. Everyone else
  sees only whether *they* liked it. There is no like count for
  non-authors.

**Profiles:**

- **A profile** (`/@handle`) is visible to a signed-in, active V unless
  `blocked(V, A)` or `A` is suspended. If blocked or suspended, the page is
  not found.
- **The profile shows** display name, handle, bio, the relationship between
  V and A, and actions. Its posts are only those `canSeePost(V,·)` allows.
- **No counts** of friends or followers are shown to anyone but the owner.

**Signed-out visitors** see only the public pages (§10) and an invite
page. An invite page shows the inviter's display name and handle to whoever
holds the link.

**Suspension:**

- A suspended account cannot sign in, and its sessions are revoked.
- Its posts, replies and profile are hidden from everyone.

**A block takes effect at once, in one transaction:**

- it deletes the friendship;
- it cancels pending friend requests both ways;
- it deletes follows both ways;
- it deletes likes by each on the other's posts;
- it deletes notifications whose actor is the other person.

Replies stay but are hidden between the two by the rule above.

**Friend requests:**

- **Refused** (with the same `NOT_FOUND` as a missing person) if blocked
  either way.
- **Already friends:** answered with an already-friends status.
- **Crossed requests:** if the other person already has a pending request to
  V, V's "add" accepts it.
- **Cannot request oneself.**

**Following:**

- Allowed only if `A.accepts_followers`, A is not V, and not blocked.
- A new follower creates a `new_follower` notification.
- **Turning `accepts_followers` off** deletes all follows of that account
  (with a confirmation in the UI), and existing `followers` posts become
  visible to friends only by the `canSeePost` rule. The audience field is
  not rewritten.

**Muting** hides the muted person's posts from V's feed only. It is
private, and there is no notification.

**Reading and writing:**

- A suspended viewer can do nothing. Their session is invalid.
- Admins can read reported content through the moderation queue only. The
  queue shows the reported item regardless of audience. That is its
  purpose, and `/rules` says so.

## 7. Feed

`getFeed(db, V, { cursor?, now })` returns `{ items, nextCursor,
caughtUpBefore, ended }`.

**Candidates:** posts created at or after `now − 14 days`, authored by any
of these, and passing `canSeePost(V,·)`:

- V themself;
- anyone V is `friends` with (both audiences);
- anyone V `follows` (`followers`-audience posts).

**Excluded:** authors V mutes.

**Order:** `created_at desc, id desc`. The page size is 30. The cursor is
opaque base64url of `created_at|id`.

**`caughtUpBefore`:** `V.feed_previous_visit_at` or null. The client shows
the *caught up* marker immediately before the first item whose
`created_at <= caughtUpBefore`. No marker if null, or if every item is
newer.

**`ended`:** true when there are no more items in the window. The client
then shows *That's everything from the last 14 days.*

`recordFeedVisit(db, V, now)`:

- if `feed_last_visit_at` is null, set last = now;
- else if `now − last > 30 min`, set previous = last and last = now;
- else set last = now.

The page calls it **before** loading the first page. *(Architect decision
after the M3 build, which found that calling it after puts the marker one
session behind: a return at t0+6h showed the marker at t0, not at the
t0+3h visit.)* Recording first moves `previous` to the last time you
looked; reloads within 30 minutes leave the marker where it is.

## 8. Flows

### Sign in

1. `/signin`: the person enters an email.
2. **Rate limit:** 5 per hour per email hash, and 20 per hour per IP hash.
   The IP comes from `x-forwarded-for`'s first value, or `"local"` in
   development.
3. **If an active account exists,** create an `email_tokens` row
   (`sign_in`) and send the link `${APP_URL}/auth#<token>`.
4. **Always answer:** *"If there's an account for that address, we've sent
   a sign-in link. It works once, for 15 minutes."*
5. `/auth` is a client page. It reads the fragment and calls the
   `verifyEmailToken` server action:
   - **`sign_in`:** mark the token used, create a session and set the
     cookie, then go to `/home`.
   - **Unknown, used or expired token:** show *"This link has expired or
     was already used."* with a link to `/signin`.

### Join from an invite

1. **`/i/<code>`:** look the invite up by hash.
   - **Valid:** show *"<Name> (@handle) invited you to connect on OURS"*.
   - **Not usable** (unknown, used, expired, revoked, inviter suspended or
     gone): show one generic message, *"This invite can't be used. Ask the
     person who sent it for a new one."*
   - **Signed in:**
     - a button *"Add <Name> as a friend"* (`useInviteAsExisting`);
     - if already friends, show *"You're already friends"* and do not
       consume the invite;
     - if the viewer is the inviter, show *"This is your own invite"* and
       show the note;
     - if blocked either way, show the generic message.
   - **Signed out and the controller is not named** (§8 "controller
     gate"): show *"OURS isn't open for new accounts yet."* with a link to
     `/privacy`, and no form.
   - **Otherwise:** an email field. Submit calls `requestJoin` (rate limit:
     3 per hour per email hash, 10 per hour per IP hash), which creates an
     `email_tokens` row (`join`, `invite_id`) and sends
     `${APP_URL}/auth#<token>`. It always answers *"Check your email — we've
     sent a link."*
2. **`/auth` with a `join` token:** mark the token used.
   - **If an account already exists for that email:** sign it in, apply the
     invite as for an existing account, and go to `/home`.
   - **Otherwise:** create a `pending_joins` row, set a signed httpOnly
     cookie `ours_join` = `id.hmac`, and go to `/join`.
3. **`/join`:** a form with display name, handle (live-validated on the
   server when submitted) and a required checkbox *"I'm 18 or older"*. The
   text reads *"By joining you agree to the [rules] and have read the
   [privacy notice]."*
4. **Submit calls `completeJoin`** in one transaction:
   1. Re-check that the pending join is valid, the invite is usable, the
      inviter is active, the email is still free and the handle is free.
   2. Create the account (`invited_by` = inviter, `adult_confirmed_at` =
      now).
   3. Mark the invite used.
   4. Create the friendship (inviter, new person).
   5. Notify the inviter (`invite_joined`).
   6. Complete the pending join and delete its cookie.
   7. Create a session and go to `/home`.

### Controller gate

`config.accountCreationOpen()` is true iff `DATA_CONTROLLER` and
`DATA_CONTROLLER_EMAIL` are both non-empty. `requestJoin` and
`completeJoin` refuse with `CLOSED` otherwise. Sign-in for existing accounts
is unaffected.

### Sign out

- `/settings` → *Sign out* revokes this session.
- *Sign out everywhere* revokes all sessions of the account.

### Invites

- **`/people/invites`:**
  - shows the remaining count, and a *Create invite link* form with an
    optional note;
  - after creation it shows the link once, with *Copy* and (on devices
    that support it) *Share* via `navigator.share`, with the text
    *"Connect with me on OURS"*;
  - lists your invites with status (waiting, used by @handle, expired,
    revoked) and a *Revoke* action on waiting ones.
- **Rate limit:** 20 invites created per day.

### Friends, follows, blocks, mutes

**`/people`**, with tabs (sub-routes):

- `/people`: Friends;
- `/people/requests`: Requests, incoming (Accept / Decline) and outgoing
  (Cancel);
- `/people/following`;
- `/people/followers`;
- `/people/invites`.

**Profile actions** by state:

- *Add friend*, then *Requested* (with Cancel), then *Friends* (a menu
  with *Unfriend*);
- *Follow* / *Following*, shown only if the profile accepts followers;
- a menu with *Mute* / *Unmute*, *Block* / *Unblock* and *Report*.

**Rate limit:** 50 friend requests per day.

### Posts

- **The composer on `/home`:** a textarea (placeholder *"What's new?"*) with
  a counter from 1800 characters. The audience select, *Friends* or
  *Friends & followers*, appears only if `accepts_followers`.
- **Post:** rate limit 50 posts per day. Delete your own post, with
  confirmation. There is no edit.
- **`/p/<id>`:** the post and its replies (oldest first), with a reply box
  if `canReply`. The post's author may delete replies on their post. A
  replier may delete their own reply.
- **Rate limit:** 200 replies per day.
- **Likes:** toggle. The author sees a count and a *Liked by* list on
  `/p/<id>`.

### Notifications

- **`/notifications`:** the newest 100, grouped by nothing. Opening the page
  sets `notifications_seen_at`, marks all read, and shows the unread count
  in the navigation.
- **Liking your own post** creates no notification.
- **Replying to your own post** creates no notification.

### Report and moderate

- **The *Report* action** on a post, reply or profile leads to
  `/report?kind=post&id=…`, with a category (radio) and details (optional,
  ≤500).
  - **Refused** if the reporter cannot see the target (`NOT_FOUND`).
  - **Rate limit:** 20 per day.
  - **Confirmation:** *"Thanks. A person will look at this."*
- **`/admin` (admins only; others get not found):** open reports, oldest
  first, each showing the reported item and the reporter's handle.
  - **Remove:** requires a category and a statement of reasons (≥10
    chars). It sets `removed_*` on the item, sets the report to
    `actioned`, and sends a `content_removed` notification to the author
    with the statement and a `report_outcome` notification to the reporter.
  - **Dismiss:** takes an optional note, and sends a `report_outcome`
    notification to the reporter.
  - **Suspend account:** requires a reason (≥10 chars). It sets
    `suspended_at`, revokes all sessions, and actions the report.
  - Every decision records `decided_by` and `decided_at`.
- **What the author sees:** their removed post or reply shows *"Removed:
  <category>. <reason>. If you think this is wrong, write to <controller
  email>."*

### Export and delete

- **`/settings/export`:** downloads `ours-export-<handle>-<yyyy-mm-dd>.json`
  containing:
  - `exported_at`;
  - `account`: handle, display_name, bio, email, created_at,
    invited_by_handle;
  - `posts` (yours, including removed ones with their reasons);
  - `replies` (yours);
  - `likes` (post ids and author handles of posts you liked);
  - `friends`, `following` and `followers` (handle, display_name, since);
  - `blocked`, `muted`;
  - `invites` (created_at, status, used_by_handle).

  Nothing else: no other person's posts or emails.
- **`/settings/delete`:** type your handle to confirm. This deletes the
  account row. Cascades remove sessions, posts, replies, likes,
  friendships, follows, blocks, mutes, notifications, invites and requests.
  Reports keep the reporter as null. It signs you out, and the goodbye page
  reads *"Your account and everything you posted is gone."*

### Weekly email

`runWeeklyDigest(db, now)`:

1. `weekStart` is Monday 00:00 UTC of `now`'s week.
2. **For each active account with `weekly_email`** and no delivery for
   `weekStart`:
   - find the distinct authors, other than the recipient, who posted in the
     last 7 days, whose posts the recipient `canSeePost`, excluding muted
     people;
   - if there are none, record the delivery as `skipped` and send nothing;
   - otherwise send.
3. **The email:**
   - subject: *"This week on OURS"*;
   - body lists up to five names: *"Anna posted 3 times. Petr posted
     once."*, then *"and 4 others"*, then *"Open OURS: <APP_URL>/home"*,
     then *"Stop these emails: <APP_URL>/unsubscribe#<token>"*;
   - **it never includes post text.**
4. `digest_deliveries` records `sent`, `failed` or `skipped`, and
   `mail_log` records the attempt.
5. **The unsubscribe token** is `accountId.hmac("digest-unsub:"+accountId)`.
   `/unsubscribe` reads the fragment and calls an action that sets
   `weekly_email=false`. No sign-in is needed.
6. **The route:** `POST /api/cron/weekly-digest` with `Authorization:
   Bearer ${CRON_SECRET}`. It is refused if `CRON_SECRET` is unset. The
   script `scripts/digest.ts` runs it locally.

## 9. Design

*Replaced in part by §18.22 (M-0020, D-0023): the app now has our.one's
own look. The token table below (X's colours), the system fonts at 15px /
1.35, the layout's 600px centre and 350px right columns, the left
navigation with its Post pill, the top bar with the wordmark on `/home`,
"Home" in the bottom bar and the pill-shaped buttons are history; §18.22
says what replaced them.*

**The brief, from the founder:** *very system-like fonts, look like X,
Instagram — super simple in design and layout, something people know.*
Familiar, quiet, dense, fast.

**Fonts:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
"Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji",
"Segoe UI Emoji"`. The base is 15px / 1.35. No web fonts.

**Tokens** (CSS custom properties on `:root`, with a dark variant under
`@media (prefers-color-scheme: dark)`):

| token | light | dark |
|---|---|---|
| `--bg` | `#ffffff` | `#000000` |
| `--text` | `#0f1419` | `#e7e9ea` |
| `--muted` | `#536471` | `#71767b` |
| `--border` | `#eff3f4` | `#2f3336` |
| `--hover` | `#f7f9f9` | `#16181c` |
| `--accent` | `#1d9bf0` | `#1d9bf0` |
| `--danger` | `#f4212e` | `#f4212e` |
| `--like` | `#f91880` | `#f91880` |
| `--primary-bg` / `--primary-text` | `#0f1419` / `#ffffff` | `#eff3f4` / `#0f1419` |

**Layout:**

- **≥1000px:** three columns, centred. *(Architect decision after the foundation build: 88 + 600 + 350 does not fit 1000px, so the right column is 290px at 1000–1099px and 350px from 1100px, and the nav is icon-only at 88px until 1280px.)*
  - **Left:** navigation, 88–260px. The wordmark **OURS** in 800 weight,
    then items with a 26px icon and a 19px label: Home, Notifications
    (unread dot or count), People (pending count), Profile, Settings. Then
    a full-width *Post* pill that focuses the composer on `/home`, and the
    account chip at the bottom.
  - **Centre:** 600px with 1px side borders and a sticky header of 53px
    with a blurred background.
  - **Right:** 350px, with an *Invite someone* card showing remaining
    invites and a link to `/people/invites`, and a small footer: *Open code
    · Costs · Who controls what · Rules · Privacy*, the running version, and
    the status line.
- **700–999px:** an icon-only left navigation (72px) and the centre
  column.
- **<700px:**
  - a sticky top bar of 53px with the page title (on `/home`: the wordmark);
  - the centre at full width;
  - a fixed bottom tab bar of 52px plus the safe-area inset: Home, People,
    ＋ (compose), Notifications, Profile;
  - content is padded so nothing hides under the bar.

**Components:**

- **Avatar:** a circle with initials, its colour chosen by hashing the
  handle over 8 muted hues. Sizes 40, 48 and 80. No uploads.
- **Post row:** padding 12px 16px and a bottom border.
  - **Header:** avatar; **display name** (700); `@handle · 3h` muted;
    a small lock or people icon for the audience, with a tooltip.
  - **Body:** `white-space: pre-wrap`. URLs are linkified with `rel="nofollow
    noopener noreferrer ugc" target="_blank"`, and the display is truncated
    at 40 chars.
  - **Actions** (row of icons, 34px targets):
    - reply, with the reply count shown to everyone who can see the post;
    - like, where the heart fills in `--like` when liked, and a count
      appears only for the author;
    - a `⋯` menu with Report, Delete (own), Mute, Block.
- **Buttons:** pills, radius 9999px, height 36px (small 32px), font 15px
  weight 700. Kinds: primary (`--primary-*`), outline (1px `--border` in
  dark, `#cfd9de` in light), and danger outline.
- **Inputs:** 1px border, radius 4px, padding 12px. A focus ring of 2px
  `--accent`.
- **Markers:** a centred block, padding 20px, 13px muted text, and a thin
  rule on each side.
  - Caught up: **"You're caught up"** with *"You've seen everything since
    <relative time>."*
  - End: *"That's everything from the last 14 days."*
- **Empty states:** one sentence and one action. Examples: *"Your feed is
  quiet. Invite someone you know."* with **Invite**, and *"No
  notifications yet."*
- **Relative time:** `now`, `Xm`, `Xh`, `Xd`, then a date (`12 Sep`, or
  `12 Sep 2025` in another year). The `title` attribute holds the full
  date and time.
- **Icons:** inline SVG, 24×24 viewBox, 1.75 stroke, `currentColor`: home,
  bell, people, person, gear, plus, heart, heart-filled, chat, dots,
  lock, globe-people, arrow-left, share, copy, flag.

**Accessibility:**

- landmarks, one `h1` per page, and labels on every input;
- `aria-current` on the active navigation item;
- `aria-pressed` on the like button;
- visible focus, 44px minimum touch targets on mobile, and
  `prefers-reduced-motion` respected (there is barely any motion anyway).

**Public pages** (landing, rules, privacy, costs, power, invite, sign-in,
join):

- one centred column of 600px with the wordmark header and a footer;
- the same tokens;
- the landing headline in 31px / 800;
- no marketing imagery.

**PWA:** `src/app/manifest.ts` (name OURS, `display: standalone`, theme
colours) and an SVG icon at `src/app/icon.svg`: a bold "O" monogram.

## 10. Routes

| Route | Who | Owner |
|---|---|---|
| `/` | everyone; signed-in viewers are redirected to `/home` | M5 |
| `/rules`, `/privacy`, `/costs`, `/power` | everyone | M5 |
| `/signin`, `/auth` | everyone | M1 |
| `/i/[code]`, `/join` | everyone | M2 |
| `/unsubscribe` | everyone | M5 |
| `/home` | signed in | M3 |
| `/p/[id]` | signed in | M3 |
| `/u/[handle]` (and `/@handle` via a rewrite) | signed in | M3 page, M2 `ProfileHeader` |
| `/notifications` | signed in | M3 |
| `/people`, `/people/requests`, `/people/following`, `/people/followers`, `/people/invites` | signed in | M2 |
| `/settings`, `/settings/export`, `/settings/delete`, `/settings/blocked` | signed in | M1 |
| `/report` | signed in | M4 |
| `/admin` | admin | M4 |
| `/api/health` | everyone; counts only | M5 |
| `/api/cron/weekly-digest` | bearer token | M5 |

**Route groups:**

- `src/app/(public)/…` share `src/app/(public)/layout.tsx`, owned by the
  foundation.
- `src/app/(app)/…` share `src/app/(app)/layout.tsx`, owned by the
  foundation. It requires a viewer, redirects to `/signin` otherwise, and
  renders the navigation.

`next.config.ts` rewrites `/@:handle` to `/u/:handle`.

**Every page and action** *(architect decisions after the foundation build)*:

- every `(app)` page renders `PageHeader` itself (it is the sticky top bar
  at every width; `/home` passes `wordmark`) and calls `requireViewer()`
  itself — the layout's check is not enough;
- every server action calls `requireViewer()` — except the actions of signed-out flows (sign-in, `/auth`, joining, unsubscribing), where the email token, the signed join cookie or the signed unsubscribe token is the permission;
- actions that change navigation counts (accepting a request, opening
  notifications) call `revalidatePath("/", "layout")`;
- the composer has `id="compose"` and focuses itself when the URL hash is
  `#compose` (the Post pill and the ＋ tab link there);
- `core/limits.hit()` rolls back with the caller's transaction, so call it
  before, not inside, a transaction that may fail.

Server actions live in an `actions.ts` next to the route that uses them.
Each one:

1. gets the viewer (`requireViewer()`);
2. calls the core;
3. calls `revalidatePath` where needed;
4. returns `{ ok: true, … } | { ok: false, error: string }`, where
   `error` is a sentence a person can read.

## 11. Transparency files

### `transparency/ledger.json`

Rendered by `/costs`. **Only recorded facts, stated commitments and
labelled estimates.** The initial content, which builders keep exactly:

```json
{
  "scope": "This ledger covers OURS only. It is kept separate from any other project of the same company.",
  "currency": "USD",
  "contributions_open": false,
  "unpaid_work": "The founder works on OURS without pay. This is acknowledged here and not given a money value.",
  "entries": [
    {
      "id": "L-0001",
      "kind": "commitment",
      "status": "PROPOSED",
      "date": "2026-09-24",
      "description": "Founder's proposed contribution toward initial infrastructure costs",
      "amount": 2500,
      "repayable": "not yet stated",
      "evidence": null,
      "note": "Proposed by the founder in conversation on 24 September 2026. Shown as a proposal until confirmed, and as received only when it is."
    },
    {
      "id": "L-0002",
      "kind": "estimate",
      "status": "ESTIMATE",
      "date": "2026-09-24",
      "description": "our.one domain",
      "amount": 700,
      "period": "per year",
      "evidence": null,
      "note": "The founder's figure. Recorded as a paid cost only when the registrar's invoice is recorded."
    }
  ]
}
```

`/costs` shows four sections:

- **Received:** entries with `kind: contribution, status: RECORDED`.
- **Paid:** `kind: expense, status: RECORDED`.
- **Remaining:** received minus paid, or *nothing received yet*.
- **Coming:** commitments and estimates, each with its status in words.

It also shows the unpaid-work line, the scope line, *"Contributions: not
open yet."*, and the text: *"When they open, they'll be asked for as
'Support OURS'. They won't be tax-deductible unless the recipient
qualifies, and they don't buy reach or a say."*

### `transparency/control.json`

Rendered by `/power`. The initial content is from
`authority/FOUNDING-AUTHORITY.md` §4 and `D-0011`. Each row has `asset`,
`who`, `status` and `evidence`, with status one of `RECORDED`, `STATED`
(the founder's statement, not verified) or `NOT_YET_RECORDED`.

| asset | who | status |
|---|---|---|
| The rules of OURS | The founder, under bootstrap authority. Decisions are public in the OURS records. | RECORDED (`D-0011`) |
| The domain our.one | The founder, through the founder's registrar account | RECORDED (`FOUNDING-AUTHORITY.md` §4) |
| The operator | Ctrl AI, Inc. (Delaware) is proposed as the starting operator. Its authority, assets and responsibility for OURS are not yet recorded. | STATED |
| The code | Public, Apache-2.0. The running version is shown at the bottom of every page. | RECORDED |
| Hosting, database, email sending | None yet. OURS is not deployed. | RECORDED |
| Releases | The founder, only under a release decision | RECORDED (`M-0010`: build only) |
| Moderation | The founder, the only administrator | RECORDED |
| Money | No account and nothing received | RECORDED |
| Data controller | Not yet named. Accounts can't be created until it is. | NOT_YET_RECORDED |
| If the founder stops | Not yet arranged | NOT_YET_RECORDED |

`/power` shows the rows in plain words, with the status line and *"This
page changes when control changes. Every change is a commit in the OURS records, published with each release."*

## 12. The claims scan

`src/core/claims.ts` exports `PROHIBITED`, a list of `{ pattern: RegExp,
reason: string }`, and `scanText(text): Hit[]`. The patterns:

- the kernel's list: member-owned, owned by (our|the) members, members own,
  ratified by (our|the) members, tamper-proof, non-bypassable;
- this decision's list, checked case-insensitively: `not for sale`,
  `user[- ]owned`, `owned by (?:its |our |the )?users`, `co-owner`,
  `\byou own\b`, `\bwe own\b`, `\bstake\b`, `\binvest`, `\bequity\b`,
  `\bdividend`, `well paid`, `tax[- ]deductible` (a hit unless preceded by
  "not" or "won't be"), `will spread`, `\bviral\b`, `algorithm-free`,
  `no algorithm` (allowed only on `/rules` in the exact sentence *"No
  algorithm decides the order."*; builders avoid it elsewhere).

`tests/claims.test.ts` and `scripts/claims-scan.ts` scan:

- every `.tsx` and `.ts` file under `src/app` and `src/components`
  (string literals and JSX text; a regex over the whole file text is
  acceptable);
- `transparency/*.json`;
- the mail templates in `src/core/mail-templates.ts`.

**An allowlist** in `claims.ts` (file plus exact sentence) covers a denial
that is itself a sentence like *"Owned by its users: no."* Every allowlist
entry carries a reason.

**The scan is `CHECKED`, not `ENFORCED`:** a pattern cannot read
polarity, and the page says so.

## 13. Core API

Every function takes `db` (a `Db` = drizzle instance or transaction)
first, and throws `CoreError` with `code: 'NOT_FOUND' | 'FORBIDDEN' |
'INVALID' | 'RATE_LIMITED' | 'CONFLICT' | 'CLOSED'` and a human message.
`now` is passed where time matters, and defaults to `new Date()`.

**Foundation** (`core/`):

- **`config.ts`:**
  - `appUrl()`;
  - `accountCreationOpen()`;
  - `controller()` → `{ name, email } | null`;
  - `controllerRepresentative()` → `string | null` (§18.14);
  - `sessionSecret()`, which throws at use if missing or shorter than 32
    chars;
  - `cronSecret()`;
  - `mailTransport()` → `'outbox' | 'resend'`;
  - `DEFAULT_INVITES`, `FEED_WINDOW_DAYS = 14`, `PAGE_SIZE = 30`.
- **`db.ts`:**
  - `getDb()` (lazy pool, a dev global, never throws at import);
  - `type Db`;
  - `withTx(db, fn)`.
- **`schema.ts`:** all tables in §5, exactly.
- **`ids.ts`:** `newId()`, `randomToken(bytes=32)`, `sha256(s)`,
  `hmac(secret, s)`, `timingSafeEqualStr`.
- **`errors.ts`:** `CoreError` and `isCoreError`.
- **`validate.ts`:** `normEmail`, `validHandle` (+ reserved),
  `validDisplayName`, `validBio`, `validPostBody`, `validReplyBody`,
  `validNote`, `validReportDetails`.
- **`limits.ts`:** `hit(db, key, { max, windowSec, now })`, which throws
  `RATE_LIMITED` when over the limit, otherwise records the event, and
  prunes that key's rows older than 24 hours.
- **`mail.ts`:**
  - `sendMail(db, { to, subject, body, kind, accountId? })`, which writes
    to the outbox or sends through Resend and writes `mail_log`;
  - `latestOutbox(db, to)` for tests and development.
- **`mail-templates.ts`:** `signInEmail(url)`, `joinEmail(url,
  inviterName)`, `digestEmail(lines, appUrl, unsubUrl)`, each returning
  `{ subject, body }`.
- **`auth.ts`:**
  - `createEmailToken(db, { email, purpose, inviteId?, now })` → raw token;
  - `consumeEmailToken(db, token, now)` → `{ email, purpose, inviteId }`,
    or `NOT_FOUND` if unknown, used or expired;
  - `createSession(db, accountId, now)` → `{ id, cookieValue }`;
  - `sessionFromCookie(db, value, now)` → `accountId | null` (checks the
    HMAC, expiry, revocation and that the account is active);
  - `revokeSession`;
  - `revokeAllSessions(db, accountId)`;
  - `createPendingJoin`;
  - `pendingJoinFromCookie`;
  - `signValue` / `verifySignedValue`, the generic signed-cookie helpers.
- **`visibility.ts`:**
  - `isBlocked(db, x, y)`, `areFriends`, `isFollowing` (includes the
    `accepts_followers` check), `isActive`;
  - `canSeePost(db, viewerId, postId)` → the post row or null;
  - `visiblePostPredicate(viewerId)`, an SQL fragment builder used by
    lists (see below);
  - `relationship(db, viewerId, otherId)` → `{ self, friends,
    requestOut, requestIn, following, followedBy, blocked, blockedBy,
    muted, acceptsFollowers }`.

  **One source of truth.** `canSeePost` and every list query use the same
  predicate, built once in SQL:

  ```sql
  p.removed_at is null
  and author.suspended_at is null
  and not exists (block viewer→author or author→viewer)
  and (
    p.author_id = :viewer
    or exists (friendship)
    or (p.audience = 'followers' and exists (follow viewer→author) and author.accepts_followers)
  )
  ```

  No second, hand-written version exists anywhere.
- **`notifications.ts`:** `notify(db, {...})` (never notifies yourself;
  skips if blocked either way), `countUnread(db, accountId)`, and
  `countIncomingRequests(db, accountId)`.

**Foundation, web glue** (`src/web/`):

- **`session.ts`:** `SESSION_COOKIE = "ours_session"`, `setSessionCookie`,
  `clearSessionCookie`, `JOIN_COOKIE = "ours_join"` and helpers. Cookies
  are httpOnly, `sameSite=lax`, secure in production, path `/`.
- **`viewer.ts`:**
  - `getViewer()` → `{ id, handle, displayName, isAdmin, acceptsFollowers,
    invitesRemaining } | null`, cached per request with React `cache`;
  - `requireViewer()`, which redirects to `/signin`.
- **`actions.ts`:** `action(fn)`, which wraps a server action body,
  catches `CoreError`, and returns `{ok:false,error}`. Unknown errors are
  logged and return a generic sentence.
- **`request.ts`:** `clientIpHash()`, from headers.

**Modules:**

- **M1:** `core/accounts.ts`:
  - `getAccountByHandle`;
  - `updateProfile`;
  - `setAcceptsFollowers` (off deletes follows);
  - `setWeeklyEmail`;
  - `deleteAccount`;
  - `requestSignIn(db, { email, ipHash, now })`;
  - `verifyEmailLink(db, { token, now })` → `{ kind: 'signed_in',
    accountId } | { kind: 'join_pending', pendingJoinId } | { kind:
    'joined_existing', accountId }`. For an existing account with a join
    token it calls M2's `useInviteAsExisting`. Until the merge, M1 imports
    it from `core/invites.ts`, whose stub the foundation creates.

  And `core/export.ts`: `exportAccount(db, accountId)`.
- **M2:** `core/invites.ts`:
  - `createInvite`, `listInvites` (refunds expired), `revokeInvite`;
  - `lookupInvite(db, code)` → public view or null;
  - `requestJoin`;
  - `completeJoin`;
  - `useInviteAsExisting`.

  And `core/connections.ts`: `sendFriendRequest`, `acceptFriendRequest`,
  `declineFriendRequest`, `cancelFriendRequest`, `unfriend`, `follow`,
  `unfollow`, `block`, `unblock`, `mute`, `unmute`, `listFriends`,
  `listRequests`, `listFollowing`, `listFollowers`, `listBlocked`,
  `listMuted`.
- **M3:** `core/posts.ts`:
  - `createPost`, `deletePost`;
  - `getPostForViewer` (includes `likedByMe`, `replyCount`, and
    `likeCount` + `likers` only for the author);
  - `listPostsByAuthor`;
  - `createReply`, `deleteReply`, `listReplies`;
  - `toggleLike`.

  And `core/feed.ts`: `getFeed`, `recordFeedVisit`. And `core/inbox.ts`:
  `listNotifications`, `markAllRead`.
- **M4:** `core/reports.ts`: `createReport`, `listOpenReports` (admin),
  `removeContent`, `dismissReport`, `suspendAccount`.
- **M5:**
  - `core/digest.ts`: `runWeeklyDigest`, `digestUnsubscribe(db, token)`;
  - `core/claims.ts`;
  - `core/transparency.ts`: `loadLedger()`, `loadControl()`, `ledgerSummary()`;
  - `core/health.ts`: `counts(db)` → accounts, friendships, posts in the
    last 7 days.

## 14. Modules and file ownership

A builder edits only the files it owns. **Shared files are the
foundation's.** A stub the foundation creates for a module is owned by that
module, which replaces it.

| Module | Owns |
|---|---|
| **Foundation** | package/config files; `drizzle/`; `scripts/migrate.ts`, `scripts/seed-founder.ts`, `scripts/seed-fictional.ts`; `src/core/{config,db,schema,ids,errors,validate,limits,mail,mail-templates,auth,visibility,notifications}.ts`; `src/web/*`; `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/not-found.tsx`, `src/app/(app)/not-found.tsx`, `src/app/error.tsx`, `src/app/globals.css` (or `src/styles/globals.css`); `src/components/{Avatar,Button,Icon,Nav,TabBar,RightColumn,PageHeader,RelativeTime,Linkify,EmptyState,Marker,Field}.tsx`; `tests/helpers.ts`, `tests/setup.ts`, `tests/visibility.test.ts`, `tests/auth.test.ts`; stubs listed below; README.md, LICENSE, .env.example |
| **M1 accounts** | `src/core/accounts.ts`, `src/core/export.ts`; `src/app/(public)/signin/**`, `src/app/(public)/auth/**`; `src/app/(app)/settings/**`; `src/components/settings/**`; `tests/accounts.test.ts`, `tests/signin.test.ts`, `tests/export.test.ts` |
| **M2 connections** | `src/core/invites.ts`, `src/core/connections.ts`; `src/app/(public)/i/**`, `src/app/(public)/join/**`; `src/app/(app)/people/**`; `src/components/profile/ProfileHeader.tsx` (stub from the foundation), `src/components/people/**`; `tests/invites.test.ts`, `tests/connections.test.ts`, `tests/blocks.test.ts` |
| **M3 posts** | `src/core/posts.ts`, `src/core/feed.ts`, `src/core/inbox.ts`; `src/app/(app)/home/**`, `src/app/(app)/p/**`, `src/app/(app)/u/**`, `src/app/(app)/notifications/**`; `src/components/posts/**` (PostRow, Composer, ReplyList, LikeButton, PostMenu, FeedList), `src/components/NotificationRow.tsx`; `tests/posts.test.ts`, `tests/feed.test.ts`, `tests/likes.test.ts`, `tests/notifications.test.ts` |
| **M4 safety** | `src/core/reports.ts`; `src/app/(app)/report/**`, `src/app/(app)/admin/**`; `src/components/safety/**`; `tests/reports.test.ts`, `tests/moderation.test.ts` |
| **M5 public** | `src/core/digest.ts`, `src/core/claims.ts`, `src/core/transparency.ts`, `src/core/health.ts`; `src/app/(public)/page.tsx`, `src/app/(public)/{rules,privacy,costs,power,unsubscribe}/**`; `src/app/api/**`; `src/app/manifest.ts`, `src/app/icon.svg`; `src/components/public/**`; `transparency/*.json`; `scripts/claims-scan.ts`, `scripts/digest.ts`; `tests/digest.test.ts`, `tests/claims.test.ts`, `tests/transparency.test.ts` |

**Stubs the foundation creates**, with the exact exported signatures from
§13, bodies throwing `new Error("not implemented: <module>")`:

- `src/core/invites.ts` and `src/core/connections.ts` (M2);
- `src/core/posts.ts`, `src/core/feed.ts` and `src/core/inbox.ts` (M3);
- `src/core/reports.ts` (M4);
- `src/core/accounts.ts` and `src/core/export.ts` (M1);
- `src/components/profile/ProfileHeader.tsx` (M2), with props `{ profile:
  { id, handle, displayName, bio }, relationship: Relationship,
  isSelf: boolean }`;
- `src/components/posts/PostMenu.tsx` (M3). Its *Report* item links to
  `/report?kind=post&id=…`, which M4 owns.

## 15. Tests

- **vitest,** with `fileParallelism: false`. `tests/setup.ts` (global
  setup):
  - creates a fresh database `ours_web_test_<random>` on the local server
    from `TEST_DATABASE_ADMIN_URL` (default
    `postgresql://localhost:5432/postgres`);
  - runs the migrations;
  - sets `DATABASE_URL`;
  - drops the database after the run.
- **`tests/helpers.ts`:**
  - `db()`;
  - `reset()`, which truncates all tables;
  - fictional factories: `makeAccount({ handle?, acceptsFollowers?,
    isAdmin? })`, `befriend(a,b)`, `follow(a,b)`, `post(a, { audience,
    body, at })`, `block(a,b)`, `mute(a,b)`;
  - a fixed clock `at("2026-09-01T12:00:00Z")`.
- **Each module tests its core functions,** including every refusal in
  `M-0010`'s acceptance list that falls in its area, asserting the error
  code. Denial paths first: a green happy path is not the product.
- **Environment in tests:** `SESSION_SECRET` is a fixed 64-char test value,
  `MAIL_TRANSPORT=outbox`, and `DATA_CONTROLLER=FICTIONAL Controller` with
  `DATA_CONTROLLER_EMAIL=controller@example.test` (except in the
  controller-gate tests).
- **Scripts:** `pnpm --filter @ours/web test`, `typecheck`, `lint` and
  `build` must all pass.

## 16. Environment

`.env.example`, with comments:

```text
DATABASE_URL=postgresql://localhost:5432/ours_web_dev
SESSION_SECRET=           # 32+ chars; generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
APP_URL=http://localhost:3000
MAIL_TRANSPORT=outbox     # outbox | resend (resend only in production)
RESEND_API_KEY=
MAIL_FROM=
DATA_CONTROLLER=          # the person or body answerable for the data; blank = no new accounts
DATA_CONTROLLER_EMAIL=
DATA_CONTROLLER_REPRESENTATIVE=   # its representative in the EU (GDPR Art. 27), if it has one (§18.14)
CRON_SECRET=
OURS_VERSION=             # shown in the footer; set by the release; blank = "development build"
```

## 17. Decisions after the independent verification (24 September 2026)

Four verifiers who did not build the application attacked it. Each proved
defects with a failing test in `tests/verify-*.test.ts`. The architect
decides as follows. Where a decision changes an earlier section, this
section governs.

**Identity and joining**

1. **A join link for an existing account asks before it connects.** This
   amends §8 "Join" step 2. Opening such a link signs the person in and
   creates nothing. They are shown *"Add <Name> (@handle) as a friend?"*
   with **Add** and **Not now**. Only **Add** applies the invite. The invite
   id travels in a signed, short-lived (15 minutes) cookie `ours_invite`,
   read by `/join/confirm`. *Why:* anyone holding an invite could type a
   member's address and make the inviter their friend in one click.
2. **Blocks silence join mail.** `requestJoin` sends nothing, and gives the
   same answer, when the address belongs to an account with a block either
   way with the inviter. The join email names the inviter as *Name
   (@handle)*.
3. **The client address comes from a header each deployment names.**
   - The header is named by `CLIENT_IP_HEADER` (for example
     `x-vercel-forwarded-for`). The first value is used.
   - In development the default is `x-forwarded-for`.
   - In production, a missing `CLIENT_IP_HEADER` switches sign-in requests
     and join requests off (`CLOSED`). This is a missing decision; it is
     never defaulted.
   - There is a per-invite limit: `join:invite:<inviteId>`, 10 per day.
   - `rate_events` gains an index on `created_at`.
4. **Mail leaves after the response.**
   - `requestSignIn` and `requestJoin` accept an optional `defer(task)`.
     Server actions pass Next's `after`, so the request path does the same
     work whether or not an account exists.
   - Tests pass nothing, and the mail is sent inline.
5. **A browser signed in as someone else is not switched silently.** If
   `/auth` finds a live session for a different account, it consumes
   nothing. It says *"You're signed in as @x. Sign out first, then open
   the link again."*
6. **Sign out everywhere** also marks that address's unused sign-in and join
   links as used.
7. **Lock order.** `deleteAccount` locks the account's invites before the
   account, the same order a join takes, so the two cannot deadlock.
8. **Cookie names.** In production the cookies are `__Host-ours_session`,
   `__Host-ours_join` and `__Host-ours_invite`.
9. **Usernames are unique, so trying one tells whether it is taken.** This
   is accepted and cannot be closed. `/rules` says it plainly. Username
   changes are limited to 5 per day (`handle:<accountId>`).

**Connections and races**

10. **A block serializes with every write between the same two people.**
    - `pairLock(tx, a, b)` in `core/visibility.ts` takes
      `pg_advisory_xact_lock` on the unordered pair.
    - These take it inside their transaction, then re-check the block:
      `block`, `unblock`, `useInviteAsExisting`, `sendFriendRequest`,
      `acceptFriendRequest`, `follow`, `toggleLike` (author and liker) and
      `createReply` (replier and post author; added after the second round).
    - `follow` also locks the followee's account row (`for share`) and
      re-checks `accepts_followers`. `setAcceptsFollowers` updates that
      row before deleting follows.
11. **One rule for showing a person.**
    - `personShownTo(viewerId, accountIdColumn)` moves to
      `core/visibility.ts`: the account is active and there is no block
      either way.
    - Every list of people that is not the viewer's own act uses it: likers,
      notification actors, `used_by` on invites (list and export) and
      `listMuted`.
    - `countUnread` counts only what `listNotifications` shows.
    - `mute` and `block` of a missing account succeed and write nothing,
      exactly as for someone who blocked you.
12. **`postPage` applies the visibility predicate itself.** No exported
    function returns posts without it.
13. **Notifications that were undone are removed:**
    - `unfollow` removes the matching `new_follower` notification;
    - cancelling or declining a friend request removes its `friend_request`
      notification.

    Follows are limited to 100 per day (`follow:<accountId>`). A sender can
    see that a request is no longer pending, and `/rules` says so.

**Safety**

14. **A suspension is explained to the person.**
    - `suspendAccount` sends the suspended person one email, kind `notice`,
      with the statement of reasons and the controller's address.
    - It is sent after the transaction commits.
    - `mail_log` and `outbox` accept kind `notice`.

**The public surface**

15. **The claims scan:**
    - normalizes whitespace and the common HTML entities before matching;
    - scans `src/core/*.ts` (except `claims.ts`) and `src/web/*.ts` as well;
    - adds the near forms: `\bco-own`, `well[- ]paid`, `owned by (its |our
      |the )?(people|community|everyone)`, `community[- ]owned`.
16. **Ledger evidence.** A `RECORDED` contribution or expense without
    evidence is refused.
17. **`/privacy`:**
    - names no supervisory authority. It says *"the data protection
      authority where you live"* until a decision records the controller's
      jurisdiction;
    - says rate-limit entries hold *"your account's id, or a scrambled code
      made from your email or network address"*;
    - lists the administrator (reads reported content whatever its
      audience) and invite holders (see the inviter's name and handle) among
      those who see data;
    - derives the email-provider line from the configuration.
18. **`/power` shows the configured controller.**
    - The data-controller row shows the configured controller as *stated in
      this server's configuration* whenever `DATA_CONTROLLER` is set, and
      *not yet recorded* otherwise, so `/privacy` and `/power` never
      disagree.
    - *Moderation* becomes STATED: *no administrator exists until something
      is deployed; the founder will be the only one*.
    - *The code* becomes STATED: *Apache-2.0; public once this build is
      pushed to the public repository*.
19. **`/rules`:**
    - *"Nobody can export your data or edit what you wrote. The author of a
      post can delete replies to it, and an administrator can remove content
      with a statement of reasons."*
    - *"Every account except the founder's is invited by a person."*
    - Under *Who decides today*: *"The founder can change or remove any of
      these checks without notice; every change is a commit in the OURS records, published with each release."*
    - It cites the tests that assert each part of a rule.
20. **The running version is shown everywhere:**
    - `runningVersion()` uses `OURS_VERSION`, then `VERCEL_GIT_COMMIT_SHA`
      (first 7 characters), then *"development build"* in development or
      *"unversioned build"* in production;
    - public pages render per request;
    - the version and the footer links are reachable on phones: the bottom
      of `/settings` shows them, and so does not-found.

**Verification stopping rule, declared before the re-check.**

- One re-verification by fresh agents, with the same four lenses narrowed
  to the changed code and every earlier `DEFECT` test.
- Anything **critical or high** it finds is fixed and checked once more.
- Anything lower is fixed where small, and otherwise recorded in the build
  receipt.
- There is no third round.

## 18. The launch website (M-0011, 28 September 2026)

**Authority:** [`M-0011`](../../mandates/M-0011.md), under
[`D-0012`](../../decisions/D-0012.md). Where this section changes an earlier
one, this section governs. Nothing is deployed.

### 18.1 The facts every page uses

- **`HANDOVER_THRESHOLD = 100_000`** is exported from `src/core/config.ts`.
  Every page and test reads this constant, and it is formatted as
  "100,000". The founder confirms the number (D-0012 §B `[CONFIRM]`), and
  it changes here only.
- **The public count** is `memberCount(db)`: accounts whose `suspended_at`
  is null. Deleted accounts no longer exist. Its sole purpose is the front
  page and the handover trigger (D-0012 §B).
- **The status line** replaces `STATUS_LINE`: **"Maintained by its founder.
  Handed to its members at 100,000."** The number comes from the constant.
- **The name** a person reads is **our.one**, always lowercase, with the dot.

### 18.2 The front page `/` (signed out). Copy is exact

The metadata title is `our.one · Today it's mine. At 100,000 members, I
give it away.`

1. **The headline.** One `<h1>` on two lines:
   - **Today it's mine.**
   - **At 100,000 members, I give it away.**
2. **The lede:** "our.one is a social network for your people: their posts,
   in order, with an end when you're caught up. No ads. No ranking."
3. **The count,** where N is `memberCount`. If the count cannot be read,
   the whole line is left out: the page still renders, with no error and no
   number.

   | N | Text |
   |---|---|
   | 0 | "Nobody is in yet. You'd be #1." |
   | 1 | "1 person is in. You'd be #2." |
   | 2 or more | "{N} people are in. You'd be #{N+1}." (for example "1,284") |

   There is no progress bar.
4. **Get in** (h2 "Get in"). This part renders only when
   `accountCreationOpen()` and `clientIpHeader()` are both true. Otherwise
   it reads "Joining opens soon."
   - **The form:** the label "Your email", the button "Get in", and the
     action `takeSeat`.
   - **Under the form:**
     - with seats open: "{open} seats open.", or "1 seat open." for one;
     - with none: "No seats open right now. Leave your address and you'll
       get the next one."
   - **The privacy note, small:** "We keep your address only to send you
     the link, and only until you're invited or you ask us to delete it."
     Then a link to Privacy.
   - **After any valid submission, the same words for everyone:** "Check
     your email. If a seat was open, your link is there. If not, you're in
     line, and we'll write when one opens."
   - **Then the existing lines:** "Have an invite? Open the link you were
     sent." and **Sign in**.
5. **The promise** (h2 "The promise"):
   - "When 100,000 people have joined, I hand over our.one's domain, its
     data and the right to replace whoever runs it to a not-for-profit body
     of its members, founded by their vote."
   - "Until then I run it as its maintainer, under a public contract. Two of
     its promises can never be changed: no sale, and the handover. The rest
     can change only with 60 days' notice, and you can always leave with
     everything."
   - The link **Read the contract** → `/contract`. The signature "Rado,
     maintainer".
6. **Why** (h2 "Why a maintainer, not an owner"). Each sentence links to
   its source, listed in §18.9:
   - "In 2012, WhatsApp wrote: “when advertising is involved you the user
     are the product.” It charged $0.99 a year after the first."
   - "In 2014, Facebook bought it for about $19 billion."
   - "In 2016, WhatsApp began sharing users' phone numbers with Facebook."
   - "In 2018, one of its founders said: “I sold my users' privacy.”"
   - "In 2025, ads came to WhatsApp."
   - "An owner can sell it, change it or shut it down. A maintainer does
     the job, or is replaced." This last line is bold and has no link.
7. **Fair questions** (h2 "Fair questions"). Each question is a `<dt>` and
   each answer a `<dd>`:

   | Question | Answer |
   |---|---|
   | "Why should I believe you?" | "Don't take my word for it. Read the contract: it is the terms you join under. The code is open, and every cost is public." |
   | "Why not hand it over now?" | "A proper not-for-profit body costs money and time, and I've built things before that nobody used. If 100,000 people want this, it deserves one, with their say." |
   | "What if it never gets to 100,000?" | "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything." |
   | "What happens at 100,000?" | "Members vote to found a not-for-profit body under rules published before that day. It gets the domain, the data and the right to replace the maintainer." |
   | "What's a maintainer?" | "The one who keeps it running. Today that's me, and today I also hold everything. After 100,000, a body of its members holds it, and can replace me." |
8. **The footer:** the existing `SiteFooter`, with a **Contract** link added.

### 18.3 `/contract` (a public page, and linked from the footer). Copy is exact

**Title:** "The contract".

**Two introduction paragraphs:**

- "Between the people who use our.one and its maintainer. Most terms of
  service list what you can't do. This one lists what the maintainer can't
  do, and says what holds each promise today: this contract, the code, or
  the law."
- "The maintainer keeps our.one running and safe, acts on reports, and pays
  the bills. Today that is me, Rado. Until 100,000 members I also hold the
  domain, the data and the keys, and I'm not paid."

**The promises.** Each is an `<li>` with the promise in bold and, below it,
"Held today by: …":

1. "It won't be sold, and nobody will invest in it for a return."
   - Held today by: this contract. This promise can never be changed.
2. "At 100,000 members, I hand over the domain, the data and the right to
   replace the maintainer to a not-for-profit body of the members, founded
   by their vote under rules published before that day. The count is the
   number on the front page: accounts that exist and are not suspended."
   - Held today by: this contract. This promise can never be changed.
3. "Your feed is your people, in order. No ranking, no ads, no selling your
   data."
   - Held today by: this contract and the code.
4. "You can leave with everything: download it all and delete it all, at
   any time."
   - Held today by: this contract, the code and the law (GDPR).
5. "Every cost is public. Money buys no reach and no say."
   - Held today by: this contract. The line links **Costs** → `/costs`.
6. "The code is open. Anyone can read it, run it or copy it."
   - Held today by: the licence (Apache-2.0). The line links **Open code**.
7. "Who holds each key is public."
   - Held today by: this contract. The line links **Who controls what** →
     `/power`.
8. "Changes come with notice. Any change to promises 3 to 7 is announced
   60 days ahead, with the reason, and you can leave with everything before
   it applies. Promises 1 and 2 can't be changed."
   - Held today by: this contract.

**Then an h2, "If it never gets to 100,000":** "Nothing is handed over.
Promise 1 still holds, the code stays open, and you can leave with
everything."

**Then the closing paragraph:** "Until 100,000, these are my promises,
written into the terms you join under. That is weaker than a law, and this
page says so."

### 18.4 Seats and the waiting list

**The schema.** Both tables are additive, in a new migration.

| Table | Columns | Notes |
|---|---|---|
| `seat_state` | `id text primary key` (always `'seats'`), `open integer not null default 0 check (open >= 0)`, `updated_at` | A single row, created on first use. |
| `waitlist` | `email text primary key` (normalized), `created_at tstz not null default now()` | Nothing else is kept. |

**The core** lives in the new file `src/core/seats.ts`.

- **`memberCount(db): Promise<number>`**
- **`seatState(db): Promise<{ open: number; waiting: number }>`**
- **`requestSeat(db, { email, ipHash, now?, defer? }): Promise<void>`**
  - **The gates:** CLOSED unless `accountCreationOpen()` and
    `clientIpHeader()` are both true, the same gates as `requestJoin`. It
    also refuses (CLOSED) when there is no maintainer account (below).
  - **Validation:** the address is validated like joining addresses.
  - **Rate limits:** `seat:ip:<ipHash>` (`RATE.joinIp`) and
    `seat:email:<rateKeyHash(email)>` (`RATE.joinEmail`).
  - **The rest runs in one task after the response, via `nowOrDeferred`,**
    so every address does the same work in the request:
    - an address that already has an account gets nothing;
    - otherwise, if a seat is open, the seat is taken in one transaction:
      `open` is decremented only if it is above 0, a seat invite is created
      and the address is removed from the waiting list. Then the seat email
      is sent with a join token for that invite;
    - otherwise, the address is inserted into `waitlist`. On a conflict,
      nothing happens.
  - **It never reveals** membership, a listing, or a seat taken by that
    address.
- **`openSeats(db, adminId, count, { now?, defer? }): Promise<{ opened: number; invited: number }>`**
  - **Refusal:** NOT_FOUND unless `adminId` is an active administrator, as
    the moderation functions do.
  - **Count:** an integer from 1 to 10,000.
  - **What it does:** it adds `count` to `open`. Then it invites waiting
    addresses, oldest first, while seats are open, each as one seat taken.
    An address that already has an account is removed without an email.
- **`forgetWaitlistAddress(db, adminId, email): Promise<void>`** is
  admin-only, and is how the owner's request to be deleted is carried out.
- **The maintainer account** is the oldest active administrator.
  - A **seat invite** is an `invites` row with `inviter_id` = the maintainer
    and `note = 'seat'`. It does not decrement the maintainer's
    `invites_remaining`, and is not shown in their invite list.
  - Joining through it follows the existing join path unchanged: an email
    token, `/auth`, `/join`, and choosing a username. The maintainer is
    recorded as the inviter, so D-0011 §D.4 still holds.
- **The seat email** (a new function in `mail-templates.ts`):
  - subject: "Your seat on our.one";
  - body: "You asked for a seat on our.one. Here is your link to join. It
    works once and expires in 15 minutes." Then the link, then: "If you
    didn't ask, ignore this email. Nothing is kept unless you join."

  The token lifetime is whatever the join token already uses; the body
  states it from the constant.

**The web.**

- `src/app/(public)/seat-actions.ts` exports **`takeSeat(prev, form)`**.
  - It returns `{ ok: true }` or `{ error: string }`.
  - The errors are: CLOSED → "Joining opens soon."; an invalid address →
    the validation message; RATE_LIMITED → the rate-limit message.
- **The admin page gains a Seats section:**
  - "Seats open: {open}. In line: {waiting}."
  - a form "Open [n] seats" (number input) → `openSeatsAction`;
  - a form "Remove an address from the line" → `forgetAction`.

**`/privacy` gains one paragraph, listing the seat request as a purpose:**
"If you ask for a seat, we keep your email address to send you the join
link, or, if no seat is open, until one opens and you are invited, or until
you ask us to delete it by writing to the controller."

### 18.5 The rename

- **Every string a person reads** changes from OURS to our.one: page text,
  metadata, `aria-label`s, email subjects and bodies, and the text in
  `transparency/*.json`.
- **"Invited you to OURS"** becomes "invited you to our.one".
- **OURS stays** in code comments, the `[ours]` log prefix, cookie names
  (`__Host-ours_*` and `ours_invite`), and anything not read by a person.
- **`/power`'s words:**
  - "The rules of our.one";
  - the operator row names the *maintainer*;
  - the status line follows §18.1.

### 18.6 The weekly email

The names are ordered by **most recent post first**:
`orderBy(desc(max(posts.createdAt)), asc(posts.authorId))`. The count of
posts per name stays in the text. This is a fix for ranking by activity.

### 18.7 The claims scan

- **One new allowlist entry,** the exact sentence "It won't be sold, and
  nobody will invest in it for a return." in the file holding the
  `/contract` copy. The reason: *D-0012 §A, promise 1: a denial of
  investment.*
- **The new pages are scanned** like the others: `/contract`, and the front
  page's new copy.
- **No other new allowance.**

### 18.8 Tests

**Builder A:**

- **The front page:**
  - it renders the headline with the threshold constant;
  - the count line's three forms, and its absence when the count throws;
  - "Joining opens soon." when the controller is unset;
  - the form, and the seat line, when it is set.
- **`/contract`:** it renders every promise with its "Held today by" line,
  and the "never gets to 100,000" paragraph.
- **The rename and the scan:**
  - no rendered public page, footer, email subject or body contains `OURS`;
  - the claims scan passes over everything, including `/contract`.

**Builder B:**

- **The count:** `memberCount` excludes suspended accounts.
- **`requestSeat`:**
  - CLOSED while the controller is unset;
  - rate-limited per address and per IP;
  - a member's address gets no mail and no row;
  - with a seat open: the join mail is in the outbox, the seat count goes
    down, the invite names the maintainer, and it leaves the maintainer's
    `invites_remaining` unchanged;
  - with no seat: the address is in `waitlist`, and a duplicate adds
    nothing;
  - the answer and the time taken are the same shape in every case.
- **`openSeats`:**
  - NOT_FOUND for a non-admin;
  - invites the oldest first and removes them from the list;
  - never goes below 0 under concurrent seat requests (a race harness, as
    in §17).
- **Joining through a seat invite** completes, and records the maintainer
  as the inviter.
- **The weekly email:** its names are ordered by the most recent post.

### 18.9 Sources for the Why section (the front page links them)

| Year | Source |
|---|---|
| 2012 | https://blog.whatsapp.com/why-we-don-t-sell-ads |
| 2014 | https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/ |
| 2016 | https://www.eff.org/deeplinks/2016/08/what-facebook-and-whatsapps-data-sharing-plans-really-mean-user-privacy-0 |
| 2018 | https://www.cnbc.com/2018/09/26/whatsapp-co-founder-explains-why-he-left-facebook.html |
| 2025 | https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html |

### 18.10 File ownership for the two builders

| Builder | Owns |
|---|---|
| **A** (public pages, copy, rename, scan) | `src/app/(public)/page.tsx`, `src/app/(public)/contract/**`, `src/components/public/**`, `src/components/RightColumn.tsx`, every file whose only change is the rename, `src/core/claims.ts`, `transparency/*.json`, `src/app/(public)/privacy/**`, and the tests for these |
| **B** (seats, count, admin, email) | `src/core/seats.ts`, `src/core/config.ts` (the constant), `src/core/schema.ts`, `drizzle/**`, `src/core/invites.ts` (the seat invite only), `src/core/digest.ts`, `src/core/mail-templates.ts` (the seat email only; A does its rename), `src/app/(public)/seat-actions.ts`, `src/app/(app)/admin/**`, and the tests for these |

**The interface is fixed now.** B commits stubs of `seats.ts`,
`seat-actions.ts` and the constant, with these signatures, before A starts.

### 18.11 Open, and not decided by the builders

These are D-0012 `[CONFIRM]`s. The builders use the words above and mark
them in the receipt:

- the threshold;
- the lock on promises 1 and 2 ("can never be changed");
- the 60 days;
- "Rado" as the maintainer's name on the site.

### 18.12 Decisions after the build (28 September 2026)

The two builders reported what their parts could not settle. Where this
section changes §18.1–§18.11, it governs.

**Seats**

1. **Every valid request uses a seat while one is open, whoever sends it.**
   - This covers a member, a repeat request, and an address that already
     holds a seat. Only the outcome differs, after the response: a member
     gets nothing, a holder gets a new link to the seat it holds, and a
     newcomer gets the seat.
   - *Why:* the builder found that the public "{open} seats open." number
     moved for a stranger and stood still for a member. That told anyone
     watching whether an address belonged to a member, which M-0011's
     acceptance forbids. The number stays public, and now it reveals
     nothing.
2. **A seat is an invitation from the maintainer, not an offer of
   friendship.**
   - Joining through a seat invite makes no friendship with the maintainer,
     and sends the maintainer no notification.
   - An account holder who opens an old seat link can't use it to become
     the maintainer's friend: it is refused as unusable.
   - *Why:* the unchanged join path would have made every seat joiner the
     maintainer's friend, giving the maintainer the friends-only posts of
     everyone who came in through a seat.
3. **A seat email that can't be sent gives the seat back:**
   - the seat reopens;
   - the unused seat invite and its links are withdrawn;
   - the address returns to its place in line, or joins it now.

   This applies both to asking and to opening seats. Nobody loses a seat to
   a failed email.
4. **The maintainer's export leaves out seat invites.** They are the
   maintainer's role, not the person's own invitations.
5. **Accepted as the builder made them:**
   - opening seats is CLOSED while no controller is named;
   - removing an address from the line also deletes its unused join links,
     any unfinished join, and development mail, when the address has no
     account;
   - a person's own invite can't carry the note "seat".

**Copy**

6. **The seat email** ends: "If the link expires, ask again on the front
   page: your seat is kept for {INVITE_TTL_DAYS} days. If you didn't ask,
   ignore this email."
   - *Why:* "Nothing is kept unless you join" was untrue, because the
     link's record keeps the address.
7. **The front page's privacy note** is now: "We use your address only to
   send you the link. What we keep, and for how long, is in Privacy."
8. **The 2012 line** now ends "It charged its users instead." "$0.99 a year"
   is not in the 2012 post it links to.
9. **Promise 4 on /contract** is now: "You can leave with everything:
   download it all and delete it all, whenever you want. If your account is
   suspended, write to us and we will do it for you." A suspended account
   can't do it itself (§17).
10. **The front page's promise section** gains a sentence: "Today these
    promises are held by that contract, the terms you join under, not yet
    by law." M-0011 asks the front page, not only /contract, to say what
    holds the promises.
11. **Accepted as the builder made them:**
    - "the our.one records" on public pages. A person reading those pages
      reads the product's name. AGENTS.md §11 keeps OURS in prose about the
      repository itself;
    - the wording of /power's maintainer row;
    - "Have an invite? Sign in" stays visible while joining is closed;
    - the Contract link comes first in the footer.

12. **/join tells a seat joiner the truth.**
    - `describePendingJoin` returns `seat`. For a seat, `/join` says: "You
      took a seat on our.one. Choose your name and username, then bring your
      people: you'll have {DEFAULT_INVITES} invites."
    - *Why:* the architect found in the browser that it said "<inviter>
      invited you. When you join, you're friends", and a seat makes no
      friendship.

**After the fourth verification (two verifiers, 28 September 2026)**

Each finding is a test in `tests/verify4-honesty.test.ts` or
`tests/verify4-seats.test.ts`, now titled `fixed:` or `recorded:`.

13. **The contract is the terms people join under.** The join form reads
    "By joining you agree to the rules and the contract, and have read the
    privacy notice." (HIGH, honesty 2)
14. **/rules says both truths.**
    - The founder can change or remove any check without notice, because
      nothing technical stops that. This is FOUNDING-AUTHORITY §6, which
      the M-0010 verification required.
    - What the checks promise is bound by the contract: 60 days' notice.
15. **The contract's promises:**
    - Promise 8 covers any change to the contract, itself included.
    - Promise 1 reads "Neither our.one nor any part of it will be sold, and
      nobody will invest in it for a return." (D-0012 §A)
    - Promise 4 and /privacy name what the export holds (profile, posts,
      replies, connections) and say to write for anything else. "Download
      it all" and "download everything" were more than the export does.
    - Promise 6 and the front page say the code *will be* public from launch.
      Pushing the code is a release precondition.
16. **The WhatsApp lines follow their sources:**
    - "In 2014, Facebook agreed to buy it…";
    - "In 2016, WhatsApp announced it would share…";
    - the full sentence "I sold my users' privacy to a larger benefit."
17. **Leaving the line:**
    - Joining by any invite, or deleting an account, removes the address
      from the seat line.
    - Removing a seat holder at their request gives the unused seat back.
18. **The line goes first.**
    - While anyone older waits, an open seat goes to the oldest waiting
      address, and the newcomer takes a place in line.
    - A seat given back after a failed email so reaches the person who was
      waiting for it.
19. **A seat email that throws is a failure too.** The seat goes back, and
    the failure is logged without the address.
20. **The seat email names the day the seat ends.** A link sent again never
    promises more time than the seat has.
21. **The one answer adds "If this address already has an account, just
    sign in."** It stays true for a member without saying whether the
    address is one.
22. **`/api/health` counts accounts that are not suspended.** It is the same
    number as the front page's.
23. **An old seat link opened by an account holder only signs them in.** It
    is never offered as a friendship.
24. **The claims scan knows D-0012's prohibitions:**
    - calling our.one the first or the only anything;
    - the handover told as done;
    - "belongs to" its members;
    - ownership in the future tense;
    - "it's ours".

    Every sentence about the handover must be listed by exact text in
    ALLOWLIST, in source and rendered form. Nine are listed.
25. **The claims scan reads more markup:** `<wbr>` as nothing, `<br>` as a
    space, `&zwj;` `&zwnj;` `&lrm;` `&rlm;` `&minus;`, and the bidi marks,
    embeddings and isolates.
26. **The export file** is named `our.one-export-<handle>-<date>.json`.

27. **After the re-check.** One agent re-checked. Both HIGH fixes hold,
    proven over HTTP in a production build. Its findings, tested in
    `tests/verify5-recheck.test.ts`, are fixed:
    - **The line goes first for every valid request:** a member's, a
      holder's and a newcomer's. The address first in line then learns
      nothing about the address typed. (MEDIUM)
    - **A failed seat email gives its seat back only if the seat is still
      outstanding,** unused and not withdrawn, and never re-queues an
      account. (MEDIUM, LOW)
    - **A seat given back is offered onward to the next address in line,**
      up to three tries. An address whose email always fails keeps its
      place, but cannot keep the seats from everyone behind it. (MEDIUM)
    - **A holder's re-sent link that throws** is caught, and logged by name
      only. (LOW)
    - **The claims scan also refuses:**
      - "the handover has happened";
      - "gave/given it away";
      - "in its members' hands";
      - "it's yours/theirs";
      - "you'll/we'll/they'll own";
      - "will (soon) be yours" and "its owners";
      - "belongs to you/us/them".

      The status line is listed by exact text and let through on every
      page. A `<br>` with attributes, a JSX fragment and U+034F are read as
      a reader sees them. (MEDIUM, LOW)

    **The stopping rule is applied: there is no further round.**

**Recorded after the fourth verification**

- **A wave's emails run in one task after the response.** If that task
  never runs, those addresses hold seats they were not told about. Asking
  again on the front page sends a link to the seat each holds. A durable
  queue of owed emails is a later build.
- **The join link's record keeps a seat address, with no automatic
  removal.** /privacy says so. Retention periods are the founder's decision
  (also M-0010's residual).

**Residual, recorded rather than fixed**

- **Someone with many addresses and client addresses can use up open
  seats.**
  - The per-address and per-client limits slow this down.
  - The administrator sees the count and can open more.
  - It sends mail only to addresses that were typed, as any sign-up form
    does.
- **A repeat request uses a seat without adding one.** That is the price of
  the uniform number.
- **The wordmark at medium widths** has not been checked in a browser by
  the builders. The architect checks it before screenshots.

### 18.13 The first screen, redesigned (28 September 2026)

**The founder's note:** the front page should be as simple as Instagram's or
X's, and it read as a document.

**The first screen is now the words and one action beside a picture of the
product.**

- **Left:**
  - the headline;
  - the one-line lede;
  - the live count, with a dot that says it is live;
  - Get in, with the address and the button on one row once there is room;
  - the seat line and the privacy note;
  - "Have an invite? … Sign in" as a text link, not a second button.
- **Right:** a phone showing a feed of the people you chose, ending at
  "You're caught up". The phone is static, with fictional people, and says
  so: "Fictional people, for illustration."
- **Width:** the page widens to 1,072px through `:has(.front-wide)`. A
  browser without `:has()` keeps the 600px column. Every other public page
  keeps its reading column.
- **Below the first screen,** in the reading column: the promise, the story
  and the fair questions, word for word as before.
- **Unchanged:** no copy changed, and every test that pins the copy still
  passes.

### 18.14 The EU representative, and the code made public (28 September 2026)

**D-0014:** the controller's contact is `privacy@ctrlai.com`. The founder is
Ctrl AI's representative in the EU under GDPR Article 27.

- **`/privacy` names the representative** under "Who is responsible" and in
  Contact, reached at the controller's address.
  - It comes from `DATA_CONTROLLER_REPRESENTATIVE`, through
    `controllerRepresentative()`.
  - It is shown only while a controller is named, and never when the value
    is blank or the confirmation placeholder.
  - A blank value names none and switches nothing off: a controller inside
    the EU needs no representative.
- **No other page names it.** `/power` keeps the maintainer's name and role.
- **The maintainer's row drops "(Delaware)".** D-0013 §A allows its name
  and role only, and FOUNDING-AUTHORITY §4.1 records the form as the
  founder's statement, unverified.

**The code was pushed to `github.com/radosukala/ours` (D-0013 §F).** The
pages that said it would be public now say it is:

- **Promise 6:** "The code is public, under an open licence (Apache-2.0):
  anyone can read it, run it or copy it." Held today by: this contract and
  the licence.
- **The front page's first fair question** ends "The code is public, and so
  is every cost."
- **`/power`'s code row** begins "Apache-2.0, and public". It stays STATED.

### 18.15 The front page, product first (M-0013, 29 September 2026)

**Authority:** [`M-0013`](../../mandates/M-0013.md), under
[`D-0015`](../../decisions/D-0015.md), which amends D-0012 §D. Where this
section changes §18.2, §18.8, §18.9 or §18.13, it governs. Copy is exact.
[threshold] is `THRESHOLD`, [invites] is `DEFAULT_INVITES`, [maintainer] is
`MAINTAINER` and [notice] is `NOTICE_DAYS`.

The metadata title is `our.one · Just your people. Then you're done.`

**1. The first screen.** Two columns from 900px: the words on the left,
the phone on the right. One column on a phone, in this order:

1. **The headline,** one `<h1>` on two lines:
   - **Just your people.**
   - **Then you're done.**
2. **The lede:** "our.one shows you posts from the people you choose,
   newest first. No ads and no suggested posts. When you've seen them all,
   it tells you, and you can put your phone down."
3. **Get in** (h2 "Get in", visually hidden, id `front-get-in`).
   - **While `accountCreationOpen()` and `clientIpHeader()` are both
     true:**
     - the form, unchanged: the label "Your email", the button "Get in",
       and the action `takeSeat`;
     - the seat line, only when no seat is open: "No seats open right now.
       Leave your address and you'll get the next one." With seats open, or
       when the seats can't be read, there is no seat line;
     - "Free to join. You get [invites] invites to bring your people.";
     - the privacy note, small: "We'll email you the link. Once you've
       joined, you also get a weekly email, which you can stop. What we
       keep, and for how long, is in Privacy." with the link to `/privacy`;
     - the answer after any valid submission, unchanged (D-0015 §H).
   - **Otherwise:** "Joining opens soon." Then "Have an invite? It can't
     be used until joining opens." (after the verification and the
     re-check; the header's Sign in stays, and the line has no link).
4. **The promise, signed:** a card after Get in, with an initial where a
   face would be.
   - "I'll never sell our.one. When [threshold] people have joined, I hand
     it to a not-for-profit body of its members, and they can replace me."
   - "[maintainer], maintainer", and the link **How that works** →
     `#front-runs`.
5. **The phone** (`FeedPreview`):
   - the three fictional posts of §18.13;
   - the app's caught-up marker: "You're caught up" and "You've seen
     everything from before your last visit, 2 days ago.";
   - a tab bar like the app's on a phone, icons only;
   - the caption "An example feed. Fictional people."

**2. Where did your friends go?** (h2, id `front-friends`)

- **"7%"** in large type, hidden from screen readers; the sentence carries
  it.
- "In January 2025, content from friends got 7% of the time Americans spent
  on Instagram. Most of the rest went to short videos from strangers,
  recommended by AI."
- "Source: the court's opinion in FTC v. Meta, page 8, citing Meta's own
  figures." The words "the court's opinion in FTC v. Meta" link to the
  source listed below.
- "On our.one, your feed is only the people you chose, and then it ends."
- **The illustration** (`FeedContrast`), a figure captioned
  "Illustration.":
  - two small phones, labelled "A ranked feed" and "our.one";
  - the first shows Sponsored, Suggested for you, one friend's post,
    Suggested for you, Sponsored and Suggested for you, fading out over
    "and it keeps going";
  - the second shows three friends' posts and "You're caught up".

**3. How it works** (h2, id `front-how`), an ordered list:

1. **Get in.** "Your email, a name and a username. It's free, and you need
   to be 18 or older."
2. **Bring your people.** "You get [invites] invites. It stays quiet until
   the people you care about are here, so send them to the ones you'd
   actually want to hear from."
3. **Catch up, then close it.** "Their posts, newest first. When there's
   nothing new, it says so."

**4. Keep your people. Change who runs it.** (h2, id `front-runs`)

- **"WhatsApp, in three dates"**, then three lines, each the link to its
  source (below):
  - 2012: "WhatsApp wrote: “when advertising is involved you the user are
    the product.” It charged its users instead."
  - 2014: "Facebook agreed to buy it for about $19 billion."
  - 2025: "Ads came to WhatsApp."
- In bold, with no link: "An owner can sell it, change it or shut it down.
  A maintainer does the job, or is replaced."
- "our.one has a maintainer: me, [maintainer]. I run it under a public
  contract, and that contract is the terms you join under. Two of its
  promises can never be changed: no sale, and the handover. The rest can
  change only with [notice] days' notice, and you can always leave with
  everything."
- "When [threshold] people have joined, I hand over our.one's domain, its
  data and the right to replace whoever runs it to a not-for-profit body of
  its members, founded by their vote."
- "Today these promises are held by that contract, not yet by law."
- **The count,** in §18.2 item 3's forms, with the live dot. It is left out
  when it can't be read.
- **The links:** **Read the contract** → `/contract`, **See every cost** →
  `/costs`, and **Read the code** → the open code, in a new tab.

**5. Fair questions** (h2, id `front-questions`). Each question is a `<dt>`
and each answer a `<dd>`, in one column:

| Question | Answer |
|---|---|
| "Is it free?" | "Yes. Today I pay the bills, and every cost is public." |
| "What if my friends aren't on it?" | "At first they won't be. That's what your [invites] invites are for." |
| "Can I post photos?" | "Not yet. Posts are words for now." |
| "Is there an app?" | "Not yet. our.one works in your phone's browser, and you can add it to your home screen." |
| "Why should I believe you?" | "Don't take my word for it. Read the contract: it is the terms you join under. The code is public, and so is every cost." |
| "What if it never gets to [threshold]?" | "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can leave with everything." |
| "What's a maintainer?" | "The one who keeps it running. Today that's me, and today I also hold everything. After [threshold], a body of its members holds it, and can replace me." |

**6. The close** (h2 "Bring your people.", id `front-close`), only while
the form is shown: a link that looks like a button, **Get in** →
`#front-get-in`.

**Removed from §18.2:**

- the sections "The promise" and "Why a maintainer, not an owner". Their
  sentences move to item 4, and the story is cut to three lines;
- the questions "Why not hand it over now?" and "What happens at
  [threshold]?";
- the count of open seats;
- the count on the first screen;
- "Have an invite?…" while joining is open.

**The claims scan (§18.7):**

- The handover rule also catches "hand it to" and "hands it to"
  (`\bhand(?:s|ing)? it to\b`).
- FrontPage.tsx's listed sentences are the card's second sentence, the
  handover promise and "Then nothing is handed over.", each in source form
  and as rendered. The old headline and "Why not hand it over now?" leave
  the list.

**Sources.** The front page links these, in this order:

| Line | Source |
|---|---|
| 7% | https://storage.courtlistener.com/recap/gov.uscourts.dcd.224921/gov.uscourts.dcd.224921.705.0.pdf |
| 2012 | https://blog.whatsapp.com/why-we-don-t-sell-ads |
| 2014 | https://about.fb.com/news/2014/02/facebook-to-acquire-whatsapp/ |
| 2025 | https://www.cnbc.com/2025/06/16/meta-whatsapp-ads.html |

The 7% source is the court's Memorandum Opinion in *FTC v. Meta Platforms*,
No. 1:20-cv-03590 (D.D.C.), ECF No. 705, filed 2 December 2025, page 8. A
human confirms that it says what the sentence cites before the page is
published (D-0015 §E, `[CONFIRM]`).

**Tests (§18.8).** `tests/front-page.test.ts` follows this section, denial
paths first: the count unreadable, joining closed, the seats unreadable.
The tests that pinned §18.2's copy follow it too: the threshold, honesty
and claims tests, and the re-check's count of listed handover sentences
(eight, not nine).

**Width and type.**

- The page keeps §18.13's width of 1,072px.
- The headline is 36px on a phone, up to 60px.
- Section headings are 28 to 38px, and body text is 17px.
- The only colours are §9's tokens, plus the caught-up green the live dot
  already uses.

**Decisions after the verification (29 September 2026).** Two verifiers
that built nothing checked `24a683f` (honesty and the claims scan;
rendering and accessibility). What they confirmed is fixed:

- **The seat line** now reads "No seats open right now. Leave your address
  to join the line. Seats go to whoever has waited longest." The old line
  promised the next seat, and opening seats serves the longest-waiting
  address first (HIGH).
- **"What's a maintainer?"** now ends "After [threshold], I hand over the
  domain, the data and the right to replace me to a not-for-profit body of
  its members." It is in the contract's terms, and listed by exact text.
- **While joining is closed,** the line no longer tells anyone to open
  the link they were sent, because an invite does not work then either.
  (Its words were settled after the re-check, below.)
- **The 7% source** reads "pages 8 and 9". Page 9 says most time on
  Instagram goes to Reels, which are "entirely unconnected".
- **The phone is built from the app's parts:**
  - the wordmark top bar;
  - post rows in PostRow's classes with its four icons;
  - `CaughtUpMarker` above a fourth, older post (Pavel, 3d);
  - `EndMarker`;
  - the tab bar in the text colour.

  The illustration's our.one side ends on EndMarker's words.
- **The claims scan's rules:**
  - The handover rule is now `\bhand(?:s|ed|ing)? (?:it|our\.one) (?:over )?to\b`.
  - The done-rule catches "the handover happened" and "the handover took
    place".
- **Design:**
  - the card's byline and links, and the three links under the promise,
    are in the text colour and underlined;
  - the promise column is capped at 34em;
  - on narrow screens the links sit one per line;
  - on touch screens, tap targets are 44px.
- **Accepted, and recorded in the verifiers' tests:**
  - "It was Handed to its members at [threshold]." still passes the scan,
    because the status line is allowlisted everywhere;
  - the site's link blue (§9 `--accent`, 3.0:1 on white) still colours
    Privacy.

**Decisions after the re-check (30 September 2026).** A third agent that
built nothing re-checked the fixes (`413b0da`) and how the verifiers'
tests were adapted. Five fixes held; two were partial, and what it found is
fixed:

- **No like count on the phone.** Its four posts are other people's, and
  the app shows a like count only to a post's author (§7). The phone's
  rows now end at the reply count, and its whole feed reads, word for
  word, as `FeedList` draws it for the same posts and last visit; the test
  compares the two whole texts, which the earlier fix had loosened to
  snippets in order.
- **The line while joining is closed** now states a fact and promises
  nothing: "Have an invite? It can't be used until joining opens." An
  invite expires after `INVITE_TTL_DAYS`, so "it will work when joining
  opens" was a promise the code does not keep. The Sign in link that stood
  in that line under M-0011 is gone: the header has one, and item 3 now
  says so.
- **The done-rule** also catches "the handover is done", "is complete",
  "was completed" and "is finished".
- **Recorded, not changed:** the end marker's words wrap "days." alone at
  the phone's width, by the app's own rule (`.marker__body` at 70%).
- **A process gap:** the verifiers' test files were adapted before being
  committed as written, so the re-checker had to reconstruct the originals
  from the agents' transcripts. Next time, commit a verification file
  before touching it.


### 18.16 The reason, and the invitation (M-0014, 1 October 2026)

**Authority:** [`M-0014`](../../mandates/M-0014.md), under
[`D-0016`](../../decisions/D-0016.md), which amends D-0015 and D-0012 §D's
status line. Where this section changes §18.1, §18.2 or §18.15, it governs.
Copy is exact. [threshold], [invites], [maintainer] and [notice] are as in
§18.15. What this section does not name stays as §18.15 has it.

**1. The first screen.**

1. **The headline and the title** are unchanged.
2. **The lede:** "A social network for your friends and the people you
   choose to follow. Their posts, newest first. No ads and no suggested
   posts. When you've seen them all, it tells you, and you can get on with
   your day." It is `LEDE`, in `src/components/public/lede.ts`, which the
   invite page shows too (item 7). Only the front page's route imports
   FrontPage.tsx, which holds listed handover sentences.
3. **Joining** (h2 "Join our.one", visually hidden, id `front-get-in`).
   - **The button** (`joinLabel`, in `src/components/public/join.ts`):
     - "Join our.one" when a seat is open, or when the seats can't be read;
     - "Join the waiting list" when no seat is open.
   - **The seat line,** only when no seat is open: "No seats are open right
     now. Seats go to whoever has waited longest."
   - **Unchanged:** the free line, the privacy note, the answer after a
     valid submission (D-0015 §H), and the two lines while joining is
     closed.
4. **The picture** (`FeedPreview`), unchanged.
5. **The promise, signed:**
   - "I'll never sell our.one. When [threshold] people have joined, I hand
     over its domain, its data and the right to replace me to a
     not-for-profit body of its members. Until then, I hold all three."
   - "[maintainer], maintainer", and the link **How that works** →
     `#front-runs`, as before.

**The order.** One column below 900px, in the order above: the headline and
the lede, joining, the picture, then the card. From 900px, two columns: the
headline and lede, joining and the card on the left, in that order; the
picture on the right, beside all three, with the left column centred
against it.

**2. Where did your friends go?** Unchanged; the 7% sentence still waits
for D-0015 §E's `[CONFIRM]`.

**3. How it works.** Step 1 is titled **Join**. Its text, and steps 2 and
3, are unchanged.

**4. Keep your people. Change who runs it.** (h2, id `front-runs`)

- **First, why it exists:**
  - in large bold type, "The people make the network.";
  - then "You bring the friendships, the conversations and the reasons to
    come back, so you should have a say in what it becomes. A simple feed
    is where our.one starts. The bigger purpose is a network whose people
    choose who looks after it."
- **The story's 2025 line:** "WhatsApp announced ads in Status, in its
  Updates tab.", linked to Meta's announcement (the sources table below).
  The 2012 and 2014 lines and the bold line under them are unchanged.
- **The paragraph about the maintainer** ends "…The rest can change only
  with [notice] days' notice. In Settings, you can download your profile,
  posts, replies and connections, and delete it all."
- **The handover promise** is unchanged.
- **The present state:** "Today I hold the domain, the data and the keys.
  The members' body has not been formed, and the handover has not
  happened." It replaces "Today these promises are held by that contract,
  not yet by law."
- **The count and the three links** are unchanged.

**5. Fair questions.** Two answers change:

| Question | Answer |
|---|---|
| "What if my friends aren't on it?" | "At first they won't be. Start with someone you already want to hear from: invite them, post something, and give them a reason to reply. You can keep your other apps while you try it together." |
| "What if it never gets to [threshold]?" | "Then nothing is handed over. The promise not to sell still holds, the code stays open, and you can still download your profile, posts, replies and connections, and delete it all." |

**6. The close** (h2 "Who would you like to hear from?", id `front-close`),
only while the form is shown:

- "Join, then send them an invite.";
- a link that looks like a button, with the form's label, → `#front-get-in`.

**7. The invite page** (`/i/[code]`, SPEC §8):

- **The pitch,** for a signed-out visitor while joining is closed and while
  it is open, is item 1.2's lede, word for word.
- **While they can join,** under the form: "Free to join." and the link
  **The promise behind our.one** → `/#front-runs`.
- **Nothing else changes:** the heading naming the inviter, adding a
  friend, the forms and their answers, and "Already on our.one? Sign in,
  then open this link again."

**8. The status line** (`STATUS_LINE`): "Maintained by its founder.
Promised: when [threshold] people have joined, its domain, its data and the
right to replace the maintainer go to a not-for-profit body of its members."

- It replaces §18.1's "Maintained by its founder. Handed to its members at
  [threshold]."
- It stands where that one stood:
  - every footer, on the public pages and in the app's right column;
  - the lede of `/power`;
  - `/costs` and `/rules`.

**The claims scan (§18.7):**

- **The card's handover sentence** is listed in source form and as
  rendered: "When [threshold] people have joined, I hand over its domain,
  its data and the right to replace me to a not-for-profit body of its
  members." The old card sentence leaves the list.
- **The status line** contains nothing the rules catch, so it leaves the
  list. With it goes the `everywhere` field, which let a sentence through
  on every page. "Handed to its members" is now caught wherever it is
  written.
- **The other listed sentences are unchanged.** None of the new sentences
  above is caught by a rule, except the card's.

**Sources.** The 2025 line's source changes:

| Line | Source |
|---|---|
| 2025 | https://about.fb.com/news/2025/06/helping-you-find-more-channels-businesses-on-whatsapp/ (Meta, 16 June 2025) |

The others are §18.15's.

**Tests (§18.8).** `tests/front-page.test.ts` follows this section, with
these as well:

- the button's two labels;
- the order of the first screen in the markup;
- the status line;
- the invite page's pitch and link.

The tests that pinned §18.15's copy or the old status line follow this
section too. Where a verification's test pinned a sentence that changed, it
keeps what it proved and checks the new sentence.

**Decisions after the verification (1 October 2026).** Two verifiers that
built nothing checked `dcff190`: honesty and the claims scan; rendering and
accessibility. Neither found anything HIGH. Their test files were committed
as written before anything was changed (`d56f8fc`, `dcd57d0`). What they
confirmed is fixed, or recorded in D-0016 §N:

- **The button** says "Join our.one" only when a seat is open and no
  address waits (`joinLabel(seatsOpen, seatsWaiting)`); with an address
  waiting, a new one goes in line behind it, because the line goes first
  (§18.4). The route passes `seatState`'s `waiting` as well as `open`. With
  a seat open and others waiting there is no seat line: a seat is open.
- **What holds the promise today** ends "…In Settings, you can download
  your profile, posts, replies and connections, and delete it all. If your
  account is suspended, write to us and we will do it for you." The second
  sentence is the contract's promise 4: a suspended account can't reach
  Settings.
- **The invite page's new line** shows only while joining is open as the
  front page counts it (`clientIpHeader()` set as well). Its link has the
  card's link style (`.pledgeLink`: the text colour, underlined, 44px on
  touch screens), not the link blue, which is 3.0:1 on white.
- **The claims scan** refuses the handover told as done in other verbs:
  "went to", "has gone to", "passed to", "given to" or "transferred to" its
  members, "maintained by its members", "the members' body has been
  formed", "its members now hold" and "the handover is over". The status
  line's "go to" is a promise and passes.
- **Eight sentences about the handover** that only D-0015 or this
  specification listed are listed by exact text in D-0016 §N, unchanged.
  FrontPage.tsx's header says where each is listed.
- **Polish.** `text-wrap: pretty` on the lede, the card, the seat line, the
  reason, the close's line, every `.lede` and the status line, and
  `balance` on the close's heading and the reason's first line.
  "not-for-profit" is one unbreakable span in the card. The not-found
  page's footer is at most 40em wide.
- **Accepted:**
  - a seat holder sent back by its expired link reads "Join the waiting
    list" and is sent a new link to its seat;
  - the status line's "not-for-profit" can break at its hyphen.
- **For the founder:**
  - the trigger's words. "When [threshold] people have joined" is not the
    contract's count; "are in" is proposed;
  - five readings left to a person (D-0016 §N).

**Decisions after the re-check (1 October 2026).** A third agent that built
and fixed nothing re-checked `6bbf256`: each fix where it can fail, and how
the verifiers' tests were adapted. Its file was committed as written
(`8b9c3f3`). All seven findings are LOW, so under M-0014's stopping rule
they are recorded (D-0016 §O). The small ones were also fixed:

- **Touch targets.** `.pledgeLink` is at least 44px tall on touch screens
  (`min-height: 44px`, border-box). It was 41.55px on the invite page and
  42.89px on the card.
- **Wrapping.** Every `.muted` paragraph has `text-wrap: pretty`, which
  reaches the status line on `/costs` and `/rules`.
- **The claims scan's rule** also reads the same verbs to "the
  not-for-profit body of" its members; "run by" or "maintained by" that
  body or its members; "the members' body holds" or "has formed"; "…a body
  of its members was founded"; and "its members hold".
- **contract.test's `handoverTold`** carries the same forms.
- **Listed:** two more `/contract` sentences are listed by exact text in
  D-0016 §O: "This promise can never be changed." and "The count is the
  number on the front page: accounts that exist and are not suspended."
- **Accepted:**
  - the address at the front of the line reads "Join the waiting list" and
    is sent a join link;
  - the never-reached answer names no exception for a suspended account.
    The page states it once.
- **For the founder:**
  - M-0014's acceptance wording for the button, which §N refines;
  - "you can leave with everything" on `/contract`;
  - "we will do it for you", which is done by hand;
  - the invite form in production without the header.

### 18.17 The framework pages (M-0015, 2 October 2026)

**D-0017 and D-0018:**

- our.one becomes a network of services that their users fund and will
  control, with the feed as its first project;
- the data line's seven safeguards are the rule for every protected service;
- the common agreement is published as a draft.

**The front page's headline and lede are unchanged.** They wait for the
five-stranger test (D-0017 §H).

1. **`/agreement`**, "The common agreement": the copy is the page file's,
   word for word.
   - **First comes the notice:** *"Being developed. None of the collective
     rights below is in force yet, and each part says what holds it
     today."*
   - **What ownership means here:** the definition (D-0017 §B), *"We call a
     service owned by its users only when all of that holds. None does
     yet."*, and *"This is about control. It isn't shares: there is nothing
     to trade, and nobody receives a payout."*
   - **Part 1, what users get:** seven rights, each with a "Today:" line.
     - In force on the feed: taking your data and leaving, and seeing the
       costs and rules.
     - Promised: no sale, and privacy against any vote.
     - Not in force anywhere: rules, budget, and changing who runs it.
   - **Parts 2 and 3:** what maintainers get, and what they give up.
     "Today: No one has signed this agreement yet."
   - **Part 4, the data line:** the seven safeguards, each with its "Today",
     each not built or not yet. Then:
     - *"Until all seven exist for a service, it gets nothing of yours from
       our.one…"*;
     - the feed's exception;
     - *"…it can't be prevented."* about misuse of what a service may show.
   - **Part 5:** independent and protected projects.
   - **Part 6:** money: shared costs public and approved; no money taken for
     anyone until the holder exists; revenue isn't income.
   - **Part 7:** how a service starts, ending *"Today: proposals are read by
     hand."*
   - **Part 8:** the feed, the first project. Its promise reads *"at
     {THRESHOLD} people, as it counts them, … go to a not-for-profit body of
     its members"*, followed by *"If that count is never reached, nothing is
     handed over."* (listed by exact text). It never says "have joined",
     which D-0016 §N keeps open for the founder.
   - **The founder holds the feed "as the contract says".** Whether it moves
     to the holder before the contract's count is reached is said to be
     still open (D-0017 §K.4).
   - **Last:** *"This agreement is a draft, developed in public, and anyone
     can read its words in the agreement's source. The terms you join the
     feed under are the contract."*
2. **`/projects`:** the feed, the first project.
   - The front page's lede, imported (`lede.ts`).
   - Run by `MAINTAINER`, the founder. Paid: "None, by choice".
   - Costs, linked. Held today: domain, data and keys.
   - Promised: the status line's form, with "as the contract counts them",
     and the never-reached case, listed by exact text.
   - Its users' rights today: held by the contract, promised, and not yet.
   - Its exception, with the holder question stated as open.
   - "The next one", linking to `/maintainers`.
3. **`/maintainers`**, "Build the next one":
   - what the job is;
   - what you get;
   - what you give up;
   - your users' data (out of reach, none of it built yet);
   - how to propose a service;
   - "Need something?";
   - where it stands today.

   **The two invitations are mailto links** to `PROPOSALS_EMAIL`
   (`proposalsEmail()`), with the subjects "A proposal for our.one" and "A
   need for our.one". While the setting is empty, a placeholder or not an
   address, there is no link: *"Proposals open at launch."* and *"This opens
   at launch, too."* No form, and nothing stored.
4. **Every footer:** Contract · Agreement · Projects · Build with us · Open
   code · Costs · Who controls what · Rules · Privacy.
5. **`/contract`:** after the maintainer paragraph: *"These are the feed's
   terms. The feed will also run under the common agreement, which every
   service on our.one will sign. It is being developed in public."* The
   eight promises are unchanged.
6. **`/privacy`:** while `PROPOSALS_EMAIL` is set, one paragraph says what
   happens to an emailed proposal or need, and that it isn't stored on
   our.one itself.
7. **The claims scan:** three sentences pass on `/agreement` only, in their
   exact words (D-0018 §E): the definition, the sentence that applies it,
   and the agreement's denial of investment. Everywhere else, and in the
   other forms the tests try, they are caught. The contract's never-reached
   sentence is listed once on `/agreement` and once on `/projects`.
8. **Tests:** `tests/framework-pages.test.ts` for every line above, the
   denial paths first. The claims tests render the three pages, and run
   with the address set as well.

**After the verification (2 October 2026).** Two verifiers, one for honesty
and one for rendering, proved 29 defects: 11 HIGH or MEDIUM, 18 LOW (2 HIGH
and 9 MEDIUM). One was found by both. Every one is fixed. Their tests were committed as written
before any fix.

- **Honesty.**
  - Pay is never "directly" from users. A protected service's funds go to
    the holder.
  - `/projects` speaks in the future tense.
  - The data line is "meant to" hold, with none of it built.
  - The export notes the suspended case.
  - Misuse covers "show or send".
  - The founder *holds* the feed until the holder exists.
  - Proposals stay off without a data controller.
  - Every part of `/agreement` has a "Today".
  - `/agreement` reads the controller from the configuration.
  - "Run by" names Ctrl AI, Inc., as `/contract` does.
  - The never-reached case is stated.
  - The unadopted review policy is dropped.
  - The records and the page's own source are linked.
  - The claims scan now catches ownership in the active voice and in
    quotes, "moved to" and "went to the holder", and promises of income.
- **Rendering.**
  - `.page a` takes the text colour, underlined, on every public page: the
    link blue is 3:1 on white.
  - The notice comes first on `/agreement`.
  - The definition's blockquote has a rule, not the browser's margins.
  - Paired links are 44px targets on touch screens (`.pairLink`).
  - Footer links never break inside their names, and each separator holds
    on to the link before it (`" · "`).
  - "not-for-profit" stays whole.
  - The safeguards list keeps `role="list"`.
  - The link names are "The feed's project page" and "the agreement's
    source".
  - Part 7's "Today" follows `PROPOSALS_EMAIL`.
  - `PROPOSALS_EMAIL` must be a plain address (letters, digits, `_+-`, dots,
    and a host name). Anything that would change or cut a mailto link
    switches proposals off.
  - `/privacy`'s suspended-account sentence no longer loses its space in
    Next's production compiler.

### 18.18 The build kit (M-0016, 2 October 2026)

**D-0019:** builders build with coding agents, so our.one gives the agent
instructions, rules, a check it runs itself, and tools; and the two ways to
build are shown side by side. Passing the check makes a project ready to
propose, nothing more (D-0019 §E). Every safeguard stays not built.

1. **The kit, in `kit/` at the repository's root:**
   - **`build.md`:** the instructions a coding agent follows: what our.one
     is and how much of it is in force; the lines it never crosses; six
     steps (ask, get the tool and check its SHA-256, `init`, fill in
     `our.one.json`, build, check, propose); and what each check looks at,
     with its class. It carries the tool's SHA-256.
   - **`our-one.mjs`:** one file, no dependencies, Node 18 or later. It
     reads the project's files and runs `git` only to list them and to read
     the remote's address. It makes no network request, and when it finds
     a secret it prints the file, the line and the kind, never the secret.
     - `init` creates `our.one.json`, `AGENTS.md`, `CLAUDE.md`, `COSTS.md`,
       `PITCH.md`, `.claude/settings.json` (a stop hook) and
       `.github/workflows/our-one.yml`. It overwrites nothing, except the
       rules block in `AGENTS.md`, which it puts back word for word, and the
       hook it adds to an existing settings file. It refuses the home folder
       and the filesystem's root.
     - `check` runs ten checks, each with its class (D-0019 §C): manifest
       (`STRUCTURAL`), licence, agents, data (`STRUCTURAL`), boundary,
       leave, tracking, secrets, costs and claims (`CHECKED`). A check that
       can't run (no JavaScript or TypeScript, for boundary and leave) says
       "not checked". Every run also lists the four questions a person
       answers when a project is proposed, and the five safeguards our.one
       hasn't built. There is no score. `--json` prints the same as JSON;
       `--hook` runs as Claude Code's stop hook: it sends the agent back
       once (exit 2, the failures on stderr), then lets it stop and tells
       the person (a `systemMessage`).
     - `rules` prints the rules block.
   - **`our.one.schema.json`**, the manifest's schema, and a **README**.
     The kit's licence is Apache-2.0, like the feed's code.
2. **The feed's own manifest** (`apps/web/our.one.json`): what `/privacy`
   says it keeps, word for word, plus seat requests; Resend, Vercel and Neon as its
   outside services, in words true before the deploy and after it; `src/core` and `scripts` as its boundary; its costs in
   `transparency/ledger.json`; and two sentences of `/agreement` listed in
   `claims.allowed`. `apps/web/AGENTS.md` carries the rules block, after a
   pointer to the repository's own AGENTS.md. A test runs the check on the
   feed, and it passes.
3. **The routes:** `/build.md`, `/kit/our-one.mjs` and
   `/kit/our.one.schema.json` serve the kit's files byte for byte, as
   Markdown, JavaScript and a JSON schema. They are static: read when the
   site is built. No other name under `/kit/` is served.
4. **`/build`, "Build on our.one":** the copy is the page file's, word for
   word.
   - **First comes the notice:** *"Being developed. The tools work today.
     The common agreement they follow is a draft that nobody has signed
     yet, and none of its collective rights is in force."*
   - **Two ways to build,** side by side from 640px: "On your own" (four
     lines) and "On our.one" (five lines, the last *"What it keeps about
     people is meant to stay out of your reach."*), under which *"Today:
     none of this is in force yet. …"*.
   - **Start with your coding agent:** the one line, *"Read
     https://our.one/build.md and use it to build my app for our.one."*
   - **What your agent does,** in four steps; the stop hook is described as
     it works: it sends the agent back once, then tells you.
   - **The rules:** the block's ten titles, in its order, each with how it
     is checked.
   - **What the check can tell, and what it can't:** our.one runs its own
     copy on the commit proposed, and a person reads the result. *"Passing
     makes a project ready to propose. Nothing more: it isn't listed,
     approved or protected. The people who would use it decide."*
   - **Then propose it:** by email, through `/maintainers`.
   - **The tools:** `build.md`, the tool with its version and SHA-256 (from
     `kit-info.ts`, which a test keeps equal to the file's), the schema,
     the feed's `our.one.json`, and the kit's source.
5. **Links:** every footer's "Build with us" goes to `/build`. `/maintainers`
   gains *"Start with your coding agent: Build on our.one has the line to
   give it, the rules it follows and the check it runs."* `/projects` gains
   "Checked" in the feed's facts (*"It passes the same check as every
   project proposed to our.one, rules 0. How it's checked"*), and its "The
   next one" links to both `/build` and `/maintainers`.
6. **The claims scan** reads the kit's text with `scanKitText`: the feed's
   manifest and rules block, and `kit/`'s four text files. The sentences
   the manifest lists in `claims.allowed` are quotations: each must be one
   ALLOWLIST already lets through in that file, or it is a hit. The
   rendered scan includes `/build`.
7. **Tests:** `tests/kit.test.ts` for every line above, the denial paths
   first: each check fails on a FICTIONAL project that breaks it and passes
   on one that keeps it; `init` writes only what it names; the hook; the
   tool imports nothing that reaches a network and never prints a secret;
   the feed passes; the routes serve the files; and the page.

**After the verification (2 October 2026).** Two verifiers (honesty and
rendering; the tool, adversarially) found 57 defects, and an agent trial
reported where build.md and the check fall short. All 57 are fixed; the
verifiers' tests were committed as written before any fix. The tool is now
0.2.0:

- **It runs by any path.** Run through a link, it used to do nothing and
  exit 0.
- **It reads code, not comments,** with a linear parser for imports, and
  reads `node:`/`bun:` clients.
- **The boundary check:**
  - a boundary that holds all the code fails;
  - so do queries outside it against a client it hands out, a re-exported
    client, and files written with fs.
- **The leave check:**
  - a service is named only by an entry whose `who` names it;
  - the address of a service's API counts, as do AI providers and
    gateways.
- **The tracking check:** session recording from PostHog, Amplitude,
  Datadog, Mixpanel, rrweb, OpenReplay and Highlight fails, and so do more
  Google Analytics and Tag Manager modules.
- **The secrets check:**
  - more kinds of key;
  - environment files git doesn't ignore are read for secrets, never
    printed;
  - database files fail;
  - large files are read for secrets.
- **The costs check:** placeholders, empty cells and a file that states no
  cost fail.
- **The claims check:**
  - it reads all code, message files and `our.one.json`, past tags, with
    denials let through;
  - `claims.skip` names files left to a person.
- **The data check:** an empty `data.collects` beside a database or a named
  service fails unless `data.noPersonalData` says why.
- **Other checks:**
  - the licence must be the full text, here or at the repository's root;
  - a second rules block fails.
- **init:**
  - writes no file through a link or a hard link;
  - leaves an existing `CLAUDE.md` and unknown settings shapes as they
    are;
  - doesn't write a workflow GitHub would never run in a subfolder.
- **The stop hook** reads its input to the end, and tells the agent to ask
  the person rather than invent.
- **No secret is printed,** even in a parse error.

Round one also changed the rules block's wording. The re-check found that
D-0019 §C allows that only by a new rules version and a decision (C1), so
the block is D-0019's again, word for word. Which three rules go further
than the agreement is said on `/build`, in `build.md` and in the README,
and the hook tells the agent to ask the person rather than invent.

**Pages:**

- `/build`:
  - names the three stricter rules;
  - gives the limits of two checks;
  - describes the hook as it runs;
  - its "Today" line follows `PROPOSALS_EMAIL`;
  - drops the unsourced agent names;
  - keeps "Apache-2.0" and "SHA-256" whole;
  - gives its links full names.
- `/projects` says what passing means.

`build.md` covers the trial agent's gaps: what to ask, `.gitignore`,
Windows, a monorepo, `COSTS.md`, the hook and the proposal's commit. The
feed's manifest names the hosting and the database D-0013 chose.

### 18.19 The front door (M-0017, 3 October 2026)

**D-0020:** the founder chose another agent's review and design study: the
front page becomes the network's front door, under *"The software we live
in should be ours."*, and the feed becomes its first project, one step
away. Builders start with an idea before any code. The words below are the
files', word for word; this section says where each lives and what holds
it.

1. **`/`, the front door** (`components/public/FrontDoor.tsx`, its words in
   `components/public/door.ts`, its look in `door.module.css`):
   - **The first screen:** the eyebrow *"AI helps us build. Together, we can
     make it ours."*; the headline on three lines with *"ours."* set apart;
     the lede; the two entrances, *"I want this to exist"* (to `#part`) and
     *"I want to build"* (to `#build`); then *"Founder-led today. User
     control isn't built yet."* with a link to `#open`; and the picture,
     whose description says the work and creator services are
     possibilities. Under it: *"Software should answer to the people who
     depend on it."*, with Open code, Public costs and A path to user
     control.
   - **`#idea`, "The moment we're in"** (the acid field).
   - **`#projects`:** three tabs, *"Your people"*, *"Your work"* and *"Your
     audience"*. The first is the feed, with its lede, its join form, the
     lines under it and the count, by the same gates as `/feed` (/contract
     counts "the number on the front page", and the seat email says to ask
     again there). The other two are labelled *"A possibility · no project
     announced"*, each with a card marked *"Concept only"*. Then the first
     maintainer, *"unpaid, by choice"*, and what the founder holds today.
   - **`#ours`:** the three rights, marked *Proposed*, with the status under
     them (`OURS_STATUS`: none of the agreement's collective rights is in
     force, and what already holds on the feed); and the illustration,
     which says it is one and that our.one can't do it today.
   - **`#build`** (the dark band): the invitation, pay only *"when people
     choose a service and fund it"*, three terms from `/maintainers`, *"Draft
     an idea first"*, the line for a coding agent with a button that copies
     it, the three steps, and what passing the check means.
   - **`#open`:** four rows, *Built* (the feed; the builder kit), *Draft*
     (the common agreement) and *Not built yet* (control that doesn't
     depend on the founder), each true whether or not the site is
     deployed; and *"Authority today: the founder, under bootstrap. No
     member ownership has been issued."*
   - **`#part`:** the feed (*"Join the feed"* while joining is open, *"See
     the feed"* and *"Joining opens soon."* while it isn't), a need and an
     idea; and a last line that says what a draft does, which follows
     `PROPOSALS_EMAIL`.
   - **The route** (`app/(public)/page.tsx`) reads the count and the seats
     as `/feed`'s does, and leaves a line out when one can't be read.
     Signed-in visitors go to `/home`.
2. **`/feed`, the feed's page** (`app/(public)/feed/page.tsx`, rendering
   `components/public/FrontPage.tsx`): the front page's words, form, seats,
   picture, promise and questions, moved unchanged. The count line, the
   free line, the closed line and the seat line live in `join.ts`, which
   the front door reads too; `FrontPage.tsx` re-exports them.
3. **The public layout:** the header's wordmark (*"our"*, the dot in rust,
   *"one"*), its four places (*"The idea"*, *"Projects"*, *"Build with
   us"*, *"In the open"*, on a second row on a phone) and *"Sign in"*; the
   footer's wordmark, the line *"The software we live in should be ours."*,
   and the site footer as before. The identity is `.public`'s tokens in
   `globals.css`, light and dark; the signed-in app keeps its own, and so
   do the two pictures of it (`.phone`, `.mini`). The fonts are the
   device's. Nothing loads from anywhere else.
4. **The drafts** (`components/public/Draft.tsx`, their words in
   `drafts.ts`): a need or an idea, three questions each, written in the
   browser. *"Copy my draft"* puts it on the clipboard, or shows it,
   selected, to copy by hand. *"Open in my email"* appears only while
   `PROPOSALS_EMAIL` is set; the draft goes into the link only while the
   link is 1,800 characters or fewer. Nothing is saved, sent or counted,
   and no form posts it. Without JavaScript, each button is a link to
   `/maintainers`, which says how to write. `/privacy` says what a draft
   does.
5. **`/projects`** adds the two possibilities, labelled, under *"Possibilities,
   not projects"*. **`/maintainers`** adds a sentence on starting with an
   idea, and the two drafts, drawn once the page's JavaScript runs. **`/build`** leads with *"Build something people can depend
   on."*, the deal, *"1. Start with the idea"*, *"2. Build it with your
   coding agent"* (the line, its copy button, what has been tried, and
   what the agent does, now five steps), the rules, the check's limits,
   *"3. Then propose it"* and the tools. The *"On your own"* column is
   gone (D-0020 §D).
6. **`build.md`** starts with the idea: a ninth question in step 1 (how to
   find out whether people want it), and a new step 2 that drafts four of
   `PITCH.md`'s seven parts (the need, what it offers, what it asks for
   now, and what has to happen first) before any code, and asks the person
   whether to find out first or to build now. The steps after it are
   renumbered; step 7 finishes `PITCH.md`. **The line for a coding agent**
   is *"Read https://our.one/build.md and follow it to help me bring my
   idea to our.one."* The rules, the tool and the schema are unchanged.
7. **The claims scan** reads the new files, as it reads all of `src/app`
   and `src/components`; tests/front-door.test.ts scans every rendered
   state of the front door.

**After the verification** (two verifiers and an agent trial; 31 findings,
all fixed; `receipts/conformance/2026-10-03-M-0017.verification.md`):

- **Words:** the illustration ends "…and today only the founder could";
  the rights' status says none of the *collective* rights is in force,
  and that on the feed you can already take your data and leave and see
  its costs; the feed "will run under the common agreement, which every
  service on our.one will sign"; the last heading is *"What should we make
  ours?"*; the drafts' note follows `PROPOSALS_EMAIL`, says each answer can
  be up to 600 characters, and "A person reads every one you send."
- **The feed's picture** on the front door ends as the app draws it: the
  caught-up marker above a post from before the last visit.
- **The invite page's** "The promise behind our.one" goes to
  `/feed#front-runs`.
- **The claims scan** has rules for user control, the holder or a
  safeguard told as existing, and for "protected by our.one", and its "it's
  ours" rule catches a word between and anything named.
- **In use:** the acid focus ring on the builders' band, and the paper's
  rust in the dialog opened from it; placeholders in the muted ink; the
  "recorded" badge in the text colour; the tab's ring inside it; each tab
  panel takes focus; every panel shows until the tabs are drawn, and then
  the page goes back to the section its address names; the illustration
  keeps its button's room before hydration; 44px targets on touch screens,
  and the footer's links spaced to tap.
- **The claims scan, after the re-check:** "User control exists.", "The
  data safeguards exist.", "The holder holds your data.", "The holder has
  been formed." and "The feed is controlled by its users." are caught;
  "protected by our.one" passes only after a denial in its clause, or in a
  sentence that names the claim to forbid it; "yours" and "theirs" are
  caught as "ours" is; "OURS", the working name, isn't the word "ours".
- **`build.md`** asks the project's name, the repository's address, how a
  person downloads and deletes their data, who can see it including
  whoever runs the service, and which companies (the person chooses); its
  step 2 has the agent write the people a note; `/build` says what the
  trial found.

### 18.20 Ready for the first deploy (M-0018, 3 October 2026)

D-0021 §C to §E and §I. Nothing here is deployed: it makes the build that
M-0012 can publish say what is true where it runs, and lets a release
reach the database without any agent holding its address.

**Where the site runs** (`src/core/hosting.ts`):

- **Deployed** means Vercel's production deployment: `VERCEL=1` and
  `VERCEL_ENV=production`. Anywhere else (development, a preview, a test)
  is a copy that isn't the deployed site.
- **Its region** is `VERCEL_REGION`; a known code shows its place:
  *"Frankfurt, Germany (fra1)"*.
- **Its database** is named from the host of `DATABASE_URL` only: a host
  ending in `.neon.tech` is Neon, with the region before `aws` or
  `azure`. No other part of the address is read, and none is shown.
- **`/power`'s hosting row** (`withHosting`):
  - deployed: *"Vercel runs this site, in Frankfurt, Germany (fra1). Neon
    keeps its database, in Frankfurt, Germany (eu-central-1)."*, then what
    it does with email, then *"The accounts are the founder's."*; STATED,
    as stated in this server's configuration;
  - otherwise the file's record, *"None: this copy of our.one isn't the
    deployed site."*, with what it does with email; RECORDED, except a
    copy that sends through Resend, which says so as stated in its
    configuration.
- **`/privacy`:**
  - deployed: no notice at the top; the hosting line names Vercel (every
    request passes through it, with the visitor's IP address) and Neon
    (everything in the table is stored there), with their regions;
  - otherwise the notice *"This copy of our.one isn't the deployed site.
    This notice describes what our.one keeps when it runs."* and the
    file's hosting words.
- **The administrator** (D-0021 §I): *"Only the founder can be the
  administrator."* on `/privacy` and in the house rules, and *"The
  founder: only the founder can be the administrator."* in `/power`'s
  Moderation row. It is a rule, true before the deploy and after it.

**The release step** (`scripts/release.ts`), which Vercel's production
build runs before `next build` (`apps/web/vercel.json`: `pnpm run
vercel-build`, which is `tsx scripts/release.ts && next build`):

- **It runs only in Vercel's production build of the commit the founder
  names in `OURS_RELEASE`**: 7 to 40 hexadecimal characters that begin the
  build's `VERCEL_GIT_COMMIT_SHA`. Any other build does nothing, and its
  log says why.
- **How that is held** (AGENTS.md §7): ENFORCED by this script, in the
  commit being built, so only as strong as the care over what reaches the
  production branch (see *After the verification*).
- **Without `DATABASE_URL` it fails the build.** With it, it applies the
  migrations.
- **Then the founder's account,** from `FOUNDER_EMAIL`, `FOUNDER_HANDLE`
  and `FOUNDER_NAME`:
  - only while no account exists, under the founder script's lock
    (`createFirstAccount` in `src/core/founder.ts`);
  - as the administrator, with no inviter and the default invites;
  - with none of the three set, nothing is made; with some, with a value
    that isn't valid, or with no data controller named, the build fails.
- **Its log** names no address, link, key or part of the database's
  address; a database error is printed with the address's host, user and
  password taken out. It reads no `.env` file.
- **The founder script stays fictional-only;** it and the release share
  `createFirstAccount`.

**The weekly email:** `GET` is the same handler as `POST`, with the same
secret, because Vercel's scheduler calls with GET and sends `CRON_SECRET`
as a bearer token. `apps/web/vercel.json` schedules it at `0 8 * * 1`
(Mondays, 08:00 UTC) and sets the functions' region, `fra1`.

**After the verification** (two verifiers, 21 findings; the receipt is
`receipts/conformance/2026-10-03-M-0018.verification.md`):

- **How the release gate is held** (AGENTS.md §7): **ENFORCED** by
  `scripts/release.ts` in the commit being built. A commit can change that
  code, and Vercel gives a production build the production settings, so the
  gate is as strong as the care over what reaches the production branch.
  M-0012 therefore has the founder build production from a `release`
  branch, which only a deploy moves; routine pushes to `main` become
  previews, which hold no production setting.
- **The settings are checked before the database is touched:** a release
  that fails on the founder's settings, or on a missing data controller,
  leaves the database as it was.
- **The migrations run one at a time,** under a session-wide lock, so two
  releases at once both pass.
- **One TLS rule for the site, the migrations and the release**
  (`connectionOptions` in `src/core/db.ts`): TLS with the certificate
  checked for any host but this machine, and for this machine when the
  address asks for it. The address's `sslmode` and `channel_binding` are
  said to pg directly, so pg writes no warning into the log.
- **A database error in the log** is what it means and its code
  (*"the database refused the password (28P01)."*), never its message.
- **A local run never reaches a remote database:** `seed:founder`,
  `seed:fictional`, `db:migrate` and `digest` refuse an address that isn't
  on this machine, before connecting, and so does the development server.
- **Errors are logged by name,** never by message, everywhere in the app.
- **The weekly email's route** answers HEAD with 405: Next.js would answer
  it by running GET.
- **`apps/web/vercel.json`** sets no install command: Vercel's own
  detection picks pnpm 10 from the lockfile, and an override can run an
  older pnpm.
- **Where it runs, off the deployed site:**
  - a preview names Vercel, and a copy whose database is Neon's names
    Neon, each saying it isn't the deployed site; *"None"* only when
    neither;
  - a region is named only when the host's label is a region code;
  - `/privacy` says Neon keeps *"everything this notice says is kept"*;
  - `/power` says its configuration rows change with the server's
    settings;
  - the deployed hosting row cites D-0013 §D for whose accounts they are.
- **The claims scan** catches a deployment status (*"our.one is live."*,
  *"Nothing is deployed."*) and lets a condition through (*"once our.one is
  deployed"*).

**After the re-check** (one agent, 13 findings, each fixed; the receipt
has them):

- **Off Vercel's deployments, a database on this machine only:**
  `getDb()` refuses any other unless the server runs on Vercel (production
  or a preview) or under test. That covers `next start` and `vercel dev`,
  not only `next dev` (`remoteDatabaseAllowed` in `src/core/hosting.ts`).
  The pages name no database the server would refuse.
- **The release gate's branch, `release`, is DECLARED:** nothing technical
  stops a push to it (D-0021 §K).
- **The migrations** run on one connection, in one transaction, under
  `pg_advisory_xact_lock`. The lock ends with the transaction, even
  through a pooler. A failure rolls back everything, the bookkeeping table
  included. The connection's errors reach the caller as a rejected query.
  The bookkeeping stays drizzle's own.
- **The address can't change the rule:** a `host` parameter counts as the
  host, and every TLS parameter (`ssl`, `sslcert` and the others, as well
  as `sslmode` and `channel_binding`) is taken out before pg reads it.
- **The local scripts** print a database error's meaning and code
  (`src/core/db-errors.ts`); `db:migrate` says "Migrations applied." with
  no address.
- **The claims scan** reads `apps/web/README.md` and the root README, and
  its status rule catches "Not deployed yet.", "our.one isn't live yet.",
  "It's not deployed yet." and "our.one has been deployed."
- **The weekly email's route** answers OPTIONS itself; it and HEAD's
  refusal list "GET, POST, OPTIONS".
- **`/privacy`:** Neon keeps "everything this notice says is kept on
  our.one", not an emailed proposal's mailbox.

### 18.21 Where it runs (M-0019, 3 October 2026)

D-0022: our.one runs in North America.

- **`apps/web/vercel.json`** runs the functions in Cleveland (`cle1`),
  beside the database at Neon in Ohio (us-east-2). This replaces §18.20's
  Frankfurt.
- **The deployed pages name both places** from the server's own settings:
  *"Vercel runs our.one's server, in Cleveland, United States (cle1)"* and
  *"Neon keeps our.one's database, in Ohio, United States (us-east-2)"*.
- **The feed's manifest** says its data is kept by Neon in Ohio, in the
  United States.
- **For people in the EU,** the data is stored in the United States. The
  legal basis for that transfer is a question for the legal review of
  `/privacy` (D-0012 §E).

### 18.22 One our.one, signed in or not (M-0020, 3 October 2026)

D-0023. Every page has our.one's own look, members get the header every
visitor gets, the front door is for members too, and the feed is our.one's
first project. What the feed does is unchanged. It replaces, in §9, the
token table (X's colours), the left navigation with its *Post* pill,
*Home* in the bottom bar and the pill-shaped buttons.

- **One identity** (§A):
  - the root tokens in `globals.css` are our.one's: paper `#f5f3eb`, ink
    `#222b24`, sub `#586157`, line `#d7dace`, rust `#bf411d` as the accent
    and the like, and their dark values;
  - X's colours are gone, from the stylesheet, the pictures of the app on
    `/feed` (which restate no token now), the icon, the manifest and the
    browser bar; after the verification, X's yellow (the composer's
    counter as the limit nears, now the accent) and X's green (`/feed`'s
    count dot, now rust) went too;
  - the pictures of the app on `/feed` show it as it is: the header with
    the wordmark's rust dot, the four places and the feed's own bar,
    *Feed*, and a square compose tab; the illustration's our.one side names
    its feed *Feed*;
  - every page takes the public pages' type: their sans (Helvetica Neue,
    Helvetica, Arial) at 16px / 1.55, which `:root`'s `--font` follows;
  - buttons, cards and the compose tab are square-cornered, as the public
    pages' are.
- **One header** (§B):
  - `SiteHeader` (the wordmark, which goes to `/`, and the four places) is
    on every page;
  - the not-found and error pages have it too: the not-found page with
    *Sign in* or *Your feed* on its right, the error page with nothing
    there, as who is reading can't be known while the database is down;
  - in the app, its right side is `MemberLinks`: Feed, Notifications and
    People with their counts, and a menu (a `<details>`) with Your
    profile, Settings and, for administrators, Moderation; the menu's name
    says what it holds;
  - on a phone the bottom bar carries the feed, people, writing,
    notifications and the profile, and the header keeps the menu;
  - from 761 to 999px the app's header (`public-header--member`), which
    needs about 944px on one row, puts the four places on a row of their
    own, as a phone does, with the member's links beside the wordmark; from
    700px the page's column sits inside the header's gutter, with its
    borders, as on a wide screen, and below 1000px the panel follows it;
  - the left navigation and its Post pill are gone.
- **The public layout** shows *Sign in*, or *Your feed* for a member
  (`isMemberHere`, which the front door and `/feed` ask too, so a page and
  its header agree: the session cookie, then the cached viewer; with the
  database down, nobody is shown as a member). The link sits in a Suspense
  boundary of its own, so the layout never waits on the database; until it
  knows, it offers Sign in.
- **The front door for members** (§C):
  - `/` and `/feed` no longer redirect a member;
  - where a visitor is asked to join, a member is shown *"You're in."* and
    *"Open your feed"* (`MemberJoin`), the count without a rank (*"12
    people are in."*), and no closing invitation to join;
  - in the front door's *your part*, a member's button is *Open your feed*,
    where a visitor's is *Join the feed*; on `/feed` the section that
    holds a member's two lines is named *Your feed*.
- **The feed, as the first project** (§D):
  - the feed is called *Feed* (the bar's title, the browser's title, the
    header and the bottom bar), and the buttons that lead to it say *Open
    your feed* (the in-app not-found page, `/report` on one's own post,
    `/join/confirm`, and an unusable invite link to a member);
  - beside it, or after it below 1000px, the panel holds our.one's card
    (forest, with acid buttons; its kicker, the name, in lowercase): *"The
    software we live in should be ours."*, *"The feed is our.one's first
    project. What should we make ours?"*, *Name a need* and *Bring an
    idea* (the front door's drafts), and the four places;
  - then the invite card, and the footer with the version: the app's one
    footer, at every width;
  - the manifest and the pages without a description of their own describe
    our.one as the front door does, not the feed.
- **After the verification, for rendering and use:**
  - the counts are the paper on the rust, light and dark (the dark paper
    on the dark rust): 4.74:1 and 7.22:1;
  - in our.one's panel its own two buttons are the acid, and they and its
    links take the acid ring, over the public pages' rust and ink; the
    draft dialogs they open, on their paper inside the card, keep the
    public pages' rust ring and buttons (the re-check);
  - when a focused element scrolls into view, the page keeps room for the
    sticky page header and, on a phone, the bottom bar (`scroll-padding`);
  - from 1000px the panel is never taller than the window and scrolls on
    its own, its 8px each side keeping the focus rings uncut;
  - on a touch screen the member's links and the panel's places are 44px
    tall, and the footer's links, in the panel as in the public footer,
    sit in rows apart;
  - a field's edge is `--sub`, 3:1 or more on its paper (5.79:1 light,
    7.93:1 dark), the composer's audience too, with a field's corners (the
    re-check);
  - the app's boxes are square-cornered too: a quoted post on `/report`
    and in moderation, the moderation's decision panel, a new invite
    link, a notification's statement of reasons and a removed post's note
    (the re-check);
  - a hovered post takes the card's paper, so the rust links on it stay
    4.5:1 or more;
  - the member's menu closes on Escape and on a tap outside it, as the
    app's other menus do (`useDismissableMenu`).

### 18.23 The first screen, for people who come from a post (M-0021, 5 October 2026)

D-0024. The front door's first screen says the whole thing, in order, and
has one thing to do that works; a need named is kept; every page carries a
link card. Everything below the first screen is unchanged, and so are
`/feed`'s verified words, the contract, the agreement, the drafts and what
the feed does.

- **The first screen** (§A), in `FrontDoor.tsx`'s hero, in this order:
  - the eyebrow and the headline, as before;
  - what it is, one line (`DOOR_WHAT`): *"It starts with a friends feed:
    your people, newest first, and then it ends. No ads."* It replaces
    D-0020 §A's lede on the front door; `DOOR_LEDE` stays the description
    in the metadata and the manifest;
  - the promise: the public count against its threshold (`ofThreshold`,
    *"1 of 100,000"*), then the pledge's own words, as `/feed`'s card has
    them (the handover sentence listed for `FrontDoor.tsx` by exact text in
    `claims.ts`), signed *"Rado, maintainer · How that works"*, to
    `/contract`;
  - the status line, as before;
  - the form (§C), or for a member *"You're in."* and *"Open your feed"*
    (`MemberJoin`), or while joining is closed *"Joining opens soon."* with
    the invite line;
  - *"I want to build"* as a text link to `/build`. *"I want this to
    exist"* is gone: the form is the entrance.
- **The count** (§B): `memberCount`, accounts that exist and aren't
  suspended; the waiting list never counts. A number, never a bar. When it
  can't be read, the sentence stands alone (`count: null`). The panel
  beside a member's feed (`OursCard`) shows *"N of 100,000 people are
  in."* from the same count, read in the app's layout and left out when it
  fails.
- **The form** (§C), `FirstScreenForm`: the address; an optional need,
  *"Which app would you take back?"*, at most 140 characters, with the
  hint *"Optional. Kept without your address."*; one button with D-0016
  §B's words (`joinLabel`); under it the seat line (when no seat is open)
  and the free line; and, from the first one, *"N apps named so far."*
  (`needsLine`). It posts to `takeSeat`.
- **A need, in `takeSeat`:** read first (`normalizeNeed`, in
  `need-words.ts`, a plain module the form can import: whitespace
  collapsed, control characters dropped (Unicode's Cc, the C1 set
  included, and the bidirectional controls), empty is none; over 140
  refused at its field, before anything is counted); then the seat
  request, with its gates and rate limits; then, only if that went
  through, kept (`nameNeed`). If keeping it fails, the request stands and
  the failure is logged by name. `SeatResult` gains `field: "need"` for a
  refusal at the need; the feed's form never sends one.
- **The `needs` table** (migration `0003_needs`): `id`, `text` (checked to
  1–140 characters), `created_at`, kept to the day, not the moment (the
  verification, H1), so a need isn't paired with a seat request by the
  time it came; no column for an address. `needsCount` is the public
  count: the distinct texts, read without regard to case, so one app named
  three times is one. No code lists the words: they are read by the
  founder in the database, and never shown to a visitor or a member. Kept
  for 12 months (`NEED_KEPT_MONTHS`), or until a decision publishes or
  deletes them; nothing removes them automatically yet. The down
  migration, `drizzle/down/0003_needs.sql`, drops the table after an
  export.
- **The privacy notice:** the row *"Apps you name"*: what (*"… and the day
  you wrote it. Not your address: a need is kept apart from it, with the
  day and not the time."*), why, and *"For 12 months, or until a decision
  publishes or deletes them. They are not removed automatically yet."* The
  "what Neon receives" line stays true. Under the first screen's form, the
  feed's own privacy note (D-0016 §B), with its link to `/privacy`.
- **The link card** (§D), in the root layout's metadata: `metadataBase`
  from `APP_URL` (left unset when it can't be read), `openGraph` with the
  site's name, the type and one image, whose `alt` is the headline and the
  status line the picture carries, `twitter` with the large card; no title
  or description of their own, so each page's flow in. The image,
  `public/card.png`, 1200 by 630, is rendered from `scripts/card.html` by
  `pnpm card` (a headless Chromium, `CHROME_HEADLESS_SHELL`) and committed:
  what a crawler is shown is what was committed.
- **The founder's actions, no code:** a first wave of seats opened in
  `/admin` when the post goes out; `PROPOSALS_EMAIL` set, so the drafts
  have a destination.
- **After the verification, for rendering and use:**
  - the form posts without JavaScript, or before the page's script has
    loaded (R1): its action is `takeSeat` itself, not a wrapper, and the
    root layout's `referrer` is `same-origin`, as `next.config.ts`'s
    `Referrer-Policy` header says; under `no-referrer` a browser posts a
    form with `Origin: null` and Next refuses the action (the meta tag
    overrides the header, so the two must agree);
  - the first screen's layout (R2): from 901px the promise, the status and
    the form sit beside the headline (the grid's `act` area) and the
    picture under what it is, so the form's button is in view at 1440×900,
    1366×768 and 1280×720; below 901px it is one column, in the same
    order. On a phone the decided order puts the promise before the form,
    so the button is about 1,020px down at 375×812: recorded for the
    founder, not changed;
  - the first screen's fields have ids of their own, `first-screen-email`
    and `first-screen-need` (R3), as the Projects panel's form on the same
    page has `field-email`;
  - the fields are controlled, so after a refusal the address and the need
    stay (R4); an answer starts the form again. The feed's own form
    (`GetInForm`, verified words unchanged) still loses its address after a
    refusal, as before M-0021;
  - *"How that works"* is a 44px target on a touch screen (R5).
