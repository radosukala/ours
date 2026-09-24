/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M3 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M3 (posts), which replaces it:
 * the ⋯ menu on a post with Report, Delete (own), Mute and Block. Its
 * Report item links to `/report?kind=post&id=<post id>`, a route M4 owns.
 */

export type PostMenuProps = {
  post: { id: string; authorId: string; authorHandle: string };
  isOwn: boolean;
};

/** Where the Report item goes (M4's route). */
export function reportHref(postId: string): string {
  return `/report?kind=post&id=${encodeURIComponent(postId)}`;
}

export function PostMenu(props: PostMenuProps): never {
  throw new Error("not implemented: M3");
}
