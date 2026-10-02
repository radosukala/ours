# Proposal: FICTIONAL Book Club

A proposal to our.one. The common agreement asks every proposal for the
parts below: https://our.one/agreement. Send it by email when proposals
open; the address is on https://our.one/maintainers.

FICTIONAL: this is a trial. The club, its people and its addresses are
made up. Drafted by a coding agent from the maintainer's answers; the
parts marked *Not confirmed* are the agent's cautious defaults, for the
maintainer to confirm or change before it is sent. Nothing has been sent.

Where it stands: this is FICTIONAL Maintainer's project, independent in
the agreement's terms. The maintainer holds the code, the database and
the keys. our.one hasn't approved, listed or protected it, and none of the
safeguards the check lists as not built exists for it.

## The need

A book club of about ten friends needs one place that says who is in the
club, which book is next, and who is coming, and a reminder of the next
meeting each month.

*Not confirmed:* what the club uses or pays for today wasn't asked. The
maintainer will add it.

## What it offers

Each member gets a private link, in the monthly reminder email. It opens
the club page: the next meeting, its book, buttons to say whether they'll
come, who is coming, and the first names of everyone in the club. On the
same page they can download their data as a file, or delete it at once.
The organizer adds members and meetings from a command line. Nothing on
the page is visible without a member's link.

## What people would have to change

- Members: keep their private link to themselves, since it opens the page
  without a password; read one email a month; tap to say they'll come.
- The organizer: add members and meetings with `npm run admin`, run the
  reminder once a month (for example from cron), and keep a Resend account
  and a sending address.
- *Not confirmed:* whether the club would give up something it uses today
  wasn't asked.

## Price, scope and budget

- Price for members: nothing.
- In scope: one club of about ten members; their first names and email
  addresses; the next meeting and book; who said they'll come; a monthly
  reminder through Resend; download and deletion for each member.
- Out of scope: accounts and passwords, more than one club, chat or
  comments, voting on books, payments, a web page for the organizer, and
  any counting of visits.
- Monthly budget: hosting isn't chosen yet, so its cost isn't known. Email
  through Resend is about 10 messages a month, at a price not yet
  confirmed. The database is a file stored with the app. No domain yet.
  See `COSTS.md`.
- The maintainer's pay: none. FICTIONAL Maintainer pays every cost for now.

## What you're asking for now

*Not confirmed:* feedback only. Nobody is asked to try it or to pay.

## Before work starts

*Not confirmed: the maintainer wasn't asked; these follow from the build.*

1. Hosting is chosen, and named in `our.one.json` under `data.sharedWith`
   and in `COSTS.md`, before the app runs there: the host would hold the
   database file with every member's name and email address.
2. Resend's price and terms are checked, and a sending address is set up.
3. Each member agrees to be added, since the organizer enters their first
   name and email address.
4. A person answers the four questions the check leaves open: everything
   kept is declared and used only for the club; export and deletion work;
   nothing is sold and no money comes from anyone who expects a return;
   and this proposal says what the agreement asks.

If these don't happen, the app isn't run for the club, and it keeps
nothing about anyone.

## The check

`node scripts/our-one.mjs check`, run on commit
`deb06c910e5cba7206037801580e4a15921cd699`, with nothing uncommitted. All
ten checks passed: manifest, licence, agents, data, boundary, leave,
tracking, secrets, costs and claims. The last lines:

```text
  our.one check 0.1.0 · rules 0 · project book-club
  tool sha256 ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7
  ...
  ----------------------------------------------------------------------
  There is no score on purpose. What passed is what a machine can see
  in the files; what it can't see is listed above, at the same weight.

  RESULT: READY TO PROPOSE.
          That's all passing means. It isn't listed, approved or
          protected: a person reads the open items, and the people who
          would use it decide.
```

This file was filled in after that commit, so the commit that adds it
comes after the one the check ran on.
