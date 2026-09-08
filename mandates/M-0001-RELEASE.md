# M-0001-RELEASE — Publish the Authority Trace

**Status:** ADOPTED — executed 30 August 2026 while marked DRAFT; its receipt was never written, and it becomes DEPLOYED only when `M-0004` produces the receipt from verifiable facts; status corrected under `D-0004` §C on 8 September 2026
**Class:** DEPLOY
**Authorizing decision:** [`D-0001`](../decisions/D-0001.md)
**Machine projection:** [`M-0001-RELEASE.yaml`](./M-0001-RELEASE.yaml)

## Why this is a separate mandate

`M-0001` built the page and held no capability to publish it. This mandate
publishes and holds no capability to change what it publishes: `apps/proof/src`
is **denied** here.

If one mandate could do both, the separation would be decoration. The point is
that the thing which produced the artifact cannot also decide the artifact is
fit to release, and the thing which releases it cannot quietly alter it first.

## Objective

Publish the built Authority Trace at `oursorg.com` as a static site, with the
deploy configuration recorded in the repository rather than held as settings in
a dashboard, and produce a release receipt binding the running artifact's
digest to the authority behind it.

## Human outcome

A stranger can open `oursorg.com`, read why that page is running, and check the
claim without an account.

## Why the configuration lives in the repository

A build command held only in a Vercel dashboard is a rule with no record. It
can be changed by one person with no receipt, no diff, and no way for a reader
to know it changed — which is the `R-WEAKEST-LAYER` problem in miniature.

`vercel.json` makes the build command and output directory reviewable, and a
change to them appears in the history like any other.

This does not make the deployment tamper-resistant. Whoever controls the Vercel
account can override the file, disconnect the repository, or deploy something
else entirely. The weakest layer is unchanged; recording the configuration
only removes the case where it changes *silently*.

## The diagnosed failure this corrects

The first deployment returned `404: NOT_FOUND`. Three facts, together:

1. No `vercel.json`, so Vercel had no build instructions.
2. `apps/proof/dist/` is gitignored, so the repository contains no HTML.
3. With no framework detected and no build command, nothing was produced and
   nothing was served.

The output stays gitignored. Committing build artifacts would mean the
published page could drift from the records it claims to project, and the
digest in the release receipt would prove only that someone committed a file.

## In scope

```text
vercel.json
apps/proof/dist/**
receipts/releases/**
receipts/builds/**
```

## Out of scope — denied

```text
apps/proof/src/**    this mandate publishes the artifact; it does not author it
packages/**
authority/**
constitution/**
decisions/**
mandates/**
```

If the deployment fails for a reason that requires changing the generator, this
mandate stops. That is a build concern and needs build authority.

## Acceptance tests

1. `pnpm ours check M-0001-RELEASE --changed` authorises before the deploy.
2. `pnpm proof` produces `apps/proof/dist/index.html` from a clean install.
3. The deployed page is byte-identical to the local build — the digest in the
   release receipt equals the digest of what is served.
4. `oursorg.com` serves the page over HTTPS.
5. The served page makes no third-party request.
6. The page states founder authority and that no member institution exists.
7. The release receipt names the artifact digest, the environment, the deploy
   authority, and an actionable rollback.

## Evidence required

- the artifact digest, recorded before and verified after deployment;
- the deployment URL and the commit it was built from;
- a release receipt.

## Stop conditions

- the deployed digest does not match the verified one;
- the deployment requires changing anything under `apps/proof/src` or
  `packages/`;
- the page cannot be served without a third-party request;
- DNS changes are required that the founder has not made.

## Rollback

Roll back to the previous Vercel deployment, or remove the domain assignment.
The repository is unchanged by a rollback; the artifact is rebuildable from any
commit.

**Irreversible residue — and this is the first mandate with any.**

Once the page is public, anyone may have read it, and that cannot be undone.
A rollback removes the page; it does not remove the reading. Specifically:

- the page's content may be cached by search engines, archives, or readers;
- the fact that OURS published at all becomes public and cannot be retracted;
- any link shared while it was live continues to be shared.

Nothing personal is exposed, because the page collects nothing and contains no
private data. But the claim that a reversal restores the prior state is false
here, and the receipt must say so rather than repeat `none`.

## Human approvals

| Situation | Who decides |
|---|---|
| material ambiguity | founder |
| adoption of this mandate | founder |
| DNS records at the registrar | founder — the agent cannot and does not |
| deploy authorisation | founder |
