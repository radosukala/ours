import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Content digests.
 *
 * A record references its human source by path and, optionally, by digest.
 * The digest is what makes the reference a claim rather than a pointer: it
 * says "the document I was authorized against had exactly these bytes". If
 * the file later changes, the chain breaks loudly instead of silently
 * authorizing something nobody agreed to.
 */

export function digestOf(bytes: string | Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

export async function digestOfFile(root: string, relPath: string): Promise<string | null> {
  try {
    const bytes = await readFile(path.join(root, relPath));
    return digestOf(bytes);
  } catch {
    return null;
  }
}
