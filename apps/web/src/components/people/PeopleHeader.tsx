/**
 * The /people page header: the title and the tabs (sub-routes, SPEC §8
 * "Friends, follows, blocks, mutes"). Requests carries the pending count.
 */
import { HeaderTabs, PageHeader } from "@/components/PageHeader";

export type PeopleTab = "friends" | "requests" | "following" | "followers" | "invites";

const TABS: { key: PeopleTab; href: string; label: string }[] = [
  { key: "friends", href: "/people", label: "Friends" },
  { key: "requests", href: "/people/requests", label: "Requests" },
  { key: "following", href: "/people/following", label: "Following" },
  { key: "followers", href: "/people/followers", label: "Followers" },
  { key: "invites", href: "/people/invites", label: "Invites" },
];

export function PeopleHeader({
  current,
  requests,
}: {
  current: PeopleTab;
  /** Pending incoming friend requests. */
  requests: number;
}) {
  return (
    <PageHeader title="People">
      <HeaderTabs
        label="People"
        tabs={TABS.map((tab) => ({
          href: tab.href,
          label: tab.label,
          current: tab.key === current,
          count: tab.key === "requests" ? requests : undefined,
        }))}
      />
    </PageHeader>
  );
}
