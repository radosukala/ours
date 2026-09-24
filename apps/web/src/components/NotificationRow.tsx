/**
 * One notification, for every kind in SPEC §5: friend_request,
 * friend_accepted, invite_joined, reply, like, content_removed,
 * report_outcome, new_follower.
 *
 * The whole row is one link to what it is about. The text of a post or
 * reply appears only when the core sent it — that is, only while the
 * recipient can still see it (core/inbox.ts). A removal shows the statement
 * of reasons, as the author's own post does (SPEC §8).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { RelativeTime } from "@/components/RelativeTime";
import type { NotificationView } from "@/core/inbox";
import type { NotificationKind } from "@/core/schema";
import styles from "./NotificationRow.module.css";

const KIND_ICON: Record<NotificationKind, IconName> = {
  friend_request: "people",
  friend_accepted: "people",
  invite_joined: "people",
  new_follower: "person",
  reply: "chat",
  like: "heart-filled",
  content_removed: "flag",
  report_outcome: "flag",
};

function kindClass(kind: NotificationKind): string {
  if (kind === "like") return `${styles.kind} ${styles.kindLike}`;
  if (kind === "content_removed" || kind === "report_outcome") {
    return `${styles.kind} ${styles.kindSafety}`;
  }
  return styles.kind!;
}

function profileHref(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`;
}

function postHref(postId: string, replyId?: string | null): string {
  const base = `/p/${encodeURIComponent(postId)}`;
  return replyId ? `${base}#reply-${encodeURIComponent(replyId)}` : base;
}

type Parts = {
  /** The sentence after the actor's name (or the whole sentence). */
  text: ReactNode;
  href: string | null;
  /** A quoted post or reply, when the recipient may still see it. */
  quote: string | null;
  /** The statement of reasons. */
  statement: string | null;
};

export function notificationParts(n: NotificationView, contactEmail?: string | null): Parts {
  const name = n.actor ? <strong>{n.actor.displayName}</strong> : <strong>Someone</strong>;
  const toActor = n.actor ? profileHref(n.actor.handle) : null;
  const toPost = n.linkPostId ? postHref(n.linkPostId) : null;
  switch (n.kind) {
    case "friend_request":
      return { text: <>{name} sent you a friend request.</>, href: "/people/requests", quote: null, statement: null };
    case "friend_accepted":
      return { text: <>{name} accepted your friend request.</>, href: toActor, quote: null, statement: null };
    case "invite_joined":
      return {
        text: <>{name} joined OURS from your invite. You&apos;re now friends.</>,
        href: toActor,
        quote: null,
        statement: null,
      };
    case "new_follower":
      return { text: <>{name} started following you.</>, href: toActor, quote: null, statement: null };
    case "reply":
      return {
        text: <>{name} replied to your post.</>,
        href: n.linkPostId ? postHref(n.linkPostId, n.replySnippet ? n.replyId : null) : null,
        quote: n.replySnippet ?? n.postSnippet,
        statement: null,
      };
    case "like":
      return { text: <>{name} liked your post.</>, href: toPost, quote: n.postSnippet, statement: null };
    case "content_removed": {
      const what = n.replyId ? "reply" : "post";
      const contact = contactEmail
        ? ` If you think this is wrong, write to ${contactEmail}.`
        : "";
      return {
        text: <>Your {what} was removed.</>,
        href: toPost ? postHref(n.linkPostId!, n.replyId) : null,
        quote: n.replyId ? n.replySnippet : n.postSnippet,
        statement: n.body ? `${n.body.trim()}${contact}` : contact.trim() || null,
      };
    }
    case "report_outcome":
      return {
        text: <>We looked at your report.</>,
        href: toPost,
        quote: n.postSnippet,
        statement: n.body,
      };
  }
}

export function NotificationRow({
  notification: n,
  unread,
  contactEmail,
}: {
  notification: NotificationView;
  /** Shown as new on this visit. */
  unread: boolean;
  /** The controller's address, for a removal's statement. */
  contactEmail?: string | null;
}) {
  const parts = notificationParts(n, contactEmail);
  const body = (
    <>
      <span className={kindClass(n.kind)} aria-hidden="true">
        <Icon name={KIND_ICON[n.kind]} size={24} />
      </span>
      <span className={styles.main}>
        {n.actor ? (
          <Avatar name={n.actor.displayName} handle={n.actor.handle} size={40} />
        ) : null}
        <span className={styles.text}>
          {unread ? <span className="visually-hidden">New: </span> : null}
          {parts.text}{" "}
          <RelativeTime className={styles.time} date={n.createdAt} />
        </span>
        {parts.quote ? <span className={styles.snippet}>{parts.quote}</span> : null}
        {parts.statement ? <span className={styles.statement}>{parts.statement}</span> : null}
      </span>
    </>
  );
  const className = `${styles.row}${unread ? ` ${styles.unread}` : ""}`;
  return parts.href ? (
    <Link href={parts.href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
