import { describe, expect, it } from "vitest";
import { matchesAny, matchesPattern } from "./glob.ts";

/**
 * Scope patterns appear in a governing document, so they must behave the way
 * the person who wrote them expected. These cases are the guesses a reader
 * would make.
 */
describe("scope patterns", () => {
  it("matches a segment wildcard without crossing a slash", () => {
    expect(matchesPattern("packages/kernel/index.ts", "packages/*/index.ts")).toBe(true);
    expect(matchesPattern("packages/kernel/src/index.ts", "packages/*/index.ts")).toBe(false);
  });

  it("matches across segments with a deep wildcard", () => {
    expect(matchesPattern("packages/kernel/src/deep/file.ts", "packages/kernel/**")).toBe(true);
    expect(matchesPattern("packages/cli/src/main.ts", "packages/kernel/**")).toBe(false);
  });

  it("lets a deep wildcard match nothing at all", () => {
    expect(matchesPattern("tests/a.test.ts", "tests/**/*.test.ts")).toBe(true);
    expect(matchesPattern("tests/deep/a.test.ts", "tests/**/*.test.ts")).toBe(true);
  });

  it("does not treat a dot as a wildcard", () => {
    expect(matchesPattern("packagesXkernel/a.ts", "packages/kernel/**")).toBe(false);
    expect(matchesPattern("a-ts", "a.ts")).toBe(false);
  });

  it("reports which pattern matched, so a refusal can name it", () => {
    expect(matchesAny(".github/workflows/deploy.yml", ["apps/**", ".github/**"])).toBe(".github/**");
    expect(matchesAny("packages/kernel/src/index.ts", ["apps/**", ".github/**"])).toBeNull();
  });
});
