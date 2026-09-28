/**
 * The rename (SPEC §18.5 and §18.8, Builder A; M-0011 acceptance: "No page
 * a person reads says OURS as the product's name; our.one is used
 * instead").
 *
 * - Rendered: every public page the tests can render, the footers, the
 *   layouts' names, and every mail template's subject and body.
 * - Written: every file the claims scan reads, with its comments taken
 *   out, so a string on a page no test renders (an error message, an
 *   aria-label) is read too.
 *
 * OURS stays where no person reads it: comments, the `[ours]` log prefix,
 * cookie names, and variable names such as OURS_VERSION.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
// /join waits for a request with `connection()`; here there is none to wait for.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

import AppNotFound from "@/app/(app)/not-found";
import ContractPage from "@/app/(public)/contract/page";
import CostsPage from "@/app/(public)/costs/page";
import InvitePage from "@/app/(public)/i/[code]/page";
import JoinPage from "@/app/(public)/join/page";
import PublicLayout from "@/app/(public)/layout";
import FrontPageRoute from "@/app/(public)/page";
import PowerPage from "@/app/(public)/power/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import RulesPage from "@/app/(public)/rules/page";
import GoodbyePage from "@/app/(public)/signin/goodbye/page";
import SignInPage from "@/app/(public)/signin/page";
import UnsubscribePage from "@/app/(public)/unsubscribe/page";
import ErrorPage from "@/app/error";
import { metadata as rootMetadata } from "@/app/layout";
import manifest from "@/app/manifest";
import RootNotFound from "@/app/not-found";
import { SHARE_TEXT } from "@/components/people/InviteCreator";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { RightColumn, SiteFooter } from "@/components/RightColumn";
import { publicTextFiles } from "@/core/claims";
import { closed } from "@/core/errors";
import { createInvite } from "@/core/invites";
import * as mailTemplates from "@/core/mail-templates";
import { loadControl } from "@/core/transparency";
import { db, makeAccount, reset } from "./helpers";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");

/** The product's old name as a word: not OURS_VERSION, not "ours" in a cookie or a URL. */
const OLD_NAME = /\bOURS\b/;

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const html = (element: ReactElement) => renderToStaticMarkup(element);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("no rendered public page, footer, email subject or body says OURS (SPEC §18.8)", () => {
  beforeEach(reset);

  /** Every public page and piece the tests can render, under the configuration in force. */
  async function rendered(): Promise<[string, string][]> {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inviter = await makeAccount({ handle: "anna_rn", displayName: "Anna FICTIONAL" });
    const { code } = await createInvite(db(), inviter.id, {});
    const params = (value: string) => ({ params: Promise.resolve({ code: value }) });
    return [
      ["/", html((await FrontPageRoute()) as ReactElement)],
      ["/contract", html(createElement(ContractPage))],
      ["/rules", html(createElement(RulesPage))],
      ["/privacy", html(createElement(PrivacyPage))],
      ["/power", html(createElement(PowerPage))],
      ["/costs", html(createElement(CostsPage))],
      ["/signin", html((await SignInPage({ searchParams: Promise.resolve({ signed_out: "1" }) })) as ReactElement)],
      ["/signin/goodbye", html(createElement(GoodbyePage))],
      ["/join", html((await JoinPage()) as ReactElement)],
      ["/i/<code>", html((await InvitePage(params(code))) as ReactElement)],
      ["/i/<unusable>", html((await InvitePage(params("FICTIONAL-unknown-code"))) as ReactElement)],
      ["/unsubscribe", html(createElement(UnsubscribePage))],
      ["not-found", html(createElement(RootNotFound))],
      ["not-found in the app", html(createElement(AppNotFound))],
      ["the error page", html(createElement(ErrorPage, { error: new Error("FICTIONAL"), reset: () => {} }))],
      ["the public layout", html(createElement(PublicLayout, null, "FICTIONAL page"))],
      ["the footer", html(createElement(SiteFooter))],
      ["the in-app footer", html(createElement(InAppSiteFooter))],
      ["the right column", html(createElement(RightColumn, { invitesRemaining: 3 }))],
    ];
  }

  it("under the test configuration, and with no data controller named", async () => {
    for (const env of [{}, { DATA_CONTROLLER: "", DATA_CONTROLLER_EMAIL: "" }]) {
      vi.unstubAllEnvs();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const pages = await rendered();
      expect(pages).toHaveLength(19);
      for (const [page, markup] of pages) {
        expect(textOf(markup).length, page).toBeGreaterThan(0);
        expect(markup, `${page}: ${JSON.stringify(env)}`).not.toMatch(OLD_NAME);
      }
      await reset();
    }
  });

  it("the pages that name the product call it our.one", async () => {
    const pages = Object.fromEntries(await rendered());
    const says = (page: string, words: string) => expect(textOf(pages[page]!), page).toContain(words);
    says("the public layout", "our.one");
    expect(pages["the public layout"]).toMatch(/<a [^>]*aria-label="our\.one, home"[^>]*>our\.one<\/a>/);
    says("/signin", "Sign in to our.one");
    says("/signin", "New here? our.one is invite-only");
    says("/join", "Join our.one");
    says("/i/<code>", "Anna FICTIONAL (@anna_rn) invited you to connect on our.one");
    says("/i/<code>", "Already on our.one?");
    says("/i/<unusable>", "About our.one");
    says("/privacy", "What our.one keeps about you");
    says("/costs", "What our.one has received");
    says("/costs", "'Support our.one'");
    says("/rules", "The rules our.one runs on");
    says("not-found", "Go to our.one");
    expect(pages["the footer"]).toContain('aria-label="About our.one"');
  });

  it("an invite link says 'our.one isn't open for new accounts yet.' while no data controller is named", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    const pages = Object.fromEntries(await rendered());
    expect(textOf(pages["/i/<code>"]!)).toContain("our.one isn't open for new accounts yet.");
    expect(textOf(pages["/join"]!)).toContain("our.one isn't open for new accounts yet.");
    expect(closed().message).toBe("our.one isn't open for new accounts yet.");
  });

  it("every mail template: subject and body say our.one, never OURS", () => {
    const url = "http://localhost:3000/auth#FICTIONAL";
    const mails = {
      signIn: mailTemplates.signInEmail(url),
      join: mailTemplates.joinEmail(url, "Anna FICTIONAL"),
      joinWithHandle: mailTemplates.joinEmail(url, "Anna FICTIONAL", "anna_f"),
      suspension: mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", "controller@example.test"),
      suspensionNoController: mailTemplates.suspensionEmail("FICTIONAL statement of reasons.", null),
      digest: mailTemplates.digestEmail(
        [{ name: "FICTIONAL Anna", posts: 2 }],
        "http://localhost:3000",
        "http://localhost:3000/unsubscribe#FICTIONAL",
      ),
    };
    for (const [name, mail] of Object.entries(mails)) {
      expect(mail.subject, name).not.toMatch(OLD_NAME);
      expect(mail.body, name).not.toMatch(OLD_NAME);
      expect(`${mail.subject}\n${mail.body}`, name).toContain("our.one");
    }
    // SPEC §18.5: "Invited you to OURS" becomes "invited you to our.one".
    expect(mails.joinWithHandle.subject).toBe("Anna FICTIONAL (@anna_f) invited you to our.one");
    expect(mails.joinWithHandle.body).toContain("Anna FICTIONAL (@anna_f) invited you to connect on our.one.");
    expect(mails.signIn.subject).toBe("Your sign-in link for our.one");
    expect(mails.signIn.body).toContain("Here's your link to sign in to our.one:");
    expect(mails.suspension.subject).toBe("Your our.one account is suspended");
    expect(mails.digest.subject).toBe("This week on our.one");
    expect(mails.digest.body).toContain("Open our.one: http://localhost:3000/home");
  });
});

describe("the names outside the pages", () => {
  it("the title, the web app manifest, the icon and the share text", () => {
    expect(rootMetadata.title).toEqual({ default: "our.one", template: "%s · our.one" });
    expect(manifest()).toMatchObject({ name: "our.one", short_name: "our.one" });
    expect(read("src/app/icon.svg")).toContain('aria-label="our.one"');
    expect(read("src/app/icon.svg")).not.toMatch(OLD_NAME);
    expect(SHARE_TEXT).toBe("Connect with me on our.one");
  });

  it("/power: 'The rules of our.one', the maintainer's row, and the status line (SPEC §18.5)", () => {
    const rows = loadControl(null);
    expect(rows.map((r) => r.asset)).toContain("The rules of our.one");
    expect(rows.map((r) => r.asset)).not.toContain("The operator");
    const maintainer = rows.find((r) => r.asset === "The maintainer")!;
    expect(maintainer.status).toBe("STATED");
    expect(maintainer.who).toBe(
      "The founder, through a company not yet confirmed. Ctrl AI, Inc. (Delaware) is proposed as the starting operator. Its authority, assets and responsibility for our.one are not yet recorded.",
    );
    expect(maintainer.evidence?.map((e) => e.path)).toEqual(["decisions/D-0012.md", "decisions/D-0011.md"]);
    const text = textOf(html(createElement(PowerPage)));
    expect(text).toContain("The maintainer stated by the founder, not verified The founder, through a company not yet confirmed.");
    expect(text).toContain("Maintained by its founder. Handed to its members at 100,000.");
  });

  it("OURS stays where no person reads it: the cookie names and the log prefix", () => {
    const session = read("src/web/session.ts");
    for (const name of ['"ours_session"', '"ours_join"', '"ours_invite"', "`__Host-${base}`"]) {
      expect(session, name).toContain(name);
    }
    expect(read("src/web/actions.ts")).toContain('"[ours] action failed:"');
  });
});

/* ------------------------------------------------------- what is written */

/**
 * A file's text with its comments blanked out, line breaks kept: block
 * comments, and line comments that start a line or follow a space (so
 * "https://" stays).
 */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * Sentences a person reads that still say OURS, in a file this build's
 * other builder owns (SPEC §18.10: src/core/invites.ts is Builder B's, and
 * this builder was told not to edit it). Each is listed by file and exact
 * sentence, so nothing else can pass behind it, and it is reported to the
 * architect: the rename there is not done in this commit.
 */
const RENAMED_ELSEWHERE: Readonly<Record<string, readonly string[]>> = {
  "src/core/invites.ts": ["OURS is for adults. Confirm that you're 18 or older."],
};

describe("no string a person reads says OURS, in any file the claims scan reads", () => {
  it("finds the old name where it is written, and lets a comment or OURS_VERSION through", () => {
    const found = (text: string) => OLD_NAME.test(withoutComments(text));
    expect(found('const A = "Welcome to OURS";')).toBe(true);
    expect(found("<p>Leave OURS</p>")).toBe(true);
    expect(found('<a aria-label="OURS, home" href="/">x</a>')).toBe(true);
    expect(found('{ "who": "None yet. OURS is not deployed." }')).toBe(true);
    expect(found("/** The OURS web app. */\nconst A = 1;")).toBe(false);
    expect(found("// OURS keeps this\nconst A = 1;")).toBe(false);
    expect(found('const v = env("OURS_VERSION");')).toBe(false);
    expect(found('const url = "https://example.test/ours"; // OURS')).toBe(false);
  });

  it("every .ts, .tsx and .json file the scan reads, and the icon", () => {
    const files = [...publicTextFiles(WEB_ROOT), "src/app/icon.svg"];
    expect(files.length).toBeGreaterThan(100);
    const left: string[] = [];
    for (const file of files) {
      const lines = withoutComments(read(file)).split("\n");
      lines.forEach((line, i) => {
        if (!OLD_NAME.test(line)) return;
        if ((RENAMED_ELSEWHERE[file] ?? []).some((sentence) => line.includes(sentence))) return;
        left.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(left).toEqual([]);
  });
});
