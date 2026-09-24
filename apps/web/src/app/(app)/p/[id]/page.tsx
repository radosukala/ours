/**
 * /p/<id>: one post and its replies, oldest first, with a reply box when
 * the viewer may reply, and — for the author only — who liked it
 * (SPEC §6, §8 "Posts").
 *
 * A post the viewer may not see is not found, exactly like one that does
 * not exist. The author's own removed post is shown to them, marked, with
 * the statement of reasons and no actions.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Composer } from "@/components/posts/Composer";
import { LikedBy } from "@/components/posts/LikedBy";
import { PostRow } from "@/components/posts/PostRow";
import { ReplyList } from "@/components/posts/ReplyList";
import { controller } from "@/core/config";
import { getDb } from "@/core/db";
import { getPostForViewer, listReplies } from "@/core/posts";
import { LIMITS } from "@/core/validate";
import { relationship } from "@/core/visibility";
import { requireViewer } from "@/web/viewer";
import { createReplyAction } from "./actions";

export const metadata: Metadata = { title: "Post" };

/** The reply counter appears this close to the limit, as the post's does. */
const REPLY_COUNTER_FROM = LIMITS.replyMax - 200;

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireViewer();
  const { id } = await params;
  const db = getDb();
  const post = await getPostForViewer(db, viewer.id, id);
  if (!post) notFound();

  const [replies, rel] = await Promise.all([
    listReplies(db, viewer.id, post.id),
    post.isOwn ? null : relationship(db, viewer.id, post.author.id),
  ]);
  const contactEmail = controller()?.email ?? null;
  // canReply(V, P) = canSeePost(V, P) and active(V): the post is here and
  // not removed, and requireViewer only returns active people.
  const canReply = post.removed === null;

  return (
    <>
      <PageHeader title="Post" back="/home" />
      <PostRow post={post} focus muted={rel?.muted ?? false} contactEmail={contactEmail} />
      <LikedBy post={post} />
      {canReply ? (
        <Composer
          id="reply"
          variant="reply"
          viewer={{ handle: viewer.handle, displayName: viewer.displayName }}
          label={`Reply to ${post.author.displayName}`}
          placeholder="Post your reply"
          max={LIMITS.replyMax}
          counterFrom={REPLY_COUNTER_FROM}
          submitLabel="Reply"
          submit={createReplyAction.bind(null, post.id)}
        />
      ) : null}
      <ReplyList replies={replies} contactEmail={contactEmail} />
    </>
  );
}
