/**
 * Articles, parsed from a human source.
 *
 * The constitution, a community's charter, and a tool's specification all
 * carry their law the same way: `## Article X-NAME — what it requires`,
 * followed by a body that names the class the article is held at. The
 * machine projections list the ids; the human source is authoritative for
 * the text and the class. If an article loses its class, it is returned
 * with none, so a check can refuse rather than a page quietly hide it.
 */

export interface ParsedArticle {
  id: string;
  title: string;
  /** The classes the article declares for itself, in document order. */
  classes: string[];
}

const CLASSES = /`(ENFORCED|CHECKED|STRUCTURAL|INTERPRETED|DECLARED)`/g;

export function parseArticles(markdown: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const heading = section.slice(0, section.indexOf("\n")).trim();
    const match = heading.match(/^(?:Article\s+)?([A-Z]-[A-Z0-9-]+)\s+—\s+(.*)$/);
    if (!match) continue;
    const body = section.slice(heading.length);
    const classes = [...body.matchAll(CLASSES)].map((m) => m[1] as string);
    articles.push({
      id: match[1] as string,
      title: match[2] as string,
      classes: [...new Set(classes)],
    });
  }
  return articles;
}
