/**
 * The first account: no inviter, an administrator, with invites. The
 * founder script (scripts/seed-founder.ts, fictional addresses only) and
 * the release step (scripts/release.ts, D-0021 §D) both make it here, under
 * one rule: the FIRST account only. /rules says every account except the
 * founder's is invited by a person (the second verification's honesty
 * defect 9).
 *
 * The check and the insert share one transaction under an advisory lock, so
 * two runs at once cannot both pass it.
 */
import { sql } from "drizzle-orm";
import { type Db, withTx } from "./db";
import { newId } from "./ids";
import { accounts } from "./schema";

export type FirstAccount = {
  /** Already normalised and validated by the caller. */
  email: string;
  handle: string;
  displayName: string;
  invites: number;
  now: Date;
};

/** Create the first account, or nothing if any account exists. True when it was created. */
export async function createFirstAccount(db: Db, account: FirstAccount): Promise<boolean> {
  return withTx(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('seed:founder', 0))`);
    const existing = await tx.select({ id: accounts.id }).from(accounts).limit(1);
    if (existing.length) return false;
    await tx.insert(accounts).values({
      id: newId(),
      email: account.email,
      handle: account.handle,
      displayName: account.displayName,
      invitedBy: null,
      invitesRemaining: account.invites,
      isAdmin: true,
      adultConfirmedAt: account.now,
      createdAt: account.now,
    });
    return true;
  });
}
