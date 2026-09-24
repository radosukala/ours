/**
 * Addresses and labels shared by the post components, on the server and in
 * the browser.
 */

export const AUDIENCE_LABEL = {
  friends: "Friends",
  followers: "Friends & followers",
} as const;

export function postHref(id: string): string {
  return `/p/${encodeURIComponent(id)}`;
}

export function profileHref(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`;
}
