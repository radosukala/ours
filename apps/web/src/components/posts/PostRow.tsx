"use client";

/**
 * One post (SPEC §9 "Post row"): avatar; name, @handle · time and the
 * audience icon; the text with its links; and the actions — reply (with the
 * count everyone who can see the post sees), like (a count only for the
 * author) and the ⋯ menu.
 *
 * In a list the whole row opens the post, like the apps people know; the
 * time is also a plain link, for keyboards and screen readers. `focus` is
 * the post page's version: larger text, the full time, and no row link.
 *
 * The author's own removed post shows the statement of reasons and no
 * actions (SPEC §8 "What the author sees").
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Linkify } from "@/components/Linkify";
import { fullTime, RelativeTime } from "@/components/RelativeTime";
import type { PostView } from "@/core/posts";
import { LikeButton } from "./LikeButton";
import { AUDIENCE_LABEL, postHref, profileHref } from "./links";
import { PostMenu } from "./PostMenu";
import styles from "./posts.module.css";
import { removalText } from "./removal";

/** Clicks on these open what they are, not the post. */
const INTERACTIVE = "a, button, summary, details, input, textarea, select, label";

export function PostRow({
  post,
  focus = false,
  muted,
  contactEmail,
}: {
  post: PostView;
  /** The post page's large version. */
  focus?: boolean;
  /** Whether the viewer muted the author (for the menu). */
  muted?: boolean;
  /** The controller's address, for a removed post's statement. */
  contactEmail?: string | null;
}) {
  const router = useRouter();
  const href = postHref(post.id);
  const author = post.author;

  function openPost(event: MouseEvent<HTMLElement>) {
    if (focus) return;
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    // Selecting text is not a click on the post.
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  return (
    <article
      className={`post${focus ? " post--focus" : " post--link"}`}
      aria-labelledby={`post-${post.id}-author`}
      onClick={focus ? undefined : openPost}
    >
      <Link className="post__avatar" href={profileHref(author.handle)} tabIndex={-1} aria-hidden="true">
        <Avatar name={author.displayName} handle={author.handle} size={40} />
      </Link>
      <div className="post__main">
        <div className="post__head">
          <Link
            id={`post-${post.id}-author`}
            className="post__name"
            href={profileHref(author.handle)}
          >
            {author.displayName}
          </Link>
          <span className="post__handle">@{author.handle}</span>
          {focus ? null : (
            <span className="post__meta">
              <span aria-hidden="true">·</span>{" "}
              <Link href={href} aria-label={`${fullTime(post.createdAt)}, open post`}>
                <RelativeTime date={post.createdAt} />
              </Link>
            </span>
          )}
          <span className="post__audience" title={AUDIENCE_LABEL[post.audience]}>
            <Icon
              name={post.audience === "friends" ? "lock" : "globe-people"}
              size={15}
              title={`Audience: ${AUDIENCE_LABEL[post.audience]}`}
            />
          </span>
          {post.removed ? null : (
            <span className="post__menu">
              <PostMenu
                post={{ id: post.id, authorId: author.id, authorHandle: author.handle }}
                isOwn={post.isOwn}
                muted={muted}
              />
            </span>
          )}
        </div>
        <div className="post__body">
          <Linkify text={post.body} />
        </div>
        {post.removed ? (
          <p className="post__removed" role="note">
            {removalText(post.removed, contactEmail)}
          </p>
        ) : null}
        {focus ? (
          <p className={styles.focusTime}>
            <time dateTime={post.createdAt.toISOString()}>{fullTime(post.createdAt)}</time>
          </p>
        ) : null}
        {post.removed ? null : (
          <div className="post__actions">
            <Link
              className="action action--reply"
              href={focus ? "#reply" : href}
              aria-label={
                post.replyCount > 0
                  ? `Reply, ${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}`
                  : "Reply"
              }
            >
              <span className="action__icon">
                <Icon name="chat" size={18} />
              </span>
              <span className="action__count" aria-hidden="true">
                {post.replyCount > 0 ? post.replyCount : ""}
              </span>
            </Link>
            <LikeButton postId={post.id} liked={post.likedByMe} count={post.likeCount} />
            <span aria-hidden="true" />
          </div>
        )}
      </div>
    </article>
  );
}
