/**
 * The tool's version, rules version and SHA-256, as /build shows them
 * (D-0019 §G). Written here, not read from kit/ when a page renders: the
 * public pages render per request, and the server that renders them needn't
 * carry kit/. tests/kit.test.ts fails if these differ from the file's.
 */
export const KIT_TOOL = {
  version: "0.2.1",
  rules: "0",
  sha256: "4b6f75cbbf0e595c5e248d13b782ec355147cf6deb5e68ad52b12c17fa9b5d58",
} as const;

/**
 * The one line a builder gives their coding agent (/build and the front door;
 * kit/README.md says it too). Since D-0020 §D it starts with the idea.
 */
export const AGENT_LINE = "Read https://our.one/build.md and follow it to help me bring my idea to our.one.";
