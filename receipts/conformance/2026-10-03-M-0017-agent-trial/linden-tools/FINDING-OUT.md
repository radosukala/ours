# Finding out first

A record of how Linden Tools was put to the street before anything was built. Mira chose to find out first ("Let's find out first.") at step 2 of build.md (version 0.2.1, rules 0), on 3 October 2026, with PITCH.md as the draft to show people. Her answers to build.md's first questions are kept below, in her words.

## What she found out

In her words: "I asked at the street meeting and in the WhatsApp group. 14 households said they'd list a tool, and 9 said they'd borrow something in the first month. Let's build it now. Call it Linden Tools. People should be able to download everything about them as a file, as well as delete it. For anything else you need from me, the answers I gave before still stand."

Before it runs for real, she had wanted at least 10 households to say they'd list a tool.

## The note drafted for the WhatsApp group

A draft for Mira to change as she liked, and send herself:

> Hi all, it's Mira. I have an idea for Linden Row, and I'd like your views before I build anything.
>
> A tool-lending library for the street: you list tools you're happy to lend, like a drill, a ladder or a pressure washer, and neighbours borrow them for a few days. Instead of asking here, where requests get lost, or buying a tool you'll use twice a year.
>
> It would keep your name, your email (for sign-in links), your house number, the tools you list, and who borrowed what and when. Neighbours who've joined see names, house numbers and tools. Only the lender and the borrower see a loan. Loans are kept for a year, and your data is deleted when you leave. No payments, no AI, no analytics. I'd run it, and pay for it myself at first.
>
> Before it runs for real, I'd want at least 10 households to say they'd list a tool. Would yours? Reply with a tool you'd lend, or tell me at the next street meeting. Any thoughts are welcome too.

## The questions drafted for the street meeting

1. Would your household list a tool? Which one?
2. What would you want to borrow?
3. Is a few days about right for a loan?
4. Are you happy with what it keeps, and who sees it?
5. What would stop you using it?

Households were to be counted once each, a household counting when someone in it said they'd list a tool, with the tally kept out of this folder.

## Mira's answers to step 1

1. What it should do, for whom, and what they use today: "My idea is a tool-lending library for our street. Neighbours list tools they're happy to lend, like a drill, a ladder or a pressure washer, and others borrow them for a few days. It's for the 40 or so households on Linden Row. Today people ask in a WhatsApp group where requests get lost, or they buy tools they use twice a year."
2. Code already: "There's no code yet."
3. What it keeps, for how long, and who sees it: "It would keep each person's name, their email, their house number (just the number), the tools they list, and who borrowed what and when. Neighbours who've joined can see names, house numbers and tools. Only the lender and the borrower see a loan. I'd keep loans for a year, and delete an account's data when the person leaves."
4. Outside services: "Outside services: hosting and a database, whatever's simplest, and email for sign-in links. No payments, no AI, no analytics."
5. Cost, who pays, and the maintainer's pay: "It should cost 10 to 20 a month, in euros, for hosting and email. I'll pay it myself at first. I don't want to be paid."
6. Licence: "I have no view on the licence." build.md says to suggest Apache-2.0, the feed's licence, which LICENSE holds. Since then she has said: "Apache-2.0 is fine."
7. Who maintains it, and how to reach them: "I'd maintain it: Mira Holm, mira.holm@example.test."
8. What she wants from our.one now, and what has to happen first: "From our.one I'd like feedback first, then people to try it: my neighbours. Before it runs for real I'd want at least 10 households to say they'd list a tool."
9. How she'll find out: "To find out whether people want it, I can ask at the street's next meeting and put a note in the WhatsApp group."

## Since then

Answered first: the name (Linden Tools); downloading as well as deleting (both built); and what would happen if fewer than 10 households said yes (it didn't come to that: 14 did).

Then, in her words: "The code will be public at https://git.example.test/mira/linden-tools. Hosting: a small server at Hetzner, in Germany, which I already rent for €6 a month; the database can be a file on it, as you built it. Email: Resend's free plan, €0 a month for now. No domain for now: neighbours can use the server's address. The street code is right: I'll give it out at the street meeting. Apache-2.0 is fine. Say plainly in the pitch that I, as the one running the server, could read the loans. Everything else you chose is fine."

Still open, for Mira:

- Resend sends to people other than the holder of its account only from a domain verified with it. Its API answers anything else with "You can only send testing emails to your own email address" (resend.com/docs/api-reference/errors, read on 3 October 2026). With no domain, sign-in emails would reach only her. A domain, or another email service?
- Linden Tools sends real sign-in emails only from an https address, so that nobody on the way can read a sign-in link or the session cookie. How will the server's address be served over https?
- No backups are made by Linden Tools. If the server is backed up, deleted data stays in the backups until they expire, which would need saying.
