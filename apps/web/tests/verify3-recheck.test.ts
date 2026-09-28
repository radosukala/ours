/**
 * The one narrow re-check SPEC §17's stopping rule allows after the second
 * round (M-0010). Written by an agent that neither built nor fixed apps/web.
 *
 * It re-reads the verify2-* tests whose bodies the fixers changed
 * (git diff c7d979c a4c997f -- apps/web/tests) and asks whether each one
 * still tests what its verifier meant. Naming, as in the earlier rounds:
 *
 * - "DEFECT: …" asserts the property the product should have. It FAILS on
 *   a4c997f, and the failure is the evidence.
 * - "closed: …" is a door that was tried and held. It passes.
 *
 * The HIGH defect of round two (pairLock refusing a transaction made by
 * another copy of drizzle-orm) was re-checked over HTTP against a
 * production build, not here; the evidence is in the re-check report.
 *
 * Every person here is FICTIONAL, with an example.test address.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import pg from "pg";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, inject, it } from "vitest";
import CostsPage from "@/app/(public)/costs/page";
import PowerPage from "@/app/(public)/power/page";
import RulesPage from "@/app/(public)/rules/page";
import { openEmailLink, signOutEverywhere, updateProfile } from "@/core/accounts";
import { createEmailToken } from "@/core/auth";
import { createInvite, requestJoin } from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox } from "@/core/mail";
import { accounts, sessions } from "@/core/schema";
import { loadControl } from "@/core/transparency";
import { befriend, db, makeAccount, reset } from "./helpers";

beforeEach(reset);

const IP = rateKeyHash("203.0.113.9"); // RFC 5737 documentation address

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

/**
 * A line as a reader sees it: characters Unicode marks default-ignorable
 * (soft hyphen, combining grapheme joiner, the Arabic letter mark, the
 * Mongolian vowel separator, the deprecated format characters, tag
 * characters …) are not drawn by browsers or mail clients.
 */
const asSeen = (text: string) => text.replace(/\p{Default_Ignorable_Code_Point}/gu, "");

/** The first "@handle" a reader meets in a line (verify2-identity's rule). */
const firstHandle = (text: string) => /@([a-z0-9_]{3,20})/.exec(text)?.[1] ?? null;

/* ====================================================================== */
/* verify2-identity "fixed: a display name can carry a made-up '(@handle)'" */
/* ====================================================================== */

describe("a display name that reads as another member's handle (verify2-identity, rewritten)", () => {
  // The rewritten test tries one spelling, "(@anna_real)", which the fix
  // (HANDLE_LIKE: an at sign followed by a letter, digit or underscore)
  // refuses. FORMAT_CHARACTERS lists some invisible characters by range;
  // every other default-ignorable character passes both checks, is stored,
  // and is not drawn, so the reader sees "(@anna_real)" all the same.
  const INVISIBLE: Record<string, string> = {
    "U+00AD soft hyphen": "­",
    "U+034F combining grapheme joiner": "͏",
    "U+061C Arabic letter mark (a direction mark)": "؜",
    "U+180E Mongolian vowel separator": "᠎",
    "U+206A inhibit symmetric swapping": "⁪",
    "U+E0020 tag space": "\u{E0020}",
  };

  it("fixed: an invisible character between '@' and the handle passes validDisplayName, so the forged '(@anna_real)' is stored", async () => {
    const mallory = await makeAccount({ handle: "mallory_r3" });
    const accepted: string[] = [];
    for (const [label, ch] of Object.entries(INVISIBLE)) {
      const code = await codeOf(
        updateProfile(db(), mallory.id, { displayName: `Anna FICTIONAL (@${ch}anna_real)`, bio: "" }),
      );
      if (code !== "INVALID") accepted.push(`${label}: ${code}`);
    }
    expect(accepted, "names that read as '(@anna_real)' and were accepted").toEqual([]);
  });

  it("fixed: with a soft hyphen after the '@', the join email Vera receives names @anna_real first, as she reads it", async () => {
    // Vera is friends with the real Anna (@anna_real).
    const vera = await makeAccount({ handle: "vera_r3", email: "vera_r3@example.test" });
    const anna = await makeAccount({ handle: "anna_real", displayName: "Anna FICTIONAL" });
    await befriend(vera, anna);
    // The verifier's own name, 47 characters, with one soft hyphen (48).
    const mallory = await makeAccount({ handle: "mallory_r3" });
    const forged = "Anna FICTIONAL (@­anna_real) invited you to OURS";
    const stored = await codeOf(updateProfile(db(), mallory.id, { displayName: forged, bio: "" }));
    const invite = await createInvite(db(), mallory.id, {});
    await requestJoin(db(), { code: invite.code, email: vera.email, ipHash: IP });
    const mail = await latestOutbox(db(), vera.email, "join");
    // verify2-identity's firstHandle reads the raw subject, where the soft
    // hyphen breaks "@anna_real", so it finds @mallory_r3 and the rewritten
    // test would pass on this name. The reader does not see the soft hyphen.
    expect(
      { stored, firstHandleAsSeen: firstHandle(asSeen(mail!.subject)) },
      `subject as seen: ${asSeen(mail!.subject)}`,
    ).toEqual({ stored: "INVALID", firstHandleAsSeen: "mallory_r3" });
  });
});

/* ====================================================================== */
/* verify2-identity "fixed: 'sign out everywhere' racing a sign-in link"   */
/* ====================================================================== */

describe("sign out everywhere and a sign-in link (verify2-identity, re-staged by the fixer)", () => {
  // The fixer re-staged the race so that the link is first in line for
  // Kim's account row. This is the other order: sign out everywhere is
  // first in line, and the link has already read (peeked) the token before
  // it waits. The link must then be refused, and no session may be left.
  it("closed: a link that peeked its token before sign out everywhere took the account is refused, and leaves no session", async () => {
    const kim = await makeAccount({ handle: "kim_r3" });
    const token = await createEmailToken(db(), { email: kim.email, purpose: "sign_in" });
    const lockWaiters = async () =>
      Number(
        (
          (
            await db().execute(sql`
              select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`)
          ).rows[0] as { n: number }
        ).n,
      );
    const untilWaiting = async (n: number) => {
      for (let i = 0; i < 500; i++) {
        if ((await lockWaiters()) >= n) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`fewer than ${n} sessions waited on a lock`);
    };
    const holder = new pg.Client({ connectionString: inject("databaseUrl") });
    await holder.connect();
    let signedOut: Promise<unknown> | null = null;
    let opened: Promise<string> | null = null;
    try {
      await holder.query("begin");
      await holder.query("select id from accounts where id = $1 for update", [kim.id]);
      signedOut = signOutEverywhere(db(), kim.id);
      await untilWaiting(1);
      opened = codeOf(openEmailLink(db(), { token }));
      await untilWaiting(2);
      await holder.query("commit");
      await signedOut;
    } finally {
      await holder.end();
    }
    expect(await opened).toBe("NOT_FOUND");
    const live = await db()
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.accountId, kim.id), isNull(sessions.revokedAt)));
    expect(live).toHaveLength(0);
    expect(await db().select().from(accounts).where(eq(accounts.id, kim.id))).toHaveLength(1);
  });
});

/* ====================================================================== */
/* verify2-honesty "fixed: /power records 'Decisions are public' …"         */
/* ====================================================================== */

describe("what the pages call public (verify2-honesty, rewritten)", () => {
  /** Visible text of rendered HTML (verify2-honesty's textOf). */
  const textOf = (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;|&apos;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

  // The rewrite replaced "every RECORDED record is on origin/main" with a
  // list of three phrases no page may use (`publicNow`). The verifier's
  // point was that the pages must not call public what is not public yet.
  // A fourth phrase says the same thing and is on three pages. Changed
  // after the push (SPEC §18.14): the code row now says the code is public,
  // because it is; the pages still call a change a commit published with
  // each release, not a public commit.
  it("fixed (spec-level): /power, /costs and /rules say every change is a public commit; changed after the push: /power says the code is public", () => {
    const code = loadControl().find((r) => r.asset === "The code");
    expect(code?.who).toMatch(/^Apache-2\.0, and public: /);
    const pages = {
      "/power": textOf(renderToStaticMarkup(createElement(PowerPage))),
      "/costs": textOf(renderToStaticMarkup(createElement(CostsPage))),
      "/rules": textOf(renderToStaticMarkup(createElement(RulesPage))),
    };
    const saysPublicCommit = Object.entries(pages)
      .filter(([, text]) => /\bpublic commit\b/i.test(text))
      .map(([page]) => page);
    expect(saysPublicCommit, "pages that call every change a public commit before the code is public").toEqual([]);
  });
});
