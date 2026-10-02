# Proposal: Linden Tools

From Mira Holm, mira.holm@example.test, who would maintain it.

## The need

The 40 or so households on Linden Row sometimes need a tool they don't own, such as a drill, a ladder or a pressure washer. Today people ask in a WhatsApp group, where requests get lost, or they buy tools they use twice a year.

## What it offers

A tool-lending library for Linden Row. Neighbours list the tools they're happy to lend, and others ask to borrow them for a few days. You join with your name, your email, your house number (just the number) and the street code, and you sign in with a link sent to your email. Neighbours who've joined see each other's names, house numbers and tools, never email addresses. The lender says yes or no to each request, and marks the tool returned when it's back. In the app, only the lender and the borrower see a loan: who borrowed what, and when. I run the server, so I could read the loans, and everything else Linden Tools keeps. A loan is kept for a year after it ends. You can download everything it keeps about you as one file, and delete your account, which deletes all of it. No payments, no AI, no analytics.

## What people would have to change

- Ask for a tool in Linden Tools instead of in the WhatsApp group.
- Join once, with a name, an email address, a house number and the street code, and sign in with a link sent by email. A sign-in lasts 30 days.
- Lenders look at their requests when they sign in: Linden Tools emails nothing but sign-in links, so it doesn't tell them a request is waiting.
- Hand tools over and bring them back in person, as today, and the lender marks each one returned.

## Price, scope and budget

- Price: nothing. Linden Tools takes no payments.
- Scope of the first version: joining with the street code, signing in by a link sent by email, listing tools, asking to borrow, lending or declining, marking a tool returned, loans seen only by the lender and the borrower, downloading everything about you, and deleting your account. Not in it: payments, AI, analytics, messages between neighbours, and any email besides sign-in links.
- Budget: 6 euros a month, for a small server at Hetzner, in Germany, which I already rent and pay for. The database is a file on it, with no cost of its own. Email goes through Resend's free plan, 0 euros for now. No domain for now: neighbours use the server's address. COSTS.md has the details.
- The maintainer's pay: none. I don't want to be paid.

## What you're asking for now

Feedback first. Then people to try it: my neighbours on Linden Row.

## What has to happen first

I asked at the street meeting and in the WhatsApp group: 14 households said they'd list a tool, and 9 said they'd borrow something in the first month. Before it runs for real I wanted at least 10 households to say they'd list a tool, so that has happened.

Still to happen before it runs for real: publishing the code at https://git.example.test/mira/linden-tools; setting Linden Tools up on the server, reached over https; a Resend key; and giving out the street code at the street meeting.

One choice is still mine to make. Resend sends to people other than its account holder only from a domain verified with it, so with no domain the sign-in emails would reach only me. Before it runs for real, I have to choose between a domain and another email service.

## The check

On commit `cce7ea3ea4351a6efa0b916162d03a63051c98dc`:

```text
  tool sha256 4b6f75cbbf0e595c5e248d13b782ec355147cf6deb5e68ad52b12c17fa9b5d58
  RESULT: READY TO PROPOSE.
          That's all passing means. It isn't listed, approved or
          protected: a person reads the open items, and the people who
          would use it decide.
```

All ten checks pass. One thing they can't see: with no domain, Resend would send the sign-in emails only to me (see What has to happen first). Proposals to our.one open at launch.
