import { describe, expect, it } from "vitest";
import { compile, summarise } from "@ours/kernel";
import { buildBundle, verifyBundle } from "@ours/verifier";
import { DURING_WINDOW, REPO_ROOT } from "../helpers.ts";

/**
 * The one chain that should hold, checked against the real repository rather
 * than a fixture. If the governing documents drift out of agreement with each
 * other, this fails — which is the point.
 */
describe("the real founding chain", () => {
  it("authorises M-0000 under D-0000 under the Founding Authority", async () => {
    const result = await compile({
      root: REPO_ROOT,
      mandateId: "M-0000",
      now: DURING_WINDOW,
    });
    expect(result.findings.filter((f) => f.outcome === "REFUSED")).toEqual([]);
    expect(result.authorized).toBe(true);
  });

  it("reports every finding with an enforcement class", async () => {
    const result = await compile({ root: REPO_ROOT, mandateId: "M-0000", now: DURING_WINDOW });
    for (const finding of result.findings) {
      expect(finding.enforcement).toBeTruthy();
      expect(finding.message.length).toBeGreaterThan(20);
    }
  });

  it("never collapses the constitution into a single passing total", async () => {
    const result = await compile({ root: REPO_ROOT, mandateId: "M-0000", now: DURING_WINDOW });
    const summary = summarise(result);
    // The undecidable remainder is the honest part of the report. If it ever
    // reaches zero, either the constitution lost its interpretive articles or
    // the kernel started claiming to decide them.
    expect(summary.notMachineDecidable).toBeGreaterThan(0);
    expect(summary).not.toHaveProperty("total");
    expect(summary.enforced.passed).toBeGreaterThan(0);
  });
});

describe("the exported bundle verifies without the repository", () => {
  it("re-derives every digest from its own bytes", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    expect(bundle).not.toBeNull();
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(true);
    expect(bundle!.sources.length).toBeGreaterThan(0);
  });

  it("refuses a bundle whose embedded source was altered after export", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    bundle!.sources[0]!.text += "\nQuietly appended after the digest was taken.\n";
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join(" ")).toContain("embedded bytes hash to");
  });

  it("refuses a bundle whose decision does not authorise its mandate", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    bundle!.decision.authorizes.mandate_ids = [];
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join(" ")).toContain("does not authorise");
  });

  it("states that member ownership has not been issued", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    const outcome = verifyBundle(bundle!);
    expect(outcome.lines.join(" ")).toContain("member ownership NOT issued");
    expect(outcome.lines.join(" ")).toContain("Nothing in this bundle is non-bypassable");
  });
});
