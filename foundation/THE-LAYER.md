# OURS · the layer

**Version:** 0.1  
**Status:** ADOPTED · DIRECTION — adopted with `D-0006` on 8 September 2026, from
[`P-0005`](../proposals/P-0005.md)  
**Prepared:** 8 September 2026  
**Depends on:** [THESIS.md](./THESIS.md) §7, §8, §11;
[INSTITUTION-COMPILER.md](./INSTITUTION-COMPILER.md) §3, §12, §18, §19;
[LIFECYCLE.md](./LIFECYCLE.md)  
**Supersedes:** [SHARED-TOOL.md](./SHARED-TOOL.md) as the
first-product direction — retained as `SUPERSEDED`, with its §3–§5 and
§9–§11 carried forward in §12 below; [FIRST-PRODUCT.md](./FIRST-PRODUCT.md)
§7.6; [FEED-PILOT.md](./FEED-PILOT.md), already proposed for supersession  
**Not:** a legal structure, a built thing, or a claim that anything here
holds beyond the class written beside it

## 1. The sentence

> **OURS is the enduring institution people belong to. Applications are
> replaceable services operating under its members' authority. The compiler
> connects their decisions to verified changes; the runtime holds the
> resulting permissions.**

Drafted by a colleague reviewer on 8 September 2026 (evidence in `P-0005`)
and adopted here as a candidate in the `THESIS.md` §15 register, not as
copy. Shorter, same register: *Apps come and go. You stay.*

The thesis sentence in `THESIS.md` §1 stands. This document says what the
institution **holds**, what an app **is**, and what replacing one must
**preserve** — and only then what the software is. That order is the
correction this document makes to everything before it: the earlier
directions organised the experience around producing and administering
applications. The ambition is something people retain while applications
change.

## 2. Why: in the prevailing model, an app's users are its operator's asset

In the prevailing model a product's user base is treated as the asset of
whoever operates it — it is what a company is valued on — and the product's
rules are set to serve that valuation. The economic premise under this
document is stated as a hypothesis, not an absolute: **as implementation
becomes cheaper, the constituency — the people, their data, and their
relationships — becomes the scarcer asset relative to the code, and
cheap-to-build apps do not by themselves change who holds it.** Coding
agents make apps abundant and leave constituencies where they were. The
hypothesis is testable — the cost column of `LIFECYCLE.md` §4 is one
instrument — and nothing below depends on its absolute form.

OURS inverts it. The constituency owns the ground the app stands on —
identity, standing, data, relationships, the rules it ratified, the records,
its money, its names — and an app is a tenant on that ground. This is
`THESIS.md` §2 (*the visible application is a compiled consequence of the
institution behind it*) and §11 (defensibility in a forkable system) taken
literally and made the definition of the product rather than a property of
it. The June 2026 experiment at `our.one` said the same in its first line —
*the shared layer is the actual product; the apps are outputs* — without an
authority chain. The August repository built the chain without the layer.
Each found half.

## 3. What an app is

An app is a **replaceable implementation** under a **contract** that states
what it may do, which information it may access, and whose authority
permits it. It never *has* users. It serves members of the layer, with the
access their community granted, for as long as they keep granting it.

Three parties, from `INSTITUTION-COMPILER.md` §3:

| Party | Does | Holds |
|---|---|---|
| **the constituency** | decides, funds what it chooses, uses | the ground: everything in §4 |
| **builders** | build to the specification, offer, are paid by agreement | nothing — no users, no data, no deploy authority |
| **operators** | run the layer and the apps under mandates | duties, replacement procedures, narrow emergency powers |

**Technical admission is not a constituency.** Passing the gate (§6) makes
a builder *eligible to offer* an app. The people whose data and rules it
would touch still decide its use, its access, and its compensation, by
their own procedure. The relationship, in the reviewer's words and adopted
as working material: *Build to our requirements. Offer us something useful.
Receive the permissions and compensation we agree to.*

## 4. What persists — the layer

What the institution holds in trust for the people in it. Each row states
who controls it today and the class the control is held at, because a row
without a class is a label.

| Held | For whom | Visibility | Controlled today | Intended | Class today |
|---|---|---|---|---|---|
| **identity** | a person, once, across every community and app | private | nobody — nothing exists | the person, through the layer | — |
| **standing** | who belongs to which community, in which role | private register; public counts | nobody | each community's own procedure | — |
| **the store** | each person's data, scoped per community and per app contract; each community's shared records | private; the person's to export | nobody | the person and the community, through contracts | — |
| **relationships** | memberships and edges | portable with consent | nobody | the people on both ends | — |
| **the registry** | apps that passed the gate *and* were adopted by a community | public | nobody | the gate, then each community | — |
| **law** | the root constitution; each community's charter; each app's specification | public | founder | the constituency, by amendment | `DECLARED` |
| **records** | proposals, decisions, mandates, receipts, observations — as deliberate public projections | public projection; private detail withheld | founder | each community; the institution | `STRUCTURAL` |
| **money** | each community's account, at a fiscal host | members; aggregates public | nobody | the community, through the host | — |
| **names** | each community's address | public | founder's registrar account | a holder (§10) | `DECLARED` |

A dash means the thing does not exist yet; it is listed so its absence is
visible rather than implied.

The founder's requirement, recorded as the reason this table exists: a
person's profile and data must not live *inside* an app that can be taken
away with it. They live here, and the app is granted access.

## 5. The service specification

Two things travel under the word *app*, and replacement depends on keeping
them apart.

**The service specification** is durable. It belongs to the community and
persists with the institution. It states: the **meaning of records** (what
a booking *is*, what a member *is*, what a pending request *is*); the
**behaviours**, as articles with reasons and enforcement classes; the
**options**, with provenance (`ours.option/v0.1`, unchanged); the
**permissions**, as a data contract (§6); the **tests** that hold each
article; and the **transition requirements** — what a replacement must
carry across, and how the crossing is verified.

**The implementation** is replaceable. It is open source. It is whatever
currently satisfies the specification, and any capable agent, through any
spec-driven pipeline, may produce another.

OURS does not build a factory. Spec-driven toolchains — GitHub's spec-kit is
the reference example, read on 8 September 2026 (`P-0005` evidence) — carry
a specification to code through constitution → specify → plan → tasks →
implement, across thirty-plus coding agents. Their constitution is the
builder's engineering law and their spec is the builder's; OURS supplies,
above them, *whose* decision the spec derives from, and, below them, *whose*
ground the code runs on. An OURS service specification projects into such a
pipeline: the community's articles into the pipeline's governance
placeholders and acceptance criteria; the data contract into the spec. The
pipeline and the agent are the operator's choice and are replaceable
(`INSTITUTION-COMPILER.md` §21).

**Regeneration** therefore means a verified transition that preserves agreed
behaviour and state — not byte-identical code, and not routine rewriting of
software that works. The fork drill (`FIRST-PRODUCT.md` §12) is a
regeneration on a clean machine from the community's bundle, rehearsed
before it is needed.

## 6. The gate

The compiler's job under this direction. Three checks, one list, no
combined total, classes stated:

1. **Authority.** The chain — who decided, under what procedure, within
   what window, with what scope. Exists. `ENFORCED`.
2. **Conformance.** Every article in the service specification maps to a
   named test; the tests are run by someone who did not build; the option
   catalog renders both ways; the prohibited-claim scan; the artifact
   digest. Designed under `M-0003` Part F; not built. `CHECKED` when built,
   `ENFORCED` at the release gate.
3. **The data contract.** The access an app declares — which classes of
   data, for whom, under which article — against the access its code
   actually reaches for, statically; and at runtime a capability scoped to
   the declaration, so that the app cannot reach what it did not declare.
   Not built.

What stays `INTERPRETED`: whether an article's reason is honest; whether a
declared residue is complete; whether an app's *use* of what it may read is
proper (§7). The gate reports these as open, at equal weight, every run.

Two further checks belong to the authority list and must exist before any
implementation runs under this direction:

4. **Adoption.** A mandate is not authorised for execution while it, its
   decision, or the founding authority is `DRAFT`. The report distinguishes
   *valid as a draft* from *authorised for execution*, and a mandate that
   names prerequisite decisions is refused while any of them is not
   `ADOPTED`. The gap was acknowledged in `D-0004`; the check lands under
   `M-0004`; it is a prerequisite of every mandate after it. Until it
   lands, `AUTHORISED` from the kernel means the chain is well-formed and
   nothing more, and every receipt says which it was.
5. **The pin.** Once a community's specification, charter, and contracts
   are approved, their digests are recorded in a pin that the
   implementation mandate names. The gate refuses an implementation whose
   specification on disk differs from the pin, and refuses a contract
   widened or a transition requirement weakened without an amending
   decision. The implementer cannot change the rules it is judged by, and
   the mandate that implements is denied write access to them.

## 7. What "cannot be taken" means, precisely

Scoped access limits exposure. It does not establish that an app cannot
misuse information it is authorised to read; an origin allowlist does not
establish that an allowed destination received only what it should; and a
log cannot establish that something read was not kept. So the guarantees
are narrower than the ambition, and each states what holds it, what it does
not hold, and where enforcement ends. None exists today.

### 7.1 The trusted runtime boundary

Inside the boundary — the layer's runtime — storage and network belong to
the runtime, not to the application. An application has no database, no
file system, and no sockets of its own. It reads and writes through the
scoped API, and it discloses through a **disclosure API** whose every call
names an origin, the fields sent, and the article that permits them; the
runtime checks the payload, field by field, against the contract's
**permitted disclosures** — origin, fields, article, purpose — before
anything leaves. Everything inside the boundary is the runtime's to
enforce. Outside it — an allowed origin, a person's screen, an operator
with runtime access — enforcement ends, and logging, review, and appeal
begin.

| Protection | Holds | Does not hold | Class when built |
|---|---|---|---|
| **reach** | an application cannot read or write outside its contract; the store is the runtime's, and the application has a key to its own room | — | `ENFORCED` — runtime capability |
| **leave** | an application cannot send anything to an origin its contract does not name, and cannot send a field its permitted disclosures do not list to an origin they do; both are refused at the boundary, not by the application's good conduct | what an allowed origin does with a permitted disclosure | `ENFORCED` — origin and field checks at the boundary · `INTERPRETED` — whether a permitted disclosure was appropriate |
| **keep** | inside the boundary an application retains nothing beyond its declared retention, because storage is the runtime's; every read and every disclosure is logged | retention by an allowed origin after a permitted disclosure; retention by an operator with runtime access | `ENFORCED` inside the boundary · `CHECKED` — the log · not provable outside |
| **use within grant** | misuse of data an application may read is visible in the log and can be challenged | it is not prevented | `INTERPRETED` · appeal `DECLARED` |
| **minimal disclosure** | an application receives the fields its contract names, not the person | — | `STRUCTURAL` — the contract lists fields |
| **public projection** | a proposal, decision, or observation is published as a deliberate projection; private detail stays in the member-visible or sealed tier (`INSTITUTION-COMPILER.md` §18) | — | `STRUCTURAL` · `INTERPRETED` |

The honest sentence is therefore not *the data cannot be taken*. It is:
**inside the runtime, an application can reach only what its contract
names, can send only the fields its permitted disclosures list and only to
the origins they name, and keeps nothing the runtime does not hold for it;
every reach and every disclosure is logged; and what an allowed origin, an
operator with runtime access, or a person does with what they were
permitted to receive is not prevented — only visible, and challengeable.**
The tests hold both halves: a request to a denied origin is refused; an
undeclared field to an allowed origin is refused; a permitted disclosure is
logged; an operator's runtime access is receipted. The layer's operator
remains the weakest layer, `R-WEAKEST-LAYER` unchanged, until the opening
conditions of §10.1 and a legal form exist. Both halves of the sentence are
always said together.

## 8. The replacement test

The architectural test of this direction, in the reviewer's words:

> **Can the community replace the implementation and its supplier while
> retaining its rights, permitted records, relationships, decisions, and
> ability to operate?**

It reaches past a convincing interface into the actual allocation of power.
Replacement is a **verified transition**: the new implementation passes the
gate against the same service specification; the transition requirements
carry the records across with their meaning; the community decides the
switch by its procedure; the old implementation and its supplier are left
holding nothing, because they never held anything. The same test applies to
**operators**: a second person runs the layer from the records, and the
first person's departure changes nothing the community has.

## 9. How a community decides

The ring of `LIFECYCLE.md` §2 is the community's own mechanism, at the
community's scale. Its records gain two types the kernel does not yet have:
**standing** (`ours.standing/v0.1` — the private register, public count) and
**vote** (`ours.vote/v0.1` — ballots private, tally public, dissent kept),
with a kernel check that a decision's recorded procedure was actually met
before the decision authorises anything.

**Procedure scales with class.** `CONSTITUTIONAL` and `CHARTER` decisions
need a proposal with preserved deliberation. `POLICY` and `PRODUCT_MANDATE`
decisions carry their deliberation inside the decision. `OPERATIONAL` work
runs under a standing mandate and produces receipts, nothing more. This
amends the rule adopted with `D-0004` (*no decision without a proposal*) to
the two classes where the alternatives that lost matter.

Why the ring feels heavy today and will not later: under founder bootstrap
one person is the legislature, the court, and the factory, and writes all
three parts. In a community they are different people, each writing a
little, and the kernel does the checking that a person now does by
ceremony. The volume of this repository's records is a fact about
bootstrap, not about the ring.

## 10. Who holds what

The requirement, against which every holding arrangement is judged:

> **A person or community can replace software and operators while
> preserving their legitimate rights and continuity.**

Centralisation may simplify a first implementation; it does not establish
stronger ownership. Personal information, community assets, root
governance, and operating funds need not sit under identical control, and
the record formats must not assume that they do.

**v0** — one community, one database — does not settle the holding
arrangement, and this document does not either. A single holder — a named
second human, or a purpose-bound entity, under a written agreement,
controlling the registrar account, the deploy key, and the fiscal-host
account — is **one option** for `D-0007` to evaluate, beside split holders
by asset class and a fiscal host with a written assignment of the rest,
against four questions: can the community replace the operator and recover
from the holder's failure or refusal; what rights do members actually hold
and how do they exercise them; what residual powers remain with the
founder, the operator, and the holder; and does the arrangement survive the
holder's departure. Adding a second human is not, on its own, user
ownership, and it does not remove operator risk; at best it raises one gate
from `AUTOMATED GATE` to `ORGANIZATIONAL SEPARATION`, and it is described
as exactly that. Whatever `D-0007` adopts is bound by the same transfer
gates and the same unconditional exit as everything under it
(`SHARED-TOOL.md` §6.1, unchanged).

### 10.1 The opening conditions — rights before custody

A holder establishes custody. Ownership is established by what a person
can actually do. Before the first real person's data exists on the layer,
`D-0007` states — and the layer's records carry, so that a reader can check
which rows are real — the rights people receive, how each is exercised, and
its class at opening:

| Right | Who holds it | How it is exercised | Class at opening |
|---|---|---|---|
| to leave with your data | every person | one action; a bundle the verifier accepts | `ENFORCED` when built |
| to see who decided anything that affects you | every person | the record, one tap from the surface | `STRUCTURAL` |
| to propose, and to be heard | every member with standing | the ring, by the community's charter | `STRUCTURAL` |
| to decide, by the charter's procedure | members with standing | a vote whose tally the gate checks | `ENFORCED` for the tally, when built |
| to remove the operator | members, by the charter's threshold | a decision; a handover the records make possible; rehearsed before opening | `DECLARED` until rehearsed · then `ORGANIZATIONAL SEPARATION` |
| to replace the application and its supplier | the community | the replacement test of §8 | `DECLARED` until rehearsed |
| to take everything if the holder refuses | the community | the fork drill from the community's slice; the holding agreement's hand-over duty; what is lost meanwhile — the name, until legal control — stated | `DECLARED` · legal control absent |
| to challenge a decision | anyone affected | before it, the discussion; after it, reversal on request; appeal outside the community: **none during bootstrap, recorded as a gap** | `INTERPRETED` · appeal `DECLARED` |

And the **residual powers**, named rather than implied: what the founder
can still do, what the operator can still do, what the holder can still do
— each a visible, receipted event when used. Without this table the
fixture could pass the replacement test while the real service remained
founder-controlled hosting with an extra custodian; the table exists so
that a reader can see which rows are held and which are only written.

**The layer's own exit.** A person's pod and a community's slice — standing,
records, data, specification — export as bundles the offline verifier
accepts. The layer's software is open. Any capable operator can run the
layer from its formats: the portability test applied to OURS itself. This is
what keeps *a default standard for user-owned software* honest: a standard
is something others can implement, and the community's protection against
OURS is that it can leave OURS with everything.

## 11. Builders and money

Builders are paid contributors under clear agreements — attribution,
acceptance criteria, a dispute path (`SHARED-TOOL.md` §9, unchanged). What
this document adds: a builder's admission to the registry is eligibility to
*offer*; the community's decision grants use, access, and payment. No open
marketplace until one community–builder relationship has worked, and never
one whose objective turns members into an audience sold to suppliers.

Money: founder-funded validation first; a fiscal host before any payment
surface; every community's ledger answers *what does keeping this useful
and dependable cost us?* — with an *OURS shared services* line, visible, for
the layer's share of hosting, identity, backups, and the gate. The
hypothesis of `SHARED-TOOL.md` §8 at layer scale: the cost of software can
be shared without surrendering control of a community.

## 12. Carried forward

From `SHARED-TOOL.md`, unchanged in substance and now living on the layer:
the **shared need** as the unit and *we need this too* as an invitation that
creates no standing (§3); **finding and joining**, never ranked by size or
activity (§3.1); the **five questions** — Use, Improve, People & rules,
Money, Continuity — as the community's home, with the technical evidence one
tap beneath (§4); **ownership through actions** with unresolved answers
shown in body type (§5); the **protections** with holding classes (§6);
**shared software families** — now a property of the layer rather than a
mechanism to build (§8); the first founding's **selection criteria** and the
sentence that tests the product (§10).

From `FEED-PILOT.md` §4–§6: the three layers of options — floor, governed,
personal — the option catalog with provenance, and settings with receipts.

From the founder's rounds of 8 September 2026: the machine's verb is
**decide** — a decision runs, and what nobody decided is refused; the demo
is the **birth** of a tool replayed from its records, not screens of a
finished one; and the two moments SaaS cannot show — **the swap** (replace
the app, keep everything) and **the refusal** (an app reaching outside its
contract is refused; the same code copied elsewhere runs, and has nobody).

## 13. v0 — one community, one app, one holder, one database

Built in two bounded steps — the gate for community records under
`M-0006`; the runtime, the fixture tenant on it, and the swap under a later
mandate, authorised only after `M-0006`'s receipt is accepted and `D-0007`
is adopted, so that the implementation runs against a pinned specification
it cannot change, under an authority the gate has checked is adopted, on
opening conditions that name real rights — and seeded by the founding under
`M-0005`. What is real and what is only written down, stated before any of
them starts:

| Organ | v0 | Real or declared |
|---|---|---|
| identity | sign-in by emailed link; one person, one identity | real |
| standing | the community's register, maintained by its coordinator; public count | real · Sybil resistance `DECLARED` (invited adults; adequate for twenty to forty people, and said so) |
| the store | one database; each row scoped to a person and a community; the app reaches it only through a scoped API | real |
| the registry | the first app, with its specification and its adoption decision | real, with one entry |
| the gate | authority (exists); adoption and prerequisite checks (`M-0004`); conformance, static contract, procedure, and pin checks (`M-0006`); the runtime capability and the disclosure API (the later mandate) | real, in that order |
| leave / keep | egress policy; access log | real / real · review `INTERPRETED` |
| records | the community's proposals, decisions, mandates, receipts as deliberate projections | real |
| money | the community's fiscal-host account and ledger | real if the host is chosen · else `DECLARED` and shown |
| names | `<community>.our.one` under the arrangement `D-0007` adopts | real once `D-0007` is adopted · else `DECLARED` and shown |
| the holding arrangement | one of the options `D-0007` evaluates, per §10 | at best `ORGANIZATIONAL SEPARATION` · legal control `DECLARED` |
| the opening conditions | the rights of §10.1, each row with its class | `D-0007` — the rehearsed rows real; the rest `DECLARED` and shown |
| the pin | the approved specification's digests, named by the implementation mandate | real |
| the swap | a second implementation, or a regenerated one, replaces the first with records intact — rehearsed | real, rehearsed once |
| the layer's exit | pod and slice bundles the verifier accepts | real |

**Not in v0:** a protocol specification; multi-tenant infrastructure; a
second community; third-party apps; a marketplace; a payment surface; a
legal entity; any absolute.

## 14. Threats reduced, and the new power created

Reduced: **adoption failure** — a community's tool with its people already
in it; **founder capture at the Cell level** — the founding team never holds
the name, the key, or the data; **artifact substitution** — the tool serves
its own digest; **policy drift** — the specification, not the code, is what
the community owns; **agent scope expansion** — the app's reach is a
capability, not a promise.

Created, and named because each is a real new power:

- **OURS becomes the data controller for everything on the layer.** The
  largest responsibility a project can take: breach liability,
  jurisdiction, minors. Mitigation: no personal data exists before `D-0007`
  names the holder and a legal review of the notice; per-community
  isolation; minimal data; consent at invitation; deletion on request.
- **The platform position.** The layer sits where app stores sit — between
  people and software. Held by the people it serves, taking what it costs,
  it is the political statement under this project; held any other way it
  is an enclosure with good manners. Exit (§10) and plurality are
  constitutive, not features.
- **The holder.** A person or entity who can hand everything over — or
  refuse to. Bound by the agreement and the transfer gates; and the weakest
  layer until the legal form exists.

## 15. Falsification

This direction is disproven, or in need of fundamental revision, if: the
first community praises ownership and does not use its tool (the product
hypothesis fails); it uses the tool but cannot pass the replacement test of
§8 (the institutional hypothesis is unproven); the data contract cannot be
made a runtime capability within the recorded budget (the protective layer
is declared, not held); or a person's profile or data ends up living inside
an app that could be taken away with it (the architecture is wrong by the
founder's own criterion).

## 16. What is true today

This direction is adopted, and nothing in it is built. No community is chosen. No holding
arrangement is adopted, and no right in §10.1 is held. Nothing in §4
exists. The kernel checks one authority chain and refuses invalid ones;
that is the whole of the gate, and it cannot yet tell a draft record from
an adopted one — `M-0004`'s first job, and a prerequisite of everything
here. Two AI reviewers and a colleague agreeing on a direction is not
evidence; the first community's replacement test is.
