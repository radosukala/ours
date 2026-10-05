-- The down migration for 0003_needs: M-0021's rollback ("the needs table is
-- additive and is dropped by its down migration").
--
-- scripts/migrate.ts never runs this file, and drizzle-kit does not read
-- this folder. After reverting the M-0021 commits, run it by hand, in one
-- transaction:
--
--   psql "$DATABASE_URL" --single-transaction -f drizzle/down/0003_needs.sql
--
-- It drops every named app the table holds. They are words and a day, with
-- nothing that says whose they are, so there is no one to give them back to,
-- and nothing else refers to them: no account, invite or waiting-list row
-- changes. Read them first if they are wanted:
--
--   psql "$DATABASE_URL" -c 'select named_on, body from needs order by named_on'
DROP TABLE "needs";
-- Forget that 0003_needs ran, so the migrator would apply it again.
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1791204039122;
