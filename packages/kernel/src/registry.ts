import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { Decision, FoundingAuthority, Mandate } from "@ours/schemas";

/**
 * The source registry.
 *
 * Git and the filesystem are the record for Kernel 0.1. A database is not
 * introduced until a real runtime requirement needs one, and validating an
 * authority chain is not one — it is pure arithmetic over files.
 *
 * Every load returns either the record or a reason. Nothing throws, because
 * a missing decision is a refusal the reader deserves to see, not a stack
 * trace.
 */

export interface Loaded<T> {
  ok: true;
  record: T;
  raw: string;
}
export interface LoadFailed {
  ok: false;
  reason: string;
}
export type LoadResult<T> = Loaded<T> | LoadFailed;

async function loadYaml<T>(root: string, relPath: string): Promise<LoadResult<T>> {
  let raw: string;
  try {
    raw = await readFile(path.join(root, relPath), "utf8");
  } catch {
    return { ok: false, reason: `no record at ${relPath}` };
  }
  try {
    const record = parse(raw) as T;
    if (record === null || typeof record !== "object") {
      return { ok: false, reason: `${relPath} did not parse to a record` };
    }
    return { ok: true, record, raw };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `${relPath} is not valid YAML: ${detail}` };
  }
}

export function loadAuthority(root: string, id = "FOUNDING-AUTHORITY") {
  return loadYaml<FoundingAuthority>(root, `authority/${id}.yaml`);
}

export function loadDecision(root: string, id: string) {
  return loadYaml<Decision>(root, `decisions/${id}.yaml`);
}

export function loadMandate(root: string, id: string) {
  return loadYaml<Mandate>(root, `mandates/${id}.yaml`);
}
