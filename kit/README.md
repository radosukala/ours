# The build kit

What a coding agent needs to build a project for our.one: instructions,
the rules, and a tool that sets a project up and checks it. Decided by
[`D-0019`](../decisions/D-0019.md), built under
[`M-0016`](../mandates/M-0016.md).

**Not deployed yet.** our.one serves nothing at these addresses until it
is deployed, and the line below points at nothing until then. The files are
here, in the repository, in the meantime.

| File | What it is | Served at, once deployed |
|---|---|---|
| [`build.md`](./build.md) | The instructions a coding agent follows, step by step | `/build.md` |
| [`our-one.mjs`](./our-one.mjs) | One file, no dependencies, no network: `init`, `check`, `rules` | `/kit/our-one.mjs` |
| [`our.one.schema.json`](./our.one.schema.json) | The schema of a project's `our.one.json` | `/kit/our.one.schema.json` |

A builder gives their agent one line:

```text
Read https://our.one/build.md and use it to build my app for our.one.
```

## What passing means

A project that passes the check is ready to propose to our.one. Nothing
more: it isn't listed, approved or protected. Most checks are `CHECKED`,
patterns a determined person could get around, so our.one runs its own copy
on the commit proposed, and a person reads the result. Every report also
lists what a person must read, and the safeguards our.one hasn't built.

## The rules

Rules version 0 put the common agreement's terms into checks (D-0019 §C).
Three of the ten go further than the agreement's words, and wait for the
founder's approval: the boundary in rule 1, and no session recording and no
data hubs in rule 4.
A change to the rules is a new rules version, by a new decision. `init`
writes the rules block into a project's `AGENTS.md`; `check` compares it
word for word.

The feed, our.one's first project, carries the same manifest
([`apps/web/our.one.json`](../apps/web/our.one.json)) and passes the same
check. A test keeps it passing.

## Licence

Apache-2.0, like the feed's code: the text is in [`LICENSE`](./LICENSE).
