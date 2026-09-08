# Equipment booking — service specification 0.1 — FICTIONAL

**Status:** ADOPTED — by `D-3` on 1 September 2026 (vote `V-3`), and pinned · **a sample record under `M-0006`; the workshop, its machines, and its members are invented**
**Cell:** `dilna-fixture` · **Tool:** `booking` · version 0.1
**Machine projection:** [`booking.yaml`](./booking.yaml)

> FICTIONAL. This is what a community's service specification looks like:
> the meaning of its records, its behaviours as articles with classes, its
> options with provenance, its contract, its tests, and what a replacement
> must carry across. Durable, and the community's. The implementation is
> anyone's, and replaceable.

## What the records mean

| Record | Meaning |
|---|---|
| **booking** | one member's claim on one machine for one slot on one day — `id`, `machine`, `member`, `start`, `end`, `status` (booked · cancelled · used · no-show) |
| **machine** | one of the four shared machines — `id`, `name`, `status` (in service · out of service, with the maintenance log `D-2` asked for) |
| **member** | a person with standing, as the layer holds them — `id`, `name`; nothing else reaches this tool |
| **waitlist_entry** | a member waiting for a machine on a day — `id`, `machine`, `member`, `day` |

## Article T-FAIR-ACCESS — One slot per person per machine per day

A member holds at most one slot per machine per day. A cancelled slot is
offered to the waitlist before anyone else. *A slot nobody uses is a slot
someone wanted.* Set by the founding arrangement on 12 August.

**Class:** `ENFORCED` — tests `t-fair-1`, `t-fair-2` · **Held by** the
booking and waitlist records

## Article T-CANCEL — Cancel by two hours before, or it counts as used

A booking cancelled less than the cancellation window before its slot
counts as used. The window is a governed option: two hours by default,
yours to shorten or lengthen for yourself within the values the members
allowed. A change to the default for everyone is open for discussion as
`P-3`.

**Class:** `ENFORCED` — test `t-cancel-1` · `STRUCTURAL` — the option's
provenance

## Article T-QUIET — Reminders off unless you turn them on

The tool never decides for you when to think about the workshop. Reminders
before a slot are off by default and personal.

**Class:** `ENFORCED` — test `t-quiet-1`

## Article T-PRIVATE — Bookings are visible to members, and nothing else is collected

A member sees other members' bookings and their names, and no other field
of any other member. The only disclosure outside the tool is to the
workshop's shared wall calendar: which machine, when — never by whom.
Nothing is retained by the application itself; bookings live in the layer
and are deleted ninety days after their slot.

**Class:** `ENFORCED` — tests `t-private-1`, `t-private-2`; the contract
check at the gate · `DECLARED` — retention, until the runtime holds it

## Article T-EXIT — Your bookings are yours to take

A member exports their bookings and their profile, as a bundle the
verifier accepts, at any time, in one action.

**Class:** `ENFORCED` — test `t-exit-1`

## Options

| Option | Layer | Default | Article | Decision |
|---|---|---|---|---|
| `booking.one_slot_per_day` | FLOOR | on — nobody's to override | `T-FAIR-ACCESS` | `D-1` |
| `booking.cancel_window` | GOVERNED | 2h — yours to set among 1h · 2h · 4h | `T-CANCEL` | `D-1` |
| `booking.reminders` | PERSONAL | off | `T-QUIET` | `D-1` |

## The contract

Reads: `booking` (all six fields), `machine` (three fields), `member`
(`id`, `name`), `waitlist_entry` — under `T-FAIR-ACCESS` and `T-PRIVATE`.
Writes: `booking`, `waitlist_entry`. Disclosures: to
`https://calendar.dilna.example`, the fields `machine`, `start`, `end`,
under `T-PRIVATE`, for the shared wall calendar. Retention: ninety days
after a slot; nothing retained by the application.

## Tests

| Test | Holds | What it checks |
|---|---|---|
| `t-fair-1` | `T-FAIR-ACCESS` | a second booking of the same machine on the same day by the same member is refused |
| `t-fair-2` | `T-FAIR-ACCESS` | a cancelled slot is offered to the waitlist before anyone else |
| `t-cancel-1` | `T-CANCEL` | a cancellation inside the window counts as used |
| `t-quiet-1` | `T-QUIET` | no reminder is sent unless the member turned reminders on |
| `t-private-1` | `T-PRIVATE` | a member sees no field of another member beyond their name |
| `t-private-2` | `T-PRIVATE` | the calendar disclosure carries machine, start, end and nothing else |
| `t-exit-1` | `T-EXIT` | export returns the member's bookings and profile as a bundle the verifier accepts |

## Transition — what a replacement must carry across

Every booking, with its machine, member, start, end, and status unchanged
in meaning; every waitlist entry; every machine's status and log. A
replacement that cannot represent a status refuses the transition rather
than mapping it. Verified by: the member's export before and after the
swap verify and match, and the count of bookings per status is equal.
