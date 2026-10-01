/**
 * What our.one is: the words the front page and the invite page share
 * (D-0016 §A and §I; SPEC §18.16 items 1.2 and 7).
 *
 * A module of its own, so the invite page can show them without importing
 * the front page: FrontPage.tsx holds listed handover sentences, and only
 * its route may import it (the re-check of M-0011).
 */
export const LEDE =
  "A social network for your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can get on with your day.";
