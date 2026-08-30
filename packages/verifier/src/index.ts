import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Decision, FoundingAuthority, Mandate } from "@ours/schemas";

/**
 * The offline verifier.
 *
 * This package deliberately depends on nothing from the kernel. A proof that
 * can only be checked by the software that produced it is not a proof, so
 * the verifier recomputes digests and re-walks the chain from the bundle's
 * own bytes, with no repository, no account, and no network.
 *
 * If this file ever needs to import the kernel to do its job, the bundle
 * format has become inadequate and the format is what should change.
 */

export interface BundleSource {
  path: string;
  digest: string;
  text: string;
}

export interface Bundle {
  schema: "ours.bundle/v0.1";
  mandate_id: string;
  authority: FoundingAuthority;
  decision: Decision;
  mandate: Mandate;
  sources: BundleSource[];
}

export interface VerifyOutcome {
  ok: boolean;
  lines: string[];
}

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
}

export async function buildBundle(root: string, mandateId: string): Promise<Bundle | null> {
  const { parse } = await import("yaml");
  const read = async (rel: string): Promise<string | null> => {
    try {
      return await readFile(path.join(root, rel), "utf8");
    } catch {
      return null;
    }
  };

  const mandateRaw = await read(`mandates/${mandateId}.yaml`);
  if (mandateRaw === null) return null;
  const mandate = parse(mandateRaw) as Mandate;

  const decisionRaw = await read(`decisions/${mandate.authority.source_decision}.yaml`);
  if (decisionRaw === null) return null;
  const decision = parse(decisionRaw) as Decision;

  const authorityRaw = await read("authority/FOUNDING-AUTHORITY.yaml");
  if (authorityRaw === null) return null;
  const authority = parse(authorityRaw) as FoundingAuthority;

  const wanted = [
    authority.human_source?.path,
    decision.human_source?.path,
    mandate.human_source?.path,
    "constitution/CONSTITUTION-0.1.md",
  ].filter((p): p is string => typeof p === "string");

  const sources: BundleSource[] = [];
  for (const rel of [...new Set(wanted)]) {
    const text = await read(rel);
    if (text === null) continue;
    sources.push({ path: rel, digest: sha256(text), text });
  }

  return { schema: "ours.bundle/v0.1", mandate_id: mandateId, authority, decision, mandate, sources };
}

/**
 * Re-derives everything the bundle asserts, from the bundle alone.
 *
 * The checks here are a subset of the kernel's on purpose: this answers
 * "does this bundle hang together", not "should this have been authorised".
 * Independence is worth more than coverage.
 */
export function verifyBundle(bundle: Bundle): VerifyOutcome {
  const lines: string[] = [];
  let ok = true;
  const fail = (message: string) => {
    ok = false;
    lines.push(`REFUSED  ${message}`);
  };
  const note = (message: string) => lines.push(`     ok  ${message}`);

  if (bundle?.schema !== "ours.bundle/v0.1") {
    return { ok: false, lines: [`REFUSED  unknown bundle schema: ${String(bundle?.schema)}`] };
  }

  for (const source of bundle.sources) {
    const actual = sha256(source.text);
    if (actual !== source.digest) {
      fail(`${source.path} claims ${source.digest} but its embedded bytes hash to ${actual}`);
    } else {
      note(`${source.path} matches its digest`);
    }
  }

  if (bundle.mandate.mandate_id !== bundle.mandate_id) {
    fail(`bundle names ${bundle.mandate_id} but carries mandate ${bundle.mandate.mandate_id}`);
  }
  if (bundle.mandate.authority.source_decision !== bundle.decision.decision_id) {
    fail(
      `mandate cites decision ${bundle.mandate.authority.source_decision} but the bundle carries ` +
        `${bundle.decision.decision_id}`,
    );
  } else {
    note(`${bundle.mandate.mandate_id} resolves to ${bundle.decision.decision_id}`);
  }
  if (!bundle.decision.authorizes.mandate_ids.includes(bundle.mandate.mandate_id)) {
    fail(`${bundle.decision.decision_id} does not authorise ${bundle.mandate.mandate_id}`);
  }
  if (!bundle.decision.authorizes.mandate_classes.includes(bundle.mandate.class)) {
    fail(`${bundle.decision.decision_id} does not grant ${bundle.mandate.class} authority`);
  } else {
    note(`${bundle.mandate.class} authority is granted by ${bundle.decision.decision_id}`);
  }
  if (bundle.decision.authority.actor.kind !== "human") {
    fail(`${bundle.decision.decision_id} was issued by an ${bundle.decision.authority.actor.kind}`);
  } else {
    note(`authority originates with ${bundle.decision.authority.actor.id}, a human`);
  }
  if (!bundle.authority.root) {
    fail(`${bundle.authority.authority_id} does not declare itself the root source`);
  }

  if (bundle.authority.member_ownership_issued) {
    note(`member ownership is recorded as issued`);
  } else {
    note(`member ownership NOT issued — authority is ${bundle.authority.actor.id} bootstrap only`);
  }
  lines.push(
    `   note  weakest enforcement layer: ${bundle.authority.weakest_enforcement_layer}. ` +
      `Nothing in this bundle is non-bypassable.`,
  );

  return { ok, lines };
}
