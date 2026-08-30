import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import type { Decision, FoundingAuthority, Mandate } from "@ours/schemas";

/**
 * Reading the records the page projects.
 *
 * Every value the page renders comes through here. Nothing is hand-written
 * into the template, because a page that keeps its own copy of the story will
 * eventually tell a different one from the records it claims to display.
 */

export interface Article {
  id: string;
  title: string;
  /** The classes the article declares for itself, in document order. */
  classes: string[];
}

export interface Records {
  authority: FoundingAuthority;
  decision: Decision;
  mandate: Mandate;
  articles: Article[];
}

async function readYaml<T>(root: string, rel: string): Promise<T> {
  return parse(await readFile(path.join(root, rel), "utf8")) as T;
}

/**
 * Pulls the articles out of the constitution's own Markdown.
 *
 * The constitution requires that no article be untagged, so the page can
 * report the tags without a second list to keep in step. If an article ever
 * loses its class, this returns it with none and the page shows that rather
 * than hiding it.
 */
export function parseArticles(markdown: string): Article[] {
  const articles: Article[] = [];
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const heading = section.slice(0, section.indexOf("\n")).trim();
    // Headings read `## Article R-NAME — what it requires`. The `Article`
    // prefix is optional so a renamed heading degrades to a missing row
    // rather than an empty table.
    const match = heading.match(/^(?:Article\s+)?(R-[A-Z0-9-]+)\s+—\s+(.*)$/);
    if (!match) continue;
    const body = section.slice(heading.length);
    const classes = [...body.matchAll(/`(ENFORCED|CHECKED|STRUCTURAL|INTERPRETED|DECLARED)`/g)].map(
      (m) => m[1] as string,
    );
    articles.push({ id: match[1] as string, title: match[2] as string, classes: [...new Set(classes)] });
  }
  return articles;
}

export async function readRecords(root: string, mandateId: string): Promise<Records> {
  const mandate = await readYaml<Mandate>(root, `mandates/${mandateId}.yaml`);
  const decision = await readYaml<Decision>(root, `decisions/${mandate.authority.source_decision}.yaml`);
  const authority = await readYaml<FoundingAuthority>(root, "authority/FOUNDING-AUTHORITY.yaml");
  const constitution = await readFile(path.join(root, "constitution/CONSTITUTION-0.1.md"), "utf8");
  return { authority, decision, mandate, articles: parseArticles(constitution) };
}
