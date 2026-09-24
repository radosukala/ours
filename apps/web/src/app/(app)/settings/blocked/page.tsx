/**
 * /settings/blocked: the people you blocked or muted, and a way to undo
 * each. The lists come from M2's core (listBlocked, listMuted).
 *
 * A blocked person's profile is not found for you, so their name here is
 * not a link; a muted person's is.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { listBlocked, listMuted, type PersonRow } from "@/core/connections";
import { getDb } from "@/core/db";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { PersonActionButton } from "@/components/settings/PersonActionButton";
import styles from "@/components/settings/settings.module.css";
import type { ActionResult } from "@/web/actions";
import { requireViewer } from "@/web/viewer";
import { unblockAction, unmuteAction } from "./actions";

export const metadata: Metadata = { title: "Blocked and muted" };

function People({
  people,
  empty,
  linkNames,
  actionLabel,
  action,
}: {
  people: PersonRow[];
  empty: string;
  linkNames: boolean;
  actionLabel: string;
  action: (personId: string) => Promise<ActionResult>;
}) {
  if (people.length === 0) return <p className={styles.emptyLine}>{empty}</p>;
  return (
    <ul role="list" className={styles.links}>
      {people.map((person) => (
        <li key={person.id} className="person">
          <Avatar name={person.displayName} handle={person.handle} />
          <div className="person__text">
            {linkNames ? (
              <Link href={`/@${person.handle}`} className="person__name">
                {person.displayName}
              </Link>
            ) : (
              <span className="person__name">{person.displayName}</span>
            )}
            <span className="person__handle">@{person.handle}</span>
          </div>
          <div className="person__actions">
            <PersonActionButton
              personId={person.id}
              label={actionLabel}
              accessibleLabel={`${actionLabel} @${person.handle}`}
              action={action}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function BlockedAndMutedPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const [blocked, muted] = await Promise.all([
    listBlocked(db, viewer.id),
    listMuted(db, viewer.id),
  ]);

  return (
    <>
      <PageHeader title="Blocked and muted" back="/settings" />

      <section aria-labelledby="blocked-heading">
        <div className={`${styles.sectionHeader} stack`}>
          <h2 id="blocked-heading" className={styles.heading}>
            Blocked
          </h2>
          <p className={styles.intro}>
            You and a person you blocked can&apos;t see each other&apos;s
            posts or profile, or connect. Unblocking doesn&apos;t bring back
            a friendship or a follow.
          </p>
        </div>
        <People
          people={blocked}
          empty="You haven't blocked anyone."
          linkNames={false}
          actionLabel="Unblock"
          action={unblockAction}
        />
      </section>

      <section aria-labelledby="muted-heading">
        <div className={`${styles.sectionHeader} stack`}>
          <h2 id="muted-heading" className={styles.heading}>
            Muted
          </h2>
          <p className={styles.intro}>
            Muting keeps someone&apos;s posts out of your feed. They aren&apos;t
            told.
          </p>
        </div>
        <People
          people={muted}
          empty="You haven't muted anyone."
          linkNames
          actionLabel="Unmute"
          action={unmuteAction}
        />
      </section>
    </>
  );
}
