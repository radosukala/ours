/* eslint-disable @typescript-eslint/no-unused-vars -- a stub: M2 replaces this file (SPEC §14). */
/**
 * STUB created by the foundation. Owned by M2 (connections), which replaces
 * it: the profile header with display name, handle, bio, the relationship
 * between viewer and profile, and the actions by state (SPEC §8 "Profile
 * actions"). No counts of friends or followers for anyone but the owner.
 */
import type { Relationship } from "@/core/visibility";

export type ProfileHeaderProps = {
  profile: { id: string; handle: string; displayName: string; bio: string };
  relationship: Relationship;
  isSelf: boolean;
};

export function ProfileHeader(props: ProfileHeaderProps): never {
  throw new Error("not implemented: M2");
}
