import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "@ours/kernel";
import { DURING_WINDOW, REPO_ROOT, makeVariantRepo } from "../helpers.ts";

/**
 * The gap M-0002 closed.
 *
 * R-SCOPE was classed ENFORCED and decided nothing, because it only evaluated
 * paths a caller supplied and no caller supplied any. An implementation wrote
 * to a denied directory and the trace called its scope coherent.
 *
 * These tests exist so that never reads as a pass again.
 */

describe("an unevaluated scope check is not a pass", () => {
  it("reports NOT_MACHINE_DECIDABLE when no paths are supplied", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
    const scope = result.findings.find((f) => f.rule === "R-SCOPE");
    expect(scope?.outcome).toBe("NOT_MACHINE_DECIDABLE");
    expect(scope?.outcome).not.toBe("PASS");
    expect(scope?.message).toContain("This is not a pass");
    expect(scope?.message).toContain("--changed");
  });

  it("passes only once real paths have been evaluated", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: DURING_WINDOW,
      changedPaths: ["packages/kernel/src/rules.ts"],
    });
    const scope = result.findings.find((f) => f.rule === "R-SCOPE");
    expect(scope?.outcome).toBe("PASS");
    expect(scope?.message).toContain("1 changed path");
  });

  it("still refuses a denied path when paths are supplied", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: DURING_WINDOW,
      changedPaths: ["receipts/releases/R-0001.md"],
    });
    expect(result.authorized).toBe(false);
    const scope = result.findings.find((f) => f.rule === "R-SCOPE");
    expect(scope?.outcome).toBe("REFUSED");
  });
});

describe("a mandate requiring a receipt must permit writing one", () => {
  it("allows receipts/builds for every mandate whose evidence names a build receipt", async () => {
    const { parse } = await import("yaml");
    for (const id of ["M-0002"]) {
      const raw = await readFile(path.join(REPO_ROOT, `mandates/${id}.yaml`), "utf8");
      const mandate = parse(raw) as {
        acceptance: { evidence: string[] };
        scope: { paths: { allow: string[]; deny: string[] } };
      };
      const needsReceipt = mandate.acceptance.evidence.some((e) => /build receipt/i.test(e));
      if (!needsReceipt) continue;
      const canWrite = mandate.scope.paths.allow.some((p) => p.startsWith("receipts/builds"));
      expect(canWrite, `${id} requires a build receipt but denies receipts/builds`).toBe(true);
    }
  });
});

/** Markdown wraps prose, so assertions match meaning rather than line breaks. */
const flat = (text: string): string => text.replace(/\s+/g, " ");

describe("the transitional operator is recorded without being asserted", () => {
  it("records the stated entity facts", async () => {
    const text = await readFile(
      path.join(REPO_ROOT, "authority/FOUNDING-AUTHORITY.md"),
      "utf8",
    );
    expect(text).toContain("Ctrl AI, Inc.");
    expect(text).toContain("Delaware C-Corporation");
    expect(flat(text)).toContain("131 Continental Dr, Suite 305, Newark, DE 19713");
    expect(text).toContain("Legalinc Corporate Services, Inc.");
  });

  it("marks them unverified and keeps the rest open", async () => {
    const text = await readFile(
      path.join(REPO_ROOT, "authority/FOUNDING-AUTHORITY.md"),
      "utf8",
    );
    expect(flat(text)).toContain("Not independently verified against the filed record");
    expect(text).toMatch(/Delaware file number \| `\[CONFIRM\]`/);
    expect(text).toMatch(/Ownership \| `\[CONFIRM\]`/);
  });

  it("keeps the superseded address visible rather than overwriting it", async () => {
    const text = await readFile(
      path.join(REPO_ROOT, "authority/FOUNDING-AUTHORITY.md"),
      "utf8",
    );
    // The correction is the strongest evidence for why the evidence column
    // exists, so it is retained. Deleting it would erase the demonstration.
    expect(flat(text)).toContain("800 North King Street");
    expect(flat(text)).toContain("The earlier entry was wrong");
  });

  it("does not claim the entity operates, owns, or funds anything here", async () => {
    const text = await readFile(
      path.join(REPO_ROOT, "authority/FOUNDING-AUTHORITY.md"),
      "utf8",
    );
    expect(flat(text)).toContain("No relationship to OURS is established");
    // The registered office must not be read as a place of business.
    expect(flat(text)).toContain("service address, not a place of business");
  });
});
