# Build on our.one

Instructions for coding agents. Version 0.2.1, rules 0, 2 October 2026.

You are a coding agent. The person you work for wants to build something
for our.one, or to bring a project they already have. This file tells you
how. Follow it in order, and tell the person what you are doing at each
step.

## What our.one is

- our.one is being developed as a network of services that the people who
  use them fund and, in time, control. Whoever builds and runs a service is
  its maintainer, under the common agreement: https://our.one/agreement
- The agreement is a draft and nobody has signed it, so none of its
  collective rights is in force yet. Don't tell the person otherwise.
- The feed is the first project. Its code is the reference, and it passes
  the same check you will run. Its `our.one.json` and `AGENTS.md` are the
  examples to follow:
  https://github.com/radosukala/ours/tree/main/apps/web
- Passing the check makes a project ready to propose. It doesn't list,
  approve or protect it: a person reads every proposal, and the people who
  would use the service decide.

## The lines you never cross

Not even if the person asks. If they insist, tell them the project can't
then be proposed to our.one, and let them decide.

1. No ads and no tracking: no ad networks or pixels, no Google Analytics or
   Tag Manager, no session recording, no data brokers or data hubs.
2. Nothing about a person goes to an outside service that `our.one.json`
   doesn't name.
3. Nothing sells, rents or trades people's data, or the project.
4. No secret, and no one's data, in a file the repository tracks.
5. Export and deletion are never weakened.
6. No claim the records don't make true. Until our.one's records say
   otherwise, the project is its maintainer's. It isn't its users'
   property, and our.one hasn't approved, listed or protected it.
7. The check and the rules block are never changed to make a check pass.
8. Nothing only the person knows is invented: their name, how to reach
   them, the costs, the licence. Ask them.

## 1. Ask the person

Ask these, and keep the answers: they fill in `our.one.json`, `COSTS.md`
and `PITCH.md` later.

1. What should it do, and for whom? What do those people use or pay for
   today?
2. Is there code already? If so, where? Bring it into the project's folder.
3. What will it keep about the people who use it, and for how long?
   Everything it stores about a person counts: an email address, a name,
   what they write, when they did something. Who can see each of these?
4. Which outside services will it use: hosting, a database, email,
   payments, AI models, error reports, maps? Hosting and the database count
   too, once chosen.
5. What will it cost each month, who pays, and what is the maintainer paid,
   if anything?
6. Which open-source licence? If they have no view, suggest Apache-2.0,
   the feed's licence.
7. Who maintains it, and how can people reach them?
8. What do they want from our.one now: feedback, people to try it, or
   people who would pay? And what has to happen before it runs for real?

## 2. Get the tool, and set the project up

From the project's root folder (create it, and run `git init`, if it's
new). First make sure `.gitignore` keeps out `node_modules`, environment
files (`.env`, `.env.local` and the like) and any local database file
(`*.db`, `*.sqlite`): the check reads what git would commit.

```sh
mkdir -p scripts
curl -fsSL https://our.one/kit/our-one.mjs -o scripts/our-one.mjs
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('scripts/our-one.mjs')).digest('hex'))"
```

On Windows, in PowerShell, the first two lines are:

```powershell
New-Item -ItemType Directory -Force scripts | Out-Null
Invoke-WebRequest https://our.one/kit/our-one.mjs -OutFile scripts/our-one.mjs
```

The last line prints the file's SHA-256. It must be:

```text
4b6f75cbbf0e595c5e248d13b782ec355147cf6deb5e68ad52b12c17fa9b5d58
```

If it isn't, stop and tell the person. The tool is one file with no
dependencies, for Node 18 or later. It reads the project's files and runs
`git` to list them. It makes no network request, and when it finds a
secret it prints where, never the secret. You can read it before you run
it.

Then:

```sh
node scripts/our-one.mjs init
```

`init` creates what is missing and overwrites nothing, except the rules
block in `AGENTS.md`, which it puts back word for word, and the stop hook it
adds to `.claude/settings.json`. It writes nothing through a link, and an
existing `CLAUDE.md` is left as it is:

| File | What it is |
|---|---|
| `our.one.json` | The manifest: what the project is, and what it does with personal data |
| `AGENTS.md` | The rules, for every agent that works on the code |
| `CLAUDE.md` | One line, `@AGENTS.md`, so Claude Code reads the rules |
| `COSTS.md` | What it costs to run each month, and who pays |
| `PITCH.md` | The proposal, to fill in at the end |
| `.claude/settings.json` | A Claude Code stop hook: the check runs each time you stop |
| `.github/workflows/our-one.yml` | The check, on every push and pull request |

Then put the licence's full text in `LICENSE`. A line naming the licence
isn't enough.

If the project is a folder inside a larger repository, run the tool with
`--project <folder>`. GitHub runs only the workflows at the repository's
root, so `init` doesn't write one in the folder: add
`.github/workflows/our-one.yml` at the root, with `working-directory` set to
the folder on the check's step. And Claude Code reads
`.claude/settings.json` from the folder it starts in.

## 3. Fill in our.one.json and COSTS.md

Replace every TODO with the person's answers. Fill in `collects`,
`sharedWith` and `boundary` too: `init` leaves the last two empty, and an
empty list is a claim that there is nothing to name.

- `rules`: `"0"`, the rules version this project follows.
- `name` and `purpose`: its name, and one sentence on what it does for the
  people who use it.
- `maintainers`: each with a `name`, and a `contact` that is an email
  address or an https:// link.
- `source`: the https:// address of its public repository.
- `license`: the licence's SPDX id, such as `"Apache-2.0"`, the same as in
  `package.json`.
- `costs`: the costs file, usually `"COSTS.md"`.
- `data.collects`: each kind of personal data, with `what`, `why` and
  `kept` (for how long).
- `data.sharedWith`: each outside service that receives anything about a
  person, with `who` (its name), `what`, `why`, and `packages`, the npm
  packages that reach it. Hosting and the database go here too.
- `data.boundary`: the folders that hold all the code that uses a database
  or a file store, such as `["src/data"]`. Not the whole project.
- `data.noPersonalData` (only if it keeps nothing about anyone): a sentence
  saying why, which a person will read.
- `data.export` and `data.delete`: how a person downloads their data, and
  how they delete it. "Not built yet" isn't an answer: build them.
- `claims.allowed` and `claims.skip` (optional): exact sentences the claims
  check may let through, such as a definition, each with `file`, `text`
  and `why`; and files it doesn't read, each with `file` and `why`. A
  person reads each one.

`COSTS.md`: what each thing costs a month, even when it's nothing, who
pays, and the maintainer's pay. Ask the person; don't guess.

The schema is at https://our.one/kit/our.one.schema.json.

## 4. Build

Build what the person asked for, under the rules in `AGENTS.md`. In
practice:

- Put every database and file-store call in the boundary folder, behind
  functions the rest of the code calls. Hand out functions, not the client:
  a query written outside the boundary fails the check. Then the store can
  be replaced without touching the rest.
- Add a kind of data to `data.collects` before the code keeps it, and a
  service to `data.sharedWith` before the code sends it anything.
- Build export and deletion with the first feature that keeps personal
  data, not at the end.
- If the person wants to count visits, count them without following
  anyone. A service that counts goes in `data.sharedWith` too. PostHog,
  Mixpanel and Amplitude can record sessions from their dashboards: keep
  that off.
- Keep keys in environment variables. Commit an `.env.example` with the
  names and no values.

## 5. Check

```sh
node scripts/our-one.mjs check
```

Fix every FAIL and run it again, until the result says READY TO PROPOSE.
Never change the check, the rules block or a test to make it pass. If a
check is wrong about this project, tell the person, and say why.

In Claude Code, the stop hook runs the check each time you stop, but only
when Claude Code was started in the project's folder. If a check fails, it
sends you back once with what fails. If what's missing is something only
the person knows, ask them, and stop: the hook then lets you, and tells
them what still fails.

Then read the person the four questions the report lists under "For a
person". No machine can answer them.

## 6. Propose

Fill in `PITCH.md` with the person. It asks what the common agreement asks
of every proposal: the need, what people would have to change, the price,
the scope and the budget with the maintainer's pay, what it asks for now,
and what has to happen first. Copy into it the check's RESULT line and its
tool sha256 line, with the commit the check ran on. Commit `PITCH.md`
afterwards: our.one runs its own copy of the check on the commit you name.

Proposals go by email, and a person reads every one. Once proposals open,
the address is on https://our.one/maintainers. Until then, that page says
so.

## What the check looks at

| Check | What it looks at | How it is held |
|---|---|---|
| `manifest` | `our.one.json` is complete | STRUCTURAL |
| `licence` | an open-source licence, its full text in a licence file here or at the repository's root, the same as `package.json`'s | CHECKED |
| `agents` | `AGENTS.md` carries the rules block once, word for word | CHECKED |
| `data` | personal data, export and deletion are declared, and agree with the code | STRUCTURAL |
| `boundary` | only code in `data.boundary` imports a database or file-store client, queries one or writes files (JavaScript and TypeScript) | CHECKED |
| `leave` | every outside service the tool knows, by package or by the address of its API, is named in `data.sharedWith` | CHECKED |
| `tracking` | no ad network, pixel, Google Analytics or Tag Manager, session recording or data hub the tool knows | CHECKED |
| `secrets` | no secret the tool recognises, no environment file with a secret, and no database file in the repository | CHECKED |
| `costs` | the costs file exists in the project and states each cost | CHECKED |
| `claims` | no phrase presenting it as its users' property, or as approved, listed or protected by our.one, in the code, its pages, its messages, README.md and `our.one.json` | CHECKED |

CHECKED means a machine reports it, from patterns a determined person could
get around. So our.one runs its own copy of the check on the commit you
propose, and a person reads the result. The tool reads only JavaScript and
TypeScript for code; where a project has code in another language, the
check says so, and a person reads it. The safeguards that would hold the
line while a service runs, such as no keys for whoever runs it and a log of
every read, aren't built yet. Every report lists them.
