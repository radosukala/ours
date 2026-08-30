import { mkdtemp, mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import type { Decision, FoundingAuthority, Mandate } from "@ours/schemas";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Builds a variant of the real repository in a temporary directory.
 *
 * The adversarial tests mutate the actual governing records rather than
 * hand-written stubs. A stub can drift from the documents it stands for, and
 * a denial test that passes against a stub while the real chain has changed
 * is worse than no test at all.
 */
export interface Variant {
  authority?: (a: FoundingAuthority) => void;
  decision?: (d: Decision) => void;
  mandate?: (m: Mandate) => void;
  /** Rewrite a human source file so its digest no longer matches. */
  tamper?: { path: string; append: string };
}

async function readYaml<T>(rel: string): Promise<T> {
  return parse(await readFile(path.join(REPO_ROOT, rel), "utf8")) as T;
}

export async function makeVariantRepo(variant: Variant): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ours-test-"));
  for (const dir of ["authority", "decisions", "mandates", "constitution"]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }

  const authority = await readYaml<FoundingAuthority>("authority/FOUNDING-AUTHORITY.yaml");
  const decision = await readYaml<Decision>("decisions/D-0000.yaml");
  const mandate = await readYaml<Mandate>("mandates/M-0000.yaml");

  variant.authority?.(authority);
  variant.decision?.(decision);
  variant.mandate?.(mandate);

  // The human sources travel with the machine projections; several checks
  // resolve them, and a digest check needs real bytes to hash.
  for (const rel of [
    "authority/FOUNDING-AUTHORITY.md",
    "decisions/D-0000.md",
    "mandates/M-0000.md",
    "constitution/CONSTITUTION-0.1.md",
  ]) {
    await cp(path.join(REPO_ROOT, rel), path.join(root, rel));
  }

  await writeFile(path.join(root, "authority/FOUNDING-AUTHORITY.yaml"), stringify(authority), "utf8");
  await writeFile(path.join(root, `decisions/${decision.decision_id}.yaml`), stringify(decision), "utf8");
  await writeFile(path.join(root, `mandates/${mandate.mandate_id}.yaml`), stringify(mandate), "utf8");

  if (variant.tamper) {
    const target = path.join(root, variant.tamper.path);
    await writeFile(target, (await readFile(target, "utf8")) + variant.tamper.append, "utf8");
  }

  return root;
}

/** Inside the mandate's validity window, so time never silently fails a test. */
export const DURING_WINDOW = new Date("2026-09-01T00:00:00Z");

export function refusalFor(
  findings: { rule: string; outcome: string; message: string }[],
  rule: string,
): string | null {
  const found = findings.find((f) => f.rule === rule && f.outcome === "REFUSED");
  return found ? found.message : null;
}
