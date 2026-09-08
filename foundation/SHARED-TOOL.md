# OURS · from a shared need to a shared tool

**Version:** 0.1  
**Status:** DRAFT · proposed for adoption under `D-0006` by
[`P-0004`](../proposals/P-0004.md)  
**Prepared:** 7 September 2026  
**Depends on:** [THESIS.md](./THESIS.md) §8 and §14,
[INSTITUTION-COMPILER.md](./INSTITUTION-COMPILER.md) §6,
[LIFECYCLE.md](./LIFECYCLE.md)  
**Supersedes, if adopted:** [FEED-PILOT.md](./FEED-PILOT.md) as the
first-product direction — retained as `SUPERSEDED`, with its §4–§6 carried
forward as the tool-level pattern in §11 below  
**Not:** an adopted direction, a chosen community, or a promise that any of
this holds absolutely

## 1. The sentence

> **OURS helps communities create and run software of their own.**
>
> Bring a shared need. Adapt what exists or build what's missing. Decide
> how it works, see what it costs, and keep control as it grows.

The movement line is unchanged: *The software we live in should be OURS.*
The movement says what we believe; the product gives someone something
useful to do. (Both sentences are working material in the register of
`THESIS.md` §15, drafted by an external reviewer and adopted here as
candidates, not copy.)

## 2. Why this is the thesis, not a pivot

`THESIS.md` §8 describes one root institution and many Product Cells, each
a bounded institution for one product or mission, governed by the people
who use, fund, operate, or are affected by it. `INSTITUTION-COMPILER.md`
§21 says to start with one authority path. The feed pilot was chosen as a
*demonstration vehicle* — a familiar surface on which the machine's
difference could be felt. Its cost was the habit burden of a feed and the
size of the market it implied.

A shared tool for a real group is the machine with a human face and no
demonstration vehicle in between. The group already exists; the need is
recurring; the consequences are concrete; the rules are worth deciding
together; the software is small. What changes is the entry point and the
scale of the first constituency. What does not change: the kernel, the
records, the ring, the enforcement-honesty doctrine, and the addresses
decided in `D-0004` — each community's tool lives at its own subdomain of
`our.one`, which reads better under this direction than under the last.

## 3. The unit is a shared need

People arrive before they have a formal community, a specification, or a
builder. The first thing OURS asks is:

> **What do you need to do together?**

and helps them say: who experiences the problem; how they handle it today;
what a better outcome would look like; who is willing to try it with them.
The output is an invitation others can join — **"We need this too"** —
which expresses interest, and creates no standing, ownership, or vote.

Before anything is commissioned, OURS helps the group **find what already
exists**: software to adopt, to configure, or a shared component to fund
an improvement to. **Coordination that produces little new code counts as
success.** OURS is not a gallery of generated applications, and the cost
column of `LIFECYCLE.md` §4 is how that is checked rather than declared.

### 3.1 Finding and joining

A directory of communities running software of their own, where every
card answers the same five things: what the tool is for, how many people,
how they decide, what it costs, and where control stands — *forming*,
*founding team, n of 6*, or *community-controlled, 6 of 6* — in the
community's own recorded words, including the steps not done. It also
shows which tools are shared across communities, because sharing a tool
shares its upkeep. It is sorted by recent change or by name, **never by
size or activity**: engagement is not authority here, and a directory that
ranked by popularity would teach the opposite of the thesis on its first
screen. Joining follows each community's own participation rule; a forming
community collects *we need this too*, which creates no standing.

## 4. The home for a shared tool

Five ordinary questions organise everything a person sees. Each is a
projection of stations in the ring; nobody using the tool needs the words
*mandate*, *digest*, or *projection*.

| What people see | What it answers | Ring stations underneath |
|---|---|---|
| **Use** | Where is our working tool? | release, audit |
| **Improve** | What needs to change, and what is happening about it? | proposal, deliberation, decision, mandate, build, verification |
| **People & rules** | Who belongs, who decides, and what protects us? | standing, the charter, the floor |
| **Money** | What does this cost, who pays, and who gets paid? | the cost column, the budget |
| **Continuity** | Who runs it, and what happens if they leave? | operators, handover, correction, exit |

Most people use the tool. Participation becomes relevant when a decision
affects them, and a change reads in their language:

> **Booking cancellation rule**
> Proposed by the workshop coordinator · affects people waiting for
> equipment · open for discussion · estimated cost and plan attached.

After release the same record says what changed, what it cost, and whether
it worked. The technical evidence — the trace, the receipts, the verifier —
sits one tap beneath.

### 4.1 On a desktop: three columns, three sentences

Where the screen allows it, the three things a person might confuse are
kept visibly apart, side by side: **the software we run** (the tool
itself), **how and why it works** (the rules with their reasons, the open
change, the last change step by step, and what happens if someone tries
to break the agreement — including the honest row: the founding team can
still override today, visibly, until the last step removes that power),
and **our community** (people, where control stands, money, continuity).
On a phone the same three become the five tabs of §4. The distinction is
the product's first lesson, so the layout teaches it before any text
does.

## 5. Ownership through actions, with honest status

"Community-owned" is concrete when a person can answer: *Can we replace the
people running this? Can someone sell it or change its purpose without our
agreement? Can we challenge a decision? What can we take with us if we
leave? Who controls our information?* These are `THESIS.md` §7's
falsifiable questions. The product shows the answers **including the
unresolved ones**, in body type:

> Currently operated by the founding team. Community control has not yet
> transferred. These steps remain: …

That is `R-NO-FICTIONAL-OWNERSHIP` and `R-WEAKEST-LAYER` in the product's
own words. A guided formation must never render an unfinished arrangement
as a finished one.

## 6. "Cannot be bypassed" is not a promise OURS makes

The ambition is right; the absolute is already forbidden by this project's
law (`R-WEAKEST-LAYER`; `AGENTS.md` §9). The promise is **meaningful
control, backed by specific protections and a credible path to recovery,
each with an honest account of what holds it** — software, separated
responsibilities, legal arrangements, or an expectation still only written
down. The protections:

- builders receive bounded access; writing code grants neither ownership
  nor deployment authority (`R-BUILD-DEPLOY`);
- operators have defined duties, a replacement procedure, and narrow,
  expiring, receipted emergency powers;
- changes to purpose, ownership, or sensitive-data use require the
  authority the charter names;
- backups, recovery, and operator handover are exercised, not described;
- personal information stays private while decisions and spending are
  inspectable (`R-PUBLIC-PRIVATE`);
- every remaining override power is visible.

Majorities have limits: collective ownership entitles nobody to another
person's private data and removes no one's right of appeal.

### 6.1 Ownership out of the box — the default holding

The founder's ambition is that a community should not have to design its
own protections: a tool started on OURS should be **born with them**, the
way a collective on a fiscal host is born with a bank account it does not
have to open. The honest form of "out of the box" is a **default holding**:

- every Cell's sovereignty-critical assets — its name, its address, its
  deploy authority, the data-controller role, and its money through a
  fiscal host — are held from day one by a purpose-bound holder under the
  root constitution, never by the builder, the operator, or the founding
  team;
- the separation of powers in §6 is the default founding arrangement, not
  an option the group must know to ask for;
- exit is unconditional: the holder must hand over the assets to the group
  or to its chosen successor when the group's own procedure says so, and
  the fork pack is always available;
- every protection still states its holding class, and the floor rises
  over time — automated gate, then separated responsibilities, then keys
  no single person holds, then legal control — with each rise receipted.

What this can honestly promise is not that power cannot be abused, but
that **it cannot be abused quietly**: any override is a visible, receipted
event, and the community sees which protections are still only written
down. And the holder itself is the founder-capture threat at scale — a
root that holds many communities' names and keys must be bound by the
same transfer gates and the same unconditional exit as everything under
it, or the default holding is an enclosure with good manners.

## 7. Protocol underneath, service in front

The protocol is the durable agreement among the people the software
serves, the people authorized to decide, the builders and operators, the
holders of assets and funds, and the software and evidence that connect
their actions. Today it exists as record formats — proposal, decision,
mandate, option, receipt, bundle — and the kernel's authority semantics.
Its test is **portability: could another capable operator continue serving
this community from these records, assets, and permissions?**

It is developed by assisting one real founding, then extracting what
repeats. No elaborate specification is published early. It is not a token
or a chain. Prior art the record should carry: PolicyKit (executable
governance procedures) and Open Collective (fiscal hosting — a way for a
group without a legal entity to hold and spend money transparently),
beside the projects already named in `THESIS.md` §12.

## 8. Shared software families, local authority

Several workshops can run the same booking software, share its maintenance
cost, and receive its improvements — while each keeps separate membership,
private data, budget, and local rules. A common improvement is *offered*
to each community and adopted by its own procedure; routine maintenance
runs under delegated authority. The hypothesis, stated as one: **the cost
of software can be shared without surrendering control of a community.**
Its boundary: a community that needs something unusual funds its own
divergence. Forking remains a right; reuse is the easier choice.

## 9. Builders and money

Builders are paid contributors and operators under clear agreements —
attribution, acceptance criteria, a dispute path. Communities owe
priorities, funding for agreed work, responses to decisions, and fairness.
Removing the incentive to sell a company does not remove the need to pay
for skilled work; a home for unlimited volunteer software is a failure
mode, not a virtue. No open marketplace until one community–builder
relationship has worked.

Money begins as founder-funded validation and becomes transparent service
funding once useful outcomes exist. Before OURS builds any payment surface,
a fiscal host is the *adapt what exists* answer to the Money question.
Every Cell's budget answers one sentence: *what does keeping this useful
and dependable cost us?*

## 10. What is built first

One real community, assisted by hand wherever a hand suffices, through the
ring:

| Step | What happens | Record |
|---|---|---|
| 1 | describe the need; invite the affected people | a proposal — the need, who, how today, better outcome, who will try |
| 2 | evaluate existing software and reusable components | evidence in the proposal; adopting something is a valid outcome |
| 3 | agree a short, readable founding arrangement — purpose, participation, decisions, money, privacy, continuity — through guided choices with consequences shown | a `CHARTER` decision; the Cell |
| 4 | name a builder, an operator, a budget, and one bounded first outcome | a mandate |
| 5 | deliver the tool through the chain | build, verification, release, receipts — cost recorded |
| 6 | make one real improvement together | the ring once, with the community deciding and dissent preserved |
| 7 | rehearse replacing the operator | continuity — `FOUNDING-AUTHORITY.md` §8's sunset conditions in miniature |

**Choosing the first community** (this updates `FIRST-PRODUCT.md` §15):
the founder is a member, not the boss; a recurring coordination need with
concrete consequences; a small tool, or an existing one to adapt; ten to
forty adults; a low safety and regulatory surface; willing to decide one
real tradeoff; someone besides the founder willing to operate.

**The test of the product** is the group saying, unprompted:

> *We use this. We understand what it costs. We know how to change it. Its
> future does not depend entirely on the person who built it.*

## 11. The tool-level pattern, carried over

What the feed design got right is Cell-agnostic and is kept: every
consequential option of a shared tool is catalogued with its provenance
(`ours.option/v0.1`, `R-OPTION-PROVENANCE`); three layers — floor,
governed, personal; defaults set by the community's decision and labelled
until they are; settings with receipts; propose-an-improvement with
disposition visible; steward actions receipted; export and deletion from
day one; attention options wherever a tool competes for attention. The
feed was one skin over this engine. A booking tool is another.

## 12. What is deliberately not built now

A generalised "system for communities" before one community has said the
sentence in §10 · a builder marketplace · a payment surface · a published
protocol specification · membership issuance · a second community before
the first has finished step 7 · any absolute promise.

## 13. What is true today

This direction is proposed, not adopted. No community is chosen. The feed
Cell — `D-0003`, `M-0003`, `D-0005` — is proposed for supersession with
nothing built under it, at no cost but the record. `D-0004`'s addresses
hold. Two AI reviewers agreeing on a direction is not evidence of anything;
the first community is.

## 14. Falsification

If the first community praises ownership but does not use the tool, the
product hypothesis has failed. If it uses the tool but cannot exercise the
five actions in §5, the institutional hypothesis is unproven. If assisting
one founding by hand cannot be made repeatable within its recorded budget,
the "system" hypothesis is unproven — and OURS is a good way to help one
group at a time, which is also worth knowing.
