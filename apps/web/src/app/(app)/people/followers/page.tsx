/**
 * /people/followers — the people who follow you. Only possible while you
 * accept followers, which you choose in Settings.
 */
import type { Metadata } from "next";
import { listFollowers } from "@/core/connections";
import { getDb } from "@/core/db";
import { countIncomingRequests } from "@/core/notifications";
import { EmptyState } from "@/components/EmptyState";
import { PeopleHeader } from "@/components/people/PeopleHeader";
import { PeopleList, PersonItem, SinceDate } from "@/components/people/PersonItem";
import { requireViewer } from "@/web/viewer";

export const metadata: Metadata = { title: "Followers" };

export default async function FollowersPage() {
  const viewer = await requireViewer();
  const db = getDb();
  const now = new Date();
  const [followers, requests] = await Promise.all([
    listFollowers(db, viewer.id),
    countIncomingRequests(db, viewer.id, now),
  ]);

  return (
    <>
      <PeopleHeader current="followers" requests={requests} />
      {!viewer.acceptsFollowers ? (
        <EmptyState
          text="You don't accept followers. Only your friends see your posts. You can change this in Settings."
          action={{ href: "/settings", label: "Settings" }}
        />
      ) : followers.length === 0 ? (
        <EmptyState text="Nobody follows you yet. Followers see the posts you share with friends and followers." />
      ) : (
        <PeopleList label="Followers">
          {followers.map((person) => (
            <PersonItem
              key={person.id}
              person={person}
              meta={
                <>
                  Following you since <SinceDate date={person.since} />
                </>
              }
            />
          ))}
        </PeopleList>
      )}
    </>
  );
}
