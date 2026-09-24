"use client";

/**
 * The ⋯ menu on a post (SPEC §9): on your own post, Delete (with a
 * confirmation); on someone else's, Mute, Block (with a confirmation) and
 * Report. Report goes to `/report?kind=post&id=…`, which M4 owns.
 *
 * A native <details> menu: it opens and closes without script and says
 * whether it is open. With script it also closes on Escape and on a click
 * outside.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import {
  blockPersonAction,
  deletePostAction,
  mutePersonAction,
  unmutePersonAction,
} from "./actions";
import { usePostList } from "./PostListContext";
import styles from "./posts.module.css";

export type PostMenuProps = {
  post: { id: string; authorId: string; authorHandle: string };
  isOwn: boolean;
  /** Whether the viewer has muted the author (shows Unmute). */
  muted?: boolean;
};

/** Where the Report item goes (M4's route). */
export function reportHref(postId: string): string {
  return `/report?kind=post&id=${encodeURIComponent(postId)}`;
}

/** Close a <details> menu on Escape or a click outside it. */
export function useDismissableMenu(ref: RefObject<HTMLDetailsElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && ref.current) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
  const onToggle = () => setOpen(ref.current?.open ?? false);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };
  return { onToggle, close };
}

type Confirming = null | "delete" | "block";

export function PostMenu({ post, isOwn, muted = false }: PostMenuProps) {
  const router = useRouter();
  const list = usePostList();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menu = useDismissableMenu(menuRef);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [isMuted, setIsMuted] = useState(muted);
  const [mutedFromServer, setMutedFromServer] = useState(muted);
  if (mutedFromServer !== muted) {
    setMutedFromServer(muted);
    setIsMuted(muted);
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const handle = `@${post.authorHandle}`;

  function onToggle() {
    menu.onToggle();
    setConfirming(null);
    setError(null);
  }

  function perform(
    call: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      menu.close();
      done();
    });
  }

  const onDelete = () =>
    perform(
      () => deletePostAction(post.id),
      () => (list ? list.onDeleted(post.id) : router.replace("/home")),
    );
  const onMute = () =>
    perform(
      () => mutePersonAction(post.authorId),
      () => {
        setIsMuted(true);
        if (list) list.onMuted(post.authorId);
        else router.refresh();
      },
    );
  const onUnmute = () =>
    perform(
      () => unmutePersonAction(post.authorId),
      () => {
        setIsMuted(false);
        router.refresh();
      },
    );
  const onBlock = () =>
    perform(
      () => blockPersonAction(post.authorId),
      () => (list ? list.onBlocked(post.authorId) : router.replace("/home")),
    );

  return (
    <details className="menu" ref={menuRef} onToggle={onToggle}>
      <summary className="icon-btn" aria-label="More options" title="More">
        <Icon name="dots" size={18} />
      </summary>
      <div className="menu__list">
        {confirming === "delete" ? (
          <div className={styles.confirm} role="group" aria-label="Delete post">
            <p className={styles.confirmText}>
              <strong className={styles.confirmTitle}>Delete post?</strong>
              This can&apos;t be undone. Its replies and likes go with it.
            </p>
            <div className={styles.confirmActions}>
              <Button type="button" kind="danger" size="small" disabled={pending} onClick={onDelete}>
                Delete
              </Button>
              <Button type="button" kind="outline" size="small" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : confirming === "block" ? (
          <div className={styles.confirm} role="group" aria-label={`Block ${handle}`}>
            <p className={styles.confirmText}>
              <strong className={styles.confirmTitle}>Block {handle}?</strong>
              You won&apos;t see each other&apos;s posts. A friendship or follow between you
              ends. They aren&apos;t told.
            </p>
            <div className={styles.confirmActions}>
              <Button type="button" kind="danger" size="small" disabled={pending} onClick={onBlock}>
                Block
              </Button>
              <Button type="button" kind="outline" size="small" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {isOwn ? (
              <button
                type="button"
                className="menu__item menu__item--danger"
                onClick={() => setConfirming("delete")}
              >
                <span className={styles.menuIcon}>
                  <Icon name="x" size={18} />
                </span>
                Delete
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="menu__item"
                  disabled={pending}
                  onClick={isMuted ? onUnmute : onMute}
                >
                  <span className={styles.menuIcon}>
                    <Icon name="bell" size={18} />
                  </span>
                  {isMuted ? `Unmute ${handle}` : `Mute ${handle}`}
                </button>
                <button
                  type="button"
                  className="menu__item menu__item--danger"
                  onClick={() => setConfirming("block")}
                >
                  <span className={styles.menuIcon}>
                    <Icon name="x" size={18} />
                  </span>
                  Block {handle}
                </button>
              </>
            )}
            {isOwn ? null : (
              <Link className="menu__item" href={reportHref(post.id)}>
                <span className={styles.menuIcon}>
                  <Icon name="flag" size={18} />
                </span>
                Report post
              </Link>
            )}
          </>
        )}
        {error ? (
          <p className={styles.menuError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
