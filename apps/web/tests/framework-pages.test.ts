/**
 * The framework pages (M-0015; D-0017, D-0018; SPEC §18.17): the common
 * agreement, the projects, "Build the next one", the footer's links, the
 * line on /contract and the paragraph on /privacy. Each acceptance line of
 * M-0015 has a test here or in the files it names; the denial paths are
 * tested first: nothing reads as in force or built that isn't, and no
 * address shows while the founder hasn't chosen one. FICTIONAL values only.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgreementPage, { metadata as agreementMeta } from "@/app/(public)/agreement/page";
import ContractPage from "@/app/(public)/contract/page";
import MaintainersPage, { metadata as maintainersMeta } from "@/app/(public)/maintainers/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage, { metadata as projectsMeta } from "@/app/(public)/projects/page";
import { MAINTAINER, THRESHOLD } from "@/components/public/handover";
import { InAppSiteFooter } from "@/components/public/InAppSiteFooter";
import { LEDE } from "@/components/public/lede";
import { SiteFooter } from "@/components/RightColumn";
import { scanText } from "@/core/claims";
import { proposalsEmail } from "@/core/config";

const AGREEMENT_FILE = "src/app/(public)/agreement/page.tsx";
const DEFINITION =
  "Owned by its users means: its users, together, decide its essential rules, approve its budget, and can change who runs it while the service keeps going.";
const APPLIES = "We call a service owned by its users only when all of that holds.";
const NO_SALE = "Neither a service nor any part of it will be sold, and nobody will invest in it for a return.";

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

const html = (component: (props: Record<string, never>) => unknown) =>
  renderToStaticMarkup(createElement(component as () => null));

/** The text of each <dd> after a <dt> with this label, in order. */
function ddAfter(markup: string, label: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<dt>${label}</dt><dd>([\\s\\S]*?)</dd>`, "g");
  for (const m of markup.matchAll(re)) out.push(textOf(m[1]!));
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proposalsEmail()", () => {
  it("is null when the setting is empty, blank, the placeholder or not an address", () => {
    for (const value of ["", "   ", "[CONFIRM]", "[ confirm: which inbox ]", "not-an-address", "a@b"]) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      expect(proposalsEmail(), JSON.stringify(value)).toBeNull();
    }
  });

  it("is the address once the founder sets one", () => {
    vi.stubEnv("PROPOSALS_EMAIL", " proposals@example.test ");
    expect(proposalsEmail()).toBe("proposals@example.test");
  });
});

describe("/agreement: being developed, and honest about it", () => {
  it("says first that nothing collective is in force, and gives the definition word for word", () => {
    expect(agreementMeta.title).toBe("The common agreement");
    const text = textOf(html(AgreementPage));
    expect(text).toContain(
      "Being developed. None of the collective rights below is in force yet, and each part says what holds it today.",
    );
    expect(text.indexOf("Being developed.")).toBeLessThan(text.indexOf(DEFINITION));
    expect(text).toContain(`${DEFINITION} Nobody can sell that away from them, and each person can always take their own data and leave.`);
    expect(text).toContain(`${APPLIES} None does yet.`);
    expect(text).toContain("This is about control. It isn't shares: there is nothing to trade, and nobody receives a payout.");
  });

  it("gives every right of the users a 'Today:' line, and only export and transparency read as in force", () => {
    const markup = html(AgreementPage);
    const section = markup.slice(markup.indexOf('id="agreement-users"'), markup.indexOf('id="agreement-maintainers"'));
    const items = [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]!));
    expect(items).toHaveLength(7);
    for (const item of items) expect(item, item).toMatch(/Today: /);
    const inForce = items.filter((i) => /Today: In force/.test(i));
    expect(inForce.map((i) => i.split(".")[0])).toEqual(["Take your own data and leave", "See the costs and the rules"]);
    for (const title of ["Decide its essential rules, together", "Approve its budget", "Change who runs it, and keep the service going"]) {
      expect(items.find((i) => i.startsWith(title)), title).toContain("Today: Not in force anywhere yet.");
    }
    expect(items.find((i) => i.startsWith("Nobody sells it"))).toContain(`${NO_SALE} Today: Promised. On the feed, held by the contract (promise 1).`);
  });

  it("marks each of the seven safeguards as not built or not yet, and none as built", () => {
    const markup = html(AgreementPage);
    const section = markup.slice(markup.indexOf('id="agreement-data"'), markup.indexOf('id="agreement-kinds"'));
    const names = [...section.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(names).toEqual(["The law", "The agreement", "No keys", "Reach", "Leave", "The record", "Custody"]);
    const today = ddAfter(section, "Today");
    expect(today).toHaveLength(7);
    for (const line of today) {
      expect(line, line).toMatch(/^(?:Not yet\.|Not built|Written here\. Nobody has signed it yet\.)/);
      expect(line, line).not.toMatch(/\b(?:is|are) built\b|\bin force\b/i);
    }
    const text = textOf(section);
    expect(text).toContain("Seven safeguards are meant to hold that line. None of them is built yet:");
    expect(text).toContain(
      "Until all seven exist for a service, it gets nothing of yours from our.one: no data, no connections, no sign-in. The feed is the one exception: the founder holds it, as the contract says. Whether it moves to the holder before the contract's count is reached is still open.",
    );
    expect(text).toContain("a service could misuse what it is allowed to show you or send. That can be recorded and challenged; it can't be prevented.");
  });

  it("states the feed's promise in the status line's form, never with 'have joined', and links onward", () => {
    const markup = html(AgreementPage);
    const text = textOf(markup);
    expect(text).toContain(
      `The contract promises: at ${THRESHOLD} people, as it counts them, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.`,
    );
    expect(text).not.toContain("have joined");
    expect(text).toContain(`Run by ${MAINTAINER}, the founder, through Ctrl AI, Inc., the founder's company. Unpaid, by choice.`);
    expect(text).toContain("If that count is never reached, nothing is handed over. The promise not to sell still holds.");
    expect(text).toContain("anyone can read its words in the agreement's source.");
    expect(text).not.toMatch(/holds it until the holder exists|keeps the feed's until/);
    for (const href of ["/maintainers", "/projects", "/contract"]) expect(markup).toContain(`href="${href}"`);
  });
});

describe("/projects: the feed as the first project", () => {
  it("shows the front page's lede, the maintainer, no pay, the costs, the promise and the exception", () => {
    expect(projectsMeta.title).toBe("Projects");
    const markup = html(ProjectsPage);
    const text = textOf(markup);
    expect(text).toContain(LEDE);
    expect(ddAfter(markup, "Run by")).toEqual([`${MAINTAINER}, the founder, through Ctrl AI, Inc., the founder's company`]);
    expect(ddAfter(markup, "Paid")).toEqual(["None, by choice"]);
    expect(markup).toContain('href="/costs"');
    expect(ddAfter(markup, "Held today")).toEqual(["The founder holds its domain, its data and its keys."]);
    expect(ddAfter(markup, "Promised")).toEqual([
      `At ${THRESHOLD} people, as the contract counts them, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members. If that count is never reached, nothing is handed over, and the promise not to sell still holds.`,
    ]);
    expect(ddAfter(markup, "Its users&#x27; rights today")[0]).toBe(
      "Held by the contract: taking your data and leaving (in Settings, or on request if your account is suspended), and seeing its costs and rules. Promised: nobody sells it. Not yet: deciding its rules, approving its budget, changing who runs it.",
    );
    expect(ddAfter(markup, "Its exception")[0]).toBe(
      "It is the one service that runs before its data safeguards exist. The founder holds it, as the contract says. Whether it moves to the holder before the contract's count is reached is still open.",
    );
    expect(text).toContain("Every service on our.one will be a project with a page like this one");
    for (const href of ["/maintainers", "/agreement", "/contract"]) expect(markup).toContain(`href="${href}"`);
    expect(text).not.toContain("have joined");
  });
});

describe("/maintainers: 'Build the next one'", () => {
  it("shows no address and says proposals open at launch while the founder hasn't chosen one", () => {
    expect(maintainersMeta.title).toBe("Build the next one");
    for (const value of ["", "[CONFIRM]", "not-an-address"]) {
      vi.stubEnv("PROPOSALS_EMAIL", value);
      const markup = html(MaintainersPage);
      expect(markup, JSON.stringify(value)).not.toContain("mailto:");
      const text = textOf(markup);
      expect(text).toContain("Proposals open at launch.");
      expect(text).toContain("This opens at launch, too.");
    }
  });

  it("links both invitations to the chosen address, each with its subject", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    const markup = html(MaintainersPage);
    expect(markup).toContain('href="mailto:proposals@example.test?subject=A%20proposal%20for%20our.one"');
    expect(markup).toContain('href="mailto:proposals@example.test?subject=A%20need%20for%20our.one"');
    const text = textOf(markup);
    expect(text).not.toContain("open at launch");
    expect(text).toContain("Send it to proposals@example.test.");
    expect(text).toContain("Write to proposals@example.test.");
  });

  it("says what the job is, what you get, what you give up, and where it stands, without promising income", () => {
    const text = textOf(html(MaintainersPage));
    expect(text).toContain("We're looking for people to build, improve and run the next ones, paid by the people who choose them, under the common agreement.");
    expect(text).toContain("Agreed pay, once the service is funded, for an agreed term, with a way to renew. Your pay is public.");
    expect(text).toContain("Money from anyone who expects a return from the service.");
    expect(text).toContain("We read every proposal by hand, and check it against the common agreement and the law.");
    expect(text).not.toContain("good idea");
    expect(text).toContain(
      "If people choose your service and pay for it, you're paid what your agreement says. our.one takes no money for anyone until the holder exists.",
    );
    expect(text).not.toContain("pay you directly");
    expect(text).toContain("It is meant to stay out of your reach");
    expect(text).toContain(
      "No one has signed the common agreement yet, there are no protected services besides the feed, and none of the data safeguards is built.",
    );
    expect(text).not.toMatch(/well[- ]paid|guarantee|you will earn|you'll earn/i);
  });
});

describe("the footers, /contract and /privacy", () => {
  it("every footer links to the agreement, the projects and 'Build with us'", () => {
    for (const markup of [html(SiteFooter), html(InAppSiteFooter)]) {
      expect(markup).toContain('<a href="/agreement">Agreement</a>');
      expect(markup).toContain('<a href="/projects">Projects</a>');
      // Changed by M-0016 (D-0019 §G): "Build with us" goes to /build, which links /maintainers.
      expect(markup).toContain('<a href="/build">Build with us</a>');
    }
  });

  it("/contract says the feed will also run under the common agreement, and links to it", () => {
    const markup = html(ContractPage);
    expect(textOf(markup)).toContain(
      "These are the feed's terms. The feed will also run under the common agreement, which every service on our.one will sign. It is being developed in public.",
    );
    expect(markup).toContain('<a href="/agreement">common agreement</a>');
  });

  it("/privacy describes emailed proposals only while an address is set", () => {
    vi.stubEnv("PROPOSALS_EMAIL", "");
    expect(textOf(html(PrivacyPage))).not.toMatch(/proposal/i);
    vi.stubEnv("PROPOSALS_EMAIL", "proposals@example.test");
    expect(textOf(html(PrivacyPage))).toContain(
      "If you email a proposal or a need to proposals@example.test, we keep your address and your message to answer you and to follow up, until you ask us to delete them. They aren't stored on our.one itself.",
    );
  });
});

describe("the claims scan and the agreement's three sentences (D-0018 §E)", () => {
  it("lets them through on /agreement and catches each one anywhere else", () => {
    for (const sentence of [DEFINITION, APPLIES, NO_SALE]) {
      expect(scanText(sentence, AGREEMENT_FILE), sentence).toEqual([]);
      for (const other of [
        "src/app/(public)/projects/page.tsx",
        "src/app/(public)/maintainers/page.tsx",
        "src/components/public/FrontPage.tsx",
        null,
      ]) {
        expect(scanText(sentence, other).length, `${other}: ${sentence}`).toBeGreaterThan(0);
      }
    }
  });

  it("still catches ownership claimed as present fact on /agreement itself", () => {
    for (const claim of ["The feed is owned by its users.", "This service is user-owned.", "It is not for sale."]) {
      expect(scanText(claim, AGREEMENT_FILE).length, claim).toBeGreaterThan(0);
    }
  });
});
