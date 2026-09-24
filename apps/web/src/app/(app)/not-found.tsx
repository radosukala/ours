/**
 * Not found, inside the app shell, so the navigation stays. What a person
 * sees for anything they may not see (SPEC §2 rule 3): a hidden post, a
 * person who blocked you, and a missing page look the same.
 */
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

export default function AppNotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <EmptyState
        text="Nothing here. This page doesn't exist, or isn't available to you."
        action={{ href: "/home", label: "Go home" }}
      />
    </>
  );
}
