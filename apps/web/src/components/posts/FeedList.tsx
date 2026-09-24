"use client";

/**
 * A list of posts with "Show more" by cursor: the feed on /home (with the
 * caught-up and end markers, SPEC §7) and a person's posts on their profile.
 *
 * The first page comes from the server. Later pages are appended here. When
 * the server sends a fresh first page (after a post, a block…), a list that
 * has not loaded more simply takes it; one that has keeps what it loaded
 * and adds what is new, so nothing already on screen jumps away or goes
 * missing at a page boundary.
 *
 * A post deleted from its menu leaves the list at once; so do a blocked
 * person's posts, and (in the feed only) a muted person's.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { CaughtUpMarker, EndMarker } from "@/components/Marker";
import type { PostView } from "@/core/posts";
import { PostListContext, type PostListHandlers } from "./PostListContext";
import { PostRow } from "./PostRow";
import styles from "./posts.module.css";

export type PostPage = {
  items: PostView[];
  nextCursor: string | null;
};

export type LoadMore = (
  cursor: string,
) => Promise<({ ok: true } & PostPage) | { ok: false; error: string }>;

type Loaded = {
  items: PostView[];
  nextCursor: string | null;
  /** Whether any page after the first was appended. */
  more: boolean;
};

function newestFirst(a: PostView, b: PostView): number {
  const t = b.createdAt.getTime() - a.createdAt.getTime();
  if (t !== 0) return t;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Fresh first page + what was already loaded, without duplicates. */
function merge(loaded: Loaded, first: PostPage): Loaded {
  if (!loaded.more) return { items: first.items, nextCursor: first.nextCursor, more: false };
  const byId = new Map<string, PostView>();
  for (const item of loaded.items) byId.set(item.id, item);
  for (const item of first.items) byId.set(item.id, item);
  return {
    items: [...byId.values()].sort(newestFirst),
    nextCursor: loaded.nextCursor,
    more: true,
  };
}

export function FeedList({
  first,
  loadMore,
  markers = false,
  caughtUpBefore = null,
  hideMuted = false,
  mutedAuthors = [],
  empty,
}: {
  first: PostPage;
  loadMore: LoadMore;
  /** Show the caught-up marker and the end marker (the feed). */
  markers?: boolean;
  /** The feed's previous visit (SPEC §7), for the caught-up marker. */
  caughtUpBefore?: Date | null;
  /** A muted person's posts leave the list (the feed). */
  hideMuted?: boolean;
  /** Authors the viewer has muted, for the menu's Mute / Unmute (a profile). */
  mutedAuthors?: string[];
  /** Shown when there is nothing at all. */
  empty: { text: string; action?: { href: string; label: string } };
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({
    items: first.items,
    nextCursor: first.nextCursor,
    more: false,
  });
  const [seenFirst, setSeenFirst] = useState(first);
  if (seenFirst !== first) {
    setSeenFirst(first);
    setLoaded((current) => merge(current, first));
  }
  const [hiddenPosts, setHiddenPosts] = useState<ReadonlySet<string>>(new Set());
  const [hiddenAuthors, setHiddenAuthors] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handlers = useMemo<PostListHandlers>(
    () => ({
      onDeleted: (postId) => setHiddenPosts((s) => new Set(s).add(postId)),
      onMuted: (authorId) => {
        if (hideMuted) setHiddenAuthors((s) => new Set(s).add(authorId));
        else router.refresh();
      },
      onBlocked: (authorId) => setHiddenAuthors((s) => new Set(s).add(authorId)),
    }),
    [hideMuted, router],
  );

  const items = loaded.items.filter(
    (p) => !hiddenPosts.has(p.id) && !hiddenAuthors.has(p.author.id),
  );
  const ended = loaded.nextCursor === null;
  const markerAt =
    markers && caughtUpBefore
      ? items.findIndex((p) => p.createdAt.getTime() <= caughtUpBefore.getTime())
      : -1;

  function showMore() {
    const cursor = loaded.nextCursor;
    if (!cursor || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadMore(cursor);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLoaded((current) => {
          const known = new Set(current.items.map((p) => p.id));
          return {
            items: [...current.items, ...result.items.filter((p) => !known.has(p.id))],
            nextCursor: result.nextCursor,
            more: true,
          };
        });
      } catch {
        setError("Couldn't load more. Try again.");
      }
    });
  }

  if (items.length === 0 && ended) {
    return <EmptyState text={empty.text} action={empty.action} />;
  }

  return (
    <PostListContext.Provider value={handlers}>
      <div aria-busy={pending || undefined}>
        {items.map((item, index) => (
          <div key={item.id}>
            {index === markerAt && caughtUpBefore ? <CaughtUpMarker since={caughtUpBefore} /> : null}
            <PostRow post={item} muted={mutedAuthors.includes(item.author.id)} />
          </div>
        ))}
      </div>
      {ended ? (
        markers ? <EndMarker /> : null
      ) : (
        <div className={styles.more}>
          <Button type="button" kind="outline" size="small" disabled={pending} onClick={showMore}>
            {pending ? "Loading…" : "Show more"}
          </Button>
        </div>
      )}
      {error ? (
        <p className={styles.moreError} role="alert">
          {error}
        </p>
      ) : null}
    </PostListContext.Provider>
  );
}
