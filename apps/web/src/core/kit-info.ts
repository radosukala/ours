/**
 * The tool's version, rules version and SHA-256, as /build shows them
 * (D-0019 §G). Written here, not read from kit/ when a page renders: the
 * public pages render per request, and the server that renders them needn't
 * carry kit/. tests/kit.test.ts fails if these differ from the file's.
 */
export const KIT_TOOL = {
  version: "0.1.0",
  rules: "0",
  sha256: "ab12bc2eb62a7d25051c8f688f6149ac0f9844d0eba61ba0bdc82cf4ef0a7fa7",
} as const;

/** The one line a builder gives their coding agent (/build; kit/README.md says it too). */
export const AGENT_LINE = "Read https://our.one/build.md and use it to build my app for our.one.";
