"use client";

/**
 * The ⋯ menu on a reply: Report (someone else's reply) and Delete (your
 * own reply, or any reply on your post), with a confirmation.
 */
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { deleteReplyAction } from "./actions";
import { useDismissableMenu } from "./PostMenu";
import styles from "./posts.module.css";

export function reportReplyHref(replyId: string): string {
  return `/report?kind=reply&id=${encodeURIComponent(replyId)}`;
}

export function ReplyMenu({
  replyId,
  isOwn,
  canDelete,
}: {
  replyId: string;
  isOwn: boolean;
  canDelete: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menu = useDismissableMenu(menuRef);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    menu.onToggle();
    setConfirming(false);
    setError(null);
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReplyAction(replyId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      menu.close();
    });
  }

  return (
    <details className="menu" ref={menuRef} onToggle={onToggle}>
      <summary className="icon-btn" aria-label="More options" title="More">
        <Icon name="dots" size={18} />
      </summary>
      <div className="menu__list">
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="Delete reply">
            <p className={styles.confirmText}>
              <strong className={styles.confirmTitle}>Delete reply?</strong>
              This can&apos;t be undone.
            </p>
            <div className={styles.confirmActions}>
              <Button type="button" kind="danger" size="small" disabled={pending} onClick={onDelete}>
                Delete
              </Button>
              <Button type="button" kind="outline" size="small" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {canDelete ? (
              <button
                type="button"
                className="menu__item menu__item--danger"
                onClick={() => setConfirming(true)}
              >
                <span className={styles.menuIcon}>
                  <Icon name="x" size={18} />
                </span>
                Delete
              </button>
            ) : null}
            {isOwn ? null : (
              <Link className="menu__item" href={reportReplyHref(replyId)}>
                <span className={styles.menuIcon}>
                  <Icon name="flag" size={18} />
                </span>
                Report reply
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
