/**
 * /people/following — the people you follow. You can follow only people
 * who accept followers; you see their posts marked for followers.
 */
import type { Metadata } from "next";
import { listFollowing } from "@/core/connections";
import { getDb } from "@/core/db";
import { countIncomingRequests } from "@/core/notifications";
import { EmptyState } from "@/components/EmptyState";
import { ActionButton } from "@/components/people/ActionButton";
import { PeopleHeader } from "@/components/people/PeopleHeader";
import { PeopleList, PersonItem } from "@/components/people/PersonItem";
import { requireViewer } from "@/web/viewer";
import { unfollowAction } from "../actions";

export const metadata: Metadata = { title: "Following" };

export default async function FollowingPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const [following, requests] = await Promise.all([
    listFollowing(db, viewer.id),
    countIncomingRequests(db, viewer.id),
  ]);

  return (
    <>
      <PeopleHeader current="following" requests={requests} />
      {following.length === 0 ? (
        <EmptyState text="You're not following anyone. You can follow people who accept followers, from their profile." />
      ) : (
        <PeopleList label="Following">
          {following.map((person) => (
            <PersonItem
              key={person.id}
              person={person}
              actions={
                <ActionButton
                  action={unfollowAction.bind(null, person.id)}
                  pendingLabel="Unfollowing…"
                  label={`Unfollow ${person.displayName}`}
                >
                  Unfollow
                </ActionButton>
              }
            />
          ))}
        </PeopleList>
      )}
    </>
  );
}
