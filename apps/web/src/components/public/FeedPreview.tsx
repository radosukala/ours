/**
 * The front page's picture of the product (SPEC §18.15 item 1.5, and its
 * decisions after the verification): a phone showing /home as the app
 * draws it on a phone. It is built from the app's own parts, so it cannot
 * drift from them:
 *
 * - the header every page has, as a phone draws it (SiteHeader, D-0023
 *   §B): the wordmark with its rust dot (`Wordmark`) and the member's
 *   menu, then the four places (`PLACES`) on their own row;
 * - the feed's own bar, "Feed" (PageHeader on /home, D-0023 §D);
 * - post rows in the app's classes, with the app's Avatar and icons
 *   (PostRow: audience, the ⋯ menu, reply and like), and only what the app
 *   shows a reader: a reply count, and no like count on another person's
 *   post (SPEC §7; the re-check of M-0013);
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
import { relativeTime } from "@/components/RelativeTime";
import { Wordmark } from "@/components/SiteHeader";
import { PLACES } from "./places";
import styles from "./public.module.css";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The moment the picture shows. */
export const PREVIEW_NOW = new Date("2026-09-29T12:00:00Z");

/** The reader's last visit: 2 days before, so the marker reads "2 days ago". */
export const PREVIEW_LAST_VISIT = new Date(PREVIEW_NOW.getTime() - 2 * DAY);

export type PreviewPost = {
  name: string;
  handle: string;
  createdAt: Date;
  text: string;
  /** Replies the reader could see; the app shows the count to everyone. */
  replies: number;
};

/** Posted after the last visit, newest first. */
export const NEW_POSTS: readonly PreviewPost[] = [
  { name: "Mara", handle: "mara", createdAt: new Date(PREVIEW_NOW.getTime() - 2 * HOUR), text: "Made it to the top before the rain. Legs are gone. Worth it.", replies: 2 },
  { name: "Tomas", handle: "tomas", createdAt: new Date(PREVIEW_NOW.getTime() - 5 * HOUR), text: "Soup's on tonight. Door's open from 7, bring whoever.", replies: 4 },
  { name: "Jana", handle: "jana", createdAt: new Date(PREVIEW_NOW.getTime() - DAY), text: "Finished the book you lent me. The last chapter. Wow.", replies: 1 },
];

/** Posted before the last visit: the caught-up marker sits above it. */
export const SEEN_POST: PreviewPost = {
  name: "Pavel",
  handle: "pavel",
  createdAt: new Date(PREVIEW_NOW.getTime() - 3 * DAY),
  text: "Anyone up for a slow run on Saturday? I'll bring coffee.",
  replies: 3,
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
          <span className="post__meta">· {relativeTime(post.createdAt, PREVIEW_NOW)}</span>
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
            <span className="action__count"></span>
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
        <div className={styles.phoneHead}>
          <span className={styles.phoneWordmark}>
            <Wordmark />
          </span>
          <span className={styles.phoneMe} />
        </div>
        <div className={styles.phonePlaces}>
          {PLACES.map((place) => (
            <span key={place.href}>{place.label}</span>
          ))}
        </div>
        <div className={styles.phoneBar}>Feed</div>
        <div className={styles.phoneFeed}>
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
