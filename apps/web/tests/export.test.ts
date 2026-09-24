/**
 * Export (M1; SPEC §8 "Export and delete"; M-0010 acceptance: "A person
 * cannot export ... anyone else's data; an export contains only what its
 * owner may take"). Denial paths first. Everyone here is FICTIONAL.
 *
 * The route handler is exercised with the viewer module mocked, so the
 * test controls who is signed in and checks that nothing in the request
 * can change whose data comes back.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCoreError } from "@/core/errors";
import { type AccountExport, exportAccount, exportFilename } from "@/core/export";
import { newId, sha256 } from "@/core/ids";
import { accounts, invites, likes, posts, replies } from "@/core/schema";
import type { Viewer } from "@/web/viewer";
import { requireViewer } from "@/web/viewer";
import {
  at,
  befriend,
  block,
  db,
  follow,
  makeAccount,
  mute,
  plus,
  post,
  reset,
} from "./helpers";

vi.mock("@/web/viewer", () => ({
  requireViewer: vi.fn(),
  getViewer: vi.fn(),
}));

const signedIn = vi.mocked(requireViewer);

beforeEach(async () => {
  await reset();
  signedIn.mockReset();
});

const t0 = at("2026-09-01T12:00:00Z");
const now = at("2026-09-10T08:30:00Z");

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect(isCoreError(error)).toBe(true);
    expect((error as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected CoreError ${code}, but it resolved`);
}

async function reply(authorId: string, postId: string, body: string, at = t0) {
  const [row] = await db()
    .insert(replies)
    .values({ id: newId(), postId, authorId, body, createdAt: at })
    .returning();
  return row!;
}

async function invite(
  inviterId: string,
  options: {
    note?: string;
    createdAt?: Date;
    expiresAt?: Date;
    usedBy?: string;
    revokedAt?: Date;
  } = {},
) {
  const createdAt = options.createdAt ?? t0;
  const [row] = await db()
    .insert(invites)
    .values({
      id: newId(),
      codeHash: sha256(newId()),
      inviterId,
      note: options.note ?? "",
      createdAt,
      expiresAt: options.expiresAt ?? plus.days(createdAt, 30),
      usedAt: options.usedBy ? plus.days(createdAt, 1) : null,
      usedBy: options.usedBy ?? null,
      revokedAt: options.revokedAt ?? null,
    })
    .returning();
  return row!;
}

/**
 * A FICTIONAL world around Anna with a secret in every row that is not
 * hers: other people's addresses, posts, replies and invite notes.
 */
async function world() {
  const inviter = await makeAccount({ handle: "inviter", email: "inviter.secret@example.test" });
  const anna = await makeAccount({
    handle: "anna",
    displayName: "FICTIONAL Anna",
    acceptsFollowers: true,
    invitedBy: inviter,
    createdAt: t0,
  });
  const petr = await makeAccount({
    handle: "petr",
    displayName: "FICTIONAL Petr",
    email: "petr.secret@example.test",
    acceptsFollowers: true,
  });
  const eva = await makeAccount({ handle: "eva", displayName: "FICTIONAL Eva" });
  const fan = await makeAccount({ handle: "fan", displayName: "FICTIONAL Fan" });
  const sam = await makeAccount({ handle: "sam", suspended: true });
  const blocker = await makeAccount({ handle: "blocker" });
  const stranger = await makeAccount({ handle: "stranger" });

  await befriend(anna, petr, plus.days(t0, 1));
  await befriend(anna, sam, plus.days(t0, 1)); // suspended: not listed
  await befriend(anna, blocker, plus.days(t0, 1)); // blocked Anna: not listed
  await block(blocker, anna);
  await follow(anna, petr, plus.days(t0, 2));
  await follow(fan, anna, plus.days(t0, 3));
  await block(anna, stranger);
  await mute(anna, eva);

  const annaPost = await post(anna, {
    body: "FICTIONAL post by Anna",
    audience: "followers",
    at: plus.days(t0, 4),
  });
  const removed = await post(anna, { body: "FICTIONAL removed post", at: plus.days(t0, 5) });
  await db()
    .update(posts)
    .set({
      removedAt: plus.days(t0, 6),
      removalCategory: "spam",
      removalReason: "FICTIONAL statement of reasons for the removal.",
    })
    .where(eq(posts.id, removed.id));

  const petrPost = await post(petr, {
    body: "SECRET post by Petr",
    at: plus.days(t0, 4),
  });
  await post(eva, { body: "SECRET post by Eva", at: plus.days(t0, 4) });
  await reply(petr.id, annaPost.id, "SECRET reply by Petr on Anna's post");
  const annaReply = await reply(anna.id, petrPost.id, "FICTIONAL reply by Anna");
  await db().insert(likes).values({ postId: petrPost.id, accountId: anna.id, createdAt: t0 });
  await db().insert(likes).values({ postId: annaPost.id, accountId: petr.id, createdAt: t0 });

  await invite(anna.id, { note: "SECRET note for Petr", usedBy: petr.id });
  await invite(anna.id, { note: "SECRET note waiting", createdAt: plus.days(now, -1) });
  await invite(anna.id, {
    createdAt: plus.days(now, -2),
    revokedAt: plus.days(now, -1),
  });
  const oldCreated = plus.days(now, -40);
  await invite(anna.id, {
    createdAt: oldCreated,
    revokedAt: plus.days(oldCreated, 30), // marked expired: revoked_at = expires_at
  });
  await invite(anna.id, { createdAt: plus.days(now, -35) }); // expired, not yet marked
  await invite(petr.id, { note: "SECRET note of Petr's", usedBy: eva.id });

  return { inviter, anna, petr, eva, fan, sam, blocker, stranger, annaPost, removed, petrPost, annaReply };
}

/* ------------------------------------------------------------- refusals */

describe("exportAccount: refusals", () => {
  it("refuses an unknown account with NOT_FOUND", async () => {
    await expectCode(exportAccount(db(), "01NOSUCHACCOUNT", now), "NOT_FOUND");
  });

  it("refuses a suspended account with NOT_FOUND", async () => {
    const sam = await makeAccount({ suspended: true });
    await expectCode(exportAccount(db(), sam.id, now), "NOT_FOUND");
  });

  it("contains nothing of anyone else: no address, post, reply or invite note", async () => {
    await world();
    const [anna] = await db().select().from(accounts).where(eq(accounts.handle, "anna"));
    const text = JSON.stringify(await exportAccount(db(), anna!.id, now));
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("secret@example.test");
    // The only address in it is Anna's own.
    expect(text.match(/[a-z0-9_.+-]+@[a-z0-9.-]+/gi)).toEqual(["anna@example.test"]);
    // Suspended people and people with a block are not listed as connections.
    const data = JSON.parse(text) as AccountExport;
    const connected = [...data.friends, ...data.following, ...data.followers].map((p) => p.handle);
    expect(connected).not.toContain("sam");
    expect(connected).not.toContain("blocker");
  });

  it("exports only the owner's data, whoever else asks with the owner's handle", async () => {
    const { anna, petr } = await world();
    const annaExport = await exportAccount(db(), anna.id, now);
    const petrExport = await exportAccount(db(), petr.id, now);
    expect(annaExport.account.email).toBe("anna@example.test");
    expect(petrExport.account.email).toBe("petr.secret@example.test");
    expect(JSON.stringify(petrExport)).not.toContain("FICTIONAL post by Anna");
    expect(JSON.stringify(petrExport)).not.toContain("anna@example.test");
  });

  it("lists no followers while the owner does not accept followers", async () => {
    const anna = await makeAccount({ handle: "anna", acceptsFollowers: false });
    const fan = await makeAccount();
    await follow(fan, anna); // a stale row the setting should have removed
    expect((await exportAccount(db(), anna.id, now)).followers).toEqual([]);
  });
});

/* ---------------------------------------------------------------- shape */

describe("exportAccount: exactly the fields SPEC §8 lists", () => {
  it("has exactly the SPEC sections and fields", async () => {
    const { anna } = await world();
    const data = await exportAccount(db(), anna.id, now);
    expect(Object.keys(data).sort()).toEqual(
      [
        "exported_at",
        "account",
        "posts",
        "replies",
        "likes",
        "friends",
        "following",
        "followers",
        "blocked",
        "muted",
        "invites",
      ].sort(),
    );
    expect(Object.keys(data.account).sort()).toEqual(
      ["handle", "display_name", "bio", "email", "created_at", "invited_by_handle"].sort(),
    );
    const postKeys = [
      "id",
      "body",
      "audience",
      "created_at",
      "removed_at",
      "removal_category",
      "removal_reason",
    ];
    for (const p of data.posts) expect(Object.keys(p).sort()).toEqual([...postKeys].sort());
    for (const r of data.replies) {
      expect(Object.keys(r).sort()).toEqual(
        ["id", "post_id", "body", "created_at", "removed_at", "removal_category", "removal_reason"].sort(),
      );
    }
    for (const l of data.likes) {
      expect(Object.keys(l).sort()).toEqual(["post_id", "author_handle", "created_at"].sort());
    }
    for (const list of [data.friends, data.following, data.followers]) {
      for (const p of list) expect(Object.keys(p).sort()).toEqual(["display_name", "handle", "since"]);
    }
    for (const list of [data.blocked, data.muted]) {
      for (const p of list) expect(Object.keys(p).sort()).toEqual(["handle", "since"]);
    }
    for (const i of data.invites) {
      expect(Object.keys(i).sort()).toEqual(["created_at", "status", "used_by_handle"]);
    }
  });

  it("holds the owner's account, posts (removed ones with reasons), replies and likes", async () => {
    const { anna, annaPost, removed, petrPost, annaReply } = await world();
    const data = await exportAccount(db(), anna.id, now);
    expect(data.exported_at).toBe(now.toISOString());
    expect(data.account).toEqual({
      handle: "anna",
      display_name: "FICTIONAL Anna",
      bio: "FICTIONAL test person",
      email: "anna@example.test",
      created_at: t0.toISOString(),
      invited_by_handle: "inviter",
    });
    expect(data.posts).toEqual([
      {
        id: annaPost.id,
        body: "FICTIONAL post by Anna",
        audience: "followers",
        created_at: plus.days(t0, 4).toISOString(),
        removed_at: null,
        removal_category: null,
        removal_reason: null,
      },
      {
        id: removed.id,
        body: "FICTIONAL removed post",
        audience: "friends",
        created_at: plus.days(t0, 5).toISOString(),
        removed_at: plus.days(t0, 6).toISOString(),
        removal_category: "spam",
        removal_reason: "FICTIONAL statement of reasons for the removal.",
      },
    ]);
    expect(data.replies).toEqual([
      {
        id: annaReply.id,
        post_id: petrPost.id,
        body: "FICTIONAL reply by Anna",
        created_at: t0.toISOString(),
        removed_at: null,
        removal_category: null,
        removal_reason: null,
      },
    ]);
    expect(data.likes).toEqual([
      { post_id: petrPost.id, author_handle: "petr", created_at: t0.toISOString() },
    ]);
  });

  it("holds connections, blocks, mutes and invites with their status", async () => {
    const { anna } = await world();
    const data = await exportAccount(db(), anna.id, now);
    expect(data.friends).toEqual([
      { handle: "petr", display_name: "FICTIONAL Petr", since: plus.days(t0, 1).toISOString() },
    ]);
    expect(data.following).toEqual([
      { handle: "petr", display_name: "FICTIONAL Petr", since: plus.days(t0, 2).toISOString() },
    ]);
    expect(data.followers).toEqual([
      { handle: "fan", display_name: "FICTIONAL Fan", since: plus.days(t0, 3).toISOString() },
    ]);
    expect(data.blocked.map((b) => b.handle)).toEqual(["stranger"]);
    expect(data.muted.map((m) => m.handle)).toEqual(["eva"]);
    expect(data.invites.map((i) => [i.status, i.used_by_handle])).toEqual([
      ["expired", null], // marked expired (created 40 days ago)
      ["expired", null], // expired, not yet marked (35 days ago)
      ["used", "petr"],
      ["revoked", null],
      ["waiting", null],
    ]);
  });

  it("names the file ours-export-<handle>-<yyyy-mm-dd>.json in UTC", () => {
    expect(exportFilename("anna", at("2026-09-10T23:59:59Z"))).toBe(
      "ours-export-anna-2026-09-10.json",
    );
  });
});

/* ---------------------------------------------------------------- route */

describe("GET /settings/export", () => {
  function viewerOf(account: { id: string; handle: string; displayName: string }): Viewer {
    return {
      id: account.id,
      handle: account.handle,
      displayName: account.displayName,
      isAdmin: false,
      acceptsFollowers: false,
      invitesRemaining: 10,
    };
  }

  it("does nothing for a signed-out visitor: the viewer check stops it first", async () => {
    signedIn.mockRejectedValueOnce(new Error("NEXT_REDIRECT /signin"));
    const { GET } = await import("@/app/(app)/settings/export/route");
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("downloads the signed-in person's own export, as an attachment that is not cached", async () => {
    const { anna } = await world();
    signedIn.mockResolvedValueOnce(viewerOf(anna));
    const { GET } = await import("@/app/(app)/settings/export/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const today = new Date().toISOString().slice(0, 10);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="ours-export-anna-${today}.json"`,
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data = (await response.json()) as AccountExport;
    expect(data.account.handle).toBe("anna");
    expect(JSON.stringify(data)).not.toContain("SECRET");
  });

  it("has no way to ask for another account: it takes no request at all", async () => {
    const { GET } = await import("@/app/(app)/settings/export/route");
    expect(GET.length).toBe(0);
  });
});
