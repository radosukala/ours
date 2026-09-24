/**
 * The claims scan as a command (SPEC §12).
 *
 *   pnpm --filter @ours/web claims
 *
 * Reads every public text file SPEC §12 names, prints each prohibited claim
 * it finds, and exits 1 if there is any. The same scan runs in
 * tests/claims.test.ts.
 *
 * It is CHECKED, not ENFORCED: a pattern cannot read polarity, so a hit is
 * something for a person to read, and a pass is not proof that no claim
 * was made in other words.
 */
import { fileURLToPath } from "node:url";
import { ALLOWLIST, formatHit, scanRepoPublicText } from "../src/core/claims";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

function main(): void {
  const { files, hits } = scanRepoPublicText(WEB_ROOT);
  if (hits.length > 0) {
    console.error(`Claims scan: ${hits.length} prohibited claim(s) in ${files.length} files.`);
    for (const hit of hits) console.error(`  ${formatHit(hit)}`);
    process.exit(1);
  }
  console.log(
    `Claims scan: no prohibited claim in ${files.length} files ` +
      `(${ALLOWLIST.length} allowlisted sentence(s)). CHECKED, not ENFORCED: ` +
      `a pattern cannot read polarity.`,
  );
}

main();
