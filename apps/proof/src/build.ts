import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { compile, digestOf } from "@ours/kernel";
import { readRecords } from "./records.ts";
import { renderPage } from "./page.ts";

/**
 * Builds the Authority Trace.
 *
 * The page is produced by running the same checks the CLI runs and rendering
 * their findings, so it cannot report something the kernel did not conclude.
 * If the chain ever fails, the build fails with it: publishing a trace that
 * says everything holds, from a repository where it does not, is the one
 * outcome this whole project exists to make impossible.
 */

const MANDATE_ID = process.env["OURS_MANDATE"] ?? "M-0001";

async function main(): Promise<number> {
  const root = process.env["OURS_ROOT"] ?? process.cwd();
  const outDir = path.join(root, "apps/proof/dist");

  const result = await compile({ root, mandateId: MANDATE_ID });
  if (!result.authorized) {
    console.error(`\n  Refusing to build the trace: ${MANDATE_ID} is not authorised.\n`);
    for (const f of result.findings.filter((x) => x.outcome === "REFUSED")) {
      console.error(`  REFUSED  ${f.rule}: ${f.message}\n`);
    }
    return 1;
  }

  const records = await readRecords(root, MANDATE_ID);

  // A page that promises to list every article, and lists none, is the exact
  // drift this project exists to prevent — and it fails silently, because an
  // empty table still renders its heading. So it fails loudly here instead.
  if (records.articles.length === 0) {
    console.error(
      `\n  Refusing to build: no constitutional articles parsed from the constitution.\n` +
        `  The page would claim to list every article and show an empty table.\n`,
    );
    return 1;
  }
  const untagged = records.articles.filter((a) => a.classes.length === 0);
  if (untagged.length > 0) {
    console.error(
      `\n  Refusing to build: ${untagged.length} article(s) carry no enforcement class ` +
        `(${untagged.map((a) => a.id).join(", ")}).\n  The constitution requires that no article be untagged.\n`,
    );
    return 1;
  }

  // A build timestamp is the one value with no record behind it, so it is
  // reduced to the day rather than the millisecond: enough for a reader to
  // place the artifact, not enough to pretend it is evidence of anything.
  const builtAt = new Date().toISOString().slice(0, 10);
  const html = renderPage(records, result, builtAt);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), html, "utf8");

  const digest = digestOf(html);
  await writeFile(
    path.join(outDir, "artifact.json"),
    JSON.stringify({ mandate: MANDATE_ID, artifact: "index.html", digest, built: builtAt }, null, 2) + "\n",
    "utf8",
  );

  console.log(`\n  Authority Trace built for ${MANDATE_ID}`);
  console.log(`  ${path.relative(root, outDir)}/index.html`);
  console.log(`  digest ${digest}`);
  console.log(`\n  Not deployed. Publishing requires M-0001-RELEASE.\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  },
);
