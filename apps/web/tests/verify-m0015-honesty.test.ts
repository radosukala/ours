/**
 * Independent verification of M-0015 (the framework pages), the honesty
 * lens. Written by an agent that did not build it, against 185bb67 (the
 * build; its records are 7e86388). It changes no product code, no record
 * and no other test.
 *
 * Stopping rule, declared before the first test was written. Every sentence
 * a person can read on /agreement, /projects and /maintainers, and the
 * changed parts of /contract, /privacy and the footer, rendered with and
 * without PROPOSALS_EMAIL and with and without a data controller, each read
 * against:
 *
 * 1. the records: AGENTS.md §6, §7, §9, §10 and §11; D-0011, D-0012,
 *    D-0013, D-0016 §N, D-0017, D-0018; M-0015's acceptance and
 *    constraints; P-0011 and its evidence;
 * 2. the code it describes: export.ts and deleteAccount (with a FICTIONAL
 *    database), config.ts, transparency/control.json and /power, the
 *    contract check in packages/kernel and its fixtures;
 * 3. the other pages that say who holds what: /contract, /power, /privacy;
 * 4. the claims scan: the three allowlisted sentences in other files,
 *    cases, punctuation, line breaks and JSX splits, and neighbouring forms
 *    of ownership, the handover told as done and income promised.
 *
 * - "DEFECT: (SEVERITY) …" asserts what should be true. It first asserts
 *   the records and the code it relies on, which pass; its last assertion
 *   FAILS on 185bb67, and that failure is the evidence.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Not checked here: whether GitHub serves the repository publicly today
 * (the records say it is public, D-0013 §F); legal questions (GDPR
 * Art. 13 recipients for an emailed proposal, Art. 28).
 *
 * Everyone here is FICTIONAL, with an example.test address.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgreementPage from "@/app/(public)/agreement/page";
import ContractPage from "@/app/(public)/contract/page";
import MaintainersPage from "@/app/(public)/maintainers/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import { HEADLINE } from "@/components/public/FrontPage";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import { LEDE } from "@/components/public/lede";
import { SiteFooter } from "@/components/RightColumn";
import { deleteAccount } from "@/core/accounts";
import { ALLOWLIST, formatHit, scanText } from "@/core/claims";
import { HANDOVER_THRESHOLD } from "@/core/config";
import { isCoreError } from "@/core/errors";
import { exportAccount } from "@/core/export";
import { newId } from "@/core/ids";
import { replies } from "@/core/schema";
import { befriend, db, makeAccount, post, reset } from "./helpers";

/* ------------------------------------------------------------- helpers */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WEB = fileURLToPath(new URL("../", import.meta.url));

const AGREEMENT_FILE = "src/app/(public)/agreement/page.tsx";
const PROJECTS_FILE = "src/app/(public)/projects/page.tsx";
const MAINTAINERS_FILE = "src/app/(public)/maintainers/page.tsx";
const CONTRACT_FILE = "src/app/(public)/contract/page.tsx";

const DEFINITION =
  "Owned by its users means: its users, together, decide its essential rules, approve its budget, and can change who runs it while the service keeps going.";
const APPLIES = "We call a service owned by its users only when all of that holds.";
const NO_SALE = "Neither a service nor any part of it will be sold, and nobody will invest in it for a return.";

/** A record as a reader reads it: markdown emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

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

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

/** The text of each <dd> after a <dt> with this label, in order. */
function ddAfter(markup: string, label: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`, "g");
  for (const m of markup.matchAll(re)) out.push(textOf(m[1]!));
  return out;
}

/** /agreement's sections, by their aria-labelledby id, in order. */
function sectionsOf(markup: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of markup.matchAll(/<section aria-labelledby="([a-z-]+)">([\s\S]*?)<\/section>/g)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/** Part 1's seven rights, each as its text, "Today:" line included. */
function userRights(): string[] {
  const section = sectionsOf(render(AgreementPage)).get("agreement-users") ?? "";
  return [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]!));
}

/** What a core call refused with: its CoreError code, or "allowed". */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    return isCoreError(error) ? error.code : String(error);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function renderedHits(html: string, file: string | null): string[] {
  return [...scanText(html, file), ...scanText(textOf(html), file)].map(formatHit);
}

const THE_THREE: [string, unknown][] = [
  ["/agreement", AgreementPage],
  ["/projects", ProjectsPage],
  ["/maintainers", MaintainersPage],
];

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on 185bb67)", () => {
  it("fixed: (HIGH) 'Whoever runs a service is paid directly by the people who choose it' and 'pay you directly' have no source; the holder keeps a protected service's funds (D-0017 §D) and /agreement's own Part 7 sends them to the holder", () => {
    // The records: the holder keeps the funds, and nothing says "directly".
    expect(record("decisions/D-0017.md")).toContain(
      "A holder keeps the name, the domain, the data, the deploy and the funds",
    );
    expect(record("decisions/D-0017.md")).toContain(
      `Promising builders income. "Can earn a living" stays conditional on people choosing and paying for the service.`,
    );
    for (const path of [
      "decisions/D-0017.md",
      "decisions/D-0018.md",
      "proposals/P-0011.md",
      "proposals/P-0011.evidence-conversation-2026-10-01-02.md",
    ]) {
      expect(record(path), path).not.toMatch(/\bdirectly\b/i);
    }
    // The same page: the funds go to the holder, and the feed's maintainer is unpaid.
    const agreement = textOf(render(AgreementPage));
    expect(agreement).toContain("its name, its data and its funds go to the holder");
    expect(agreement).toContain("The feed's maintainer is the founder, unpaid by choice.");
    // The defect.
    expect(agreement).not.toMatch(/\bpaid directly\b/);
    expect(textOf(render(MaintainersPage))).not.toMatch(/\bpay you directly\b/);
  });

  it("fixed: (HIGH) /projects says every service on our.one 'is a project, run under the common agreement' and lists what is 'In force' under it; the agreement is an unsigned draft that the feed 'will also run under' (/contract)", () => {
    expect(textOf(render(ContractPage))).toContain("The feed will also run under the common agreement");
    const agreement = textOf(render(AgreementPage));
    expect(agreement).toContain("No one has signed this agreement yet.");
    expect(agreement).toContain("The terms you join the feed under are the contract.");
    expect(record("decisions/D-0018.md")).toContain("The founder's review of its exact wording is PENDING.");
    const markup = render(ProjectsPage);
    // The defect: the present tense, and rights the contract holds filed under the draft.
    expect(textOf(markup)).not.toContain("is a project, run under the common agreement");
    for (const dd of ddAfter(markup, "Under the common agreement")) {
      if (/\bIn force\b/.test(dd)) expect(dd).toMatch(/\bcontract\b/);
    }
  });

  it("fixed: (MEDIUM) the data line is told as held today: 'the line nobody running a service crosses' and 'Seven safeguards hold that line', while none of the seven is built", () => {
    expect(record("decisions/D-0018.md")).toContain("Today none is built.");
    expect(record("decisions/D-0017.md")).toContain(`Public wording says "can't" only where code makes it true.`);
    const text = textOf(render(AgreementPage));
    expect(text).toContain("None of them is built yet");
    expect(text).not.toContain("the line nobody running a service crosses");
    expect(text).not.toContain("Seven safeguards hold that line");
  });

  describe("with a FICTIONAL database", () => {
    beforeEach(async () => {
      await reset();
    });

    it("fixed: (MEDIUM) 'Take your own data and leave … whenever you want', 'In force on the feed … in Settings', leaves out the suspended account, which can neither export nor delete; D-0016 §N fixed the same omission on the front page", async () => {
      const sam = await makeAccount({ handle: "sam_fictional", suspended: true });
      expect(await refusal(exportAccount(db(), sam.id))).toBe("NOT_FOUND");
      expect(await refusal(deleteAccount(db(), sam.id, sam.handle))).toBe("NOT_FOUND");
      expect(record("decisions/D-0016.md")).toContain("A suspended account can't reach Settings.");
      expect(textOf(render(ContractPage))).toContain(
        "If your account is suspended, write to us and we will do it for you.",
      );
      const item = userRights().find((i) => i.startsWith("Take your own data and leave"));
      expect(item).toContain("whenever you want");
      expect(item).toContain("Today: In force on the feed");
      // The defect.
      expect(item).toMatch(/suspended/);
    });
  });

  it("fixed: (MEDIUM) the risk no safeguard prevents is narrowed: D-0017 §I says misuse of what an app may 'show or send', which 'can be recorded'; the page says 'show you' and 'would be recorded'", () => {
    expect(record("decisions/D-0017.md")).toContain(
      "What no safeguard prevents: misuse of what an app may show or send. That can be recorded and challenged, not prevented.",
    );
    const text = textOf(render(AgreementPage));
    const start = text.indexOf("Even then,");
    const sentence = text.slice(start, text.indexOf("prevented.", start) + "prevented.".length);
    expect(sentence).toContain("could misuse");
    expect(sentence).toMatch(/\bsend\b/);
    expect(sentence).not.toContain("would be recorded");
  });

  it("fixed: (MEDIUM) /projects and /agreement say the founder runs the feed 'until the holder exists'; D-0017 §D and D-0018 §A say he holds it until then, the contract gives the right to replace him to the members' body at 100,000, and D-0017 §K.4 is open", () => {
    expect(record("decisions/D-0018.md")).toContain("the founder holds it until the holder exists.");
    expect(record("decisions/D-0017.md")).toContain(
      "Whether the feed's identity and connections move to the holder before 100,000. That would amend D-0012 §B and contract promise 2.",
    );
    expect(textOf(render(ContractPage))).toContain(
      `Until ${THRESHOLD} members I also hold the domain, the data and the keys`,
    );
    for (const [page, component] of [
      ["/projects", ProjectsPage],
      ["/agreement", AgreementPage],
    ] as const) {
      expect(textOf(render(component)), page).not.toMatch(
        /\bruns it until the holder exists\b|\brun by the founder until the holder exists\b/,
      );
    }
  });

  it("fixed: (MEDIUM) proposals open while no data controller is named: /maintainers links the address and /privacy says 'we keep your address and your message' beside 'The data controller is not yet named'", () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    const privacy = textOf(render(PrivacyPage));
    expect(privacy).toContain("The data controller is not yet named");
    // config.ts already gates the EU representative on a named controller;
    // proposals are not gated on it.
    expect(readFileSync(join(WEB, "src/core/config.ts"), "utf8")).toContain("if (!controller()) return null;");
    // The defect.
    expect(render(MaintainersPage)).not.toContain("mailto:");
    expect(privacy).not.toContain("If you email a proposal or a need");
  });

  it("fixed: (MEDIUM) the claims scan misses the active voice of the term this build defines ('Its users own it.', 'The users are its owners.'), and the defined phrase itself with a word in quotes or 'all' inserted", () => {
    expect(scanText("The feed is owned by its users.", PROJECTS_FILE).length).toBeGreaterThan(0);
    for (const claim of [
      "Its users own it.",
      "The people who use it own it.",
      "The users are its owners.",
      "our.one is owned by those who use it.",
      "The feed is people-owned.",
      "The feed is “owned” by its users.",
      "The feed is owned by its “users”.",
      'The feed will be "owned" by its users.',
      "The feed is owned by all its users.",
    ]) {
      expect(scanText(claim, PROJECTS_FILE).length, claim).toBeGreaterThan(0);
    }
  });

  it("fixed: (MEDIUM) Parts 3 ('What they give up') and 6 ('Money') of /agreement have no 'Today' line; the notice says each part has one, and so do D-0018 §B and M-0015's acceptance", () => {
    expect(record("mandates/M-0015.yaml")).toContain('every part has a "Today:" line');
    expect(record("decisions/D-0018.md")).toContain("Each part says what holds it today.");
    const markup = render(AgreementPage);
    expect(textOf(markup)).toContain("each part says what holds it today.");
    const parts = [...sectionsOf(markup).entries()].filter(([id]) => id !== "agreement-meaning");
    expect(parts.map(([id]) => id)).toEqual([
      "agreement-users",
      "agreement-maintainers",
      "agreement-gives-up",
      "agreement-data",
      "agreement-kinds",
      "agreement-money",
      "agreement-start",
      "agreement-feed",
    ]);
    expect(parts.filter(([, html]) => !/\bToday\b/.test(textOf(html))).map(([id]) => id)).toEqual([]);
  });

  it("fixed: (LOW) 'Your privacy stays yours' says only 'Today: Promised.', naming nothing that holds it; the only text that promises it is this unsigned draft", () => {
    const item = userRights().find((i) => i.startsWith("Your privacy stays yours"));
    expect(item).toBeDefined();
    const today = item!.slice(item!.indexOf("Today:"));
    expect(today).toMatch(/contract|law|code|not in force|draft/i);
  });

  // Fixed after the verification (D-0018's build, M-0015): Part 5 lists an
  // independent project only "if our.one lists it at all", and Part 7 sends a
  // *protected* service's name, data and funds to the holder. The search
  // string follows the fixed sentence; the assertions are the verifier's.
  it("fixed: (LOW) Part 5 no longer assumes independent projects get a page (D-0017 §K.7 is open), and Part 7 sends only a protected service's name, data and funds to the holder", () => {
    expect(record("decisions/D-0017.md")).toContain("Whether independent experiments are listed at all.");
    expect(record("decisions/D-0018.md")).toContain("listing independent experiments");
    const text = textOf(render(AgreementPage));
    expect(text).toContain("Whoever runs it holds everything: the accounts, the data and the name.");
    expect(text).not.toContain("its page says so");
    const start = text.indexOf("When the people who use a protected service first pay for it");
    expect(start).toBeGreaterThan(-1);
    expect(text.slice(start, text.indexOf("Today: proposals are read by hand"))).toMatch(/protected/);
  });

  it("fixed: (LOW) /agreement names Ctrl AI, Inc. as the feed's data controller from a literal, while /privacy names the configured controller or 'not yet named'; under any other setting the two pages disagree", () => {
    for (const [name, email] of [
      ["", ""],
      ["FICTIONAL Controller", "controller@example.test"],
    ]) {
      vi.stubEnv("DATA_CONTROLLER", name);
      vi.stubEnv("DATA_CONTROLLER_EMAIL", email);
      const privacy = textOf(render(PrivacyPage));
      const agreement = textOf(render(AgreementPage));
      expect(privacy, name || "(none)").not.toContain("Ctrl AI");
      if (agreement.includes("Ctrl AI, Inc. is the feed's data controller")) {
        expect(privacy, name || "(none)").toContain("Ctrl AI, Inc.");
      }
    }
  });

  it("fixed: (LOW) /projects says the feed is 'Run by Rado, the founder'; /power says 'Ctrl AI, Inc., the founder's company, is the maintainer' (D-0013 §A) and /contract 'me, Rado, through my company, Ctrl AI, Inc.'; D-0016 §N leaves the reading to the founder", () => {
    expect(record("decisions/D-0016.md")).toContain(
      `"Maintained by its founder." beside D-0013's naming of Ctrl AI, Inc. as the maintainer.`,
    );
    expect(textOf(render(ContractPage))).toContain(`Today that is me, ${MAINTAINER}, through my company, Ctrl AI, Inc.`);
    const runBy = ddAfter(render(ProjectsPage), "Run by")[0] ?? "";
    expect(runBy.startsWith(`${MAINTAINER}, the founder`)).toBe(true);
    // The defect: the pages that say who runs it disagree. (Passes once
    // either /power or /projects says what the other says.)
    if (textOf(render(PowerPage)).includes("Ctrl AI, Inc., the founder's company, is the maintainer")) {
      expect(runBy).toContain("Ctrl AI, Inc.");
    }
  });

  it("fixed: (LOW) /agreement and /projects make the 100,000 promise in their own copy and never say what happens if it is never reached, which D-0012 §D asks of every page that makes it", () => {
    expect(record("decisions/D-0012.md")).toContain("Every public page that makes the promise also says:");
    expect(record("decisions/D-0012.md")).toContain("what happens if the threshold is never reached.");
    for (const [page, component] of [
      ["/agreement", AgreementPage],
      ["/projects", ProjectsPage],
    ] as const) {
      const text = textOf(render(component));
      expect(text, page).toContain("go to a not-for-profit body of its members");
      // ("never gets the database" in the No keys safeguard is not this.)
      expect(text, page).toMatch(
        new RegExp(`never (?:gets|get) to ${THRESHOLD}|never reaches ${THRESHOLD}|is never reached|nothing is handed over`, "i"),
      );
    }
  });

  it("fixed: (LOW) the claims scan misses the handover told as done in other verbs or to 'the holder', and income promised outright (D-0017's prohibition)", () => {
    expect(
      scanText("Its domain, its data and the right to replace the maintainer went to a not-for-profit body of its members.", PROJECTS_FILE).length,
    ).toBeGreaterThan(0);
    for (const claim of [
      "Its domain, its data and the right to replace the maintainer moved to a not-for-profit body of its members.",
      "Its domain, its data and the right to replace the maintainer now belong to a not-for-profit body of its members.",
      "Its name, its data and its funds went to the holder.",
      "You'll be paid.",
      "You will earn a living from it.",
    ]) {
      expect(scanText(claim, MAINTAINERS_FILE).length, claim).toBeGreaterThan(0);
    }
  });

  it("fixed: (LOW) 'We don't judge whether it's a good idea: the people who would use it decide that.' commits the founder to a review policy no record adopts", () => {
    for (const path of [
      "decisions/D-0017.md",
      "decisions/D-0018.md",
      "proposals/P-0011.md",
      "proposals/P-0011.evidence-conversation-2026-10-01-02.md",
      "apps/web/SPEC.md",
    ]) {
      expect(record(path), path).not.toMatch(/good idea|don't judge|do not judge/i);
    }
    expect(record("decisions/D-0018.md")).toContain("Proposals and needs come by email and are read by hand.");
    expect(textOf(render(MaintainersPage))).not.toContain("We don't judge whether it's a good idea");
  });

  // Fixed after the verification: the closing sentence now names and links
  // the page's own source ("every change is a commit to its source"), and
  // right 5 links "the public records of every decision" to the decisions.
  it("fixed: (LOW) the agreement's records are linked: its own source, and the public records of every decision (AGENTS.md §10)", () => {
    const markup = render(AgreementPage);
    // The link's own words name what it opens (the rendering verification's link-name finding);
    // the sentence no longer says every change is a commit (the re-check's defect 8).
    expect(textOf(markup)).toContain("anyone can read its words in the agreement's source");
    expect(markup).toContain(
      'href="https://github.com/radosukala/ours/blob/main/apps/web/src/app/(public)/agreement/page.tsx"',
    );
    expect(markup).toContain('href="https://github.com/radosukala/ours/tree/main/decisions"');
    expect(render(PowerPage)).toContain(
      'href="https://github.com/radosukala/ours/blob/main/apps/web/transparency/control.json"',
    );
    expect(markup).toMatch(/href="https:\/\/github\.com\/radosukala\/ours\//);
  });
});

/* -------------------------------------------------------------- closed */

describe("closed (each passes on 185bb67)", () => {
  describe("with a FICTIONAL database", () => {
    beforeEach(async () => {
      await reset();
    });

    it("closed: 'In force on the feed: your profile, posts, replies and connections, in Settings': an active account's export holds them, and Settings has Export and Delete", async () => {
      const anna = await makeAccount({ handle: "anna_fictional" });
      const ben = await makeAccount({ handle: "ben_fictional" });
      await befriend(anna, ben);
      const p = await post(anna, { body: "A FICTIONAL post." });
      await db().insert(replies).values({ id: newId(), postId: p.id, authorId: anna.id, body: "A FICTIONAL reply." });
      const data = await exportAccount(db(), anna.id);
      expect(data.account.handle).toBe("anna_fictional");
      expect(data.posts.map((x) => x.body)).toEqual(["A FICTIONAL post."]);
      expect(data.replies.map((x) => x.body)).toEqual(["A FICTIONAL reply."]);
      expect(data.friends.map((x) => x.handle)).toEqual(["ben_fictional"]);
      expect(Object.keys(data)).toEqual(expect.arrayContaining(["following", "followers"]));
      for (const route of ["src/app/(app)/settings/export/route.ts", "src/app/(app)/settings/delete/page.tsx"]) {
        expect(existsSync(join(WEB, route)), route).toBe(true);
      }
      await deleteAccount(db(), anna.id, "anna_fictional");
      expect(await refusal(exportAccount(db(), anna.id))).toBe("NOT_FOUND");
    });
  });

  it("closed: 'Ctrl AI, Inc. is the feed's data controller' is what D-0013 §A records, and the page gives only its name and role (D-0013's limit)", () => {
    expect(record("decisions/D-0013.md")).toContain(
      "Ctrl AI, Inc., the founder's company, is our.one's maintainer and its data controller.",
    );
    const text = textOf(render(AgreementPage));
    expect(text.split("Ctrl AI").length - 1).toBe(1);
    expect(text).not.toMatch(/Delaware|registered office|file number|officer/i);
  });

  it("closed: 'A check for it exists in the project's open code, tested only on a fictional example': S-CONTRACT-DECLARED is in packages/kernel, its fixtures are FICTIONAL, and apps/web never calls it", () => {
    expect(readFileSync(join(ROOT, "packages/kernel/src/contract.ts"), "utf8")).toContain("S-CONTRACT-DECLARED");
    expect(record("decisions/D-0017.md")).toContain(
      "Static check S-CONTRACT-DECLARED exists, tested on a fixture only; runtime capability not built",
    );
    expect(record("communities/dilna-fixture/README.md")).toContain("a FICTIONAL community");
    expect(readdirSync(join(ROOT, "tests/fixtures/apps")).sort()).toEqual([
      "booking-leak",
      "booking-ok",
      "booking-overreach",
      "booking-raw",
    ]);
    for (const file of walk(join(WEB, "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/@ours\/kernel|checkContract|S-CONTRACT-DECLARED/);
    }
  });

  it("closed: 'the public records' are the repository D-0013 §F made public, and every footer's Open code link points into it", () => {
    expect(record("decisions/D-0013.md")).toContain("This makes the records, the code (Apache-2.0) and the receipts public");
    // Changed after the verification of M-0020 (H11): the in-app footer is gone; the app's panel (RightColumn) carries its one footer, at every width.
    for (const markup of [render(SiteFooter)]) {
      expect(markup).toContain('href="https://github.com/radosukala/ours/tree/main/apps/web"');
    }
  });

  it("closed: 'No one has signed this agreement yet': no record says anyone has, and D-0018 keeps its wording under the founder's review", () => {
    for (const name of readdirSync(join(ROOT, "decisions")).filter((n) => n.endsWith(".md"))) {
      expect(record(`decisions/${name}`), name).not.toMatch(
        /signed the common agreement|common agreement (?:is|was|has been) signed/i,
      );
    }
    expect(textOf(render(AgreementPage))).toContain("No one has signed this agreement yet.");
    expect(textOf(render(MaintainersPage))).toContain("No one has signed the common agreement yet");
  });

  it("closed: the three sentences of D-0018 §E pass only in agreement/page.tsx and only as written; other files, cases, punctuation or a missing full stop are caught; a wrapped or JSX-split copy there renders the same words", () => {
    // Changed after the re-check's fix: the file also lists the contract's never-reached sentence.
    expect(ALLOWLIST.filter((e) => e.file === AGREEMENT_FILE).map((e) => e.sentence)).toEqual([
      DEFINITION,
      APPLIES,
      NO_SALE,
      "If that count is never reached, nothing is handed over.",
    ]);
    for (const sentence of [DEFINITION, APPLIES, NO_SALE]) {
      expect(scanText(sentence, AGREEMENT_FILE), sentence).toEqual([]);
      for (const other of [PROJECTS_FILE, MAINTAINERS_FILE, CONTRACT_FILE, "src/components/RightColumn.tsx", "src/core/mail-templates.ts", null]) {
        expect(scanText(sentence, other).length, `${other}: ${sentence}`).toBeGreaterThan(0);
      }
      const variants = [
        sentence.toLowerCase(),
        sentence.toUpperCase(),
        sentence.replace(/\.$/, ""),
        sentence.replace(/\.$/, "!"),
        sentence.replace(/ /g, "  ").replace(/\.$/, " ."),
        sentence.replace(/(users|nobody)/, "$1’"),
      ];
      if (sentence.includes(", ")) variants.push(sentence.replace(", ", " — "));
      for (const variant of variants) {
        expect(variant).not.toBe(sentence);
        expect(scanText(variant, AGREEMENT_FILE).length, variant).toBeGreaterThan(0);
      }
    }
    // The same words, as a formatter or JSX writes them, render the same sentence.
    expect(scanText(DEFINITION.replace("means: ", "means:\n      "), AGREEMENT_FILE)).toEqual([]);
    expect(scanText(`{"Owned by its users"} ${DEFINITION.slice("Owned by its users ".length)}`, AGREEMENT_FILE)).toEqual([]);
    expect(scanText(`“${APPLIES}”`, AGREEMENT_FILE)).toEqual([]);
    // A page file is imported by nothing else, so the sentences stay on /agreement.
    // Changed after the fix of honesty 17: the page now names its own source
    // path, for the link in its last paragraph; the check reads imports only.
    const imports = /(?:from\s*|import\s*\(\s*)["'][^"']*\(public\)\/agreement\/page["']/;
    for (const file of walk(join(WEB, "src")).filter((f) => !f.endsWith("core/claims.ts"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(imports);
    }
  });

  it("closed: the three pages tell the handover only in the status line's form, 'go to', and never with 'have joined' (the footer's status line still says it; D-0016 §N leaves those words to the founder)", () => {
    for (const [page, component] of THE_THREE) {
      // Changed after the re-check's fix: the contract's never-reached sentence is the one
      // handover verb allowed, listed by exact text; nothing else tells the handover.
      const text = textOf(render(component))
        .replace("If that count is never reached, nothing is handed over, and the promise not to sell still holds.", "")
        .replace("If that count is never reached, nothing is handed over.", "");
      expect(text, page).not.toContain("have joined");
      expect(text, page).not.toMatch(/\bhand(?:s|ed|ing)? (?:it )?over\b|\bhanded\b|\btransferr|\bpasse[sd] to\b/i);
    }
    expect(textOf(render(SiteFooter))).toContain("have joined");
  });

  it("closed: the front page's headline and lede are unchanged (D-0015 §A, D-0016 §A; D-0018 §C)", () => {
    expect(HEADLINE).toEqual(["Just your people.", "Then you're done."]);
    expect(record("decisions/D-0015.md")).toContain(`"Just your people. Then you're done."`);
    expect(record("decisions/D-0016.md")).toContain(`"${LEDE}"`);
    expect(textOf(render(ProjectsPage))).toContain(LEDE);
  });

  it("closed: proposals and needs go by email only: /maintainers renders no form, field or button, its route holds only the page, and no table holds them", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    const markup = render(MaintainersPage);
    expect(markup).not.toMatch(/<form|<input|<textarea|<button|<select/);
    expect((markup.match(/href="mailto:proposals@example\.test\?subject=/g) ?? []).length).toBe(2);
    expect(readdirSync(join(WEB, "src/app/(public)/maintainers"))).toEqual(["page.tsx"]);
    // Changed under M-0021 (D-0024 §B): a table named `needs` now keeps the optional answers to "Which app would
    // you take back?" on the front door's form: words and a day, from no one in particular (tests/needs.test.ts).
    // They are not the proposals and needs a visitor emails to PROPOSALS_EMAIL (D-0018 §D), which still reach no
    // table: the schema is searched with that one table, its comment and its type left out, and nothing else in
    // it names a proposal or a need.
    const schema = readFileSync(join(WEB, "src/core/schema.ts"), "utf8");
    expect(schema).toMatch(/export const needs = pgTable\(\s*"needs"/);
    const without = schema
      .replace(/\/\*\*\n \* A named app \(D-0024[\s\S]*?\n\);\n/, "")
      .replace("export type Need = typeof needs.$inferSelect;\n", "");
    expect(without).not.toContain("export const needs");
    expect(without).not.toMatch(/proposal|\bneeds?\b/i);
  });

  it("closed: no safeguard reads as built: every sentence on the three pages that says 'built' also says not, none or yet", () => {
    for (const [page, component] of THE_THREE) {
      const sentences = textOf(render(component)).split(/(?<=[.!?:])\s+/);
      for (const s of sentences.filter((x) => /\bbuilt\b/i.test(x))) {
        expect(s, page).toMatch(/\b(?:not|none|no|yet)\b/i);
      }
    }
  });

  it("closed: who holds what today agrees across /agreement, /projects, /contract and /power: the founder holds the domain, the data and every key; nothing is deployed; no money is taken", () => {
    const agreement = textOf(render(AgreementPage));
    expect(agreement).toContain("Today the founder holds its domain, its data and its keys.");
    expect(agreement).toContain("Not built. The founder holds every key.");
    expect(ddAfter(render(ProjectsPage), "Held today")).toEqual(["The founder holds its domain, its data and its keys."]);
    expect(textOf(render(ContractPage))).toContain(`Until ${THRESHOLD} members I also hold the domain, the data and the keys`);
    const power = textOf(render(PowerPage));
    expect(power).toContain("The founder, through the founder's registrar account");
    // Changed under M-0018 (D-0021 §C): a copy that isn't the deployed site
    // says so, instead of "our.one is not deployed".
    expect(power).toContain("None: this copy of our.one isn't the deployed site.");
    expect(power).toContain("No account and nothing received");
    expect(agreement).toContain("our.one takes no money for anyone until the holder exists.");
    expect(record("decisions/D-0017.md")).toContain("No money moves through our.one until a holder exists.");
    expect(textOf(render(MaintainersPage))).toContain("there are no protected services besides the feed");
  });

  it("closed: no prohibited claim and no off-brand name on the three pages and the changed /contract, /privacy and footers, with and without the address", () => {
    for (const address of ["", "proposals@example.test"]) {
      vi.stubEnv("PROPOSALS_EMAIL", address);
      const rendered: [string, string, string | null][] = [
        ["/agreement", render(AgreementPage), AGREEMENT_FILE],
        ["/projects", render(ProjectsPage), PROJECTS_FILE], // a listed sentence since the re-check
        ["/maintainers", render(MaintainersPage), null],
        ["/contract", render(ContractPage), CONTRACT_FILE],
        ["/privacy", render(PrivacyPage), null],
        ["the footer", render(SiteFooter), null],
        // Changed after the verification of M-0020 (H11): the in-app footer is gone; the app's panel (RightColumn) carries its one footer, at every width.
      ];
      for (const [page, markup, file] of rendered) {
        expect(renderedHits(markup, file), `${address || "(none)"}: ${page}`).toEqual([]);
        expect(textOf(markup), page).not.toMatch(/\bOURS\b|OURS\.ORG|OURS Network|ours\.today|ours\.dev|Our\.one|OUR\.ONE/);
      }
    }
  });

  it("closed: 'first' and 'the one' on the three pages are about the framework's own projects (D-0017 §A, §D; D-0018 §A), never our.one against the world", () => {
    expect(record("decisions/D-0017.md")).toContain("The feed is the first project, under the same framework.");
    for (const [page, component] of THE_THREE) {
      const text = textOf(render(component));
      for (const s of text.split(/(?<=[.!?:])\s+/).filter((x) => /\bfirst\b|\bthe one\b/i.test(x))) {
        expect(s, page).toMatch(
          /first project|our first project|first pay|newest first|First comes|the one exception|the one service that runs before its data safeguards exist/,
        );
      }
    }
  });

  it("closed: the numbers come from their constants: 100,000 from HANDOVER_THRESHOLD, the name from MAINTAINER, 'Seven safeguards' lists seven, /contract keeps eight promises", () => {
    expect(HANDOVER_THRESHOLD).toBe(100_000);
    expect(THRESHOLD).toBe("100,000");
    const agreement = render(AgreementPage);
    const data = sectionsOf(agreement).get("agreement-data") ?? "";
    expect(textOf(data)).toContain("Seven safeguards");
    expect(data.match(/<h3\b/g)).toHaveLength(7);
    // Changed after the fix of honesty 13: the line names the company, as /contract and /power do.
    expect(ddAfter(render(ProjectsPage), "Run by")).toEqual([`${MAINTAINER}, the founder, through Ctrl AI, Inc., the founder's company`]);
    const contract = render(ContractPage);
    const list = contract.slice(contract.indexOf("<ol"), contract.indexOf("</ol>"));
    expect(list.match(/<li\b/g)).toHaveLength(8);
    expect(textOf(contract)).toContain(
      "These are the feed's terms. The feed will also run under the common agreement, which every service on our.one will sign. It is being developed in public.",
    );
  });
});
