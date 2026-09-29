/**
 * The front page's picture of the product (SPEC §18.15 item 1.5, and its
 * decisions after the verification): a phone showing /home as the app
 * draws it on a phone. It is built from the app's own parts, so it cannot
 * drift from them:
 *
 * - the top bar with the our.one wordmark (PageHeader on /home);
 * - post rows in the app's classes, with the app's Avatar and icons
 *   (PostRow: audience, the ⋯ menu, reply and like);
 * - the app's own markers, in FeedList's order: three posts from after the
 *   last visit, `CaughtUpMarker` above the first post from before it, and
 *   `EndMarker` where the 14 days run out;
 * - the phone's tab bar, every tab in the text colour, the current one
 *   drawn heavier (TabBar).
 *
 * Static, decorative (hidden from screen readers), with fictional people,
 * and the caption says so. It is drawn at a fixed moment, so its words
 * never change.
 */
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { CaughtUpMarker, EndMarker } from "@/components/Marker";
import styles from "./public.module.css";

/** The moment the picture shows. */
export const PREVIEW_NOW = new Date("2026-09-29T12:00:00Z");

/** The reader's last visit: 2 days before, so the marker reads "2 days ago". */
export const PREVIEW_LAST_VISIT = new Date(PREVIEW_NOW.getTime() - 2 * 24 * 60 * 60 * 1000);

type PreviewPost = {
  name: string;
  handle: string;
  /** As RelativeTime writes it. */
  when: string;
  text: string;
  replies: number;
  likes: number;
};

/** Posted after the last visit, newest first. */
const NEW_POSTS: readonly PreviewPost[] = [
  { name: "Mara", handle: "mara", when: "2h", text: "Made it to the top before the rain. Legs are gone. Worth it.", replies: 2, likes: 6 },
  { name: "Tomas", handle: "tomas", when: "5h", text: "Soup's on tonight. Door's open from 7, bring whoever.", replies: 4, likes: 3 },
  { name: "Jana", handle: "jana", when: "1d", text: "Finished the book you lent me. The last chapter. Wow.", replies: 1, likes: 2 },
];

/** Posted before the last visit: the caught-up marker sits above it. */
const SEEN_POST: PreviewPost = {
  name: "Pavel",
  handle: "pavel",
  when: "3d",
  text: "Anyone up for a slow run on Saturday? I'll bring coffee.",
  replies: 3,
  likes: 5,
};

/** The tab bar's icons, in the app's order (TabBar.tsx): the first is current. */
const TABS: readonly IconName[] = ["home", "people", "plus", "bell", "person"];

export const PREVIEW_CAPTION = "An example feed. Fictional people.";

/** One post row, in PostRow's classes, with nothing to click. */
function Row({ post }: { post: PreviewPost }) {
  return (
    <article className="post">
      <span className="post__avatar">
        <Avatar name={post.name} handle={post.handle} size={40} />
      </span>
      <div className="post__main">
        <div className="post__head">
          <span className="post__name">{post.name}</span>
          <span className="post__handle">@{post.handle}</span>
          <span className="post__meta">· {post.when}</span>
          <span className="post__audience">
            <Icon name="lock" size={15} />
          </span>
          <span className="post__menu">
            <span className="icon-btn">
              <Icon name="dots" size={18} />
            </span>
          </span>
        </div>
        <div className="post__body">{post.text}</div>
        <div className="post__actions">
          <span className="action action--reply">
            <span className="action__icon">
              <Icon name="chat" size={18} />
            </span>
            <span className="action__count">{post.replies}</span>
          </span>
          <span className="action action--like">
            <span className="action__icon">
              <Icon name="heart" size={18} />
            </span>
            <span className="action__count">{post.likes}</span>
          </span>
          <span />
        </div>
      </div>
    </article>
  );
}

export function FeedPreview() {
  return (
    <figure className={styles.preview} aria-label="What our.one looks like">
      <div className={styles.phone} aria-hidden="true">
        <div className={styles.phoneBar}>
          <span className="wordmark">our.one</span>
        </div>
        <div>
          {NEW_POSTS.map((post) => (
            <div key={post.handle}>
              <Row post={post} />
            </div>
          ))}
          <div>
            <CaughtUpMarker since={PREVIEW_LAST_VISIT} now={PREVIEW_NOW} />
            <Row post={SEEN_POST} />
          </div>
        </div>
        <EndMarker />
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
