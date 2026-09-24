/**
 * Re-verification of M-0010 (second and final round, SPEC §17 stopping
 * rule), lens: honesty, records and the public surface. Written by a
 * verifier that did not build apps/web and did not write the first round.
 *
 * It re-attacks what the fixers changed (the claims scan's normalization
 * and file list, the ledger evidence rule, the /power controller row,
 * /privacy, /rules, the running version, the suspension notice) and the
 * verify-honesty tests whose bodies the fixers rewrote.
 *
 * A test named "DEFECT: …" FAILS on dafb604: it states what the records
 * (SPEC, D-0011, M-0010, FOUNDING-AUTHORITY, AGENTS.md) require, and the
 * failure is the evidence. A test named "closed: …" PASSES: a door tried and
 * found shut.
 *
 * Every person here is FICTIONAL, with an example.test address.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CostsPage from "@/app/(public)/costs/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import RootNotFound from "@/app/not-found";
import { FLOOR_RULES } from "@/components/public/floorRules";
import { SiteFooter } from "@/components/RightColumn";
import { deleteAccount } from "@/core/accounts";
import { publicTextFiles, scanRepoPublicText, scanText } from "@/core/claims";
import { runWeeklyDigest } from "@/core/digest";
import { exportAccount } from "@/core/export";
import { createInvite, requestJoin } from "@/core/invites";
import { sendMail } from "@/core/mail";
import { digestEmail, joinEmail, signInEmail, suspensionEmail } from "@/core/mail-templates";
import { createReport, listOpenReports, suspendAccount } from "@/core/reports";
import { accounts, mailLog, outbox } from "@/core/schema";
import { ledgerSummary, loadControl, loadLedger, parseLedger } from "@/core/transparency";
import { canSeePost } from "@/core/visibility";
import { at, befriend, db, makeAccount, post, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");

const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");

/** Visible text of rendered HTML, roughly as a reader sees it. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A throwaway apps/web shape the scanner accepts. */
function scratchWebRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-verify2-claims-"));
  for (const d of ["src/app", "src/components", "src/core", "src/web", "transparency"]) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  writeFileSync(join(dir, "src/core/mail-templates.ts"), "export {};\n");
  return dir;
}

const rule = (id: string) => FLOOR_RULES.flatMap((g) => g.rules).find((r) => r.id === id)!;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

afterEach(() => vi.unstubAllEnvs());

/* ====================================================================== */
/* The claims scan after SPEC §17 item 15                                  */
/* ====================================================================== */

describe("claims scan: the text as a reader sees it", () => {
  it("DEFECT: a claim split by inline markup or by a JSX string expression passes the scan, though the page renders it whole", () => {
    // claims.ts says the text is normalized "as a reader would see it". A
    // reader of <p>OURS is not for <strong>sale</strong>.</p> reads "OURS is
    // not for sale."; the scan reads the raw source, where a tag or `"}`
    // sits between the words.
    const rendered = textOf(
      renderToStaticMarkup(
        createElement("p", null, "OURS is not for ", createElement("strong", null, "sale"), "."),
      ),
    );
    expect(scanText(rendered).map((h) => h.match)).toEqual(["not for sale"]);

    const dir = scratchWebRoot();
    try {
      writeFileSync(
        join(dir, "src/app/page.tsx"),
        [
          "export default function Page() {",
          "  return (",
          "    <>",
          "      <p>OURS is not for <strong>sale</strong>.</p>",
          '      <p>A home that is {"member-"}owned.</p>',
          "      <p>Contributions are <em>tax-</em>deductible.</p>",
          "    </>",
          "  );",
          "}",
          "",
        ].join("\n"),
      );
      const { hits } = scanRepoPublicText(dir);
      // One hit on each of lines 4, 5 and 6: "not for sale", "member-owned",
      // "tax-deductible" as the page renders them.
      expect(
        hits.map((h) => h.line),
        "three claims a reader sees on the rendered page",
      ).toEqual([4, 5, 6]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DEFECT: a claim written with a JSON or JavaScript escape (\\u0020) passes the scan, though /power or /rules shows it", () => {
    // control.json is rendered verbatim on /power; floorRules.ts on /rules.
    // Neither escape is an HTML entity, so the normalization leaves it.
    const json = '{ "rows": [ { "who": "OURS is not for\\u0020sale." } ] }';
    const shown = (JSON.parse(json) as { rows: { who: string }[] }).rows[0]!.who;
    expect(shown).toBe("OURS is not for sale.");
    expect(scanText(shown).length).toBe(1);

    const dir = scratchWebRoot();
    try {
      writeFileSync(join(dir, "transparency/control.json"), json);
      writeFileSync(
        join(dir, "src/components/rules.ts"),
        'export const TEXT = "Every account is user\\u2011owned, and contributions are tax\\x20deductible.";\n',
      );
      const { hits } = scanRepoPublicText(dir);
      // "user-owned" and "tax deductible" in rules.ts, "not for sale" in control.json.
      expect(hits.map((h) => `${h.file}:${h.line}`).sort()).toEqual([
        "src/components/rules.ts:1",
        "src/components/rules.ts:1",
        "transparency/control.json:1",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DEFECT: present-tense ownership claims in the kernel's and D-0011's own word family still pass (owned by its members, owned by you, member owned, en-dash forms)", () => {
    // SPEC §17 item 15 added near forms for "owned by the people"; the
    // commonest co-operative phrase, "owned by its members", and the
    // second-person form still pass. D-0011: "any claim of ownership, in the
    // present tense".
    const passing = [
      "OURS is owned by its members.",
      "A home owned by you.",
      "A member owned network.",
      "A members-owned network.",
      "A user–owned network.", // en dash, as a typographer writes it
      "Contributions are tax–deductible.", // en dash
      "Contributions are tax&ndash;deductible.",
    ].filter((s) => scanText(s, "src/app/(public)/page.tsx").length === 0);
    expect(passing, "claims of ownership or tax deductibility the scan lets through").toEqual([]);
  });

  it("closed: a one-line claim injected into each file the fixers added or changed is caught, and each is read by the scan", () => {
    const files = [
      "src/app/(public)/join/confirm/page.tsx",
      "src/app/(public)/join/confirm/ConfirmForms.tsx",
      "src/app/(public)/join/confirm/actions.ts",
      "src/components/public/InAppSiteFooter.tsx",
      "src/app/not-found.tsx",
      "src/app/(app)/not-found.tsx",
      "src/app/(app)/settings/page.tsx",
      "src/core/mail-templates.ts",
      "src/core/reports.ts",
      "src/core/transparency.ts",
      "src/web/request.ts",
      "src/web/session.ts",
    ];
    const scanned = new Set(publicTextFiles(WEB_ROOT));
    for (const file of files) {
      expect(scanned.has(file), file).toBe(true);
      const real = read(file);
      expect(scanText(real, file), file).toEqual([]);
      expect(scanText(`${real}\nconst FICTIONAL_CLAIM = "OURS is not for sale.";\n`, file).map((h) => h.match), file).toEqual([
        "not for sale",
      ]);
    }
  });

  it("closed: the rendered text of /rules, /privacy, /power, /costs, not-found, the footer and every mail template passes the scan", () => {
    const pages = [
      ["src/components/public/floorRules.ts", textOf(renderToStaticMarkup(createElement(RulesPage)))],
      ["privacy", textOf(renderToStaticMarkup(createElement(PrivacyPage)))],
      ["power", textOf(renderToStaticMarkup(createElement(PowerPage)))],
      ["costs", textOf(renderToStaticMarkup(createElement(CostsPage)))],
      ["not-found", textOf(renderToStaticMarkup(createElement(RootNotFound)))],
      ["footer", textOf(renderToStaticMarkup(createElement(SiteFooter)))],
    ] as const;
    for (const [where, text] of pages) {
      // /rules carries the one allowlisted sentence; its file is floorRules.ts.
      const file = where.includes("/") ? where : null;
      expect(scanText(text, file), where).toEqual([]);
      expect(text, where).not.toMatch(/\b(compiler|mandates?|governance|constitution(al)?)\b/i);
      expect(text, where).not.toContain("[CONFIRM");
    }
    const mails = [
      signInEmail("http://localhost:3000/auth#FICTIONAL"),
      joinEmail("http://localhost:3000/auth#FICTIONAL", "FICTIONAL Anna", "anna_f"),
      suspensionEmail("FICTIONAL reason for the decision.", "controller@example.test"),
      suspensionEmail("FICTIONAL reason for the decision.", null),
      digestEmail([{ name: "FICTIONAL Anna", posts: 3 }], "http://localhost:3000", "http://localhost:3000/unsubscribe#x"),
    ];
    for (const m of mails) expect(scanText(`${m.subject}\n${m.body}`), m.subject).toEqual([]);
  });
});

/* ====================================================================== */
/* /costs and the ledger evidence rule (SPEC §17 item 16)                   */
/* ====================================================================== */

describe("/costs and the ledger", () => {
  const ledgerWith = (evidence: unknown) => ({
    scope: "FICTIONAL",
    currency: "USD",
    contributions_open: false,
    unpaid_work: "FICTIONAL",
    entries: [
      {
        id: "L-0009",
        kind: "expense",
        status: "RECORDED",
        date: "2026-09-24",
        description: "FICTIONAL hosting bill",
        amount: 120,
        evidence,
        note: null,
      },
    ],
  });

  it("DEFECT: a RECORDED expense whose evidence is a placeholder word ('none', 'TBD', 'n/a', '.') is accepted and counted as paid", () => {
    // SPEC §17 item 16: "A RECORDED contribution or expense without evidence
    // is refused." The only check is that the value looks like a repository
    // path, and every one of these does; none names a record.
    const accepted: string[] = [];
    for (const evidence of ["none", "TBD", "n/a", "pending", ".", "-", "receipts/"]) {
      try {
        const s = ledgerSummary(parseLedger(ledgerWith(evidence)));
        if (s.paid.total === 120) accepted.push(evidence);
      } catch (error) {
        if ((error as Error).name !== "TransparencyError") throw error;
      }
    }
    expect(accepted, "evidence values that name no record, yet count $120 as paid").toEqual([]);
  });

  it("closed: /costs, rendered, puts each entry of ledger.json in the section its kind and status say, and nothing else is counted", () => {
    const html = renderToStaticMarkup(createElement(CostsPage));
    const ledger = loadLedger();
    const raw = JSON.parse(read("transparency/ledger.json")) as { entries: unknown[] };
    expect(ledger.entries).toHaveLength(raw.entries.length);
    const section = (name: string) => {
      const start = html.indexOf(`data-section="${name}"`);
      const end = html.indexOf("</section>", start);
      return start === -1 ? "" : html.slice(start, end);
    };
    for (const e of ledger.entries) {
      const where =
        e.kind === "contribution" ? "received" : e.kind === "expense" ? "paid" : e.kind === "credit" ? "credits" : "coming";
      for (const name of ["received", "paid", "coming", "credits"]) {
        const has = section(name).includes(`data-entry="${e.id}"`);
        expect(has, `${e.id} in ${name}`).toBe(name === where);
      }
    }
    const s = ledgerSummary();
    expect(s.received.total).toBe(0);
    expect(s.paid.total).toBe(0);
    expect(textOf(section("remaining"))).toContain("Nothing received yet.");
    // The proposal is shown as a proposal, the estimate as an estimate.
    expect(textOf(section("coming"))).toContain("proposed, not yet confirmed");
    expect(textOf(section("coming"))).toContain("estimate, not yet invoiced");
  });
});

/* ====================================================================== */
/* /power and /privacy                                                      */
/* ====================================================================== */

describe("/power and /privacy", () => {
  beforeEach(reset);

  it("DEFECT: /privacy says 'Resend delivers the emails OURS sends' whenever MAIL_TRANSPORT=resend, even where the transport refuses and nothing is sent or kept", async () => {
    // SPEC §17 item 17: the provider line is derived from the configuration.
    // It reads one variable; sendMail also needs production, a key and a
    // sender, and otherwise refuses (SPEC §2 rule 5). Here nothing reaches
    // Resend, and nothing is written to the outbox either.
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const saysResend = privacy.includes("Resend delivers the emails OURS sends");
    const result = await sendMail(db(), {
      to: "anna_f@example.test",
      subject: "FICTIONAL",
      body: "FICTIONAL",
      kind: "sign_in",
    });
    expect(result).toEqual({ ok: false, errorCode: "transport_refused" });
    expect(await db().select().from(outbox)).toHaveLength(0);
    expect((await db().select().from(mailLog))[0]?.status).toBe("failed");
    expect(saysResend, "/privacy names Resend as a recipient of data that is never sent to it").toBe(false);
  });

  it("DEFECT: under a production configuration that sends through Resend, /privacy names Resend while /power says email sending is 'None yet' (RECORDED), and /privacy's own hosting line says OURS is not deployed", () => {
    // SPEC §17 item 18 made the controller row follow the configuration "so
    // /privacy and /power never disagree"; the email line of /privacy now
    // follows the configuration too, and the /power row does not.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_FICTIONAL");
    vi.stubEnv("MAIL_FROM", "ours@example.test");
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const power = textOf(renderToStaticMarkup(createElement(PowerPage)));
    const privacyNamesResend = privacy.includes("Resend delivers the emails OURS sends");
    const powerSaysNone = power.includes("Hosting, database, email sending recorded None yet. OURS is not deployed.");
    expect(privacyNamesResend).toBe(true);
    expect(privacy).toContain("Hosting none yet — OURS is not deployed.");
    expect(
      privacyNamesResend && powerSaysNone,
      "/privacy and /power, on one server, disagree about who sends email",
    ).toBe(false);
  });

  it("closed: /power shows no [CONFIRM] fact: the operator is only proposed and STATED, the controller follows the configuration, and the six subjects of D-0011 §C.3 are there", () => {
    for (const configured of [true, false]) {
      if (!configured) {
        vi.stubEnv("DATA_CONTROLLER", "");
        vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
      }
      const text = textOf(renderToStaticMarkup(createElement(PowerPage)));
      expect(text).not.toContain("[CONFIRM");
      for (const fact of [/Legalinc/i, /Continental/i, /Newark/i, /file number/i, /\bofficers?\b/i, /\bdirectors?\b/i, /\bowns?\b/i]) {
        expect(text, String(fact)).not.toMatch(fact);
      }
      expect(text).toContain(
        "The operator stated by the founder, not verified Ctrl AI, Inc. (Delaware) is proposed as the starting operator. Its authority, assets and responsibility for OURS are not yet recorded.",
      );
      expect(text).toContain(
        configured
          ? "Data controller stated in this server's configuration FICTIONAL Controller."
          : "Data controller not yet recorded Not yet named.",
      );
      for (const subject of ["The domain our.one", "Hosting, database, email sending", "Releases", "Moderation", "Money", "The code"]) {
        expect(text, subject).toContain(subject);
      }
    }
  });

  it("closed: /privacy's rate-limit sentence covers every key the core writes, and its cookie sentence the three cookies session.ts sets", () => {
    const core = ["accounts", "connections", "invites", "posts", "reports"].map((m) => read(`src/core/${m}.ts`)).join("\n");
    const keys = [...core.matchAll(/hit\(\s*\w+,\s*`([a-z:]+)\$\{([^}]+)\}`/g)].map((m) => `${m[1]}${m[2]}`);
    expect(keys.length).toBeGreaterThanOrEqual(12);
    for (const key of keys) {
      const hashed = /rateKeyHash|ipHash/.test(key);
      const accountId = /^(post|reply|friendreq|follow|report|invite|handle):/.test(key);
      const inviteId = key.startsWith("join:invite:");
      expect(hashed || accountId || inviteId, key).toBe(true);
    }
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(privacy).toContain(
      "Your account's id, or a scrambled code made from your email or network address, and a time. Not the address itself. A limit on one invite link holds that invite's id.",
    );
    const session = read("src/web/session.ts");
    const cookies = [...session.matchAll(/export const [A-Z_]+_COOKIE = "([a-z_]+)"/g)].map((m) => m[1]);
    expect(cookies).toEqual(["ours_session", "ours_join", "ours_invite"]);
    expect(privacy).toContain("Three cookies, all needed for the site to work");
  });
});

/* ====================================================================== */
/* The records /power and /rules call public                                */
/* ====================================================================== */

describe("what the pages call public", () => {
  const git = (args: string[]) => spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  const haveRemote = git(["rev-parse", "--verify", "--quiet", "origin/main"]).status === 0;

  it.skipIf(!haveRemote)(
    "DEFECT: /power records 'Decisions are public' (RECORDED) and /rules 'every decision is a public record', yet D-0011 and M-0010, which govern this build, are not in the public repository",
    () => {
      // SPEC §17 item 18 made "The code" STATED — "public once this build is
      // pushed" — because it is not public yet. The decision and mandate the
      // other rows cite sit in the same unpushed history, and their links on
      // /power (…/blob/main/decisions/D-0011.md) do not resolve.
      const rows = Object.fromEntries(loadControl().map((r) => [r.asset, r]));
      expect(rows["The code"]?.status).toBe("STATED");
      expect(rows["The code"]?.who).toMatch(/public once this build is pushed/);
      const rulesRow = rows["The rules of OURS"]!;
      expect(rulesRow.status).toBe("RECORDED");
      expect(rulesRow.who).toContain("Decisions are public in the OURS records.");
      expect(textOf(renderToStaticMarkup(createElement(RulesPage)))).toContain(
        "Every decision is a public record in the open code .",
      );
      const unpublished = loadControl()
        .filter((r) => r.status === "RECORDED")
        .flatMap((r) => (r.evidence ?? []).map((e) => e.path))
        .filter((path) => git(["cat-file", "-e", `origin/main:${path}`]).status !== 0);
      expect(unpublished, "RECORDED evidence /power links to that the public repository does not have").toEqual([]);
    },
  );
});

/* ====================================================================== */
/* /rules: each ENFORCED sentence against the code and its cited tests      */
/* ====================================================================== */

describe("/rules", () => {
  beforeEach(reset);

  it("DEFECT: 'Every account except the founder's is invited by a person' is ENFORCED, but the founder script makes an uninvited administrator every time it runs (the fixer's rewrite checks only that the script says invitedBy: null)", async () => {
    // verify-honesty's rewritten test asserts the new sentence and that
    // seed-founder.ts contains `invitedBy: null` once. The script is "the
    // first account" in its own words, but it checks only that the address
    // and handle are free, so a second run makes a second account with no
    // inviter. The ENFORCED legend says "The code refuses anything else".
    const r = rule("invite-only");
    expect(r.cls).toBe("ENFORCED");
    expect(r.text).toContain("Every account except the founder's is invited by a person.");
    expect(r.more).toBe("The founder's account is the first one, so nobody could invite it.");
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      USER: process.env.USER ?? "",
      DATABASE_URL: process.env.DATABASE_URL!,
      SESSION_SECRET: process.env.SESSION_SECRET!,
      DATA_CONTROLLER: "FICTIONAL Controller",
      DATA_CONTROLLER_EMAIL: "controller@example.test",
      APP_URL: "http://localhost:3000",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv;
    const tsx = join(WEB_ROOT, "node_modules/.bin/tsx");
    for (const [email, handle] of [
      ["fic_founder_a@example.test", "fic_founder_a"],
      ["fic_founder_b@example.test", "fic_founder_b"],
    ]) {
      const out = spawnSync(
        tsx,
        ["scripts/seed-founder.ts", "--email", email!, "--handle", handle!, "--name", "FICTIONAL Founder"],
        { cwd: WEB_ROOT, encoding: "utf8", env },
      );
      expect(out.status, out.stderr).toBe(0);
    }
    const uninvited = await db().select({ handle: accounts.handle }).from(accounts).where(isNull(accounts.invitedBy));
    expect(uninvited.map((a) => a.handle), "accounts no person invited").toHaveLength(1);
  }, 60_000);

  it("DEFECT: 'You can download your data, and delete your account, at any time' is ENFORCED, but a suspended account can do neither, as the cited tests themselves assert", async () => {
    const r = rule("export-delete");
    expect(r.cls).toBe("ENFORCED");
    expect(r.text).toContain("You can download your data, and delete your account, at any time in Settings.");
    const sam = await makeAccount({ handle: "sam_f", suspended: true });
    const exportCode = await codeOf(exportAccount(db(), sam.id));
    const deleteCode = await codeOf(deleteAccount(db(), sam.id, "sam_f"));
    expect([exportCode, deleteCode]).toEqual(["NOT_FOUND", "NOT_FOUND"]); // export.test.ts:176, accounts.test.ts:446
    expect(await db().select().from(accounts).where(eq(accounts.id, sam.id))).toHaveLength(1);
    expect(
      r.text.includes("at any time") && exportCode !== "OK",
      "/rules says 'at any time'; a suspended person can neither export nor delete",
    ).toBe(false);
  });

  it("DEFECT: 'Nobody else sees either' (audience, ENFORCED) is false by design: the administrator reads a reported friends-only post", async () => {
    // The same page's queue rule says admins read reported content "whoever
    // it was shared with"; the audience rule's absolute does not name it
    // (AGENTS.md §10: an absolute quantifier is a factual claim).
    const r = rule("audience");
    expect(r.cls).toBe("ENFORCED");
    expect(r.text).toContain("Nobody else sees either.");
    const author = await makeAccount({ handle: "author_f" });
    const friend = await makeAccount({ handle: "friend_f" });
    const admin = await makeAccount({ handle: "admin_f", isAdmin: true });
    await befriend(author, friend);
    const p = await post(author, { audience: "friends", body: "A FICTIONAL friends-only post.", at: at("2026-09-24T09:00:00Z") });
    expect(await canSeePost(db(), admin.id, p.id)).toBeNull();
    await createReport(db(), friend.id, { kind: "post", targetId: p.id, category: "other", now: at("2026-09-24T10:00:00Z") });
    const queue = await listOpenReports(db(), admin.id);
    const adminReads = queue.some((q) => q.target.kind === "post" && q.target.body === "A FICTIONAL friends-only post.");
    expect(adminReads).toBe(true);
    expect(
      r.text.includes("Nobody else sees either.") && adminReads,
      "an ENFORCED 'nobody else' that the moderation queue contradicts",
    ).toBe(false);
  });

  it("DEFECT: 'Changing your username is limited to 5 times a day' (part of the ENFORCED blocking rule) is asserted by no test /rules cites; the only test is one /rules cannot cite", () => {
    // SPEC §17 item 19: "It cites the tests that assert each part of a
    // rule." The limit is asserted only in tests/identity-fixes.test.ts,
    // which SPEC §14 assigns to no module, so transparency.test.ts forbids
    // citing it. The limit also counts tries (a taken name counts), not
    // changes.
    const r = rule("blocking");
    expect(r.cls).toBe("ENFORCED");
    expect(r.more).toContain("Changing your username is limited to 5 times a day.");
    const assertsLimit = (text: string) => /changeHandle/.test(text) && /RATE_LIMITED/.test(text);
    expect(assertsLimit(read("tests/identity-fixes.test.ts"))).toBe(true);
    expect(r.tests).not.toContain("tests/identity-fixes.test.ts");
    const cited = (r.tests ?? []).filter((f) => assertsLimit(read(f)));
    expect(cited, "a cited test that asserts the username limit").not.toEqual([]);
  });

  it("closed: /rules, rendered, says the founder can change or remove any check without notice, and every cited test file exists", () => {
    const text = textOf(renderToStaticMarkup(createElement(RulesPage)));
    expect(text).toContain("The founder can change or remove any of these checks without notice; every change is a public commit.");
    for (const r of FLOOR_RULES.flatMap((g) => g.rules)) {
      for (const f of r.tests ?? []) expect(() => read(f), `${r.id}: ${f}`).not.toThrow();
      if (r.cls === "DECLARED" || r.cls === "INTERPRETED") expect(r.tests ?? [], r.id).toEqual([]);
    }
    expect(rule("claims").cls).toBe("CHECKED");
  });
});

/* ====================================================================== */
/* Mail                                                                     */
/* ====================================================================== */

describe("mail never carries post text", () => {
  beforeEach(reset);

  it("closed: after a join request, a weekly run and a suspension (with its new notice), no outbox message holds any part of any post", async () => {
    const t0 = at("2026-09-23T09:00:00Z");
    const anna = await makeAccount({ handle: "anna_f", displayName: "FICTIONAL Anna" });
    const ben = await makeAccount({ handle: "ben_f", displayName: "FICTIONAL Ben" });
    const admin = await makeAccount({ handle: "admin_f", isAdmin: true });
    await befriend(anna, ben);
    const bodies = ["FICTIONAL secret-one about the allotment", "FICTIONAL secret-two about the choir"];
    const p1 = await post(anna, { audience: "friends", body: bodies[0], at: t0 });
    await post(anna, { audience: "friends", body: bodies[1], at: t0 });
    const invite = await createInvite(db(), anna.id, { now: t0 });
    await requestJoin(db(), { code: invite.code, email: "newcomer_f@example.test", ipHash: "FICTIONAL", now: t0 });
    await runWeeklyDigest(db(), at("2026-09-24T09:00:00Z"));
    const { id: reportId } = await createReport(db(), ben.id, { kind: "post", targetId: p1.id, category: "other", now: t0 });
    await suspendAccount(db(), admin.id, reportId, { reason: "FICTIONAL statement of reasons.", now: t0 });
    const sent = await db().select().from(outbox);
    expect(sent.map((m) => m.kind).sort()).toEqual(["digest", "join", "notice"]);
    for (const m of sent) {
      for (const b of bodies) {
        for (const word of ["secret-one", "secret-two", b]) expect(`${m.subject}\n${m.body}`, m.kind).not.toContain(word);
      }
    }
  });
});
