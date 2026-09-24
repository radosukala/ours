/**
 * Where a Report item goes (SPEC §8): `/report?kind=<post|reply|account>&id=<id>`.
 * For an account, `id` is the account id. Posts, replies and profiles link
 * here from their menus.
 */
export type ReportKind = "post" | "reply" | "account";

export function reportLink(kind: ReportKind, id: string): string {
  return `/report?kind=${kind}&id=${encodeURIComponent(id)}`;
}
