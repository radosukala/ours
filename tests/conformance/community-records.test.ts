import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { admit, checkContract, compile, digestOfFile, loadToolSpec, summarise } from "@ours/kernel";
import type { Pin } from "@ours/schemas";
import { REPO_ROOT, refusalFor } from "../helpers.ts";

/**
 * The gate for community records — M-0006.
 *
 * A fictional community's root, copied and mutated, so that every refusal
 * is asserted against the real fixture rather than a stub: a vote below
 * its threshold, an actor without standing, a mandate citing a charter
 * that does not exist, a builder widening its contract, a transition
 * requirement weakened, a pinned file drifted, an implementation reaching
 * past its contract. Each asserts the article and the message.
 */

const FIXTURE = path.join(REPO_ROOT, "communities/dilna-fixture");
const APPS = path.join(REPO_ROOT, "tests/fixtures/apps");
const NOW = new Date("2026-09-08T12:00:00Z");

async function fixtureCopy(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ours-fixture-"));
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

async function editYaml<T>(root: string, rel: string, mutate: (record: T) => void): Promise<void> {
  const file = path.join(root, rel);
  const record = parse(await readFile(file, "utf8")) as T;
  mutate(record);
  await writeFile(file, stringify(record), "utf8");
}

/** Re-issues the pin over the files as they now are, as an amending decision would. */
async function repin(root: string): Promise<void> {
  const file = path.join(root, "PIN.yaml");
  const pin = parse(await readFile(file, "utf8")) as Pin;
  for (const entry of pin.files) {
    entry.digest = (await digestOfFile(root, entry.path)) ?? entry.digest;
  }
  await writeFile(file, stringify(pin), "utf8");
}

function check(root: string, contractSourceDir?: string) {
  return compile({
    root,
    mandateId: "M-1",
    now: NOW,
    ...(contractSourceDir !== undefined ? { contractSourceDir } : {}),
  });
}

describe("the fixture community's chain", () => {
  it("validates, and is authorised for execution", async () => {
    const result = await check(FIXTURE);
    expect(result.findings.filter((f) => f.outcome === "REFUSED")).toEqual([]);
    expect(summarise(result).execution).toBe("AUTHORISED_FOR_EXECUTION");
  });

  it("checks the vote behind the decision against the charter's procedure", async () => {
    const result = await check(FIXTURE);
    const procedure = result.findings.find((f) => f.rule === "C-DECISIONS");
    expect(procedure?.outcome).toBe("PASS");
    expect(procedure?.message).toContain("12 for, 2 against, 1 abstaining");
    expect(procedure?.message).toContain("majority-of-respondents met");
    expect(procedure?.message).toContain("Dissent preserved");
  });

  it("reads the charter as the root authority, with its articles classed", async () => {
    const result = await check(FIXTURE);
    expect(result.findings.find((f) => f.rule === "S-CHARTER-ARTICLES")?.outcome).toBe("PASS");
    expect(result.findings.find((f) => f.rule === "S-CHARTER-NAMED")?.outcome).toBe("PASS");
    expect(result.findings.find((f) => f.rule === "R-SOURCE-HIERARCHY")?.message).toContain("C-DILNA-0.1");
  });

  it("holds the pinned specification and every article's test", async () => {
    const result = await check(FIXTURE);
    expect(result.findings.find((f) => f.rule === "S-PIN")?.outcome).toBe("PASS");
    expect(result.findings.find((f) => f.rule === "S-ARTICLE-TEST")?.outcome).toBe("PASS");
    expect(result.findings.find((f) => f.rule === "S-OPTION-PROVENANCE")?.outcome).toBe("PASS");
  });

  it("gives the institution's own root no community findings, because there is nothing to check", async () => {
    const result = await compile({ root: REPO_ROOT, mandateId: "M-0000", now: NOW });
    expect(result.findings.filter((f) => /^[SC]-/.test(f.rule))).toEqual([]);
  });
});

describe("a vote below its threshold decides nothing", () => {
  it("refuses a majority decision whose tally falls short", async () => {
    const root = await fixtureCopy();
    await editYaml<{ tally: { for: number; against: number; abstain: number } }>(root, "votes/V-3.yaml", (v) => {
      v.tally = { for: 7, against: 8, abstain: 0 };
    });
    const result = await check(root);
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "C-DECISIONS");
    expect(why).toContain("below its threshold");
    expect(why).toContain("7 for, 8 against");
  });

  it("refuses a tally that does not add up, or exceeds the members", async () => {
    const root = await fixtureCopy();
    await editYaml<{ ballots_cast: number }>(root, "votes/V-3.yaml", (v) => {
      v.ballots_cast = 30;
    });
    const result = await check(root);
    const why = refusalFor(result.findings, "C-DECISIONS");
    expect(why).toContain("does not equal");
    expect(why).toContain("30 ballots were cast by 23 eligible");
  });

  it("refuses a decision that names no vote at all", async () => {
    const root = await fixtureCopy();
    await editYaml<{ vote?: string }>(root, "decisions/D-3.yaml", (d) => {
      delete d.vote;
    });
    const result = await check(root);
    expect(refusalFor(result.findings, "C-DECISIONS")).toContain("names no vote");
  });
});

describe("an actor without standing decides nothing", () => {
  it("refuses a vote-procedure decision not made by the members", async () => {
    const root = await fixtureCopy();
    await editYaml<{ authority: { actor: { id: string } } }>(root, "decisions/D-3.yaml", (d) => {
      d.authority.actor.id = "tomas";
    });
    const result = await check(root);
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "C-PARTICIPATION");
    expect(why).toContain("tomas");
    expect(why).toContain("An actor without standing decides nothing");
  });

  it("refuses a delegated decision by someone who does not hold the role", async () => {
    const root = await fixtureCopy();
    await editYaml<{ class: string; authority: { actor: { id: string; role: string } } }>(
      root,
      "decisions/D-3.yaml",
      (d) => {
        d.class = "OPERATIONAL";
        d.authority.actor = { id: "tomas", role: "coordinator" } as typeof d.authority.actor;
      },
    );
    const result = await check(root);
    const why = refusalFor(result.findings, "C-PARTICIPATION");
    expect(why).toContain("standing names marta");
  });
});

describe("a mandate cannot cite a charter that does not govern its root", () => {
  it("refuses a charter version that does not exist here", async () => {
    const root = await fixtureCopy();
    await editYaml<{ institution: { charter_version: string } }>(root, "mandates/M-1.yaml", (m) => {
      m.institution.charter_version = "dilna-fixture/9.9";
    });
    const result = await check(root);
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "S-CHARTER-NAMED");
    expect(why).toContain("dilna-fixture/9.9");
    expect(why).toContain("does not exist here");
  });
});

describe("the implementer cannot change the rules it is judged by", () => {
  it("refuses a contract widened after the pin", async () => {
    const root = await fixtureCopy();
    await editYaml<{ contract: { reads: { class: string; fields: string[]; article: string }[] } }>(
      root,
      "tool/booking.yaml",
      (t) => {
        t.contract.reads.push({ class: "payments", fields: ["amount"], article: "T-FAIR-ACCESS" });
      },
    );
    const result = await check(root);
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "S-PIN");
    expect(why).toContain("tool/booking.yaml changed after D-4 pinned it");
    expect(why).toContain("without an amending decision");
  });

  it("refuses a transition requirement weakened after the pin", async () => {
    const root = await fixtureCopy();
    await editYaml<{ transition: { requirement: string }[] }>(root, "tool/booking.yaml", (t) => {
      t.transition[0]!.requirement = "bookings may be dropped if inconvenient";
    });
    const result = await check(root);
    expect(refusalFor(result.findings, "S-PIN")).toContain("tool/booking.yaml changed");
  });

  it("refuses a charter edited after the pin", async () => {
    const root = await fixtureCopy();
    const charter = path.join(root, "authority/CHARTER.md");
    await writeFile(charter, (await readFile(charter, "utf8")) + "\n\nThe coordinator may sell the tool.\n", "utf8");
    const result = await check(root);
    expect(refusalFor(result.findings, "S-PIN")).toContain("authority/CHARTER.md changed");
  });

  it("refuses a pin by a decision that does not exist", async () => {
    const root = await fixtureCopy();
    await editYaml<Pin>(root, "PIN.yaml", (p) => {
      p.pinned_by = "D-99";
    });
    const result = await check(root);
    expect(refusalFor(result.findings, "S-PIN")).toContain("D-99");
  });

  it("reports an absent pin as open, never as a pass", async () => {
    const root = await fixtureCopy();
    await writeFile(path.join(root, "PIN.yaml"), "", "utf8");
    const result = await check(root);
    const pin = result.findings.find((f) => f.rule === "S-PIN");
    expect(pin?.outcome).toBe("NOT_MACHINE_DECIDABLE");
    expect(pin?.message).toContain("not a pass");
  });
});

describe("an article without a test is a wish", () => {
  it("refuses a specification article that names no test, once legitimately re-pinned", async () => {
    const root = await fixtureCopy();
    await editYaml<{ articles: { tests: string[] }[] }>(root, "tool/booking.yaml", (t) => {
      t.articles[0]!.tests = [];
    });
    await repin(root);
    const result = await check(root);
    expect(result.findings.find((f) => f.rule === "S-PIN")?.outcome).toBe("PASS");
    const why = refusalFor(result.findings, "S-ARTICLE-TEST");
    expect(why).toContain("T-FAIR-ACCESS names no test");
  });

  it("refuses a test that holds no article", async () => {
    const root = await fixtureCopy();
    await editYaml<{ tests: { holds: string }[] }>(root, "tool/booking.yaml", (t) => {
      t.tests[0]!.holds = "T-NOTHING";
    });
    await repin(root);
    expect(refusalFor((await check(root)).findings, "S-ARTICLE-TEST")).toContain("T-NOTHING");
  });

  it("refuses a floor option marked overridable, and an option without an adopted decision", async () => {
    const root = await fixtureCopy();
    await editYaml<{ options: { option_id: string; person_may_override: boolean; provenance: { decision: string } }[] }>(
      root,
      "tool/booking.yaml",
      (t) => {
        t.options[0]!.person_may_override = true;
        t.options[1]!.provenance.decision = "D-77";
      },
    );
    await repin(root);
    const why = refusalFor((await check(root)).findings, "S-OPTION-PROVENANCE");
    expect(why).toContain("booking.one_slot_per_day is FLOOR and marked overridable");
    expect(why).toContain("D-77, which does not exist");
  });
});

describe("the static contract check", () => {
  it("passes an implementation that stays inside its contract, and says so statically", async () => {
    const result = await check(FIXTURE, path.join(APPS, "booking-ok"));
    const contract = result.findings.find((f) => f.rule === "S-CONTRACT-DECLARED");
    expect(contract?.outcome).toBe("PASS");
    expect(contract?.message).toContain("runtime confinement is a later mandate's");
    expect(result.authorized).toBe(true);
  });

  it("refuses an implementation reaching an undeclared class and an undeclared field", async () => {
    const result = await check(FIXTURE, path.join(APPS, "booking-overreach"));
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "S-CONTRACT-DECLARED");
    expect(why).toContain('layer.read("payments") reaches class payments');
    expect(why).toContain("field(s) email beyond the contract");
    expect(why).toContain("article T-PRIVATE");
  });

  it("refuses an undeclared field disclosed to an allowed origin", async () => {
    const result = await check(FIXTURE, path.join(APPS, "booking-leak"));
    const why = refusalFor(result.findings, "S-CONTRACT-DECLARED");
    expect(why).toContain("sends field(s) member");
    expect(why).toContain("even though the origin is allowed");
  });

  it("refuses an implementation that reaches around the client, and an undecidable class", async () => {
    const result = await check(FIXTURE, path.join(APPS, "booking-raw"));
    const why = refusalFor(result.findings, "S-CONTRACT-DECLARED");
    expect(why).toContain("imports node:fs/promises");
    expect(why).toContain("calls fetch()");
    expect(why).toContain("undecidable statically, so refused");
  });

  it("reports an empty source tree as open, never as a pass", async () => {
    const tool = await loadToolSpec(FIXTURE, "booking");
    expect(tool.ok).toBe(true);
    const empty = await mkdtemp(path.join(tmpdir(), "ours-empty-"));
    const finding = await checkContract((tool as { record: Parameters<typeof checkContract>[0] }).record, empty);
    expect(finding.outcome).toBe("NOT_MACHINE_DECIDABLE");
    expect(finding.message).toContain("not a pass");
  });
});

describe("the gate for a tool on its own", () => {
  it("passes the fixture's specification with a conforming implementation", async () => {
    const result = await admit({ root: FIXTURE, toolId: "booking", sourceDir: path.join(APPS, "booking-ok") });
    expect(result.authorized).toBe(true);
    expect(result.findings.map((f) => f.rule).sort()).toEqual(
      ["S-ARTICLE-TEST", "S-CONTRACT-DECLARED", "S-OPTION-PROVENANCE", "S-PIN"].sort(),
    );
  });

  it("refuses the same specification with a leaking implementation", async () => {
    const result = await admit({ root: FIXTURE, toolId: "booking", sourceDir: path.join(APPS, "booking-leak") });
    expect(result.authorized).toBe(false);
  });

  it("refuses a root that is not a community's", async () => {
    const result = await admit({ root: REPO_ROOT, toolId: "booking" });
    expect(result.authorized).toBe(false);
    expect(refusalFor(result.findings, "S-CHARTER-NAMED")).toContain("not a community root");
  });
});

describe("a community's bundle verifies offline, and says it is a sample", () => {
  it("exports the fixture's chain and re-derives it with no repository", async () => {
    const { buildBundle, verifyBundle } = await import("@ours/verifier");
    const bundle = await buildBundle(FIXTURE, "M-1");
    expect(bundle).not.toBeNull();
    const outcome = verifyBundle(bundle!);
    expect(outcome.ok).toBe(true);
    const text = outcome.lines.join(" ");
    expect(text).toContain("M-1 resolves to D-3");
    expect(text).toContain("every record is past adoption");
    expect(text).toContain("FICTIONAL COMMUNITY");
  });

  it("finds no prohibited ownership claim in the fixture's public text", async () => {
    const mds: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith(".md")) mds.push(path.relative(FIXTURE, full));
      }
    };
    await walk(FIXTURE);
    const result = await compile({ root: FIXTURE, mandateId: "M-1", now: NOW, publicTextPaths: mds });
    const scan = result.findings.find((f) => f.rule === "R-NO-FICTIONAL-OWNERSHIP");
    expect(scan?.outcome).toBe("PASS");
    expect(scan?.message).toContain(`${mds.length} public file(s)`);
  });
});

describe("the fixture says it is fictional on every record", () => {
  it("marks every machine record fictional and every human source FICTIONAL", async () => {
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push(full);
      }
    };
    await walk(FIXTURE);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      if (file.endsWith(".yaml")) {
        const record = parse(text) as { fictional?: boolean };
        expect(record.fictional, `${path.relative(FIXTURE, file)} is not marked fictional`).toBe(true);
      } else if (file.endsWith(".md")) {
        expect(text, `${path.relative(FIXTURE, file)} lacks the FICTIONAL label`).toContain("FICTIONAL");
      }
    }
  });
});
