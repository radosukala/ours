/**
 * /people/requests — friend requests to you (Accept / Decline) and from you
 * (Cancel). A request not answered in 30 days expires by itself.
 */
import type { Metadata } from "next";
import { listRequests } from "@/core/connections";
import { getDb } from "@/core/db";
import { EmptyState } from "@/components/EmptyState";
import { ActionButton } from "@/components/people/ActionButton";
import { PeopleHeader } from "@/components/people/PeopleHeader";
import { PeopleList, PersonItem, SinceDate } from "@/components/people/PersonItem";
import styles from "@/components/people/people.module.css";
import { requireViewer } from "@/web/viewer";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
} from "../actions";

export const metadata: Metadata = { title: "Friend requests" };

export default async function RequestsPage() {
  const viewer = await requireViewer();
  const now = new Date();
  const { incoming, outgoing } = await listRequests(getDb(), viewer.id, now);

  return (
    <>
      <PeopleHeader current="requests" requests={incoming.length} />
      {incoming.length === 0 && outgoing.length === 0 ? (
        <EmptyState text="No friend requests right now." />
      ) : null}

      {incoming.length > 0 ? (
        <section aria-labelledby="incoming-title">
          <h2 id="incoming-title" className={styles.sectionTitle}>
            Asked you
          </h2>
          <PeopleList label="Friend requests to you">
            {incoming.map((request) => (
              <PersonItem
                key={request.id}
                person={request.person}
                meta={
                  <>
                    Asked on <SinceDate date={request.createdAt} />
                  </>
                }
                actions={
                  <>
                    <ActionButton
                      kind="primary"
                      action={acceptFriendRequestAction.bind(null, request.person.id)}
                      pendingLabel="Accepting…"
                      label={`Accept ${request.person.displayName}'s friend request`}
                    >
                      Accept
                    </ActionButton>
                    <ActionButton
                      action={declineFriendRequestAction.bind(null, request.person.id)}
                      pendingLabel="Declining…"
                      label={`Decline ${request.person.displayName}'s friend request`}
                    >
                      Decline
                    </ActionButton>
                  </>
                }
              />
            ))}
          </PeopleList>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section aria-labelledby="outgoing-title">
          <h2 id="outgoing-title" className={styles.sectionTitle}>
            You asked
          </h2>
          <PeopleList label="Your friend requests">
            {outgoing.map((request) => (
              <PersonItem
                key={request.id}
                person={request.person}
                meta={
                  <>
                    Sent on <SinceDate date={request.createdAt} />
                  </>
                }
                actions={
                  <ActionButton
                    action={cancelFriendRequestAction.bind(null, request.person.id)}
                    pendingLabel="Cancelling…"
                    label={`Cancel your friend request to ${request.person.displayName}`}
                  >
                    Cancel
                  </ActionButton>
                }
              />
            ))}
          </PeopleList>
        </section>
      ) : null}
    </>
  );
}
