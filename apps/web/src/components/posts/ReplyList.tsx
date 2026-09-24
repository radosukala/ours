/**
 * The replies under a post, oldest first (SPEC §8 "Posts"). The list comes
 * from the core already filtered: replies by people blocked either way with
 * the viewer, by suspended people, and removed replies are not in it —
 * except the viewer's own removed reply, shown with its statement of
 * reasons.
 */
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Linkify } from "@/components/Linkify";
import { RelativeTime } from "@/components/RelativeTime";
import type { ReplyView } from "@/core/posts";
import { profileHref } from "./links";
import { removalText } from "./removal";
import styles from "./posts.module.css";
import { ReplyMenu } from "./ReplyMenu";

export function ReplyList({
  replies,
  contactEmail,
}: {
  replies: ReplyView[];
  /** The controller's address, for a removed reply's statement. */
  contactEmail?: string | null;
}) {
  if (replies.length === 0) return null;
  return (
    <section aria-label="Replies">
      <ol role="list">
        {replies.map((reply) => (
          <li key={reply.id}>
            <ReplyRow reply={reply} contactEmail={contactEmail} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReplyRow({
  reply,
  contactEmail,
}: {
  reply: ReplyView;
  contactEmail?: string | null;
}) {
  const author = reply.author;
  return (
    <article className={`reply ${styles.anchor}`} id={`reply-${reply.id}`} aria-labelledby={`reply-${reply.id}-author`}>
      <Link className="post__avatar" href={profileHref(author.handle)} tabIndex={-1} aria-hidden="true">
        <Avatar name={author.displayName} handle={author.handle} size={40} />
      </Link>
      <div className="post__main">
        <div className="post__head">
          <Link id={`reply-${reply.id}-author`} className="post__name" href={profileHref(author.handle)}>
            {author.displayName}
          </Link>
          <span className="post__handle">@{author.handle}</span>
          <span className="post__meta">
            <span aria-hidden="true">·</span> <RelativeTime date={reply.createdAt} />
          </span>
          {reply.removed ? null : (
            <span className="post__menu">
              <ReplyMenu replyId={reply.id} isOwn={reply.isOwn} canDelete={reply.canDelete} />
            </span>
          )}
        </div>
        <div className="post__body">
          <Linkify text={reply.body} />
        </div>
        {reply.removed ? (
          <p className="post__removed" role="note">
            {removalText(reply.removed, contactEmail)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
