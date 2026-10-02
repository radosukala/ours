# Build on our.one

Instructions for coding agents. Version 0.1.0, rules 0, 2 October 2026.

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
  the same check you will run:
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
4. No secret in a file the repository tracks.
5. Export and deletion are never weakened.
6. No claim the records don't make true. Until our.one's records say
   otherwise, the project is its maintainer's. It isn't its users'
   property, and our.one hasn't approved, listed or protected it.
7. The check and the rules block are never changed to make a check pass.

## 1. Ask the person

Ask these, and keep their answers:

1. What should it do, and for whom?
2. Is there code already? If so, where?
3. What will it keep about the people who use it? Everything it stores
   about a person counts: an email address, a name, what they write, when
   they did something.
4. Which outside services will it use: hosting, a database, email,
   payments, AI models, error reports, maps?
5. Which open-source licence? If they have no view, suggest Apache-2.0,
   the feed's licence.
6. Who maintains it, and how can people reach them?

## 2. Get the tool, and set the project up

From the project's root folder (create it, and run `git init`, if it's
new):

```sh
mkdir -p scripts
curl -fsSL https://our.one/kit/our-one.mjs -o scripts/our-one.mjs
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('scripts/our-one.mjs')).digest('hex'))"
```

The last line prints the file's SHA-256. It must be:

```text
ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7
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
adds to `.claude/settings.json`:

| File | What it is |
|---|---|
| `our.one.json` | The manifest: what the project is, and what it does with personal data |
| `AGENTS.md` | The rules, for every agent that works on the code |
| `CLAUDE.md` | One line, `@AGENTS.md`, so Claude Code reads the rules |
| `COSTS.md` | What it costs to run each month, and who pays |
| `PITCH.md` | The proposal, to fill in at the end |
| `.claude/settings.json` | A Claude Code stop hook: the check runs whenever you try to finish |
| `.github/workflows/our-one.yml` | The check, on every push and pull request |

Then put the licence's full text in `LICENSE`.

If the project is a folder inside a larger repository, run the tool with
`--project <folder>`, and change the paths in the hook and the workflow to
match.

## 3. Fill in our.one.json

Replace every TODO with the person's answers.

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
  person, with `who`, `what`, `why`, and `packages`, the npm packages that
  reach it.
- `data.boundary`: the folders that hold all the code that uses a database
  or a file store, such as `["src/data"]`.
- `data.export` and `data.delete`: how a person downloads their data, and
  how they delete it.
- `claims.allowed` (optional): exact sentences the claims check may let
  through, such as a definition, each with `file`, `text` and `why`. A
  person reads each one.

The schema is at https://our.one/kit/our.one.schema.json.

## 4. Build

Build what the person asked for, under the rules in `AGENTS.md`. In
practice:

- Put every database and file-store call in the boundary folder, behind
  functions the rest of the code calls. Then the store can be replaced
  without touching the rest.
- Add a kind of data to `data.collects` before the code keeps it, and a
  service to `data.sharedWith` before the code sends it anything.
- Build export and deletion with the first feature that keeps personal
  data, not at the end.
- If the person wants to count visits, count them without following
  anyone. A service that counts goes in `data.sharedWith` too.
- Keep keys in environment variables. Commit an `.env.example` with the
  names and no values.

## 5. Check

```sh
node scripts/our-one.mjs check
```

Fix every FAIL and run it again, until the result says READY TO PROPOSE.
Never change the check, the rules block or a test to make it pass. If a
check is wrong about this project, tell the person, and say why.

Then read the person the four questions at the end of the report. No
machine can answer them.

## 6. Propose

Fill in `PITCH.md` with the person. It asks what the common agreement asks
of every proposal: the need, what people would have to change, the price,
the scope and the budget with the maintainer's pay, what it asks for now,
and what must happen before work starts. Paste the end of the check's
report into it, with the commit it ran on.

Proposals go by email, and a person reads every one. Once proposals open,
the address is on https://our.one/maintainers. Until then, that page says
so.

## What the check looks at

| Check | What it looks at | How it is held |
|---|---|---|
| `manifest` | `our.one.json` is complete | STRUCTURAL |
| `licence` | an open-source licence, in a licence file, the same as `package.json`'s | CHECKED |
| `agents` | `AGENTS.md` carries the rules block, word for word | CHECKED |
| `data` | personal data, export and deletion are declared | STRUCTURAL |
| `boundary` | only code in `data.boundary` imports a database or file-store client (JavaScript and TypeScript) | CHECKED |
| `leave` | every outside service the tool knows is named in `data.sharedWith` | CHECKED |
| `tracking` | no ad network, pixel, Google Analytics or Tag Manager, session recording or data hub the tool knows | CHECKED |
| `secrets` | no secret the tool recognises, and no tracked `.env` file | CHECKED |
| `costs` | the costs file exists and is filled in | CHECKED |
| `claims` | no phrase presenting it as its users' property, or as approved by our.one | CHECKED |

CHECKED means a machine reports it, from patterns a determined person could
get around. So our.one runs its own copy of the check on the commit you
propose, and a person reads the result. The safeguards that would hold the
line while a service runs, such as no keys for whoever runs it and a log of
every read, aren't built yet. Every report lists them.
