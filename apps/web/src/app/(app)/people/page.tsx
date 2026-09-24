/**
 * /people — your friends (SPEC §8). Only you see this list: no counts or
 * lists of anyone's connections are shown to anyone else.
 */
import type { Metadata } from "next";
import { listFriends } from "@/core/connections";
import { getDb } from "@/core/db";
import { countIncomingRequests } from "@/core/notifications";
import { EmptyState } from "@/components/EmptyState";
import { PeopleHeader } from "@/components/people/PeopleHeader";
import { PeopleList, PersonItem, SinceDate } from "@/components/people/PersonItem";
import { requireViewer } from "@/web/viewer";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const now = new Date();
  const [friends, requests] = await Promise.all([
    listFriends(db, viewer.id),
    countIncomingRequests(db, viewer.id, now),
  ]);

  return (
    <>
      <PeopleHeader current="friends" requests={requests} />
      {friends.length === 0 ? (
        <EmptyState
          text="No friends here yet. Invite someone you know."
          action={{ href: "/people/invites", label: "Invite" }}
        />
      ) : (
        <PeopleList label="Friends">
          {friends.map((friend) => (
            <PersonItem
              key={friend.id}
              person={friend}
              meta={
                <>
                  Friends since <SinceDate date={friend.since} />
                </>
              }
            />
          ))}
        </PeopleList>
      )}
    </>
  );
}
