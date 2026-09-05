# Envelope M-0003 · Part C — Settings with receipts

**Authority:** `mandates/M-0003.md` and `M-0003.yaml`, adopted under
`decisions/D-0003`. This envelope narrows that mandate to one part. Nothing
else is authority. Read `AGENTS.md` first, then `foundation/FEED-PILOT.md`
§4–§6, and the catalog in `rules/feed/options.yaml`.

**Depends on:** Parts A and B merged. Before starting:
`pnpm ours check M-0003` must authorise.

**Amended:** 5 September 2026 under `D-0005` — the `feed.time_visible`
behavior and its test added.

## What you build

The settings page that is the institution's face, and the attention
behaviors it controls. This is the product's differentiator; build it as if
it will be photographed.

### 1. The settings page — `/settings`

Rendered **from the catalog at build time**. Load `rules/feed/options.yaml`
through the `Option` type from `@ours/schemas`; never hand-write an option
into a component. Group by layer, in this order and with these headings:

```text
WHAT YOU CAN SET                      (GOVERNED, then PERSONAL)
WHAT NO ONE CAN SET — AND WHY          (FLOOR)
WHAT IS NOT HERE — AND WHY             (absent: true)
```

Each option row shows: title; the control (radio group, switch, or number
input by `type`); the current effective value and whether it is *the
default* or *your setting*; and, for GOVERNED options, the default's
provenance line in **body type, not a footnote**:

> Default: paged · set by D-0003 (founder bootstrap) · 2 September 2026 ·
> No member has voted this default yet.

Every row has a **Why this option exists** disclosure that renders, from
the record: the rule (article id and its title from the rulebook), the
`why` paragraph, the decision, the mandate, and the `recourse` text. Links
resolve to the rulebook article and to the repository records. Nothing in
the disclosure is written in the template; it all comes from the catalog
and the rulebook.

FLOOR rows render with no control, the value, and the reason. Absent rows
render the reason and the recourse. Both use the same visual weight as the
rest — an absence explained is a feature of this product, not an apology.

### 2. Overrides — server-side, tested

`settings_overrides` (person, option_id, value, updated_at). The server
rejects an override for any option whose `person_may_override` is false or
whose value is outside `values`/`range`, with a plain-language error that
names the rule. Effective value = override ?? catalog default. A helper
`effectiveSettings(personId)` is the only way the app reads settings.

### 3. The attention behaviors

Implement each GOVERNED option's behavior in the stream Part B built:

| Option | Behavior |
|---|---|
| `feed.continuation` | `paged`: a "show more" control ends each page. `continuous-with-reminders`: the stream continues and, every `feed.reminder_interval` minutes of active viewing, a full-width line appears in the stream — *You have been reading for N minutes* — that the person dismisses to continue. `continuous`: no reminder. |
| `feed.reminder_interval` | 5, 10, or 20 minutes |
| `feed.continue_gesture` | `tap`: the "show more" / reminder dismiss is one tap. `hold`: the control must be held for `feed.hold_duration` seconds, with a visible progress ring; releasing early cancels. |
| `feed.hold_duration` | 1–5 s |
| `feed.session_budget` | `none`, or a soft stop: after N minutes the stream ends with *You set N minutes for today. Come back tomorrow, or change this in settings.* — and a plain link to continue anyway, because it is the person's setting, not a lock |
| `feed.time_visible` | `session-and-today` (default): a small monospace line in the stream header — *4 min this session · 12 min today* — measured by the same active-viewing timer as the reminders; *today* is kept in local storage only and resets at local midnight or when the person clears it. `session`: the first number only. `off`: nothing shown. Nothing is synced or sent. |
| `notifications.quiet_hours` | in-app notification surface stays empty during quiet hours (there is no push in v0; the setting still governs the in-app list) |
| `notifications.badges` | unread badges and counters render only when on; default off |
| `notifications.email_digest` | a stored preference only; no email is sent in this mandate |
| display density, theme | PERSONAL; apply immediately |

Reminders and session budgets are measured by active viewing (visibility
and interaction), not wall-clock time in a background tab. Timing state
lives client-side; nothing about reading duration is sent to the server or
stored — **the product does not learn how long you read, even to help you
stop.** Say this in the option's *why* if Part A did not.

### 4. Tests that hold the article

- **Both directions:** every catalog option renders a row with its
  `option_id` in a data attribute, and every rendered row corresponds to a
  catalog option. One test, two assertions, failing loudly on either
  mismatch.
- Every GOVERNED row shows its decision id and the phrase *No member has
  voted this default yet*.
- A FLOOR override attempt returns the rule-naming error; a value outside
  the allowed set is rejected.
- Paged vs continuous, the reminder line at the interval (fake timers),
  hold-to-continue cancelling on early release, the session soft stop, and
  quiet hours emptying the notification list.
- No reading-duration value reaches any server endpoint (assert on the
  request log).
- The time line renders by default and counts only active viewing (fake
  timers); *today* persists in local storage only and resets at local
  midnight; `session` shows one number; `off` shows none.
- Keyboard: every control reachable, the hold gesture operable by holding
  the key, reduced motion honoured for the progress ring.

## You may touch

```text
apps/feed/**   tests/**   receipts/builds/**
```

You may read `rules/feed/**` and `packages/schemas/**`; you may not edit
them. If a catalog record lacks a field this page needs, stop and write the
request into the receipt.

## Stop conditions

- an option would have to be rendered without a catalog record;
- an effective value would have to be chosen in code rather than read from
  the catalog default;
- a behavior would require storing reading duration server-side.

## Before finishing

```bash
pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
```

Then write `receipts/builds/<date>-M-0003-C.md`: agent and model; files
touched; dependencies added with reasons; each test above and its result;
every failure including the fixed ones; screenshots or a written inspection
of the settings page at 375 px and desktop, light and dark; what is still
not true.
