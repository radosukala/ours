import { describe, expect, it } from "vitest";
import { compile } from "@ours/kernel";
import { DURING_WINDOW, makeVariantRepo, refusalFor } from "../helpers.ts";

/**
 * The denial suite.
 *
 * A governance product that only demonstrates its happy path proves very
 * little, so these run first in the reader's mind and should run first in
 * yours. Each case asserts two things: that the chain was refused, and that
 * it was refused for the *correct* reason. A test that only checks
 * `authorized === false` would pass even if the kernel refused everything.
 */

async function check(variant: Parameters<typeof makeVariantRepo>[0]) {
  const root = await makeVariantRepo(variant);
  return compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
}

describe("an agent cannot originate authority", () => {
  it("refuses a decision issued by an agent", async () => {
    const result = await check({
      decision: (d) => {
        d.authority.actor = { id: "claude-opus-5", kind: "agent", role: "implementer" };
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-HUMAN-AUTHORITY");
    expect(why).toContain("claude-opus-5");
    expect(why).toContain("Only a human may originate authority");
  });

  it("refuses a mandate granted by an agent", async () => {
    const result = await check({
      mandate: (m) => {
        m.authority.actor = { id: "some-agent", kind: "agent", role: "implementer" };
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-HUMAN-AUTHORITY")).toContain(
      "Authority is granted by people",
    );
  });
});

describe("a mandate cannot stand without its decision", () => {
  it("refuses a mandate citing a decision that does not exist", async () => {
    const result = await check({
      mandate: (m) => {
        m.authority.source_decision = "D-9999";
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-SOURCE-HIERARCHY");
    expect(why).toContain("D-9999");
    expect(why).toContain("cannot be authorised by a decision that does not exist");
  });

  it("refuses a mandate the decision never named", async () => {
    const result = await check({
      decision: (d) => {
        d.authorizes.mandate_ids = ["M-0042"];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-TYPED-MANDATE")).toContain("is not among them");
  });
});

describe("expired authority is not authority", () => {
  it("refuses a mandate whose window has closed", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: new Date("2027-01-01T00:00:00Z"),
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-SOURCE-HIERARCHY/window");
    expect(why).toContain("expired");
    expect(why).toContain("issue a new decision rather than extending this one");
  });

  it("refuses a mandate that outlives the decision behind it", async () => {
    const result = await check({
      mandate: (m) => {
        m.authority.expires_at = "2027-06-01T00:00:00Z";
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-SOURCE-HIERARCHY/window")).toContain(
      "cannot outlive its source",
    );
  });
});

describe("a mandate cannot widen the decision that authorised it", () => {
  it("refuses a class the decision did not grant", async () => {
    const result = await check({
      mandate: (m) => {
        m.class = "DEPLOY";
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-TYPED-MANDATE/class");
    expect(why).toContain("DEPLOY");
    expect(why).toContain("cannot widen the decision");
  });

  it("refuses a decision class the root authority does not permit", async () => {
    const result = await check({
      authority: (a) => {
        a.may_issue_decision_classes = ["OPERATIONAL"];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-SOURCE-HIERARCHY")).toContain("does not authorise");
  });
});

describe("denied stays denied", () => {
  it("refuses a change to a path the mandate itself denies", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: DURING_WINDOW,
      changedPaths: ["packages/kernel/src/index.ts", ".github/workflows/deploy.yml"],
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-SCOPE");
    expect(why).toContain(".github/workflows/deploy.yml");
    expect(why).toContain("Denied stays denied");
  });

  it("refuses a change outside the allowed scope entirely", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: DURING_WINDOW,
      changedPaths: ["constitution/CONSTITUTION-0.1.md"],
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-SCOPE")).toContain("outside the allowed scope");
  });

  it("allows a change inside the allowed scope", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({
      root,
      mandateId: "M-0000",
      now: DURING_WINDOW,
      changedPaths: ["packages/kernel/src/rules.ts", "tests/adversarial/refusals.test.ts"],
    });
    expect(result.authorized).toBe(true);
  });
});

describe("build authority cannot release", () => {
  it("refuses a BUILD mandate that permits production", async () => {
    const result = await check({
      mandate: (m) => {
        m.release.production_allowed = true;
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-BUILD-DEPLOY")).toContain(
      "a build mandate cannot publish itself",
    );
  });

  it("refuses a BUILD mandate that names a deploy target", async () => {
    const result = await check({
      mandate: (m) => {
        m.release.environments = ["production"];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-BUILD-DEPLOY")).toContain("requires DEPLOY authority");
  });
});

describe("a destructive change must name what it leaves behind", () => {
  it("refuses DESTRUCTIVE work claiming no irreversible residue", async () => {
    const result = await check({
      mandate: (m) => {
        m.risk.reversibility = "DESTRUCTIVE";
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-ROLLBACK");
    expect(why).toContain("DESTRUCTIVE");
    expect(why).toContain("dropped data, sent messages, third-party state");
  });

  it("accepts DESTRUCTIVE work that names its residue", async () => {
    const result = await check({
      mandate: (m) => {
        m.risk.reversibility = "DESTRUCTIVE";
        m.rollback.irreversible_residue =
          "The dropped ordinal column cannot be restored from the running database.";
      },
    });
    expect(result.authorized).toBe(true);
  });

  it("refuses a mandate that declares no residue at all", async () => {
    const result = await check({
      mandate: (m) => {
        m.rollback.irreversible_residue = "";
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-ROLLBACK")).toContain("declares no irreversible residue");
  });
});

describe("the document authorised must be the document on disk", () => {
  it("refuses when a recorded digest no longer matches its file", async () => {
    const root = await makeVariantRepo({
      mandate: (m) => {
        // A digest that was correct when recorded, over bytes we then change.
        m.human_source.digest = "sha256:" + "0".repeat(64);
      },
      tamper: { path: "mandates/M-0000.md", append: "\n\nAnd also deploy to production.\n" },
    });
    const result = await compile({ root, mandateId: "M-0000", now: DURING_WINDOW });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-SOURCE-HIERARCHY/digest");
    expect(why).toContain("mandates/M-0000.md");
    expect(why).toContain("not the document on disk");
  });
});

describe("a mandate is not valid merely because it parses", () => {
  it("refuses an objective too short to bound the work", async () => {
    const result = await check({
      mandate: (m) => {
        m.objective = "Make it fair and deploy.";
      },
    });
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "R-TYPED-MANDATE");
    expect(why).toContain("a wish, not a bound");
  });

  it("refuses a mandate with no acceptance test", async () => {
    const result = await check({
      mandate: (m) => {
        m.acceptance.tests = [];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-TYPED-MANDATE")).toContain(
      "authorises anything",
    );
  });

  it("refuses a scope that allows nothing", async () => {
    const result = await check({
      mandate: (m) => {
        m.scope.paths.allow = [];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-SCOPE")).toContain("authorises no work");
  });

  it("refuses a scope that contradicts itself", async () => {
    const result = await check({
      mandate: (m) => {
        m.scope.paths.deny = [...m.scope.paths.deny, "tests/**"];
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-SCOPE")).toContain("contradicts itself");
  });
});

describe("status may not be invented", () => {
  it("refuses an unrecognised evidence state", async () => {
    const result = await check({
      mandate: (m) => {
        (m as { status: string }).status = "APPROVED";
      },
    });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-TRUTHFUL-STATUS")).toContain("not a recognised state");
  });
});

describe("a missing mandate is a refusal, not a crash", () => {
  it("refuses cleanly when the mandate does not exist", async () => {
    const root = await makeVariantRepo({});
    const result = await compile({ root, mandateId: "M-4242", now: DURING_WINDOW });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "R-TYPED-MANDATE")).toContain(
      "a proposed mandate for human review rather than the work",
    );
  });
});
