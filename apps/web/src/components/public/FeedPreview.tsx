/**
 * The front page's picture of the product (SPEC §18.13): a phone showing a
 * feed as our.one draws it — the people you chose, newest first, and the
 * marker where you are caught up. Static, with fictional people, and the
 * caption says so. It uses the app's own tokens, so it follows the theme.
 */
import styles from "./public.module.css";

const POSTS: readonly { name: string; handle: string; when: string; text: string; hue: number }[] = [
  {
    name: "Mara",
    handle: "mara",
    when: "2h",
    text: "Made it to the top before the rain. Legs are gone. Worth it.",
    hue: 12,
  },
  {
    name: "Tomas",
    handle: "tomas",
    when: "5h",
    text: "Soup's on tonight. Door's open from 7, bring whoever.",
    hue: 152,
  },
  {
    name: "Jana",
    handle: "jana",
    when: "1d",
    text: "Finished the book you lent me. The last chapter. Wow.",
    hue: 262,
  },
];

export function FeedPreview() {
  return (
    <figure className={styles.preview} aria-label="What our.one looks like">
      <div className={styles.phone} aria-hidden="true">
        <div className={styles.phoneBar}>
          <span className={styles.phoneTitle}>Home</span>
        </div>
        <ol role="list" className={styles.phoneFeed}>
          {POSTS.map((post) => (
            <li key={post.handle} className={styles.phonePost}>
              <span
                className={styles.phoneAvatar}
                style={{ background: `hsl(${post.hue} var(--avatar-sat) var(--avatar-light))` }}
              >
                {post.name[0]}
              </span>
              <div className={styles.phoneBody}>
                <p className={styles.phoneMeta}>
                  <strong>{post.name}</strong> <span>@{post.handle}</span> <span>· {post.when}</span>
                </p>
                <p className={styles.phoneText}>{post.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.phoneEnd}>
          <strong>You&apos;re caught up</strong>
          <span>That&apos;s everything from your people since yesterday.</span>
        </div>
      </div>
      <figcaption className={styles.previewCaption}>Fictional people, for illustration.</figcaption>
    </figure>
  );
}
