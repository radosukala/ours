# The agent trial — M-0016

**Who:** a fresh agent that built none of the kit and read nothing in this
repository.
**Given:** only the line on `/build`, *"Read https://our.one/build.md and use
it to build my app for our.one."*, pointed at a local production build
(`http://localhost:3311`), with a FICTIONAL person's answers about a book
club.
**When:** 2 October 2026, against the tool whose SHA-256 is
`ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7`, the build
at `576df0a`.
**Its project:** [`book-club/`](./book-club/): the tracked files of its
repository at its commit `4f5e0bf`, all FICTIONAL.

Its report follows as it wrote it. HTML escapes the transport added were
undone, and nothing else was changed.

---

I got the book-club project to **READY TO PROPOSE** and drafted `PITCH.md`. The last check ran on commit `4f5e0bf`, with nothing uncommitted. Nothing was sent anywhere, and the only network use was `curl` to localhost:3311.

The biggest finding: **READY TO PROPOSE can be reached with no app at all.** My first check ran before I'd written any code and already said READY.

I didn't install packages or run the app on a port. I tested it offline instead, with Node's built-in `node:sqlite` in place of `better-sqlite3` and fakes for `resend` and `node:http`. So it is tested only against stand-ins, never against the real packages.

## 1. Steps, in order

1. **Fetched build.md:** `curl -sS -i http://localhost:3311/build.md` returned 200, `text/markdown`, 194 lines. I kept a copy in `agent-trial/_reference/`.
2. **Step 1 (ask the person):** I used the answers in my brief. What they didn't cover is in section 3.
3. **Step 2, project and tool:**
   - `mkdir book-club && git init` printed "Initialized empty Git repository…".
   - `mkdir -p scripts && curl -fsSL http://localhost:3311/kit/our-one.mjs -o scripts/our-one.mjs` exited 0.
   - The `node -e` hash line printed `ab12bc2e…0a7fa7`, which matches build.md.
4. **Read the tool before running it** (1,429 lines). It imports only Node built-ins, makes no network calls, and runs only `git ls-files` and `git remote get-url origin`.
5. **`node scripts/our-one.mjs init`:**
   - It created `our.one.json`, `AGENTS.md`, `CLAUDE.md`, `COSTS.md`, `PITCH.md`, `.claude/settings.json` and `.github/workflows/our-one.yml`.
   - It printed "There is no licence file…" and "Next: fill in every TODO in our.one.json and COSTS.md, then run: node scripts/our-one.mjs check".
6. **LICENSE:** the MIT text, "Copyright (c) 2026 FICTIONAL Maintainer".
7. **Fetched the pages build.md links to,** all from localhost:3311: the schema, `/agreement` and `/maintainers` returned 200; `/agreement.md` returned 404. The maintainers page says "Proposals open at launch."
8. **Step 3, `our.one.json` and `COSTS.md`:**
   - **Collects:** 4 kinds of data (first name, email, which meetings each member said they'd come to, and a private-link key).
   - **Shared with:** Resend, plus "A hosting provider, not chosen yet".
   - **Boundary:** `["src/data"]`, with how members export and delete their data.
9. **First check,** as the init message said to (output in section 2).
10. **Step 4, the build:** a plain Node app.
    - `src/data/store.js` holds every SQLite call.
    - `src/server.js` and `src/pages.js` serve the pages.
    - `src/remind.js` sends the monthly email through Resend.
    - `src/admin.js` is the organizer's command line.
    - Also `package.json`, `.env.example`, `.gitignore` (ignores `.env` and the database) and `README.md`.
    - Members open everything through a private link, and can download or delete their data there.
    - `node --check` passed on every file.
11. **Offline smoke tests** in `agent-trial/_smoke` all passed: the command line including its refusals, every page route, export, delete with and without confirmation, HTML escaping, and the reminder's dry run, missing key, send, once-per-meeting guard, `--force` and 12-month pruning. I fixed one raw "UNIQUE constraint failed" message.
12. **Step 5:** all 10 checks were ok, so there were no FAILs to fix.
13. **Probes** of the check's coverage on throwaway copies, deleted afterwards (findings in section 3).
14. **Stop hook:** `check --hook` exits 2 with the findings the first time, then exits 0 with a `systemMessage` once the agent has already been sent back.
15. **Commit:** I set a repo-local git identity, "FICTIONAL Maintainer <maintainer@example.test>", and committed `deb06c9`. The check on that clean tree said READY TO PROPOSE.
16. **Step 6:** filled in `PITCH.md`, committed `4f5e0bf`, and ran the final check.

## 2. The check: first and last run

**First run** (before any code; LICENSE, manifest and COSTS filled, `PITCH.md` still the template):
```
[ ok ] manifest  [ ok ] licence  [ ok ] agents  [ ok ] data
[ n/a ] boundary  No JavaScript or TypeScript found…
[ n/a ] leave     No package.json and no JavaScript or TypeScript…
[ ok ] tracking  [ ok ] secrets  [ ok ] costs  [ ok ] claims
RESULT: READY TO PROPOSE, with 2 checks not run (boundary, leave).
```

**Last run** (commit `4f5e0bf`, tool sha256 `ab12bc2e…0a7fa7`):
```
All 10 checks ok. data: "It declares 4 kinds of personal data and 2 outside services, with export and deletion."
boundary: "Only code in src/data reaches a store (1 place)."   leave: "Named: Resend."
RESULT: READY TO PROPOSE.
```

## 3. Unclear, wrong or missing, and where I guessed

**The stopping rule is too easy to meet**
- "Fix every FAIL and run it again, until the result says READY TO PROPOSE." That result is reachable with no code and an untouched `PITCH.md` (its title still reads "# Proposal: TODO the project's name"). Nothing checks `PITCH.md`.

**Things the check can't see.** Each of these, on a throwaway copy, still gave READY TO PROPOSE. These are ordinary things a builder writes by accident, not workarounds:
- **Claims in `.js` pages.** "member-owned and approved by our.one" in `src/pages.js` passed. The same sentence in README.md failed. The claims check reads only README and `.html/.jsx/.tsx/.vue/.svelte/.astro/.mdx` files, and build.md's table ("no phrase presenting it as its users' property…") doesn't say so.
- **Declaring nothing.** `data.collects: []` passed as "It declares that it keeps nothing about anyone", while `boundary` reported a database in use in the same run.
- **Services called with `fetch`.** A `fetch` to `api.resend.com` got "No outside service the tool knows is used."
- **Files written with `node:fs`.** A JSON file of emails written outside `src/data` was not noticed.
- **Committed databases.** A SQLite database of members' emails, committed to git, passed everything. build.md never says to gitignore local data.

**Step 1 doesn't ask what later steps need**
- "Ask these, and keep their answers:" doesn't say where to keep them, and the answer to Q2 has nowhere to go.
- Q3 asks what is kept, but never for how long, although `kept` is required. It also doesn't ask who can see it.
- Nothing asks about costs, who pays, the maintainer's pay, what people use today, what you're asking for now, or what must happen before work starts. `COSTS.md` and `PITCH.md` need all of these.

**COSTS.md and the order of steps**
- build.md never tells you to fill in `COSTS.md`; only the init message does. That message also says to run the check before building, while build.md says build first (step 4), then check (step 5).

**"Replace every TODO with the person's answers."**
- init writes `collects`, `sharedWith` and `boundary` as empty lists, not TODOs. A builder who only replaces TODOs leaves them empty, and the check still passes.

**Hosting**
- Q4 lists "hosting" as an outside service. It isn't said whether a host that would store the database counts under `data.sharedWith` ("each outside service that receives anything about a person"). I guessed yes.

**The stop hook**
- "the check runs whenever you try to finish". It never ran in my session, because my Claude Code project folder wasn't `book-club`.
- When it does run, it sends the agent back only once, then lets it stop. It is a nudge, not a gate.
- It will also bounce every turn end while the agent is waiting for the person's answers.

**Step 6: the proposal**
- "Paste the end of the check's report into it, with the commit it ran on." "The end" is vague: how many lines?
- The commit that adds `PITCH.md` can never be the commit the check ran on. Which one does our.one check, "the commit you propose"?

**The proposal's sections don't match the agreement**
- "…and what must happen before work starts" is not in the agreement's §7 or in the maintainers page's list.
- The template's "What it offers" is in neither.
- "Before work starts" also reads oddly after build.md has had you build the whole thing.

**Smaller points**
- **The four questions:** "Then read the person the four questions at the end of the report." They aren't at the end; the "Not built yet" list and RESULT come after them.
- **Honest denials fail.** "not approved by our.one" fails the claims check. Rule 6 pushes builders to write exactly that. I used build.md's own wording, "our.one hasn't approved, listed or protected it".
- **The schema address.** `$schema` points to `https://our.one/…`, which won't resolve before launch.
- **The reference project.** The feed's code is on GitHub, which I couldn't open under my constraints, and build.md doesn't say what in it to look at.

**Where I chose the cautious answer** (not covered by the brief):
- **Visibility:** everything is behind members' private links, and `/` shows nothing about anyone.
- **What is kept:** only "yes" answers are stored, with no timestamps, and answers are deleted 12 months after the meeting.
- **No logging:** requests aren't logged.
- **Who pays:** I assumed "the person" is FICTIONAL Maintainer.
- **Resend's price:** left as not confirmed, because I couldn't check it offline.
- **Proposal gaps:** in `PITCH.md`, "what they use today", "asking for now" (I put "feedback only") and "before work starts" are marked *Not confirmed*.
- **Package versions:** `better-sqlite3 ^11.0.0` and `resend ^4.0.0` were not checked against npm, and there is no lockfile.

## 4. Where a builder would get stuck

- **Thinking it's finished:** taking READY TO PROPOSE as "done" when no app exists yet.
- **Data the check misses:** believing their data is covered when it goes through `.js` pages, `fetch`, `node:fs` files or a committed database.
- **Hosting:** not knowing where the host goes in `our.one.json`.
- **Export and delete without accounts:** build.md gives no guidance on how a person proves who they are. I used private links.
- **The commit to name:** which commit `PITCH.md` should point to.
- **Honest denials:** being failed for writing one.
- **The stop hook:** expecting it to run in the current session, then being surprised by it in later ones.

**The four questions the person must answer** (step 5 says to read these to them; no machine can):
1. Is everything the code keeps about people in `data.collects`, and is it used only for the service?
2. Do export and deletion work, for everything in `data.collects`?
3. Is nothing sold, and does no money come from anyone who expects a return?
4. Does `PITCH.md` say what the agreement asks?

## 5. Final project files

In `/private/tmp/claude-501/-Users-rado-code-ours/6261415c-2057-48bb-a5d3-9e842959006f/scratchpad/agent-trial/book-club/`, 18 tracked files:
- `.claude/settings.json`, `.env.example`, `.github/workflows/our-one.yml`, `.gitignore`
- `AGENTS.md`, `CLAUDE.md`, `COSTS.md`, `LICENSE`, `PITCH.md`, `README.md`
- `our.one.json`, `package.json`, `scripts/our-one.mjs` (unchanged, same hash)
- `src/admin.js`, `src/data/store.js`, `src/pages.js`, `src/remind.js`, `src/server.js`

Outside the project but in the same folder: `agent-trial/_reference/` holds copies of build.md, the schema, the agreement and maintainers pages, and the report from the check on `deb06c9`. `agent-trial/_smoke/` holds the offline test scripts.
