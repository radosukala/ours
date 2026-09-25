/**
 * Independent re-verification of apps/web under M-0010 (second and final
 * round, SPEC §17 stopping rule).
 * LENS: identity, sessions, tokens and joining.
 *
 * Written by a verifier that neither built apps/web nor fixed it. Naming:
 *
 * - "DEFECT: …" asserts the property the product should have. It FAILS
 *   today, and the failure is the evidence.
 * - "closed: …" is a door that was tried and held. It passes, and is kept
 *   as evidence that the attack was tried.
 *
 * Stopping rule, declared before the first check: stop when every attack
 * named in the lens, and every changed mechanism in it (the pair lock in
 * useInviteAsExisting, /join/confirm and the ours_invite cookie,
 * CLIENT_IP_HEADER and the CLOSED switch, mail deferred with after(), the
 * __Host- names, sign out everywhere retiring links), has at least one test
 * here or in the HTTP evidence below. No fixes are made here; no other file
 * is edited.
 *
 * Server actions are called directly, with next/headers replaced by an
 * in-memory cookie jar and header map (the same harness as
 * verify-identity.test.ts). Races are made certain, not hoped for: a
 * separate connection holds one row lock, or a paused statement waits,
 * while the other operation runs; the lock or pause only fixes the order
 * that two concurrent requests can produce. Everyone here is FICTIONAL,
 * with example.test addresses and documentation address ranges (RFC 5737,
 * RFC 3849).
 *
 * Adapted first-round tests, reviewed (git diff 9c1df35 dafb604):
 * - verify-identity "fixed: per-IP sign-in limit …": the stubbed
 *   CLIENT_IP_HEADER models a deployment as §17 item 3 decides; sound for
 *   IPv4. IPv6 is not covered by it: see the IPv6 DEFECT below.
 * - verify-identity "accepted: how long a sign-in request takes …": the
 *   queue `defer` stands in for Next's after(). Checked over HTTP against a
 *   production build (evidence below): after() really runs after the
 *   response, so the adaptation hides nothing.
 * - verify-identity "fixed: opening someone else's sign-in link …": the
 *   refusal replaces the verifier's hoped-for question, as §17 item 5
 *   decides; the two original assertions are kept. Sound.
 * - verify-identity / verify-privacy "accepted: a taken username …": sound
 *   for username changes, but the same oracle through the join form has no
 *   limit: see the DEFECT below.
 * - verify-identity "fixed (hardening): __Host- cookies": rewritten from a
 *   constant check to production behaviour; confirmed over HTTP below.
 * - verify-privacy / verify-abuse race harnesses for an invite used while
 *   a block commits: re-staged by the fixer. Re-run here with my own two
 *   schedules (block before the pair lock; block while the invite use holds
 *   it): both hold. The adaptation hides nothing in this lens.
 * - signin.test.ts: the join-link tests now assert "offer, don't apply",
 *   as §17 item 1 decides. Sound.
 *
 * HTTP evidence (not a test; recorded once, 24 September 2026, against
 * `next build && next start -p 3322`, NODE_ENV=production, a throwaway
 * database, outbox transport, CLIENT_IP_HEADER=x-test-client-ip, fictional
 * seed; server actions called with their real ids and React's encodeReply):
 * - PAIR LOCK IN PRODUCTION (the first DEFECT below): on a freshly started
 *   server, if the first request that opens the database is a route
 *   handler (GET /api/health, GET /settings/export with a session), then
 *   block, sendFriendRequest, toggleLike and Add on /join/confirm all
 *   answer "Something went wrong. Please try again." and write nothing;
 *   the log says "pairLock must be taken inside a transaction." It lasts
 *   until the process restarts. If a page opens the database first (/,
 *   /home, /signin, /i/<code>, /people/following, /join/confirm), the same
 *   writes work. Built chunks: two app-page copies of core/visibility.ts
 *   (.next/server/chunks/ssr/[root-of-the-server]__0ps83kr, __0akotrh) and
 *   the route-handler bundle's own drizzle-orm.
 * - Timing (SPEC §17 item 4): the outbox insert was made to sleep 300 ms
 *   in the database (a stand-in for a slow transport). Spaced requests:
 *   median 13.4 ms for an existing account, 11.4 ms for none (10 each);
 *   the answer bodies were identical; all 40 links were mailed after the
 *   responses. So after() really defers, and the adapted "accepted:" test
 *   hides nothing. (Back-to-back requests showed pool waits of ~200 ms
 *   because my stand-in held a database connection while sleeping; the
 *   resend transport holds none during its network call.)
 * - Cookies: __Host-ours_session and __Host-ours_invite are set with
 *   Path=/; Secure; HttpOnly; SameSite=lax and no Domain (session 60
 *   days, invite 15 minutes); the same value under the plain name
 *   ours_session is ignored (GET /home → 307 /signin).
 * - Headers on 200, 307, 404, 405 and route handlers: CSP with
 *   frame-ancestors 'none' (script-src 'self' 'unsafe-inline', no
 *   'unsafe-eval'), X-Frame-Options DENY, nosniff, Referrer-Policy
 *   same-origin, HSTS; no X-Powered-By.
 * - CSRF: sign out everywhere and Add with Origin http://evil.example,
 *   http://tools.localhost:3322 (a sibling host) or null: 500, nothing
 *   done. A handcrafted request with Origin evil.example AND
 *   x-forwarded-host evil.example passes Next's check (a browser cannot
 *   send that header cross-site without a preflight, and SameSite=lax
 *   withholds the cookie anyway).
 * - The whole emailed-invite path for an existing member: subject "Ada
 *   Quillon (@ada_quillon) invited you to OURS", /join/confirm asks "Add
 *   Ada Quillon (@ada_quillon) as a friend?", Add from a foreign origin
 *   refused, Add from the site → friends, redirect to /u/ada_quillon.
 * - Without CLIENT_IP_HEADER: sign-in and join requests answer the CLOSED
 *   sentence; no rate event and no link are written.
 * - /signin when signed in → /home whatever ?next=/redirect=/returnTo
 *   say; cron POST without or with a wrong bearer → 401, GET → 405;
 *   /api/health returns counts only.
 */
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  headers: new Map<string, string>(),
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

import {
  changeHandle,
  signOutEverywhere,
  updateProfile,
  verifyEmailLink,
} from "@/core/accounts";
import {
  createEmailToken,
  createPendingJoin,
  createSession,
  inviteOfferCookieValue,
  sessionFromCookie,
} from "@/core/auth";
import { accountCreationOpen } from "@/core/config";
import { block as blockCore } from "@/core/connections";
import type { Db } from "@/core/db";
import { isCoreError } from "@/core/errors";
import {
  applyInviteAsExisting,
  completeJoin,
  createInvite,
  INVITE_UNUSABLE,
  requestJoin,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox } from "@/core/mail";
import * as schema from "@/core/schema";
import { accounts, emailTokens, friendships, invites, sessions } from "@/core/schema";
import { areFriends, isBlocked } from "@/core/visibility";
import { INVITE_COOKIE, SESSION_COOKIE } from "@/web/session";
import { openEmailLinkAction } from "@/app/(public)/auth/actions";
import { requestSignInAction } from "@/app/(public)/signin/actions";
import { requestJoinAction } from "@/app/(public)/i/[code]/actions";
import { addInviterAction } from "@/app/(public)/join/confirm/actions";
import ConfirmInvitePage from "@/app/(public)/join/confirm/page";
import { at, befriend, db, makeAccount, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  web.jar.clear();
  web.cookieOptions.clear();
  web.headers.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const IP = rateKeyHash("203.0.113.9"); // RFC 5737 documentation address

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (isCoreError(error)) return error.code;
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return `redirect:${digest.split(";")[2] ?? ""}`;
    }
    throw error;
  }
}

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** The first "@handle" a reader meets in a line of text. */
function firstHandle(text: string): string | null {
  return /@([a-z0-9_]{3,20})/.exec(text)?.[1] ?? null;
}

/** The text of the page's h1, entities decoded enough to read. */
function headingOf(html: string): string {
  const inner = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
  return inner
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

async function liveSessionsOf(accountId: string) {
  return db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
}

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
  throw new Error(`test harness: fewer than ${n} sessions ever waited on a lock`);
}

/**
 * A database handle on its own pool whose connections pause just before the
 * first statement matching `match`, run `during` until it has finished or
 * is waiting on a lock, and then go on. Only the order is fixed; nothing is
 * skipped.
 */
function pausedBefore(match: RegExp, during: () => Promise<unknown>) {
  const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 3 });
  let armed = true;
  let competitor: Promise<unknown> | null = null;
  pool.on("connect", (client) => {
    const original = client.query.bind(client) as (...args: unknown[]) => unknown;
    (client as unknown as { query: (...args: unknown[]) => unknown }).query = (
      ...args: unknown[]
    ) => {
      const first = args[0] as { text?: unknown } | string | undefined;
      const text =
        typeof first === "string" ? first : typeof first?.text === "string" ? first.text : "";
      if (!armed || !match.test(text)) return original(...args);
      armed = false;
      const callback =
        typeof args[args.length - 1] === "function"
          ? (args.pop() as (error: unknown, result?: unknown) => void)
          : null;
      const go = (async () => {
        let done = false;
        competitor = during().finally(() => {
          done = true;
        });
        competitor.catch(() => undefined);
        for (let i = 0; i < 500 && !done; i++) {
          if ((await lockWaiters()) > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return original(...args) as Promise<unknown>;
      })();
      if (callback) {
        go.then(
          (r) => callback(null, r),
          (e) => callback(e),
        );
        return undefined;
      }
      return go;
    };
  });
  return {
    db: drizzle(pool, { schema }) as unknown as Db,
    fired: () => !armed,
    finish: async () => {
      try {
        if (competitor) await competitor;
      } finally {
        await pool.end();
      }
    },
  };
}

/* ======================================================================= */
/*                                 DEFECTS                                 */
/* ======================================================================= */

describe("DEFECTS in identity, tokens and joining (second round)", () => {
  it("fixed: pairLock refuses a transaction made by another copy of drizzle-orm, so in a production build block, Add and every pair-locked write fail once a route handler opened the database first", async () => {
    // Production (`next build && next start`) bundles route handlers and
    // pages apart, each with its own copy of drizzle-orm, while
    // core/db.ts keeps ONE drizzle instance on globalThis for the whole
    // process: whichever bundle calls getDb() first makes it. pairLock
    // (core/visibility.ts) then checks `tx instanceof PgTransaction`
    // against its own bundle's class. Over HTTP, after one GET /api/health
    // (or /settings/export) on a fresh server, block, friend requests,
    // likes and Add on /join/confirm all answered "Something went wrong"
    // and wrote nothing, until the server was restarted.
    //
    // Here the CommonJS build of drizzle-orm stands in for the other
    // bundle's copy: a real drizzle transaction, not this module's class.
    const requireCjs = createRequire(import.meta.url);
    const other = requireCjs("drizzle-orm/node-postgres") as {
      drizzle: (pool: pg.Pool, config: { schema: typeof schema }) => unknown;
    };
    const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 2 });
    const otherDb = other.drizzle(pool, { schema }) as Db;

    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const pest = await makeAccount({ handle: "pest_w" });
    const invite = await createInvite(db(), anna.id, {});
    const outcome = async (p: Promise<unknown>) =>
      p.then(
        () => "OK",
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      );
    let results: Record<string, string>;
    try {
      results = {
        block: await outcome(blockCore(otherDb, vera.id, pest.id)),
        add: await outcome(
          applyInviteAsExisting(otherDb, { accountId: vera.id, inviteId: invite.id }),
        ),
      };
    } finally {
      await pool.end();
    }
    expect({
      ...results,
      blocked: await isBlocked(db(), vera.id, pest.id),
      friends: await areFriends(db(), anna.id, vera.id),
    }).toEqual({ block: "OK", add: "OK", blocked: true, friends: true });
  });

  it("fixed: a display name can carry a made-up '(@handle)', so the join email and /join/confirm show another member's handle first", async () => {
    // Vera is friends with the real Anna (@anna_real).
    const vera = await makeAccount({ handle: "vera_w", email: "vera_w@example.test" });
    const anna = await makeAccount({ handle: "anna_real", displayName: "Anna FICTIONAL" });
    await befriend(vera, anna);

    // Mallory copies Anna's name AND handle into her own display name. The
    // name is 47 characters, under the 50 allowed. Fixed (architect's
    // decision 10): validDisplayName refuses "@" followed by handle
    // characters, so the name is refused and Mallory keeps her own; on the
    // unfixed code it was accepted.
    const mallory = await makeAccount({ handle: "mallory_w" });
    expect(
      await codeOf(
        updateProfile(db(), mallory.id, {
          displayName: "Anna FICTIONAL (@anna_real) invited you to OURS",
          bio: "",
        }),
      ),
    ).toBe("INVALID");
    const invite = await createInvite(db(), mallory.id, {});
    await requestJoin(db(), { code: invite.code, email: vera.email, ipHash: IP });
    const mail = await latestOutbox(db(), vera.email, "join");
    // Subject today: "Anna FICTIONAL (@anna_real) invited you to OURS
    // (@mallory_w) invited you to OURS" — an inbox preview cut at ~45
    // characters shows only the forged part.

    // Vera opens the link: signed in, and asked on /join/confirm.
    const token = /\/auth#([A-Za-z0-9_-]+)/.exec(mail!.body)![1]!;
    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join/confirm" });
    const heading = headingOf(renderToStaticMarkup(await ConfirmInvitePage()));

    // SPEC §17 items 1–2 name the inviter as "Name (@handle)" because a
    // display name can be copied and a handle cannot. The first handle a
    // reader meets must therefore be the inviter's own.
    expect(
      { subject: firstHandle(mail!.subject), heading: firstHandle(heading) },
      `subject: ${mail!.subject}\nheading: ${heading}`,
    ).toEqual({ subject: "mallory_w", heading: "mallory_w" });
  });

  it("fixed: a display name may hold bidirectional-override characters, which reorder whatever follows it in 'Name (@handle)'", async () => {
    const vera = await makeAccount({ handle: "vera_w", email: "vera_w@example.test" });
    const mallory = await makeAccount({ handle: "mallory_w" });
    // U+202E RIGHT-TO-LEFT OVERRIDE: everything after it on the line is
    // shown reversed, so the handle that follows the name reads backwards.
    // Fixed (architect's decision 10): the name is refused; on the unfixed
    // code it was stored.
    expect(
      await codeOf(updateProfile(db(), mallory.id, { displayName: "Anna FICTIONAL ‮", bio: "" })),
    ).toBe("INVALID");
    const invite = await createInvite(db(), mallory.id, {});
    await requestJoin(db(), { code: invite.code, email: vera.email, ipHash: IP });
    const mail = await latestOutbox(db(), vera.email, "join");
    const [row] = await db()
      .select({ displayName: accounts.displayName })
      .from(accounts)
      .where(eq(accounts.id, mallory.id));
    const BIDI = /[‎‏‪-‮⁦-⁩]/;
    expect(
      { stored: BIDI.test(row!.displayName), subject: BIDI.test(mail!.subject) },
      JSON.stringify(mail!.subject),
    ).toEqual({ stored: false, subject: false });
  });

  it("fixed: the 5-a-day limit on trying usernames (SPEC §17 item 9) does not reach the join form: one pending join tries any number", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    // Handles held by active and suspended accounts: a suspended account is
    // hidden from everyone (SPEC §6), and "taken" is how the join form tells.
    const held = ["held_1", "held_2", "held_3", "held_4", "held_5", "held_6", "held_7", "held_8"];
    for (const [i, handle] of held.entries()) {
      await makeAccount({ handle, suspended: i % 2 === 0 });
    }
    const invite = await createInvite(db(), anna.id, {});
    const pending = await createPendingJoin(db(), {
      email: "prober_w@example.test",
      inviteId: invite.id,
    });
    const answers: string[] = [];
    for (const handle of held) {
      answers.push(
        await codeOf(
          completeJoin(db(), {
            pendingJoinId: pending.id,
            displayName: "FICTIONAL Prober",
            handle,
            adultConfirmed: true,
          }),
        ),
      );
    }
    // A username change is refused from the sixth try on, taken or not, so
    // the answer stops saying whether a name is held. The join form is the
    // same question with no limit.
    expect(answers.slice(5), answers.join(",")).toEqual([
      "RATE_LIMITED",
      "RATE_LIMITED",
      "RATE_LIMITED",
    ]);
  });

  it("fixed: 'sign out everywhere' racing a sign-in link opened a moment before leaves that browser signed in", async () => {
    const kim = await makeAccount({ handle: "kim_w" });
    // Someone with a link to Kim's mailbox (a forwarded or stolen link).
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });

    const holder = new pg.Client({ connectionString: inject("databaseUrl") });
    await holder.connect();
    let opened: ReturnType<typeof openEmailLinkAction> | null = null;
    let signedOut: Promise<void> | null = null;
    try {
      await holder.query("begin");
      // Only fixes the schedule: the link is opened first and waits here.
      await holder.query("select id from accounts where id = $1 for update", [kim.id]);
      opened = openEmailLinkAction(token);
      await untilWaiting(1);
      // Kim, on her own device, signs out everywhere a moment later.
      // Re-staged for the fix (architect's decision 11): both now take
      // Kim's account row (the link for share, from before it is used
      // until its session exists; sign out everywhere for update, first),
      // so sign out everywhere waits here too, where on the unfixed code it
      // finished at once. Awaiting it before the commit would only wait on
      // this harness's own lock.
      signedOut = signOutEverywhere(db(), kim.id);
      await untilWaiting(2);
      await holder.query("commit");
      await signedOut;
    } finally {
      await holder.end();
    }
    // The link was first in line: it is used, with its session, and then
    // sign out everywhere revokes that session.
    expect(await opened).toEqual({ ok: true, next: "/home" });

    // Serially, either the link was used and its session revoked, or the
    // link was retired and refused. Interleaved, a live session remains
    // after "sign out everywhere" has finished.
    const browser = await sessionFromCookie(db(), web.jar.get(SESSION_COOKIE));
    expect(
      { live: (await liveSessionsOf(kim.id)).length, browserSignedInAs: browser },
      "a live session after sign out everywhere had finished",
    ).toEqual({ live: 0, browserSignedInAs: null });
  });

  it("fixed: the per-address limits count each IPv6 address on its own, so one client moving inside its /64 is never limited", async () => {
    // A deployment that names its proxy's header, as SPEC §17 item 3 asks.
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    // SPEC §8: 20 sign-in requests an hour per client address. One client
    // holds 2001:db8:1:2::/64 (an ordinary single allocation; RFC 3849
    // documentation range) and uses a new address from it for each request.
    const refused: number[] = [];
    for (let i = 1; i <= 25; i++) {
      web.headers.set("x-vercel-forwarded-for", `2001:db8:1:2::${i.toString(16)}`);
      const result = await requestSignInAction(
        null,
        form({ email: `sprayed_${i}@example.test` }),
      );
      if (result && !result.ok) refused.push(i);
    }
    expect(refused.length, "no request from the one /64 was refused").toBeGreaterThan(0);
  });

  it("fixed: a placeholder for the controller's address ('[CONFIRM]') opens account creation", async () => {
    // SPEC §2 rule 6 and M-0010: a missing human decision switches account
    // creation off. A value that is not an address names no one to write to,
    // but counts as named, and /privacy then tells people to write to it.
    vi.stubEnv("DATA_CONTROLLER", "[CONFIRM]");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "[CONFIRM]");
    const anna = await makeAccount({ handle: "anna_w" });
    const invite = await createInvite(db(), anna.id, {});
    const answer = await codeOf(
      requestJoin(db(), { code: invite.code, email: "newcomer_w@example.test", ipHash: IP }),
    );
    expect({ open: accountCreationOpen(), answer }).toEqual({ open: false, answer: "CLOSED" });
  });
});

/* ======================================================================= */
/*                          DOORS TRIED AND CLOSED                         */
/* ======================================================================= */

describe("closed: the pair lock between an invite use and a block (re-staged, my own schedules)", () => {
  it("closed: the block commits before the invite use takes the pair lock: the use is refused, no friendship", async () => {
    const inviter = await makeAccount({ handle: "inviter_w" });
    const guest = await makeAccount({ handle: "guest_w" });
    const invite = await createInvite(db(), inviter.id, {});
    const race = pausedBefore(/pg_advisory_xact_lock/, () =>
      blockCore(db(), inviter.id, guest.id),
    );
    let outcome: string;
    try {
      outcome = await codeOf(
        applyInviteAsExisting(race.db, { accountId: guest.id, inviteId: invite.id }),
      );
    } finally {
      await race.finish();
    }
    expect(race.fired()).toBe(true);
    expect(outcome).toBe("NOT_FOUND");
    expect(await isBlocked(db(), inviter.id, guest.id)).toBe(true);
    expect(await db().select().from(friendships)).toHaveLength(0);
    const [row] = await db().select().from(invites).where(eq(invites.id, invite.id));
    expect(row!.usedAt).toBeNull();
  });

  it("closed: the block starts while the invite use holds the pair lock: it waits, then removes the friendship", async () => {
    const inviter = await makeAccount({ handle: "inviter_w" });
    const guest = await makeAccount({ handle: "guest_w" });
    const invite = await createInvite(db(), inviter.id, {});
    const race = pausedBefore(/^insert into "friendships"/i, () =>
      blockCore(db(), inviter.id, guest.id),
    );
    let outcome: string;
    try {
      outcome = await codeOf(
        applyInviteAsExisting(race.db, { accountId: guest.id, inviteId: invite.id }),
      );
    } finally {
      await race.finish();
    }
    expect(race.fired()).toBe(true);
    expect(outcome).toBe("OK");
    expect(await isBlocked(db(), inviter.id, guest.id)).toBe(true);
    expect(await db().select().from(friendships)).toHaveLength(0);
  });
});

describe("closed: /join/confirm and the ours_invite cookie", () => {
  it("closed: two tabs open one join link for an existing member at once: one session, one offer, the other 'expired or used'", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await createEmailToken(db(), {
      email: vera.email,
      purpose: "join",
      inviteId: invite.id,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => verifyEmailLink(db(), { token })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect((ok[0] as PromiseFulfilledResult<unknown>).value).toMatchObject({
      kind: "joined_existing",
      inviteId: invite.id,
    });
    expect(await db().select().from(friendships)).toHaveLength(0);
  });

  it("closed: two members press Add through one invite at the same moment: one friendship, the invite used once", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const olga = await makeAccount({ handle: "olga_w" });
    const invite = await createInvite(db(), anna.id, {});
    const outcomes = await Promise.all(
      [vera, olga].map((who) =>
        codeOf(applyInviteAsExisting(db(), { accountId: who.id, inviteId: invite.id })),
      ),
    );
    expect(outcomes.sort()).toEqual(["NOT_FOUND", "OK"]);
    expect(await db().select().from(friendships)).toHaveLength(1);
    const [row] = await db().select().from(invites).where(eq(invites.id, invite.id));
    expect([vera.id, olga.id]).toContain(row!.usedBy);
  });

  it("closed: an offer cookie replayed after Add, or after someone else used the invite, applies nothing more", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const olga = await makeAccount({ handle: "olga_w" });
    const invite = await createInvite(db(), anna.id, {});
    const veraSession = await createSession(db(), vera.id);
    const offer = inviteOfferCookieValue({ inviteId: invite.id, accountId: vera.id });

    // Olga uses it first; Vera's saved offer then finds it unusable.
    await applyInviteAsExisting(db(), { accountId: olga.id, inviteId: invite.id });
    web.jar.set(SESSION_COOKIE, veraSession.cookieValue);
    web.jar.set(INVITE_COOKIE, offer.cookieValue);
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    web.jar.set(INVITE_COOKIE, offer.cookieValue);
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
  });

  it("closed: an offer is worth nothing once its account is suspended (the session is refused, Add redirects to sign in)", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const invite = await createInvite(db(), anna.id, {});
    const session = await createSession(db(), vera.id);
    web.jar.set(SESSION_COOKIE, session.cookieValue);
    web.jar.set(
      INVITE_COOKIE,
      inviteOfferCookieValue({ inviteId: invite.id, accountId: vera.id }).cookieValue,
    );
    await db().update(accounts).set({ suspendedAt: new Date() }).where(eq(accounts.id, vera.id));
    expect(await codeOf(addInviterAction(null, form()))).toBe("redirect:/signin");
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
  });

  it("closed: an inviter who blocked you, then unblocked, before you pressed Add: nothing comes back by itself", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const invite = await createInvite(db(), anna.id, {});
    const token = await createEmailToken(db(), {
      email: vera.email,
      purpose: "join",
      inviteId: invite.id,
    });
    expect(await openEmailLinkAction(token)).toEqual({ ok: true, next: "/join/confirm" });
    await blockCore(db(), anna.id, vera.id);
    // Blocked: Add is refused and the offer is dropped.
    expect(await addInviterAction(null, form())).toEqual({ ok: false, error: INVITE_UNUSABLE });
    expect(web.jar.has(INVITE_COOKIE)).toBe(false);
    expect(await areFriends(db(), anna.id, vera.id)).toBe(false);
  });
});

describe("closed: the client-address header and the CLOSED switch", () => {
  it("closed: production with a CLIENT_IP_HEADER that cannot be a header name is CLOSED, like a missing one", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "x forwarded for");
    const anna = await makeAccount({ handle: "anna_w" });
    const invite = await createInvite(db(), anna.id, {});
    web.headers.set("x-forwarded-for", "203.0.113.9");
    const signIn = await requestSignInAction(null, form({ email: anna.email }));
    const join = await requestJoinAction(
      null,
      form({ code: invite.code, email: "newcomer_w@example.test" }),
    );
    expect(signIn).toMatchObject({ ok: false });
    expect(join).toMatchObject({ ok: false });
    expect(await db().select().from(emailTokens)).toHaveLength(0);
  });

  it("closed: with a named header, a client-written x-forwarded-for is not read, and IPv4 clients are limited per address", async () => {
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    web.headers.set("x-vercel-forwarded-for", "203.0.113.9");
    const refused: number[] = [];
    for (let i = 1; i <= 22; i++) {
      web.headers.set("x-forwarded-for", `198.51.100.${i}`);
      const result = await requestSignInAction(null, form({ email: `v4_${i}@example.test` }));
      if (result && !result.ok) refused.push(i);
    }
    expect(refused).toEqual([21, 22]);
  });
});

describe("closed: sessions, links and handles", () => {
  it("closed: a handle change racing a join for the same handle: one holds it, the other is CONFLICT, and both tries count", async () => {
    const anna = await makeAccount({ handle: "anna_w" });
    const vera = await makeAccount({ handle: "vera_w" });
    const invite = await createInvite(db(), anna.id, {});
    const pending = await createPendingJoin(db(), {
      email: "racer_w@example.test",
      inviteId: invite.id,
    });
    const [join, change] = await Promise.all([
      codeOf(
        completeJoin(db(), {
          pendingJoinId: pending.id,
          displayName: "FICTIONAL Racer",
          handle: "wanted_w",
          adultConfirmed: true,
        }),
      ),
      codeOf(changeHandle(db(), vera.id, "wanted_w", at("2026-09-01T12:00:00Z"))),
    ]);
    expect([join, change].sort()).toEqual(["CONFLICT", "OK"]);
    const holders = await db().select().from(accounts).where(eq(accounts.handle, "wanted_w"));
    expect(holders).toHaveLength(1);
  });
});
