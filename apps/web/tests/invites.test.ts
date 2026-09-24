/**
 * Invites and joining (SPEC §5 `invites`, §8 "Join from an invite",
 * "Controller gate", "Invites"). Denial paths first. Everyone here is
 * FICTIONAL, with example.test addresses.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeEmailToken,
  createPendingJoin,
  sessionFromCookie,
} from "@/core/auth";
import { sendFriendRequest } from "@/core/connections";
import { isCoreError } from "@/core/errors";
import { sha256 } from "@/core/ids";
import {
  completeJoin,
  createInvite,
  describePendingJoin,
  EMAIL_TAKEN,
  HANDLE_TAKEN,
  INVITE_UNUSABLE,
  inviteForViewer,
  listInvites,
  lookupInvite,
  requestJoin,
  revokeInvite,
  applyInviteAsExisting,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import {
  accounts,
  emailTokens,
  friendRequests,
  friendships,
  invites,
  notifications,
  outbox,
  pendingJoins,
  rateEvents,
} from "@/core/schema";
import { areFriends } from "@/core/visibility";
import * as fx from "./helpers";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(reset);
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");
const IP = "ip-hash-FICTIONAL";

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return error as Error & { code: string };
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

function closeAccountCreation() {
  vi.stubEnv("DATA_CONTROLLER", "");
  vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
}

async function remaining(accountId: string): Promise<number> {
  const [row] = await db()
    .select({ n: accounts.invitesRemaining })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row!.n;
}

async function inviteRow(id: string) {
  const [row] = await db().select().from(invites).where(eq(invites.id, id));
  return row!;
}

/** Anna, an inviter, and a fresh invite of hers. */
async function annaWithInvite(options: { note?: string; invites?: number } = {}) {
  const anna = await makeAccount({
    handle: "anna",
    displayName: "Anna FICTIONAL",
    invitesRemaining: options.invites ?? 10,
  });
  const invite = await createInvite(db(), anna.id, { note: options.note, now: t0 });
  return { anna, invite };
}

/** A pending join for an email and invite, as /auth would create it. */
async function pendingFor(email: string, inviteId: string, now = t0) {
  return createPendingJoin(db(), { email, inviteId, now });
}

/* ------------------------------------------------------- creating invites */

describe("createInvite: refusals and accounting", () => {
  it("is refused at 0 remaining (FORBIDDEN), and creates nothing", async () => {
    const anna = await makeAccount({ handle: "anna", invitesRemaining: 0 });
    await expectCode(createInvite(db(), anna.id, { now: t0 }), "FORBIDDEN");
    expect(await db().select().from(invites)).toHaveLength(0);
    expect(await remaining(anna.id)).toBe(0);
  });

  it("refuses a note over 40 characters (INVALID)", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await expectCode(createInvite(db(), anna.id, { note: "x".repeat(41), now: t0 }), "INVALID");
    expect(await remaining(anna.id)).toBe(10);
  });

  it("refuses a suspended inviter (FORBIDDEN)", async () => {
    const sam = await makeAccount({ handle: "sam", suspended: true });
    await expectCode(createInvite(db(), sam.id, { now: t0 }), "FORBIDDEN");
  });

  it("rate-limits to 20 invites a day", async () => {
    const anna = await makeAccount({ handle: "anna", invitesRemaining: 50 });
    for (let i = 0; i < 20; i++) {
      await createInvite(db(), anna.id, { now: plus.minutes(t0, i) });
    }
    await expectCode(createInvite(db(), anna.id, { now: plus.minutes(t0, 30) }), "RATE_LIMITED");
    expect(await remaining(anna.id)).toBe(30);
    await expect(createInvite(db(), anna.id, { now: plus.hours(t0, 25) })).resolves.toBeTruthy();
  });

  it("decrements the count; the last one takes it to 0, and the next is refused", async () => {
    const anna = await makeAccount({ handle: "anna", invitesRemaining: 2 });
    await createInvite(db(), anna.id, { now: t0 });
    expect(await remaining(anna.id)).toBe(1);
    await createInvite(db(), anna.id, { now: t0 });
    expect(await remaining(anna.id)).toBe(0);
    await expectCode(createInvite(db(), anna.id, { now: t0 }), "FORBIDDEN");
  });

  it("two creations racing for the last invite: exactly one succeeds", async () => {
    const anna = await makeAccount({ handle: "anna", invitesRemaining: 1 });
    const results = await Promise.allSettled([
      createInvite(db(), anna.id, { now: t0 }),
      createInvite(db(), anna.id, { now: t0 }),
      createInvite(db(), anna.id, { now: t0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await remaining(anna.id)).toBe(0);
    expect(await db().select().from(invites)).toHaveLength(1);
  });

  it("stores the code only as its sha256; the code is 22 characters, shown once", async () => {
    const { invite } = await annaWithInvite({ note: "for Mara" });
    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const rows = await db().select().from(invites);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.codeHash).toBe(sha256(invite.code));
    expect(JSON.stringify(rows)).not.toContain(invite.code);
    expect(rows[0]!.note).toBe("for Mara");
    expect(rows[0]!.expiresAt.toISOString()).toBe(plus.days(t0, 30).toISOString());
    // listing never returns the code
    const list = await listInvites(db(), rows[0]!.inviterId, t0);
    expect(JSON.stringify(list)).not.toContain(invite.code);
  });
});

describe("revokeInvite", () => {
  it("refunds one, and the link stops working", async () => {
    const { anna, invite } = await annaWithInvite();
    expect(await remaining(anna.id)).toBe(9);
    await revokeInvite(db(), anna.id, invite.id, plus.hours(t0, 1));
    expect(await remaining(anna.id)).toBe(10);
    expect(await lookupInvite(db(), invite.code, plus.hours(t0, 2))).toBeNull();
    const list = await listInvites(db(), anna.id, plus.hours(t0, 2));
    expect(list.invites[0]!.status).toBe("revoked");
  });

  it("revoking twice refunds once", async () => {
    const { anna, invite } = await annaWithInvite();
    await revokeInvite(db(), anna.id, invite.id, t0);
    await revokeInvite(db(), anna.id, invite.id, t0);
    expect(await remaining(anna.id)).toBe(10);
  });

  it("someone else's invite is NOT_FOUND and stays usable", async () => {
    const { invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    await expectCode(revokeInvite(db(), ben.id, invite.id, t0), "NOT_FOUND");
    expect(await lookupInvite(db(), invite.code, t0)).not.toBeNull();
    expect(await remaining(ben.id)).toBe(10);
  });

  it("a used invite cannot be revoked (CONFLICT), and nothing is refunded", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    await applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 });
    await expectCode(revokeInvite(db(), anna.id, invite.id, t0), "CONFLICT");
    expect(await remaining(anna.id)).toBe(9);
  });
});

describe("listInvites and the lazy refund", () => {
  it("an invite that expires unused is marked expired and refunded lazily, once", async () => {
    const { anna, invite } = await annaWithInvite();
    expect(await remaining(anna.id)).toBe(9);
    // Nothing happens by itself at expiry...
    expect(await remaining(anna.id)).toBe(9);
    const later = plus.days(t0, 31);
    const list = await listInvites(db(), anna.id, later);
    expect(list.remaining).toBe(10);
    expect(list.invites).toHaveLength(1);
    expect(list.invites[0]!.status).toBe("expired");
    const row = await inviteRow(invite.id);
    expect(row.revokedAt?.toISOString()).toBe(row.expiresAt.toISOString());
    // Listing again does not refund again.
    await listInvites(db(), anna.id, plus.days(t0, 32));
    expect(await remaining(anna.id)).toBe(10);
    // Revoking an expired invite does not refund either.
    await revokeInvite(db(), anna.id, invite.id, plus.days(t0, 33));
    expect(await remaining(anna.id)).toBe(10);
  });

  it("creating an invite refunds expired ones first, so 0 left plus an expired one can create", async () => {
    const anna = await makeAccount({ handle: "anna", invitesRemaining: 1 });
    await createInvite(db(), anna.id, { now: t0 });
    expect(await remaining(anna.id)).toBe(0);
    await expectCode(createInvite(db(), anna.id, { now: plus.days(t0, 29) }), "FORBIDDEN");
    await expect(createInvite(db(), anna.id, { now: plus.days(t0, 30) })).resolves.toBeTruthy();
    expect(await remaining(anna.id)).toBe(0);
  });

  it("an expired invite cannot be used", async () => {
    const { invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    expect(await lookupInvite(db(), invite.code, plus.days(t0, 30))).toBeNull();
    await expectCode(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: plus.days(t0, 30) }),
      "NOT_FOUND",
    );
  });

  it("lists statuses newest first: waiting, used by @handle, revoked, expired", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const ben = await makeAccount({ handle: "ben" });
    const expired = await createInvite(db(), anna.id, { note: "old", now: plus.days(t0, -40) });
    const revoked = await createInvite(db(), anna.id, { note: "revoked", now: t0 });
    const used = await createInvite(db(), anna.id, { note: "for Ben", now: plus.minutes(t0, 1) });
    const waiting = await createInvite(db(), anna.id, { note: "", now: plus.minutes(t0, 2) });
    await revokeInvite(db(), anna.id, revoked.id, plus.minutes(t0, 3));
    await applyInviteAsExisting(db(), { accountId: ben.id, inviteId: used.id, now: plus.minutes(t0, 4) });

    const list = await listInvites(db(), anna.id, plus.minutes(t0, 5));
    expect(list.invites.map((i) => [i.id, i.status, i.usedByHandle])).toEqual([
      [waiting.id, "waiting", null],
      [used.id, "used", "ben"],
      [revoked.id, "revoked", null],
      [expired.id, "expired", null],
    ]);
    // 10 − 4 created + 1 revoked + 1 expired
    expect(list.remaining).toBe(8);
    expect(list.invites[1]!.note).toBe("for Ben");
  });

  it("lists only your own invites", async () => {
    await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    expect((await listInvites(db(), ben.id, t0)).invites).toHaveLength(0);
  });
});

/* ----------------------------------------------------------- the link */

describe("lookupInvite: one answer for everything unusable", () => {
  it("unknown, malformed, used, expired, revoked, inviter suspended or deleted: all null", async () => {
    const { anna, invite } = await annaWithInvite();
    expect(await lookupInvite(db(), "AAAAAAAAAAAAAAAAAAAAAA", t0)).toBeNull();
    expect(await lookupInvite(db(), "", t0)).toBeNull();
    expect(await lookupInvite(db(), "../../etc/passwd", t0)).toBeNull();
    expect(await lookupInvite(db(), "x".repeat(500), t0)).toBeNull();
    expect(await lookupInvite(db(), invite.code, plus.days(t0, 30))).toBeNull();

    // valid
    const found = await lookupInvite(db(), invite.code, t0);
    expect(found).toMatchObject({
      inviteId: invite.id,
      inviter: { id: anna.id, handle: "anna", displayName: "Anna FICTIONAL" },
      isOwn: false,
      note: null,
    });

    // inviter suspended
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, anna.id));
    expect(await lookupInvite(db(), invite.code, t0)).toBeNull();
    await db().update(accounts).set({ suspendedAt: null }).where(eq(accounts.id, anna.id));

    // used
    const ben = await makeAccount({ handle: "ben" });
    await applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 });
    expect(await lookupInvite(db(), invite.code, t0)).toBeNull();

    // revoked
    const second = await createInvite(db(), anna.id, { now: t0 });
    await revokeInvite(db(), anna.id, second.id, t0);
    expect(await lookupInvite(db(), second.code, t0)).toBeNull();

    // inviter gone: the invite goes with the account
    const third = await createInvite(db(), anna.id, { now: t0 });
    await db().delete(accounts).where(eq(accounts.id, anna.id));
    expect(await lookupInvite(db(), third.code, t0)).toBeNull();
  });

  it("the private note is given only to the inviter", async () => {
    const { anna, invite } = await annaWithInvite({ note: "for Mara" });
    const ben = await makeAccount({ handle: "ben" });
    expect((await lookupInvite(db(), invite.code, t0))!.note).toBeNull();
    expect((await lookupInvite(db(), invite.code, t0, ben.id))!.note).toBeNull();
    const own = await lookupInvite(db(), invite.code, t0, anna.id);
    expect(own).toMatchObject({ isOwn: true, note: "for Mara" });
  });
});

describe("inviteForViewer: what /i/<code> shows", () => {
  it("blocked either way looks exactly like an unusable invite", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await fx.block(anna, ben);
    await fx.block(cleo, anna);
    expect(await inviteForViewer(db(), { code: invite.code, viewerId: ben.id, now: t0 })).toEqual({
      kind: "unusable",
    });
    expect(await inviteForViewer(db(), { code: invite.code, viewerId: cleo.id, now: t0 })).toEqual({
      kind: "unusable",
    });
    expect(await inviteForViewer(db(), { code: "nope-nope-nope-nope-nope", viewerId: ben.id, now: t0 })).toEqual({
      kind: "unusable",
    });
  });

  it("signed out and no controller named: closed (no form)", async () => {
    const { invite } = await annaWithInvite();
    closeAccountCreation();
    const state = await inviteForViewer(db(), { code: invite.code, viewerId: null, now: t0 });
    expect(state.kind).toBe("closed");
  });

  it("signed out and a controller named: the email form", async () => {
    const { invite } = await annaWithInvite();
    const state = await inviteForViewer(db(), { code: invite.code, viewerId: null, now: t0 });
    expect(state.kind).toBe("can_join");
    if (state.kind === "can_join") expect(state.invite.note).toBeNull();
  });

  it("your own invite, with its note", async () => {
    const { anna, invite } = await annaWithInvite({ note: "for Mara" });
    expect(await inviteForViewer(db(), { code: invite.code, viewerId: anna.id, now: t0 })).toMatchObject({
      kind: "own",
      note: "for Mara",
    });
  });

  it("already friends, and otherwise the add button", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await fx.befriend(anna, ben);
    expect((await inviteForViewer(db(), { code: invite.code, viewerId: ben.id, now: t0 })).kind).toBe(
      "already_friends",
    );
    expect((await inviteForViewer(db(), { code: invite.code, viewerId: cleo.id, now: t0 })).kind).toBe(
      "can_add",
    );
  });
});

/* ------------------------------------------- an existing account uses it */

describe("useInviteAsExisting", () => {
  it("blocked either way is the generic NOT_FOUND, and does not consume the invite", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await fx.block(anna, ben);
    await fx.block(cleo, anna);
    const e1 = await expectCode(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 }),
      "NOT_FOUND",
    );
    const e2 = await expectCode(
      applyInviteAsExisting(db(), { accountId: cleo.id, inviteId: invite.id, now: t0 }),
      "NOT_FOUND",
    );
    expect(e1.message).toBe(INVITE_UNUSABLE);
    expect(e2.message).toBe(INVITE_UNUSABLE);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    expect(await db().select().from(friendships)).toHaveLength(0);
  });

  it("an existing friend does not consume it", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    await fx.befriend(anna, ben);
    await expect(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 }),
    ).resolves.toEqual({ status: "already_friends" });
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    expect(await lookupInvite(db(), invite.code, t0)).not.toBeNull();
    expect(await remaining(anna.id)).toBe(9);
  });

  it("your own invite is not consumed", async () => {
    const { anna, invite } = await annaWithInvite();
    await expect(
      applyInviteAsExisting(db(), { accountId: anna.id, inviteId: invite.id, now: t0 }),
    ).resolves.toEqual({ status: "own_invite" });
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("an unknown invite id is NOT_FOUND", async () => {
    const ben = await makeAccount({ handle: "ben" });
    await expectCode(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: "nope", now: t0 }),
      "NOT_FOUND",
    );
  });

  it("makes friends, marks the invite used by that account, and works once", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    await expect(
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 }),
    ).resolves.toEqual({ status: "friends" });
    expect(await areFriends(db(), anna.id, ben.id)).toBe(true);
    const row = await inviteRow(invite.id);
    expect(row.usedBy).toBe(ben.id);
    expect(row.usedAt?.toISOString()).toBe(t0.toISOString());
    const n = await db().select().from(notifications).where(eq(notifications.recipientId, anna.id));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: "friend_accepted", actorId: ben.id });

    // a second person cannot use it
    const again = await expectCode(
      applyInviteAsExisting(db(), { accountId: cleo.id, inviteId: invite.id, now: t0 }),
      "NOT_FOUND",
    );
    expect(again.message).toBe(INVITE_UNUSABLE);
    expect(await areFriends(db(), anna.id, cleo.id)).toBe(false);
  });

  it("resolves a pending friend request between the two as accepted", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    await sendFriendRequest(db(), ben.id, anna.id, t0);
    await applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 });
    const rows = await db().select().from(friendRequests);
    expect(rows.map((r) => r.status)).toEqual(["accepted"]);
  });

  it("two people racing for one invite: exactly one becomes a friend", async () => {
    const { anna, invite } = await annaWithInvite();
    const ben = await makeAccount({ handle: "ben" });
    const cleo = await makeAccount({ handle: "cleo" });
    const results = await Promise.allSettled([
      applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 }),
      applyInviteAsExisting(db(), { accountId: cleo.id, inviteId: invite.id, now: t0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const pairs = await db().select().from(friendships);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.aId, pairs[0]!.bId]).toContain(anna.id);
  });
});

/* ------------------------------------------------------------ requestJoin */

describe("requestJoin", () => {
  it("is refused with CLOSED while no controller is named, and sends nothing", async () => {
    const { invite } = await annaWithInvite();
    closeAccountCreation();
    await expectCode(
      requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: IP, now: t0 }),
      "CLOSED",
    );
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect(await db().select().from(emailTokens)).toHaveLength(0);
  });

  it("is CLOSED when only one of the two controller variables is set", async () => {
    const { invite } = await annaWithInvite();
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    await expectCode(
      requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: IP, now: t0 }),
      "CLOSED",
    );
  });

  it("refuses an invalid email (INVALID)", async () => {
    const { invite } = await annaWithInvite();
    await expectCode(
      requestJoin(db(), { code: invite.code, email: "not an email", ipHash: IP, now: t0 }),
      "INVALID",
    );
  });

  it("an unusable invite is the generic NOT_FOUND, and sends nothing", async () => {
    const { anna, invite } = await annaWithInvite();
    await revokeInvite(db(), anna.id, invite.id, t0);
    const e = await expectCode(
      requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: IP, now: t0 }),
      "NOT_FOUND",
    );
    expect(e.message).toBe(INVITE_UNUSABLE);
    expect(await db().select().from(outbox)).toHaveLength(0);
  });

  it("rate-limits 3 an hour per email (keyed by HMAC, not the address)", async () => {
    const { invite } = await annaWithInvite();
    for (let i = 0; i < 3; i++) {
      await requestJoin(db(), { code: invite.code, email: "Mara@Example.test", ipHash: `ip${i}`, now: plus.minutes(t0, i) });
    }
    await expectCode(
      requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: "ip9", now: plus.minutes(t0, 10) }),
      "RATE_LIMITED",
    );
    expect(await db().select().from(outbox)).toHaveLength(3);
    const keys = (await db().select({ key: rateEvents.key }).from(rateEvents)).map((r) => r.key);
    expect(keys).toContain(`join:email:${rateKeyHash("mara@example.test")}`);
    expect(keys.join(" ")).not.toContain("mara");
    // An hour later it works again.
    await expect(
      requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: "ip9", now: plus.minutes(t0, 61) }),
    ).resolves.toBeUndefined();
  });

  it("rate-limits 10 an hour per IP hash, across addresses", async () => {
    const { invite } = await annaWithInvite();
    for (let i = 0; i < 10; i++) {
      await requestJoin(db(), { code: invite.code, email: `p${i}@example.test`, ipHash: IP, now: t0 });
    }
    await expectCode(
      requestJoin(db(), { code: invite.code, email: "p10@example.test", ipHash: IP, now: t0 }),
      "RATE_LIMITED",
    );
  });

  it("sends a single-use join link (outbox only) that carries the invite", async () => {
    const { invite } = await annaWithInvite();
    await requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: IP, now: t0 });
    const mail = await latestOutbox(db(), "mara@example.test", "join");
    expect(mail).not.toBeNull();
    expect(mail!.subject).toContain("Anna FICTIONAL");
    expect(mail!.body).toContain("http://localhost:3000/auth#");
    const token = tokenFromLink(mail!.body)!;
    expect(token).toBeTruthy();
    const used = await consumeEmailToken(db(), token, plus.minutes(t0, 1));
    expect(used).toEqual({ email: "mara@example.test", purpose: "join", inviteId: invite.id });
    await expectCode(consumeEmailToken(db(), token, plus.minutes(t0, 2)), "NOT_FOUND");
  });

  it("an address with an existing account also gets the link (the answer never differs)", async () => {
    const { invite } = await annaWithInvite();
    await makeAccount({ handle: "ben", email: "ben@example.test" });
    await requestJoin(db(), { code: invite.code, email: "ben@example.test", ipHash: IP, now: t0 });
    expect(await latestOutbox(db(), "ben@example.test", "join")).not.toBeNull();
  });

  it("an address whose account is suspended gets nothing, with the same answer", async () => {
    const { invite } = await annaWithInvite();
    await makeAccount({ handle: "sam", email: "sam@example.test", suspended: true });
    await expect(
      requestJoin(db(), { code: invite.code, email: "sam@example.test", ipHash: IP, now: t0 }),
    ).resolves.toBeUndefined();
    expect(await latestOutbox(db(), "sam@example.test")).toBeNull();
  });
});

/* ----------------------------------------------------------- completeJoin */

describe("completeJoin: refusals", () => {
  it("is refused with CLOSED while no controller is named, and creates nothing", async () => {
    const { invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    closeAccountCreation();
    await expectCode(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara", adultConfirmed: true, now: t0 }),
      "CLOSED",
    );
    expect(await db().select().from(accounts).where(eq(accounts.handle, "mara"))).toHaveLength(0);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("requires the 18+ confirmation (INVALID)", async () => {
    const { invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    await expectCode(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara", adultConfirmed: false, now: t0 }),
      "INVALID",
    );
  });

  it("refuses bad and reserved handles and empty names (INVALID)", async () => {
    const { invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    const base = { pendingJoinId: pj.id, displayName: "Mara", adultConfirmed: true, now: t0 };
    await expectCode(completeJoin(db(), { ...base, handle: "admin" }), "INVALID");
    await expectCode(completeJoin(db(), { ...base, handle: "no spaces" }), "INVALID");
    await expectCode(completeJoin(db(), { ...base, handle: "ab" }), "INVALID");
    await expectCode(completeJoin(db(), { ...base, handle: "mara", displayName: "   " }), "INVALID");
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("refuses when the invite was used meanwhile (NOT_FOUND), creating nothing", async () => {
    const { invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    const ben = await makeAccount({ handle: "ben" });
    await applyInviteAsExisting(db(), { accountId: ben.id, inviteId: invite.id, now: t0 });
    const e = await expectCode(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara", adultConfirmed: true, now: t0 }),
      "NOT_FOUND",
    );
    expect(e.message).toBe(INVITE_UNUSABLE);
    expect(await db().select().from(accounts).where(eq(accounts.handle, "mara"))).toHaveLength(0);
  });

  it("refuses when the invite was revoked, expired, or its inviter suspended meanwhile", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const revoked = await createInvite(db(), anna.id, { now: t0 });
    const expiring = await createInvite(db(), anna.id, { now: t0 });
    await revokeInvite(db(), anna.id, revoked.id, t0);
    const pj1 = await pendingFor("m1@example.test", revoked.id);
    await expectCode(
      completeJoin(db(), { pendingJoinId: pj1.id, displayName: "M", handle: "m_one", adultConfirmed: true, now: t0 }),
      "NOT_FOUND",
    );
    const late = plus.days(t0, 30);
    const pj2 = await pendingFor("m2@example.test", expiring.id, plus.minutes(late, -30));
    await expectCode(
      completeJoin(db(), { pendingJoinId: pj2.id, displayName: "M", handle: "m_two", adultConfirmed: true, now: late }),
      "NOT_FOUND",
    );
    const third = await createInvite(db(), anna.id, { now: t0 });
    const pj3 = await pendingFor("m3@example.test", third.id);
    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, anna.id));
    await expectCode(
      completeJoin(db(), { pendingJoinId: pj3.id, displayName: "M", handle: "m_three", adultConfirmed: true, now: t0 }),
      "NOT_FOUND",
    );
    expect(await db().select().from(accounts)).toHaveLength(1);
  });

  it("refuses when the handle is taken (CONFLICT), and the invite stays usable", async () => {
    const { invite } = await annaWithInvite();
    await makeAccount({ handle: "mara", email: "another.mara@example.test" });
    const pj = await pendingFor("mara@example.test", invite.id);
    const e = await expectCode(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "Mara", adultConfirmed: true, now: t0 }),
      "CONFLICT",
    );
    expect(e.message).toBe(HANDLE_TAKEN);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    expect(await db().select().from(friendships)).toHaveLength(0);
    // the pending join is still open, so another handle works
    await expect(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara_k", adultConfirmed: true, now: t0 }),
    ).resolves.toBeTruthy();
  });

  it("refuses when the email is taken meanwhile (CONFLICT)", async () => {
    const { invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    await makeAccount({ handle: "someone", email: "mara@example.test" });
    const e = await expectCode(
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara", adultConfirmed: true, now: t0 }),
      "CONFLICT",
    );
    expect(e.message).toBe(EMAIL_TAKEN);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("refuses an unknown, expired or completed pending join (NOT_FOUND)", async () => {
    const { invite } = await annaWithInvite();
    const base = { displayName: "Mara", adultConfirmed: true };
    await expectCode(completeJoin(db(), { ...base, pendingJoinId: "nope", handle: "mara", now: t0 }), "NOT_FOUND");
    const pj = await pendingFor("mara@example.test", invite.id);
    await expectCode(
      completeJoin(db(), { ...base, pendingJoinId: pj.id, handle: "mara", now: plus.minutes(t0, 61) }),
      "NOT_FOUND",
    );
    await completeJoin(db(), { ...base, pendingJoinId: pj.id, handle: "mara", now: t0 });
    await expectCode(
      completeJoin(db(), { ...base, pendingJoinId: pj.id, handle: "mara_two", now: t0 }),
      "NOT_FOUND",
    );
  });

  it("two pending joins racing for one invite: exactly one account is created", async () => {
    const { invite } = await annaWithInvite();
    const a = await pendingFor("m1@example.test", invite.id);
    const b = await pendingFor("m2@example.test", invite.id);
    const results = await Promise.allSettled([
      completeJoin(db(), { pendingJoinId: a.id, displayName: "M1", handle: "m_one", adultConfirmed: true, now: t0 }),
      completeJoin(db(), { pendingJoinId: b.id, displayName: "M2", handle: "m_two", adultConfirmed: true, now: t0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(accounts)).toHaveLength(2); // anna + one
  });

  it("two joins racing for one handle: one wins, the other is CONFLICT", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const i1 = await createInvite(db(), anna.id, { now: t0 });
    const i2 = await createInvite(db(), anna.id, { now: t0 });
    const a = await pendingFor("m1@example.test", i1.id);
    const b = await pendingFor("m2@example.test", i2.id);
    const results = await Promise.allSettled([
      completeJoin(db(), { pendingJoinId: a.id, displayName: "M1", handle: "same", adultConfirmed: true, now: t0 }),
      completeJoin(db(), { pendingJoinId: b.id, displayName: "M2", handle: "same", adultConfirmed: true, now: t0 }),
    ]);
    const failed = results.filter((r) => r.status === "rejected");
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    expect(isCoreError(reason)).toBe(true);
    expect(reason.code).toBe("CONFLICT");
  });
});

describe("completeJoin: the whole join, in one transaction", () => {
  it("from the invite link to a signed-in friend of the inviter", async () => {
    const { anna, invite } = await annaWithInvite({ note: "for Mara" });

    // /i/<code>: the email form
    await requestJoin(db(), { code: invite.code, email: "mara@example.test", ipHash: IP, now: t0 });
    // /auth: the join token becomes a pending join (M1's verifyEmailLink does this)
    const token = tokenFromLink((await latestOutbox(db(), "mara@example.test", "join"))!.body)!;
    const used = await consumeEmailToken(db(), token, plus.minutes(t0, 1));
    const pj = await createPendingJoin(db(), {
      email: used.email,
      inviteId: used.inviteId!,
      now: plus.minutes(t0, 1),
    });
    // /join: the details
    const details = await describePendingJoin(db(), pj.cookieValue, plus.minutes(t0, 2));
    expect(details).toEqual({
      pendingJoinId: pj.id,
      email: "mara@example.test",
      inviter: { handle: "anna", displayName: "Anna FICTIONAL" },
    });
    const now = plus.minutes(t0, 3);
    const result = await completeJoin(db(), {
      pendingJoinId: pj.id,
      displayName: "  Mara   FICTIONAL ",
      handle: "@Mara_K",
      adultConfirmed: true,
      now,
    });

    // the account
    const [mara] = await db().select().from(accounts).where(eq(accounts.id, result.accountId));
    expect(mara).toMatchObject({
      email: "mara@example.test",
      handle: "mara_k",
      displayName: "Mara FICTIONAL",
      invitedBy: anna.id,
      invitesRemaining: 10,
      isAdmin: false,
      acceptsFollowers: false,
    });
    expect(mara!.adultConfirmedAt.toISOString()).toBe(now.toISOString());

    // the invite
    const row = await inviteRow(invite.id);
    expect(row.usedBy).toBe(mara!.id);
    expect(row.usedAt?.toISOString()).toBe(now.toISOString());
    expect(await lookupInvite(db(), invite.code, now)).toBeNull();

    // the friendship
    expect(await areFriends(db(), anna.id, mara!.id)).toBe(true);

    // the inviter is told
    const n = await db().select().from(notifications).where(eq(notifications.recipientId, anna.id));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: "invite_joined", actorId: mara!.id });

    // the pending join is complete
    const [done] = await db().select().from(pendingJoins).where(eq(pendingJoins.id, pj.id));
    expect(done!.completedAt?.toISOString()).toBe(now.toISOString());
    expect(await describePendingJoin(db(), pj.cookieValue, now)).toBeNull();

    // a working session
    expect(await sessionFromCookie(db(), result.session.cookieValue, now)).toBe(mara!.id);

    // the inviter's list shows it
    const list = await listInvites(db(), anna.id, now);
    expect(list.invites[0]).toMatchObject({ status: "used", usedByHandle: "mara_k", note: "for Mara" });
  });

  it("describePendingJoin refuses a forged cookie and an invite no longer usable", async () => {
    const { anna, invite } = await annaWithInvite();
    const pj = await pendingFor("mara@example.test", invite.id);
    expect(await describePendingJoin(db(), `${pj.id}.forged`, t0)).toBeNull();
    expect(await describePendingJoin(db(), pj.id, t0)).toBeNull();
    expect(await describePendingJoin(db(), pj.cookieValue, t0)).not.toBeNull();
    await revokeInvite(db(), anna.id, invite.id, t0);
    expect(await describePendingJoin(db(), pj.cookieValue, t0)).toBeNull();
  });
});
