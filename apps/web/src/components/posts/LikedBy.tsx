/**
 * "Liked by" on the post page — shown only to the post's author (SPEC §6
 * "Likes"). The core sends `likers` and `likeCount` to the author alone, so
 * for anyone else there is nothing to render.
 */
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { PostView } from "@/core/posts";
import { profileHref } from "./links";
import styles from "./posts.module.css";

export function LikedBy({ post }: { post: PostView }) {
  const likers = post.likers;
  const count = post.likeCount ?? 0;
  // A removed post shows its statement of reasons and nothing else.
  if (!post.isOwn || post.removed || !likers || count === 0) return null;
  const more = count - likers.length;
  return (
    <section className="likers" aria-labelledby="liked-by-title">
      <h2 id="liked-by-title" className={styles.likersTitle}>
        Liked by {count === 1 ? "1 person" : `${count} people`}
        <span className="visually-hidden">. Only you can see this.</span>
      </h2>
      <ul role="list" className="stack">
        {likers.map((person) => (
          <li key={person.id}>
            <Link href={profileHref(person.handle)} className={styles.liker}>
              <Avatar name={person.displayName} handle={person.handle} size={40} />
              <span className={styles.likerText}>
                <span className={styles.likerName}>{person.displayName}</span>
                <span className={styles.likerHandle}>@{person.handle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="muted small">and {more} more</p> : null}
      <p className="muted small" aria-hidden="true">
        Only you can see who liked your post.
      </p>
    </section>
  );
}
