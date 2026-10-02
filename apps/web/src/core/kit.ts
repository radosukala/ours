/**
 * The build kit's files (D-0019 §B, M-0016), read from `kit/` at the
 * repository's root, so what the site serves is the file in the commit that
 * was built, byte for byte.
 *
 * The routes that serve them are static: they read the files once, when the
 * site is built, from the folder the build runs in (apps/web). The public
 * pages render per request, so /build doesn't read the tool at all: it shows
 * the version and the SHA-256 from `kit-info.ts`, which a test keeps equal to
 * the file's.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** kit/, from the folder the site is built in. */
export const KIT_DIR = join(process.cwd(), "..", "..", "kit");

/** The files the site serves, with their content types. Nothing else in kit/ is served. */
export const KIT_FILES = {
  "build.md": "text/markdown; charset=utf-8",
  "our-one.mjs": "text/javascript; charset=utf-8",
  "our.one.schema.json": "application/schema+json; charset=utf-8",
} as const;

export type KitFileName = keyof typeof KIT_FILES;

/** The served files under /kit/: the tool and the schema (build.md is at /build.md). */
export const KIT_ROUTE_FILES: readonly KitFileName[] = ["our-one.mjs", "our.one.schema.json"];

export function isKitFile(name: string): name is KitFileName {
  return Object.prototype.hasOwnProperty.call(KIT_FILES, name);
}

/** A kit file's bytes. */
export function kitBytes(name: KitFileName): Buffer {
  return readFileSync(join(KIT_DIR, name));
}

/** The response that serves a kit file: its bytes and its content type, cached like any static file. */
export function kitResponse(name: KitFileName): Response {
  return new Response(new Uint8Array(kitBytes(name)), {
    headers: {
      "Content-Type": KIT_FILES[name],
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

/** The tool's version, rules version and SHA-256, read from the file itself. */
export function kitToolFromFile(): { version: string; rules: string; sha256: string } {
  const bytes = kitBytes("our-one.mjs");
  const source = bytes.toString("utf8");
  const version = /export const VERSION = "([^"]+)";/.exec(source)?.[1];
  const rules = /export const RULES_VERSION = "([^"]+)";/.exec(source)?.[1];
  if (!version || !rules) throw new Error("kit/our-one.mjs: VERSION or RULES_VERSION not found");
  return { version, rules, sha256: createHash("sha256").update(bytes).digest("hex") };
}
