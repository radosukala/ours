import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { admit, compile, digestOfFile } from "@ours/kernel";
import type { Pin } from "@ours/schemas";
import { REPO_ROOT, refusalFor } from "../helpers.ts";

/**
 * The independent verification of M-0006 — receipts/conformance/
 * 2026-09-08-M-0006.verification.md — found sixteen mutations the gate
 * accepted and should have refused, and refusals the specification listed
 * that no test exercised. Every one is here, by its number in that report,
 * so that the gate cannot quietly reopen.
 */

const FIXTURE = path.join(REPO_ROOT, "communities/dilna-fixture");
const NOW = new Date("2026-09-08T12:00:00Z");

async function fixtureCopy(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ours-verify-"));
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

async function editYaml<T>(root: string, rel: string, mutate: (record: T) => void): Promise<void> {
  const file = path.join(root, rel);
  const record = parse(await readFile(file, "utf8")) as T;
  mutate(record);
  await writeFile(file, stringify(record), "utf8");
}

/** Re-issues the pin over the files as they now are — as an amending decision would. */
async function repin(root: string, by?: string): Promise<void> {
  const file = path.join(root, "PIN.yaml");
  const pin = parse(await readFile(file, "utf8")) as Pin;
  if (by !== undefined) pin.pinned_by = by;
  for (const entry of pin.files) entry.digest = (await digestOfFile(root, entry.path)) ?? entry.digest;
  await writeFile(file, stringify(pin), "utf8");
}

/** A source tree from a map of relative paths to contents. */
async function sourceTree(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ours-src-"));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text, "utf8");
  }
  return dir;
}

const DECLARE = `declare const layer: {
  read(cls: string, fields?: string[]): Promise<Record<string, unknown>[]>;
  write(cls: string, record: Record<string, unknown>): Promise<void>;
  disclose(origin: string, fields: string[]): Promise<void>;
};
`;

function check(root: string, contractSourceDir?: string) {
  return compile({
    root,
    mandateId: "M-1",
    now: NOW,
    ...(contractSourceDir !== undefined ? { contractSourceDir } : {}),
  });
}

async function contractRefusal(files: Record<string, string>): Promise<string> {
  const dir = await sourceTree(files);
  const result = await check(FIXTURE, dir);
  const why = refusalFor(result.findings, "S-CONTRACT-DECLARED");
  expect(why, `expected S-CONTRACT-DECLARED to refuse: ${Object.keys(files).join(", ")}`).not.toBeNull();
  return why as string;
}

describe("records — the verification's F-items", () => {
  it("F8: refuses a tally with a negative component, however well it adds up", async () => {
    const root = await fixtureCopy();
    await editYaml<{ tally: Record<string, number> }>(root, "votes/V-3.yaml", (v) => {
      v.tally = { for: 20, against: -5, abstain: 0 };
    });
    const why = refusalFor((await check(root)).findings, "C-DECISIONS");
    expect(why).toContain("against is -5, not a non-negative integer");
  });

  it("F13: checks the charter's own adoption vote, and every other decision in the root", async () => {
    const root = await fixtureCopy();
    await editYaml<{ tally: Record<string, number> }>(root, "votes/V-1.yaml", (v) => {
      v.tally = { for: 10, against: 8, abstain: 1 };
    });
    const result = await check(root);
    expect(result.authorized).toBe(false);
    const why = refusalFor(result.findings, "C-DECISIONS/root");
    expect(why).toContain("D-1 needed 16 of 23 members and got 10 for");
    expect(result.findings.find((f) => f.rule === "C-DECISIONS")?.outcome).toBe("PASS");
  });

  it("S-CHARTER-ADOPTED: refuses a charter that names no adopting decision, or a wrong one", async () => {
    const root = await fixtureCopy();
    await editYaml<{ adopted_by?: string }>(root, "authority/CHARTER.yaml", (c) => {
      delete c.adopted_by;
    });
    await repin(root);
    expect(refusalFor((await check(root)).findings, "S-CHARTER-ADOPTED")).toContain("names no adopting decision");

    const root2 = await fixtureCopy();
    await editYaml<{ adopted_by?: string }>(root2, "authority/CHARTER.yaml", (c) => {
      c.adopted_by = "D-2";
    });
    await repin(root2);
    expect(refusalFor((await check(root2)).findings, "S-CHARTER-ADOPTED")).toContain("D-2 adopted the charter but is a PRODUCT_MANDATE decision");
  });

  it("F12c: refuses a decision granting a mandate class the charter withholds", async () => {
    const root = await fixtureCopy();
    await editYaml<{ authorizes: { mandate_classes: string[] } }>(root, "decisions/D-3.yaml", (d) => {
      d.authorizes.mandate_classes = ["BUILD", "DEPLOY"];
    });
    const why = refusalFor((await check(root)).findings, "S-CHARTER-GRANTS");
    expect(why).toContain("D-3 grants DEPLOY");
    expect(why).toContain("only BUILD, OPERATE");
  });

  it("F14: refuses a re-pin by an adopted decision that does not record that it pins", async () => {
    const root = await fixtureCopy();
    await editYaml<{ contract: { reads: unknown[] } }>(root, "tool/booking.yaml", (t) => {
      t.contract.reads.push({ class: "payments", fields: ["amount", "card"], article: "T-FAIR-ACCESS" });
    });
    await repin(root, "D-2");
    const result = await check(root);
    const why = refusalFor(result.findings, "S-PIN");
    expect(why).toContain("D-2, which does not record that it pins a specification");
    const admitted = await admit({ root, toolId: "booking" });
    expect(admitted.authorized).toBe(false);
  });

  it("F15: refuses a specification whose own record is a draft, in check and in admit", async () => {
    const root = await fixtureCopy();
    await editYaml<{ status: string }>(root, "tool/booking.yaml", (t) => {
      t.status = "DRAFT";
    });
    await repin(root);
    expect(refusalFor((await check(root)).findings, "S-TOOL-NAMED")).toContain("booking is DRAFT");
    const admitted = await admit({ root, toolId: "booking" });
    expect(admitted.authorized).toBe(false);
    expect(refusalFor(admitted.findings, "S-TOOL-NAMED")).toContain("A draft specification admits nothing");
  });

  it("F16: admit refuses a tool under a draft charter", async () => {
    const root = await fixtureCopy();
    await editYaml<{ status: string }>(root, "authority/CHARTER.yaml", (c) => {
      c.status = "DRAFT";
    });
    await repin(root);
    const admitted = await admit({ root, toolId: "booking" });
    expect(admitted.authorized).toBe(false);
    expect(refusalFor(admitted.findings, "S-CHARTER-NAMED")).toContain("A draft charter admits nothing");
  });

  it("F17: refuses a pin that names another community", async () => {
    const root = await fixtureCopy();
    await editYaml<Pin>(root, "PIN.yaml", (p) => {
      p.cell = "other-cell";
    });
    expect(refusalFor((await check(root)).findings, "S-PIN")).toContain("belongs to other-cell");
  });

  it("F19: refuses a vote whose record says dissent was not preserved", async () => {
    const root = await fixtureCopy();
    await editYaml<{ dissent_preserved: boolean }>(root, "votes/V-3.yaml", (v) => {
      v.dissent_preserved = false;
    });
    expect(refusalFor((await check(root)).findings, "C-DECISIONS")).toContain("dissent was not preserved");
  });

  it("F9: compares standing only when its record could have been the count the vote used", async () => {
    // Standing dated after the vote closed: the vote's own count stands, and the finding says so.
    const later = await fixtureCopy();
    await editYaml<{ as_of: string; count: number }>(later, "standing.yaml", (s) => {
      s.as_of = "2026-09-07";
      s.count = 30;
    });
    const grown = (await check(later)).findings.find((f) => f.rule === "C-DECISIONS");
    expect(grown?.outcome).toBe("PASS");
    expect(grown?.message).toContain("postdates the vote");
    // Standing dated before the vote closed, with a different count: refused.
    const earlier = await fixtureCopy();
    await editYaml<{ as_of: string; count: number }>(earlier, "standing.yaml", (s) => {
      s.as_of = "2026-08-01";
      s.count = 30;
    });
    expect(refusalFor((await check(earlier)).findings, "C-DECISIONS")).toContain("standing as of 2026-08-01 counted 30");
  });

  it("F3: counts a majority of those voting for or against, abstentions recorded and not deciding — as the amended charter says", async () => {
    const root = await fixtureCopy();
    await editYaml<{ tally: Record<string, number> }>(root, "votes/V-3.yaml", (v) => {
      v.tally = { for: 7, against: 0, abstain: 8 };
    });
    const finding = (await check(root)).findings.find((f) => f.rule === "C-DECISIONS");
    expect(finding?.outcome).toBe("PASS");
    expect(finding?.message).toContain("voting for or against");
  });
});

describe("records — refusals the specification lists, now tested", () => {
  it("refuses a procedure the kernel does not know, rather than guessing", async () => {
    const root = await fixtureCopy();
    await editYaml<{ procedures: Record<string, string> }>(root, "authority/CHARTER.yaml", (c) => {
      c.procedures["PRODUCT_MANDATE"] = "consensus";
    });
    await editYaml<{ procedure: string }>(root, "votes/V-3.yaml", (v) => {
      v.procedure = "consensus";
    });
    await repin(root);
    expect(refusalFor((await check(root)).findings, "C-DECISIONS")).toContain("Refused rather than guessed");
  });

  it("refuses a vote that belongs to another decision, and one of another community", async () => {
    const other = await fixtureCopy();
    await editYaml<{ decision_id: string }>(other, "votes/V-3.yaml", (v) => {
      v.decision_id = "D-2";
    });
    expect(refusalFor((await check(other)).findings, "C-DECISIONS")).toContain("belongs to D-2, not D-3");
    const elsewhere = await fixtureCopy();
    await editYaml<{ cell: string }>(elsewhere, "votes/V-3.yaml", (v) => {
      v.cell = "jiny-spolek";
    });
    expect(refusalFor((await check(elsewhere)).findings, "C-DECISIONS")).toContain("is a vote of jiny-spolek");
  });

  it("refuses a pin by a draft decision", async () => {
    const root = await fixtureCopy();
    const d3 = parse(await readFile(path.join(root, "decisions/D-3.yaml"), "utf8")) as { decision_id: string; status: string };
    d3.decision_id = "D-9";
    d3.status = "DRAFT";
    await writeFile(path.join(root, "decisions/D-9.yaml"), stringify(d3), "utf8");
    await repin(root, "D-9");
    expect(refusalFor((await check(root)).findings, "S-PIN")).toContain("D-9, which is DRAFT");
  });

  it("refuses an option default outside its values, a duplicate option, and an article naming a test that does not exist", async () => {
    const root = await fixtureCopy();
    await editYaml<{ options: { option_id: string; default: string }[]; articles: { tests: string[] }[] }>(
      root,
      "tool/booking.yaml",
      (t) => {
        t.options[1]!.default = "3h";
        t.options.push({ ...t.options[2]! });
        t.articles[2]!.tests = ["t-quiet-1", "t-ghost"];
      },
    );
    await repin(root);
    const result = await check(root);
    const options = refusalFor(result.findings, "S-OPTION-PROVENANCE");
    expect(options).toContain("booking.cancel_window has default 3h, which is not among its values");
    expect(options).toContain("booking.reminders appears twice");
    expect(refusalFor(result.findings, "S-ARTICLE-TEST")).toContain("T-QUIET names test t-ghost, which does not exist");
  });

  it("reports the contract as open, not passed, when no source is supplied", async () => {
    const finding = (await check(FIXTURE)).findings.find((f) => f.rule === "S-CONTRACT-DECLARED");
    expect(finding?.outcome).toBe("NOT_MACHINE_DECIDABLE");
    expect(finding?.message).toContain("not checked against any code");
  });
});

describe("implementations — the verification's S-items", () => {
  it("S1: refuses the client aliased", async () => {
    const why = await contractRefusal({ "index.ts": DECLARE + `export async function f() { const l = layer; return l.read("payments", ["amount"]); }\n` });
    expect(why).toContain("references layer other than as layer.read/write/disclose");
  });

  it("S2: refuses bracket access to the client", async () => {
    const why = await contractRefusal({ "index.ts": DECLARE + `export async function f() { return layer["read"]("payments", ["amount"]); }\n` });
    expect(why).toContain("references layer other than as");
  });

  it("S11: refuses the client destructured or parenthesised", async () => {
    const why = await contractRefusal({
      "index.ts": DECLARE + `export async function f() { const { read } = layer; await (layer).read("payments", ["amount"]); return read("payments", ["amount"]); }\n`,
    });
    expect(why).toContain("references layer other than as");
    expect(why).toContain("calls read() bare");
  });

  it("refuses a reserved client method on another receiver", async () => {
    const why = await contractRefusal({ "index.ts": `declare const db: { read(c: string, f: string[]): Promise<unknown> };\nexport async function f() { return db.read("payments", ["amount"]); }\n` });
    expect(why).toContain("calls .read() on something other than layer");
  });

  it("S5: refuses a dynamic import", async () => {
    const why = await contractRefusal({ "index.ts": `export async function f() { const fs = await import("node:fs"); return fs; }\n` });
    expect(why).toContain("uses a dynamic import()");
  });

  it("S6: refuses a built-in by any subpath and an I/O package by any subpath", async () => {
    const why = await contractRefusal({
      "index.ts": `import { readFile } from "fs/promises";\nimport mysql from "mysql2/promise";\nexport const x = [readFile, mysql];\n`,
    });
    expect(why).toContain("imports fs/promises: a built-in module");
    expect(why).toContain("imports mysql2/promise: a package that reaches a network or a database");
  });

  it("S12: refuses createRequire and the module built-in", async () => {
    const why = await contractRefusal({
      "index.ts": `import { createRequire } from "module";\nexport const req = createRequire(import.meta.url);\n`,
    });
    expect(why).toContain("imports module: a built-in module");
    expect(why).toMatch(/(calls|references) createRequire/);
    expect(why).toContain("uses import.meta");
  });

  it("S7: reads every file the runtime could execute, not only .ts", async () => {
    const why = await contractRefusal({
      "index.ts": DECLARE + `export async function ok() { return layer.read("member", ["id", "name"]); }\n`,
      "helper.js": `export async function bad(layer) { await fetch("https://x.invalid"); return layer.read("payments", ["amount"]); }\n`,
      "other.cts": `export function alsoBad(layer: any) { return layer.read("payments", ["amount"]); }\n`,
    });
    expect(why).toContain("helper.js:");
    expect(why).toContain("other.cts:");
    expect(why).toContain("calls fetch()");
  });

  it("S8: refuses a read that names no fields", async () => {
    const why = await contractRefusal({ "index.ts": DECLARE + `export async function f() { return layer.read("member"); }\n` });
    expect(why).toContain("names no literal field list");
  });

  it("S9: refuses a write whose record is not an object literal, as the amended specification says", async () => {
    const why = await contractRefusal({ "index.ts": DECLARE + `export async function f(record: Record<string, unknown>) { await layer.write("booking", record); }\n` });
    expect(why).toContain("without a record whose keys are all literal");
  });

  it("S10: refuses fetch reached through globalThis, and an aliased fetch", async () => {
    const why = await contractRefusal({
      "index.ts": `export async function f() { await globalThis.fetch("https://x.invalid"); const g = fetch; await g("https://y.invalid"); }\n`,
    });
    expect(why).toContain("references globalThis");
    expect(why).toContain("references fetch");
  });

  it("refuses an import the contract does not declare, and allows one it does", async () => {
    const undeclared = await contractRefusal({ "index.ts": `import pad from "left-pad";\nexport const x = pad;\n` });
    expect(undeclared).toContain("imports left-pad: not the application's own file");

    const root = await fixtureCopy();
    await editYaml<{ contract: { dependencies: string[] } }>(root, "tool/booking.yaml", (t) => {
      t.contract.dependencies = ["left-pad"];
    });
    await repin(root);
    const dir = await sourceTree({ "index.ts": `import pad from "left-pad";\nimport { helper } from "./helper.ts";\nexport const x = [pad, helper];\n`, "helper.ts": `export const helper = 1;\n` });
    const result = await check(root, dir);
    const finding = result.findings.find((f) => f.rule === "S-CONTRACT-DECLARED");
    expect(finding?.outcome).toBe("PASS");
    expect(finding?.message).toContain("1 declared dependency");
    expect(finding?.message).toContain("What this does not check: what a declared dependency does inside itself");
  });

  it("still passes the conforming fixture, and says what it did and did not read", async () => {
    const result = await check(FIXTURE, path.join(REPO_ROOT, "tests/fixtures/apps/booking-ok"));
    const finding = result.findings.find((f) => f.rule === "S-CONTRACT-DECLARED");
    expect(finding?.outcome).toBe("PASS");
    expect(finding?.message).toContain("5 client call(s)");
    expect(finding?.message).toContain("the client referenced in no other form");
  });
});

describe("implementations — the re-verification's new doors", () => {
  it("refuses the walk to the Function constructor through .constructor", async () => {
    const why = await contractRefusal({ "index.ts": `export const f = ([]).constructor.constructor("return 1")();\n` });
    expect(why).toContain("reaches .constructor");
  });

  it("refuses Node's global, by name and by bracket, and Reflect", async () => {
    const why = await contractRefusal({
      "index.ts": `export async function f() { await (global as any)["fetch"]("https://x.invalid"); return Reflect.get(global as any, "fetch"); }\n`,
    });
    expect(why).toContain("references global");
    expect(why).toContain("references Reflect");
    expect(why).toContain('reaches ["fetch"]');
  });

  it("refuses a global outside the allowlist, whatever its name", async () => {
    const why = await contractRefusal({ "index.ts": `export const w = WebAssembly; export const q = SomethingNobodyDeclared;\n` });
    expect(why).toContain("references WebAssembly: a door around the client");
    expect(why).toContain("references SomethingNobodyDeclared, which the application neither declares nor imports");
  });

  it("refuses a symbolic link in the source tree, because it can point outside what is read", async () => {
    const { symlink } = await import("node:fs/promises");
    const outside = await sourceTree({ "evil.ts": `export const x = fetch;\n` });
    const dir = await sourceTree({ "index.ts": `import "./hidden/evil.ts";\n` });
    await symlink(outside, path.join(dir, "hidden"));
    const result = await check(FIXTURE, dir);
    const why = refusalFor(result.findings, "S-CONTRACT-DECLARED");
    expect(why).toContain("hidden is a symbolic link");
  });

  it("refuses top-level this in a script, a with statement, and arguments", async () => {
    const why = await contractRefusal({
      "script.js": `const g = this; with (g) { }\nfunction f() { return arguments.callee; }\nexport { f };\n`,
    });
    expect(why).toContain("uses this outside any function or class");
    expect(why).toContain("uses a with statement");
    expect(why).toContain("references arguments");
  });

  it("refuses a relative import of a native addon, and a re-export of the client under another name", async () => {
    const why = await contractRefusal({
      "index.ts": `import "./native.node";\nexport { layer as l } from "./client.ts";\n`,
      "client.ts": DECLARE + `export { layer };\n`,
    });
    expect(why).toContain("a relative import may name a source or JSON file, not .node");
    expect(why).toContain("references layer other than as");
  });

  it("refuses the prototype walk from an allowed global", async () => {
    const why = await contractRefusal({ "index.ts": `export const F = Object.getPrototypeOf(function () {}).constructor;\n` });
    expect(why).toContain("reaches .constructor");
  });

  it("allows the ECMAScript built-ins, timers, and console, and passes an ordinary implementation", async () => {
    const dir = await sourceTree({
      "index.ts": DECLARE + `export async function f() {
  const now = new Date(); const n = Math.max(1, 2); const s = JSON.stringify({ n }); console.log(s, now);
  await new Promise((r) => setTimeout(r, 1)); const m = new Map<string, number>(); m.set("a", 1);
  const rows = await layer.read("machine", ["id", "name", "status"]);
  return rows.length + [...m.keys()].length + Number.parseInt("1", 10);
}
`,
    });
    const result = await check(FIXTURE, dir);
    const finding = result.findings.find((f) => f.rule === "S-CONTRACT-DECLARED");
    expect(finding?.outcome).toBe("PASS");
    expect(finding?.message).toContain("bound with no library");
  });
});
