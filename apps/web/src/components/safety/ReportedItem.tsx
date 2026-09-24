/**
 * The reported post, reply or account, quoted in a bordered box: on the
 * report page (as the reporter already sees it) and in the moderation queue
 * (whatever its audience, which is the queue's purpose).
 *
 * The text is shown as plain text, in full: no link is made clickable or
 * shortened, so a person judging spam sees every address exactly as
 * written, and the quote never sends anyone to another page.
 */
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { RelativeTime } from "@/components/RelativeTime";
import styles from "./safety.module.css";

type Person = {
  handle: string;
  displayName: string;
  /** Set in the queue: the author's account is already suspended. */
  suspended?: boolean;
};

export type ReportedItemView =
  | {
      kind: "post";
      body: string;
      createdAt: Date;
      audience?: "friends" | "followers";
      author: Person;
    }
  | { kind: "reply"; body: string; createdAt: Date; author: Person }
  | {
      kind: "account";
      handle: string;
      displayName: string;
      bio: string;
      suspended?: boolean;
    }
  | { kind: "gone" };

const AUDIENCE = {
  friends: { icon: "lock", label: "Friends only" },
  followers: { icon: "globe-people", label: "Friends and followers" },
} as const;

function Suspended() {
  return <span className={`status ${styles.flag}`}>Suspended</span>;
}

export function ReportedItem({
  item,
  label,
}: {
  item: ReportedItemView;
  /** An accessible name for the quoted box, e.g. "The post you're reporting". */
  label: string;
}) {
  if (item.kind === "gone") {
    return (
      <section className={styles.quote} aria-label={label}>
        <p className={styles.gone}>
          This was deleted before anyone looked at it.
        </p>
      </section>
    );
  }

  if (item.kind === "account") {
    return (
      <section className={styles.quote} aria-label={label}>
        <div className={styles.account}>
          <Avatar name={item.displayName} handle={item.handle} size={48} />
          <div className={styles.accountText}>
            <div className={styles.head}>
              <span className={styles.name}>{item.displayName}</span>
              {item.suspended ? <Suspended /> : null}
            </div>
            <span className="muted">@{item.handle}</span>
            {item.bio ? <p className={styles.bio}>{item.bio}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  const audience =
    item.kind === "post" && item.audience ? AUDIENCE[item.audience] : null;

  return (
    <section className={styles.quote} aria-label={label}>
      <div className={styles.item}>
        <Avatar name={item.author.displayName} handle={item.author.handle} />
        <div className="post__main">
          <div className={styles.head}>
            <span className={styles.name}>{item.author.displayName}</span>
            <span className={styles.handle}>@{item.author.handle}</span>
            <span aria-hidden="true">·</span>
            <RelativeTime date={item.createdAt} />
            {audience ? (
              <span className={styles.audience} title={audience.label}>
                <Icon name={audience.icon} size={15} title={audience.label} />
              </span>
            ) : null}
            {item.author.suspended ? <Suspended /> : null}
          </div>
          <p className={styles.body}>{item.body}</p>
        </div>
      </div>
    </section>
  );
}
