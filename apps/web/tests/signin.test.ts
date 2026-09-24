/**
 * Signing in by an emailed link (M1; SPEC §8 "Sign in", §8 "Join from an
 * invite" step 2; M-0010 acceptance: sign-in tokens, rate limits, the
 * controller gate). Denial paths first. Everyone here is FICTIONAL.
 *
 * M2's `useInviteAsExisting` is replaced by a mock in this file: these
 * tests check how M1 calls it and what M1 does with each answer, not M2's
 * rules, which M2 tests.
 */
import { eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LINK_REFUSED,
  requestSignIn,
  verifyEmailLink,
} from "@/core/accounts";
import {
  createEmailToken,
  createSession,
  pendingJoinFromCookie,
  sessionFromCookie,
  signValue,
} from "@/core/auth";
import { CoreError, isCoreError } from "@/core/errors";
import { newId, sha256 } from "@/core/ids";
import { useInviteAsExisting } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import {
  accounts,
  emailTokens,
  invites,
  outbox,
  pendingJoins,
  rateEvents,
} from "@/core/schema";
import { at, db, makeAccount, plus, reset } from "./helpers";

vi.mock("@/core/invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/invites")>()),
  useInviteAsExisting: vi.fn(),
}));

const applyInvite = vi.mocked(useInviteAsExisting);

beforeEach(async () => {
  await reset();
  applyInvite.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");
const IP = rateKeyHash("203.0.113.7"); // a documentation address (RFC 5737)
const OTHER_IP = rateKeyHash("198.51.100.9");

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return error as CoreError;
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

async function makeInvite(inviterId: string) {
  const [row] = await db()
    .insert(invites)
    .values({
      id: newId(),
      codeHash: sha256(newId()),
      inviterId,
      createdAt: t0,
      expiresAt: plus.days(t0, 30),
    })
    .returning();
  return row!;
}

/** The token in the newest sign-in mail to `email`, or null. */
async function mailedToken(email: string): Promise<string | null> {
  const message = await latestOutbox(db(), email, "sign_in");
  return message ? tokenFromLink(message.body) : null;
}

async function count<T>(rows: Promise<T[]>): Promise<number> {
  return (await rows).length;
}

/* ----------------------------------------------------------- the request */

describe("requestSignIn: the same answer whether or not the account exists", () => {
  it("sends nothing and creates no token for an address with no account", async () => {
    const result = await requestSignIn(db(), {
      email: "nobody@example.test",
      ipHash: IP,
      now: t0,
    });
    expect(result).toBeUndefined();
    expect(await count(db().select().from(outbox))).toBe(0);
    expect(await count(db().select().from(emailTokens))).toBe(0);
  });

  it("sends nothing to a suspended account, and answers the same", async () => {
    await makeAccount({ handle: "suspended_sam", suspended: true });
    const result = await requestSignIn(db(), {
      email: "suspended_sam@example.test",
      ipHash: IP,
      now: t0,
    });
    expect(result).toBeUndefined();
    expect(await count(db().select().from(outbox))).toBe(0);
    expect(await count(db().select().from(emailTokens))).toBe(0);
  });

  it("sends one link to an active account, and resolves exactly as for no account", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const result = await requestSignIn(db(), {
      email: "  Anna@Example.TEST ",
      ipHash: IP,
      now: t0,
    });
    expect(result).toBeUndefined();
    const message = await latestOutbox(db(), "anna@example.test", "sign_in");
    expect(message?.body).toContain("http://localhost:3000/auth#");
    expect(message?.body).toContain("It works once, for 15 minutes.");
    const token = tokenFromLink(message!.body)!;
    // Only the hash is stored.
    const [row] = await db().select().from(emailTokens);
    expect(row!.tokenHash).toBe(sha256(token));
    expect(row!.purpose).toBe("sign_in");
    expect(row!.email).toBe(anna.email);
    expect(JSON.stringify(await db().select().from(emailTokens))).not.toContain(token);
  });

  it("refuses a malformed address with INVALID before counting it", async () => {
    await expectCode(
      requestSignIn(db(), { email: "not an email", ipHash: IP, now: t0 }),
      "INVALID",
    );
    await expectCode(
      requestSignIn(db(), { email: "", ipHash: IP, now: t0 }),
      "INVALID",
    );
    expect(await count(db().select().from(rateEvents))).toBe(0);
  });
});

describe("requestSignIn: rate limits (SPEC §8: 5/hour per email, 20/hour per IP)", () => {
  it("refuses the sixth request for one address within an hour, with RATE_LIMITED", async () => {
    await makeAccount({ handle: "anna" });
    for (let i = 0; i < 5; i++) {
      await requestSignIn(db(), {
        email: "anna@example.test",
        ipHash: rateKeyHash(`ip-${i}`),
        now: plus.minutes(t0, i),
      });
    }
    await expectCode(
      requestSignIn(db(), {
        email: "anna@example.test",
        ipHash: rateKeyHash("ip-fresh"),
        now: plus.minutes(t0, 10),
      }),
      "RATE_LIMITED",
    );
    // Exactly five links were sent.
    expect(
      await count(db().select().from(outbox).where(eq(outbox.kind, "sign_in"))),
    ).toBe(5);
    // After the hour, it is allowed again.
    await requestSignIn(db(), {
      email: "anna@example.test",
      ipHash: rateKeyHash("ip-fresh"),
      now: plus.minutes(t0, 61),
    });
  });

  it("limits an address with no account in exactly the same way, so the limit says nothing", async () => {
    for (let i = 0; i < 5; i++) {
      await requestSignIn(db(), {
        email: "nobody@example.test",
        ipHash: rateKeyHash(`ip-${i}`),
        now: plus.minutes(t0, i),
      });
    }
    await expectCode(
      requestSignIn(db(), {
        email: "nobody@example.test",
        ipHash: rateKeyHash("ip-fresh"),
        now: plus.minutes(t0, 10),
      }),
      "RATE_LIMITED",
    );
  });

  it("refuses the 21st request from one IP within an hour, across addresses", async () => {
    await makeAccount({ handle: "anna" });
    for (let i = 0; i < 20; i++) {
      await requestSignIn(db(), {
        email: `flood${i}@example.test`,
        ipHash: IP,
        now: plus.minutes(t0, 1),
      });
    }
    await expectCode(
      requestSignIn(db(), { email: "anna@example.test", ipHash: IP, now: plus.minutes(t0, 2) }),
      "RATE_LIMITED",
    );
    expect(await latestOutbox(db(), "anna@example.test")).toBeNull();
    // Another IP is not affected.
    await requestSignIn(db(), {
      email: "anna@example.test",
      ipHash: OTHER_IP,
      now: plus.minutes(t0, 2),
    });
    expect(await mailedToken("anna@example.test")).not.toBeNull();
  });

  it("keys the limits by keyed hashes, never by the address", async () => {
    await requestSignIn(db(), {
      email: "anna@example.test",
      ipHash: IP,
      now: t0,
    });
    const keys = (await db().select().from(rateEvents)).map((r) => r.key).sort();
    expect(keys).toEqual(
      [`signin:email:${rateKeyHash("anna@example.test")}`, `signin:ip:${IP}`].sort(),
    );
    expect(keys.join(" ")).not.toContain("anna");
    expect(keys.join(" ")).not.toContain(sha256("anna@example.test"));
  });
});

/* -------------------------------------------------------------- the link */

describe("verifyEmailLink: refusals", () => {
  it("refuses an unknown token with NOT_FOUND and the link message", async () => {
    const error = await expectCode(
      verifyEmailLink(db(), { token: "not-a-real-token", now: t0 }),
      "NOT_FOUND",
    );
    expect(error.message).toBe(LINK_REFUSED);
    await expectCode(verifyEmailLink(db(), { token: "", now: t0 }), "NOT_FOUND");
    await expectCode(
      verifyEmailLink(db(), { token: undefined as unknown as string, now: t0 }),
      "NOT_FOUND",
    );
  });

  it("works once through the flow: the second use is NOT_FOUND and makes no session", async () => {
    const anna = await makeAccount({ handle: "anna" });
    await requestSignIn(db(), { email: "anna@example.test", ipHash: IP, now: t0 });
    const token = (await mailedToken("anna@example.test"))!;
    expect(await verifyEmailLink(db(), { token, now: plus.minutes(t0, 1) })).toEqual({
      kind: "signed_in",
      accountId: anna.id,
    });
    const error = await expectCode(
      verifyEmailLink(db(), { token, now: plus.minutes(t0, 2) }),
      "NOT_FOUND",
    );
    expect(error.message).toBe(LINK_REFUSED);
  });

  it("expires after 15 minutes", async () => {
    await makeAccount({ handle: "anna" });
    await requestSignIn(db(), { email: "anna@example.test", ipHash: IP, now: t0 });
    const token = (await mailedToken("anna@example.test"))!;
    await expectCode(
      verifyEmailLink(db(), { token, now: plus.minutes(t0, 16) }),
      "NOT_FOUND",
    );
  });

  it("refuses a suspended account's link, even one sent before the suspension", async () => {
    const sam = await makeAccount({ handle: "sam" });
    await requestSignIn(db(), { email: sam.email, ipHash: IP, now: t0 });
    const token = (await mailedToken(sam.email))!;
    await db()
      .update(accounts)
      .set({ suspendedAt: plus.minutes(t0, 1) })
      .where(eq(accounts.id, sam.id));
    await expectCode(
      verifyEmailLink(db(), { token, now: plus.minutes(t0, 2) }),
      "NOT_FOUND",
    );
    // And no session can be made for it by any other path.
    await expectCode(createSession(db(), sam.id, t0), "NOT_FOUND");
  });

  it("refuses a sign-in link for an account deleted since it was sent", async () => {
    const gone = await makeAccount({ handle: "gone" });
    const token = await createEmailToken(db(), {
      email: gone.email,
      purpose: "sign_in",
      now: t0,
    });
    await db().delete(accounts).where(eq(accounts.id, gone.id));
    await expectCode(
      verifyEmailLink(db(), { token, now: plus.minutes(t0, 1) }),
      "NOT_FOUND",
    );
  });

  it("refuses a join link for a suspended account's address, and applies nothing", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const sam = await makeAccount({ handle: "sam", suspended: true });
    const token = await createEmailToken(db(), {
      email: sam.email,
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    await expectCode(verifyEmailLink(db(), { token, now: t0 }), "NOT_FOUND");
    expect(applyInvite).not.toHaveBeenCalled();
    expect(await count(db().select().from(pendingJoins))).toBe(0);
  });

  it("refuses a join link for a new address with CLOSED while no controller is named", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const token = await createEmailToken(db(), {
      email: "newcomer@example.test",
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    await expectCode(verifyEmailLink(db(), { token, now: t0 }), "CLOSED");
    expect(await count(db().select().from(pendingJoins))).toBe(0);
  });

  it("does not use up a link when something fails after it was read", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const anna = await makeAccount({ handle: "anna" });
    applyInvite.mockRejectedValueOnce(new Error("database went away"));
    const token = await createEmailToken(db(), {
      email: anna.email,
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    await expect(verifyEmailLink(db(), { token, now: t0 })).rejects.toThrow(
      "database went away",
    );
    const [row] = await db().select().from(emailTokens);
    expect(row!.usedAt).toBeNull();
  });
});

describe("verifyEmailLink: what each link does", () => {
  it("a sign-in link signs in the account for that address, and a session can be made", async () => {
    const anna = await makeAccount({ handle: "anna" });
    const token = await createEmailToken(db(), {
      email: anna.email,
      purpose: "sign_in",
      now: t0,
    });
    const result = await verifyEmailLink(db(), { token, now: plus.minutes(t0, 1) });
    expect(result).toEqual({ kind: "signed_in", accountId: anna.id });
    const session = await createSession(db(), anna.id, plus.minutes(t0, 1));
    expect(await sessionFromCookie(db(), session.cookieValue, plus.minutes(t0, 2))).toBe(
      anna.id,
    );
    const [row] = await db().select().from(emailTokens);
    expect(row!.usedAt).not.toBeNull();
  });

  it("a join link for a new address creates a pending join the join cookie can carry", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const token = await createEmailToken(db(), {
      email: "Newcomer@Example.test",
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    const result = await verifyEmailLink(db(), { token, now: plus.minutes(t0, 1) });
    expect(result.kind).toBe("join_pending");
    if (result.kind !== "join_pending") return;
    const pending = await pendingJoinFromCookie(
      db(),
      signValue(result.pendingJoinId),
      plus.minutes(t0, 2),
    );
    expect(pending).toMatchObject({
      id: result.pendingJoinId,
      email: "newcomer@example.test",
      inviteId: invite.id,
    });
    expect(applyInvite).not.toHaveBeenCalled();
    // No account was created: that is /join's work.
    expect(
      await count(db().select().from(accounts).where(like(accounts.email, "newcomer%"))),
    ).toBe(0);
  });

  it("a join link for an existing account signs it in and applies the invite as M2's useInviteAsExisting", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const anna = await makeAccount({ handle: "anna" });
    applyInvite.mockResolvedValueOnce({ status: "friends" });
    const token = await createEmailToken(db(), {
      email: anna.email,
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    const now = plus.minutes(t0, 1);
    expect(await verifyEmailLink(db(), { token, now })).toEqual({
      kind: "joined_existing",
      accountId: anna.id,
    });
    expect(applyInvite).toHaveBeenCalledTimes(1);
    expect(applyInvite.mock.calls[0]![1]).toEqual({
      accountId: anna.id,
      inviteId: invite.id,
      now,
    });
    expect(await count(db().select().from(pendingJoins))).toBe(0);
  });

  it("already friends, or your own invite: signed in, nothing joined", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const anna = await makeAccount({ handle: "anna" });
    for (const status of ["already_friends", "own_invite"] as const) {
      applyInvite.mockResolvedValueOnce({ status });
      const token = await createEmailToken(db(), {
        email: anna.email,
        purpose: "join",
        inviteId: invite.id,
        now: t0,
      });
      expect(await verifyEmailLink(db(), { token, now: t0 })).toEqual({
        kind: "signed_in",
        accountId: anna.id,
      });
    }
  });

  it("an invite that can no longer be used (blocked, used, expired) still signs the person in, and applies nothing", async () => {
    const inviter = await makeAccount({ handle: "inviter" });
    const invite = await makeInvite(inviter.id);
    const anna = await makeAccount({ handle: "anna" });
    applyInvite.mockRejectedValueOnce(new CoreError("NOT_FOUND", "That isn't available."));
    const token = await createEmailToken(db(), {
      email: anna.email,
      purpose: "join",
      inviteId: invite.id,
      now: t0,
    });
    expect(await verifyEmailLink(db(), { token, now: t0 })).toEqual({
      kind: "signed_in",
      accountId: anna.id,
    });
    // The link is used up all the same.
    await expectCode(verifyEmailLink(db(), { token, now: t0 }), "NOT_FOUND");
  });
});
