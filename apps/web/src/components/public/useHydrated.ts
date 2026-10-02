"use client";

/**
 * Whether the page's JavaScript is running: false on the server and while
 * the page hydrates, true after. The public pages' interactive parts draw
 * their no-JavaScript form until then (D-0020 §E), as InviteCreator does
 * for sharing.
 */
import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
