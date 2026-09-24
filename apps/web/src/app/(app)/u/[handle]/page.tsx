/**
 * /u/<handle> (and /@<handle> by a rewrite): a person's profile (SPEC §6
 * "Profiles"). The header — name, handle, bio, the relationship and its
 * actions — is M2's ProfileHeader; the posts below are only those the
 * viewer may see.
 *
 * A person who does not exist, is suspended, or is blocked either way is
 * not found: the same page as any other missing thing.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FeedList } from "@/components/posts/FeedList";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { getAccountByHandle, type PublicProfile } from "@/core/accounts";
import { getDb } from "@/core/db";
import { isCoreError } from "@/core/errors";
import { listPostsByAuthor } from "@/core/posts";
import { canSeeAccount, relationship } from "@/core/visibility";
import { requireViewer } from "@/web/viewer";
import { loadMoreProfilePostsAction } from "./actions";

type Params = { params: Promise<{ handle: string }> };

/** The handle as typed in the address: a leading @ ignored, lowercased. */
function handleFrom(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  // Only what the address already says; nothing about whether they exist.
  const { handle } = await params;
  return { title: `@${handleFrom(handle).slice(0, 20)}` };
}

export default async function ProfilePage({ params }: Params) {
  const viewer = await requireViewer();
  const { handle: raw } = await params;
  const db = getDb();

  let profile: PublicProfile | null = null;
  try {
    profile = await getAccountByHandle(db, viewer.id, handleFrom(raw));
  } catch (error) {
    // A handle that cannot exist (INVALID) is simply not found.
    if (!isCoreError(error)) throw error;
  }
  // Suspended, blocked either way, or missing: not found (SPEC §6). Checked
  // here too, through the foundation's rule, so this page never depends on
  // one function alone for it.
  if (!profile || !(await canSeeAccount(db, viewer.id, profile.id))) notFound();

  const isSelf = profile.id === viewer.id;
  const [rel, page] = await Promise.all([
    relationship(db, viewer.id, profile.id),
    listPostsByAuthor(db, viewer.id, profile.id),
  ]);

  return (
    <>
      <PageHeader
        title={profile.displayName}
        subtitle={`@${profile.handle}`}
        back={isSelf ? undefined : "/home"}
      />
      <ProfileHeader
        profile={{
          id: profile.id,
          handle: profile.handle,
          displayName: profile.displayName,
          bio: profile.bio,
        }}
        relationship={rel}
        isSelf={isSelf}
      />
      <h2 className="visually-hidden">Posts</h2>
      <FeedList
        first={page}
        loadMore={loadMoreProfilePostsAction.bind(null, profile.id)}
        mutedAuthors={rel.muted ? [profile.id] : []}
        empty={
          isSelf
            ? { text: "You haven't posted yet.", action: { href: "/home#compose", label: "Post" } }
            : { text: "No posts to show." }
        }
      />
    </>
  );
}
