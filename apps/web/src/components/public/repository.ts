/**
 * Links into the public repository, built from the foundation's
 * OPEN_CODE_URL (…/tree/<branch>/apps/web), so the repository's address is
 * written in one place.
 */
import { OPEN_CODE_URL } from "@/components/RightColumn";

const TREE = /^(https:\/\/[^/]+\/[^/]+\/[^/]+)\/tree\/([^/]+)\/apps\/web\/?$/;

/**
 * The web address of a file (or, with `folder`, a directory) at a path
 * relative to the repository root. Falls back to the open-code link if the
 * address ever stops having the expected shape.
 */
export function repositoryUrl(path: string, folder = false): string {
  const match = TREE.exec(OPEN_CODE_URL);
  if (!match) return OPEN_CODE_URL;
  const [, repo, branch] = match;
  const clean = path.replace(/^\/+/, "");
  return `${repo}/${folder ? "tree" : "blob"}/${branch}/${clean}`;
}
