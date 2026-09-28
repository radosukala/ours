/**
 * Regression tests for the identity, joining and configuration fixes after
 * the independent verification (SPEC §17 items 1–9, 14 and the running
 * version in 20). The verifiers' own tests are in verify-identity,
 * verify-abuse and verify-privacy; these add the denial paths and the
 * parts their tests do not reach. Everyone here is FICTIONAL, with
 * example.test addresses and documentation IP ranges.
 *
 * Server actions are called directly, with next/headers replaced by an
 * in-memory cookie jar and header map, and Next's `after` replaced by a
 * queue this file runs by hand (or by the real `after`, which refuses
 * outside a request, when a test asks for that).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  headers: new Map<string, string>(),
  /** "queue": `after` holds tasks in `later`; "real": Next's own `after`. */
  afterMode: "queue" as "queue" | "real",
  later: [] as Array<() => unknown>,
  /** Called before each real sendMail, when a test sets it. */
  beforeSend: null as null | (() => Promise<void>),
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
vi.mock("@/core/mail", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/core/mail")>();
  return {
    ...real,
    sendMail: async (...args: Parameters<typeof real.sendMail>) => {
      if (web.beforeSend) await web.beforeSend();
      return real.sendMail(...args);
    },
  };
});
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      if (web.afterMode === "queue") {
        web.later.push(task);
        return;
      }
      return real.after(task);
    },
  };
});

import {
  changeHandle,
  deleteAccount,
  requestSignIn,
  saveProfile,
  SIGN_IN_REQUESTS_OFF,
  openEmailLink,
  SignedInElsewhere,
  signOutEverywhere,
  verifyEmailLink,
} from "@/core/accounts";
import {
  createEmailToken,
  createPendingJoin,
  createSession,
  inviteOfferCookieValue,
  inviteOfferFromCookie,
  sessionFromCookie,
  signValue,
} from "@/core/auth";
import { clientIpHeader, controller, runningVersion } from "@/core/config";
import { block as blockCore } from "@/core/connections";
import { isCoreError } from "@/core/errors";
import {
  applyInviteAsExisting,
  completeJoin,
  createInvite,
  INVITE_UNUSABLE,
  inviteOfferForViewer,
  JOIN_REQUESTS_OFF,
  requestJoin,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import { joinEmail, suspensionEmail } from "@/core/mail-templates";
import { createReport, suspendAccount } from "@/core/reports";
import {
  accounts,
  emailTokens,
  friendships,
  invites,
  mailLog,
  outbox,
  pendingJoins,
  rateEvents,
  sessions,
} from "@/core/schema";
import { areFriends } from "@/core/visibility";
import { afterResponse } from "@/web/actions";
import { clientIpHash, rateLimitAddress } from "@/web/request";
import {
  cookieName,
  INVITE_COOKIE,
  JOIN_COOKIE,
  readInviteCookie,
  readJoinCookie,
  SESSION_COOKIE,
  setInviteCookie,
  setJoinCookie,
} from "@/web/session";
import { openEmailLinkAction } from "@/app/(public)/auth/actions";
import { requestSignInAction } from "@/app/(public)/signin/actions";
import { requestJoinAction } from "@/app/(public)/i/[code]/actions";
import { addInviterAction, notNowAction } from "@/app/(public)/join/confirm/actions";
import ConfirmInvitePage from "@/app/(public)/join/confirm/page";
import { signOutEverywhereAction } from "@/app/(app)/settings/actions";
import { at, befriend, block, db, makeAccount, plus, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  web.jar.clear();
  web.cookieOptions.clear();
  web.headers.clear();
  web.afterMode = "queue";
  web.later.length = 0;
  web.beforeSend = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-01T12:00:00Z");
const IP = rateKeyHash("203.0.113.7");

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (isCoreError(error)) return error.code;
    throw error;
  }
}

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

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runLater(): Promise<void> {
  while (web.later.length > 0) await web.later.shift()!();
}

async function signInJar(accountId: string): Promise<string> {
  const session = await createSession(db(), accountId);
  web.jar.set(SESSION_COOKIE, session.cookieValue);
  return session.id;
}

async function joinToken(email: string, inviteId: string, now = new Date()): Promise<string> {
  return createEmailToken(db(), { email, purpose: "join", inviteId, now });
}

async function inviteRow(id: string) {
  const [row] = await db().select().from(invites).where(eq(invites.id, id));
  return row!;
}

/* ----------------------------------------------- item 1: ask before adding */

describe("a join link for an existing account asks before it connects (SPEC §17 item 1)", () => {
  it("opening it signs in, sets the invite cookie, creates nothing, and sends to /join/confirm", async () => {
    const anna = await makeAccount({ handle: "anna_f", displayName: "Anna FICTIONAL" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await joinToken(vera.email, invite.id);

    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join/confirm" });
    expect(await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE))).toBe(vera.id);
    const offer = inviteOfferFromCookie(web.jar.get(INVITE_COOKIE));
    expect(offer).toMatchObject({ inviteId: invite.id, accountId: vera.id });
    // 15 minutes, and httpOnly like the others.
    expect(offer!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expect(offer!.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(web.cookieOptions.get(INVITE_COOKIE)).toMatchObject({ httpOnly: true, path: "/" });

    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    expect(await db().select().from(pendingJoins)).toHaveLength(0);
  });

  it("the page asks 'Add <Name> (@handle) as a friend?' with Add and Not now", async () => {
    const anna = await makeAccount({ handle: "anna_f", displayName: "Anna FICTIONAL" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    await openEmailLinkAction(await joinToken(vera.email, invite.id));

    const html = renderToStaticMarkup(await ConfirmInvitePage());
    expect(html).toContain("Add Anna FICTIONAL (@anna_f) as a friend?");
    expect(html).toContain(">Add<");
    expect(html).toContain("Not now");
  });

  it("Add applies the invite: friends, the invite used, the cookie gone, then the inviter's profile", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    await openEmailLinkAction(await joinToken(vera.email, invite.id));

    expect(await redirectOf(addInviterAction(null, form()))).toBe("/u/anna_f");
    expect(await areFriends(db(), anna.id, vera.id)).toBe(true);
    expect((await inviteRow(invite.id)).usedBy).toBe(vera.id);
    expect(web.jar.has(INVITE_COOKIE)).toBe(false);
  });

  it("Not now applies nothing, forgets the offer and goes home; the invite stays unused", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    await openEmailLinkAction(await joinToken(vera.email, invite.id));

    expect(await redirectOf(notNowAction())).toBe("/home");
    expect(web.jar.has(INVITE_COOKIE)).toBe(false);
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    // With the offer gone, Add has nothing to apply.
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
  });

  it("the offer counts only for the account it was made for", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const olga = await makeAccount({ handle: "olga_f" });
    const invite = await createInvite(db(), anna.id, {});
    const offer = inviteOfferCookieValue({ inviteId: invite.id, accountId: vera.id });

    // Olga's browser carries Vera's offer.
    await signInJar(olga.id);
    web.jar.set(INVITE_COOKIE, offer.cookieValue);
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(renderToStaticMarkup(await ConfirmInvitePage())).toContain(
      INVITE_UNUSABLE.replace("'", "&#x27;"),
    );
    expect(await areFriends(db(), anna.id, olga.id)).toBe(false);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("an expired, tampered or foreign signed value is not an offer", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    const offer = inviteOfferCookieValue({ inviteId: invite.id, accountId: vera.id, now: t0 });
    expect(inviteOfferFromCookie(offer.cookieValue, plus.minutes(t0, 14))).not.toBeNull();
    expect(inviteOfferFromCookie(offer.cookieValue, plus.minutes(t0, 15))).toBeNull();

    const [value, mac] = offer.cookieValue.split(".") as [string, string];
    const other = await makeAccount({ handle: "other_f" });
    const retargeted = value.replace(vera.id, other.id);
    // A last character that differs from the real one: a fixed "A" was the
    // real value whenever the MAC already ended in "A" (1 run in 16).
    const tamperedLast = mac.endsWith("A") ? "B" : "A";
    for (const forged of [
      `${retargeted}.${mac}`,
      `${value}.${mac.slice(0, -1)}${tamperedLast}`,
      signValue(`${invite.id}`), // a signed value without the tag
      signValue(`invite-offer:${invite.id}:${vera.id}:soon`),
      (await createSession(db(), vera.id)).cookieValue, // a session cookie
      "",
    ]) {
      expect(inviteOfferFromCookie(forged, t0), forged).toBeNull();
    }

    // Through the action: an expired offer applies nothing.
    await signInJar(vera.id);
    web.jar.set(INVITE_COOKIE, offer.cookieValue); // made at t0, long gone
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
  });

  it("a block between opening the link and Add: nothing is applied, and the answer is the generic one", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    await openEmailLinkAction(await joinToken(vera.email, invite.id));
    await blockCore(db(), anna.id, vera.id);

    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
    expect(web.jar.has(INVITE_COOKIE)).toBe(false);
  });

  it("a link that can't be offered (already friends, blocked, own invite) signs in and goes home with no offer", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const friend = await makeAccount({ handle: "friend_f" });
    const blocked = await makeAccount({ handle: "blocked_f" });
    await befriend(anna, friend);
    await block(blocked, anna);
    const invite = await createInvite(db(), anna.id, {});
    for (const who of [friend, blocked, anna]) {
      web.jar.clear();
      const result = await openEmailLinkAction(await joinToken(who.email, invite.id));
      expect(result, who.handle).toEqual({ ok: true, next: "/home" });
      expect(web.jar.has(INVITE_COOKIE)).toBe(false);
      expect(await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE))).toBe(who.id);
    }
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });

  it("inviteOfferForViewer writes nothing and refuses what cannot be an id", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    expect((await inviteOfferForViewer(db(), { inviteId: invite.id, viewerId: vera.id })).kind).toBe(
      "can_add",
    );
    for (const bad of ["", "x' or '1'='1", "a".repeat(65)]) {
      expect(await inviteOfferForViewer(db(), { inviteId: bad, viewerId: vera.id })).toEqual({
        kind: "unusable",
      });
    }
    expect(await db().select().from(friendships)).toHaveLength(0);
    expect((await inviteRow(invite.id)).usedAt).toBeNull();
  });
});

/* ------------------------------------------- item 2: blocks silence join mail */

describe("requestJoin is silent across a block, and names the inviter with the handle (SPEC §17 item 2)", () => {
  it("a block either way: nothing is sent, no link is made, and the answer is the same", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const blocker = await makeAccount({ handle: "blocker_f" });
    const blocked = await makeAccount({ handle: "blocked_f" });
    await blockCore(db(), blocker.id, anna.id); // they blocked the inviter
    await blockCore(db(), anna.id, blocked.id); // the inviter blocked them
    const invite = await createInvite(db(), anna.id, {});
    const answers = new Set<string>();
    for (const [i, email] of [blocker.email, blocked.email, "new_f@example.test"].entries()) {
      web.headers.set("x-forwarded-for", `192.0.2.${i + 1}`);
      answers.add(JSON.stringify(await requestJoinAction(null, form({ code: invite.code, email }))));
    }
    await runLater();
    expect(answers).toEqual(new Set([JSON.stringify({ ok: true })]));
    expect(await latestOutbox(db(), blocker.email)).toBeNull();
    expect(await latestOutbox(db(), blocked.email)).toBeNull();
    expect(await latestOutbox(db(), "new_f@example.test", "join")).not.toBeNull();
    const links = await db().select().from(emailTokens);
    expect(links.map((l) => l.email)).toEqual(["new_f@example.test"]);
  });

  it("the join email says 'Name (@handle) invited you to connect on our.one'", async () => {
    const anna = await makeAccount({ handle: "anna_f", displayName: "Anna FICTIONAL" });
    const invite = await createInvite(db(), anna.id, {});
    await requestJoin(db(), { code: invite.code, email: "new_f@example.test", ipHash: IP });
    const mail = (await latestOutbox(db(), "new_f@example.test", "join"))!;
    expect(mail.body).toContain("Anna FICTIONAL (@anna_f) invited you to connect on our.one.");
    expect(joinEmail("http://x/auth#t", "Anna", "anna").body).toContain("Anna (@anna) invited");
  });
});

/* ---------------------------------------------- item 3: the client address */

describe("the client address comes from a header each deployment names (SPEC §17 item 3)", () => {
  it("clientIpHeader: x-forwarded-for in development; the named header when set; none in production without one", () => {
    expect(clientIpHeader()).toBe("x-forwarded-for");
    vi.stubEnv("CLIENT_IP_HEADER", "X-Vercel-Forwarded-For");
    expect(clientIpHeader()).toBe("x-vercel-forwarded-for");
    vi.stubEnv("CLIENT_IP_HEADER", "not a header: name");
    expect(clientIpHeader()).toBeNull();
    vi.stubEnv("CLIENT_IP_HEADER", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(clientIpHeader()).toBeNull();
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    expect(clientIpHeader()).toBe("x-vercel-forwarded-for");
  });

  it("clientIpHash reads only the named header's first value", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    web.headers.set("x-forwarded-for", "198.51.100.1");
    web.headers.set("x-vercel-forwarded-for", "203.0.113.7, 10.0.0.1");
    expect(await clientIpHash()).toBe(rateKeyHash("203.0.113.7"));
    web.headers.set("x-forwarded-for", "198.51.100.2");
    expect(await clientIpHash()).toBe(rateKeyHash("203.0.113.7"));
    // Named but absent: one shared bucket, never the client's own words.
    web.headers.delete("x-vercel-forwarded-for");
    expect(await clientIpHash()).toBe(rateKeyHash("local"));
    vi.stubEnv("NODE_ENV", "production");
    expect(await clientIpHash()).toBe(rateKeyHash("unknown"));
  });

  it("an IPv6 client is counted by its /64; IPv4, and IPv4 written as IPv6, by the address", () => {
    // RFC 3849 and RFC 5737 documentation addresses.
    expect(rateLimitAddress("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(rateLimitAddress("2001:0DB8:0001:0002:ffff:0:0:19")).toBe("2001:db8:1:2::/64");
    expect(rateLimitAddress("[2001:db8:1:2::7]:443")).toBe("2001:db8:1:2::/64");
    expect(rateLimitAddress("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(rateLimitAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitAddress("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(rateLimitAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitAddress("local")).toBe("local");
    expect(rateLimitAddress("not:an:address::x")).toBe("not:an:address::x");
  });

  it("clientIpHash gives one bucket to a /64 and another to the next /64", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    web.headers.set("x-vercel-forwarded-for", "2001:db8:1:2::1");
    const first = await clientIpHash();
    web.headers.set("x-vercel-forwarded-for", "2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(await clientIpHash()).toBe(first);
    expect(first).toBe(rateKeyHash("2001:db8:1:2::/64"));
    web.headers.set("x-vercel-forwarded-for", "2001:db8:1:3::1");
    expect(await clientIpHash()).not.toBe(first);
    web.headers.set("x-vercel-forwarded-for", "::ffff:203.0.113.7");
    expect(await clientIpHash()).toBe(rateKeyHash("203.0.113.7"));
  });

  it("production without CLIENT_IP_HEADER: sign-in and join requests are CLOSED, record nothing and send nothing", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");

    expect(await codeOf(requestSignIn(db(), { email: anna.email, ipHash: IP }))).toBe("CLOSED");
    expect(await codeOf(requestJoin(db(), { code: invite.code, email: "n_f@example.test", ipHash: IP }))).toBe(
      "CLOSED",
    );
    expect(await requestSignInAction(null, form({ email: anna.email }))).toEqual({
      ok: false,
      error: SIGN_IN_REQUESTS_OFF,
    });
    expect(await requestJoinAction(null, form({ code: invite.code, email: "n_f@example.test" }))).toEqual({
      ok: false,
      error: JOIN_REQUESTS_OFF,
    });
    await runLater();
    // Only the invite's own creation was counted; no request was.
    expect((await db().select().from(rateEvents)).map((r) => r.key)).toEqual([`invite:${anna.id}`]);
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect(await db().select().from(emailTokens)).toHaveLength(0);

    // Naming the header opens them again.
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    expect(await codeOf(requestSignIn(db(), { email: anna.email, ipHash: IP }))).toBe("OK");
  });

  it("one invite sends at most 10 join links a day, whatever the addresses and client addresses", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, { now: t0 });
    const other = await createInvite(db(), anna.id, { now: t0 });
    for (let i = 0; i < 10; i++) {
      await requestJoin(db(), {
        code: invite.code,
        email: `n${i}_f@example.test`,
        ipHash: rateKeyHash(`192.0.2.${i}`),
        now: plus.minutes(t0, i),
      });
    }
    const eleventh = () =>
      requestJoin(db(), {
        code: invite.code,
        email: "n10_f@example.test",
        ipHash: rateKeyHash("192.0.2.200"),
        now: plus.hours(t0, 23),
      });
    expect(await codeOf(eleventh())).toBe("RATE_LIMITED");
    // Another invite is not affected; the same one is again after a day.
    expect(
      await codeOf(
        requestJoin(db(), {
          code: other.code,
          email: "n11_f@example.test",
          ipHash: rateKeyHash("192.0.2.201"),
          now: plus.hours(t0, 23),
        }),
      ),
    ).toBe("OK");
    expect(
      await codeOf(
        requestJoin(db(), {
          code: invite.code,
          email: "n12_f@example.test",
          ipHash: rateKeyHash("192.0.2.202"),
          now: plus.hours(t0, 25),
        }),
      ),
    ).toBe("OK");
    const keys = (await db().select().from(rateEvents)).map((r) => r.key);
    expect(keys.filter((k) => k === `join:invite:${invite.id}`).length).toBeGreaterThan(0);
  });

  it("rate_events has an index on created_at for the prune, and mail_log accepts 'notice'", async () => {
    const result = await db().execute(
      sql`select indexdef from pg_indexes where tablename = 'rate_events' and indexname = 'rate_events_created_idx'`,
    );
    expect(String((result.rows[0] as { indexdef?: string } | undefined)?.indexdef)).toMatch(
      /\(created_at\)/,
    );
    await db().insert(mailLog).values({ id: "01FICTIONALNOTICE000000000", kind: "notice", status: "sent" });
    await expect(
      db().execute(sql`insert into mail_log (id, kind, status) values ('01FICTIONALBADKIND00000000', 'promo', 'sent')`),
    ).rejects.toThrow();
  });
});

/* ------------------------------------------- item 4: mail after the response */

describe("a placeholder is not a controller (SPEC §2 rule 6)", () => {
  it("controller() is null unless the address is an email address and neither value holds [CONFIRM]", () => {
    vi.stubEnv("DATA_CONTROLLER", "FICTIONAL Controller");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "controller@example.test");
    expect(controller()).toEqual({ name: "FICTIONAL Controller", email: "controller@example.test" });
    for (const [name, email] of [
      ["[CONFIRM]", "controller@example.test"],
      ["FICTIONAL Controller [confirm]", "controller@example.test"],
      ["FICTIONAL Controller", "[CONFIRM]"],
      ["FICTIONAL Controller", "controller+[CONFIRM]@example.test"],
      ["FICTIONAL Controller", "not an address"],
      ["FICTIONAL Controller", "controller@localhost"],
      ["", "controller@example.test"],
    ] as const) {
      vi.stubEnv("DATA_CONTROLLER", name);
      vi.stubEnv("DATA_CONTROLLER_EMAIL", email);
      expect(controller(), `${name} / ${email}`).toBeNull();
    }
  });

  it("with a placeholder, account creation is closed: no join link is made", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, {});
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "[CONFIRM]");
    expect(
      await codeOf(requestJoin(db(), { code: invite.code, email: "n_f@example.test", ipHash: IP })),
    ).toBe("CLOSED");
    expect(await db().select().from(emailTokens)).toHaveLength(0);
  });
});

describe("mail leaves after the response (SPEC §17 item 4)", () => {
  it("the sign-in action hands the lookup and the mail to Next's after; the request writes the same for any address", async () => {
    await makeAccount({ handle: "tim_f", email: "tim_f@example.test" });
    for (const [i, email] of ["tim_f@example.test", "nobody_f@example.test"].entries()) {
      web.headers.set("x-forwarded-for", `192.0.2.${i + 1}`);
      await requestSignInAction(null, form({ email }));
    }
    // The response is out: only the two limits' rows each, nothing else.
    expect(await db().select().from(emailTokens)).toHaveLength(0);
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect(await db().select().from(rateEvents)).toHaveLength(4);
    expect(web.later).toHaveLength(2);
    await runLater();
    expect((await db().select().from(outbox)).map((m) => m.toAddress)).toEqual(["tim_f@example.test"]);
  });

  it("the join action does the same: a new, an existing, a suspended and a blocking address look alike until after", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const existing = await makeAccount({ handle: "existing_f" });
    const sam = await makeAccount({ handle: "sam_f", suspended: true });
    const blocker = await makeAccount({ handle: "blocker_f" });
    await block(blocker, anna);
    const invite = await createInvite(db(), anna.id, {});
    const emails = ["new_f@example.test", existing.email, sam.email, blocker.email];
    for (const [i, email] of emails.entries()) {
      web.headers.set("x-forwarded-for", `192.0.2.${i + 1}`);
      expect(await requestJoinAction(null, form({ code: invite.code, email }))).toEqual({ ok: true });
    }
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect(web.later).toHaveLength(4);
    await runLater();
    expect((await db().select().from(outbox)).map((m) => m.toAddress).sort()).toEqual(
      [existing.email, "new_f@example.test"].sort(),
    );
  });

  it("outside a request Next's after refuses, and the task runs before the action returns", async () => {
    web.afterMode = "real";
    await makeAccount({ handle: "tim_f", email: "tim_f@example.test" });
    await requestSignInAction(null, form({ email: "tim_f@example.test" }));
    expect(web.later).toHaveLength(0);
    expect(await latestOutbox(db(), "tim_f@example.test", "sign_in")).not.toBeNull();
  });

  it("a failure after the response is logged, not thrown at a person who already has their answer", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let ran = false;
    afterResponse(async () => {
      ran = true;
      throw new Error("FICTIONAL transport failure");
    });
    await runLater();
    expect(ran).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/* ------------------------------------ item 5: no silent switch of accounts */

describe("/auth does not switch a browser signed in as someone else (SPEC §17 item 5)", () => {
  it("a join link for a new address, opened while signed in: nothing used, no pending join, no join cookie", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    await signInJar(vera.id);
    const token = await joinToken("new_f@example.test", invite.id);

    expect(await openEmailLinkAction(token)).toEqual({
      ok: false,
      error: "You're signed in as @vera_f. Sign out first, then open the link again.",
      signedInAs: "vera_f",
    });
    expect(await db().select().from(pendingJoins)).toHaveLength(0);
    expect(web.jar.has(JOIN_COOKIE)).toBe(false);
    const [link] = await db().select().from(emailTokens);
    expect(link!.usedAt).toBeNull();

    // Signed out, the same link works.
    web.jar.delete(SESSION_COOKIE);
    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join" });
  });

  it("a join link for another existing account, opened while signed in: refused, nothing applied", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const olga = await makeAccount({ handle: "olga_f" });
    const invite = await createInvite(db(), anna.id, {});
    const veraSession = await signInJar(vera.id);
    const result = await openEmailLinkAction(await joinToken(olga.email, invite.id));
    expect(result).toMatchObject({ ok: false, signedInAs: "vera_f" });
    expect(web.jar.has(INVITE_COOKIE)).toBe(false);
    const [row] = await db().select().from(sessions).where(eq(sessions.id, veraSession));
    expect(row!.revokedAt).toBeNull();
  });

  it("your own link, or a browser whose session is no longer live, proceeds as usual", async () => {
    const vera = await makeAccount({ handle: "vera_f" });
    const olga = await makeAccount({ handle: "olga_f" });
    await signInJar(vera.id);
    const own = await createEmailToken(db(), { email: vera.email, purpose: "sign_in" });
    expect(await openEmailLinkAction(own)).toEqual({ ok: true, next: "/home" });
    expect(await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE))).toBe(vera.id);

    // A revoked session is not someone signed in.
    const stale = await signInJar(vera.id);
    await db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, stale));
    const theirs = await createEmailToken(db(), { email: olga.email, purpose: "sign_in" });
    expect(await openEmailLinkAction(theirs)).toEqual({ ok: true, next: "/home" });
    expect(await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE))).toBe(olga.id);
  });

  it("the core refuses with SignedInElsewhere (CONFLICT) and rolls the link back", async () => {
    const vera = await makeAccount({ handle: "vera_f" });
    const olga = await makeAccount({ handle: "olga_f" });
    const token = await createEmailToken(db(), { email: olga.email, purpose: "sign_in" });
    const error = await verifyEmailLink(db(), { token, signedInAs: vera.id }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignedInElsewhere);
    expect((error as SignedInElsewhere).code).toBe("CONFLICT");
    expect((error as SignedInElsewhere).handle).toBe("vera_f");
    expect(await verifyEmailLink(db(), { token })).toEqual({ kind: "signed_in", accountId: olga.id });
  });

  it("an unusable link is still the one 'expired or used' answer, signed in or not", async () => {
    const vera = await makeAccount({ handle: "vera_f" });
    await signInJar(vera.id);
    expect(await openEmailLinkAction("not-a-real-token")).toEqual({
      ok: false,
      error: "This link has expired or was already used.",
    });
  });
});

/* ----------------------------------------------- item 6: sign out everywhere */

describe("sign out everywhere retires the address's unused links (SPEC §17 item 6)", () => {
  it("sign-in and join links to the address stop working; other addresses' links and later links work", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const kim = await makeAccount({ handle: "kim_f" });
    const invite = await createInvite(db(), anna.id, {});
    const signin = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    const join = await joinToken(kim.email, invite.id);
    const annas = await createEmailToken(db(), { email: anna.email, purpose: "sign_in" });

    await signInJar(kim.id);
    expect(await redirectOf(signOutEverywhereAction())).toBe("/signin?signed_out=1");
    expect(await codeOf(verifyEmailLink(db(), { token: signin }))).toBe("NOT_FOUND");
    expect(await codeOf(verifyEmailLink(db(), { token: join }))).toBe("NOT_FOUND");
    expect(await codeOf(verifyEmailLink(db(), { token: annas }))).toBe("OK");

    const fresh = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    expect(await verifyEmailLink(db(), { token: fresh })).toEqual({ kind: "signed_in", accountId: kim.id });
  });

  it("sign out everywhere in flight first: a link opened meanwhile waits for it, then is refused, and starts no session", async () => {
    const kim = await makeAccount({ handle: "kim_f" });
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    await createSession(db(), kim.id);
    const holder = new pg.Client({ connectionString: inject("databaseUrl") });
    await holder.connect();
    let opened: ReturnType<typeof openEmailLinkAction> | null = null;
    try {
      await holder.query("begin");
      // Sign out everywhere, by hand on the holder's connection, left
      // uncommitted: the account row for update, then the sessions and links.
      await holder.query("select id from accounts where id = $1 for update", [kim.id]);
      await holder.query("update sessions set revoked_at = now() where account_id = $1", [kim.id]);
      await holder.query(
        "update email_tokens set used_at = now() where email = $1 and used_at is null",
        [kim.email],
      );
      opened = openEmailLinkAction(token);
      await untilWaiting(1);
      await holder.query("commit");
    } finally {
      await holder.end();
    }
    expect(await opened).toEqual({ ok: false, error: "This link has expired or was already used." });
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    expect(
      await db().select().from(sessions).where(and(eq(sessions.accountId, kim.id), isNull(sessions.revokedAt))),
    ).toHaveLength(0);
  });

  it("the /auth action starts its session in the link's own transaction (openEmailLink)", async () => {
    const kim = await makeAccount({ handle: "kim_f" });
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    const opened = await openEmailLink(db(), { token });
    expect(opened).toMatchObject({ kind: "signed_in", accountId: kim.id });
    const session = (opened as { session: { id: string; cookieValue: string } }).session;
    expect(await sessionFromCookie(db(), session.cookieValue)).toBe(kim.id);
    // Used once: a second open is refused and starts nothing.
    expect(await codeOf(openEmailLink(db(), { token }))).toBe("NOT_FOUND");
    expect(await db().select().from(sessions).where(eq(sessions.accountId, kim.id))).toHaveLength(1);
    // A pending join starts no session.
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, {});
    const join = await joinToken("n_f@example.test", invite.id);
    expect(await openEmailLink(db(), { token: join })).toMatchObject({ kind: "join_pending" });
    expect(await db().select().from(sessions)).toHaveLength(1);
  });

  it("signOutEverywhere revokes every session and is NOT_FOUND for a missing account", async () => {
    const kim = await makeAccount({ handle: "kim_f" });
    await createSession(db(), kim.id);
    await createSession(db(), kim.id);
    await signOutEverywhere(db(), kim.id);
    expect(
      await db().select().from(sessions).where(and(eq(sessions.accountId, kim.id), isNull(sessions.revokedAt))),
    ).toHaveLength(0);
    expect(await codeOf(signOutEverywhere(db(), "01ZZZZZZZZZZZZZZZZZZZZZZZZ"))).toBe("NOT_FOUND");
  });
});

/* ----------------------------------------------------- item 7: lock order */

/** How many sessions in the test database wait on a lock right now. */
async function lockWaiters(): Promise<number> {
  const result = await db().execute(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`);
  return Number((result.rows[0] as { n: number }).n);
}

async function untilWaiting(n: number): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if ((await lockWaiters()) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`test: fewer than ${n} sessions ever waited on a lock`);
}

type Settled = { ok: true } | { ok: false; code: string };

function settle(promise: Promise<unknown>): Promise<Settled> {
  return promise.then(
    () => ({ ok: true }) as const,
    (error: unknown) => {
      if (isCoreError(error)) return { ok: false, code: error.code } as const;
      const raw = error as { code?: string; cause?: { code?: string } };
      return { ok: false, code: `raw:${raw.cause?.code ?? raw.code ?? String(error)}` } as const;
    },
  );
}

/**
 * The worst schedule, made certain: a third connection holds the inviter's
 * account row, so `deleteAccount` takes its first locks and then stops at
 * the account; the racer then starts and waits on what `deleteAccount`
 * holds; then the account is let go. With the locks in the wrong order,
 * the deletion's cascade then needs a row the racer holds, and Postgres
 * kills one of them (40P01).
 */
async function deletionFirstThen(
  inviterId: string,
  confirm: string,
  racer: () => Promise<unknown>,
): Promise<{ deleted: Settled; raced: Settled }> {
  const holder = new pg.Client({ connectionString: inject("databaseUrl") });
  await holder.connect();
  try {
    await holder.query("begin");
    await holder.query("select id from accounts where id = $1 for share", [inviterId]);
    const deleted = settle(deleteAccount(db(), inviterId, confirm));
    await untilWaiting(1);
    const raced = settle(racer());
    await untilWaiting(2);
    await holder.query("commit");
    return { deleted: await deleted, raced: await raced };
  } finally {
    await holder.end();
  }
}

describe("deleting an account and a join through its invite do not deadlock (SPEC §17 item 7)", () => {
  it("staged: the deletion locks the invite first; the join form waits, then finds nothing, and no one is created", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "m_f@example.test", inviteId: invite.id });
    const { deleted, raced } = await deletionFirstThen(anna.id, "anna_f", () =>
      completeJoin(db(), { pendingJoinId: pj.id, displayName: "M", handle: "m_f", adultConfirmed: true }),
    );
    expect(deleted).toEqual({ ok: true });
    expect(raced).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await db().select().from(accounts)).toHaveLength(0);
  });

  it("staged: Add on /join/confirm waits for the deletion, then finds the invite gone", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    const { deleted, raced } = await deletionFirstThen(anna.id, "anna_f", () =>
      applyInviteAsExisting(db(), { accountId: vera.id, inviteId: invite.id }),
    );
    expect(deleted).toEqual({ ok: true });
    expect(raced).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await db().select().from(friendships)).toHaveLength(0);
  });

  it("staged: the deletion locks the invite's join links first; opening one waits, then finds it gone", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await joinToken("m_f@example.test", invite.id);
    const { deleted, raced } = await deletionFirstThen(anna.id, "anna_f", () =>
      verifyEmailLink(db(), { token }),
    );
    expect(deleted).toEqual({ ok: true });
    expect(raced).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await db().select().from(pendingJoins)).toHaveLength(0);
  });

  it("completeJoin racing the inviter's deletion, 15 times: only CoreErrors, and a consistent end", async () => {
    const raw: string[] = [];
    for (let i = 0; i < 15; i++) {
      await reset();
      const anna = await makeAccount({ handle: "anna_f" });
      const invite = await createInvite(db(), anna.id, {});
      const pj = await createPendingJoin(db(), { email: "m_f@example.test", inviteId: invite.id });
      const [joined, deleted] = await Promise.allSettled([
        completeJoin(db(), { pendingJoinId: pj.id, displayName: "M", handle: "m_f", adultConfirmed: true }),
        deleteAccount(db(), anna.id, "anna_f"),
      ]);
      for (const r of [joined, deleted]) {
        if (r!.status === "rejected" && !isCoreError(r!.reason)) {
          const reason = r!.reason as { code?: string; cause?: { code?: string } };
          raw.push(reason.cause?.code ?? reason.code ?? String(r!.reason));
        }
      }
      expect(deleted!.status).toBe("fulfilled");
      const left = await db().select().from(accounts);
      // Either the join came first (the new person stays, with no inviter),
      // or the deletion did (the join is refused and nobody is created).
      if (joined!.status === "fulfilled") {
        expect(left.map((a) => a.handle)).toEqual(["m_f"]);
        expect(left[0]!.invitedBy).toBeNull();
      } else {
        expect((joined as PromiseRejectedResult).reason.code).toBe("NOT_FOUND");
        expect(left).toHaveLength(0);
      }
    }
    expect(raw).toEqual([]);
  });

  it("opening a join link racing the inviter's deletion, 15 times: only CoreErrors", async () => {
    const raw: string[] = [];
    for (let i = 0; i < 15; i++) {
      await reset();
      const anna = await makeAccount({ handle: "anna_f" });
      const invite = await createInvite(db(), anna.id, {});
      const token = await joinToken("m_f@example.test", invite.id);
      const results = await Promise.allSettled([
        verifyEmailLink(db(), { token }),
        deleteAccount(db(), anna.id, "anna_f"),
      ]);
      for (const r of results) {
        if (r.status === "rejected" && !isCoreError(r.reason)) {
          const reason = r.reason as { code?: string; cause?: { code?: string } };
          raw.push(reason.cause?.code ?? reason.code ?? String(r.reason));
        }
      }
      expect(results[1].status).toBe("fulfilled");
    }
    expect(raw).toEqual([]);
  });
});

/* ------------------------------------------------------- item 8: __Host- */

describe("cookie names in production (SPEC §17 item 8)", () => {
  it("the join and invite cookies are set and read only under __Host- names, with Secure and Path=/", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const expires = new Date(Date.now() + 60_000);
    await setJoinCookie("join-value", expires);
    await setInviteCookie("invite-value", expires);
    expect([...web.jar.keys()].sort()).toEqual(["__Host-ours_invite", "__Host-ours_join"]);
    for (const name of ["__Host-ours_invite", "__Host-ours_join"]) {
      expect(web.cookieOptions.get(name)).toMatchObject({ secure: true, path: "/", httpOnly: true });
      expect(web.cookieOptions.get(name)!.domain).toBeUndefined();
    }
    expect(await readJoinCookie()).toBe("join-value");
    expect(await readInviteCookie()).toBe("invite-value");

    // Plain names (as a sibling subdomain could set them) are not read.
    web.jar.clear();
    web.jar.set(JOIN_COOKIE, "planted");
    web.jar.set(INVITE_COOKIE, "planted");
    expect(await readJoinCookie()).toBeNull();
    expect(await readInviteCookie()).toBeNull();
  });

  it("development keeps the plain names, which a browser accepts over http", () => {
    expect(cookieName(SESSION_COOKIE)).toBe("ours_session");
    expect(cookieName(JOIN_COOKIE)).toBe("ours_join");
    expect(cookieName(INVITE_COOKIE)).toBe("ours_invite");
  });
});

/* ------------------------------------------------- item 9: username tries */

describe("username changes are limited to 5 a day (SPEC §17 item 9)", () => {
  it("counts tries through the settings form too, including refused ones; keeping the name is free", async () => {
    const me = await makeAccount({ handle: "me_f" });
    await makeAccount({ handle: "taken_f" });
    const save = (handle: string, now: Date) =>
      saveProfile(db(), me.id, { displayName: "Me", bio: "", handle, now });

    expect(await codeOf(save("taken_f", t0))).toBe("CONFLICT");
    expect(await codeOf(save("me_f", t0))).toBe("OK"); // not a try
    expect(await codeOf(save("me_two", t0))).toBe("OK");
    expect(await codeOf(save("me_two", t0))).toBe("OK"); // not a try
    expect(await codeOf(changeHandle(db(), me.id, "taken_f", t0))).toBe("CONFLICT");
    expect(await codeOf(changeHandle(db(), me.id, "me_three", t0))).toBe("OK");
    expect(await codeOf(save("me_four", t0))).toBe("OK");
    // Five tries: the sixth is refused, and changes nothing.
    expect(await codeOf(save("me_five", plus.hours(t0, 23)))).toBe("RATE_LIMITED");
    // Only the name is limited: name and bio still save with the same username.
    expect(await codeOf(save("me_four", plus.hours(t0, 23)))).toBe("OK");
    // A malformed or reserved name is refused before it counts.
    expect(await codeOf(save("admin", plus.hours(t0, 23)))).toBe("INVALID");
    // A day later, it works again.
    expect(await codeOf(save("me_five", plus.hours(t0, 25)))).toBe("OK");
    const [row] = await db().select().from(accounts).where(eq(accounts.id, me.id));
    expect(row!.handle).toBe("me_five");
  });

  it("the join form counts tries the same way, per pending join, taken names included", async () => {
    const anna = await makeAccount({ handle: "anna_f" });
    await makeAccount({ handle: "taken_f" });
    const invite = await createInvite(db(), anna.id, {});
    const pj = await createPendingJoin(db(), { email: "n_f@example.test", inviteId: invite.id });
    const tryName = (handle: string, displayName = "FICTIONAL Newcomer") =>
      codeOf(completeJoin(db(), { pendingJoinId: pj.id, displayName, handle, adultConfirmed: true }));
    // A malformed or reserved name is refused before it counts.
    expect(await tryName("admin")).toBe("INVALID");
    expect(await tryName("x")).toBe("INVALID");
    for (let i = 0; i < 5; i++) expect(await tryName("taken_f")).toBe("CONFLICT");
    // The sixth is refused, free name or not, and creates no one.
    expect(await tryName("taken_f")).toBe("RATE_LIMITED");
    expect(await tryName("free_f")).toBe("RATE_LIMITED");
    expect(await db().select().from(accounts).where(eq(accounts.handle, "free_f"))).toHaveLength(0);
    const keys = (await db().select().from(rateEvents)).map((r) => r.key);
    expect(keys.filter((k) => k === `handle:join:${pj.id}`)).toHaveLength(5);
    // Counted against the pending join, not against any account.
    expect(keys.filter((k) => k.startsWith("handle:") && !k.startsWith("handle:join:"))).toEqual([]);
  });

  it("the limit is per account", async () => {
    const a = await makeAccount({ handle: "a_f" });
    const b = await makeAccount({ handle: "b_f" });
    for (let i = 0; i < 5; i++) await changeHandle(db(), a.id, `a_f${i}`, t0);
    expect(await codeOf(changeHandle(db(), a.id, "a_f9", t0))).toBe("RATE_LIMITED");
    expect(await codeOf(changeHandle(db(), b.id, "b_f1", t0))).toBe("OK");
  });
});

/* ---------------------------------------------- item 14: suspension notice */

describe("a suspension is explained to the person (SPEC §17 item 14)", () => {
  async function world() {
    const admin = await makeAccount({ handle: "admin_f", isAdmin: true });
    const reporter = await makeAccount({ handle: "reporter_f" });
    const target = await makeAccount({ handle: "target_f" });
    const report = async () =>
      (await createReport(db(), reporter.id, { kind: "account", targetId: target.id, category: "harassment" }))
        .id;
    return { admin, reporter, target, report };
  }

  it("one 'notice' email with the statement of reasons and the controller's address", async () => {
    const { admin, target, report } = await world();
    await suspendAccount(db(), admin.id, await report(), { reason: "FICTIONAL repeated harassment" });
    const mails = await db().select().from(outbox).where(eq(outbox.toAddress, target.email));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.kind).toBe("notice");
    expect(mails[0]!.subject).toBe("Your our.one account is suspended");
    expect(mails[0]!.body).toContain("FICTIONAL repeated harassment.");
    expect(mails[0]!.body).toContain("If you think this is wrong, write to controller@example.test.");
    const [log] = await db().select().from(mailLog).where(eq(mailLog.kind, "notice"));
    expect(log).toMatchObject({ status: "sent", accountId: target.id });
    // Nobody else is emailed.
    expect(await db().select().from(outbox)).toHaveLength(1);
  });

  it("a second suspension of the same account sends nothing more", async () => {
    const { admin, target, report } = await world();
    const first = await report();
    const second = await report();
    await suspendAccount(db(), admin.id, first, { reason: "FICTIONAL first reason" });
    await suspendAccount(db(), admin.id, second, { reason: "FICTIONAL second reason" });
    expect(await db().select().from(outbox).where(eq(outbox.toAddress, target.email))).toHaveLength(1);
  });

  it("a refused suspension sends nothing, and no controller named says so instead of an address", async () => {
    const { admin, reporter, target, report } = await world();
    const aboutAdmin = await createReport(db(), reporter.id, {
      kind: "account",
      targetId: admin.id,
      category: "other",
    });
    expect(await codeOf(suspendAccount(db(), admin.id, aboutAdmin.id, { reason: "FICTIONAL reason text" }))).toBe(
      "FORBIDDEN",
    );
    expect(await db().select().from(outbox)).toHaveLength(0);

    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    await suspendAccount(db(), admin.id, await report(), { reason: "FICTIONAL reason text" });
    const mail = (await latestOutbox(db(), target.email, "notice"))!;
    expect(mail.body).toContain("the address to write to is not named yet");
    expect(suspensionEmail("x.", null).body).not.toContain("@");
  });

  it("the notice is sent after the decision commits: the account is already suspended when it is written", async () => {
    const { admin, target, report } = await world();
    const reportId = await report();
    const seen: Array<Date | null> = [];
    web.beforeSend = async () => {
      // Another pooled connection sees only committed state.
      const [row] = await db().select().from(accounts).where(eq(accounts.id, target.id));
      seen.push(row!.suspendedAt);
    };
    await suspendAccount(db(), admin.id, reportId, { reason: "FICTIONAL reason text" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBeNull();
  });
});

/* ---------------------------------------------- item 20: the running version */

describe("runningVersion (SPEC §17 item 20)", () => {
  it("OURS_VERSION, then the host's commit (7 characters), then development or unversioned build", () => {
    vi.stubEnv("OURS_VERSION", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect(runningVersion()).toBe("development build");
    vi.stubEnv("NODE_ENV", "production");
    expect(runningVersion()).toBe("unversioned build");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    expect(runningVersion()).toBe("0123456");
    vi.stubEnv("OURS_VERSION", "v0-FICTIONAL");
    expect(runningVersion()).toBe("v0-FICTIONAL");
  });
});

/* --------------------------------------------- the verifiers' join path, whole */

describe("the whole emailed-invite path for an existing member", () => {
  it("request, mail, open, ask, Add: friends only after Add, and the email named the handle", async () => {
    const anna = await makeAccount({ handle: "anna_f", displayName: "Anna FICTIONAL" });
    const vera = await makeAccount({ handle: "vera_f" });
    const invite = await createInvite(db(), anna.id, {});
    web.headers.set("x-forwarded-for", "192.0.2.9");
    expect(await requestJoinAction(null, form({ code: invite.code, email: vera.email }))).toEqual({ ok: true });
    await runLater();
    const mail = (await latestOutbox(db(), vera.email, "join"))!;
    expect(mail.body).toContain("(@anna_f)");
    const token = tokenFromLink(mail.body)!;

    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join/confirm" });
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
    expect(await redirectOf(addInviterAction(null, form()))).toBe("/u/anna_f");
    expect(await areFriends(db(), anna.id, vera.id)).toBe(true);
    // The invite is spent: a second Add has nothing to apply.
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await db().select().from(friendships)).toHaveLength(1);
  });
});
