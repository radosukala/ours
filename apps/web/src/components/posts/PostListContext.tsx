"use client";

/**
 * What a list of posts (the feed, a profile) does when a post's menu
 * changes something: a deleted post leaves the list, and a muted or blocked
 * person's posts leave it at once, without reloading pages already loaded.
 * Outside a list (the post page), the menu navigates instead.
 */
import { createContext, useContext } from "react";

export type PostListHandlers = {
  onDeleted: (postId: string) => void;
  onMuted: (authorId: string) => void;
  onBlocked: (authorId: string) => void;
};

export const PostListContext = createContext<PostListHandlers | null>(null);

export function usePostList(): PostListHandlers | null {
  return useContext(PostListContext);
}
