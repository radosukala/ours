/**
 * Independent verification of M-0011 (the launch website), the honesty
 * lens. Written by an agent that did not build apps/web, against f9a49fc.
 *
 * The question: where does a page, an email or a transparency file say
 * something the code does not do, say more than the records (D-0012,
 * M-0011, SPEC §18 and §18.12) allow, or contradict another page?
 *
 * - "DEFECT: …" asserts what the page, the email or the record says. It
 *   FAILS on f9a49fc, and the failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * The five "Why" sources (SPEC §18.9) were read over the network, which a
 * test cannot do; the verdicts are in the verification report, not here.
 *
 * Everyone here is FICTIONAL, with an example.test address; client
 * addresses are keyed hashes of the documentation ranges (RFC 5737).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, getTableColumns } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The request's cookies, as the page functions read them through next/headers. */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));
// /join waits for a request with `connection()`; here there is none to wait for.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

import ContractPage from "@/app/(public)/contract/page";
import ConfirmInvitePage from "@/app/(public)/join/confirm/page";
import { JoinForm } from "@/app/(public)/join/JoinForm";
import JoinPage from "@/app/(public)/join/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import { countLine, FrontPage } from "@/components/public/FrontPage";
import { CHECK_YOUR_EMAIL } from "@/components/public/GetInForm";
import { deleteAccount, openEmailLink } from "@/core/accounts";
import { inviteOfferCookieValue, signValue } from "@/core/auth";
import { ALLOWLIST, scanJsonText, scanText } from "@/core/claims";
import { EMAIL_TOKEN_TTL_MINUTES, INVITE_TTL_DAYS } from "@/core/config";
import { exportFilename } from "@/core/export";
import { getFeed } from "@/core/feed";
import { counts } from "@/core/health";
import {
  applyInviteAsExisting,
  completeJoin,
  createInvite,
  requestJoin,
  SEAT_NOTE,
} from "@/core/invites";
import { rateKeyHash } from "@/core/limits";
import { latestOutbox, tokenFromLink } from "@/core/mail";
import { seatEmail } from "@/core/mail-templates";
import { createReply, toggleLike } from "@/core/posts";
import {
  accounts,
  emailTokens,
  invites,
  outbox,
  seatState as seatRow,
  waitlist,
} from "@/core/schema";
import { memberCount, openSeats, requestSeat } from "@/core/seats";
import { areFriends } from "@/core/visibility";
import { at, befriend, db, makeAccount, plus, post, reset } from "./helpers";

beforeEach(reset);
afterEach(() => {
  jar.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const t0 = at("2026-09-28T10:00:00Z");
let nextIp = 0;
/** A different documentation client address each time. */
const ip = () => rateKeyHash(`198.51.100.${(nextIp += 1) % 250}`);

/* ---------------------------------------------------------------- helpers */

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const render = (element: ReactElement) => renderToStaticMarkup(element);
const page = (component: () => ReactElement) => textOf(render(createElement(component)));
const front = () =>
  textOf(render(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3 })));

/** The maintainer: the oldest active administrator. */
async function maintainer() {
  return makeAccount({
    handle: "rado_v4",
    displayName: "Rado FICTIONAL",
    isAdmin: true,
    createdAt: at("2026-01-01T00:00:00Z"),
  });
}

async function setOpen(n: number): Promise<void> {
  await db()
    .insert(seatRow)
    .values({ id: "seats", open: n })
    .onConflictDoUpdate({ target: seatRow.id, set: { open: n } });
}

async function ask(email: string, now?: Date): Promise<void> {
  await requestSeat(db(), { email, ipHash: ip(), now });
}

async function mailTo(email: string) {
  return db().select().from(outbox).where(eq(outbox.toAddress, email));
}

async function inLine(email: string): Promise<boolean> {
  const rows = await db().select().from(waitlist).where(eq(waitlist.email, email));
  return rows.length > 0;
}

async function linkTo(email: string): Promise<string> {
  const mail = await latestOutbox(db(), email, "join");
  if (!mail) throw new Error(`no join mail to ${email}`);
  return tokenFromLink(mail.body)!;
}

/** Join through a friend's invite, the ordinary way: request, link, /join. */
async function joinThroughAFriend(email: string, handle: string) {
  const friend = await makeAccount({ handle: `${handle.slice(0, 12)}_frd` });
  const { code } = await createInvite(db(), friend.id, {});
  await requestJoin(db(), { code, email, ipHash: ip() });
  const opened = await openEmailLink(db(), { token: await linkTo(email) });
  if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);
  return completeJoin(db(), {
    pendingJoinId: opened.pendingJoinId,
    displayName: `${handle} FICTIONAL`,
    handle,
    adultConfirmed: true,
  });
}

/* ====================================================================== */
/* Joining through a seat: what the join pages say (SPEC §18.12 item 2)   */
/* ====================================================================== */

describe("what the join pages say about a seat (D-0012 §F, SPEC §18.12 item 2)", () => {
  it("fixed (SPEC §18.12 item 12): /join tells everyone who joins through a seat that it is a seat, and joining makes no friendship", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("mara_v4@example.test");
    const opened = await openEmailLink(db(), { token: await linkTo("mara_v4@example.test") });
    if (opened.kind !== "join_pending") throw new Error(`expected a pending join, got ${opened.kind}`);

    // The page Mara reads before she presses Join.
    jar.set("ours_join", signValue(opened.pendingJoinId));
    const said = textOf(render((await JoinPage()) as ReactElement));
    expect(said).toContain("You took a seat on our.one.");
    const pagePromisesFriendship = said.includes("When you join, you're friends.");

    const joined = await completeJoin(db(), {
      pendingJoinId: opened.pendingJoinId,
      displayName: "Mara FICTIONAL",
      handle: "mara_v4",
      adultConfirmed: true,
    });
    const becameFriends = await areFriends(db(), rado.id, joined.accountId);

    // What the page promised is what happened.
    expect(
      { pagePromisesFriendship, becameFriends },
      "src/app/(public)/join/page.tsx:62-63 says 'When you join, you're friends.' for a seat invite",
    ).toEqual({ pagePromisesFriendship: becameFriends, becameFriends });
  });

  it("fixed (SPEC §18.12): an old seat link opened by an account holder is offered as 'Add Rado … as a friend?' on /join/confirm, and Add is then refused", async () => {
    const rado = await maintainer();
    await setOpen(1);
    await ask("noa_v4@example.test");
    const [seat] = await db().select().from(invites).where(eq(invites.note, SEAT_NOTE));
    const token = await linkTo("noa_v4@example.test");
    // Noa joins another way, then opens the seat email she still has.
    const noa = await joinThroughAFriend("noa_v4@example.test", "noa_v4");
    const opened = await openEmailLink(db(), { token });

    let offered = "";
    if (opened.kind === "joined_existing") {
      jar.set("ours_session", opened.session.cookieValue);
      jar.set(
        "ours_invite",
        inviteOfferCookieValue({ inviteId: opened.inviteId, accountId: opened.accountId }).cookieValue,
      );
      offered = textOf(render((await ConfirmInvitePage()) as ReactElement));
    }
    // Pressing Add is refused (SPEC §18.12 item 2) …
    const add = await applyInviteAsExisting(db(), { accountId: noa.accountId, inviteId: seat!.id }).then(
      () => "OK",
      (error: { code?: string }) => error.code ?? String(error),
    );
    expect(add).toBe("NOT_FOUND");
    expect(await areFriends(db(), rado.id, noa.accountId)).toBe(false);
    // … so the link should not have offered it.
    expect(
      { kind: opened.kind, offersFriendship: /as a friend\?/.test(offered) },
      `/join/confirm said: ${offered.slice(0, offered.indexOf(" Add Not now"))}`,
    ).toEqual({ kind: "signed_in", offersFriendship: false });
  });
});

/* ====================================================================== */
/* The contract as the terms people join under (D-0012 §A)                */
/* ====================================================================== */

describe("the contract is 'the terms you join under' (D-0012 §A; the front page and /contract)", () => {
  it("fixed (SPEC §18.12): the join form asks people to agree to the rules and the contract the front page calls 'the terms you join under'", () => {
    expect(front()).toContain("Read the contract: it is the terms you join under.");
    expect(front()).toContain("Today these promises are held by that contract, the terms you join under, not yet by law.");
    expect(page(ContractPage)).toContain("these are my promises, written into the terms you join under.");

    const form = render(createElement(JoinForm));
    expect(textOf(form)).toContain("By joining you agree to the rules and the contract, and have read the privacy notice.");
    expect(form, "JoinForm.tsx:56-66 names /rules and /privacy only").toMatch(/href="\/contract"/);
  });

  it("fixed (SPEC §18.12): /rules says both what is true of the code (the founder can change or remove any check without notice) and what the contract binds (a change to a promise needs 60 days' notice)", () => {
    const rules = page(RulesPage);
    const contract = page(ContractPage);
    const frontText = front();
    // The checks on /rules include the ones behind promises 3 and 4.
    expect(rules).toContain("Your feed shows the posts of the people you chose, newest first");
    expect(rules).toContain("You can download your data, and delete your account");
    const rulesSayWithoutNotice =
      rules.includes("The founder can change or remove any of these checks without notice") &&
      !rules.includes("What they promise is bound by the contract: a change to a promise is announced 60 days ahead");
    const pagesPromiseNotice =
      contract.includes("Any change to promises 3 to 7 is announced 60 days ahead") &&
      frontText.includes("The rest can change only with 60 days' notice");
    expect(
      rulesSayWithoutNotice && pagesPromiseNotice,
      "rules/page.tsx:48-49 against contract promise 8 and the front page's promise",
    ).toBe(false);
  });

  it("fixed (SPEC §18.12): promise 8 gives notice for any change to the contract, itself included (D-0012 §A)", () => {
    const contract = page(ContractPage);
    const eight = /Changes come with notice\.[^]*?Promises 1 and 2 can't be changed(?: at all)?\./.exec(contract)?.[0] ?? "";
    expect(eight).toContain("Any change to this contract is announced 60 days ahead");
    // The front page says the rest — everything but promises 1 and 2 — changes only with notice.
    expect(front()).toContain("Two of its promises can never be changed: no sale, and the handover. The rest can change only with 60 days' notice");
    const coversItself = /promises 3 to 8|any change to (?:this|the) contract/i.test(eight);
    expect(coversItself, `promise 8 reads: ${eight}`).toBe(true);
  });

  it("fixed (SPEC §18.12): promise 1 on /contract keeps D-0012 §A's 'or of any part of it'", () => {
    const record = readFileSync(`${WEB_ROOT}../../decisions/D-0012.md`, "utf8");
    expect(record).toContain("**No sale** of our.one or of any part of it");
    const contract = page(ContractPage);
    expect(contract).toContain("Neither our.one nor any part of it will be sold, and nobody will invest in it for a return.");
    expect(contract, "contract/page.tsx:37").toMatch(/any part of it/);
  });
});

/* ====================================================================== */
/* Promise 4: "download it all and delete it all" (held by "the code")    */
/* ====================================================================== */

describe("promise 4: you can leave with everything (held today by 'this contract, the code and the law')", () => {
  it("fixed (SPEC §18.12): after an account is deleted, its address leaves the waiting list, and no wave emails it a seat", async () => {
    expect(page(ContractPage)).toContain("and delete it all, whenever you want.");
    const rado = await maintainer();
    // Vera asks for a seat while none is open: she waits in line.
    await ask("vera_v4@example.test");
    expect(await inLine("vera_v4@example.test")).toBe(true);
    // She joins through a friend instead, and later deletes her account.
    const vera = await joinThroughAFriend("vera_v4@example.test", "vera_v4");
    await deleteAccount(db(), vera.accountId, "vera_v4");
    const stillInLine = await inLine("vera_v4@example.test");
    // The administrator opens a seat.
    await openSeats(db(), rado.id, 1);
    const mailedAfterDeletion = (await mailTo("vera_v4@example.test")).map((m) => m.subject);

    expect({ stillInLine, mailedAfterDeletion }).toEqual({ stillInLine: false, mailedAfterDeletion: [] });
  });

  it("fixed (SPEC §18.12): /contract and /privacy say what the export holds, and to write for anything else; neither says 'download it all' or 'download everything'", () => {
    const privacy = page(PrivacyPage);
    const contract = page(ContractPage);
    expect(privacy).not.toContain("download everything");
    expect(contract).not.toContain("download it all");
    expect(contract).toContain("download your profile, posts, replies and connections");
    expect(contract).toContain("For anything else we hold about you, write to us.");
    expect(privacy).toContain("download your profile, posts, replies and connections in");
    expect(privacy).toContain("For anything else we hold about you, write to the controller.");
  });

  it("closed: the waiting list keeps an address and when it was added, nothing else (M-0011), and /privacy names the seat as a purpose", () => {
    expect(Object.keys(getTableColumns(waitlist)).sort()).toEqual(["createdAt", "email"]);
    expect(page(PrivacyPage)).toContain("If you ask for a seat, we keep your email address to send you the join link");
  });

  it("recorded (SPEC §18.12): the join link's record keeps a seat address with no automatic removal, and /privacy now says so; retention periods are the founder's decision", async () => {
    expect(page(PrivacyPage)).toContain(
      "The join link's record keeps the address until you join or ask us to delete it: nothing removes it automatically yet.",
    );
    const rado = await maintainer();
    await ask("ida_v4@example.test", t0);
    await openSeats(db(), rado.id, 1, { now: plus.days(t0, 1) });
    expect(await inLine("ida_v4@example.test")).toBe(false); // invited
    const later = plus.days(t0, INVITE_TTL_DAYS + 60);
    await ask("someone_else_v4@example.test", later);
    const kept = await db().select().from(emailTokens).where(eq(emailTokens.email, "ida_v4@example.test"));
    // Recorded, not fixed: nothing removes it yet, as /privacy says.
    expect(kept.length).toBeGreaterThan(0);
  });
});

/* ====================================================================== */
/* The seat email and the Get in answer                                   */
/* ====================================================================== */

describe("the seat email and the one answer (SPEC §18.2, §18.12 item 6)", () => {
  it("closed: the first seat email's lifetimes are the code's — the link expires in 15 minutes, and the seat is still held (same invite) on day 29", async () => {
    await maintainer();
    const mail = seatEmail("http://localhost:3000/auth#FICTIONAL");
    expect(mail.body).toContain(`expires in ${EMAIL_TOKEN_TTL_MINUTES} minutes`);
    expect(mail.body).toContain(`your seat is kept for ${INVITE_TTL_DAYS} days`);
    await setOpen(1);
    await ask("lea_v4@example.test", t0);
    const [seat] = await db().select().from(invites).where(eq(invites.note, SEAT_NOTE));
    await ask("lea_v4@example.test", plus.days(t0, INVITE_TTL_DAYS - 1));
    const tokens = await db().select().from(emailTokens).where(eq(emailTokens.email, "lea_v4@example.test"));
    expect(tokens.map((t) => t.inviteId)).toEqual([seat!.id, seat!.id]);
    expect(await inLine("lea_v4@example.test")).toBe(false);
  });

  it("fixed (SPEC §18.12): a new link to a seat already held names the day the seat ends, not 30 more days", async () => {
    await maintainer();
    await setOpen(1);
    await ask("oto_v4@example.test", t0); // takes the seat
    await ask("oto_v4@example.test", plus.days(t0, 20)); // no seat open: a new link to the one held
    const second = await latestOutbox(db(), "oto_v4@example.test", "join");
    const ends = plus.days(t0, INVITE_TTL_DAYS).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    expect(second?.body).toContain(`your seat is kept until ${ends}`);
    // Oto asks again on day 31, after the seat ended: no seat is open, so
    // Oto waits in line, as the day-20 email's date said.
    await ask("oto_v4@example.test", plus.days(t0, 31));
    const mails = await mailTo("oto_v4@example.test");
    expect({ links: mails.length, putInLineInstead: await inLine("oto_v4@example.test") }).toEqual({
      links: 2,
      putInLineInstead: true,
    });
  });

  it("fixed (SPEC §18.12): the one answer also covers an address that already has an account, without saying whether it has one", async () => {
    expect(CHECK_YOUR_EMAIL).toBe(
      "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.",
    );
    await maintainer();
    await makeAccount({ handle: "mia_v4", email: "mia_v4@example.test" });
    await setOpen(1);
    await ask("mia_v4@example.test", t0); // a seat was open
    const linkSent = (await mailTo("mia_v4@example.test")).length > 0;
    await ask("mia_v4@example.test", plus.hours(t0, 2)); // none open now
    const putInLine = await inLine("mia_v4@example.test");
    // Neither happens for a member, and the answer's last sentence covers her.
    expect({ linkSent, putInLine }).toEqual({ linkSent: false, putInLine: false });
  });
});

/* ====================================================================== */
/* The count (D-0012 §B)                                                  */
/* ====================================================================== */

describe("the public count (D-0012 §B: accounts that exist and are not suspended)", () => {
  it("closed: memberCount counts accounts that exist and are not suspended — never a deleted account or the waiting list — and the front page shows that number", async () => {
    const anna = await makeAccount();
    await makeAccount();
    await makeAccount();
    await makeAccount({ suspended: true });
    await db().insert(waitlist).values({ email: "waiting_v4@example.test", createdAt: t0 });
    await db().delete(accounts).where(eq(accounts.id, anna.id));
    expect(await memberCount(db())).toBe(2);
    expect(countLine(await memberCount(db()))).toBe("2 people are in. You'd be #3.");
  });

  it("fixed (SPEC §18.12): /api/health publishes an 'accounts' number that counts suspended accounts too, a second public count that is not the front page's (D-0012 prohibits any other counter)", async () => {
    await makeAccount();
    await makeAccount({ suspended: true });
    const health = await counts(db());
    expect(health.accounts, "src/core/health.ts:23 counts every row").toBe(await memberCount(db()));
  });
});

/* ====================================================================== */
/* "The code is open" (promise 6; /power's code row)                      */
/* ====================================================================== */

describe("the code (promise 6, the front page, /power)", () => {
  it("fixed (SPEC §18.12): /contract and the front page say the code is open and anyone can read it; /power says it becomes public only once this build is pushed", () => {
    const power = page(PowerPage);
    const contract = page(ContractPage);
    const powerSaysNotYet = power.includes("public once this build is pushed to the public repository");
    const pagesSayOpenNow =
      contract.includes("The code is open. Anyone can read it, run it or copy it.") &&
      front().includes("The code is open, and every cost is public.");
    expect(powerSaysNotYet && pagesSayOpenNow, "two public pages disagree about the code today").toBe(false);
  });

  // Changed after the push (SPEC §18.14): the code is public, so the three
  // pages say so together, and none still says it will be.
  it("changed after the push: /contract, the front page and /power all say the code is public", () => {
    const power = page(PowerPage);
    const contract = page(ContractPage);
    expect(contract).toContain("The code is public, under an open licence (Apache-2.0): anyone can read it, run it or copy it.");
    expect(front()).toContain("The code is public, and so is every cost.");
    expect(power).toContain("Apache-2.0, and public: anyone can read it, run it or copy it.");
    for (const [name, text] of [["/contract", contract], ["the front page", front()], ["/power", power]] as const) {
      expect(text, name).not.toMatch(/public once this build is pushed|will be public|until it is published/);
    }
  });
});

/* ====================================================================== */
/* The claims scan (src/core/claims.ts) and the new copy                  */
/* ====================================================================== */

describe("the claims scan and the new copy (SPEC §18.7; M-0011: 'the claims-scan rules the new copy needs')", () => {
  const file = "src/components/public/FrontPage.tsx";

  /** As tests/claims.test.ts reads a rendered page: the markup, and its text. */
  const renderedHits = (html: string) => [...scanText(html), ...scanText(textOf(html))];

  it("closed: in the new copy's files, a claim split by inline markup, an entity, a JSX string or a wrapped line is still caught", () => {
    for (const claim of [
      "our.one is member <strong>owned</strong>.",
      "our.one is not&nbsp;for sale.",
      'our.one is {"member-"}owned.',
      "Contributions are tax\n        deductible.",
    ]) {
      expect(scanText(claim, file).length, claim).toBeGreaterThan(0);
      expect(scanText(claim, "src/app/(public)/contract/page.tsx").length, claim).toBeGreaterThan(0);
    }
  });

  it("fixed (SPEC §18.12): D-0012's new prohibitions have no rule — 'first', 'only', the handover told as done, and ownership in the future tense all pass, and no handover sentence is listed by exact text", () => {
    const claims = [
      "our.one is the first social network its founder gives away.",
      "our.one is the only network whose maintainer can be replaced.",
      "our.one has been handed over to its members.",
      "our.one now belongs to its members.",
      "At 100,000 members, you will own our.one.",
      "It's ours.",
    ];
    const passed = claims.filter((claim) => scanText(claim, file).length === 0);
    // M-0011: "The only future-tense ownership sentences allowed are the
    // handover promise and its conditions, each listed by exact text."
    const listed = ALLOWLIST.map((entry) => entry.sentence).filter((sentence) =>
      /\bhand(?:ed|s)? (?:it )?over\b|give it away/i.test(sentence),
    );
    expect({ passed, listedHandoverSentences: listed }).toEqual({
      passed: [],
      listedHandoverSentences: expect.arrayContaining([expect.any(String)]),
    });
  });

  it("fixed (SPEC §18.12): markup, entities and invisible characters still let a prohibited claim through, in the source scan and in the rendered scan", () => {
    const sources = [
      "our.one will be member<wbr />-owned.",
      "our.one is not for<br />sale.",
      "our.one will be member‎-owned.",
      "our.one will be member&lrm;-owned.",
      "our.one will be member&zwj;-owned.",
      "our.one will be member&minus;owned.",
    ];
    const passedSource = sources.filter((s) => scanText(s, file).length === 0);
    const passedJson = scanJsonText('{ "who": "our.one will be member\\u200e-owned." }', "transparency/control.json").length === 0;
    const rendered = [
      render(createElement("p", null, "our.one will be member", createElement("wbr"), "-owned.")),
      render(createElement("p", null, "our.one will be member‎-owned.")),
    ];
    const passedRendered = rendered.filter((html) => renderedHits(html).length === 0);
    expect({ passedSource, passedJson, passedRendered }).toEqual({
      passedSource: [],
      passedJson: false,
      passedRendered: [],
    });
  });
});

/* ====================================================================== */
/* The rename (SPEC §18.5)                                                */
/* ====================================================================== */

describe("the rename to our.one (SPEC §18.5)", () => {
  it("closed: the front page, /contract, /privacy and the seat email say our.one, never OURS", () => {
    for (const text of [front(), page(ContractPage), page(PrivacyPage)]) {
      expect(text).not.toMatch(/\bOURS\b/);
      expect(text).toContain("our.one");
    }
    const mail = seatEmail("http://localhost:3000/auth#FICTIONAL");
    expect(`${mail.subject}\n${mail.body}`).not.toMatch(/\bOURS\b/i);
    expect(mail.subject).toBe("Your seat on our.one");
  });

  it("fixed (SPEC §18.12): the file a person downloads from Settings → Export is still named after OURS: ours-export-<handle>-<date>.json", () => {
    const name = exportFilename("anna_v4", t0);
    expect(name, "src/core/export.ts:96").not.toMatch(/^ours-/i);
  });
});

/* ====================================================================== */
/* Promise 3 held by the code; the Why sources as linked                  */
/* ====================================================================== */

describe("what the code holds, and the sources as linked", () => {
  it("closed: 'your people, in order, no ranking' — the feed is newest first, whatever the likes and replies", async () => {
    const vera = await makeAccount({ handle: "vera_f4" });
    const anna = await makeAccount({ handle: "anna_f4" });
    const ben = await makeAccount({ handle: "ben_f4" });
    await befriend(vera, anna);
    await befriend(vera, ben);
    await befriend(anna, ben);
    const now = new Date();
    const popular = await post(anna, { at: plus.hours(now, -5), body: "FICTIONAL older, popular" });
    const quiet = await post(anna, { at: plus.hours(now, -1), body: "FICTIONAL newer, quiet" });
    await toggleLike(db(), vera.id, popular.id, now);
    await toggleLike(db(), ben.id, popular.id, now);
    await createReply(db(), ben.id, popular.id, { body: "FICTIONAL reply", now });
    const feed = await getFeed(db(), vera.id, { now });
    expect(feed.items.map((item) => item.id)).toEqual([quiet.id, popular.id]);
  });

  it("closed: each 'Why' sentence links to its SPEC §18.9 source, in order, and the 2012 line no longer claims '$0.99'", () => {
    const spec = readFileSync(`${WEB_ROOT}SPEC.md`, "utf8");
    const table = spec.slice(spec.indexOf("### 18.9"), spec.indexOf("### 18.10"));
    const sources = [...table.matchAll(/\| (20\d\d) \| (https:\/\/\S+) \|/g)].map((m) => m[2]);
    expect(sources).toHaveLength(5);
    const html = render(createElement(FrontPage, { count: 0, joining: false, seatsOpen: null }));
    const why = html.slice(html.indexOf('id="front-why"'), html.indexOf('id="front-questions"'));
    expect([...why.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1])).toEqual(sources);
    expect(textOf(why)).not.toContain("$0.99");
  });
});
