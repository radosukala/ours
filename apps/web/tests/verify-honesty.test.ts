/**
 * Independent verification of M-0010, lens: honesty, records and the public
 * surface. Written by a verifier that did not build apps/web.
 *
 * A test named "DEFECT: …" FAILS on the merged commit (d027c1f): it states
 * what the records (SPEC, D-0011, M-0010, FOUNDING-AUTHORITY, AGENTS.md)
 * require, and the failure is the evidence that the build does not hold it.
 * A test named "closed: …" PASSES: a door that was tried and found shut.
 *
 * Every person here is FICTIONAL, with an example.test address.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CostsPage from "@/app/(public)/costs/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RootNotFound from "@/app/not-found";
import { ControlList } from "@/components/public/ControlList";
import { FLOOR_RULES } from "@/components/public/floorRules";
import { LedgerView } from "@/components/public/LedgerView";
import { ENFORCEMENT_WORDS } from "@/components/public/RuleList";
import { SiteFooter, STATUS_LINE } from "@/components/RightColumn";
import { PROHIBITED, publicTextFiles, scanRepoPublicText, scanText } from "@/core/claims";
import { runningVersion } from "@/core/config";
import { runWeeklyDigest } from "@/core/digest";
import { signInEmail, joinEmail } from "@/core/mail-templates";
import { createPost, createReply, deleteReply } from "@/core/posts";
import { accounts, outbox, rateEvents } from "@/core/schema";
import {
  ledgerStatusWords,
  ledgerSummary,
  loadControl,
  loadLedger,
  parseLedger,
} from "@/core/transparency";
import { at, befriend, db, makeAccount, plus, post, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(WEB_ROOT, "..", "..");

const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
const readRepo = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

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

/** Every file under a directory, relative to WEB_ROOT, posix. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(join(WEB_ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** A throwaway apps/web shape for the scanner: the dirs and files it insists on. */
function scratchWebRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-verify-claims-"));
  mkdirSync(join(dir, "src/app"), { recursive: true });
  mkdirSync(join(dir, "src/components"), { recursive: true });
  mkdirSync(join(dir, "src/core"), { recursive: true });
  mkdirSync(join(dir, "transparency"));
  writeFileSync(join(dir, "src/core/mail-templates.ts"), "export {};\n");
  return dir;
}

/* ====================================================================== */
/* The claims scan                                                         */
/* ====================================================================== */

describe("claims scan: coverage of the prohibited list", () => {
  it("closed: the kernel's R-NO-FICTIONAL-OWNERSHIP patterns are all in PROHIBITED", () => {
    const kernel = readRepo("packages/kernel/src/rules.ts");
    const block = kernel.slice(kernel.indexOf("function noFictionalOwnership"));
    const list = block.slice(block.indexOf("const prohibited = ["), block.indexOf("];"));
    const sources = [...list.matchAll(/\/(.+)\/i,/g)].map((m) => m[1]);
    expect(sources.length).toBe(6);
    const ours = PROHIBITED.map((p) => p.pattern.source);
    for (const s of sources) expect(ours, s).toContain(s);
  });

  it("closed: every term SPEC §12 and D-0011 name is caught on a one-line sample", () => {
    for (const sample of [
      "OURS is not for sale.",
      "A user-owned network.",
      "A member-owned network.",
      "Become a co-owner.",
      "Owned by its users.",
      "It is owned by our members.",
      "The members own it.",
      "Ratified by the members.",
      "A tamper-proof log.",
      "A non-bypassable gate.",
      "The home you own.",
      "The network we own.",
      "Take a stake.",
      "Invest now.",
      "Equity for early people.",
      "Dividends every year.",
      "Moderators are well paid.",
      "Contributions are tax-deductible.",
      "This will spread.",
      "It went viral.",
      "An algorithm-free feed.",
      "There is no algorithm.",
    ]) {
      expect(scanText(sample, "src/app/(public)/page.tsx").length, sample).toBeGreaterThan(0);
    }
  });

  it("closed: a one-line claim injected into the real landing page is caught by the scan of that file", () => {
    const file = "src/app/(public)/page.tsx";
    const real = read(file);
    expect(scanText(real, file)).toEqual([]);
    const injected = real.replace(
      "<p className={styles.connect}>Connect with me on OURS.</p>",
      "<p className={styles.connect}>Connect with me on OURS.</p><p>OURS is not for sale.</p>",
    );
    expect(injected).not.toBe(real);
    expect(scanText(injected, file).map((h) => h.match)).toEqual(["not for sale"]);
  });

  it("DEFECT: a claim wrapped across a line break in JSX (as a formatter writes it) passes the scan", () => {
    // JSX collapses the newline and indentation to one space: the page
    // renders "OURS is a home that is not for sale". The scan reads the raw
    // file text, where the words are split by "\n        ".
    const dir = scratchWebRoot();
    try {
      writeFileSync(
        join(dir, "src/app/page.tsx"),
        [
          "export default function Page() {",
          "  return (",
          "    <p>",
          "      OURS is a home that is not for",
          "      sale. Contributions will be tax",
          "      deductible, and the people using it are",
          "      co-owners of it.",
          "    </p>",
          "  );",
          "}",
          "",
        ].join("\n"),
      );
      const { hits } = scanRepoPublicText(dir);
      const matched = hits.map((h) => h.match.toLowerCase().replace(/\s+/g, " "));
      expect(matched).toContain("co-owner"); // the one that fits on a line
      expect(matched, "the wrapped 'not for sale' should be a hit").toContain("not for sale");
      expect(matched, "the wrapped 'tax deductible' should be a hit").toContain("tax deductible");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("DEFECT: near forms of D-0011's own words pass the scan (co-own, co-owned, well-paid, owned by the people using it)", () => {
    // D-0011 prohibits "co-owner" and "any claim of ownership, in the
    // present tense". These are the same claims in the same words' family.
    const passing = [
      "The people using it co-own OURS.",
      "OURS is co-owned by everyone on it.",
      "Moderators are well-paid.",
      "OURS is owned by the people using it.",
      "A community-owned home for friends.",
    ].filter((s) => scanText(s, "src/app/(public)/page.tsx").length === 0);
    expect(passing, "present-tense ownership/pay claims the scan lets through").toEqual([]);
  });

  it("DEFECT: public strings in src/core and src/web (error messages, statements of reasons) are never scanned", () => {
    // A CoreError's message is shown to people verbatim (src/web/actions.ts
    // run(): `return { ok: false, error: error.message }`), and reports.ts
    // writes the removal notices people read. None of these files is read
    // by the scan, so "The claims scan finds no prohibited claim in any
    // public string" (M-0010 acceptance) is not what the scan checks.
    const scanned = new Set(publicTextFiles(WEB_ROOT));
    const speaking = [...filesUnder("src/core"), ...filesUnder("src/web")].filter((f) => {
      if (f === "src/core/claims.ts") return false; // the patterns themselves
      const text = read(f);
      return /\b(?:invalid|forbidden|notFound|conflict|closed|rateLimited)\(\s*["`]/.test(text) ||
        /new CoreError\(\s*["'][A-Z_]+["']\s*,\s*["`]/.test(text) ||
        /GENERIC_ERROR\s*=/.test(text);
    });
    expect(speaking.length).toBeGreaterThan(5);
    expect(speaking.filter((f) => !scanned.has(f)), "files with people-facing sentences the scan skips").toEqual([]);
  });

  it("DEFECT: a prohibited claim in a core error message is not a hit", () => {
    const dir = scratchWebRoot();
    try {
      writeFileSync(
        join(dir, "src/core/posts.ts"),
        'export function f() { throw invalid("Posting is limited. Invest in OURS to post more."); }\n',
      );
      const { hits } = scanRepoPublicText(dir);
      expect(hits.map((h) => h.match)).toContain("Invest");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ====================================================================== */
/* /costs                                                                   */
/* ====================================================================== */

describe("/costs and the ledger", () => {
  it("closed: transparency/ledger.json is exactly the JSON SPEC §11 says builders keep", () => {
    const spec = read("SPEC.md");
    const section = spec.slice(spec.indexOf("### `transparency/ledger.json`"));
    const block = section.slice(section.indexOf("```json") + 7, section.indexOf("```", section.indexOf("```json") + 7));
    expect(JSON.parse(read("transparency/ledger.json"))).toEqual(JSON.parse(block));
  });

  it("closed: the page shows every ledger entry with its status in words, and counts neither as received nor paid", () => {
    const html = renderToStaticMarkup(createElement(CostsPage));
    const text = textOf(html);
    const ledger = loadLedger();
    for (const e of ledger.entries) {
      expect(text).toContain(e.description);
      expect(text).toContain(ledgerStatusWords(e));
      expect(text).toContain(e.id);
      if (e.note) expect(text).toContain(e.note);
      if (e.repayable) expect(text).toContain(e.repayable);
    }
    const received = html.slice(html.indexOf('data-section="received"'), html.indexOf('data-section="paid"'));
    const paid = html.slice(html.indexOf('data-section="paid"'), html.indexOf('data-section="remaining"'));
    const remaining = html.slice(html.indexOf('data-section="remaining"'), html.indexOf('data-section="coming"'));
    for (const part of [received, paid, remaining]) {
      expect(part).not.toMatch(/\$\s?2,500|\$\s?700|\$\s?3,200/);
    }
    expect(textOf(received)).toContain("Nothing received yet.");
    expect(textOf(paid)).toContain("No costs recorded as paid yet.");
    expect(textOf(remaining)).toContain("Nothing received yet.");
    expect(text).toContain("Contributions: not open yet.");
    expect(text).toContain(
      "When they open, they'll be asked for as 'Support OURS'. They won't be tax-deductible unless the recipient qualifies, and they don't buy reach or a say.",
    );
    expect(text).toContain(ledger.unpaidWork);
    expect(text).toContain(ledger.scope);
    expect(text).toContain(STATUS_LINE);
  });

  it("closed: a RECORDED commitment and a CREDIT are never added to what was received", () => {
    const s = ledgerSummary(
      parseLedger({
        scope: "FICTIONAL",
        currency: "USD",
        contributions_open: false,
        unpaid_work: "FICTIONAL",
        entries: [
          { id: "L-0001", kind: "commitment", status: "RECORDED", date: "2026-09-24", description: "FICTIONAL pledge", amount: 900, evidence: null, note: null },
          { id: "L-0002", kind: "credit", status: "CREDIT", date: "2026-09-24", description: "FICTIONAL credit", amount: 300, evidence: null, note: null },
          { id: "L-0003", kind: "estimate", status: "ESTIMATE", date: "2026-09-24", description: "FICTIONAL estimate", amount: 50, evidence: null, note: null },
        ],
      }),
    );
    expect(s.received.total).toBe(0);
    expect(s.paid.total).toBe(0);
    expect(s.remaining).toBeNull();
  });

  it("DEFECT: a RECORDED expense with no evidence is accepted, counted as paid, and shown as 'recorded' beside 'none recorded yet'", () => {
    // D-0011 §C.2: "costs paid, with redacted evidence". control.json's
    // validator refuses a RECORDED row without evidence; the ledger's does not.
    const raw = {
      scope: "FICTIONAL",
      currency: "USD",
      contributions_open: false,
      unpaid_work: "FICTIONAL",
      entries: [
        { id: "L-0009", kind: "expense", status: "RECORDED", date: "2026-09-24", description: "FICTIONAL hosting bill", amount: 120, evidence: null, note: null },
      ],
    };
    let refused = false;
    try {
      const summary = ledgerSummary(parseLedger(raw));
      const html = renderToStaticMarkup(createElement(LedgerView, { summary }));
      const paid = textOf(html.slice(html.indexOf('data-section="paid"'), html.indexOf('data-section="remaining"')));
      // What a reader would see, recorded for the report:
      expect(paid).toContain("$120");
      expect(paid).toContain("recorded");
      expect(paid).toContain("none recorded yet");
    } catch (error) {
      if ((error as Error).name === "TransparencyError") refused = true;
      else throw error;
    }
    expect(refused, "a RECORDED contribution or expense must name its evidence").toBe(true);
  });
});

/* ====================================================================== */
/* /power and /privacy: nothing [CONFIRM] presented as fact                 */
/* ====================================================================== */

describe("/power", () => {
  it("closed: no [CONFIRM] or Ctrl AI detail from FOUNDING-AUTHORITY §4.1 reaches any public file", () => {
    const publicText = publicTextFiles(WEB_ROOT).map((f) => read(f)).join("\n");
    expect(publicText).not.toContain("[CONFIRM"); // case matters: `[confirming, …]` is React state
    for (const fact of [
      /Legalinc/i,
      /Continental Dr/i,
      /Newark/i,
      /New Castle/i,
      /C-Corporation/i,
      /file number/i,
      /incorporated on/i,
      /\bofficers?\b/i,
      /\bdirectors?\b/i,
    ]) {
      expect(publicText, String(fact)).not.toMatch(fact);
    }
  });

  it("closed: the rows agree with FOUNDING-AUTHORITY §4 and D-0011 §F, and the operator is only STATED", () => {
    const rows = Object.fromEntries(loadControl().map((r) => [r.asset, r]));
    expect(rows["The domain our.one"]?.who).toMatch(/founder's registrar account/);
    expect(readRepo("authority/FOUNDING-AUTHORITY.md")).toMatch(/\| `our\.one` \| founder \| founder's registrar account/);
    expect(rows["Money"]?.who).toBe("No account and nothing received");
    expect(readRepo("authority/FOUNDING-AUTHORITY.md")).toMatch(/treasury \/ bank \| none opened/);
    expect(rows["The operator"]?.status).toBe("STATED");
    expect(rows["The operator"]?.who).toMatch(/is proposed as the starting operator/);
    expect(rows["The operator"]?.who).toMatch(/not yet recorded/);
    expect(rows["If the founder stops"]?.status).toBe("NOT_YET_RECORDED");
    const html = renderToStaticMarkup(createElement(ControlList, { rows: loadControl() }));
    expect(textOf(html)).toContain("stated by the founder, not verified");
    // D-0011 §C.3's six subjects are all there.
    for (const asset of ["The domain our.one", "Hosting, database, email sending", "Releases", "Moderation", "Money", "The code"]) {
      expect(rows[asset], asset).toBeDefined();
    }
  });

  it("DEFECT: /privacy names a data controller while /power, on the same running instance, says none is named", () => {
    // The test environment names a FICTIONAL controller, as the README tells
    // every local run to do. /privacy reads the environment; /power reads a
    // static file. A reader of both pages is told two different things.
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const power = textOf(renderToStaticMarkup(createElement(ControlList, { rows: loadControl() })));
    const privacyNames = /The data controller — the person or body answerable for your data — is FICTIONAL Controller/.test(privacy);
    const powerSaysNone = /Data controller not yet recorded Not yet named/.test(power);
    expect(privacyNames).toBe(true); // recorded so the failure below is unambiguous
    expect(
      privacyNames && powerSaysNone,
      "/privacy and /power must not contradict each other about who the data controller is",
    ).toBe(false);
  });
});

describe("/privacy", () => {
  it("DEFECT: names the Czech data protection authority, a jurisdiction no record states (FOUNDING-AUTHORITY §3: jurisdiction [CONFIRM])", () => {
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const records = ["authority", "decisions", "mandates"].flatMap((d) =>
      readdirSync(join(REPO_ROOT, d))
        .filter((f) => f.endsWith(".md") || f.endsWith(".yaml"))
        .map((f) => readRepo(`${d}/${f}`)),
    );
    const recorded = records.some((t) => /czech|ÚOOÚ|uoou/i.test(t));
    expect(readRepo("authority/FOUNDING-AUTHORITY.md")).toMatch(/Jurisdiction of residence \| `\[CONFIRM\]`/);
    expect(recorded).toBe(false);
    expect(privacy, "a supervisory authority no record names is presented as fact").not.toMatch(/Czech|ÚOOÚ/);
  });

  it("closed: every table in src/core/schema.ts is described", () => {
    const schema = read("src/core/schema.ts");
    const tables = [...schema.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(tables.length).toBe(19);
    const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    const described: Record<string, string> = {
      accounts: "Your account",
      invites: "Invites",
      email_tokens: "Sign-in and join links",
      pending_joins: "Joining in progress",
      sessions: "Sessions",
      friend_requests: "Friend requests",
      friendships: "friendships",
      follows: "follows",
      blocks: "blocks",
      mutes: "mutes",
      posts: "Posts, replies and likes",
      replies: "Posts, replies and likes",
      likes: "Posts, replies and likes",
      reports: "Reports",
      notifications: "Notifications",
      rate_events: "Limits on repeated actions",
      outbox: "Test outbox",
      mail_log: "Email records",
      digest_deliveries: "Weekly email record",
    };
    for (const t of tables) {
      expect(described[t], `no plain-words entry chosen for ${t}`).toBeDefined();
      expect(privacy, t).toContain(described[t]!);
    }
    expect(privacy).toContain("No IP address and no device details.");
  });

  describe("with the database", () => {
    beforeEach(reset);

    it("DEFECT: says rate-limit entries are 'a scrambled code made from … your account', but post:/reply:/report:/invite:/friendreq: keys hold the raw account id", async () => {
      const privacy = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
      expect(privacy).toContain("A scrambled code made from your email address, your network address or your account, and a time.");
      const anna = await makeAccount({ displayName: "FICTIONAL Anna" });
      await createPost(db(), anna.id, { body: "A FICTIONAL post.", audience: "friends", now: at("2026-09-24T10:00:00Z") });
      const keys = (await db().select({ key: rateEvents.key }).from(rateEvents)).map((r) => r.key);
      expect(keys).toHaveLength(1);
      expect(keys[0], "the stored key should be scrambled, as /privacy says").not.toContain(anna.id);
    });
  });

  it("DEFECT: 'Who else receives your data' leaves out the administrator, who reads reported posts whatever their audience", () => {
    // /rules says so ("Admins can read reported content through the queue
    // only; it shows what was reported, whoever it was shared with"); the
    // privacy notice's list of who else receives your data does not.
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    const start = html.indexOf('id="privacy-others"');
    const others = textOf(html.slice(start, html.indexOf("</section>", start)));
    expect(others, "the recipients section").toMatch(/administrator|moderat/i);
  });

  describe("under a production configuration", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("DEFECT: still says 'Email provider: none yet' when the configuration sends mail through Resend", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("MAIL_TRANSPORT", "resend");
      vi.stubEnv("RESEND_API_KEY", "re_FICTIONAL");
      vi.stubEnv("MAIL_FROM", "ours@example.test");
      const html = renderToStaticMarkup(createElement(PrivacyPage));
      const start = html.indexOf('id="privacy-others"');
      const others = textOf(html.slice(start, html.indexOf("</section>", start)));
      expect(others, "the page is rendered per request from the environment, but the provider line is fixed text").not.toMatch(
        /Email provider none yet/,
      );
    });
  });
});

/* ====================================================================== */
/* /rules: each class stated truthfully                                     */
/* ====================================================================== */

describe("/rules", () => {
  const rule = (id: string) => FLOOR_RULES.flatMap((g) => g.rules).find((r) => r.id === id)!;

  it("closed: 'Admins can read reported content through the queue only' is asserted by the cited test (canSeePost is null for an admin)", () => {
    expect(rule("queue").tests).toContain("tests/moderation.test.ts");
    expect(read("tests/moderation.test.ts")).toMatch(/expect\(await canSeePost\(db\(\), admin\.id, p\.id\)\)\.toBeNull\(\)/);
  });

  it("closed: the claims rule is CHECKED, not ENFORCED, and says a pattern cannot read meaning", () => {
    expect(rule("claims").cls).toBe("CHECKED");
    expect(rule("claims").more).toMatch(/looks for words, not meaning/);
  });

  describe("with the database", () => {
    beforeEach(reset);

    it("DEFECT: 'Nobody can export, delete or edit anyone else's data' is labelled ENFORCED, yet a post's author deletes another person's reply", async () => {
      const r = rule("others-data");
      expect(r.cls).toBe("ENFORCED");
      expect(r.text).toBe("Nobody can export, delete or edit anyone else's data.");
      const author = await makeAccount({ displayName: "FICTIONAL Author" });
      const replier = await makeAccount({ displayName: "FICTIONAL Replier" });
      await befriend(author, replier);
      const p = await post(author, { at: at("2026-09-24T09:00:00Z") });
      const { id: replyId } = await createReply(db(), replier.id, p.id, {
        body: "A FICTIONAL reply that is the replier's own data.",
        now: at("2026-09-24T09:05:00Z"),
      });
      // If the sentence on /rules were true, this would be refused.
      await expect(deleteReply(db(), author.id, replyId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("DEFECT: ENFORCED rules are shown without the bound FOUNDING-AUTHORITY §6 requires: the founder can remove every check without notice", () => {
    // FOUNDING-AUTHORITY §6: "Every enforcement claim made here is bounded
    // by that fact, and saying so is a requirement rather than a disclaimer."
    // AGENTS.md §7: "this repository says so out loud".
    const page = read("src/app/(public)/rules/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    const shown = [
      page,
      ...Object.values(ENFORCEMENT_WORDS),
      ...FLOOR_RULES.flatMap((g) => g.rules.flatMap((r) => [r.text, r.more ?? ""])),
    ].join("\n");
    expect(FLOOR_RULES.flatMap((g) => g.rules).filter((r) => r.cls === "ENFORCED").length).toBeGreaterThan(10);
    expect(shown, "/rules must say the founder can change or remove these checks without notice").toMatch(
      /founder[^.]*(remove|change|turn off|switch off)[^.]*without notice|without notice[^.]*founder/i,
    );
  });

  it("DEFECT: the tests /rules names for 'blocking' and 'muting' do not assert parts of those rules", () => {
    // "stops new requests, follows, replies and likes between you" — replies
    // and likes across a block are asserted in posts.test.ts and
    // likes.test.ts, not in the cited blocks/visibility tests.
    // "It's private, and they aren't told" — asserted in
    // connections.test.ts, not in the cited feed/digest tests.
    const cited = (id: string) => rule(id).tests!.map((f) => read(f)).join("\n");
    const blocking = cited("blocking");
    const muting = cited("muting");
    const missing: string[] = [];
    if (!/createReply\(/.test(blocking)) missing.push("blocking: no cited test tries a reply across a block");
    if (!/toggleLike\(/.test(blocking)) missing.push("blocking: no cited test tries a like across a block");
    if (!/notifications/.test(muting)) missing.push("muting: no cited test checks that the muted person is not told");
    expect(missing).toEqual([]);
  });

  it("DEFECT: 'Every account is invited by a person' is labelled ENFORCED, but the founder script creates an account with no inviter", () => {
    expect(rule("invite-only").cls).toBe("ENFORCED");
    expect(rule("invite-only").text).toContain("Every account is invited by a person.");
    const script = read("scripts/seed-founder.ts");
    expect(script, "seed-founder.ts inserts an account with invitedBy: null").not.toMatch(/invitedBy:\s*null/);
  });
});

/* ====================================================================== */
/* The running version and the status line                                  */
/* ====================================================================== */

describe("the running version", () => {
  it("closed: the public footer shows the version and the status line", () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(textOf(html)).toContain(`Version: ${runningVersion()}`);
    expect(textOf(html)).toContain(STATUS_LINE);
  });

  it("DEFECT: the root not-found page shows no running version (control.json: 'shown at the bottom of every page')", () => {
    const code = loadControl().find((r) => r.asset === "The code")!;
    expect(code.who).toContain("The running version is shown at the bottom of every page.");
    const html = renderToStaticMarkup(createElement(RootNotFound));
    expect(textOf(html)).toContain(runningVersion());
  });

  it("DEFECT: below 1000px no signed-in page shows the running version (its only copy is in .aside, which is display:none)", () => {
    const css = read("src/app/globals.css");
    const base = css.slice(0, css.indexOf("@media (min-width: 700px)"));
    const asideHiddenAtBase = /\.nav,\s*\.aside\s*\{\s*display:\s*none;/.test(base);
    const appShell = [
      ...filesUnder("src/app/(app)"),
      "src/components/Nav.tsx",
      "src/components/TabBar.tsx",
      "src/components/PageHeader.tsx",
    ].filter((f) => /\.tsx?$/.test(f));
    const elsewhere = appShell.filter((f) => /runningVersion|SiteFooter/.test(read(f)));
    expect(asideHiddenAtBase).toBe(true);
    expect(elsewhere, "some signed-in element visible under 1000px must carry the version").not.toEqual([]);
  });

  it("DEFECT: static public pages freeze the version at build time, so one server shows two different versions", () => {
    // Observed on `next start` with OURS_VERSION=v0-FICTIONAL-runtime:
    // /, /privacy, /signin, /join, /i/… show v0-FICTIONAL-runtime, while
    // /power, /costs, /rules, /auth, /unsubscribe, /signin/goodbye show
    // "development build" — they were prerendered by `next build` (○).
    const layout = read("src/app/(public)/layout.tsx");
    const layoutDynamic = /export const dynamic\s*=\s*["']force-dynamic["']|connection\(\)|headers\(\)|cookies\(\)/.test(layout);
    const pages = filesUnder("src/app/(public)").filter((f) => f.endsWith("/page.tsx"));
    const frozen = layoutDynamic
      ? []
      : pages.filter((f) => {
          const t = read(f);
          return !/export const dynamic\s*=\s*["']force-dynamic["']|connection\(|headers\(|cookies\(|readSessionCookie|searchParams|params\b|getViewer|requireViewer/.test(t);
        });
    expect(frozen, "public pages whose footer version is fixed when the app is built").toEqual([]);
  });

  it("closed: the status line is D-0011 §B's, on /, /power, /rules and /costs, and in every public footer", () => {
    const d11 = readRepo("decisions/D-0011.md");
    expect(d11).toContain(
      "*Founder-led and\nfounder-funded at launch. Working toward control by the people using it.*",
    );
    expect(STATUS_LINE).toBe(
      "Founder-led and founder-funded at launch. Working toward control by the people using it.",
    );
    for (const f of ["src/app/(public)/page.tsx", "src/app/(public)/power/page.tsx", "src/app/(public)/rules/page.tsx", "src/app/(public)/costs/page.tsx"]) {
      expect(read(f), f).toContain("{STATUS_LINE}");
    }
    expect(read("src/app/(public)/layout.tsx")).toContain("<SiteFooter />");
  });
});

/* ====================================================================== */
/* The landing copy, plain words, external requests                         */
/* ====================================================================== */

describe("the landing page and product words", () => {
  it("closed: the landing copy is D-0011 §B's working copy, word for word", () => {
    const d11 = readRepo("decisions/D-0011.md");
    const quote = d11
      .slice(d11.indexOf("**Working copy for the v0 application**"), d11.indexOf("**The status line"))
      .split("\n")
      .filter((l) => l.startsWith("> "))
      .map((l) => l.slice(2))
      .join(" ")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(quote.startsWith("OURS · Stay connected. On our terms.")).toBe(true);
    const page = read("src/app/(public)/page.tsx");
    const article = page.slice(page.indexOf("<article"), page.indexOf("<section className={styles.invite}"));
    const body = article
      .replace(/<[^>]+>/g, " ")
      .replace(/\{" "\}/g, " ")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .replace(/ \./g, ".")
      .trim();
    expect(page).toContain('title: { absolute: "OURS · Stay connected. On our terms." }');
    expect(`OURS · ${body}`).toBe(quote);
  });

  it("closed: no mechanism words (compiler, mandate, governance, constitution) in any visible public or product string", () => {
    const offenders: string[] = [];
    for (const f of publicTextFiles(WEB_ROOT)) {
      const text = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/"path":\s*"[^"]*"/g, ""); // repository paths in control.json are link targets
      const m = text.match(/\b(compiler|mandates?|governance|constitution(al)?)\b/i);
      if (m) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it("closed: nothing is loaded from another site (CSP self-only, no web fonts, no remote CSS or scripts in source)", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/default-src 'self'/);
    expect(config).toMatch(/font-src 'self'/);
    expect(config).toMatch(/connect-src 'self'/);
    const all = [...filesUnder("src"), "next.config.ts"].filter((f) => /\.(tsx?|css)$/.test(f));
    const remote = all.filter((f) => {
      const t = read(f);
      return /next\/font|@import\s+url\(|url\(\s*["']?https?:|<script[^>]+src=\{?["']https?:|<link[^>]+href=\{?["']https?:[^"']*\.(css|woff2?)/.test(t);
    });
    expect(remote).toEqual([]);
  });

  it("closed: .env.example, copied as README says, names no controller (inline comments are not values)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ours-verify-env-"));
    try {
      writeFileSync(join(dir, ".env.local"), read(".env.example"));
      const out = spawnSync(
        process.execPath,
        [
          "-e",
          'const {loadEnvConfig}=require(require.resolve("@next/env",{paths:[require.resolve("next")]}));' +
            "for (const k of ['DATA_CONTROLLER','DATA_CONTROLLER_EMAIL']) delete process.env[k];" +
            "loadEnvConfig(process.argv[1], true, {info(){},error(){}});" +
            "console.log(JSON.stringify([process.env.DATA_CONTROLLER ?? '', process.env.DATA_CONTROLLER_EMAIL ?? '']))",
          dir,
        ],
        { cwd: WEB_ROOT, encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } as NodeJS.ProcessEnv },
      );
      expect(out.status, out.stderr).toBe(0);
      expect(JSON.parse(out.stdout.trim())).toEqual(["", ""]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ====================================================================== */
/* Mail never carries post text                                             */
/* ====================================================================== */

describe("mail", () => {
  beforeEach(reset);

  it("closed: after a weekly run, no outbox message contains any part of any post", async () => {
    const now = at("2026-09-24T09:00:00Z");
    const reader = await makeAccount({ displayName: "FICTIONAL Reader" });
    const writer = await makeAccount({ displayName: "FICTIONAL Writer" });
    await befriend(reader, writer);
    const bodies = [
      "FICTIONAL secret garden plans for Saturday morning",
      "FICTIONAL recipe: lentils, cumin and patience",
      "FICTIONAL https://example.test/a-link-in-a-post",
    ];
    for (const [i, body] of bodies.entries()) {
      await post(writer, { body, audience: "friends", at: plus.hours(now, -(i + 1)) });
    }
    const run = await runWeeklyDigest(db(), now);
    expect(run.sent).toBeGreaterThanOrEqual(1);
    const mail = await db().select().from(outbox);
    expect(mail.length).toBeGreaterThanOrEqual(1);
    for (const m of mail) {
      for (const body of bodies) {
        for (const word of body.split(/\s+/).filter((w) => w.length >= 6 && w !== "FICTIONAL")) {
          expect(`${m.subject}\n${m.body}`, word).not.toContain(word);
        }
      }
    }
    // The other two templates take no post at all.
    expect(signInEmail.length).toBe(1);
    expect(joinEmail.length).toBe(2);
    const [row] = await db().select().from(accounts).where(eq(accounts.id, reader.id));
    expect(row?.weeklyEmail).toBe(true);
  });
});

/* ====================================================================== */
/* The records about this build                                             */
/* ====================================================================== */

describe("the records about this build", () => {
  it("DEFECT: README says an independent verification is recorded in receipts/, but no receipt mentions M-0010", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/An independent\s+verification is recorded in `receipts\/`/);
    const receipts = ["builds", "conformance", "releases"].flatMap((d) =>
      readdirSync(join(REPO_ROOT, "receipts", d)).map((f) => readRepo(`receipts/${d}/${f}`)),
    );
    expect(receipts.some((t) => t.includes("M-0010"))).toBe(true);
  });

  it("DEFECT: control.json records 'Moderation: the founder, the only administrator' on a script that makes as many FICTIONAL administrators as it is run", async () => {
    await reset();
    const url = process.env.DATABASE_URL!;
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      USER: process.env.USER ?? "",
      DATABASE_URL: url,
      SESSION_SECRET: process.env.SESSION_SECRET!,
      DATA_CONTROLLER: "FICTIONAL Controller",
      DATA_CONTROLLER_EMAIL: "controller@example.test",
      APP_URL: "http://localhost:3000",
      NODE_ENV: "test",
    } as NodeJS.ProcessEnv;
    const tsx = join(WEB_ROOT, "node_modules/.bin/tsx");
    for (const [email, handle] of [
      ["first_admin@example.test", "fic_admin_one"],
      ["second_admin@example.test", "fic_admin_two"],
    ]) {
      const out = spawnSync(
        tsx,
        ["scripts/seed-founder.ts", "--email", email!, "--handle", handle!, "--name", "FICTIONAL Admin"],
        { cwd: WEB_ROOT, encoding: "utf8", env },
      );
      expect(out.status, out.stderr).toBe(0);
    }
    const admins = await db().select().from(accounts).where(eq(accounts.isAdmin, true));
    const row = loadControl().find((r) => r.asset === "Moderation")!;
    expect(row.status).toBe("RECORDED");
    expect(row.evidence?.map((e) => e.path)).toEqual(["apps/web/scripts/seed-founder.ts"]);
    expect(admins.every((a) => a.email.endsWith("@example.test"))).toBe(true);
    expect(admins.length, "the cited evidence keeps a single administrator").toBe(1);
  });
});
