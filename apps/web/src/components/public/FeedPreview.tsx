/**
 * The front page's picture of the product (SPEC §18.15 item 1.5, after
 * §18.13): a phone showing a feed as our.one draws it — the people you
 * chose, newest first — ending at the app's own caught-up marker, in its
 * own words (`CaughtUpMarker`), above the app's tab bar on a phone. Static,
 * with fictional people, and the caption says so. It uses the app's own
 * tokens and icons, so it follows the theme.
 */
import { Icon, type IconName } from "@/components/Icon";
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

/** The tab bar's icons, in the app's order (TabBar.tsx): the first is current. */
const TABS: readonly IconName[] = ["home", "people", "plus", "bell", "person"];

/** The caught-up marker's words, as `CaughtUpMarker` writes them for a visit 2 days ago. */
export const PREVIEW_MARKER = ["You're caught up", "You've seen everything from before your last visit, 2 days ago."] as const;

export const PREVIEW_CAPTION = "An example feed. Fictional people.";

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
          <span className={styles.check}>
            <Icon name="check" size={22} strokeWidth={2.5} />
          </span>
          <strong>{PREVIEW_MARKER[0]}</strong>
          <span>{PREVIEW_MARKER[1]}</span>
        </div>
        <div className={styles.phoneTabs}>
          {TABS.map((name, i) => (
            <span
              key={name}
              className={name === "plus" ? `${styles.phoneTab} ${styles.phoneCompose}` : styles.phoneTab}
            >
              <Icon name={name} size={name === "plus" ? 20 : 24} strokeWidth={i === 0 ? 2.25 : 1.75} />
            </span>
          ))}
        </div>
      </div>
      <figcaption className={styles.previewCaption}>{PREVIEW_CAPTION}</figcaption>
    </figure>
  );
}
