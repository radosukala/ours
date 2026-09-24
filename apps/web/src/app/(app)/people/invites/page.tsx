/**
 * /people/invites (SPEC §8 "Invites"): how many invites you have left, a
 * form to create a link (with an optional private note), the link shown
 * once, and your invites with their status and a Revoke action on waiting
 * ones. An invite that expires unused comes back to you.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/core/db";
import { type InviteStatus, type InviteView, listInvites } from "@/core/invites";
import { countIncomingRequests } from "@/core/notifications";
import { ActionButton } from "@/components/people/ActionButton";
import { InviteCreator } from "@/components/people/InviteCreator";
import { PeopleHeader } from "@/components/people/PeopleHeader";
import { profileHref, SinceDate } from "@/components/people/PersonItem";
import styles from "@/components/people/people.module.css";
import { requireViewer } from "@/web/viewer";
import { revokeInviteAction } from "../actions";

export const metadata: Metadata = { title: "Invites" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function remainingText(n: number): string {
  if (n === 0) return "You have no invites left.";
  return n === 1 ? "You have 1 invite left." : `You have ${n} invites left.`;
}

function StatusBadge({ invite }: { invite: InviteView }) {
  const labels: Record<InviteStatus, string> = {
    waiting: `Waiting · until ${DATE.format(invite.expiresAt)}`,
    used: "Used",
    expired: "Expired",
    revoked: "Revoked",
  };
  return (
    <span className={`status${invite.status === "waiting" ? ` ${styles.statusWaiting}` : ""}`}>
      {labels[invite.status]}
    </span>
  );
}

export default async function InvitesPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const now = new Date();
  const [{ remaining, invites }, requests] = await Promise.all([
    listInvites(db, viewer.id, now),
    countIncomingRequests(db, viewer.id, now),
  ]);

  return (
    <>
      <PeopleHeader current="invites" requests={requests} />

      <section className="section stack" aria-labelledby="invite-new-title">
        <h2 id="invite-new-title" className="visually-hidden">
          Create an invite link
        </h2>
        <p className={styles.count}>
          <strong>{remainingText(remaining)}</strong>
        </p>
        <p className="muted">
          Each link works once, for 30 days, and makes you and the person who
          joins friends. An invite that isn&apos;t used comes back to you.
        </p>
        <InviteCreator remaining={remaining} />
      </section>

      {invites.length > 0 ? (
        <section aria-labelledby="invite-list-title">
          <h2 id="invite-list-title" className={styles.sectionTitle}>
            Your invites
          </h2>
          <ul className={styles.list} role="list">
            {invites.map((invite) => (
              <li key={invite.id} className={styles.inviteRow}>
                <div className={styles.inviteText}>
                  <span
                    className={`${styles.inviteNote}${invite.note ? "" : ` ${styles.untitled}`}`}
                  >
                    {invite.note || "Invite link"}
                  </span>
                  <span className={styles.inviteStatus}>
                    <StatusBadge invite={invite} />
                  </span>
                  <span className={styles.meta}>
                    Created <SinceDate date={invite.createdAt} />
                    {invite.status === "used" && invite.usedByHandle ? (
                      <>
                        {" · used by "}
                        <Link href={profileHref(invite.usedByHandle)} className="link">
                          @{invite.usedByHandle}
                        </Link>
                      </>
                    ) : null}
                  </span>
                </div>
                {invite.status === "waiting" ? (
                  <ActionButton
                    kind="danger"
                    action={revokeInviteAction.bind(null, invite.id)}
                    confirm="Revoke this invite? The link stops working, and you get the invite back."
                    pendingLabel="Revoking…"
                    label={invite.note ? `Revoke the invite ${invite.note}` : "Revoke this invite"}
                  >
                    Revoke
                  </ActionButton>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
