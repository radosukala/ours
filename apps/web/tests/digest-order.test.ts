/**
 * The weekly email names the most recent posters first (SPEC §18.6,
 * M-0011): how many times someone posted plays no part in the order,
 * though the count stays in the text. Ordering by the count would rank
 * people by activity. Everyone here is FICTIONAL.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { digestFor, runWeeklyDigest } from "@/core/digest";
import { outbox } from "@/core/schema";
import { at, befriend, db, makeAccount, plus, post, reset } from "./helpers";

beforeEach(reset);

/** Thursday 24 September 2026; its week starts on Monday the 21st. */
const now = at("2026-09-24T09:00:00Z");

async function bodyTo(email: string): Promise<string> {
  const [message] = await db().select().from(outbox).where(eq(outbox.toAddress, email));
  return message?.body ?? "";
}

describe("the weekly email's order (SPEC §18.6)", () => {
  it("names the most recent poster first, not the one who posted most, and keeps each count in the text", async () => {
    const reader = await makeAccount({ displayName: "FICTIONAL Reader" });
    const busy = await makeAccount({ displayName: "FICTIONAL Busy" });
    const middle = await makeAccount({ displayName: "FICTIONAL Middle" });
    const recent = await makeAccount({ displayName: "FICTIONAL Recent" });
    for (const friend of [busy, middle, recent]) await befriend(reader, friend);

    // Busy posted five times, three days ago; Middle twice, two days ago;
    // Recent once, an hour ago. By count the order would be the reverse.
    for (let i = 0; i < 5; i++) await post(busy, { at: plus.minutes(plus.days(now, -3), -i) });
    for (let i = 0; i < 2; i++) await post(middle, { at: plus.minutes(plus.days(now, -2), -i) });
    await post(recent, { at: plus.hours(now, -1) });

    const lines = await digestFor(db(), reader.id, now);
    expect(lines.map((l) => [l.name, l.posts])).toEqual([
      ["FICTIONAL Recent", 1],
      ["FICTIONAL Middle", 2],
      ["FICTIONAL Busy", 5],
    ]);

    await runWeeklyDigest(db(), now);
    const body = await bodyTo(reader.email);
    expect(body).toContain("FICTIONAL Recent posted once.");
    expect(body).toContain("FICTIONAL Middle posted 2 times.");
    expect(body).toContain("FICTIONAL Busy posted 5 times.");
    expect(body.indexOf("FICTIONAL Recent")).toBeLessThan(body.indexOf("FICTIONAL Middle"));
    expect(body.indexOf("FICTIONAL Middle")).toBeLessThan(body.indexOf("FICTIONAL Busy"));
  });

  it("when more than five posted, the five named are the five most recent; the busiest of the rest is one of the 'others'", async () => {
    const reader = await makeAccount();
    const busiest = await makeAccount({ displayName: "FICTIONAL Busiest" });
    await befriend(reader, busiest);
    for (let i = 0; i < 9; i++) await post(busiest, { at: plus.minutes(plus.days(now, -6), -i) });
    const names = ["Anna", "Petr", "Eva", "Jan", "Olga"];
    for (const [i, name] of names.entries()) {
      const friend = await makeAccount({ displayName: `FICTIONAL ${name}` });
      await befriend(reader, friend);
      await post(friend, { at: plus.hours(now, -(i + 1)) });
    }

    await runWeeklyDigest(db(), now);
    const body = await bodyTo(reader.email);
    for (const name of names) expect(body).toContain(`FICTIONAL ${name} posted once.`);
    expect(body).not.toContain("FICTIONAL Busiest");
    expect(body).toContain("and 1 other");
    const at_ = (name: string) => body.indexOf(`FICTIONAL ${name}`);
    expect(names.map(at_)).toEqual([...names.map(at_)].sort((a, b) => a - b));
  });

  it("two people whose latest posts are at the same moment are named in a stable order", async () => {
    const reader = await makeAccount();
    const one = await makeAccount({ displayName: "FICTIONAL One" });
    const two = await makeAccount({ displayName: "FICTIONAL Two" });
    await befriend(reader, one);
    await befriend(reader, two);
    const moment = plus.hours(now, -2);
    await post(two, { at: moment });
    await post(one, { at: moment });
    await post(one, { at: plus.hours(moment, -1) });
    const first = (await digestFor(db(), reader.id, now)).map((l) => l.authorId);
    expect(first).toEqual([one.id, two.id].sort());
    expect((await digestFor(db(), reader.id, now)).map((l) => l.authorId)).toEqual(first);
  });
});
