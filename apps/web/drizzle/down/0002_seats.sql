-- The down migration for 0002_seats: M-0011's rollback ("the waiting-list
-- table is additive and is dropped by its down migration").
--
-- scripts/migrate.ts never runs this file, and drizzle-kit does not read
-- this folder. After reverting the M-0011 commits, run it by hand, in one
-- transaction:
--
--   psql "$DATABASE_URL" --single-transaction -f drizzle/down/0002_seats.sql
--
-- Seat invites stay in "invites", so an account that joined through one
-- keeps its inviter. Unused ones are revoked: no seat link works any more,
-- and none comes back to the maintainer later as an expired invite of
-- their own (the reverted code would refund it).
UPDATE "invites" SET "revoked_at" = now()
  WHERE "note" = 'seat' AND "used_at" IS NULL AND "revoked_at" IS NULL;
DROP TABLE "waitlist";
DROP TABLE "seat_state";
-- Forget that 0002_seats ran, so the migrator would apply it again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1790578989254;
