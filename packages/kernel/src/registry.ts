import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type {
  AuthorityRecord,
  Decision,
  Mandate,
  Pin,
  Standing,
  ToolSpec,
  Vote,
} from "@ours/schemas";

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

/**
 * The root of a root of records: the institution's founding authority, or
 * a community's charter. Same shape where the kernel looks, same loader,
 * no code path special to OURS's own records. The founding authority is
 * tried first so that the institution's root reads exactly as before.
 */
export async function loadAuthority(root: string, id?: string): Promise<LoadResult<AuthorityRecord>> {
  if (id !== undefined) return loadYaml<AuthorityRecord>(root, `authority/${id}.yaml`);
  const founding = await loadYaml<AuthorityRecord>(root, "authority/FOUNDING-AUTHORITY.yaml");
  if (founding.ok) return founding;
  const charter = await loadYaml<AuthorityRecord>(root, "authority/CHARTER.yaml");
  if (charter.ok) return charter;
  return { ok: false, reason: `no record at authority/FOUNDING-AUTHORITY.yaml and none at authority/CHARTER.yaml` };
}

export function loadDecision(root: string, id: string) {
  return loadYaml<Decision>(root, `decisions/${id}.yaml`);
}

export function loadMandate(root: string, id: string) {
  return loadYaml<Mandate>(root, `mandates/${id}.yaml`);
}

export function loadStanding(root: string) {
  return loadYaml<Standing>(root, "standing.yaml");
}

export function loadVote(root: string, id: string) {
  return loadYaml<Vote>(root, `votes/${id}.yaml`);
}

export function loadToolSpec(root: string, id: string) {
  return loadYaml<ToolSpec>(root, `tool/${id}.yaml`);
}

export function loadPin(root: string) {
  return loadYaml<Pin>(root, "PIN.yaml");
}

/** The ids and statuses of every decision in a root — for provenance checks. */
export async function listDecisions(root: string): Promise<Record<string, string>> {
  const { readdir } = await import("node:fs/promises");
  const out: Record<string, string> = {};
  let names: string[] = [];
  try {
    names = await readdir(path.join(root, "decisions"));
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith(".yaml")) continue;
    const loaded = await loadYaml<Decision>(root, `decisions/${name}`);
    if (loaded.ok && typeof loaded.record.decision_id === "string") {
      out[loaded.record.decision_id] = String(loaded.record.status);
    }
  }
  return out;
}
