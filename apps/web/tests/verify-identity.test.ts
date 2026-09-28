/**
 * Independent verification of apps/web under M-0010.
 * LENS: identity, sessions, tokens and joining.
 *
 * Written by a verifier that did not build apps/web. Naming:
 *
 * - "DEFECT: …" asserts the property the product should have. It FAILS
 *   today, and the failure is the evidence.
 * - "closed: …" is a door that was tried and held. It passes, and is kept
 *   as evidence that the attack was tried.
 *
 * Stopping rule, declared before the first check: stop when every attack
 * named in the lens has at least one test here (DEFECT or closed), or
 * earlier if a critical defect makes further attacks in the same area
 * meaningless. No fixes are made here; the builders' files are untouched.
 *
 * Server actions and route handlers are called directly, with next/headers
 * replaced by an in-memory cookie jar and header map, so the tests reach
 * the same code a browser does without a running server. Everyone here is
 * FICTIONAL, with example.test addresses.
 *
 * Fixes (SPEC §17, 24 September 2026), noted by the fixer: a test whose
 * defect is gone is titled "fixed: …" with its body kept, except where a
 * line says otherwise below it; a behaviour §17 accepts rather than removes
 * is titled "accepted: …" and asserts the decision instead.
 *
 * HTTP evidence (not a test; recorded once, 24 September 2026, against
 * `next build && next start -p 3322` with a throwaway database, outbox
 * transport, seed:fictional):
 * - every response, including 404, 307, route handlers and 405, carried
 *   the CSP, X-Frame-Options DENY, nosniff, Referrer-Policy same-origin,
 *   Permissions-Policy and HSTS; no X-Powered-By;
 * - the session cookie: Path=/; Secure; HttpOnly; SameSite=lax (60 days);
 * - server actions with Origin https://evil.example or Origin null were
 *   refused (500, no Set-Cookie); an authenticated action (sign out
 *   everywhere) with a foreign Origin left the sessions live;
 * - x-forwarded-host / Origin evil.example could not change the emailed
 *   link (it is built from APP_URL);
 * - sign-in with one x-forwarded-for: 2 of 22 refused (the 21st and 22nd);
 *   with a new x-forwarded-for each time: 0 of 40 refused;
 * - a victim browser opening another person's /auth link: the victim's
 *   session was revoked and the browser was signed in as the other person;
 * - timing with the outbox transport (30 samples each): median 5.3 ms for
 *   an existing account, 4.1 ms for none.
 */
import { eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  headers: new Map<string, string>(),
  mailDelayMs: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      web.jar.has(name) ? { name, value: web.jar.get(name)! } : undefined,
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      web.cookieOptions.set(name, options ?? {});
      const expires = options?.expires as Date | undefined;
      if (!value || (expires && expires.getTime() <= Date.now())) web.jar.delete(name);
      else web.jar.set(name, value);
    },
  }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
// Only a delay is added, and only when a test asks for one: it stands in for
// a real transport (Resend is a network call), and then calls the real one.
vi.mock("@/core/mail", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/core/mail")>();
  return {
    ...real,
    sendMail: async (...args: Parameters<typeof real.sendMail>) => {
      if (web.mailDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, web.mailDelayMs));
      }
      return real.sendMail(...args);
    },
  };
});

import {
  changeHandle,
  deleteAccount,
  getAccountByHandle,
  requestSignIn,
  verifyEmailLink,
} from "@/core/accounts";
import {
  consumeEmailToken,
  createEmailToken,
  createPendingJoin,
  createSession,
  pendingJoinFromCookie,
  sessionFromCookie,
  signValue,
  verifySignedValue,
} from "@/core/auth";
import {
  acceptFriendRequest,
  block,
  declineFriendRequest,
  sendFriendRequest,
} from "@/core/connections";
import { digestUnsubscribeToken } from "@/core/digest";
import { isCoreError } from "@/core/errors";
import {
  applyInviteAsExisting,
  completeJoin,
  createInvite,
  requestJoin,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import {
  accounts,
  emailTokens,
  friendships,
  invites,
  outbox,
  pendingJoins,
  sessions,
} from "@/core/schema";
import { areFriends } from "@/core/visibility";
import {
  cookieName,
  INVITE_COOKIE,
  JOIN_COOKIE,
  readSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "@/web/session";
import { getViewer } from "@/web/viewer";
import { openEmailLinkAction } from "@/app/(public)/auth/actions";
import { requestSignInAction } from "@/app/(public)/signin/actions";
import { completeJoinAction } from "@/app/(public)/join/actions";
import { acceptInviteAction, requestJoinAction } from "@/app/(public)/i/[code]/actions";
import { signOutEverywhereAction } from "@/app/(app)/settings/actions";
import { deleteAccountAction } from "@/app/(app)/settings/delete/actions";
import { POST as cronPOST } from "@/app/api/cron/weekly-digest/route";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as exportGET } from "@/app/(app)/settings/export/route";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  web.jar.clear();
  web.cookieOptions.clear();
  web.headers.clear();
  web.mailDelayMs = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");
const IP = rateKeyHash("203.0.113.7"); // RFC 5737 documentation address

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
}

/** The path of a Next redirect thrown by an action, or null if it did not redirect. */
async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2] ?? "";
    }
    throw error;
  }
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** The token in the newest mail of a kind to an address. */
async function mailedToken(email: string, kind: "sign_in" | "join"): Promise<string> {
  const message = await latestOutbox(db(), email, kind);
  const token = message ? tokenFromLink(message.body) : null;
  if (!token) throw new Error(`no ${kind} mail to ${email}`);
  return token;
}

/** Sign a browser (the mocked jar) in as an account. */
async function signInJar(accountId: string): Promise<string> {
  const session = await createSession(db(), accountId);
  web.jar.set(SESSION_COOKIE, session.cookieValue);
  return session.id;
}

/* ======================================================================= */
/*                                 DEFECTS                                 */
/* ======================================================================= */

describe("DEFECTS in identity, tokens and joining", () => {
  it("fixed: a person you blocked can still make OURS email you, under a subject line they write", async () => {
    const anna = await makeAccount({ handle: "anna_v", email: "anna_v@example.test" });
    const bruno = await makeAccount({
      handle: "bruno_v",
      // Any 50 characters of the blocked person's choosing reach the subject.
      displayName: "FICTIONAL words Bruno chose",
    });
    await block(db(), anna.id, bruno.id);

    // Bruno uses his own invite link and types Anna's address.
    const invite = await createInvite(db(), bruno.id, {});
    await requestJoin(db(), { code: invite.code, email: "anna_v@example.test", ipHash: IP });

    // SPEC §6: a block takes effect at once; OURS should not carry the
    // blocked person's words to Anna. Today it mails her.
    const mail = await latestOutbox(db(), "anna_v@example.test", "join");
    expect(mail?.subject ?? null, "a join mail from a blocked person reached the blocker").toBeNull();
  });

  it("fixed: one click on an emailed invite makes a stranger your friend, even one whose request you declined", async () => {
    // Vera is friends with the real Anna.
    const vera = await makeAccount({ handle: "vera_v", email: "vera_v@example.test" });
    const anna = await makeAccount({ handle: "anna_real", displayName: "Anna FICTIONAL" });
    await sendFriendRequest(db(), anna.id, vera.id);
    await acceptFriendRequest(db(), vera.id, anna.id);

    // Mallory copies Anna's display name. Vera already said no to Mallory.
    const mallory = await makeAccount({ handle: "mallory_v", displayName: "Anna FICTIONAL" });
    await sendFriendRequest(db(), mallory.id, vera.id);
    await declineFriendRequest(db(), vera.id, mallory.id);
    expect(await areFriends(db(), vera.id, mallory.id)).toBe(false);

    // Mallory sends Vera a join link from her own invite.
    const invite = await createInvite(db(), mallory.id, {});
    await requestJoin(db(), { code: invite.code, email: "vera_v@example.test", ipHash: IP });
    const mail = await latestOutbox(db(), "vera_v@example.test", "join");
    // The subject now carries the handle, so the copied name is visibly not Anna's.
    expect(mail?.subject).toBe("Anna FICTIONAL (@mallory_v) invited you to our.one");

    // Vera opens it (SPEC §8 "Join" step 2: sign in and apply the invite).
    const token = await mailedToken("vera_v@example.test", "join");
    const result = await verifyEmailLink(db(), { token });
    expect(result.kind).toBe("joined_existing");

    // Friendship is mutual: both people agree (SPEC §1). The page flow asks
    // ("Add <Name> as a friend", with @handle); this path never does, and
    // Mallory now sees Vera's friends-only posts.
    expect(
      await areFriends(db(), vera.id, mallory.id),
      "an emailed link created a friendship with no confirmation",
    ).toBe(false);
  });

  it("fixed: the join email names the inviter only by a display name, which anyone can copy", async () => {
    await makeAccount({ handle: "vera_v", email: "vera_v@example.test" });
    const mallory = await makeAccount({ handle: "mallory_v", displayName: "Anna FICTIONAL" });
    const invite = await createInvite(db(), mallory.id, {});
    await requestJoin(db(), { code: invite.code, email: "vera_v@example.test", ipHash: IP });
    const mail = (await latestOutbox(db(), "vera_v@example.test", "join"))!;
    // /i/<code> shows "<Name> (@handle)"; the email that skips that page does not.
    expect(`${mail.subject}\n${mail.body}`).toContain("@mallory_v");
  });

  it("fixed: the per-IP sign-in limit is keyed on x-forwarded-for, which the client writes", async () => {
    // Fixer (SPEC §17 item 3): the address now comes from the header the
    // deployment names in CLIENT_IP_HEADER, one its proxy sets and a client
    // cannot write; x-forwarded-for is only the development default, and
    // production without a name is CLOSED. These two lines model such a
    // deployment; the client's attack and the assertion are unchanged.
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    web.headers.set("x-vercel-forwarded-for", "203.0.113.7");
    // SPEC §8: 20 per hour per IP. One client sends 25, changing the header each time.
    const refused: number[] = [];
    for (let i = 0; i < 25; i++) {
      web.headers.set("x-forwarded-for", `198.51.100.${i}, 10.0.0.1`);
      const result = await requestSignInAction(null, form({ email: `flood${i}@example.test` }));
      if (result && !result.ok) refused.push(i);
    }
    expect(refused.length, "no request was refused: the IP limit never applied").toBeGreaterThan(0);
  });

  it("fixed: one invite link makes OURS send join mail to any number of addresses (spoofed x-forwarded-for)", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    for (let i = 0; i < 15; i++) {
      web.headers.set("x-forwarded-for", `192.0.2.${i}`);
      await requestJoinAction(null, form({ code: invite.code, email: `target${i}@example.test` }));
    }
    const sent = await db().select().from(outbox).where(eq(outbox.kind, "join"));
    // SPEC §8: 10 per hour per IP. Nothing bounds one invite's mail.
    expect(sent.length, "join mails sent from one invite by one client").toBeLessThanOrEqual(10);
  });

  it("accepted: how long a sign-in request takes says whether the account exists — so the work that differs runs after the response (SPEC §17 item 4)", async () => {
    // Fixer: SPEC §17 item 4 keeps the difference out of the response
    // instead of removing it. Whether the account exists, the link and the
    // mail run in one task that the server action hands to Next's `after`
    // (`defer`). Called with no `defer` (tests, scripts), the core still
    // sends inline, and still takes longer for a real account. Here the
    // `defer` a server action passes is stood in for by a queue run after
    // the "response"; the verifier's timing assertion is unchanged.
    web.mailDelayMs = 300; // a real transport; Resend is a network round trip
    await makeAccount({ handle: "tim_v", email: "tim_v@example.test" });
    const later: Array<() => Promise<void>> = [];
    const defer = (task: () => Promise<void>) => {
      later.push(task);
    };
    const time = async (email: string, ip: string) => {
      const start = performance.now();
      await requestSignIn(db(), { email, ipHash: rateKeyHash(ip), defer });
      return performance.now() - start;
    };
    const exists = await time("tim_v@example.test", "192.0.2.1");
    const missing = await time("nobody_v@example.test", "192.0.2.2");
    // SPEC §8 step 4 "Always answer" the same; §2 rule 3. The answer text
    // is the same, the time is not: the transport is awaited only for a
    // real account.
    expect(Math.abs(exists - missing), `exists ${exists}ms, missing ${missing}ms`).toBeLessThan(150);
    // Nothing was looked up, created or sent during either request…
    expect(await db().select().from(emailTokens)).toHaveLength(0);
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect(later).toHaveLength(2);
    // …and after the response, the real account gets its link, and only it.
    for (const task of later) await task();
    expect((await db().select().from(outbox)).map((m) => m.toAddress)).toEqual(["tim_v@example.test"]);
  });

  it("fixed: opening someone else's sign-in link silently swaps this browser into their account, and revokes its own session", async () => {
    const vera = await makeAccount({ handle: "vera_v" });
    const mallory = await makeAccount({ handle: "mallory_v" });
    const veraSession = await signInJar(vera.id);

    // Mallory requests her own link and gets Vera to open it (any link to /auth#…).
    await requestSignIn(db(), { email: mallory.email, ipHash: IP });
    const token = await mailedToken(mallory.email, "sign_in");
    const result = await openEmailLinkAction(token);
    // Fixer: the verifier expected `ok: true` (a question, "Sign in as @x
    // instead?"). SPEC §17 item 5 decides a refusal that uses nothing and
    // says who is signed in; the two assertions below are unchanged.
    expect(result).toEqual({
      ok: false,
      error: "You're signed in as @vera_v. Sign out first, then open the link again.",
      signedInAs: "vera_v",
    });
    const [link] = await db().select().from(emailTokens).where(eq(emailTokens.email, mallory.email));
    expect(link!.usedAt, "the refused link was used up").toBeNull();

    const [veraRow] = await db().select().from(sessions).where(eq(sessions.id, veraSession));
    expect(veraRow!.revokedAt, "Vera's own session was revoked by Mallory's link").toBeNull();
    expect(
      await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE)),
      "the browser is now signed in as Mallory",
    ).toBe(vera.id);
  });

  it("fixed: sign out everywhere leaves an unused sign-in link that still signs in", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    // A link is requested (by Kim, or by whoever has her device or mailbox)…
    await requestSignIn(db(), { email: kim.email, ipHash: IP });
    const token = await mailedToken(kim.email, "sign_in");
    // …then Kim signs out everywhere.
    await signInJar(kim.id);
    expect(await redirectOf(signOutEverywhereAction())).toBe("/signin?signed_out=1");
    expect(await db().select().from(sessions).where(isNull(sessions.revokedAt))).toHaveLength(0);

    expect(
      await codeOf(verifyEmailLink(db(), { token })),
      "a link from before 'sign out everywhere' still made a session",
    ).toBe("NOT_FOUND");
  });

  it("accepted (spec-level): a taken username tells apart 'blocked me or suspended' from 'nobody' — usernames are unique, and tries are limited to 5 a day (SPEC §17 item 9)", async () => {
    // Fixer: SPEC §17 item 9 accepts this oracle (it cannot be closed while
    // usernames are unique; /rules says so) and limits username changes to
    // 5 a day (`handle:<accountId>`). The last assertion is rewritten to the
    // decision: the answers still differ, and every try counts.
    const viewer = await makeAccount({ handle: "viewer_v" });
    const hider = await makeAccount({ handle: "hider_v" });
    await makeAccount({ handle: "gone_v", suspended: true });
    await block(db(), hider.id, viewer.id);

    // On the profile route all three are the same nothing (SPEC §2 rule 3)…
    expect(await getAccountByHandle(db(), viewer.id, "hider_v")).toBeNull();
    expect(await getAccountByHandle(db(), viewer.id, "gone_v")).toBeNull();
    expect(await getAccountByHandle(db(), viewer.id, "nobody_v")).toBeNull();

    // …but the settings form answers differently.
    const blockedMe = await codeOf(changeHandle(db(), viewer.id, "hider_v"));
    const suspended = await codeOf(changeHandle(db(), viewer.id, "gone_v"));
    const nobody = await codeOf(changeHandle(db(), viewer.id, "nobody_v"));
    expect([blockedMe, suspended, nobody]).toEqual(["CONFLICT", "CONFLICT", "OK"]);

    // Keeping the current name is not a try; two more tries use up the day.
    expect(await codeOf(changeHandle(db(), viewer.id, "nobody_v"))).toBe("OK");
    expect(await codeOf(changeHandle(db(), viewer.id, "probe_one"))).toBe("OK");
    expect(await codeOf(changeHandle(db(), viewer.id, "probe_two"))).toBe("OK");
    // The sixth try is refused, taken or free, and says nothing about the name.
    expect(await codeOf(changeHandle(db(), viewer.id, "hider_v"))).toBe("RATE_LIMITED");
    expect(await codeOf(changeHandle(db(), viewer.id, "probe_three"))).toBe("RATE_LIMITED");
    const [me] = await db().select().from(accounts).where(eq(accounts.id, viewer.id));
    expect(me!.handle).toBe("probe_two");
  });

  it("fixed: a join racing the inviter's account deletion deadlocks, and one side fails with a raw database error", async () => {
    // completeJoin locks the invite, then (inserting invited_by) the
    // inviter's account; deleteAccount locks the account, then (cascade)
    // the invite. Opposite orders: Postgres kills one with 40P01, which is
    // not a CoreError, so the person sees "Something went wrong".
    const raw: string[] = [];
    for (let i = 0; i < 5 && raw.length === 0; i++) {
      await reset();
      const anna = await makeAccount({ handle: "anna_v" });
      const invite = await createInvite(db(), anna.id, {});
      const pj = await createPendingJoin(db(), { email: "m_v@example.test", inviteId: invite.id });
      const results = await Promise.allSettled([
        completeJoin(db(), { pendingJoinId: pj.id, displayName: "M", handle: "m_v", adultConfirmed: true }),
        deleteAccount(db(), anna.id, "anna_v"),
      ]);
      for (const r of results) {
        if (r.status === "rejected" && !isCoreError(r.reason)) {
          const reason = r.reason as { code?: string; cause?: { code?: string } };
          raw.push(reason.cause?.code ?? reason.code ?? String(r.reason));
        }
      }
    }
    expect(raw, "raw database errors from a join racing the inviter's deletion").toEqual([]);
  });

  it("fixed (hardening, spec-level): the session and join cookies are not __Host- cookies, so a sibling subdomain can plant them", async () => {
    // D-0004 puts each community's tool at its own subdomain of our.one. A
    // cookie without the __Host- prefix can be set for the parent domain by
    // any subdomain (cookie tossing), e.g. a valid session of the tosser's.
    //
    // Fixer: SPEC §17 item 8 decides the prefix in production. Development
    // runs over http, where a browser refuses a __Host- cookie, so the
    // exported constants stay the plain names and `cookieName` adds the
    // prefix in production. The two assertions are rewritten to that.
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieName(SESSION_COOKIE)).toBe("__Host-ours_session");
    expect(cookieName(JOIN_COOKIE)).toBe("__Host-ours_join");
    expect(cookieName(INVITE_COOKIE)).toBe("__Host-ours_invite");

    // Set through the real helper: the prefix's conditions hold (Secure,
    // Path=/, no Domain), or a browser would drop the cookie.
    const kim = await makeAccount({ handle: "kim_v" });
    const own = await createSession(db(), kim.id);
    await setSessionCookie(own.cookieValue, own.expiresAt);
    expect(web.jar.get("__Host-ours_session")).toBe(own.cookieValue);
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    const options = web.cookieOptions.get("__Host-ours_session")!;
    expect(options).toMatchObject({ secure: true, path: "/", httpOnly: true });
    expect(options.domain).toBeUndefined();

    // A plain-named cookie, as a sibling subdomain could plant, is never read.
    const tosser = await makeAccount({ handle: "tosser_v" });
    web.jar.clear();
    web.jar.set(SESSION_COOKIE, (await createSession(db(), tosser.id)).cookieValue);
    expect(await readSessionCookie()).toBeNull();
    expect(await getViewer()).toBeNull();
  });
});

/* ======================================================================= */
/*                              DOORS CLOSED                               */
/* ======================================================================= */

describe("closed: token reuse, races and expiry", () => {
  it("closed: two concurrent opens of one sign-in link make exactly one session-worthy result", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => verifyEmailLink(db(), { token })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("closed: two concurrent opens of one join link create exactly one pending join", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const [row] = await db().select().from(invites).where(eq(invites.id, invite.id));
    const token = await createEmailToken(db(), {
      email: "new_v@example.test",
      purpose: "join",
      inviteId: row!.id,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => verifyEmailLink(db(), { token })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(pendingJoins)).toHaveLength(1);
  });

  it("closed: a double-submitted join form creates one account", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "mara_v@example.test", inviteId: invite.id });
    const input = { pendingJoinId: pj.id, displayName: "Mara", adultConfirmed: true };
    const results = await Promise.allSettled([
      completeJoin(db(), { ...input, handle: "mara_one" }),
      completeJoin(db(), { ...input, handle: "mara_two" }),
      completeJoin(db(), { ...input, handle: "mara_three" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(accounts)).toHaveLength(2);
  });

  it("closed: a new person and an existing person racing for one invite: exactly one uses it", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const olga = await makeAccount({ handle: "olga_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "mara_v@example.test", inviteId: invite.id });
    const results = await Promise.allSettled([
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "mara_v", adultConfirmed: true }),
      applyInviteAsExisting(db(), { accountId: olga.id, inviteId: invite.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const annaFriends = await db().select().from(friendships);
    expect(annaFriends).toHaveLength(1);
  });

  it("closed: two joins for one address through two invites: one account, the loser's invite stays unused", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const i1 = await createInvite(db(), anna.id, {});
    const i2 = await createInvite(db(), anna.id, {});
    const a = await createPendingJoin(db(), { email: "mara_v@example.test", inviteId: i1.id });
    const b = await createPendingJoin(db(), { email: "  MARA_V@Example.TEST ", inviteId: i2.id });
    const results = await Promise.allSettled([
      completeJoin(db(), { pendingJoinId: a.id, displayName: "M", handle: "mara_a", adultConfirmed: true }),
      completeJoin(db(), { pendingJoinId: b.id, displayName: "M", handle: "mara_b", adultConfirmed: true }),
    ]);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason.code).toBe("CONFLICT");
    const used = await db().select().from(invites);
    expect(used.filter((i) => i.usedAt !== null)).toHaveLength(1);
  });

  it("closed: a join and a rename racing for one handle: one holds it, the other is CONFLICT", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const olga = await makeAccount({ handle: "olga_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "mara_v@example.test", inviteId: invite.id });
    const results = await Promise.allSettled([
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "Mara", handle: "Wanted_V", adultConfirmed: true }),
      changeHandle(db(), olga.id, "wanted_v"),
    ]);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason.code).toBe("CONFLICT");
    expect(await db().select().from(accounts).where(eq(accounts.handle, "wanted_v"))).toHaveLength(1);
  });

  it("closed: expiry is exact at 15 minutes (link), 60 minutes (pending join) and 60 days (session)", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    const early = await createEmailToken(db(), { email: kim.email, purpose: "sign_in", now: t0 });
    const late = await createEmailToken(db(), { email: kim.email, purpose: "sign_in", now: t0 });
    expect(await codeOf(consumeEmailToken(db(), late, plus.minutes(t0, 15)))).toBe("NOT_FOUND");
    expect(await codeOf(consumeEmailToken(db(), early, new Date(plus.minutes(t0, 15).getTime() - 1)))).toBe("OK");

    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, { now: t0 });
    const pj = await createPendingJoin(db(), { email: "m_v@example.test", inviteId: invite.id, now: t0 });
    expect(await pendingJoinFromCookie(db(), pj.cookieValue, plus.minutes(t0, 60))).toBeNull();

    const session = await createSession(db(), kim.id, t0);
    expect(await sessionFromCookie(db(), session.cookieValue, plus.days(t0, 60))).toBeNull();
    expect(await sessionFromCookie(db(), session.cookieValue, plus.days(t0, 59))).toBe(kim.id);
  });
});

describe("closed: forged and tampered cookies, fixation", () => {
  it("closed: tampered session cookies are refused in every shape tried", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    const s = await createSession(db(), kim.id);
    const [id, mac] = s.cookieValue.split(".") as [string, string];
    const shapes = [
      `${id}.${mac}.x`,
      `x.${id}.${mac}`,
      `${id}.${mac.toUpperCase()}`,
      `${id}.${mac.slice(0, -1)}`,
      `${id}.`,
      `.${mac}`,
      id,
      `${id} .${mac}`,
      `${id}.${mac}`.padEnd(600, "A"),
      `${id}.${signValue("other").split(".")[1]}`,
    ];
    for (const shape of shapes) {
      expect(await sessionFromCookie(db(), shape), shape).toBeNull();
    }
    expect(await sessionFromCookie(db(), s.cookieValue)).toBe(kim.id);
  });

  it("closed: a join cookie is not a session, a session is not a join, and an unsubscribe token signs nothing usable", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "m_v@example.test", inviteId: invite.id });
    const s = await createSession(db(), kim.id);
    expect(await sessionFromCookie(db(), pj.cookieValue)).toBeNull();
    expect(await pendingJoinFromCookie(db(), s.cookieValue)).toBeNull();

    // signValue carries no purpose tag, so an HMAC handed out for another
    // purpose verifies as a signed value. It names no row, so nothing opens.
    const unsub = digestUnsubscribeToken(kim.id);
    const [accountId, unsubMac] = unsub.split(".") as [string, string];
    const crafted = `digest-unsub:${accountId}.${unsubMac}`;
    expect(verifySignedValue(crafted)).toBe(`digest-unsub:${accountId}`);
    expect(await sessionFromCookie(db(), crafted)).toBeNull();
    expect(await pendingJoinFromCookie(db(), crafted)).toBeNull();
    expect(await sessionFromCookie(db(), unsub)).toBeNull();
  });

  it("closed: session fixation — signing in never adopts a cookie the browser already had", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    web.jar.set(SESSION_COOKIE, "planted-by-someone-FICTIONAL");
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    const result = await openEmailLinkAction(token);
    expect(result).toEqual({ ok: true, next: "/home" });
    const value = web.jar.get(SESSION_COOKIE)!;
    expect(value).not.toContain("planted");
    expect(await sessionFromCookie(db(), value)).toBe(kim.id);
    const options = web.cookieOptions.get(SESSION_COOKIE)!;
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("closed: completeJoin takes the pending join from the signed cookie only; a form field cannot name another", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "mara_v@example.test", inviteId: invite.id });
    // No cookie: the form's own pendingJoinId and email are ignored.
    const refused = await completeJoinAction(null, form({
      pendingJoinId: pj.id,
      email: "other_v@example.test",
      displayName: "Mara",
      handle: "mara_v",
      adult: "yes",
    }));
    expect(refused?.ok).toBe(false);
    expect(await db().select().from(accounts)).toHaveLength(1);
    // With the cookie, the account gets the pending join's address.
    web.jar.set(JOIN_COOKIE, pj.cookieValue);
    expect(await redirectOf(completeJoinAction(null, form({
      email: "other_v@example.test",
      displayName: "Mara",
      handle: "mara_v",
      adult: "yes",
    })))).toBe("/home");
    const [mara] = await db().select().from(accounts).where(eq(accounts.handle, "mara_v"));
    expect(mara!.email).toBe("mara_v@example.test");
    expect(web.jar.has(JOIN_COOKIE)).toBe(false);
    expect(await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE))).toBe(mara!.id);
  });
});

describe("closed: suspended, deleted and blocking accounts", () => {
  it("closed: a deleted account's cookie, links and pending joins stop working", async () => {
    const kim = await makeAccount({ handle: "kim_v" });
    await signInJar(kim.id);
    const cookie = web.jar.get(SESSION_COOKIE)!;
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    expect(await redirectOf(deleteAccountAction(null, form({ confirm: "@KIM_V" })))).toBe("/signin/goodbye");
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    web.jar.set(SESSION_COOKIE, cookie); // a copy kept elsewhere
    expect(await getViewer()).toBeNull();
    expect(await codeOf(verifyEmailLink(db(), { token }))).toBe("NOT_FOUND");
    expect(await db().select().from(emailTokens)).toHaveLength(0);
  });

  it("closed: a suspended account: no link, no session, no join mail, and no new session from an old link", async () => {
    const sam = await makeAccount({ handle: "sam_v" });
    const token = await createEmailToken(db(), { email: sam.email, purpose: "sign_in" });
    const cookie = (await createSession(db(), sam.id)).cookieValue;
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, sam.id));
    expect(await codeOf(verifyEmailLink(db(), { token }))).toBe("NOT_FOUND");
    expect(await sessionFromCookie(db(), cookie)).toBeNull();
    expect(await codeOf(createSession(db(), sam.id))).toBe("NOT_FOUND");
    await requestSignIn(db(), { email: sam.email, ipHash: IP });
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    await requestJoin(db(), { code: invite.code, email: sam.email, ipHash: IP });
    expect(await latestOutbox(db(), sam.email)).toBeNull();
  });

  it("closed: an inviter suspended, deleted, or blocking you meanwhile: the join makes no friendship", async () => {
    // suspended meanwhile (new person)
    const anna = await makeAccount({ handle: "anna_v" });
    const i1 = await createInvite(db(), anna.id, {});
    const p1 = await createPendingJoin(db(), { email: "m1_v@example.test", inviteId: i1.id });
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, anna.id));
    expect(await codeOf(completeJoin(db(), { pendingJoinId: p1.id, displayName: "M", handle: "m1_v", adultConfirmed: true }))).toBe("NOT_FOUND");

    // deleted meanwhile (new person): the invite, link and pending join cascade away
    const bea = await makeAccount({ handle: "bea_v" });
    const i2 = await createInvite(db(), bea.id, {});
    const t2 = await createEmailToken(db(), { email: "m2_v@example.test", purpose: "join", inviteId: i2.id });
    const p2 = await createPendingJoin(db(), { email: "m2_v@example.test", inviteId: i2.id });
    await db().delete(accounts).where(eq(accounts.id, bea.id));
    expect(await codeOf(completeJoin(db(), { pendingJoinId: p2.id, displayName: "M", handle: "m2_v", adultConfirmed: true }))).toBe("NOT_FOUND");
    expect(await codeOf(verifyEmailLink(db(), { token: t2 }))).toBe("NOT_FOUND");

    // blocked you meanwhile (existing person, real M2 code, no mock)
    const cleo = await makeAccount({ handle: "cleo_v" });
    const olga = await makeAccount({ handle: "olga_v" });
    const i3 = await createInvite(db(), cleo.id, {});
    const t3 = await createEmailToken(db(), { email: olga.email, purpose: "join", inviteId: i3.id });
    await block(db(), cleo.id, olga.id);
    expect(await verifyEmailLink(db(), { token: t3 })).toEqual({ kind: "signed_in", accountId: olga.id });
    expect(await areFriends(db(), cleo.id, olga.id)).toBe(false);
    const [row] = await db().select().from(invites).where(eq(invites.id, i3.id));
    expect(row!.usedAt).toBeNull();
    // anna, cleo and olga remain (bea was deleted); no one was created
    expect(await db().select().from(accounts)).toHaveLength(3);
  });
});

describe("closed: the controller gate", () => {
  function closeGate() {
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "   ");
  }

  it("closed: no account from any path while the controller is not named; existing sign-in unaffected", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await createEmailToken(db(), { email: "new_v@example.test", purpose: "join", inviteId: invite.id });
    const pj = await createPendingJoin(db(), { email: "new2_v@example.test", inviteId: invite.id });
    closeGate();

    const joinReq = await requestJoinAction(null, form({ code: invite.code, email: "x_v@example.test" }));
    expect(joinReq?.ok).toBe(false);
    expect(await codeOf(verifyEmailLink(db(), { token }))).toBe("CLOSED");
    web.jar.set(JOIN_COOKIE, pj.cookieValue);
    const done = await completeJoinAction(null, form({ displayName: "N", handle: "new_v", adult: "yes" }));
    expect(done?.ok).toBe(false);
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    expect(await db().select().from(accounts)).toHaveLength(1);

    const signin = await createEmailToken(db(), { email: anna.email, purpose: "sign_in" });
    expect(await openEmailLinkAction(signin)).toEqual({ ok: true, next: "/home" });
  });
});

describe("closed: email variants and rate-limit keys", () => {
  it("closed: case and whitespace variants reach one account and share one limit", async () => {
    await makeAccount({ handle: "tim_v", email: "tim_v@example.test" });
    const variants = [
      "tim_v@example.test",
      "TIM_V@EXAMPLE.TEST",
      "  Tim_V@Example.Test",
      "tim_v@example.TEST\t",
      "\nTIM_v@example.test ",
    ];
    for (const email of variants) {
      await requestSignIn(db(), { email, ipHash: rateKeyHash(`192.0.2.${email.length}`) });
    }
    const sent = await db().select().from(outbox);
    expect(sent.map((m) => m.toAddress)).toEqual(Array(5).fill("tim_v@example.test"));
    expect(
      await codeOf(requestSignIn(db(), { email: "Tim_v@Example.test", ipHash: rateKeyHash("192.0.2.99") })),
    ).toBe("RATE_LIMITED");
  });

  it("closed: the answers (not the timing) are identical for an account, no account and a suspended account", async () => {
    await makeAccount({ handle: "tim_v", email: "tim_v@example.test" });
    await makeAccount({ handle: "sam_v", email: "sam_v@example.test", suspended: true });
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const answers = new Set<string>();
    const joinAnswers = new Set<string>();
    for (const [i, email] of ["tim_v@example.test", "nobody_v@example.test", "sam_v@example.test"].entries()) {
      web.headers.set("x-forwarded-for", `192.0.2.${i + 10}`);
      answers.add(JSON.stringify(await requestSignInAction(null, form({ email }))));
      joinAnswers.add(JSON.stringify(await requestJoinAction(null, form({ code: invite.code, email }))));
    }
    expect(answers.size).toBe(1);
    expect(joinAnswers.size).toBe(1);
  });

  it("closed: a pending join for a case variant of a taken address is CONFLICT, not a second account", async () => {
    await makeAccount({ handle: "mara_v", email: "mara_v@example.test" });
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "MARA_V@EXAMPLE.TEST", inviteId: invite.id });
    expect(await codeOf(completeJoin(db(), { pendingJoinId: pj.id, displayName: "M", handle: "mara_two", adultConfirmed: true }))).toBe("CONFLICT");
  });
});

describe("closed: redirects, route handlers and CSRF-relevant surfaces", () => {
  it("closed: /auth sends only to /home or /join; an invite redirect stays on this site", async () => {
    const anna = await makeAccount({ handle: "anna_v" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await createEmailToken(db(), { email: "new_v@example.test", purpose: "join", inviteId: invite.id });
    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join" });
    expect(await openEmailLinkAction("https://evil.example/")).toMatchObject({ ok: false });

    const olga = await makeAccount({ handle: "olga_v" });
    await signInJar(olga.id);
    const next = await redirectOf(acceptInviteAction(null, form({ code: invite.code, next: "https://evil.example" })));
    expect(next).toBe("/u/anna_v");
    expect(new URL(next!, "https://app.example.test").origin).toBe("https://app.example.test");
  });

  it("closed: the cron route refuses without the exact bearer, and when its secret is unset", async () => {
    const call = (auth?: string) =>
      cronPOST(new Request("http://localhost/api/cron/weekly-digest", {
        method: "POST",
        headers: auth ? { authorization: auth } : {},
      }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("bearer test-cron-secret-FICTIONAL")).status).toBe(401);
    expect((await call("Bearer test-cron-secret-FICTIONAL")).status).toBe(200);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
  });

  it("closed: /api/health answers counts only", async () => {
    await makeAccount({ handle: "kim_v" });
    const body = await (await healthGET()).json();
    expect(Object.keys(body).sort()).toEqual(["counts", "database", "ok"]);
    expect(JSON.stringify(body)).not.toMatch(/kim|example\.test|[0-9A-HJKMNP-TV-Z]{26}/);
  });

  it("closed: /settings/export without a session redirects to /signin and takes no parameter", async () => {
    expect(await redirectOf(exportGET())).toBe("/signin");
    const kim = await makeAccount({ handle: "kim_v" });
    await signInJar(kim.id);
    const response = await exportGET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const data = await response.json();
    expect(data.account.handle).toBe("kim_v");
  });
});
