/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M1 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M1 (accounts), which replaces
 * the body. The shape follows SPEC §8 "Export and delete": only what its
 * owner may take, and no other person's posts or emails.
 */
import type { Db } from "./db";

type Person = { handle: string; display_name: string; since: string };

export type AccountExport = {
  exported_at: string;
  account: {
    handle: string;
    display_name: string;
    bio: string;
    email: string;
    created_at: string;
    invited_by_handle: string | null;
  };
  /** Yours, including removed ones with their reasons. */
  posts: {
    id: string;
    body: string;
    audience: "friends" | "followers";
    created_at: string;
    removed_at: string | null;
    removal_category: string | null;
    removal_reason: string | null;
  }[];
  replies: {
    id: string;
    post_id: string;
    body: string;
    created_at: string;
    removed_at: string | null;
    removal_category: string | null;
    removal_reason: string | null;
  }[];
  /** Post ids and author handles of posts you liked. */
  likes: { post_id: string; author_handle: string; created_at: string }[];
  friends: Person[];
  following: Person[];
  followers: Person[];
  blocked: { handle: string; since: string }[];
  muted: { handle: string; since: string }[];
  invites: {
    created_at: string;
    status: "waiting" | "used" | "expired" | "revoked";
    used_by_handle: string | null;
  }[];
};

export async function exportAccount(
  db: Db,
  accountId: string,
  now?: Date,
): Promise<AccountExport> {
  throw new Error("not implemented: M1");
}
