# M-0017 agent trial: the new line, from an idea to READY TO PROPOSE

**Status:** done, 3 October 2026, in three parts with one agent: find
out first; build now; the person's last answers. The project is in
`linden-tools/`, without its `.git` folder; part one's files are in
`part-one/`.

## Part one: find out first

- **Who:** a fresh agent, given only the new line ("Read
  https://our.one/build.md and follow it to help me bring my idea to
  our.one.") and a FICTIONAL person's answers (a tool-lending library for
  one street), against a local production build of `e4e5637` on port 3412.
- **Result:** it read build.md, drafted `PITCH.md` with build.md's headings
  in the tool's order (four parts filled in, three TODO), asked "find out
  first, or build now?", and stopped when the person chose to find out
  first. It ran no `git init`, downloaded no tool and ran no `init`. It
  also wrote `FINDING-OUT.md` for the person (a note to send, questions for
  the street meeting).
- **Gaps it found in build.md** (to fix or record, after the verifiers):
  - step 1 never asks the project's name, its repository's address, or
    how people download their data;
  - "keep the answers" doesn't say where, on the find-out-first path;
  - "what happens if they don't" (step 2) is asked by no question in step 1;
  - "help them put the draft in front of the people" doesn't say how, and
    PITCH.md's sections are written for our.one, not for neighbours;
  - the stricter-rules sentence numbers rules 1 and 4 of the rules block,
    while build.md's own numbered lines put session recording and data
    hubs in line 1, and name no data boundary;
  - the example files live on GitHub, not on our.one;
  - nothing prompts the person to ask what whoever runs the service can
    see.
- **Note:** the session ran inside the OURS repository, so its AGENTS.md
  was shown to the agent automatically; it says it didn't rely on it.

Part one's files, as the agent left them, are in `part-one/`.

## Part two: "build it now"

- **The person came back:** 14 households would list a tool and 9 would
  borrow; "Let's build it now. Call it Linden Tools," with download as
  well as deletion.
- **What the agent did:** `git init` and a `.gitignore` first; downloaded
  the tool and checked its SHA-256 against `build.md`'s; read the tool
  before running it; `init`, which left `PITCH.md` as it was; the full
  Apache-2.0 text; then a small Node app with no packages (sign-in by an
  emailed link, listing tools, asking to borrow, lending, loans seen only
  by the lender and the borrower, download as JSON and deletion), all its
  storage in `src/data`, and 20 tests.
- **The check:** NOT READY on `manifest` and `costs`, and only on what the
  person hadn't said: where the code would be public, and which companies
  would host it and send its email. It wrote them as TODO rather than
  guess, as `build.md` says.

## Part three: the person's last answers

- **Mira answered:** the repository's address, Hetzner for the server
  (holding the database), Resend's free plan for email, no domain for now,
  Apache-2.0, and "say plainly that I could read the loans".
- **The agent:** put the answers where they belong; wrote sending through
  Resend so it is off unless the environment names a key, and declared it;
  added four tests (24 in all).
- **The check on `cce7ea3`:** READY TO PROPOSE, all ten checks passing.
  `PITCH.md` names that commit, with the RESULT lines and the tool's
  SHA-256 line, in a commit of its own (`a5a27a1`).
- **What no check could see,** and the agent found and wrote into the
  proposal: without a domain, Resend's free plan sends only to the
  account's own address, so neighbours wouldn't get sign-in emails. Mira
  has to choose a domain or another email service. (The agent quotes
  Resend's documentation for this; no human has checked it.)

## What the trial changed (fixes after the verification)

`build.md`'s step 1 now asks the project's name, how a person downloads
and deletes their data, who can see each thing including whoever runs the
service, which companies (the person chooses; a domain is among the
services), the repository's address, and what happens if people don't
want it; it says where to keep the answers if the person stops after step
2. Step 2 says `PITCH.md` is written for our.one, and to write the people
a short note instead. Step 3 says `init` also reads the remote's address,
and where a licence's full text comes from. Step 7 says "RESULT lines",
and that the commit adding `PITCH.md` changes only it. The rules
numbering is said to be the rules block's.

**Recorded, not changed:**

- **The schema's description** still says "our-one.mjs 0.2.0"; the tool is
  0.2.1. M-0017's scope leaves the schema alone (D-0020: the rules, the
  tool and the schema don't change); it is for the next kit change.
- **The costs check** flags TODO, TBD and the like, and a phrase such as
  "not chosen yet" would pass it. The tool is out of M-0017's scope.
- **The stop hook** never ran: the trial's session started in the OURS
  repository, not the project's folder. It was not observed here either.

