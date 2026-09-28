/**
 * The web side of seats (SPEC §18.4): the front page's `takeSeat` action,
 * and the Seats section of /admin with its two actions. Server actions are
 * called directly, with next/headers replaced by an in-memory header map,
 * Next's `after` by a queue this file runs by hand, and the viewer by a
 * FICTIONAL person the test names. Everyone here is FICTIONAL, with
 * example.test addresses and documentation IP ranges.
 */
import { asc, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  later: [] as Array<() => unknown>,
  viewer: null as null | {
    id: string;
    handle: string;
    displayName: string;
    isAdmin: boolean;
    acceptsFollowers: boolean;
    invitesRemaining: number;
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers([...web.headers.entries()]),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (task: () => unknown) => {
      web.later.push(task);
    },
  };
});
vi.mock("@/web/viewer", () => ({
  requireViewer: vi.fn(async () => {
    if (!web.viewer) throw new Error("test: no viewer set");
    return web.viewer;
  }),
  getViewer: vi.fn(async () => web.viewer),
}));

import { forgetAction, openSeatsAction } from "@/app/(app)/admin/actions";
import AdminPage from "@/app/(app)/admin/page";
import { openedText } from "@/app/(app)/admin/SeatControls";
import { takeSeat } from "@/app/(public)/seat-actions";
import { RATE_LIMITED_MESSAGE } from "@/core/limits";
import { accounts, type Account, outbox, rateEvents, seatState as seatRow, waitlist } from "@/core/schema";
import { OPEN_SEATS_INVALID, SEATS_CLOSED, SEATS_OFF } from "@/core/seats";
import { GENERIC_ERROR } from "@/web/actions";
import { at, db, makeAccount, plus, reset } from "./helpers";

beforeEach(async () => {
  await reset();
  web.headers.clear();
  web.later.length = 0;
  web.viewer = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const t0 = at("2026-09-28T10:00:00Z");

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runLater(): Promise<void> {
  while (web.later.length > 0) await web.later.shift()!();
}

function signIn(account: Account): void {
  web.viewer = {
    id: account.id,
    handle: account.handle,
    displayName: account.displayName,
    isAdmin: account.isAdmin,
    acceptsFollowers: account.acceptsFollowers,
    invitesRemaining: account.invitesRemaining,
  };
}

async function maintainer() {
  return makeAccount({ handle: "rado_fict", isAdmin: true, createdAt: at("2026-01-01T00:00:00Z") });
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function line(): Promise<string[]> {
  const rows = await db()
    .select({ email: waitlist.email })
    .from(waitlist)
    .orderBy(asc(waitlist.createdAt), asc(waitlist.email));
  return rows.map((r) => r.email);
}

/** The visible text of rendered markup. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/* ================================================================ takeSeat */

describe("takeSeat: the front page's Get in form (SPEC §18.4)", () => {
  it("answers 'Joining opens soon.' whenever seats are off, and records nothing", async () => {
    const rado = await maintainer();
    await setOpen(3);
    const ask = () => takeSeat(null, form({ email: "mara_f@example.test" }));

    vi.stubEnv("DATA_CONTROLLER", "");
    expect(await ask()).toEqual({ error: SEATS_CLOSED });
    vi.unstubAllEnvs();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "");
    expect(await ask()).toEqual({ error: SEATS_CLOSED });
    vi.unstubAllEnvs();

    await db().update(accounts).set({ suspendedAt: t0 }).where(eq(accounts.id, rado.id));
    expect(await ask()).toEqual({ error: "Joining opens soon." });

    await runLater();
    expect(await db().select().from(rateEvents)).toEqual([]);
    expect(await db().select().from(outbox)).toEqual([]);
    expect(await line()).toEqual([]);
  });

  it("refuses a malformed address with the validation message, and a rate limit with its message", async () => {
    await maintainer();
    expect(await takeSeat(null, form({ email: "not an email" }))).toEqual({
      error: "Enter a valid email address.",
    });
    expect(await takeSeat(null, form())).toEqual({ error: "Enter a valid email address." });
    web.headers.set("x-forwarded-for", "203.0.113.20");
    for (let i = 0; i < 3; i++) {
      expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({ ok: true });
    }
    expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({
      error: RATE_LIMITED_MESSAGE,
    });
  });

  it("gives every valid address the same answer, and leaves the lookup and the mail to after the response", async () => {
    await maintainer();
    const vera = await makeAccount({ handle: "vera_f", email: "vera_f@example.test" });
    // Two seats: the member's request uses one (SPEC §18.12), the first new address the other.
    await setOpen(2);
    await db().insert(waitlist).values({ email: "listed_f@example.test", createdAt: plus.days(t0, -1) });

    const answers = new Set<string>();
    const emails = [vera.email, "new_f@example.test", "listed_f@example.test", "other_f@example.test"];
    for (const [i, email] of emails.entries()) {
      web.headers.set("x-forwarded-for", `192.0.2.${i + 1}`);
      answers.add(JSON.stringify(await takeSeat(null, form({ email }))));
    }
    expect(answers).toEqual(new Set([JSON.stringify({ ok: true })]));
    expect(await db().select().from(outbox)).toEqual([]);
    expect(await db().select().from(rateEvents)).toHaveLength(8);
    expect(web.later).toHaveLength(4);

    await runLater();
    // The line goes first (SPEC §18.12): the seat went to the address already waiting.
    expect((await db().select().from(outbox)).map((m) => m.toAddress)).toEqual([
      "listed_f@example.test",
      "listed_f@example.test",
    ]);
    expect(await line()).toEqual(["new_f@example.test", "other_f@example.test"]);
  });

  it("an unexpected failure is one generic sentence, logged without the address, with nothing counted", async () => {
    await maintainer();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLIENT_IP_HEADER", "x-vercel-forwarded-for");
    vi.stubEnv("APP_URL", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await takeSeat(null, form({ email: "mara_f@example.test" }))).toEqual({
        error: GENERIC_ERROR,
      });
      expect(spy).toHaveBeenCalled();
      expect(JSON.stringify(spy.mock.calls)).not.toContain("mara_f");
    } finally {
      spy.mockRestore();
    }
    expect(await db().select().from(rateEvents)).toEqual([]);
  });
});

/* =========================================================== the admin page */

describe("/admin: the Seats section (SPEC §18.4)", () => {
  it("shows the counts and both forms to an administrator", async () => {
    const rado = await maintainer();
    signIn(rado);
    await setOpen(1234);
    await db().insert(waitlist).values([
      { email: "a_f@example.test", createdAt: t0 },
      { email: "b_f@example.test", createdAt: t0 },
    ]);
    const html = renderToStaticMarkup(await AdminPage());
    const text = textOf(html);
    expect(text).toContain("Seats open: 1,234. In line: 2.");
    expect(text).toMatch(/Open\s+seats/);
    // "Open [n] seats": the number field is named, not left as "Openseats".
    expect(html).toMatch(/<input[^>]*aria-label="Open seats"[^>]*name="count"/);
    expect(html).toContain('name="count"');
    expect(html).toContain('max="10000"');
    expect(text).toContain("Remove an address from the line");
    expect(html).toContain('name="email"');
    expect(text).not.toContain(SEATS_OFF);
    // No address in line is shown on the page.
    expect(html).not.toContain("a_f@example.test");
  });

  it("says that seats are off while no data controller is named", async () => {
    const rado = await maintainer();
    signIn(rado);
    vi.stubEnv("DATA_CONTROLLER", "");
    const text = textOf(renderToStaticMarkup(await AdminPage()));
    expect(text).toContain("Seats open: 0. In line: 0.");
    expect(text).toContain(SEATS_OFF);
  });

  it("is not found for anyone who is not an administrator", async () => {
    await maintainer();
    signIn(await makeAccount({ handle: "vera_f" }));
    await expect(AdminPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("openSeatsAction and forgetAction refuse a member as if nothing were there, and work for an administrator", async () => {
    const rado = await maintainer();
    const vera = await makeAccount({ handle: "vera_f" });
    await db().insert(waitlist).values([
      { email: "a_f@example.test", createdAt: t0 },
      { email: "b_f@example.test", createdAt: plus.minutes(t0, 1) },
    ]);

    signIn(vera);
    const refused = { ok: false, error: "That isn't available." };
    expect(await openSeatsAction(null, form({ count: "5" }))).toEqual(refused);
    expect(await forgetAction(null, form({ email: "a_f@example.test" }))).toEqual(refused);
    expect(await line()).toEqual(["a_f@example.test", "b_f@example.test"]);

    signIn(rado);
    for (const bad of ["", "abc", "1.5", "-3", "0", "10001", "1e3", " 7 x"]) {
      expect(await openSeatsAction(null, form({ count: bad })), bad).toEqual({
        ok: false,
        error: OPEN_SEATS_INVALID,
      });
    }
    expect(await forgetAction(null, form({ email: "A_F@example.test" }))).toEqual({ ok: true });
    expect(await openSeatsAction(null, form({ count: " 3 " }))).toEqual({ ok: true, opened: 3, invited: 1 });
    expect(await line()).toEqual([]);
    // The emails go after the response.
    expect(await db().select().from(outbox)).toEqual([]);
    await runLater();
    expect((await db().select().from(outbox)).map((m) => m.toAddress)).toEqual(["b_f@example.test"]);
  });

  it("says what opening seats did, in words", () => {
    expect(openedText({ opened: 1, invited: 0 })).toBe("Opened 1 seat. Nobody in line was invited.");
    expect(openedText({ opened: 3, invited: 1 })).toBe("Opened 3 seats. 1 address in line was invited.");
    expect(openedText({ opened: 1000, invited: 1000 })).toBe(
      "Opened 1,000 seats. 1,000 addresses in line were invited.",
    );
  });
});
