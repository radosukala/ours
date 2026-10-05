-- The down migration for 0003_needs: M-0021's rollback ("drop the needs
-- table in a down migration"). What it loses: every need named before it
-- runs (M-0021: "needs named before a rollback are lost unless exported
-- first"). Export them first:
--
--   psql "$DATABASE_URL" -c "\copy needs to 'needs.csv' csv header"
--
-- scripts/migrate.ts never runs this file, and drizzle-kit does not read
-- this folder. After reverting the M-0021 commits, run it by hand, in one
-- transaction:
--
--   psql "$DATABASE_URL" --single-transaction -f drizzle/down/0003_needs.sql
DROP TABLE "needs";
-- Forget that 0003_needs ran, so the migrator would apply it again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791198402886;
