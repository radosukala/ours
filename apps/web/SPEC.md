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
page changes when control changes. Every change is a public commit."*

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
      `acceptFriendRequest`, `follow` and `toggleLike` (author and liker).
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
      these checks without notice; every change is a public commit."*
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
