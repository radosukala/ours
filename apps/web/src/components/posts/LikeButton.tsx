"use client";

/**
 * The like toggle (SPEC §9): the heart fills in --like when liked, with
 * aria-pressed. The count is shown only to the post's author (`count` is
 * undefined for everyone else, because the core never sends it).
 *
 * Optimistic: the heart changes at once; if the server refuses, it goes
 * back. Clicks while a toggle is in flight are ignored, so the screen and
 * the server cannot drift apart.
 */
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { toggleLikeAction } from "./actions";

type State = { liked: boolean; count: number | undefined };

export function LikeButton({
  postId,
  liked,
  count,
}: {
  postId: string;
  liked: boolean;
  /** Only for the author. */
  count?: number;
}) {
  const [state, setState] = useState<State>({ liked, count });
  // When the server sends new values (a re-render), they win.
  const [fromServer, setFromServer] = useState<State>({ liked, count });
  if (fromServer.liked !== liked || fromServer.count !== count) {
    setFromServer({ liked, count });
    setState({ liked, count });
  }
  const [, startTransition] = useTransition();
  const busy = useRef(false);

  function toggle() {
    if (busy.current) return;
    busy.current = true;
    const before = state;
    const bump = (s: State, nowLiked: boolean): State => ({
      liked: nowLiked,
      count:
        s.count === undefined
          ? undefined
          : Math.max(0, s.count + (nowLiked === s.liked ? 0 : nowLiked ? 1 : -1)),
    });
    setState(bump(before, !before.liked));
    startTransition(async () => {
      try {
        const result = await toggleLikeAction(postId);
        setState(result.ok ? bump(before, result.liked) : before);
      } catch {
        setState(before);
      } finally {
        busy.current = false;
      }
    });
  }

  const showCount = state.count !== undefined && state.count > 0;
  return (
    <button
      type="button"
      className={`action action--like${state.liked ? " action--liked" : ""}`}
      aria-pressed={state.liked}
      aria-label={
        state.count === undefined
          ? "Like"
          : `Like, ${state.count} ${state.count === 1 ? "like" : "likes"}`
      }
      onClick={toggle}
    >
      <span className="action__icon">
        <Icon name={state.liked ? "heart-filled" : "heart"} size={18} />
      </span>
      <span className="action__count" aria-hidden="true">
        {showCount ? state.count : ""}
      </span>
    </button>
  );
}
