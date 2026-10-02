/**
 * The re-check of M-0011 after the fourth verification (commit 40f99ea), by
 * an agent that did not build it. This is the only re-check: nothing
 * follows it.
 *
 * Stopping rule, declared before the first test was written: each door the
 * brief names in the code changed since f9a49fc is tried at least once —
 * the line going first, uniform seat use, a seat given back on false and on
 * throw, a removal giving seats back, joining and deleting clearing the
 * line, a seat never offered as a friendship, and the claims scan's new
 * patterns, normalization and handover ALLOWLIST. Each try ends here as a
 * failing "DEFECT: …" test or a passing "closed: …" test. Nothing in the
 * product code is changed by this file.
 *
 * Everyone here is FICTIONAL, with example.test addresses; client
 * addresses are keyed hashes of a documentation range (RFC 5737).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { openEmailLink } from "@/core/accounts";
import { ALLOWLIST, scanText } from "@/core/claims";
import { HANDOVER_THRESHOLD } from "@/core/config";
import type { Db } from "@/core/db";
import {
  completeJoin,
  createInvite,
  inviteOfferForViewer,
  SEAT_NOTE,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { type Defer, latestOutbox, tokenFromLink } from "@/core/mail";
import {
  emailTokens,
  invites,
  outbox,
  seatState as seatRow,
  waitlist,
} from "@/core/schema";
import { forgetWaitlistAddress, openSeats, requestSeat, seatState } from "@/core/seats";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(async () => {
  await reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const t0 = at("2026-09-28T10:00:00Z");
/** A different client address for each request. */
let nextIp = 0;
const ipOf = (n: number) => rateKeyHash(`198.51.100.${n % 250}`);

/* ---------------------------------------------------------------- helpers */

/** The maintainer: the oldest active administrator. */
async function maintainer() {
  return makeAccount({
    handle: "rado_fict",
    displayName: "Rado FICTIONAL",
    email: "rado_fict@example.test",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
  });
}

/** Ask for a seat on the front page, from a new client address. */
async function ask(
  email: string,
  options: { now?: Date; on?: Db; defer?: Defer } = {},
): Promise<void> {
  nextIp += 1;
  return requestSeat(options.on ?? db(), {
    email,
    ipHash: ipOf(nextIp),
    now: options.now ?? t0,
    defer: options.defer,
  });
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function openNow(): Promise<number> {
  return (await seatState(db())).open;
}

async function line(): Promise<string[]> {
  const rows = await db()
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((row) => row.email);
}

async function inLine(entries: [string, Date][]): Promise<void> {
  await db()
    .insert(waitlist)
    .values(entries.map(([email, createdAt]) => ({ email, createdAt })));
}

/** Messages that reached an address (the outbox transport: sent ones only). */
async function mailTo(email: string) {
  return db().select().from(outbox).where(eq(outbox.toAddress, email));
}

async function linkTo(email: string): Promise<string> {
  const mail = await latestOutbox(db(), email, "join");
  if (!mail) throw new Error(`no join mail to ${email}`);
  return tokenFromLink(mail.body)!;
}

async function seatInvites() {
  return db().select().from(invites).where(eq(invites.note, SEAT_NOTE));
}

/** The usable seat invites an address holds: those a link to it was made for. */
async function seatsHeldBy(email: string, now: Date): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ id: invites.id })
    .from(emailTokens)
    .innerJoin(invites, eq(invites.id, emailTokens.inviteId))
    .where(
      and(
        eq(emailTokens.email, email),
        eq(invites.note, SEAT_NOTE),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
      ),
    );
  return rows.map((row) => row.id);
}

/** The Resend transport chosen but not configured: every send returns ok: false. */
function transportRefuses(): void {
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
}

function quietErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

/**
 * The database, except that writing a message for `fails(address)` to the
 * outbox throws, as a provider refusing that address would make the send
 * fail. Everything else, transactions included, is the real database.
 */
function outboxWriteThrows(real: Db, fails: (to: string) => boolean): Db {
  return new Proxy(real, {
    get(target, property) {
      if (property === "insert") {
        return (table: Parameters<Db["insert"]>[0]) => {
          const builder = target.insert(table);
          if (table !== outbox) return builder;
          return {
            values: (row: { toAddress: string }) =>
              fails(row.toAddress)
                ? Promise.reject(new Error("FICTIONAL: the provider refused this address"))
                : builder.values(row as never),
          };
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The sentences in `claims` that the scan lets through in `file`. */
function passing(claims: string[], file: string): string[] {
  return claims.filter((claim) => scanText(`<p>${claim}</p>`, file).length === 0);
}

/* ================================================ DEFECTS: the line goes first */

describe("the line goes first (SPEC §18.12 item 18)", () => {
  it("fixed (SPEC §18.12 item 27): the address first in line learns nothing about an address typed into Get in: a member's request and a stranger's each send it the seat", async () => {
    const rado = await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    quietErrors();

    // A seat open while someone waits, by the product's own paths: a wave's
    // email to the waiting address fails, so the seat reopens and it keeps
    // its place (items 3 and 18).
    const seatOpenWhile = async (waiter: string, now: Date) => {
      await inLine([[waiter, plus.days(now, -2)]]);
      transportRefuses();
      await openSeats(db(), rado.id, 1, { now });
      vi.unstubAllEnvs();
      expect({ open: await openNow(), line: await line() }).toEqual({ open: 1, line: [waiter] });
    };

    await seatOpenWhile("pia_f@example.test", t0);
    await ask("vera_f@example.test", { now: plus.minutes(t0, 1) }); // a member's address
    const openAfterMember = await openNow();
    const toPia = (await mailTo("pia_f@example.test")).length;

    await seatOpenWhile("quin_f@example.test", plus.minutes(t0, 2));
    await ask("stranger_f@example.test", { now: plus.minutes(t0, 3) }); // a stranger's
    const openAfterStranger = await openNow();
    const toQuin = (await mailTo("quin_f@example.test")).length;

    expect([openAfterMember, openAfterStranger]).toEqual([0, 0]);
    // The line goes first for every request: each waiting address got the
    // seat, whichever kind of address was typed.
    expect([toPia, toQuin]).toEqual([1, 1]);
  });

  it("fixed (SPEC §18.12, after the re-check): one address whose seat email always fails, once it is first in line, keeps every open seat from every later newcomer: the front page goes on saying '3 seats open.' while each newcomer is put in line behind it (MEDIUM)", async () => {
    await maintainer();
    await setOpen(3);
    quietErrors();
    // An address the mail provider refuses every time. normEmail checks only
    // the shape x@y.z, so it accepts addresses a provider may refuse.
    const refused = "refused_f@example.test";
    const on = outboxWriteThrows(db(), (to) => to === refused);

    // One request while seats are open: the email fails, the seat goes back,
    // and the address waits first in line (items 3, 18 and 19).
    await ask(refused, { on, now: t0 });
    expect({ open: await openNow(), line: await line() }).toEqual({ open: 3, line: [refused] });

    const newcomers = ["ana_f@example.test", "ben_f@example.test", "cai_f@example.test"];
    for (const [i, email] of newcomers.entries()) {
      await ask(email, { on, now: plus.minutes(t0, i + 1) });
    }
    const holding: string[] = [];
    for (const email of newcomers) {
      if ((await seatsHeldBy(email, plus.minutes(t0, 5))).length > 0) holding.push(email);
    }

    // Each request offers its seat only to the first address in line; when
    // that email fails the seat comes back, and nobody after it is tried.
    // Three seats with one unmailable address ahead should still reach
    // someone; until an administrator removes the address, none does.
    const open = await openNow();
    expect(
      holding,
      `after three newcomers asked, ${open} seats are still open, and every newcomer waits in line: ${JSON.stringify(await line())}`,
    ).not.toEqual([]);
  });
});

/* ======================================== DEFECTS: a seat given back twice */

describe("a seat given back (SPEC §18.12 items 3, 17 and 19)", () => {
  it("fixed (SPEC §18.12, after the re-check): a wave's email that fails after its address was removed at its owner's request puts the address back in line and gives the seat back a second time; the next newcomer's request then mails that person a seat (MEDIUM)", async () => {
    const rado = await maintainer();
    await inLine([["gone_f@example.test", plus.days(t0, -2)]]);
    quietErrors();
    const wave: Array<() => Promise<void>> = [];
    expect(
      await openSeats(db(), rado.id, 1, { now: t0, defer: (task) => void wave.push(task) }),
    ).toEqual({ opened: 1, invited: 1 });

    // A wave's emails go out in one task after the response (recorded
    // after the fourth verification); a large wave takes a while. Before it
    // reaches her, she writes to the controller and the administrator
    // removes her address: her unused seat goes back (item 17).
    await forgetWaitlistAddress(db(), rado.id, "gone_f@example.test");
    expect({ open: await openNow(), line: await line() }).toEqual({ open: 1, line: [] });

    // Then the task reaches her, and her send fails.
    transportRefuses();
    await wave.shift()!();
    vi.unstubAllEnvs();
    const afterFailure = { open: await openNow(), line: await line() };

    // A newcomer asks, and the line goes first.
    await ask("next_f@example.test", { now: plus.minutes(t0, 5) });
    const mailedAfterRemoval = (await mailTo("gone_f@example.test")).map((m) => m.subject);

    // giveSeatBack reopens the seat and re-queues the address without
    // checking that the seat was still outstanding.
    expect(
      { afterFailure, mailedAfterRemoval },
      "the seat is counted back twice, and the removed address is back at its old place and is mailed a seat",
    ).toEqual({ afterFailure: { open: 1, line: [] }, mailedAfterRemoval: [] });
  });

  it("fixed (SPEC §18.12, after the re-check): a seat used while its first email was still waiting to be sent is given back when that email fails: the count gains a seat nobody gave up, the new member is put in line, and the line going first then mails the member another seat (LOW)", async () => {
    const rado = await maintainer();
    await inLine([["kai_f@example.test", plus.days(t0, -2)]]);
    quietErrors();
    const wave: Array<() => Promise<void>> = [];
    await openSeats(db(), rado.id, 1, { now: t0, defer: (task) => void wave.push(task) });

    // Before the wave's task reaches him, Kai asks again on the front page,
    // as the recorded note says a holder may, gets a link to the seat he
    // holds, and joins through it.
    await ask("kai_f@example.test", { now: plus.minutes(t0, 1) });
    const opened = await openEmailLink(db(), {
      token: await linkTo("kai_f@example.test"),
      now: plus.minutes(t0, 2),
    });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
    await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "FICTIONAL Kai",
      handle: "kai_f",
      adultConfirmed: true,
      now: plus.minutes(t0, 3),
    });

    // Then the task reaches him, and that first email fails.
    transportRefuses();
    await wave.shift()!();
    vi.unstubAllEnvs();
    const afterFailure = { open: await openNow(), line: await line() };

    // A newcomer asks; the line goes first, and nothing checks that the
    // address first in line has no account (openSeats does check).
    await ask("nia_f@example.test", { now: plus.minutes(t0, 10) });
    const seatEmailsToKai = (await mailTo("kai_f@example.test")).length;

    expect(
      { afterFailure, seatEmailsToKai },
      "a used seat is counted back, the member waits in line, and a newcomer's seat is spent on him",
    ).toEqual({ afterFailure: { open: 0, line: [] }, seatEmailsToKai: 1 });
  });

  it("fixed (SPEC §18.12, after the re-check): the one seat email item 19 does not reach: when a holder asks again and that email throws, requestSeat lets the throw out instead of catching it as it does a newcomer's, so in production afterResponse logs the whole error, not its name (LOW)", async () => {
    await maintainer();
    await setOpen(2);
    quietErrors();
    await ask("hana_f@example.test", { now: t0 }); // she holds a seat
    const on = outboxWriteThrows(
      db(),
      (to) => to === "hana_f@example.test" || to === "new_f@example.test",
    );
    const outcome = (request: Promise<void>) =>
      request.then(
        () => "resolved",
        () => "rejected",
      );
    const newcomer = await outcome(ask("new_f@example.test", { on, now: plus.minutes(t0, 1) }));
    const holder = await outcome(ask("hana_f@example.test", { on, now: plus.minutes(t0, 2) }));
    expect(
      { newcomer, holder },
      "a newcomer's throwing seat email is caught and logged by name; a holder's escapes requestSeat",
    ).toEqual({ newcomer: "resolved", holder: "resolved" });
  });
});

/* ======================================================= DEFECTS: the scan */

describe("the claims scan's new rules (SPEC §18.12 items 24 and 25)", () => {
  const FOOTER_FILE = "src/components/RightColumn.tsx";

  it("fixed (SPEC §18.12, after the re-check): the handover told as done passes the scan in plain words: 'The handover has happened.', the headline's own verb in the past tense, and the handover as held (MEDIUM)", () => {
    // M-0011: "No page may say the handover has happened." Item 24 says the
    // scan knows "the handover told as done"; its rule knows only "has been
    // handed" and "was handed". The first sentence here, the prohibition's
    // own words, and the last also pass the page-level check in
    // tests/contract.test.ts (handoverTold); the second and third are caught
    // there, but only on the pages that check renders, and nowhere by the
    // scan.
    expect(
      passing(
        [
          "The handover has happened.",
          "At 100,000 members, I gave it away.",
          "our.one was given away to its members.",
          "It is now in its members' hands.",
        ],
        FOOTER_FILE,
      ),
      "each of these tells the handover as done, and the claims scan finds nothing",
    ).toEqual([]);
  });

  it("fixed (SPEC §18.12, after the re-check): ownership in the future tense or the second person passes the scan in the forms people write: 'Then it's yours.', 'It will soon be yours.', 'you'll own it', 'belongs to you' (MEDIUM)", () => {
    // M-0011's adopted constraint: "The only future-tense ownership
    // sentences allowed are the handover promise and its conditions, each
    // listed by exact text." The rules catch "will be yours" and "you own",
    // but not an adverb in between, a contraction, "it's yours", "owners",
    // or "belongs to" anyone but members, users, people, the community or
    // everyone.
    expect(
      passing(
        [
          "Today it's mine. Then it's yours.",
          "It will soon be yours.",
          "At 100,000 members, you'll own it.",
          "our.one belongs to you.",
          "You will be its owners.",
        ],
        FOOTER_FILE,
      ),
      "each of these claims ownership, now or to come, and the claims scan finds nothing",
    ).toEqual([]);
  });

  it("fixed (SPEC §18.12, after the re-check): a handover sentence on pages that are not listed: the status line's 'Handed to its members at 100,000.' is in the footer of every public page and of the app's right column, and on /power, /costs and /rules, and is not in ALLOWLIST, where item 24 says every sentence about the handover must be; the scan lets it through because its rule knows only 'hand (it) over' and 'give(s) it away' (LOW)", () => {
    const footer = textOf(renderToStaticMarkup(createElement(SiteFooter)));
    const aboutTheHandover = /\bhand(?:s|ed|ing)?\b|\bhandover\b|\bg(?:ive|ives|iving|iven|ave) it away\b/i;
    const sentences = footer.split(/(?<=[.?!])\s+/).filter((s) => aboutTheHandover.test(s));
    // Since D-0016 §J the status line says "Promised: … go to", with no word
    // the rules catch, so the footer has no sentence for ALLOWLIST to list...
    expect(footer).toContain(STATUS_LINE);
    expect(sentences).toEqual([]);
    // ...the scan passes the file that holds it with nothing listed for it...
    const source = readFileSync(join(WEB_ROOT, FOOTER_FILE), "utf8");
    expect(scanText(source, FOOTER_FILE)).toEqual([]);
    expect(ALLOWLIST.filter((entry) => entry.file === FOOTER_FILE)).toEqual([]);
    // ...and the sentence about the handover it is, is listed by exact text in the decision.
    const d16 = readFileSync(join(WEB_ROOT, "../../decisions/D-0016.md"), "utf8").replace(/\s+/g, " ");
    expect(d16).toContain(
      `*"${STATUS_LINE.replace(HANDOVER_THRESHOLD.toLocaleString("en-US"), "[threshold]")}"*`,
    );
  });

  it("fixed (SPEC §18.12, after the re-check): markup and characters a reader does not see still split a claim past the new rules: a <br> with an attribute, a JSX fragment, and U+034F, which renders as nothing (LOW)", () => {
    // Item 25 reads <br> as a space, but only a bare <br>, <br/> or <br />.
    expect(
      passing(
        [
          'Today it\'s<br className="wide-only" />ours.',
          "Why not hand <>it</> over? It's done.",
          "I will hand\u034f over the domain.",
        ],
        FOOTER_FILE,
      ),
      "a reader sees \"it's ours\", \"hand it over\" and \"hand over\"; the scan sees neither",
    ).toEqual([]);
  });
});

/* ==================================================== closed: seats given back */

describe("closed doors: seats given back, and the line", () => {
  it("changed after the re-check (SPEC §18.12 item 27): when the address first in line is given the seat and its email fails, whether the send returns false or throws, it keeps its place, its seat invite is withdrawn, the seat is offered onward to the next in line, and the log names no address", async () => {
    await maintainer();
    const logged = quietErrors();
    await setOpen(1);
    await inLine([["old_f@example.test", plus.days(t0, -3)]]);

    transportRefuses(); // the send returns false
    await ask("new1_f@example.test", { now: t0 });
    vi.unstubAllEnvs();
    expect({ open: await openNow(), line: await line() }).toEqual({
      open: 1,
      line: ["old_f@example.test", "new1_f@example.test"],
    });

    // the send throws
    await ask("new2_f@example.test", {
      on: outboxWriteThrows(db(), (to) => to === "old_f@example.test"),
      now: plus.minutes(t0, 1),
    });
    // Offered onward: the next in line, new1, takes the seat (its email
    // works); old keeps its place, first in line.
    expect({ open: await openNow(), line: await line() }).toEqual({
      open: 0,
      line: ["old_f@example.test", "new2_f@example.test"],
    });

    expect(await seatsHeldBy("old_f@example.test", plus.minutes(t0, 2))).toEqual([]);
    expect(await seatsHeldBy("new1_f@example.test", plus.minutes(t0, 2))).toHaveLength(1);
    const made = await seatInvites();
    expect(made.filter((invite) => invite.revokedAt === null)).toHaveLength(1);
    expect(JSON.stringify(logged.mock.calls)).not.toMatch(/example\.test/);
  });

  it("closed: removing an address gives back each seat it holds once — a second removal gives nothing more — and removing an account holder's address gives nothing back", async () => {
    const rado = await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(2);
    await ask("hold_f@example.test");
    expect(await openNow()).toBe(1);

    await forgetWaitlistAddress(db(), rado.id, "hold_f@example.test");
    await forgetWaitlistAddress(db(), rado.id, "hold_f@example.test");
    await forgetWaitlistAddress(db(), rado.id, "vera_f@example.test");

    expect(await openNow()).toBe(2);
    const [seat] = await seatInvites();
    expect(seat!.revokedAt).not.toBeNull();
    expect(
      await db().select().from(emailTokens).where(eq(emailTokens.email, "hold_f@example.test")),
    ).toEqual([]);
  });

  it("closed: requests (a member, a holder, an address in line, newcomers, and an address whose every email fails), two waves and a removal racing never give an address two seats, never leave a holder in line, never leave an unused seat without a link, and never drive the count below zero", async () => {
    const rado = await maintainer();
    await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    quietErrors();
    const refused = "refused_f@example.test";
    const on = outboxWriteThrows(db(), (to) => to === refused);
    await setOpen(1);
    await ask("holder_f@example.test", { on, now: plus.minutes(t0, -30) });
    await inLine([
      [refused, plus.days(t0, -4)],
      ["l1_f@example.test", plus.days(t0, -3)],
      ["l2_f@example.test", plus.days(t0, -2)],
      ["l3_f@example.test", plus.days(t0, -1)],
    ]);
    await setOpen(2);

    const addresses = [
      "n1_f@example.test",
      "n2_f@example.test",
      "l2_f@example.test",
      "vera_f@example.test",
      "holder_f@example.test",
      refused,
    ];
    // Each request's task runs as takeSeat's afterResponse runs it: an error
    // is caught after the response. The only one expected is the held
    // path's uncaught send (the LOW defect above).
    const caught: unknown[] = [];
    const afterTheResponse: Defer = async (task) => {
      try {
        await task();
      } catch (error) {
        caught.push(error);
      }
    };
    const results = await Promise.allSettled([
      ...addresses.flatMap((email) => [
        ask(email, { on, defer: afterTheResponse }),
        ask(email, { on, defer: afterTheResponse }),
      ]),
      openSeats(on, rado.id, 2, { now: t0 }),
      forgetWaitlistAddress(on, rado.id, "l3_f@example.test"),
      openSeats(on, rado.id, 1, { now: t0 }),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(
      caught.filter(
        (error) => !(error instanceof Error && error.message === "FICTIONAL: the provider refused this address"),
      ),
    ).toEqual([]);

    expect(await openNow()).toBeGreaterThanOrEqual(0);
    const waiting = await line();
    for (const email of [...addresses, "l1_f@example.test", "l3_f@example.test"]) {
      const held = await seatsHeldBy(email, t0);
      expect(held.length, email).toBeLessThanOrEqual(1);
      if (held.length > 0) expect(waiting, email).not.toContain(email);
    }
    expect(await seatsHeldBy(refused, t0)).toEqual([]);
    expect(waiting).toContain(refused);
    expect(waiting).not.toContain("vera_f@example.test");
    expect(waiting).not.toContain("l3_f@example.test");
    const orphans = await db()
      .select({ id: invites.id })
      .from(invites)
      .leftJoin(emailTokens, eq(emailTokens.inviteId, invites.id))
      .where(
        and(
          eq(invites.note, SEAT_NOTE),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          isNull(emailTokens.id),
        ),
      );
    expect(orphans, "an unused seat invite with no link to anyone").toEqual([]);
  });
});

/* ================================================ closed: a seat is no friendship */

describe("closed doors: a seat link opened by an account holder", () => {
  it("closed: it is only a sign-in, whoever opens it, the maintainer included, while a person's own invite is still offered", async () => {
    const rado = await maintainer();
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    await setOpen(1);
    await ask("sia_f@example.test");
    const [seat] = await seatInvites();
    for (const viewerId of [vera.id, rado.id]) {
      expect(await inviteOfferForViewer(db(), { inviteId: seat!.id, viewerId, now: t0 })).toEqual({
        kind: "unusable",
      });
    }
    const own = await createInvite(db(), rado.id, { note: "FICTIONAL", now: t0 });
    expect((await inviteOfferForViewer(db(), { inviteId: own.id, viewerId: vera.id, now: t0 })).kind).toBe(
      "can_add",
    );

    // Sia joins some other way before she opens her seat link: it signs her in.
    await makeAccount({ handle: "sia_f", email: "sia_f@example.test" });
    const opened = await openEmailLink(db(), {
      token: await linkTo("sia_f@example.test"),
      now: plus.minutes(t0, 1),
    });
    expect(opened.kind).toBe("signed_in");
  });
});

/* ========================================================= closed: the scan */

describe("closed doors: the claims scan's handover list and new markup rules", () => {
  it("closed: each of the ten listed handover sentences passes only in its own file, and the new markup rules read <wbr>, <br/>, &zwj;, &lrm;, &minus; and bidi isolates as a reader does", () => {
    const elsewhere = "src/components/RightColumn.tsx";
    // Nine until M-0013: the old headline (twice) and "Why not hand it over now?" left the front page, and
    // the signed promise (twice) came (SPEC §18.15); the answer to "What's a maintainer?" (twice) came
    // after M-0013's verification. Since D-0016 §K the status line is not listed at all, nothing is let
    // through everywhere, and the signed promise (twice) is in its new words.
    const handover = ALLOWLIST.filter((entry) => /hand|give it away/i.test(entry.sentence));
    // Changed under M-0015 (its re-check): the contract's never-reached sentence is also
    // listed once on /agreement and once on /projects, each in its own file.
    expect(handover).toHaveLength(12);
    for (const entry of handover) {
      expect(scanText(entry.sentence, entry.file), entry.sentence).toEqual([]);
      expect(scanText(entry.sentence, elsewhere).length, entry.sentence).toBeGreaterThan(0);
    }
    for (const split of [
      "I will hand<wbr/> over the domain.",
      "It has been<br/>handed over.",
      "It&zwj;'s ours.",
      "I will hand&lrm; over the domain.",
      "our.one is member&minus;owned.",
      "It's \u2066ours\u2069.",
    ]) {
      expect(scanText(split, elsewhere).length, split).toBeGreaterThan(0);
    }
  });

  it("closed: the two files whose handover sentences are listed are imported by their own routes only, so a listed sentence reaches no other page", () => {
    const importers: Record<string, string[]> = { FrontPage: [], contract: [] };
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          const file = path.slice(WEB_ROOT.length).split("\\").join("/");
          if (/from\s+["'][^"']*components\/public\/FrontPage["']/.test(text)) importers.FrontPage!.push(file);
          if (/from\s+["'][^"']*contract\/page["']/.test(text)) importers.contract!.push(file);
        }
      }
    };
    walk(join(WEB_ROOT, "src"));
    expect(importers).toEqual({ FrontPage: ["src/app/(public)/page.tsx"], contract: [] });
  });
});
