/**
 * Notifications from posts, replies and likes, and the inbox (SPEC §8
 * "Notifications"). Never to yourself, never across a block, and never a
 * post's text the recipient can no longer see. Everyone here is FICTIONAL.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { CoreErrorCode } from "@/core/errors";
import { newId } from "@/core/ids";
import { listNotifications, markAllRead, NOTIFICATIONS_MAX, SNIPPET_MAX } from "@/core/inbox";
import { countUnread, notify } from "@/core/notifications";
import { createReply, toggleLike } from "@/core/posts";
import { accounts, friendships, notifications, posts, replies } from "@/core/schema";
import {
  at,
  befriend,
  block,
  db,
  makeAccount,
  plus,
  post,
  reset,
} from "./helpers";

beforeEach(reset);

const NOW = at("2026-09-20T08:00:00Z");

async function expectCode(promise: Promise<unknown>, code: CoreErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: "CoreError", code });
}

async function suspend(accountId: string) {
  await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, accountId));
}

async function removePost(postId: string) {
  await db()
    .update(posts)
    .set({ removedAt: new Date(), removalCategory: "spam", removalReason: "FICTIONAL reasons." })
    .where(eq(posts.id, postId));
}

async function notificationsOf(recipientId: string) {
  return db().select().from(notifications).where(eq(notifications.recipientId, recipientId));
}

async function unfriend(a: { id: string }, b: { id: string }) {
  const [x, y] = [a.id, b.id].sort();
  await db()
    .delete(friendships)
    .where(and(eq(friendships.aId, x!), eq(friendships.bId, y!)));
}

/* ----------------------------------------------------- who is notified */

describe("reply and like notifications: never to yourself, never across a block", () => {
  it("notifies the post's author of a reply, with the replier, post and reply", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    const { id: replyId } = await createReply(db(), friend.id, p.id, { body: "Nice", now: NOW });
    const rows = await notificationsOf(author.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "reply",
      actorId: friend.id,
      postId: p.id,
      replyId,
      readAt: null,
      createdAt: NOW,
    });
    expect(await notificationsOf(friend.id)).toEqual([]);
  });

  it("creates no notification for replying to or liking your own post", async () => {
    const author = await makeAccount();
    const p = await post(author);
    await createReply(db(), author.id, p.id, { body: "Adding a thought", now: NOW });
    await toggleLike(db(), author.id, p.id, NOW);
    expect(await db().select().from(notifications)).toEqual([]);
  });

  it("creates nothing across a block: the reply and the like are refused (NOT_FOUND)", async () => {
    const author = await makeAccount();
    const blockedByAuthor = await makeAccount();
    const blockerOfAuthor = await makeAccount();
    await befriend(author, blockedByAuthor);
    await befriend(author, blockerOfAuthor);
    const p = await post(author);
    await block(author, blockedByAuthor);
    await block(blockerOfAuthor, author);
    for (const x of [blockedByAuthor, blockerOfAuthor]) {
      await expectCode(createReply(db(), x.id, p.id, { body: "Hi", now: NOW }), "NOT_FOUND");
      await expectCode(toggleLike(db(), x.id, p.id, NOW), "NOT_FOUND");
    }
    expect(await db().select().from(notifications)).toEqual([]);
    expect(await db().select().from(replies)).toEqual([]);
  });
});

/* ------------------------------------------------------ listNotifications */

describe("listNotifications: what is hidden", () => {
  it("hides a notification whose actor has since been blocked, either way", async () => {
    const recipient = await makeAccount();
    const a = await makeAccount();
    const b = await makeAccount();
    await befriend(recipient, a);
    await befriend(recipient, b);
    const p = await post(recipient);
    await toggleLike(db(), a.id, p.id, NOW);
    await toggleLike(db(), b.id, p.id, NOW);
    // Fixture blocks only (the core's block() also deletes these rows).
    await block(recipient, a);
    await block(b, recipient);
    expect(await listNotifications(db(), recipient.id)).toEqual([]);
  });

  it("hides a notification whose actor has been suspended", async () => {
    const recipient = await makeAccount();
    const actor = await makeAccount();
    await befriend(recipient, actor);
    const p = await post(recipient);
    await createReply(db(), actor.id, p.id, { body: "Hi", now: NOW });
    await suspend(actor.id);
    expect(await listNotifications(db(), recipient.id)).toEqual([]);
  });

  it("omits the text of a post the recipient can no longer see", async () => {
    const recipient = await makeAccount();
    const author = await makeAccount();
    await befriend(recipient, author);
    const p = await post(author, { body: "FICTIONAL friends-only text" });
    // A notification about someone else's post (as a report outcome is).
    await notify(db(), {
      recipientId: recipient.id,
      kind: "report_outcome",
      postId: p.id,
      body: "FICTIONAL: we looked at your report.",
      now: NOW,
    });
    let [n] = await listNotifications(db(), recipient.id);
    expect(n).toMatchObject({ postSnippet: "FICTIONAL friends-only text", linkPostId: p.id });

    await unfriend(recipient, author);
    [n] = await listNotifications(db(), recipient.id);
    expect(n).toMatchObject({
      kind: "report_outcome",
      postId: p.id,
      postSnippet: null,
      linkPostId: null,
      body: "FICTIONAL: we looked at your report.",
    });
  });

  it("omits the text of a removed post from everyone but its author", async () => {
    const author = await makeAccount();
    const reporter = await makeAccount();
    await befriend(author, reporter);
    const p = await post(author, { body: "FICTIONAL text that was removed" });
    await removePost(p.id);
    await notify(db(), {
      recipientId: reporter.id,
      kind: "report_outcome",
      postId: p.id,
      body: "FICTIONAL: removed.",
      now: NOW,
    });
    await notify(db(), {
      recipientId: author.id,
      kind: "content_removed",
      postId: p.id,
      body: "FICTIONAL statement of reasons.",
      now: NOW,
    });
    const [forReporter] = await listNotifications(db(), reporter.id);
    expect(forReporter).toMatchObject({ postSnippet: null, linkPostId: null });
    const [forAuthor] = await listNotifications(db(), author.id);
    expect(forAuthor).toMatchObject({
      kind: "content_removed",
      postSnippet: "FICTIONAL text that was removed",
      linkPostId: p.id,
      body: "FICTIONAL statement of reasons.",
    });
  });

  it("omits the text of a reply the recipient can no longer see, and keeps their own", async () => {
    const author = await makeAccount();
    const replier = await makeAccount();
    await befriend(author, replier);
    const p = await post(author, { body: "FICTIONAL question" });
    const { id: replyId } = await createReply(db(), replier.id, p.id, {
      body: "FICTIONAL answer",
      now: NOW,
    });
    let [n] = await listNotifications(db(), author.id);
    expect(n).toMatchObject({
      kind: "reply",
      replyId,
      replySnippet: "FICTIONAL answer",
      postSnippet: "FICTIONAL question",
      linkPostId: p.id,
    });
    await db()
      .update(replies)
      .set({ removedAt: new Date(), removalCategory: "spam", removalReason: "FICTIONAL." })
      .where(eq(replies.id, replyId));
    [n] = await listNotifications(db(), author.id);
    expect(n).toMatchObject({ replySnippet: null, postSnippet: "FICTIONAL question" });

    // The replier's own removed reply is still theirs to read.
    await notify(db(), {
      recipientId: replier.id,
      kind: "content_removed",
      replyId,
      body: "FICTIONAL statement of reasons.",
      now: NOW,
    });
    const [own] = await listNotifications(db(), replier.id);
    expect(own).toMatchObject({
      replySnippet: "FICTIONAL answer",
      postSnippet: "FICTIONAL question",
      linkPostId: p.id,
    });
  });
});

describe("listNotifications: what is shown", () => {
  it("lists the newest 100, newest first, with the actor's handle and name", async () => {
    const recipient = await makeAccount();
    const actor = await makeAccount({ displayName: "FICTIONAL Actor" });
    await befriend(recipient, actor);
    const made: string[] = [];
    for (let i = 0; i < 105; i++) {
      const id = await notify(db(), {
        recipientId: recipient.id,
        kind: "friend_accepted",
        actorId: actor.id,
        now: plus.minutes(NOW, i),
      });
      made.push(id!);
    }
    const list = await listNotifications(db(), recipient.id);
    expect(list).toHaveLength(NOTIFICATIONS_MAX);
    expect(list.map((n) => n.id)).toEqual([...made].reverse().slice(0, 100));
    expect(list[0]!.actor).toEqual({
      id: actor.id,
      handle: actor.handle,
      displayName: "FICTIONAL Actor",
    });
    expect(await listNotifications(db(), recipient.id, { limit: 3 })).toHaveLength(3);
    expect(await listNotifications(db(), recipient.id, { limit: 5000 })).toHaveLength(100);
  });

  it("lists only the recipient's own notifications", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    await notify(db(), { recipientId: a.id, kind: "report_outcome", body: "FICTIONAL.", now: NOW });
    expect(await listNotifications(db(), b.id)).toEqual([]);
    expect(await listNotifications(db(), a.id)).toHaveLength(1);
  });

  it("keeps a notification with no actor, and gives its actor as null", async () => {
    const a = await makeAccount();
    await notify(db(), {
      recipientId: a.id,
      kind: "report_outcome",
      reportId: null,
      body: "FICTIONAL: dismissed.",
      now: NOW,
    });
    const [n] = await listNotifications(db(), a.id);
    expect(n).toMatchObject({ actor: null, body: "FICTIONAL: dismissed.", postSnippet: null });
  });

  it("cuts long text to a short snippet on one line", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const long = `First line\n\n${"word ".repeat(100)}`;
    const p = await post(author, { body: long });
    await toggleLike(db(), friend.id, p.id, NOW);
    const [n] = await listNotifications(db(), author.id);
    expect(Array.from(n!.postSnippet!)).toHaveLength(SNIPPET_MAX);
    expect(n!.postSnippet!.startsWith("First line word word")).toBe(true);
    expect(n!.postSnippet!.endsWith("…")).toBe(true);
  });

  it("marks what is unread", async () => {
    const author = await makeAccount();
    const friend = await makeAccount();
    await befriend(author, friend);
    const p = await post(author);
    await toggleLike(db(), friend.id, p.id, NOW);
    const [n] = await listNotifications(db(), author.id);
    expect(n!.readAt).toBeNull();
  });
});

/* ------------------------------------------------------------ markAllRead */

describe("markAllRead", () => {
  it("marks every unread notification read and sets notifications_seen_at", async () => {
    const recipient = await makeAccount();
    const other = await makeAccount();
    const actor = await makeAccount();
    await befriend(recipient, actor);
    const earlier = plus.hours(NOW, -3);
    const readId = newId();
    await db().insert(notifications).values({
      id: readId,
      recipientId: recipient.id,
      kind: "friend_accepted",
      actorId: actor.id,
      createdAt: earlier,
      readAt: earlier,
    });
    for (const r of [recipient, other]) {
      await notify(db(), { recipientId: r.id, kind: "friend_accepted", actorId: actor.id, now: NOW });
      await notify(db(), { recipientId: r.id, kind: "new_follower", actorId: actor.id, now: NOW });
    }
    expect(await countUnread(db(), recipient.id)).toBe(2);

    const seen = plus.minutes(NOW, 1);
    await markAllRead(db(), recipient.id, seen);

    expect(await countUnread(db(), recipient.id)).toBe(0);
    const rows = await notificationsOf(recipient.id);
    for (const row of rows) {
      expect(row.readAt).toEqual(row.id === readId ? earlier : seen);
    }
    const [acct] = await db().select().from(accounts).where(eq(accounts.id, recipient.id));
    expect(acct!.notificationsSeenAt).toEqual(seen);

    // Nobody else's notifications or seen time change.
    expect(await countUnread(db(), other.id)).toBe(2);
    const [otherAcct] = await db().select().from(accounts).where(eq(accounts.id, other.id));
    expect(otherAcct!.notificationsSeenAt).toBeNull();
  });
});
