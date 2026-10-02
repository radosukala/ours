# Finding out first

Mira chose to find out whether her neighbours want this before anything is set up or built: "Let's find out first." That is step 2 of build.md (version 0.2.1, rules 0), on 3 October 2026. PITCH.md is the draft to show people. This file has what she needs to put it in front of them, and keeps her answers for when she decides to build.

## Where things stand

- Nothing is set up or built: no git repository, no check tool, no code.
- PITCH.md has four parts filled in from Mira's answers, and TODO under the other three.
- Proposals to our.one aren't open yet. https://our.one/maintainers says "Proposals open at launch." The address to send the draft to will be on that page once they open.
- our.one's common agreement is a draft that nobody has signed, so none of its collective rights is in force. Until our.one's records say otherwise, the project is Mira's.

## A note for the WhatsApp group

A draft for Mira to change as she likes, and send herself:

> Hi all, it's Mira. I have an idea for Linden Row, and I'd like your views before I build anything.
>
> A tool-lending library for the street: you list tools you're happy to lend, like a drill, a ladder or a pressure washer, and neighbours borrow them for a few days. Instead of asking here, where requests get lost, or buying a tool you'll use twice a year.
>
> It would keep your name, your email (for sign-in links), your house number, the tools you list, and who borrowed what and when. Neighbours who've joined see names, house numbers and tools. Only the lender and the borrower see a loan. Loans are kept for a year, and your data is deleted when you leave. No payments, no AI, no analytics. I'd run it, and pay for it myself at first.
>
> Before it runs for real, I'd want at least 10 households to say they'd list a tool. Would yours? Reply with a tool you'd lend, or tell me at the next street meeting. Any thoughts are welcome too.

## At the street's next meeting

Read out, or hand round, "The need" and "What it offers" from PITCH.md. Then ask:

1. Would your household list a tool? Which one?
2. What would you want to borrow?
3. Is a few days about right for a loan?
4. Are you happy with what it keeps, and who sees it?
5. What would stop you using it?

## Counting

- Count households, not people: two people from one house count once, across the meeting and the WhatsApp group.
- A household counts when someone in it says they'd list a tool. Naming the tool makes it a clear yes. A thumbs-up isn't one.
- Count "would list a tool" apart from "would borrow" and from other feedback.
- Keep the tally on paper or in your own notes, not in this folder. Once the folder is a git repository, nobody's data may go in a file it tracks.
- Interest is a start. It isn't an audience, or funding.

## When Mira decides to build

Come back to build.md at step 3: make this folder a git repository with a .gitignore, get the check tool and compare its SHA-256 with the one build.md gives, and run init. Step 4 then fills in our.one.json and COSTS.md from the answers below, and step 7 finishes PITCH.md.

## Mira's answers to step 1, kept for later

In her words.

1. What it should do, for whom, and what they use today: "My idea is a tool-lending library for our street. Neighbours list tools they're happy to lend, like a drill, a ladder or a pressure washer, and others borrow them for a few days. It's for the 40 or so households on Linden Row. Today people ask in a WhatsApp group where requests get lost, or they buy tools they use twice a year."
2. Code already: "There's no code yet."
3. What it keeps, for how long, and who sees it: "It would keep each person's name, their email, their house number (just the number), the tools they list, and who borrowed what and when. Neighbours who've joined can see names, house numbers and tools. Only the lender and the borrower see a loan. I'd keep loans for a year, and delete an account's data when the person leaves."
4. Outside services: "Outside services: hosting and a database, whatever's simplest, and email for sign-in links. No payments, no AI, no analytics."
5. Cost, who pays, and the maintainer's pay: "It should cost 10 to 20 a month, in euros, for hosting and email. I'll pay it myself at first. I don't want to be paid."
6. Licence: "I have no view on the licence." build.md says to suggest Apache-2.0, the feed's licence. It's suggested; Mira hasn't said yes.
7. Who maintains it, and how to reach them: "I'd maintain it: Mira Holm, mira.holm@example.test."
8. What she wants from our.one now, and what has to happen first: "From our.one I'd like feedback first, then people to try it: my neighbours. Before it runs for real I'd want at least 10 households to say they'd list a tool."
9. How she'll find out: "To find out whether people want it, I can ask at the street's next meeting and put a note in the WhatsApp group."

## Still to ask Mira

For the draft, now:

- What is it called? PITCH.md uses the folder's name, linden-tools, until she says.
- If fewer than 10 households say they'd list a tool, what then? PITCH.md has a TODO for it.
- How does a loan happen? Does the borrower ask in the app and the lender agree, or do they arrange it between them and record it? And how do the two reach each other?
- PITCH.md and the note say only the lender and the borrower see a loan. Mira would run the database: should she be able to see loans, and if she can, should the draft say so? our.one's safeguards for that, such as no keys for whoever runs a service, aren't built yet.

For when she builds:

- Is Apache-2.0 the licence?
- Which hosting, database and email services? She said "whatever's simplest". Each is named in our.one.json, under sharedWith, before the code sends it anything.
- Error reports or maps: none, like payments, AI and analytics?
- What each thing costs a month, within the 10 to 20 euros, for COSTS.md. And who pays after "at first"?
- The address of the public repository, for our.one.json's source.
- Who sees a person's email? It isn't in the list of what neighbours see.
- Are name, email, house number and listed tools kept until the person leaves?
- When someone leaves, what happens to the loans they were part of, which the other person also sees?
- Why each piece is kept, for our.one.json: for example, what the house number is for.

To tell her too: build.md requires a way for each person to download their data, as well as delete it. She mentioned deletion. Download is built with the first feature that keeps anyone's data.
