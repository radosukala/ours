/**
 * The front page's illustration beside the court's 7% finding (SPEC §18.15
 * item 2): a ranked feed that keeps going, next to an our.one feed that
 * ends. It is a drawing, not a screenshot of any product, and its caption
 * says so. The people are the front page's fictional three. The our.one
 * side ends where the app's feed ends when it has nothing older, on the
 * app's own end-marker words (`EndMarker`, SPEC §18.15's decisions after
 * the verification).
 */
import { FEED_WINDOW_DAYS } from "@/core/config";
import styles from "./public.module.css";

const FRIENDS: readonly { name: string; text: string; hue: number }[] = [
  { name: "Mara", text: "Made it to the top before the rain.", hue: 12 },
  { name: "Tomas", text: "Soup's on tonight. Door's open from 7.", hue: 152 },
  { name: "Jana", text: "Finished the book you lent me.", hue: 262 },
];

/** What a ranked feed puts between your friends' posts, top to bottom. */
const RANKED: readonly ("Sponsored" | "Suggested for you" | "friend")[] = [
  "Sponsored",
  "Suggested for you",
  "friend",
  "Suggested for you",
  "Sponsored",
  "Suggested for you",
];

export const CONTRAST_LABELS = ["A ranked feed", "our.one"] as const;
export const CONTRAST_CAPTION = "Illustration.";

/** EndMarker's words (Marker.tsx), where the app's feed runs out. */
const END_WORDS = `That's everything from the last ${FEED_WINDOW_DAYS} days.`;

function MiniPost({ name, text, hue }: { name: string; text: string; hue: number }) {
  return (
    <div className={styles.miniPost}>
      <span
        className={styles.miniAvatar}
        style={{ background: `hsl(${hue} var(--avatar-sat) var(--avatar-light))` }}
      >
        {name[0]}
      </span>
      <div className={styles.miniBody}>
        <strong>{name}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

export function FeedContrast() {
  return (
    <figure
      className={styles.contrast}
      aria-label="Illustration: a ranked feed that keeps going, beside an our.one feed that ends"
    >
      <div className={styles.contrastPair}>
        <div className={styles.contrastColumn}>
          <p className={styles.contrastLabel}>{CONTRAST_LABELS[0]}</p>
          <div className={`${styles.mini} ${styles.miniRanked}`} aria-hidden="true">
            <div className={styles.miniBar}>Home</div>
            {RANKED.map((item, i) =>
              item === "friend" ? (
                <MiniPost key={i} {...FRIENDS[0]!} />
              ) : (
                <div key={i} className={styles.miniBlock}>
                  <span className={styles.miniTag}>{item}</span>
                  <span className={item === "Sponsored" ? styles.miniImage : styles.miniVideo} />
                </div>
              ),
            )}
            <div className={styles.miniFade}>
              <span>and it keeps going</span>
            </div>
          </div>
        </div>
        <div className={styles.contrastColumn}>
          <p className={styles.contrastLabel}>{CONTRAST_LABELS[1]}</p>
          <div className={styles.mini} aria-hidden="true">
            <div className={styles.miniBar}>Home</div>
            {FRIENDS.map((friend) => (
              <MiniPost key={friend.name} {...friend} />
            ))}
            <div className={styles.miniEnd}>
              <span className={styles.miniRule} />
              <span>{END_WORDS}</span>
              <span className={styles.miniRule} />
            </div>
          </div>
        </div>
      </div>
      <figcaption className={styles.previewCaption}>{CONTRAST_CAPTION}</figcaption>
    </figure>
  );
}
