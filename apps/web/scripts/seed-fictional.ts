/**
 * FICTIONAL people, connections and posts for local UI work.
 *
 *   pnpm --filter @ours/web seed:fictional [-- --reset]
 *
 * Every person is invented, labelled FICTIONAL in their bio, and has an
 * example.test address. It refuses to run against anything but a database
 * on this machine. With --reset it empties every table first; without it,
 * it refuses if any account exists.
 *
 * Like every way of creating accounts (SPEC §2 rule 6, M-0010), it runs
 * only while a data controller is named. For local work a FICTIONAL one is
 * enough, as in the tests: DATA_CONTROLLER="FICTIONAL Controller" and
 * DATA_CONTROLLER_EMAIL=controller@example.test in .env.local.
 *
 * It prints a one-time sign-in link for the administrator (valid for 15
 * minutes) so a developer can sign in without email.
 */
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { count, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createEmailToken } from "../src/core/auth";
import { accountCreationOpen, appUrl } from "../src/core/config";
import { closeDb, getDb } from "../src/core/db";
import { newId, randomToken, sha256 } from "../src/core/ids";
import * as schema from "../src/core/schema";
import {
  accounts,
  type Audience,
  follows,
  friendRequests,
  friendships,
  invites,
  likes,
  notifications,
  posts,
  replies,
} from "../src/core/schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Person = {
  key: string;
  handle: string;
  name: string;
  about: string;
  acceptsFollowers?: boolean;
  isAdmin?: boolean;
  invitedBy?: string;
};

const PEOPLE: Person[] = [
  { key: "ada", handle: "ada_quillon", name: "Ada Quillon", about: "Runs the allotment rota. Tea over coffee.", acceptsFollowers: true, isAdmin: true },
  { key: "bruno", handle: "bruno_varnell", name: "Bruno Varnell", about: "Bikes, bread, bad puns.", invitedBy: "ada" },
  { key: "cleo", handle: "cleo_marsh", name: "Cleo Marsh", about: "Night shifts and early birds.", invitedBy: "ada" },
  { key: "devika", handle: "devika_r", name: "Devika Rennard", about: "Choir on Thursdays.", invitedBy: "cleo" },
  { key: "emil", handle: "emil_tovarro", name: "Emil Tovarro", about: "Writes a little, walks a lot.", acceptsFollowers: true, invitedBy: "ada" },
  { key: "fern", handle: "fern_ottaway", name: "Fern Ottaway", about: "Plants, mostly alive.", invitedBy: "bruno" },
  { key: "gus", handle: "gus_lindqvale", name: "Gus Lindqvale", about: "Weekend football, weekday spreadsheets.", invitedBy: "bruno" },
  { key: "hana", handle: "hana_stellwick", name: "Hana Stellwick", about: "New in town.", invitedBy: "emil" },
  { key: "ivo", handle: "ivo_pellagrin", name: "Ivo Pellagrin", about: "Fixes things. Sometimes.", invitedBy: "gus" },
  { key: "juno", handle: "juno_wexcombe", name: "Juno Wexcombe", about: "Birdwatching and board games.", acceptsFollowers: true, invitedBy: "devika" },
];

const FRIENDS: [string, string][] = [
  ["ada", "bruno"], ["ada", "cleo"], ["ada", "emil"], ["ada", "devika"],
  ["bruno", "fern"], ["bruno", "gus"], ["cleo", "devika"], ["emil", "hana"],
  ["gus", "ivo"], ["devika", "juno"], ["ada", "fern"], ["cleo", "hana"],
];

const FOLLOWS: [string, string][] = [
  ["gus", "ada"], ["hana", "ada"], ["ivo", "emil"], ["juno", "emil"],
  ["fern", "emil"], ["ada", "juno"], ["bruno", "juno"],
];

const BODIES = [
  "The allotment gate code changed. Ask me if you need it.",
  "First loaf of the season came out almost round. Progress.",
  "Anyone else hear the owl last night? Three calls, then nothing.",
  "Choir is doing the long piece again. Bring water.",
  "Walked the river path to the old mill and back. 11 km, one heron.",
  "Repotted everything. The fern forgave me, the basil did not.",
  "Five-a-side on Saturday, 10:00. We need a keeper.",
  "Unpacked the last box. The flat finally feels like mine.",
  "Fixed the wobbly table with a folded map. Engineering.",
  "Spotted a kingfisher by the footbridge. Blue like a spark.",
  "Board game night at mine on Friday. Bring snacks, not strategies.",
  "The recipe I promised: https://example.test/recipes/sourdough-starter-for-people-who-forget-to-feed-it",
  "Rain all day. Good day for soup.",
  "Draft of the short story is done. It is short. It is a story.",
  "Can someone lend me a ladder this weekend?",
  "Tomatoes are finally turning red.\n\nAlso the slugs noticed.",
  "Night shift done. Sunrise from the car park was worth it.",
  "Found the notes from the first rehearsal. We have come a long way.",
  "Library sale on Sunday. I will be the one with too many bags.",
  "Tried the new bakery on the corner. Cardamom buns: yes.",
];

const REPLIES = [
  "Count me in.",
  "Ha, same here.",
  "That sounds lovely.",
  "I can bring the ladder on Saturday.",
  "Save me a bun!",
  "Heard it too, around midnight.",
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  config({ path: [".env.local", ".env"], quiet: true });
  const { values } = parseArgs({
    // pnpm forwards a literal "--"; ignore it.
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: { reset: { type: "boolean" } },
  });

  const url = process.env.DATABASE_URL?.trim();
  if (!url) fail("DATABASE_URL is not set. See .env.example.");
  if (!isLocalUrl(url) || process.env.NODE_ENV === "production") {
    fail("Refused: FICTIONAL seed data goes only into a database on this machine.");
  }
  if (!accountCreationOpen()) {
    fail(
      "Refused: no data controller is named, so no account can be created. " +
        'For local work set DATA_CONTROLLER="FICTIONAL Controller" and ' +
        "DATA_CONTROLLER_EMAIL=controller@example.test in .env.local.",
    );
  }

  const db = getDb();

  if (values.reset) {
    const tables = Object.values(schema as Record<string, unknown>)
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => `"${getTableName(table)}"`);
    await db.execute(sql.raw(`truncate table ${tables.join(", ")} cascade`));
    console.log("Emptied every table.");
  } else {
    const [row] = await db.select({ n: count() }).from(accounts);
    if ((row?.n ?? 0) > 0) {
      fail("Refused: accounts already exist. Run with --reset to start over.");
    }
  }

  const now = new Date();
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - days * DAY - hours * HOUR);
  const ids = new Map<string, string>();
  const id = (key: string) => {
    const value = ids.get(key);
    if (!value) throw new Error(`unknown person ${key}`);
    return value;
  };

  await db.transaction(async (tx) => {
    // People, created in invitation order.
    for (const p of PEOPLE) ids.set(p.key, newId());
    for (const [i, p] of PEOPLE.entries()) {
      await tx.insert(accounts).values({
        id: id(p.key),
        email: `${p.handle}@example.test`,
        handle: p.handle,
        displayName: p.name,
        bio: `FICTIONAL. ${p.about}`,
        invitedBy: p.invitedBy ? id(p.invitedBy) : null,
        acceptsFollowers: p.acceptsFollowers ?? false,
        isAdmin: p.isAdmin ?? false,
        invitesRemaining: 8,
        adultConfirmedAt: ago(30 - i),
        createdAt: ago(30 - i),
        feedPreviousVisitAt: p.key === "ada" ? ago(3) : null,
        feedLastVisitAt: p.key === "ada" ? ago(0, 20) : null,
      });
    }

    // Invites: each person's own invitation, used; plus two waiting ones for the admin.
    for (const [i, p] of PEOPLE.entries()) {
      if (!p.invitedBy) continue;
      await tx.insert(invites).values({
        id: newId(),
        codeHash: sha256(randomToken(16)),
        inviterId: id(p.invitedBy),
        note: `for ${p.name.split(" ")[0]}`,
        createdAt: ago(31 - i),
        expiresAt: new Date(ago(31 - i).getTime() + 30 * DAY),
        usedAt: ago(30 - i),
        usedBy: id(p.key),
      });
    }
    for (const note of ["for my neighbour", ""]) {
      await tx.insert(invites).values({
        id: newId(),
        codeHash: sha256(randomToken(16)),
        inviterId: id("ada"),
        note,
        createdAt: ago(2),
        expiresAt: new Date(ago(2).getTime() + 30 * DAY),
      });
    }

    for (const [x, y] of FRIENDS) {
      const [a, b] = [id(x), id(y)].sort() as [string, string];
      await tx.insert(friendships).values({ aId: a, bId: b, createdAt: ago(25) });
    }
    for (const [x, y] of FOLLOWS) {
      await tx.insert(follows).values({ followerId: id(x), followeeId: id(y), createdAt: ago(20) });
    }

    // A pending request to the admin, so the People badge has something to show.
    await tx.insert(friendRequests).values({
      id: newId(),
      fromId: id("gus"),
      toId: id("ada"),
      status: "pending",
      createdAt: ago(1),
    });

    // Posts across the last 20 days (the feed shows 14 and then ends).
    const authors = PEOPLE.map((p) => p.key);
    const postIds: { id: string; author: string; audience: Audience; at: Date }[] = [];
    for (let i = 0; i < 44; i++) {
      const author = authors[(i * 7) % authors.length]!;
      const person = PEOPLE.find((p) => p.key === author)!;
      const audience: Audience =
        person.acceptsFollowers && i % 3 !== 0 ? "followers" : "friends";
      const at = ago((i * 20) / 44, (i * 5) % 11);
      const postId = newId();
      await tx.insert(posts).values({
        id: postId,
        authorId: id(author),
        body: BODIES[i % BODIES.length]!,
        audience,
        createdAt: at,
      });
      postIds.push({ id: postId, author, audience, at });
    }

    // Some replies and likes between friends, and their notifications.
    let r = 0;
    for (const p of postIds.slice(0, 16)) {
      const friend = FRIENDS.find(([x, y]) => x === p.author || y === p.author);
      if (!friend) continue;
      const other = friend[0] === p.author ? friend[1] : friend[0];
      const at = new Date(p.at.getTime() + 2 * HOUR);
      if (at > now) continue;
      const replyId = newId();
      await tx.insert(replies).values({
        id: replyId,
        postId: p.id,
        authorId: id(other),
        body: REPLIES[r++ % REPLIES.length]!,
        createdAt: at,
      });
      await tx.insert(likes).values({ postId: p.id, accountId: id(other), createdAt: at });
      await tx.insert(notifications).values([
        { id: newId(), recipientId: id(p.author), kind: "reply", actorId: id(other), postId: p.id, replyId, createdAt: at },
        { id: newId(), recipientId: id(p.author), kind: "like", actorId: id(other), postId: p.id, createdAt: at },
      ]);
    }
    await tx.insert(notifications).values({
      id: newId(),
      recipientId: id("ada"),
      kind: "friend_request",
      actorId: id("gus"),
      createdAt: ago(1),
    });
  });

  const admin = PEOPLE.find((p) => p.isAdmin)!;
  const token = await createEmailToken(db, {
    email: `${admin.handle}@example.test`,
    purpose: "sign_in",
    now: new Date(),
  });
  console.log(`Seeded ${PEOPLE.length} FICTIONAL people, ${FRIENDS.length} friendships, ${FOLLOWS.length} follows and 44 posts across 20 days.`);
  console.log(`Administrator: @${admin.handle} (${admin.handle}@example.test)`);
  console.log("Sign in within 15 minutes, once:");
  console.log(`  ${appUrl()}/auth#${token}`);
}

main()
  .catch((error: unknown) => {
    console.error("seed:fictional failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
