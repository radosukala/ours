import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADOPTION_RULE, PREREQUISITE_RULE, compile, summarise } from "@ours/kernel";
import { buildBundle, verifyBundle } from "@ours/verifier";
import { DURING_WINDOW, REPO_ROOT, makeVariantRepo, refusalFor } from "../helpers.ts";

/**
 * Adoption is an event — M-0004.
 *
 * For nine days the founding authority, three decisions and four mandates
 * carried DRAFT while being acted on, and the kernel printed AUTHORISED for
 * every one of them, because the only status check asked whether the word
 * was recognised. These tests exist so that a draft can never again read
 * as an authorisation, and so that the two are told apart in the report.
 */

async function check(variant: Parameters<typeof makeVariantRepo>[0]) {
  const root = await makeVariantRepo(variant);
  return compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
}

describe("a draft authorises nothing", () => {
  it("refuses an ADOPTED mandate under a DRAFT decision", async () => {
    const result = await check({
      decision: (d) => {
        d.status = "DRAFT";
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, ADOPTION_RULE);
    expect(why).toContain("D-0000 is DRAFT");
    expect(why).toContain("authorises no execution");
  });

  it("refuses a DRAFT mandate under an ADOPTED decision", async () => {
    const result = await check({
      mandate: (m) => {
        m.status = "DRAFT";
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, ADOPTION_RULE)).toContain("M-0000 is DRAFT");
  });

  it("refuses a chain whose founding authority is still a draft", async () => {
    const result = await check({
      authority: (a) => {
        a.status = "DRAFT";
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, ADOPTION_RULE)).toContain("FA-0.1 is DRAFT");
  });

  it("names every draft in the chain, not only the first", async () => {
    const result = await check({
      decision: (d) => {
        d.status = "DRAFT";
      },
      mandate: (m) => {
        m.status = "PROPOSED";
      },
    });
    const why = refusalFor(result.findings, ADOPTION_RULE);
    expect(why).toContain("D-0000 is DRAFT");
    expect(why).toContain("M-0000 is PROPOSED");
  });
});

describe("a prerequisite decision is waited for, not read around", () => {
  it("refuses a mandate whose prerequisite decision does not exist", async () => {
    const result = await check({
      mandate: (m) => {
        m.authority.prerequisite_decisions = ["D-9999"];
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, PREREQUISITE_RULE);
    expect(why).toContain("D-9999 does not exist");
    expect(why).toContain("waits for it");
  });

  it("refuses a mandate whose prerequisite decision is still a draft", async () => {
    const root = await makeVariantRepo({
      mandate: (m) => {
        m.authority.prerequisite_decisions = ["D-0099"];
      },
    });
    // A second decision in the variant repository, adopted in every respect
    // except the one that matters.
    const { parse, stringify } = await import("yaml");
    const base = parse(await readFile(path.join(root, "decisions/D-0000.yaml"), "utf8")) as {
      decision_id: string;
      status: string;
    };
    base.decision_id = "D-0099";
    base.status = "DRAFT";
    await writeFile(path.join(root, "decisions/D-0099.yaml"), stringify(base), "utf8");

    const result = await compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, PREREQUISITE_RULE)).toContain("D-0099 is DRAFT");
  });

  it("passes when the prerequisite is adopted, and says which", async () => {
    const root = await makeVariantRepo({
      decision: (d) => {
        d.prerequisite_decisions = ["D-0000"];
      },
    });
    const result = await compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
    const finding = result.findings.find((f) => f.rule === PREREQUISITE_RULE);
    expect(finding?.outcome).toBe("PASS");
    expect(finding?.message).toContain("D-0000 ADOPTED");
  });
});

describe("the report tells a draft from an authorisation", () => {
  it("summarises a chain refused only for adoption as VALID_AS_DRAFT", async () => {
    const result = await check({
      mandate: (m) => {
        m.status = "DRAFT";
      },
    });
    const s = summarise(result);
    expect(s.execution).toBe("VALID_AS_DRAFT");
    expect(s.waitingOn.join(" ")).toContain("M-0000 is DRAFT");
  });

  it("summarises a chain refused for anything else as REFUSED", async () => {
    const result = await check({
      mandate: (m) => {
        m.status = "DRAFT";
        m.release.production_allowed = true;
      },
    });
    expect(summarise(result).execution).toBe("REFUSED");
  });

  it("summarises the real founding chain as authorised for execution", async () => {
    const result = await compile({ root: REPO_ROOT, mandateId: "M-0000", now: DURING_WINDOW });
    expect(summarise(result).execution).toBe("AUTHORISED_FOR_EXECUTION");
  });

  it("gives every mandate in the repository one of the three states", async () => {
    const files = (await readdir(path.join(REPO_ROOT, "mandates"))).filter((f) =>
      f.endsWith(".yaml"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const mandateId = file.replace(/\.yaml$/, "");
      const result = await compile({ root: REPO_ROOT, mandateId, now: new Date("2026-09-08T12:00:00Z") });
      const s = summarise(result);
      expect(["AUTHORISED_FOR_EXECUTION", "VALID_AS_DRAFT", "REFUSED"]).toContain(s.execution);
      // A draft in the repository must read as a draft, never as authorised.
      const isDraft = result.findings.some(
        (f) => f.rule === ADOPTION_RULE && f.outcome === "REFUSED",
      );
      if (isDraft) expect(s.execution).not.toBe("AUTHORISED_FOR_EXECUTION");
    }
  });
});

describe("the verifier re-derives adoption from the bundle", () => {
  it("fails a bundle whose mandate is still a draft, and says it is valid as a draft", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    bundle!.mandate.status = "DRAFT";
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join(" ")).toContain("M-0000 is DRAFT");
    expect(outcome.lines.join(" ")).toContain("valid as a draft");
  });

  it("notes that every record is past adoption in the real founding bundle", async () => {
    const bundle = await buildBundle(REPO_ROOT, "M-0000");
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(true);
    expect(outcome.lines.join(" ")).toContain("every record is past adoption");
  });
});
