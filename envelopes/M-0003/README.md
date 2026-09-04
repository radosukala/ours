# Envelopes for M-0003

An envelope is what an implementation agent receives: the mandate, narrowed
to one part. It never widens the mandate, and it is never authority on its
own. The founder hands an agent one envelope; the agent does not read the
others' work-in-progress as instruction, and it does not receive the
conversation that produced any of this.

## Before running any envelope — founder

1. Review and adopt `decisions/D-0003`, `mandates/M-0003`, and
   `foundation/FEED-PILOT.md`. Adoption means changing `status: DRAFT` to
   `status: ADOPTED` in both the `.md` and `.yaml` of the decision and the
   mandate, then committing.
2. **Commit those records, and this directory, before an agent starts.**
   `M-0003` denies `decisions/**`, `mandates/**`, `foundation/**`, and
   `envelopes/**`. If they are still uncommitted when an agent runs
   `pnpm ours check M-0003 --changed`, the kernel will refuse the working
   tree — correctly, because a mandate may not edit its own authority. A
   clean tree containing only the agent's work is what the check is for.
3. Confirm the machine authorises the chain:

   ```bash
   pnpm ours check M-0003
   ```

## The ritual — every agent, every part

Paste the envelope as the task. The agent must:

1. Read `AGENTS.md` first. Its only authority is `mandates/M-0003.md` and
   `M-0003.yaml`; the envelope narrows that authority to one part.
2. Run `pnpm ours check M-0003` before starting. If it refuses, stop and
   report the refusal verbatim.
3. Touch only the paths its envelope lists. If the work seems to need a path
   outside them, stop and write the proposed scope change into the receipt.
   Do not make it.
4. Never resolve a fact marked `[CONFIRM]`, name a data controller, deploy,
   add analytics or a third-party origin, or write any claim that members
   exist or that anything is member-owned.
5. Before finishing, run:

   ```bash
   pnpm typecheck && pnpm test && pnpm ours check M-0003 --changed
   ```

   All three must pass. A refusal is reported, not worked around.
6. Write a receipt section to `receipts/builds/<date>-M-0003-<part>.md`
   with: agent and model; scope touched; dependencies added and why; each
   acceptance test for the part and its result; every failure, including
   the ones fixed; what is still not true. Use one truthful state — the
   part is `IMPLEMENTED` or `TESTED`, never "done".

## Order

```text
A  records and kernel          →  B  application foundation
                                       ↓
                        C  settings   D  ranking   E  participation   (parallel)
                                       ↓
                               F  conformance and receipt
```

## The parts

| File | Part |
|---|---|
| [`A-records-and-kernel.md`](./A-records-and-kernel.md) | rulebook, catalog, contract, `ours.option/v0.1`, `R-OPTION-PROVENANCE` |
| [`B-application.md`](./B-application.md) | `apps/feed` foundation |
| [`C-settings-with-receipts.md`](./C-settings-with-receipts.md) | settings from the catalog, overrides, attention behaviors |
| [`D-ranking-contract.md`](./D-ranking-contract.md) | modes, "why this item", the structural guarantee |
| [`E-participation.md`](./E-participation.md) | endorse, propose, report → steward → receipt |
| [`F-conformance.md`](./F-conformance.md) | conformance report, scan, inspection, receipt, proposed release mandate |
