/**
 * Accounts (M1; SPEC §6, §8, §13): profiles, the username, accepting
 * followers, the weekly email, and deleting an account. M-0010
 * acceptance: "A person cannot export, delete or edit anyone else's
 * data" and "Deleting an account removes its posts, replies, likes,
 * connections and sessions." Denial paths first. Everyone is FICTIONAL.
 *
 * Rows other modules own (replies, likes, invites, requests, reports,
 * notifications) are inserted here as fixtures, never through another
 * module's functions.
 */
import { eq, or } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  changeHandle,
  deleteAccount,
  getAccountByHandle,
  getSettings,
  saveProfile,
  setAcceptsFollowers,
  setWeeklyEmail,
  updateProfile,
} from "@/core/accounts";
import {
  createEmailToken,
  createPendingJoin,
  createSession,
  sessionFromCookie,
} from "@/core/auth";
import { isCoreError } from "@/core/errors";
import { newId, sha256 } from "@/core/ids";
import { sendMail } from "@/core/mail";
import {
  accounts,
  blocks,
  digestDeliveries,
  emailTokens,
  follows,
  friendRequests,
  friendships,
  invites,
  likes,
  mailLog,
  mutes,
  notifications,
  outbox,
  pendingJoins,
  posts,
  replies,
  reports,
  sessions,
} from "@/core/schema";
import { canSeePost } from "@/core/visibility";
import {
  at,
  befriend,
  block,
  db,
  follow,
  makeAccount,
  mute,
  plus,
  post,
  reset,
} from "./helpers";

beforeEach(reset);

const t0 = at("2026-09-01T12:00:00Z");

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

async function accountRow(id: string) {
  const [row] = await db().select().from(accounts).where(eq(accounts.id, id));
  return row ?? null;
}

/* -------------------------------------------------------------- fixtures */

async function reply(authorId: string, postId: string, body = "A FICTIONAL reply.") {
  const [row] = await db()
    .insert(replies)
    .values({ id: newId(), postId, authorId, body })
    .returning();
  return row!;
}

async function likePost(accountId: string, postId: string) {
  await db().insert(likes).values({ postId, accountId });
}

async function invite(inviterId: string, usedBy: string | null = null) {
  const [row] = await db()
    .insert(invites)
    .values({
      id: newId(),
      codeHash: sha256(newId()),
      inviterId,
      expiresAt: plus.days(new Date(), 30),
      usedAt: usedBy ? new Date() : null,
      usedBy,
    })
    .returning();
  return row!;
}

async function friendRequest(fromId: string, toId: string) {
  await db()
    .insert(friendRequests)
    .values({ id: newId(), fromId, toId, status: "pending" });
}

async function report(input: {
  reporterId: string;
  targetKind: "post" | "reply" | "account";
  targetPostId?: string;
  targetAccountId?: string;
}) {
  const [row] = await db()
    .insert(reports)
    .values({
      id: newId(),
      reporterId: input.reporterId,
      targetKind: input.targetKind,
      targetPostId: input.targetPostId ?? null,
      targetAccountId: input.targetAccountId ?? null,
      category: "spam",
    })
    .returning();
  return row!;
}

async function notification(recipientId: string, actorId: string | null, postId?: string) {
  await db().insert(notifications).values({
    id: newId(),
    recipientId,
    actorId,
    kind: postId ? "like" : "friend_request",
    postId: postId ?? null,
  });
}

/* --------------------------------------------------------- profile reads */

describe("getAccountByHandle", () => {
  it("is null for an unknown or malformed handle", async () => {
    const viewer = await makeAccount();
    expect(await getAccountByHandle(db(), viewer.id, "nobody_here")).toBeNull();
    expect(await getAccountByHandle(db(), viewer.id, "x")).toBeNull();
    expect(await getAccountByHandle(db(), viewer.id, "'; drop table accounts; --")).toBeNull();
  });

  it("is null for a suspended account", async () => {
    const viewer = await makeAccount();
    await makeAccount({ handle: "suspended_sam", suspended: true });
    expect(await getAccountByHandle(db(), viewer.id, "suspended_sam")).toBeNull();
  });

  it("is null when there is a block either way", async () => {
    const viewer = await makeAccount();
    const blocker = await makeAccount({ handle: "blocker" });
    const blocked = await makeAccount({ handle: "blocked_one" });
    await block(blocker, viewer);
    await block(viewer, blocked);
    expect(await getAccountByHandle(db(), viewer.id, "blocker")).toBeNull();
    expect(await getAccountByHandle(db(), viewer.id, "blocked_one")).toBeNull();
    // Others still see both.
    const third = await makeAccount();
    expect(await getAccountByHandle(db(), third.id, "blocker")).not.toBeNull();
  });

  it("is null for a viewer who is suspended or does not exist", async () => {
    const sam = await makeAccount({ suspended: true });
    await makeAccount({ handle: "anna" });
    expect(await getAccountByHandle(db(), sam.id, "anna")).toBeNull();
    expect(await getAccountByHandle(db(), "01NOSUCHACCOUNT", "anna")).toBeNull();
  });

  it("finds a profile by @Handle in any case, without the address", async () => {
    const viewer = await makeAccount();
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    const profile = await getAccountByHandle(db(), viewer.id, " @ANNA ");
    expect(profile).toEqual({
      id: anna.id,
      handle: "anna",
      displayName: anna.displayName,
      bio: anna.bio,
      acceptsFollowers: true,
      createdAt: anna.createdAt,
    });
    expect(JSON.stringify(profile)).not.toContain("example.test");
  });
});

describe("getSettings", () => {
  it("is the person's own account only, and NOT_FOUND once suspended", async () => {
    const anna = await makeAccount({ handle: "anna", weeklyEmail: false });
    expect(await getSettings(db(), anna.id)).toEqual({
      id: anna.id,
      handle: "anna",
      displayName: anna.displayName,
      bio: anna.bio,
      email: "anna@example.test",
      acceptsFollowers: false,
      weeklyEmail: false,
    });
    const sam = await makeAccount({ suspended: true });
    await expectCode(getSettings(db(), sam.id), "NOT_FOUND");
    await expectCode(getSettings(db(), "01NOSUCHACCOUNT"), "NOT_FOUND");
  });
});

/* ------------------------------------------------------ profile writes */

describe("updateProfile", () => {
  it("refuses an empty or too long name, and a too long bio, with INVALID", async () => {
    const anna = await makeAccount();
    await expectCode(updateProfile(db(), anna.id, { displayName: "   ", bio: "" }), "INVALID");
    await expectCode(
      updateProfile(db(), anna.id, { displayName: "x".repeat(51), bio: "" }),
      "INVALID",
    );
    await expectCode(
      updateProfile(db(), anna.id, { displayName: "Anna", bio: "b".repeat(161) }),
      "INVALID",
    );
    const row = await accountRow(anna.id);
    expect(row!.displayName).toBe(anna.displayName);
  });

  it("refuses a suspended or unknown account with NOT_FOUND", async () => {
    const sam = await makeAccount({ suspended: true });
    await expectCode(
      updateProfile(db(), sam.id, { displayName: "Sam", bio: "" }),
      "NOT_FOUND",
    );
    await expectCode(
      updateProfile(db(), "01NOSUCHACCOUNT", { displayName: "Nobody", bio: "" }),
      "NOT_FOUND",
    );
  });

  it("changes only the caller's own name and bio", async () => {
    const anna = await makeAccount();
    const petr = await makeAccount();
    await updateProfile(db(), anna.id, {
      displayName: "  FICTIONAL   Anna ",
      bio: " Knits. \r\nReads. ",
    });
    const row = await accountRow(anna.id);
    expect(row!.displayName).toBe("FICTIONAL Anna");
    expect(row!.bio).toBe("Knits. \nReads.");
    expect((await accountRow(petr.id))!.displayName).toBe(petr.displayName);
  });
});

describe("changeHandle", () => {
  it("refuses a reserved username with INVALID", async () => {
    const anna = await makeAccount({ handle: "anna" });
    for (const name of ["admin", "settings", "Signin", "@OURS", "undefined"]) {
      await expectCode(changeHandle(db(), anna.id, name), "INVALID");
    }
    expect((await accountRow(anna.id))!.handle).toBe("anna");
  });

  it("refuses a malformed username with INVALID", async () => {
    const anna = await makeAccount({ handle: "anna" });
    for (const name of ["ab", "a".repeat(21), "anna-b", "anna b", "änna", ""]) {
      await expectCode(changeHandle(db(), anna.id, name), "INVALID");
    }
  });

  it("refuses a username someone else has, in any letter case, with CONFLICT", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await makeAccount({ handle: "petr_k" });
    await expectCode(changeHandle(db(), anna.id, "petr_k"), "CONFLICT");
    await expectCode(changeHandle(db(), anna.id, "PETR_K"), "CONFLICT");
    await expectCode(changeHandle(db(), anna.id, "@Petr_K"), "CONFLICT");
    expect((await accountRow(anna.id))!.handle).toBe("anna");
  });

  it("counts a suspended person's username as taken", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await makeAccount({ handle: "sam", suspended: true });
    await expectCode(changeHandle(db(), anna.id, "sam"), "CONFLICT");
  });

  it("refuses a suspended account with NOT_FOUND", async () => {
    const sam = await makeAccount({ handle: "sam", suspended: true });
    await expectCode(changeHandle(db(), sam.id, "sam_new"), "NOT_FOUND");
  });

  it("stores the new name lowercased, and keeping your own name changes nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    expect(await changeHandle(db(), anna.id, "ANNA")).toEqual({ handle: "anna" });
    expect(await changeHandle(db(), anna.id, "@Anna_K")).toEqual({ handle: "anna_k" });
    expect((await accountRow(anna.id))!.handle).toBe("anna_k");
  });

  it("gives a name to exactly one of two people racing for it", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const results = await Promise.allSettled([
      changeHandle(db(), a.id, "wanted"),
      changeHandle(db(), b.id, "wanted"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(isCoreError(failed.reason)).toBe(true);
    expect(failed.reason.code).toBe("CONFLICT");
  });
});

describe("saveProfile", () => {
  it("changes nothing when any one field is refused", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await makeAccount({ handle: "taken" });
    await expectCode(
      saveProfile(db(), anna.id, { displayName: "New", handle: "anna_new", bio: "b".repeat(161) }),
      "INVALID",
    );
    await expectCode(
      saveProfile(db(), anna.id, { displayName: "New", handle: "taken", bio: "ok" }),
      "CONFLICT",
    );
    const row = await accountRow(anna.id);
    expect(row!.handle).toBe("anna");
    expect(row!.displayName).toBe(anna.displayName);
    expect(row!.bio).toBe(anna.bio);
  });

  it("saves name, username and bio together", async () => {
    const anna = await makeAccount({ handle: "anna" });
    expect(
      await saveProfile(db(), anna.id, {
        displayName: "FICTIONAL Anna K",
        handle: "Anna_K",
        bio: "Hello.",
      }),
    ).toEqual({ handle: "anna_k" });
    const row = await accountRow(anna.id);
    expect([row!.displayName, row!.handle, row!.bio]).toEqual([
      "FICTIONAL Anna K",
      "anna_k",
      "Hello.",
    ]);
  });
});

/* ------------------------------------------------------------ settings */

describe("setAcceptsFollowers", () => {
  it("refuses a value that is not a boolean, and a suspended account", async () => {
    const anna = await makeAccount();
    await expectCode(setAcceptsFollowers(db(), anna.id, "false" as unknown as boolean), "INVALID");
    const sam = await makeAccount({ suspended: true });
    await expectCode(setAcceptsFollowers(db(), sam.id, true), "NOT_FOUND");
  });

  it("off deletes every follow of the account, and followers lose 'followers' posts at once", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    const fan1 = await makeAccount();
    const fan2 = await makeAccount();
    const friend = await makeAccount();
    const other = await makeAccount({ acceptsFollowers: true });
    await follow(fan1, anna);
    await follow(fan2, anna);
    await follow(anna, other); // Anna's own follows are not touched.
    await befriend(anna, friend);
    const p = await post(anna, { audience: "followers" });
    expect(await canSeePost(db(), fan1.id, p.id)).not.toBeNull();

    await setAcceptsFollowers(db(), anna.id, false);

    const left = await db()
      .select()
      .from(follows)
      .where(or(eq(follows.followeeId, anna.id), eq(follows.followerId, anna.id)));
    expect(left).toEqual([
      expect.objectContaining({ followerId: anna.id, followeeId: other.id }),
    ]);
    expect((await accountRow(anna.id))!.acceptsFollowers).toBe(false);
    expect(await canSeePost(db(), fan1.id, p.id)).toBeNull();
    // Friends still see it; the audience is not rewritten.
    expect(await canSeePost(db(), friend.id, p.id)).not.toBeNull();
    const [still] = await db().select().from(posts).where(eq(posts.id, p.id));
    expect(still!.audience).toBe("followers");

    // Turning it back on restores nobody.
    await setAcceptsFollowers(db(), anna.id, true);
    expect(await canSeePost(db(), fan1.id, p.id)).toBeNull();
    expect((await accountRow(anna.id))!.acceptsFollowers).toBe(true);
  });
});

describe("setWeeklyEmail", () => {
  it("refuses a value that is not a boolean, and a suspended account", async () => {
    const anna = await makeAccount();
    await expectCode(setWeeklyEmail(db(), anna.id, 0 as unknown as boolean), "INVALID");
    const sam = await makeAccount({ suspended: true });
    await expectCode(setWeeklyEmail(db(), sam.id, false), "NOT_FOUND");
  });

  it("turns the weekly email off and on for the caller only", async () => {
    const anna = await makeAccount();
    const petr = await makeAccount();
    await setWeeklyEmail(db(), anna.id, false);
    expect((await accountRow(anna.id))!.weeklyEmail).toBe(false);
    expect((await accountRow(petr.id))!.weeklyEmail).toBe(true);
    await setWeeklyEmail(db(), anna.id, true);
    expect((await accountRow(anna.id))!.weeklyEmail).toBe(true);
  });
});

/* ------------------------------------------------------------- deletion */

describe("deleteAccount: refusals", () => {
  it("refuses a wrong confirmation with INVALID and deletes nothing", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await post(anna);
    for (const typed of ["", "ann", "anna2", "someone"]) {
      await expectCode(deleteAccount(db(), anna.id, typed), "INVALID");
    }
    await expectCode(deleteAccount(db(), anna.id, undefined as unknown as string), "INVALID");
    expect(await accountRow(anna.id)).not.toBeNull();
    expect(await db().select().from(posts)).toHaveLength(1);
  });

  it("cannot delete anyone else: another person's handle is only a wrong confirmation", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const petr = await makeAccount({ handle: "petr" });
    await expectCode(deleteAccount(db(), anna.id, "petr"), "INVALID");
    expect(await accountRow(petr.id)).not.toBeNull();
    expect(await accountRow(anna.id)).not.toBeNull();
  });

  it("refuses an unknown or suspended account with NOT_FOUND", async () => {
    await expectCode(deleteAccount(db(), "01NOSUCHACCOUNT", "nobody"), "NOT_FOUND");
    const sam = await makeAccount({ handle: "sam", suspended: true });
    await expectCode(deleteAccount(db(), sam.id, "sam"), "NOT_FOUND");
    expect(await accountRow(sam.id)).not.toBeNull();
  });
});

describe("deleteAccount: what goes", () => {
  it("removes posts, replies, likes, friendships, follows, blocks, mutes, sessions, notifications, invites and requests; reports keep a null reporter", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: true });
    const petr = await makeAccount({ handle: "petr", acceptsFollowers: true });
    const eva = await makeAccount({ handle: "eva" });
    const invitee = await makeAccount({ handle: "invitee", invitedBy: anna });

    // Anna's posts, with a reply and a like from someone else on them.
    const annaPost = await post(anna, { body: "FICTIONAL post by Anna" });
    const petrPost = await post(petr, { body: "FICTIONAL post by Petr" });
    const petrReplyOnAnna = await reply(petr.id, annaPost.id);
    await likePost(petr.id, annaPost.id);
    // Anna's reply and like on Petr's post.
    await reply(anna.id, petrPost.id);
    await likePost(anna.id, petrPost.id);
    // Connections both ways.
    await befriend(anna, petr);
    await follow(anna, petr);
    await follow(petr, anna);
    await block(anna, eva);
    await block(eva, anna);
    await mute(anna, petr);
    await mute(petr, anna);
    await friendRequest(anna.id, eva.id);
    await friendRequest(invitee.id, anna.id);
    // Sessions.
    const session = await createSession(db(), anna.id, t0);
    const petrSession = await createSession(db(), petr.id, t0);
    // Notifications to and from Anna.
    await notification(anna.id, petr.id);
    await notification(petr.id, anna.id);
    await notification(petr.id, null, annaPost.id);
    // Invites: one of Anna's, with a pending join and a join link on it;
    // and one of Petr's that Anna used.
    const annaInvite = await invite(anna.id);
    await createPendingJoin(db(), { email: "someone@example.test", inviteId: annaInvite.id, now: t0 });
    await createEmailToken(db(), {
      email: "someone@example.test",
      purpose: "join",
      inviteId: annaInvite.id,
      now: t0,
    });
    const petrInvite = await invite(petr.id, anna.id);
    // A sign-in link and development mail to Anna's address, and a mail log row.
    await createEmailToken(db(), { email: anna.email, purpose: "sign_in", now: t0 });
    await sendMail(db(), {
      to: anna.email,
      subject: "FICTIONAL",
      body: "FICTIONAL",
      kind: "sign_in",
      accountId: anna.id,
    });
    await db()
      .insert(digestDeliveries)
      .values({ accountId: anna.id, weekStart: "2026-08-31", status: "skipped" });
    // Reports by Anna, and about Anna and her post.
    const byAnna = await report({
      reporterId: anna.id,
      targetKind: "post",
      targetPostId: petrPost.id,
    });
    const aboutAnna = await report({
      reporterId: petr.id,
      targetKind: "account",
      targetAccountId: anna.id,
    });
    const aboutAnnaPost = await report({
      reporterId: petr.id,
      targetKind: "post",
      targetPostId: annaPost.id,
    });

    await deleteAccount(db(), anna.id, "@Anna");

    expect(await accountRow(anna.id)).toBeNull();
    const d = db();
    expect(await d.select().from(posts).where(eq(posts.authorId, anna.id))).toEqual([]);
    expect(await d.select().from(replies).where(eq(replies.authorId, anna.id))).toEqual([]);
    // Replies on her posts go with the posts.
    expect(await d.select().from(replies).where(eq(replies.id, petrReplyOnAnna.id))).toEqual([]);
    expect(
      await d
        .select()
        .from(likes)
        .where(or(eq(likes.accountId, anna.id), eq(likes.postId, annaPost.id))),
    ).toEqual([]);
    expect(
      await d
        .select()
        .from(friendships)
        .where(or(eq(friendships.aId, anna.id), eq(friendships.bId, anna.id))),
    ).toEqual([]);
    expect(
      await d
        .select()
        .from(follows)
        .where(or(eq(follows.followerId, anna.id), eq(follows.followeeId, anna.id))),
    ).toEqual([]);
    expect(
      await d
        .select()
        .from(blocks)
        .where(or(eq(blocks.blockerId, anna.id), eq(blocks.blockedId, anna.id))),
    ).toEqual([]);
    expect(
      await d
        .select()
        .from(mutes)
        .where(or(eq(mutes.muterId, anna.id), eq(mutes.mutedId, anna.id))),
    ).toEqual([]);
    expect(
      await d
        .select()
        .from(friendRequests)
        .where(or(eq(friendRequests.fromId, anna.id), eq(friendRequests.toId, anna.id))),
    ).toEqual([]);
    expect(await d.select().from(sessions).where(eq(sessions.accountId, anna.id))).toEqual([]);
    expect(await sessionFromCookie(d, session.cookieValue, t0)).toBeNull();
    expect(
      await d
        .select()
        .from(notifications)
        .where(
          or(
            eq(notifications.recipientId, anna.id),
            eq(notifications.actorId, anna.id),
            eq(notifications.postId, annaPost.id),
          ),
        ),
    ).toEqual([]);
    expect(await d.select().from(invites).where(eq(invites.inviterId, anna.id))).toEqual([]);
    expect(await d.select().from(pendingJoins)).toEqual([]);
    expect(await d.select().from(emailTokens)).toEqual([]);
    expect(await d.select().from(outbox).where(eq(outbox.toAddress, anna.email))).toEqual([]);
    expect(
      await d.select().from(digestDeliveries).where(eq(digestDeliveries.accountId, anna.id)),
    ).toEqual([]);

    // Reports stay; the ones Anna made keep a null reporter, and the ones
    // about her lose their target.
    const reportRows = await d.select().from(reports);
    expect(reportRows).toHaveLength(3);
    const byId = new Map(reportRows.map((r) => [r.id, r]));
    expect(byId.get(byAnna.id)!.reporterId).toBeNull();
    expect(byId.get(byAnna.id)!.targetPostId).toBe(petrPost.id);
    expect(byId.get(aboutAnna.id)!.targetAccountId).toBeNull();
    expect(byId.get(aboutAnna.id)!.reporterId).toBe(petr.id);
    expect(byId.get(aboutAnnaPost.id)!.targetPostId).toBeNull();
    // The mail log keeps its row, without the account.
    const logRows = await d.select().from(mailLog);
    expect(logRows).toHaveLength(1);
    expect(logRows[0]!.accountId).toBeNull();

    // Everyone else keeps what is theirs.
    expect(await accountRow(petr.id)).not.toBeNull();
    expect(await accountRow(eva.id)).not.toBeNull();
    expect((await accountRow(invitee.id))!.invitedBy).toBeNull();
    expect(await d.select().from(posts).where(eq(posts.id, petrPost.id))).toHaveLength(1);
    const [usedInvite] = await d.select().from(invites).where(eq(invites.id, petrInvite.id));
    expect(usedInvite!.usedBy).toBeNull();
    expect(usedInvite!.usedAt).not.toBeNull();
    expect(await sessionFromCookie(d, petrSession.cookieValue, t0)).toBe(petr.id);
  });
});
