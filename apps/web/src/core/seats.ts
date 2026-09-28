/**
 * Seats, the waiting list and the public count (SPEC §18.4, M-0011).
 *
 * - The count (`memberCount`) is the accounts that exist and are not
 *   suspended (D-0012 §B). A deleted account no longer exists, and the
 *   waiting list is never counted.
 * - A seat is an invitation from the maintainer, the oldest active
 *   administrator. An administrator opens seats (`openSeats`); a visitor
 *   takes one (`requestSeat`) and is sent a join link at once. The link is
 *   an ordinary join link for a seat invite (invites.ts), so joining goes
 *   through /auth and /join unchanged, and the maintainer is recorded as
 *   the inviter. With no seat open the address waits in line, and opening
 *   seats invites the oldest addresses first.
 * - Seats are off (CLOSED) while no data controller is named (M-0011:
 *   both stay off until a controller is named). Asking for one is also
 *   off while production names no client-address header, the gates
 *   joining has (SPEC §17 item 3), and while there is no maintainer.
 *   Removing an address from the line is never off: it is how an owner's
 *   request to be deleted is carried out.
 * - A request never tells whether the address has an account, is already
 *   in line, or took a seat. The request does the same work for every
 *   address (the two rate limits), and the rest runs in one task after the
 *   response (`nowOrDeferred`, SPEC §17 item 4).
 * - Every decision about seats first takes the lock on the one seat_state
 *   row (`lockSeats`), so they happen one at a time: a seat is taken once,
 *   `open` never goes below zero (the table's check refuses that anyway),
 *   and no address is put in line while a seat opened before it stays open.
 * - The waiting list keeps an address and a time, nothing else. An address
 *   leaves it when it is invited, or when its owner asks
 *   (`forgetWaitlistAddress`).
 */
import { and, asc, count as countRows, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { createEmailToken } from "./auth";
import { accountCreationOpen, appUrl, clientIpHeader } from "./config";
import { type Db, withTx } from "./db";
import { closed, invalid, notFound } from "./errors";
import { createSeatInvite, SEAT_NOTE } from "./invites";
import { hit, RATE, rateKeyHash } from "./limits";
import { type Defer, nowOrDeferred, sendMail } from "./mail";
import { seatEmail } from "./mail-templates";
import {
  accounts,
  emailTokens,
  invites,
  outbox,
  pendingJoins,
  seatState as seatRow,
  waitlist,
} from "./schema";
import { normEmail } from "./validate";

/** What the front page's form answers whenever seats are off (SPEC §18.2, §18.4). */
export const SEATS_CLOSED = "Joining opens soon.";
/** What an administrator is told: seats stay off until a controller is named (M-0011). */
export const SEATS_OFF =
  "Seats stay off until a data controller is named (DATA_CONTROLLER and DATA_CONTROLLER_EMAIL).";
/** The most seats one call to `openSeats` opens (SPEC §18.4). */
export const OPEN_SEATS_MAX = 10_000;
export const OPEN_SEATS_INVALID = `Open a whole number of seats, from 1 to ${OPEN_SEATS_MAX.toLocaleString("en-US")}.`;

/** The seat_state row's id: there is only this one (a check holds it). */
const SEATS_ID = "seats";
/** How many addresses a wave takes from the line per query. */
const WAVE_BATCH = 500;

/* ------------------------------------------------------------------ count */

/**
 * The public count (D-0012 §B, SPEC §18.1): accounts that exist and are not
 * suspended. The front page shows it, and the handover is measured by it.
 */
export async function memberCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: countRows() })
    .from(accounts)
    .where(isNull(accounts.suspendedAt));
  return Number(row?.n ?? 0);
}

/** How many seats are open, and how many addresses wait in line. */
export async function seatState(db: Db): Promise<{ open: number; waiting: number }> {
  const [state] = await db
    .select({ open: seatRow.open })
    .from(seatRow)
    .where(eq(seatRow.id, SEATS_ID))
    .limit(1);
  const [line] = await db.select({ n: countRows() }).from(waitlist);
  return { open: state?.open ?? 0, waiting: Number(line?.n ?? 0) };
}

/* ---------------------------------------------------------------- helpers */

/**
 * The maintainer's account (SPEC §18.4): the oldest active administrator,
 * or null when there is none. Seat invites name it as their inviter.
 */
export async function maintainerId(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.isAdmin, true), isNull(accounts.suspendedAt)))
    .orderBy(asc(accounts.createdAt), asc(accounts.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Anyone who is not an active administrator gets NOT_FOUND before any
 * input is looked at, as in the moderation functions (reports.ts).
 */
async function requireAdmin(db: Db, adminId: unknown): Promise<void> {
  const id = typeof adminId === "string" ? adminId.trim() : "";
  const [row] = id
    ? await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(eq(accounts.id, id), eq(accounts.isAdmin, true), isNull(accounts.suspendedAt)),
        )
        .limit(1)
    : [];
  if (!row) throw notFound();
}

/**
 * Lock the seat row for the rest of this transaction, making it first if
 * it is not there yet, and return how many seats are open. Call it inside
 * a transaction, before deciding anything about seats or the line.
 */
async function lockSeats(tx: Db, now: Date): Promise<number> {
  await tx
    .insert(seatRow)
    .values({ id: SEATS_ID, open: 0, updatedAt: now })
    .onConflictDoNothing();
  const [row] = await tx
    .select({ open: seatRow.open })
    .from(seatRow)
    .where(eq(seatRow.id, SEATS_ID))
    .for("update");
  if (!row) throw new Error("seats: the seat_state row is missing.");
  return row.open;
}

async function hasAccount(db: Db, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, email))
    .limit(1);
  return row !== undefined;
}

/**
 * The seat this address already holds, if any: a seat invite, still
 * usable, that a join link was made for to this address. Asking again sends
 * a new link to that seat instead of taking a second one, so a link that
 * expired unopened does not cost the seat.
 */
async function heldSeat(db: Db, email: string, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ inviteId: invites.id })
    .from(emailTokens)
    .innerJoin(invites, eq(invites.id, emailTokens.inviteId))
    .innerJoin(
      accounts,
      and(eq(accounts.id, invites.inviterId), isNull(accounts.suspendedAt)),
    )
    .where(
      and(
        eq(emailTokens.email, email),
        eq(invites.note, SEAT_NOTE),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .orderBy(desc(invites.createdAt), desc(invites.id))
    .limit(1);
  return row?.inviteId ?? null;
}

/**
 * Take one open seat for `email`, inside the transaction that holds the
 * seat lock: `open` goes down by one only if it is above zero, a seat
 * invite is made, the address leaves the line, and the join link's token is
 * made, all in this transaction. The mail goes after it commits.
 */
async function takeOneSeat(
  tx: Db,
  { email, maintainer, now }: { email: string; maintainer: string; now: Date },
): Promise<string> {
  const taken = await tx
    .update(seatRow)
    .set({ open: sql`${seatRow.open} - 1`, updatedAt: now })
    .where(and(eq(seatRow.id, SEATS_ID), gt(seatRow.open, 0)))
    .returning({ open: seatRow.open });
  if (taken.length === 0) throw new Error("seats: no seat was open.");
  const invite = await createSeatInvite(tx, maintainer, now);
  await tx.delete(waitlist).where(eq(waitlist.email, email));
  return createEmailToken(tx, { email, purpose: "join", inviteId: invite.id, now });
}

/** The seat email, with the join link for `token`. */
async function sendSeatEmail(
  db: Db,
  { email, token, base }: { email: string; token: string; base: string },
): Promise<void> {
  const mail = seatEmail(`${base}/auth#${token}`);
  // A transport failure is recorded in mail_log (without the address).
  await sendMail(db, {
    to: email,
    subject: mail.subject,
    body: mail.body,
    kind: "join",
    accountId: null,
  });
}

/* ---------------------------------------------------------- asking for one */

/**
 * Take a seat, or wait in line (SPEC §18.4).
 *
 * Refused with CLOSED while no controller is named, while production names
 * no client-address header, and while there is no maintainer; INVALID for
 * a malformed address; RATE_LIMITED past 10 an hour from one client
 * address (`seat:ip:<h>`) or 3 an hour for one address (`seat:email:<h>`).
 * Each limit is counted before anything else is done.
 *
 * Otherwise the answer is the same for every address, and the rest is one
 * task, after the response when the caller passes `defer`:
 *
 * - an address that already has an account gets nothing (and leaves the
 *   line, if it was waiting there before it joined);
 * - an address that holds a seat already gets a new link to it;
 * - otherwise, with a seat open, it takes one: the seat email goes to it
 *   with a join link for a new seat invite;
 * - otherwise it goes in line; if it is there already, it keeps its place.
 */
export async function requestSeat(
  db: Db,
  input: { email: string; ipHash: string; now?: Date; defer?: Defer },
): Promise<void> {
  const now = input.now ?? new Date();
  if (!accountCreationOpen() || !clientIpHeader()) throw closed(SEATS_CLOSED);
  if (!(await maintainerId(db))) throw closed(SEATS_CLOSED);
  const email = normEmail(input.email);
  if (!input.ipHash) throw new Error("requestSeat needs the client's IP hash.");
  // Resolved now: a missing setting fails the request, before a seat is taken.
  const base = appUrl();

  // Each commits on its own (SPEC §10: before, not inside, a transaction
  // that may fail), so a refused request is still counted.
  await hit(db, `seat:ip:${input.ipHash}`, { ...RATE.joinIp, now });
  await hit(db, `seat:email:${rateKeyHash(email)}`, { ...RATE.joinEmail, now });

  await nowOrDeferred(async () => {
    const link = await withTx(db, async (tx): Promise<{ token: string } | { held: string } | null> => {
      const open = await lockSeats(tx, now);
      if (await hasAccount(tx, email)) {
        await tx.delete(waitlist).where(eq(waitlist.email, email));
        return null;
      }
      const held = await heldSeat(tx, email, now);
      if (held) return { held };
      const maintainer = await maintainerId(tx);
      if (open > 0 && maintainer) {
        return { token: await takeOneSeat(tx, { email, maintainer, now }) };
      }
      await tx.insert(waitlist).values({ email, createdAt: now }).onConflictDoNothing();
      return null;
    });
    if (!link) return;
    const token =
      "token" in link
        ? link.token
        : await createEmailToken(db, { email, purpose: "join", inviteId: link.held, now });
    await sendSeatEmail(db, { email, token, base });
  }, input.defer);
}

/* ------------------------------------------------------- the administrator */

/**
 * Open `count` seats (an administrator only; anyone else is NOT_FOUND).
 * Like every part of seats, it is off (CLOSED) while no data controller is
 * named (M-0011: "Both stay off until a controller is named"); a wave then
 * would send links that cannot be used. `count` is a whole number from 1
 * to 10,000 (INVALID otherwise).
 *
 * In one transaction it adds `count` to the open seats, then invites the
 * addresses in line, oldest first, while seats are open, each taking one
 * seat as `requestSeat` would. An address that already has an account
 * leaves the line without an email and without a seat. The seat emails go
 * after the commit, after the response when the caller passes `defer`.
 *
 * Returns how many seats it opened and how many addresses it invited.
 */
export async function openSeats(
  db: Db,
  adminId: string,
  count: number,
  opts: { now?: Date; defer?: Defer } = {},
): Promise<{ opened: number; invited: number }> {
  await requireAdmin(db, adminId);
  if (!accountCreationOpen()) throw closed(SEATS_OFF);
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > OPEN_SEATS_MAX
  ) {
    throw invalid(OPEN_SEATS_INVALID);
  }
  const now = opts.now ?? new Date();
  const base = appUrl();

  const links = await withTx(db, async (tx) => {
    let open = (await lockSeats(tx, now)) + count;
    const maintainer = await maintainerId(tx);
    const made: { email: string; token: string }[] = [];
    while (open > 0 && maintainer) {
      const oldest = await tx
        .select({ email: waitlist.email })
        .from(waitlist)
        .orderBy(asc(waitlist.createdAt), asc(waitlist.email))
        .limit(Math.min(open, WAVE_BATCH));
      if (oldest.length === 0) break;
      const emails = oldest.map((row) => row.email);
      await tx.delete(waitlist).where(inArray(waitlist.email, emails));
      const members = await tx
        .select({ email: accounts.email })
        .from(accounts)
        .where(inArray(accounts.email, emails));
      const hasOne = new Set(members.map((row) => row.email));
      for (const email of emails) {
        if (hasOne.has(email)) continue;
        const invite = await createSeatInvite(tx, maintainer, now);
        const token = await createEmailToken(tx, {
          email,
          purpose: "join",
          inviteId: invite.id,
          now,
        });
        made.push({ email, token });
        open -= 1;
      }
    }
    await tx
      .update(seatRow)
      .set({ open, updatedAt: now })
      .where(eq(seatRow.id, SEATS_ID));
    return made;
  });

  await nowOrDeferred(async () => {
    for (const link of links) {
      try {
        await sendSeatEmail(db, { ...link, base });
      } catch (error) {
        // One failure does not stop the others. Never the message: it can
        // carry an address.
        console.error(
          "[ours] a seat email could not be sent:",
          error instanceof Error ? error.name : "unknown error",
        );
      }
    }
  }, opts.defer);

  return { opened: count, invited: links.length };
}

/**
 * Remove an address from the line (an administrator only; anyone else is
 * NOT_FOUND): how its owner's request to be deleted is carried out (SPEC
 * §18.4). INVALID for a malformed address.
 *
 * An address that has no account also loses what joining kept about it:
 * the join links made for it, a join it began and did not finish, and
 * development mail sent to it. An address that has an account keeps those;
 * deleting an account is its owner's to do, in Settings.
 */
export async function forgetWaitlistAddress(
  db: Db,
  adminId: string,
  email: string,
): Promise<void> {
  await requireAdmin(db, adminId);
  const address = normEmail(email);
  await withTx(db, async (tx) => {
    await lockSeats(tx, new Date());
    await tx.delete(waitlist).where(eq(waitlist.email, address));
    if (await hasAccount(tx, address)) return;
    await tx.delete(emailTokens).where(eq(emailTokens.email, address));
    await tx.delete(pendingJoins).where(eq(pendingJoins.email, address));
    await tx.delete(outbox).where(eq(outbox.toAddress, address));
  });
}
