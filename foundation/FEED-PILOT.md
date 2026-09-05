# OURS · feed pilot

**Version:** 0.1  
**Status:** ADOPTED · DIRECTION — adopted with `D-0003` on 4 September 2026  
**Prepared:** 2 September 2026  
**Depends on:** [THESIS.md](./THESIS.md),
[INSTITUTION-COMPILER.md](./INSTITUTION-COMPILER.md),
[FIRST-PRODUCT.md](./FIRST-PRODUCT.md)  
**Authorizing decision (proposed):** [`D-0003`](../decisions/D-0003.md)  
**Build mandate (proposed):** [`M-0003`](../mandates/M-0003.md)  
**Not:** a member charter, a claim that members exist, a deployed product, or
a promise that anyone will use it

## 1. The product in one sentence

> **OURS Feed is a familiar social feed — profiles, posts, follows, a home
> stream — in which every consequential behavior is a written rule with a
> reason, every option in the settings carries the decision that created it,
> and the defaults are set by a governed decision rather than by whoever
> profits from them.**

Working name: OURS Feed. The brand stays `OURS · oursorg.com`. Product-line
names and domains ("AppVoted" and similar) are options the founder may hold;
they are not decided here and must not be used on any surface until a
decision names them.

## 2. Why a product now — and why through the machine

Three rounds of direction work converged on one funnel: show people what is
wrong with the products they hold, let them endorse the rule that would
forbid it, show the same surface under OURS, and keep the proof one tap
behind every claim. This pilot is the third panel — the part people can
touch — built early, before critical mass, so that demand to transfer can be
collected rather than assumed.

The founder asked whether a pilot should skip the process — decision,
mandate, agent build, receipt — to move faster. The answer is that **the
slow process does not exist yet.** Under founder bootstrap there are no
member votes to wait for; the whole chain for this pilot is one decision and
one mandate, drafted in an afternoon and adopted in minutes. What the chain
costs is that afternoon. What it buys is the product's entire differentiator:
a settings page that shows *real* provenance on day one. A pilot built outside
the chain would have to render invented receipts, which is the exact failure
`THESIS.md` §5 names — *a constitution stored beside code* — inside the first
product meant to disprove it.

The self-hosting ratio therefore stays at 100%. What is genuinely slow —
legal formation, member ratification, asset transfer — is not needed for a
pilot and is not attempted by it.

## 3. Positioning: think big in the engine, start narrow in the constituency

Two constraints the founder set, both correct:

- **Not an obscure tool.** A federation-first or RSS-first identity reads as
  a niche client for people who already left. The surface must be one anyone
  recognises — the register of an interface used daily.
- **Not one better Instagram for the whole world.** A new social graph
  demanding an all-at-once migration is the graveyard of challengers.

The reconciliation:

1. **One governed feed engine**, general enough that a professional mode and
   an image-first mode are configuration, not rewrites. The engine — rules,
   catalog, provenance, ranking contract, attention options — is the same
   under both skins. This is where "aim at the biggest players at once" is
   true: the engine is built to render any feed archetype.
2. **One operating constituency first: professional.** It scores best on
   `FIRST-PRODUCT.md` §15 — adults only, an incumbent incentive conflict
   people already recognise in their professional feed, portable data,
   subscription-aligned revenue, low safety and regulatory surface — and it
   is the network the founder can actually invite. Operating two
   constituencies is two products; demonstrating two skins is one engine.
3. **The lens becomes an on-ramp, not an identity.** Importing what a person
   already follows — RSS, AT Protocol, ActivityPub — is phase 2, so that a
   new feed is not empty on day one. "Bring your graph" is a feature. It is
   never the brand.
4. **Single-player value before network value.** A person alone on OURS Feed
   must still get something: a public profile page governed by rules they can
   read, their own posts, the ability to follow anyone, a settings page that
   explains itself, and a voice on the defaults. That is the pilot's honest
   floor of usefulness, and the cold-start hypothesis is tested against it,
   not assumed away.

## 4. The governed surface: three layers

Settings are not governance, and the model says so structurally. Every
option in the product belongs to exactly one layer:

| Layer | Who sets it | Who may change it | Example |
|---|---|---|---|
| `FLOOR` | a decision (bootstrap: founder; later: members) | nobody, except by a new decision | no paid ranking; no sale of behavioral data; adults only |
| `GOVERNED` | a decision sets the **default**; the person may override | the person, for themselves | how the feed continues; notification defaults; quiet hours |
| `PERSONAL` | the person; a neutral initial value is still recorded | the person | display density; theme |

The principle each layer serves:

- **Where a behavior can be personal, it is.** Withholding a feasible option
  requires a published reason — cost, safety, or another person's rights.
  *"Not possible" may never be a translation of "not profitable."*
- **Defaults are collective goods.** Most people never open settings; for
  them the default *is* the product. A default is therefore set by decision
  and carries a receipt, never chosen by an implementer. During bootstrap the
  decision is the founder's, and the surface says so.
- **The floor protects people from majorities and from themselves only where
  the rule's reason names someone else's rights or a stated harm.** A floor
  rule without a written reason is not permitted to exist.

## 5. Settings with receipts

The settings page is the institution's face. Every row answers *why do you
exist?* without leaving the page:

```text
HOW THE FEED CONTINUES                              GOVERNED · default: paged
  ○ one page at a time, then "show more"
  ○ continuous, with a reminder every 10 minutes
  ○ continuous
  Your setting: paged (the default)

  WHY THIS OPTION EXISTS
  Rule        R-ATTENTION-OPT-IN — the feed never decides for you that it
              continues; you do.
  Default     paged · set by D-0003 (founder bootstrap) · 2 September 2026
              No member has voted this default yet. When membership forms,
              this default is among the first put to a vote.
  Mandate     M-0003 · built by [agent] · verified in receipt [id]
  Change it   for yourself: above. For everyone: endorse a different default
              below — recorded as demand, not yet binding.
```

Two structural rules make this a projection rather than a story:

1. The page renders from `rules/feed/options.yaml` — the option catalog — at
   build time. No option can appear in the interface that does not exist as a
   record, and a test fails if any catalog option is not rendered.
2. The kernel validates the catalog (§12). An option whose rule, decision, or
   mandate does not resolve refuses the build. The settings page therefore
   cannot ship a toggle without its receipt — the honesty is machine-held,
   not merely displayed.

The bootstrap label is not fine print. It is set in the same type as the
option, because a settings page that whispered "no member voted this" would
be doing exactly what incumbents' pages do.

## 6. The option catalog — `ours.option/v0.1`

The first new record type since Kernel 0.1. Illustrative shape:

```yaml
schema: ours.option/v0.1
option_id: feed.continuation
title: How the feed continues
layer: GOVERNED
type: enum
values: [paged, continuous-with-reminders, continuous]
default: paged
person_may_override: true
provenance:
  rule: R-ATTENTION-OPT-IN            # article in rules/feed/RULEBOOK-0.1.md
  decision: D-0003
  mandate: M-0003
  default_set_by: founder-bootstrap
  default_status: BOOTSTRAP_DEFAULT   # becomes MEMBER_VOTED when it is true
why: >
  A feed that continues on its own has decided, for you, how long you stay.
  This option returns that decision to you and makes the quiet choice the
  default.
recourse: >
  Change it for yourself in settings. To change the default for everyone,
  endorse another value — recorded as demand during bootstrap, binding when
  membership exists.
```

The v0 catalog, to be drafted under M-0003 Part A and adopted by the founder:

| Option | Layer | Default | Rule |
|---|---|---|---|
| feed continuation: paged / continuous with reminders / continuous | GOVERNED | paged | R-ATTENTION-OPT-IN |
| reminder interval: 5 / 10 / 20 minutes | GOVERNED | 10 | R-ATTENTION-OPT-IN |
| continue gesture: tap / hold, with hold duration 1–5 s | GOVERNED | tap | R-ATTENTION-OPT-IN |
| session budget: none / soft stop after N minutes | GOVERNED | none | R-ATTENTION-OPT-IN |
| time spent, visible: this session and today / this session / off | GOVERNED | session and today | R-TIME-SHOWN-NOT-KEPT |
| quiet hours for notifications | GOVERNED | 22:00–07:00 | R-QUIET-BY-DEFAULT |
| unread badges and counters | GOVERNED | off | R-QUIET-BY-DEFAULT |
| email digest | GOVERNED | off | R-QUIET-BY-DEFAULT |
| ranking mode: chronological / catch-up | GOVERNED | chronological | R-CHRONOLOGICAL-ALWAYS |
| public reaction counts | FLOOR | never | R-NO-STATUS-COUNTERS |
| paid influence on ranking | FLOOR | never | R-NO-PAID-RANKING |
| behavioral data sale or ad targeting | FLOOR | never | R-NO-BEHAVIORAL-SALE |
| behavioral recommendations ("suggested for you") | FLOOR · absent in v0, reason stated | — | R-NOTHING-FALSELY-IMPOSSIBLE |
| minimum age | FLOOR | 18 | R-ADULTS-ONLY |
| display density, theme | PERSONAL | comfortable, system | — |

*The row "time spent, visible" was added under [`D-0005`](../decisions/D-0005.md)
on 5 September 2026, from [`P-0002`](../proposals/P-0002.md). The table
above is otherwise as adopted under `D-0003`.*

Absences are catalogued too. An option that a person could reasonably expect
and does not find — video autoplay, algorithmic suggestions — appears in the
catalog as *absent*, with the reason and the recourse. That is the flip side
of R-NOTHING-FALSELY-IMPOSSIBLE: presence needs a receipt, and so does
absence.

## 7. The ranking contract v0

The home feed is governed by a versioned Algorithm Contract
(`INSTITUTION-COMPILER.md` §15), kept deliberately simple so that the
contract, not the cleverness, is the product:

- **Objective:** show what the people you chose to follow posted, in the
  order you selected.
- **Modes:** `chronological` (default) and `catch-up` (unread first, grouped
  by author, then chronological). Both are described in one paragraph a
  person can read.
- **Prohibited signals:** dwell time, predicted engagement, reaction counts,
  paid boosts, advertiser interest, inferred sensitive attributes. The
  ranking function's input type contains none of these fields — a structural
  guarantee named in the conformance report, not a promise.
- **Why this item:** every item in the feed answers *why am I seeing this* in
  one tap: who you follow, when it was posted, which mode ordered it, and the
  contract version. The answer is generated from the same function that
  ranked it.
- **A non-personalized mode always exists** and is the default. This is
  stronger than the Digital Services Act's opt-out for very large platforms;
  here it is the starting point.

## 8. Participation during bootstrap

No member exists, so no vote binds. What exists instead is honest and useful:

- **Endorse a default.** On any GOVERNED option, a pilot participant may
  endorse one value as the default for everyone. Counts are public. The label
  is fixed: *recorded as demand during founder bootstrap — not binding;
  becomes a vote when membership forms.* This is the register's
  "endorse the rule" act, now living inside the product it will govern.
- **Propose an option.** A short form: *what would you like to be able to
  set?* Proposals queue for the steward and are public with counts. This is
  the roadmap vote in its bootstrap form, and it allocates a real budget:
  every option is a maintenance promise.
- **No points, ordinals, badges, or ranks.** Nothing scarce, nothing
  transferable, nothing convertible. `THESIS.md` §13 and the retired Founding
  Million both say why.

The line between demand and authority is drawn in the interface, not in a
footnote. An endorsement count is never rendered where a vote result would
be.

## 9. People, identity, safety

- **Adults only in the pilot.** Self-attested at sign-up. No feature is
  designed for or marketed to minors. The most powerful issues in the public
  case involve children; the most regulated product surface does too, and a
  pilot with one steward does not carry it.
- **Invite-only cohort, sized to capacity.** The steward can support a small
  number of people honestly. The cap is operational, published as such, and
  attaches no right, status, or number to anyone. The Founding Million
  attached status to an ordinal; this attaches nothing.
- **Minimum identity.** Email, display name, handle. Sign-in by emailed
  link; passkeys later. No phone number, no contacts upload, no social
  login.
- **No analytics, no tracking, no third-party script, no advertising.**
  Operational logs only, with retention stated.
- **Moderation minimum.** Report → steward review → action (hide, remove,
  suspend) → a public receipt with the reason and private details redacted.
  Content rules live in the rulebook and are `INTERPRETED` by the steward.
  **Appeal: none during bootstrap, recorded as a known gap** — the same
  honesty every decision record already carries.
- **A named data controller before release.** The pilot is the first OURS
  surface holding personal data. The release mandate must name the
  controller, the privacy notice, retention, and the deletion path, and
  legal review of that notice precedes any public sign-up. Nothing in this
  document establishes who the controller is.

## 10. Exit from day one

- **Export:** one action returns the person's profile, posts, replies,
  follows, settings, and endorsements as JSON, with the public rulebook,
  catalog, and ranking contract included — the Exit Pack shape from
  `INSTITUTION-COMPILER.md` §19, at the size a pilot can honestly deliver.
- **Delete:** account deletion removes personal data. The irreversible
  residue is stated in the product, not discovered later: replies others
  wrote under a deleted post remain, attributed to their authors; a post
  someone already read cannot be unread.
- **Fork:** the engine is open; the rulebook, catalog, and contract are
  repository records. A fork drill of the pilot is scheduled before the
  cohort grows, not after.

## 11. Stack, and why each piece is replaceable

| Piece | Direction | Reason |
|---|---|---|
| application | Next.js (App Router), TypeScript strict | the founder's other products use it; agents build it fluently; replaceable by any server-rendered framework |
| data | Postgres via a thin typed layer (Drizzle) | boring, portable, exportable; no vendor feature relied on |
| auth | emailed sign-in links via a replaceable provider | minimal identity; provider is configuration named in the release mandate |
| tests | vitest for rules, catalog, ranking; browser tests for settings, override, export | denial paths first |
| hosting at release | Vercel, as the proof surface already uses | recorded in repository config, not in a dashboard |

The catalog, rulebook, and contract live in the repository as records and
are read at build time, exactly as the proof surface reads the authority
records. The database holds people's state; it never holds the rules.

Dependency policy: justify-new. Each new dependency is named in the build
receipt with the reason it was preferred to writing the code.

## 12. Kernel extension

Kernel 0.1 checks the authority chain. The pilot adds one record type and
the checks that make settings-with-receipts machine-held:

| Rule | Class | Check |
|---|---|---|
| `R-OPTION-PROVENANCE` | `ENFORCED` | every catalog option names a rule that exists in the Cell rulebook, a decision that exists and authorizes the option's mandate, and a default status from the allowed set; a `FLOOR` option may not be person-overridable; a build with an unresolvable option is refused |
| `R-VOTED-DEFAULTS` | `STRUCTURAL` today · `DECLARED` for the vote | every GOVERNED default names the decision that set it; the member vote that will replace `founder-bootstrap` does not exist and is not claimed |
| `R-ANSWERABLE-WHY` | `ENFORCED` by app test | every rendered option and every feed item resolves to a reason record |
| `R-NO-PAID-RANKING` / `R-NO-BEHAVIORAL-SALE` | `STRUCTURAL` | the ranking input type excludes the prohibited signals; no ad or payment surface exists |
| `R-NOTHING-FALSELY-IMPOSSIBLE` | `INTERPRETED` | whether an absence's stated reason is honest is a human judgement; the catalog requires the reason to be present |

The CLI validates the Cell catalog when a mandate names a Cell that has one:
`pnpm ours check M-0003` reports catalog findings beside the constitutional
ones, in the same list, with their classes.

## 13. Build parts and agent envelopes

Each part is an envelope in [`envelopes/M-0003/`](../envelopes/M-0003/). An
agent receives its envelope and `M-0003` — not this conversation, not the
thesis as authority, and not the other envelopes' work-in-progress. The
envelope narrows the mandate; it never widens it.

| Part | Builds | Depends on |
|---|---|---|
| **A · Records and kernel** | `rules/feed/RULEBOOK-0.1.md`, `options.yaml`, `RANKING-CONTRACT-0.1.md`; the `ours.option/v0.1` schema; `R-OPTION-PROVENANCE` in the kernel with denial tests; CLI catalog reporting | — |
| **B · Application foundation** | `apps/feed`: sign-in by emailed link, profile, posts and replies, follows, chronological stream, export, deletion, accessibility baseline, no third-party origin | A |
| **C · Settings with receipts** | settings rendered from the catalog; provenance drawer; layers; personal overrides; the attention behaviors (paged/continuous, reminders, hold-to-continue, session budget, quiet hours, badges) | A, B |
| **D · Ranking contract and "why this item"** | modes; the explanation panel; the contract page; the structural type guarantee and its test | A, B |
| **E · Participation and stewardship** | endorse-a-default with public counts and the bootstrap label; propose-an-option queue; report → steward action → public receipt | A, B |
| **F · Conformance and receipt** | conformance report mapping every rulebook article to a check and class; prohibited-claim scan over the app's copy; accessibility and narrow-mobile inspection; the build receipt; a drafted `M-0003-RELEASE` for founder review | all |

Sequence: A, then B, then C, D, and E in parallel, then F. Each part ends
with `pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed` and a
receipt section written truthfully — including what did not work.

## 14. Threats reduced, and the new power created

Reduced: **adoption failure** (a product exists to adopt); **metric
capture** (prohibited signals are excluded by type, not policy); **policy
drift** (catalog ↔ interface tested both ways); **safety theater** (every
article's class is reported, including `DECLARED`).

Created — and named because each is a real new power:

- **Personal data exists for the first time.** OURS becomes a data
  controller with obligations under privacy law. This is the pilot's largest
  new responsibility and the reason release is a separate mandate with
  legal review.
- **A single steward moderates and holds every key.** Founder capture is
  not a hypothetical here; it is the operating state, and every public
  surface of the pilot says so.
- **A demand register can be gamed.** Endorsement counts invite brigading
  and Sybil accounts. In an invite-only cohort the exposure is small; before
  any open enrolment, standing and identity assurance are decided by
  decision, not by an implementer.
- **A pilot can outrun its proof.** The mitigation is structural: no member
  claim anywhere, bootstrap labels in body type, provenance rendered from
  records, and the reversal proof exercised on this pilot's first release.

## 15. Deliberately not in v0

Media upload beyond a link preview · video · direct messages · groups ·
search beyond handle lookup · algorithmic recommendations of people or
posts · public reaction counts · advertising · payments · mobile
applications · import and federation (phase 2) · binding votes · membership
of any kind · minors · tokens, points, ranks, or badges · any claim that
members exist.

## 16. Proof gates before a release mandate is drafted

- `pnpm ours check M-0003 --changed` authorises the working tree.
- The catalog validates; at least three invalid catalogs refuse for the
  correct reason (missing rule, unauthorized decision, overridable floor).
- Every rendered option resolves to a catalog record and every catalog
  record renders; the test runs both directions.
- Every feed item's "why" is generated from the ranking function, not
  written beside it.
- The ranking input type contains no prohibited signal, and a test proves a
  build fails if one is added.
- Export produces a bundle a person can read; deletion removes personal data
  and states its residue.
- The interface makes no third-party request; the prohibited-claim scan over
  every copy file finds nothing.
- Legible in light and dark at 375 px and desktop; every control keyboard
  reachable with visible focus.
- The build receipt records agent, model, scope touched, dependencies added
  with reasons, and every failure.

## 17. What will be true, and when

| Event | State |
|---|---|
| founder adopts `D-0003` and `M-0003` | `ADOPTED` — nothing built |
| parts A–F complete with receipts | `TESTED` — nothing deployed, nobody invited |
| `M-0003-RELEASE` adopted and executed with a named controller | `DEPLOYED` — cohort may be invited |
| people use it and the first defaults are endorsed | `OBSERVED` |
| the first release is reversed under its own mandate | `REVERSED` — the reversal proof `FIRST-PRODUCT.md` §6 reserved for `M-0003` is exercised on this pilot's first release, where it means something |

Until each event occurs, the earlier state is the true one, and the
product's own surface reports it.
