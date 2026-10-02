/**
 * Independent verification of M-0017 (the front door; D-0020, SPEC §18.19),
 * the honesty lens. Written by an agent that did not build it, against
 * cb1aadd (the build is e4e5637; the stopping rule is cb1aadd; the records
 * are 7675390). It changes no product code, no record and no other test.
 *
 * What was read, every sentence the build puts in front of a person or a
 * coding agent:
 *
 * - the front door (FrontDoor.tsx, door.ts, Diagram.tsx, Continuity.tsx,
 *   ServiceTabs.tsx, CopyLine.tsx) in every state, before and after the
 *   page's JavaScript runs;
 * - /feed (feed/page.tsx rendering FrontPage.tsx), against the front page
 *   as it was verified (`git show 25ce8f0`);
 * - /projects, /build, /maintainers, /privacy's new sentence, the public
 *   layout's header and footer;
 * - the drafts (drafts.ts, Draft.tsx), rendered as the browser draws them
 *   once the page's JavaScript runs (useHydrated mocked to true);
 * - kit/build.md's idea step and kit/README.md, against the tool
 *   (kit/our-one.mjs, run on FICTIONAL projects in a temporary folder),
 *   D-0017 §G and D-0019;
 * - the claims scan (src/core/claims.ts), on the new files and on the
 *   claims D-0020 prohibits.
 *
 * Each against the records: AGENTS.md §2, §6, §9 and §10;
 * FOUNDING-AUTHORITY; D-0015 to D-0020; P-0013 and its evidence; M-0017
 * and the amended M-0012; and against the pages the build didn't change
 * (/contract, /agreement, the invite page).
 *
 * - "DEFECT (SEVERITY): …" asserts what SHOULD be true. Any assertion before
 *   the last is evidence, and passes; the last FAILS on cb1aadd, and that
 *   failure is the finding. Each is written to pass once the defect is
 *   fixed, by whichever fix the finding allows.
 * - "closed: …" is a check that was tried and held. It passes.
 *
 * Severity, as earlier rounds used it: HIGH, something stated as in force,
 * built or approved that isn't; MEDIUM, a statement the code or the records
 * contradict, a layer of checking that silently doesn't run, or a page out
 * of step with its records; LOW, wording, polish, small gaps.
 *
 * Every person, project and address here is FICTIONAL. No network: the
 * routes run with the seats module and the Get in action mocked, and the
 * tool runs on folders in the system's temporary directory.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

const seats = vi.hoisted(() => ({
  memberCount: vi.fn<() => Promise<number>>(),
  seatState: vi.fn<() => Promise<{ open: number; waiting: number }>>(),
}));
vi.mock("@/core/seats", () => ({
  memberCount: seats.memberCount,
  seatState: seats.seatState,
  requestSeat: vi.fn(),
  openSeats: vi.fn(),
  forgetWaitlistAddress: vi.fn(),
}));
vi.mock("@/app/(public)/seat-actions", () => ({
  takeSeat: vi.fn(async () => ({ ok: true })),
}));

/**
 * Whether the page's JavaScript has run. False, as on the server and
 * without JavaScript, unless a test sets it: then the drafts' dialog, the
 * tabs and the illustration's button render as the browser draws them.
 */
const hydration = vi.hoisted(() => ({ ready: false }));
vi.mock("@/components/public/useHydrated", () => ({ useHydrated: () => hydration.ready }));

import AgreementPage from "@/app/(public)/agreement/page";
import BuildPage from "@/app/(public)/build/page";
import ContractPage from "@/app/(public)/contract/page";
import FeedPageRoute from "@/app/(public)/feed/page";
import PublicLayout from "@/app/(public)/layout";
import MaintainersPage from "@/app/(public)/maintainers/page";
import FrontDoorRoute from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import ProjectsPage from "@/app/(public)/projects/page";
import { CaughtUpMarker } from "@/components/Marker";
import { OPEN_CODE_URL, STATUS_LINE } from "@/components/RightColumn";
import {
  AGENT_FOOT,
  AUDIENCE_NOTE,
  BUILD_EXCHANGE,
  BUILD_LEDE,
  BUILD_LIMIT,
  BUILD_PAY,
  BUILD_STEPS,
  BUILD_TERMS,
  DOOR_EYEBROW,
  DOOR_STATUS,
  ILLUSTRATION,
  IDEA_CLOSE,
  IDEA_TEXT,
  OPEN_FOOT,
  OPEN_INTRO,
  OPEN_ROWS,
  OURS_LEDE,
  OURS_RIGHTS,
  OURS_STATUS,
  PART_INTRO,
  PART_OPTIONS,
  POSSIBILITIES,
  POSSIBILITY_LABEL,
  STRIP_LINE,
  TAGLINE,
  WORK_NOTE,
  partFoot,
} from "@/components/public/door";
import { DraftButton } from "@/components/public/Draft";
import { DRAFT_CLOSE, DRAFT_FALLBACK, DRAFT_KINDS, MAILTO_LIMIT, draftMailto, draftText } from "@/components/public/drafts";
import { FrontDoor, type FrontDoorProps } from "@/components/public/FrontDoor";
import { PREVIEW_LAST_VISIT, PREVIEW_NOW } from "@/components/public/FeedPreview";
import { countLine, JOIN_LABEL } from "@/components/public/join";
import { LEDE } from "@/components/public/lede";
import { PLACES } from "@/components/public/PublicNav";
import { publicTextFiles, scanKitText, scanText } from "@/core/claims";
import { AGENT_LINE } from "@/core/kit-info";

/* ------------------------------------------------------------- helpers */

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TOOL = join(ROOT, "kit", "our-one.mjs");

/** The build, and the commits it is read against. */
const BUILD = "e4e5637";
const M0016_FINAL = "b1c9c11";
const FRONT_PAGE_VERIFIED = "25ce8f0";

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const readRoot = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const BUILD_MD = readRoot("kit/build.md");

/** A record as a reader reads it: quote marks, emphasis and code marks dropped, whitespace collapsed. */
function record(path: string): string {
  return readRoot(path).replace(/^>\s?/gm, "").replace(/[*`]/g, "").replace(/\s+/g, " ");
}

/** A file as it was at a commit (git, local only). */
function gitShow(commit: string, path: string): string {
  const r = spawnSync("git", ["show", `${commit}:${path}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git show ${commit}:${path} failed: ${r.stderr}`);
  return r.stdout;
}

/** A git command's output lines. `git grep` exits 1 when nothing matches: that is no lines, not a failure. */
function gitLines(args: string[]): string[] {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status === 1 && args[0] === "grep" && r.stderr === "") return [];
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.split("\n").filter((l) => l.trim() !== "");
}

function decode(s: string): string {
  return s
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Visible text of rendered HTML: every tag a space, entities decoded. */
function textOf(html: string): string {
  return decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

const render = (component: unknown) => renderToStaticMarkup(createElement(component as () => null));

function renderDoor(props: Partial<FrontDoorProps> = {}): string {
  return renderToStaticMarkup(
    createElement(FrontDoor, { joining: true, email: null, count: 12, seatsOpen: 3, seatsWaiting: 0, ...props }),
  );
}

/** The HTML of the <section> with this id. */
function section(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  if (at === -1) return "";
  const start = html.lastIndexOf("<section", at);
  return html.slice(start, html.indexOf("</section>", start));
}

/** Every <a> in this HTML, as [text, href]. */
function links(html: string): [string, string][] {
  return [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [textOf(m[2]!), decode(m[1]!)]);
}

/** A draft's button as the browser draws it once the page's JavaScript runs: the button and its dialog. */
function hydratedDraft(kind: "need" | "idea", email: string | null): string {
  hydration.ready = true;
  try {
    return renderToStaticMarkup(createElement(DraftButton, { kind, label: kind === "need" ? "Draft a need" : "Draft an idea", email }));
  } finally {
    hydration.ready = false;
  }
}

/** Every string literal in a .ts file's source, as written (quotes dropped, escapes as they are). */
function literals(source: string): string[] {
  return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => (m[1] ?? m[2] ?? "").replace(/\\'/g, "'"));
}

const made: string[] = [];

/** A FICTIONAL project in a temporary folder, with these files and a git repository. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ours-verify-m0017-"));
  made.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

/** The tool, as an agent runs it: `node our-one.mjs <args> --project <dir>`. */
function runTool(dir: string, args: string[]) {
  const r = spawnSync(process.execPath, [TOOL, ...args, "--project", dir], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
  seats.memberCount.mockReset();
  seats.seatState.mockReset();
  seats.memberCount.mockResolvedValue(12);
  seats.seatState.mockResolvedValue({ open: 3, waiting: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  hydration.ready = false;
  while (made.length > 0) rmSync(made.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ------------------------------------------------------------- defects */

describe("defects (each FAILS on cb1aadd)", () => {
  it("DEFECT (MEDIUM): the invite page's link 'The promise behind our.one' still goes to /#front-runs, but / is now the front door, which has no #front-runs and carries no promise: the section on who runs it, with the signed card and the handover, moved to /feed (D-0016 §I sends the link 'to the section on who runs it'; the build moved the section and left the link, and the older tests still pass because they look for the anchor in FrontPage, not at the address the link names)", async () => {
    const source = read("src/app/(public)/i/[code]/page.tsx");
    const link = /<Link href="([^"]+)"[^>]*>\s*The promise behind our\.one\s*<\/Link>/.exec(source);
    expect(link).not.toBeNull();
    const href = link![1]!;
    expect(record("decisions/D-0016.md")).toContain('a link, "The promise behind our.one", to the section on who runs it (/#front-runs)');

    // The section is on /feed: the heading, the card and the handover.
    const feed = renderToStaticMarkup((await FeedPageRoute()) as ReactElement);
    expect(feed).toContain('<h2 id="front-runs">Keep your people. Change who runs it.</h2>');
    expect(textOf(feed)).toContain("Until then, I hold all three.");

    // / is the front door: no such section, and no promise to land on.
    const door = renderToStaticMarkup((await FrontDoorRoute()) as ReactElement);
    expect(door).not.toContain('id="front-runs"');
    expect(textOf(door)).not.toMatch(/I hand over|I hold all three/);

    // The defect: the page the link names doesn't carry the section it names.
    const [path, anchor] = href.split("#");
    const byPath: Record<string, string> = { "/": door, "/feed": feed };
    expect({ href, lands: (byPath[path ?? ""] ?? "").includes(`id="${anchor}"`) }).toEqual({ href, lands: true });
  });

  it("DEFECT (MEDIUM): the illustration's last words, shown once a visitor presses 'Appoint a successor', say 'no one holds the right to make it yet'; the founder holds it — /feed's signed card says 'I hand over … the right to replace me … Until then, I hold all three.', D-0016 §N gives the founder's bootstrap authority as its source ('nobody else holds it today'), and FOUNDING-AUTHORITY §5 lets the founder 'appoint and remove stewards and operators' — so the front door tells a stranger that nobody can change who runs the feed, the reverse of what holds today", async () => {
    expect(ILLUSTRATION.done).toContain("An illustration");
    expect(record("decisions/D-0016.md")).toContain(
      "For the right to replace the maintainer, the source is the founder's bootstrap authority (AGENTS.md §2, authority/FOUNDING-AUTHORITY.md): nobody else holds it today.",
    );
    expect(record("authority/FOUNDING-AUTHORITY.md")).toContain("appoint and remove stewards and operators;");
    const feed = textOf(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    expect(feed).toContain("the right to replace me to a not-for-profit body of its members. Until then, I hold all three.");

    // The defect.
    expect(ILLUSTRATION.done).not.toMatch(/\b(?:no one|nobody|no-one) holds the right\b/i);
  });

  it("DEFECT (MEDIUM): 'What we mean by ours' lists 'Anyone can take their own data and leave.' and 'What it costs, and what its maintainer is paid, is public.', then says 'None of it is in force: today, the founder decides.'; both hold on the feed today — /agreement says 'In force on the feed' for each, and the same front door says the feed's 'costs are public' — so the status tells a visitor they can't take their data from the feed (D-0017 §B says none of the *collective* rights is in force)", () => {
    const ours = textOf(section(renderDoor(), "ours"));
    expect(ours).toContain("Anyone can take their own data and leave.");
    expect(ours).toContain("What it costs, and what its maintainer is paid, is public.");
    expect(ours).toContain(OURS_STATUS);

    const agreement = textOf(render(AgreementPage));
    expect(agreement).toMatch(/Take your own data and leave\. Download it, and delete it all, whenever you want\. Today: In force on the feed/);
    expect(agreement).toMatch(/See the costs and the rules\. [^.]*\. Today: In force on the feed/);
    expect(textOf(section(renderDoor(), "open"))).toContain("Its code is open and its costs are public.");
    expect(record("decisions/D-0017.md")).toContain("None of the collective rights is in force on our.one yet.");

    // The defect: a status over rights that are in force says none of them is.
    expect(OURS_STATUS).not.toMatch(/\bnone of it is in force\b/i);
  });

  it("DEFECT (MEDIUM): 'The feed runs under the same framework as every project after it.' puts in the present what the feed's own terms put in the future — /contract: 'The feed will also run under the common agreement … It is being developed in public.'; /projects: 'The common agreement they will run under is being developed.' — the claim M-0015's verification found HIGH on /projects ('run under the common agreement'). D-0017 §A's 'under the same framework' is the nearest record; 'every project after it' is an absolute about projects that don't exist (AGENTS.md §10)", () => {
    const projects = textOf(section(renderDoor(), "projects"));
    expect(projects).toContain("Today the founder holds its domain, its data and its keys.");
    expect(textOf(render(ContractPage))).toContain(
      "These are the feed's terms. The feed will also run under the common agreement, which every service on our.one will sign. It is being developed in public.",
    );
    expect(textOf(render(ProjectsPage))).toContain("The common agreement they will run under is being developed.");
    expect(read("tests/verify-m0015-honesty.test.ts")).toContain("(HIGH) /projects says every service on our.one 'is a project, run under the common agreement'");
    expect(OPEN_ROWS.find((r) => r.state === "Draft")?.detail).toBe("Nobody has signed it, and none of its collective rights is in force.");

    // The defect: present tense.
    expect(textOf(renderDoor())).not.toMatch(/\bThe feed (?:runs|is run|operates) under\b/);
  });

  it("DEFECT (MEDIUM): the claims scan has no rule for D-0020's first prohibition — 'Saying that user control, the holder or any safeguard exists before it does' — so 'User control is built.', 'The holder now holds your data.', 'The data safeguards are built.' and 'Your data is protected by our.one.' all pass it, while M-0017's acceptance leans on the scan ('finds no prohibited claim'); the front door's own test checks a regex on / only, not on /build, /projects, /maintainers, the drafts or build.md (the kit's own check knows 'protected by our.one'; the site's doesn't)", () => {
    expect(record("decisions/D-0020.md")).toContain("Saying that user control, the holder or any safeguard exists before it does.");
    expect(readRoot("mandates/M-0017.yaml")).toContain("The claims scan reads every new page and component and finds no prohibited claim.");
    // The pages' own denials pass, as they must after any fix.
    for (const denial of [
      DOOR_STATUS,
      BUILD_LIMIT,
      "Not built yet.",
      "No one has signed the common agreement yet, there are no protected services besides the feed, and none of the data safeguards is built.",
      "The safeguards that would hold the line while a service runs, such as no keys for whoever runs it and a record of every read, aren't built yet.",
    ]) {
      expect(scanText(denial, null), denial).toEqual([]);
    }

    // The defect: the claims themselves pass too.
    const claims = ["User control is built.", "The holder now holds your data.", "The data safeguards are built.", "Your data is protected by our.one."];
    expect(claims.filter((c) => scanText(c, null).length === 0)).toEqual([]);
  });

  it("DEFECT (LOW): the claims scan's 'it's ours' rule (D-0012 dropped the phrase) sees only those words side by side, so 'It's already ours.', 'It is now ours.', 'The feed is ours.' and 'our.one is ours.' pass, while D-0020 made 'ours' the message's word and puts it on every public page ('The software we live in should be ours.' in every footer)", () => {
    expect(scanText("It's ours.", null).map((h) => h.match)).toEqual(["It's ours"]);
    // The message's own sentences pass, as they must after any fix.
    for (const s of [TAGLINE, DOOR_EYEBROW, `${IDEA_CLOSE[0]} ${IDEA_CLOSE[1]}`, "What we mean by ours"]) expect(scanText(s, null), s).toEqual([]);

    // The defect.
    const slip = ["It's already ours.", "It is now ours.", "The feed is ours.", "our.one is ours."];
    expect(slip.filter((s) => scanText(s, null).length === 0)).toEqual([]);
  });

  it("DEFECT (LOW): with PROPOSALS_EMAIL unset the dialog has no email button — right — but its note still says 'email opens your own email app, and you decide whether to send it', describing a way to send that isn't there; the front door's last line and /privacy follow the setting, the dialog's note doesn't (D-0018 §D: while the setting is empty, the pages show no way to send)", () => {
    const none = hydratedDraft("need", null);
    const withAddress = hydratedDraft("need", "ideas@example.test");
    expect(none).toContain("<dialog");
    expect(none).not.toContain("Open in my email");
    expect(withAddress).toContain("Open in my email");
    expect(partFoot(false)).not.toMatch(/\bemail\b/i);
    expect(textOf(renderToStaticMarkup(createElement(PrivacyPage)))).toContain("it's gone when you close or reload the page, unless you copy it.");

    // The defect.
    expect(textOf(none)).not.toMatch(/\bemail opens\b|\byour own email app\b|\bopen it in your (?:own )?email\b/i);
  });

  it("DEFECT (LOW): with the address set, the front door's last line reads 'A draft stays in your browser until you copy it, or send it from your own email. A person reads every one.' — 'every one' is every draft, and nobody reads a draft that stays in the browser; it means every one that is sent", () => {
    expect(partFoot(true)).toMatch(/^A draft stays in your browser until you copy it/);
    expect(textOf(section(renderDoor({ email: "ideas@example.test" }), "part"))).toContain(partFoot(true));

    // The defect.
    expect(partFoot(true)).not.toMatch(/\bA person reads every one\.$/);
  });

  it("DEFECT (LOW): build.md's step 2 tells the agent to use the PITCH.md headings 'because `init` and the check expect them'; neither does — the check reads PITCH.md only for the word TODO (a FICTIONAL PITCH.md with none of the headings is 'written'), and init leaves any PITCH.md as it is — so an agent is told the check reads the proposal's parts, which it doesn't", () => {
    const step2 = flat(BUILD_MD.slice(BUILD_MD.indexOf("## 2. Draft the idea"), BUILD_MD.indexOf("## 3. Get the tool")));
    expect(step2).toContain("Use these headings, in this order");
    const pitch = "# A FICTIONAL idea\n\nA FICTIONAL choir wants a shared rehearsal calendar.\n";
    const dir = project({ "PITCH.md": pitch });
    const report = JSON.parse(runTool(dir, ["check", "--json"]).stdout) as { pitch: string };
    expect(report.pitch).toBe("written");
    expect(runTool(dir, ["init"]).status).toBe(0);
    expect(readFileSync(join(dir, "PITCH.md"), "utf8")).toBe(pitch);
    expect(readFileSync(TOOL, "utf8")).toContain('return /\\bTODO\\b/.test(text) ? "todo" : "written";');

    // The defect.
    expect(step2).not.toMatch(/because `?init`? and the check expect them/);
  });

  it("DEFECT (LOW): build.md's 'find out first' branch says 'stop here. Help them put the draft in front of the people it would serve', and question 9 suggests 'a trial they could offer', but nothing says that finding out writes no code and keeps no one's data; the rules, the check and the hook arrive only in step 3, so a coding agent that reads 'help them put the draft in front of people' as a sign-up page or a form collects addresses before any rule applies", () => {
    const step2 = flat(BUILD_MD.slice(BUILD_MD.indexOf("## 2. Draft the idea"), BUILD_MD.indexOf("## 3. Get the tool")));
    expect(step2).toContain("To find out first:** stop here. Help them put the draft in front of the people it would serve.");
    expect(flat(BUILD_MD)).toContain("or a trial they could offer?");
    expect(BUILD_MD.indexOf("node scripts/our-one.mjs init")).toBeGreaterThan(BUILD_MD.indexOf("## 3. Get the tool"));

    // The defect: the branch says neither.
    const branch = step2.slice(step2.indexOf("To find out first:"), step2.indexOf("If they have code already"));
    expect({
      noCode: /\bno code\b|\bwithout (?:writing )?(?:any )?code\b|\bwrites? no code\b|\b(?:don't|do not|not) (?:write|build)\b|\bany code\b/i.test(branch),
      noData: /\bcollect(?:s|ing)?\b|\bpersonal data\b|\baddresses\b|\bno one's data\b|\bsign-?up\b|\bforms?\b/i.test(branch),
    }).toEqual({ noCode: true, noData: true });
  });

  it("DEFECT (LOW): /build says 'This line hasn't been tried yet.' — true today, and made false before anything is deployed: D-0020 §D has a fresh agent try the line 'before release', and M-0017's stopping rule runs that trial as step 2 of this verification; the page reads no receipt, so unless someone edits it, the deployed page will say the line was never tried (D-0020 §F: 'A status stays true on the deployed site and off it'; M-0016's re-check, C22, found the same kind of line out of date)", () => {
    const text = textOf(render(BuildPage));
    expect(text).toContain(AGENT_LINE);
    expect(record("decisions/D-0020.md")).toContain("A fresh agent tries it before release");
    expect(record("receipts/conformance/2026-10-03-M-0017.verification.md")).toContain(
      "An agent trial: a fresh agent, given only the new line on /build and a FICTIONAL person's answers, against a local production build.",
    );

    // The defect.
    expect(text).not.toContain("This line hasn't been tried yet.");
  });

  it("DEFECT (LOW): kit/README.md, which M-0017 edited, still says 'Not deployed yet. our.one serves nothing at these addresses until it is deployed, and the line below points at nothing until then.' — a status that turns false the day our.one deploys; M-0012's precondition 11 makes the hosting lines on /privacy and /power follow the server, and doesn't name this one, and /build links the kit's folder, where GitHub shows this README", () => {
    const readme = flat(readRoot("kit/README.md"));
    expect(readme).toContain(AGENT_LINE);
    expect(record("decisions/D-0020.md")).toContain("A status stays true on the deployed site and off it.");
    const m12 = record("mandates/M-0012.md");
    expect(m12).toContain("11. The hosting lines: /privacy and /power, and the control record behind /power, say");
    expect(m12).not.toMatch(/README/);
    expect(render(BuildPage)).toContain('href="https://github.com/radosukala/ours/tree/main/kit"');

    // The defect.
    expect(readme).not.toMatch(/\bNot deployed yet\b|\bpoints at nothing until then\b/);
  });

  it("DEFECT (LOW): the front door's picture of the feed ends on '✓ You're caught up.', with a tick and nothing older below it; the app never draws a tick, and puts its marker, 'You've seen everything from before your last visit, …', above a post from before the last visit — the picture D-0015 §K corrected on the front page, and that /feed still shows as the app draws it; this one is captioned 'An example feed.' too", () => {
    const projects = section(renderDoor(), "projects");
    expect(textOf(projects)).toContain("An example feed. Fictional people.");
    const marker = renderToStaticMarkup(createElement(CaughtUpMarker, { since: PREVIEW_LAST_VISIT, now: PREVIEW_NOW }));
    expect(textOf(marker)).toContain("You've seen everything from before your last visit, 2 days ago.");
    expect(marker).not.toContain("✓");
    expect(record("decisions/D-0015.md")).toContain("The app draws the caught-up marker only above a post from before the last visit, and never with a tick.");

    // The defect.
    expect(textOf(projects)).not.toMatch(/✓\s*You're caught up/);
  });

  it("DEFECT (LOW): the last section's heading, 'What should we make ours next?', says something has already been made ours — the feed, the only project — while the first screen says 'Founder-led today. User control isn't built yet.' (AGENTS.md §9: never state or imply ownership that hasn't happened; the claims scan can't read a presupposition)", () => {
    const html = renderDoor();
    expect(textOf(html)).toContain(DOOR_STATUS);
    const part = section(html, "part");
    const heading = textOf(/<h2[\s\S]*?<\/h2>/.exec(part)?.[0] ?? "");
    expect(heading.length).toBeGreaterThan(0);

    // The defect.
    expect(heading).not.toMatch(/\bours next\b|\bours again\b|\banother one ours\b/i);
  });

  it("DEFECT (LOW): before the page's JavaScript runs, and without it, the illustration says 'Try changing the maintainer.' and there is no button to press (Continuity.tsx draws it only once hydrated), so it asks for something the page can't do", () => {
    const ours = section(renderDoor(), "ours");
    expect(read("src/components/public/Continuity.tsx")).toContain("{ready ? (");
    const button = ours.includes(ILLUSTRATION.change);

    // The defect: no button, and an invitation to press one.
    expect(button || !/\bTry changing the maintainer\b/.test(textOf(ours))).toBe(true);
  });

  it("DEFECT (LOW): 'In the open' links the code, the agreement and who holds power, but not the costs; D-0020 §A asks for 'links to the code, the costs, the agreement and who holds power' there (the costs are linked once, in the strip under the first screen)", () => {
    expect(record("decisions/D-0020.md")).toContain(
      "In the open: what is built, what is a draft, and what isn't built, with links to the code, the costs, the agreement and who holds power.",
    );
    const hrefs = links(section(renderDoor(), "open")).map(([, href]) => href);
    expect(hrefs).toEqual(expect.arrayContaining([OPEN_CODE_URL, "/agreement", "/power"]));

    // The defect.
    expect(hrefs).toContain("/costs");
  });

  it("DEFECT (LOW): /projects offers both drafts, but D-0020 §E names where a visitor can draft — 'On the front door, /build and /maintainers' — and §B gives /projects 'the feed, with its facts, and the labelled possibilities'; M-0017's acceptance says the same of /projects, so a fourth place is more than either authorizes (AGENTS.md §12: the reading that authorizes more work is never the right one)", () => {
    const d20 = record("decisions/D-0020.md");
    expect(d20).toContain("On the front door, /build and /maintainers, a visitor can draft a need or an idea");
    expect(d20).toContain("/projects: the feed, with its facts, and the labelled possibilities.");
    expect(readRoot("mandates/M-0017.yaml")).toContain("/projects shows the feed and the labelled possibilities");
    for (const page of [renderDoor(), render(BuildPage), render(MaintainersPage)]) {
      expect(links(page).some(([text]) => /^Draft /.test(text))).toBe(true);
    }
    const drafts = links(render(ProjectsPage)).filter(([text]) => /^Draft /.test(text));
    // A record that names /projects among the places would settle it too.
    const named = readdirSync(join(ROOT, "decisions"))
      .filter((f) => f.endsWith(".md"))
      .flatMap((f) => record(`decisions/${f}`).split(/(?<=[.:;])\s+/))
      .some((s) => /\/projects\b/.test(s) && /\bdraft (?:a need|an idea)\b|\bthe drafts\b|\btwo drafts\b/i.test(s));

    // The defect: drafts on /projects, and no record that puts them there.
    expect(drafts.length === 0 || named, `${drafts.length} drafts on /projects; a record names /projects among the places: ${named}`).toBe(true);
  });

  it("DEFECT (LOW): each answer in a draft stops at 600 characters, and nothing in the dialog says so: typing stops and a longer paste loses its end without a word — the answer to 'what happens to a long draft?' should be on the page, as it is for the email link ('The draft is too long for an email link …')", () => {
    const html = hydratedDraft("idea", "ideas@example.test");
    const limits = [...html.matchAll(/<textarea[^>]*\bmaxlength="(\d+)"/gi)].map((m) => Number(m[1]));
    expect(limits).toEqual([600, 600, 600]);
    expect(read("src/components/public/Draft.tsx")).toContain(
      "The draft is too long for an email link: your email app should open with the subject only. Copy the draft, and paste it in.",
    );

    // The defect.
    const text = textOf(html);
    expect(limits.every((n) => text.includes(String(n)) || text.includes(n.toLocaleString("en-US")))).toBe(true);
  });
});

/* ------------------------------------------------------------- closed */

describe("closed (each passes on cb1aadd)", () => {
  it("closed: /feed is the verified front page, word for word — FrontPage.tsx from the court's finding to its end is 25ce8f0's, character for character; the four definitions moved to join.ts (the count, free, closed and seat lines) are 25ce8f0's; FeedPreview, FeedContrast, GetInForm, lede.ts and handover.ts are unchanged; and the route differs from 25ce8f0's `/` only in its comment, its name and its description", async () => {
    const before = gitShow(FRONT_PAGE_VERIFIED, "apps/web/src/components/public/FrontPage.tsx");
    const now = read("src/components/public/FrontPage.tsx");
    const tail = (s: string) => s.slice(s.indexOf("/** The court's finding (D-0015 §E)"));
    expect(tail(now).length).toBeGreaterThan(5000);
    expect(tail(now)).toBe(tail(before));

    const join = read("src/components/public/join.ts");
    for (const start of [
      "/** The count, shown as the rank the next person would have. */",
      "/** Under the form, while joining is open (SPEC §18.15 item 1.3). */",
      "/**\n * While joining is closed (SPEC §18.15 item 3).",
      "/**\n * The seat line (D-0016 §B)",
    ]) {
      const at = before.indexOf(start);
      expect(at, start).toBeGreaterThan(-1);
      const end = before.indexOf("\n}\n", at) !== -1 && start.includes("count") ? before.indexOf("\n}\n", at) + 3 : before.indexOf(";\n", before.indexOf("export", at)) + 2;
      const block = start.includes("seat line") ? before.slice(at, before.indexOf("\n}\n", at) + 3) : before.slice(at, end);
      expect(join, start).toContain(block);
    }

    for (const file of ["FeedPreview.tsx", "FeedContrast.tsx", "GetInForm.tsx", "lede.ts", "handover.ts"]) {
      expect(read(`src/components/public/${file}`), file).toBe(gitShow(FRONT_PAGE_VERIFIED, `apps/web/src/components/public/${file}`));
    }

    const strip = (s: string) =>
      s
        .replace(/^\/\*\*[\s\S]*?\*\/\n/, "")
        .replace('import { LEDE } from "@/components/public/lede";\n', "")
        .replace("  description: LEDE,\n", "")
        .replace(/\bFeedPageRoute\b|\bFrontPageRoute\b/g, "Route");
    expect(strip(read("src/app/(public)/feed/page.tsx"))).toBe(strip(gitShow(FRONT_PAGE_VERIFIED, "apps/web/src/app/(public)/page.tsx")));

    const feed = textOf(renderToStaticMarkup((await FeedPageRoute()) as ReactElement));
    for (const words of [
      "Just your people. Then you're done.",
      LEDE,
      "In January 2025, content from friends got 7% of the time Americans spent on Instagram. Most of the rest went to short videos from strangers, recommended by AI.",
      "Today I hold the domain, the data and the keys. The members' body has not been formed, and the handover has not happened.",
      "What's a maintainer?",
    ]) {
      expect(feed, words).toContain(words);
    }
  });

  it("closed: the joining gates are the same on / and on /feed — with a controller named and the client-address header decided, both show the form and read the seats; with no controller, or in production with no header, neither shows a form nor reads the seats, and both say 'Joining opens soon.'; both routes send a signed-in visitor to /home, and both leave the count out when it can't be read", async () => {
    const both = async () => [
      renderToStaticMarkup((await FrontDoorRoute()) as ReactElement),
      renderToStaticMarkup((await FeedPageRoute()) as ReactElement),
    ];
    for (const [door, feed] of [await both()]) {
      expect(door).toContain("<form");
      expect(feed).toContain("<form");
    }
    expect(seats.seatState).toHaveBeenCalledTimes(2);

    for (const env of [
      { DATA_CONTROLLER: "", DATA_CONTROLLER_EMAIL: "" },
      { NODE_ENV: "production", CLIENT_IP_HEADER: "" },
    ]) {
      seats.seatState.mockClear();
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const [door, feed] = await both();
      expect([door!.includes("<form"), feed!.includes("<form")], JSON.stringify(env)).toEqual([false, false]);
      expect(textOf(door!)).toContain("Joining opens soon.");
      expect(textOf(feed!)).toContain("Joining opens soon.");
      expect(seats.seatState).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    }

    for (const file of ["src/app/(public)/page.tsx", "src/app/(public)/feed/page.tsx"]) {
      expect(read(file), file).toContain('if (await signedIn()) redirect("/home");');
      expect(read(file), file).toContain("const joining = accountCreationOpen() && clientIpHeader() !== null;");
    }
    seats.memberCount.mockRejectedValue(new Error("FICTIONAL outage"));
    const [door, feed] = await both();
    expect(textOf(door!)).not.toMatch(/people are in|person is in|Nobody is in yet/);
    expect(textOf(feed!)).not.toMatch(/people are in|person is in|Nobody is in yet/);
  });

  it("closed: what /contract and the seat email say of 'the front page' still holds — the front door's first panel, the one shown first with or without JavaScript, carries the count ('the number on the front page') and the join form ('ask again on the front page'), by /feed's gates", () => {
    expect(textOf(render(ContractPage))).toContain("The count is the number on the front page: accounts that exist and are not suspended.");
    expect(read("src/core/mail-templates.ts")).toContain("If the link expires, ask again on the front page");
    hydration.ready = true;
    const html = renderDoor({ count: 1284 });
    hydration.ready = false;
    const panels = [...html.matchAll(/<div id="[^"]*-panel-(\w+)" role="tabpanel"[^>]*>/g)].map((m) => [m[1], /\bhidden=""/.test(m[0]) ? "hidden" : "shown"]);
    expect(panels).toEqual([
      ["feed", "shown"],
      ["work", "hidden"],
      ["audience", "hidden"],
    ]);
    const first = html.slice(html.indexOf('-panel-feed" role="tabpanel"'), html.indexOf('-panel-work" role="tabpanel"'));
    expect(textOf(first)).toContain(countLine(1284));
    expect(first).toContain("<form");
    expect(textOf(first)).toContain(JOIN_LABEL);
  });

  it("closed: every possibility and the illustration carry their labels, in every state — the two tabs' panels say 'A possibility · no project announced' and 'Concept only', with notes that they are illustrations; the picture's cards say IMAGINE and its description 'possibilities, not projects'; /projects heads them 'Possibilities, not projects'; the illustration names itself in both its states and says our.one can't do it today (D-0020 §A)", () => {
    for (const ready of [false, true]) {
      hydration.ready = ready;
      const projects = textOf(section(renderDoor(), "projects"));
      hydration.ready = false;
      for (const p of POSSIBILITIES) expect(projects, String(ready)).toContain(`${POSSIBILITY_LABEL} ${p.heading.join(" ")}`);
      expect(projects.match(/Concept only/g)).toHaveLength(2);
      expect(projects).toContain(WORK_NOTE);
      expect(projects).toContain(AUDIENCE_NOTE);
    }
    const diagram = read("src/components/public/Diagram.tsx");
    expect(diagram.match(/>\s*IMAGINE\s*</g)).toHaveLength(2);
    expect(flat(diagram)).toContain("Tools for work and a creator&apos;s home are possibilities, not projects.");
    expect(textOf(render(ProjectsPage))).toContain("Possibilities, not projects Two examples of what could come next. Neither is a project: nothing is announced, and no one has proposed either to our.one.");
    expect(ILLUSTRATION.label).toBe("The idea, as an illustration");
    expect(ILLUSTRATION.idle).toContain("This only illustrates the idea: our.one can't do it today.");
    expect(ILLUSTRATION.done).toContain("An illustration: no one has made this change");
    expect(record("decisions/D-0020.md")).toContain("It says that it is an illustration, and that our.one can't do this today.");
  });

  it("closed: the agreement's rights are shown as proposed wherever they appear on the new pages — marked 'Proposed' and followed by 'Proposed, in a draft nobody has signed yet.' on the front door; 'Draft' with 'none of its collective rights is in force' in the open; /build's deal under 'Today: none of this is in force yet.'; and the first screen says 'Founder-led today. User control isn't built yet.' before anything else about control", () => {
    const html = renderDoor();
    const ours = textOf(section(html, "ours"));
    // The numeral before each right is drawn for the eye only (aria-hidden), and still in the text here.
    expect(ours).toContain(`Proposed i. ${OURS_RIGHTS[0]!.title} ${OURS_RIGHTS[0]!.text}`);
    expect(ours).toContain(OURS_STATUS);
    expect(OURS_STATUS.startsWith("Proposed, in a draft nobody has signed yet.")).toBe(true);
    expect(OURS_LEDE).toContain("The common agreement proposes");
    const text = textOf(html);
    expect(text.indexOf(DOOR_STATUS)).toBeLessThan(text.indexOf(OURS_LEDE));
    expect(text.indexOf(DOOR_STATUS)).toBeGreaterThan(-1);
    expect(textOf(section(html, "open"))).toContain("Draft The common agreement");
    const build = textOf(render(BuildPage));
    expect(build).toContain("Today: none of this is in force yet.");
    expect(build.indexOf("Today: none of this is in force yet.")).toBeGreaterThan(build.indexOf("What you give up"));
    expect(textOf(section(html, "build"))).toContain("The agreement is a draft.");
  });

  it("closed: no new sentence turns true or false at the deploy, other than the two this file reports — the front door in every state, /build, /projects, /maintainers, the layout, the drafts' words and /privacy's new sentence say nothing of being deployed, live, launched or tested locally; the only 'not deployed' lines are the hosting lines M-0012's precondition 11 names, which M-0017 leaves alone", () => {
    const deployWords = /\b(?:not (?:yet )?deployed|is deployed|deployed (?:yet|now)|live now|is live|now live|launched|tested locally|in production)\b/i;
    const texts: [string, string][] = [];
    for (const joining of [true, false]) for (const email of [null, "ideas@example.test"]) texts.push([`/ ${joining} ${email}`, textOf(renderDoor({ joining, email }))]);
    texts.push(["/build", textOf(render(BuildPage))], ["/projects", textOf(render(ProjectsPage))], ["/maintainers", textOf(render(MaintainersPage))]);
    texts.push(["the layout", textOf(renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page")))]);
    texts.push(["door.ts", flat(literals(read("src/components/public/door.ts")).join(" "))]);
    texts.push(["drafts.ts", flat(literals(read("src/components/public/drafts.ts")).join(" "))]);
    texts.push(["Draft.tsx", flat(literals(read("src/components/public/Draft.tsx")).join(" "))]);
    for (const [where, text] of texts) expect(text, where).not.toMatch(deployWords);

    const privacy = gitLines(["diff", "--unified=0", M0016_FINAL, BUILD, "--", "apps/web/src/app/(public)/privacy/page.tsx"]).filter((l) => /^[+-][^+-]/.test(l));
    expect(privacy.every((l) => l.startsWith("+"))).toBe(true);
    expect(privacy.join(" ")).not.toMatch(deployWords);
    expect(gitLines(["diff", "--name-only", M0016_FINAL, BUILD, "--", "apps/web/src/app/(public)/power", "apps/web/transparency"])).toEqual([]);
  });

  it("closed: no pay, audience or income is promised — every sentence on the new pages that names pay, money, an audience or an income makes it conditional on people choosing and funding a service, or says it isn't there yet; and nothing promises builders a living, a guarantee or users", () => {
    const sentences = [
      BUILD_LEDE,
      BUILD_PAY,
      ...BUILD_TERMS,
      BUILD_EXCHANGE,
      ...BUILD_STEPS.map((s) => `${s.title}. ${s.text}`),
      AGENT_FOOT,
      ...DRAFT_KINDS.idea.questions.map((q) => q.hint ?? ""),
      ...textOf(render(BuildPage)).split(/(?<=[.!?])\s+/),
      ...textOf(render(MaintainersPage)).split(/(?<=[.!?])\s+/),
      ...textOf(renderDoor()).split(/(?<=[.!?])\s+/),
    ].flatMap((s) => s.split(/(?<=[.!?])\s+/));
    // What people pay for a service they use ("what you use or pay for it today", "how it's paid for") is not pay promised to anyone.
    const money = sentences.filter(
      (s) => /\b(?:pay|paid|income|earn|audience|funding|funded|fund it|budget can)\b/i.test(s) && !/\bfree\b|\bweekly email\b|\bpay for it\b|\bpaid for\b/i.test(s),
    );
    expect(money.length).toBeGreaterThan(8);
    const conditional = /\bwhen\b|\bonce\b|\bif\b|\bwho choose\b|\bstill have to be earned\b|\bisn't\b|\bunpaid\b|\bnone\b|\bno money\b|\bapprove\b|\bpublic\b|\bgive up\b|\bincluding\b|\bwho would pay\b|\bselling\b|\bexpects a return\b|\bagreement says\b/i;
    expect(money.filter((s) => !conditional.test(s))).toEqual([]);
    expect(sentences.join(" ")).not.toMatch(/you(?:'ll| will) (?:be paid|get paid|earn)|\bguarantee|\bearn a living\b|\bwe(?:'ll| will) (?:bring|find) you (?:users|people|an audience)\b/i);
  });

  it("closed: the drafts send, store and count nothing — Draft.tsx, drafts.ts and CopyLine.tsx use no network, storage, cookie, form, server action or beacon; a draft's answers are written only in the change handler, never while a page renders or on the server; the email button appears only with an address; the email link carries the draft only up to 1,800 characters, and past it the subject alone, with a status that says which; without JavaScript, each button is a link to the /maintainers section that says how to write", () => {
    for (const file of ["src/components/public/Draft.tsx", "src/components/public/drafts.ts", "src/components/public/CopyLine.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|<form\b|"use server"|seat-actions|from "@\/app|new Image\(|navigator\.share/);
    }
    const draft = read("src/components/public/Draft.tsx");
    expect(draft.match(/\bremember\(/g)).toHaveLength(2);
    const update = draft.slice(draft.indexOf("function update("), draft.indexOf("function ready("));
    expect(update).toContain("remember(kind, next);");

    expect(hydratedDraft("idea", null)).not.toContain("Open in my email");
    expect(hydratedDraft("idea", "ideas@example.test")).toContain("Open in my email");
    expect(renderDoor({ email: "ideas@example.test" })).not.toContain("mailto:");

    expect(MAILTO_LIMIT).toBe(1800);
    const short = draftMailto("ideas@example.test", "need", draftText("need", ["A FICTIONAL calendar", "Ads", "My choir"]));
    expect(short.whole).toBe(true);
    expect(decodeURIComponent(short.href.slice(short.href.indexOf("&body=") + 6))).toContain(DRAFT_CLOSE);
    const long = draftMailto("ideas@example.test", "idea", draftText("idea", ["é ".repeat(300), "b ".repeat(300), "c ".repeat(300)]));
    expect(long).toEqual({ href: "mailto:ideas@example.test?subject=An%20idea%20for%20our.one", whole: false });
    expect(draft).toContain("Your email app should open with the draft in it. Nothing is sent until you send it.");
    expect(draft).toContain("The draft is too long for an email link: your email app should open with the subject only.");

    const maintainers = render(MaintainersPage);
    for (const [kind, href] of Object.entries(DRAFT_FALLBACK)) {
      const [path, anchor] = href.split("#");
      expect(path, kind).toBe("/maintainers");
      expect(maintainers, kind).toContain(`id="${anchor}"`);
    }
    expect(textOf(maintainers)).toContain("When it's ready, write to us with:");
    expect(textOf(maintainers)).toContain("Tell us what you need, and what you use or pay for it today.");
  });

  it("closed: /privacy says what the drafts do, and follows PROPOSALS_EMAIL — 'stays in your browser … unless you copy it' without the address, '… or open it in your own email app and send it yourself' with it; the hosting line it carries is the one M-0012's precondition 11 names, unchanged", () => {
    const without = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(without).toContain("When you draft a need or an idea on our pages, what you type stays in your browser. Nothing is saved or sent, and it's gone when you close or reload the page, unless you copy it.");
    vi.stubEnv("PROPOSALS_EMAIL", "ideas@example.test");
    const withAddress = textOf(renderToStaticMarkup(createElement(PrivacyPage)));
    expect(withAddress).toContain("unless you copy it or open it in your own email app and send it yourself.");
    expect(without).toContain("our.one is not deployed yet. This notice describes what it keeps when it runs.");
    expect(gitShow(M0016_FINAL, "apps/web/src/app/(public)/privacy/page.tsx")).toContain("our.one is not deployed yet. This notice describes what it keeps when");
  });

  it("closed: build.md's idea step is in D-0020 §D's order — it asks the person, drafts PITCH.md before any code, asks 'find out first, or build now?', and only then gets the tool; step 2 runs no command; the headings are the tool's own, in its order; step 7's parts are D-0017 §G's; the rules, the tool and the schema are byte for byte M-0016's; and the line for a coding agent is D-0020 §D's, the same on /build, the front door, kit-info and the README", () => {
    const steps = [...BUILD_MD.matchAll(/^## (\d)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2]}`);
    expect(steps.slice(0, 3)).toEqual(["1. Ask the person", "2. Draft the idea, before any code", "3. Get the tool, and set the project up"]);
    const step2 = BUILD_MD.slice(BUILD_MD.indexOf("## 2. Draft the idea"), BUILD_MD.indexOf("## 3. Get the tool"));
    expect(step2).not.toMatch(/```(?:sh|powershell)|node |curl |npm |pnpm |git init/);
    expect(step2).toContain("**find out first, or build now?**");
    const block = step2.slice(step2.indexOf("```text"), step2.indexOf("```", step2.indexOf("```text") + 7));
    const asked = [...block.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(asked).toHaveLength(7);
    const tool = readFileSync(TOOL, "utf8");
    const template = tool.slice(tool.indexOf("const PITCH_TEMPLATE"), tool.indexOf("`;", tool.indexOf("const PITCH_TEMPLATE")));
    expect(asked).toEqual([...template.matchAll(/^## (.+)$/gm)].map((m) => m[1]));

    const d17 = record("decisions/D-0017.md");
    for (const part of ["the need, and the experience it offers;", "what users would have to change or move;", "the price, the scope and the operating budget, including the maintainer's pay;", "what it asks for now;", "what has to happen before work starts, and what happens if it doesn't."]) {
      expect(d17).toContain(part);
    }
    expect(flat(BUILD_MD)).toContain("the need, what people would have to change, the price, the scope and the budget with the maintainer's pay, what it asks for now, and what has to happen first.");

    for (const file of ["kit/our-one.mjs", "kit/our.one.schema.json", "kit/LICENSE"]) {
      const r = spawnSync("git", ["show", `${M0016_FINAL}:${file}`], { cwd: ROOT });
      expect(Buffer.compare(r.stdout, readFileSync(join(ROOT, file))), file).toBe(0);
    }
    expect(read("AGENTS.md")).toContain("<!-- our.one rules 0: begin.");

    expect(record("decisions/D-0020.md")).toContain(`The line for a coding agent becomes: "${AGENT_LINE}"`);
    expect(textOf(render(BuildPage))).toContain(AGENT_LINE);
    expect(textOf(section(renderDoor(), "build"))).toContain(AGENT_LINE);
    expect(readRoot("kit/README.md")).toContain(AGENT_LINE);
  });

  it("closed: the claims scan reads every file the build added or changed under src/app and src/components, and the kit's build.md and README; it finds nothing in any of them, nor in the front door rendered in every state; and no stylesheet carries text a reader sees (no `content:` but empty strings and one arrow)", () => {
    const changed = gitLines(["diff", "--name-only", M0016_FINAL, BUILD, "--", "apps/web/src"])
      .map((f) => f.replace(/^apps\/web\//, ""))
      .filter((f) => /\.(?:ts|tsx)$/.test(f));
    expect(changed.length).toBeGreaterThan(15);
    const read_ = new Set(publicTextFiles(WEB));
    expect(changed.filter((f) => !read_.has(f))).toEqual([]);
    expect(scanKitText(WEB).files).toEqual(expect.arrayContaining(["../../kit/build.md", "../../kit/README.md"]));
    expect(scanKitText(WEB).hits).toEqual([]);
    for (const f of changed) expect(scanText(read(f), f).map((h) => h.match), f).toEqual([]);
    for (const joining of [true, false]) {
      for (const email of [null, "ideas@example.test"]) {
        expect(scanText(textOf(renderDoor({ joining, email })), null)).toEqual([]);
      }
    }
    for (const kind of ["need", "idea"] as const) expect(scanText(textOf(hydratedDraft(kind, "ideas@example.test")), null)).toEqual([]);
    for (const css of ["src/components/public/door.module.css", "src/app/globals.css", "src/components/public/public.module.css"]) {
      const contents = [...read(css).matchAll(/(?<![-\w])content:\s*([^;]+);/g)].map((m) => m[1]!.trim());
      expect(contents.filter((c) => c !== '""' && c !== '"↗"' && c !== "none"), css).toEqual([]);
    }
  });

  it("closed: the build touched only M-0017's allowed paths (apps/web, kit/build.md, kit/README.md, receipts/builds) and none it denies; the pages D-0020 §B keeps word for word — /contract, /agreement, /rules, /costs, /power, the invite, join, sign-in and unsubscribe pages — are unchanged", () => {
    const files = gitLines(["show", "--name-only", "--format=", BUILD]);
    expect(files.length).toBeGreaterThan(40);
    const allowed = (f: string) => /^apps\/web\//.test(f) || f === "kit/build.md" || f === "kit/README.md" || /^receipts\/(?:builds|conformance)\//.test(f);
    expect(files.filter((f) => !allowed(f))).toEqual([]);
    expect(files.filter((f) => /^(?:kit\/our-one\.mjs|kit\/our\.one\.schema\.json|decisions|mandates|proposals|authority|constitution|foundation)/.test(f))).toEqual([]);
    const kept = ["contract", "agreement", "rules", "costs", "power", "i", "join", "signin", "unsubscribe"].map((p) => `apps/web/src/app/(public)/${p}`);
    expect(gitLines(["diff", "--name-only", M0016_FINAL, BUILD, "--", ...kept])).toEqual([]);
  });

  it("closed: nothing on the new pages loads from another origin — no next/font, no @import or url() to another site in the stylesheets, the fonts are the device's; the rendered /, /feed, /build, /projects and /maintainers carry no script, style, image or frame from elsewhere, and their only outside links are the code on GitHub and the sources /feed has always cited", async () => {
    for (const css of ["src/components/public/door.module.css", "src/app/globals.css", "src/components/public/public.module.css"]) {
      expect(read(css), css).not.toMatch(/@import|url\(\s*["']?https?:|@font-face/);
    }
    const sources = gitLines(["grep", "-l", "next/font", BUILD, "--", "apps/web/src"]).length;
    expect(sources).toBe(0);
    const pages: [string, string][] = [
      ["/", renderDoor({ email: "ideas@example.test" })],
      ["/feed", renderToStaticMarkup((await FeedPageRoute()) as ReactElement)],
      ["/build", render(BuildPage)],
      ["/projects", render(ProjectsPage)],
      ["/maintainers", render(MaintainersPage)],
    ];
    for (const [page, html] of pages) {
      expect(html, page).not.toMatch(/<(?:script|img|iframe|link|source|video|audio|style)\b[^>]*\b(?:src|href)="https?:/i);
      for (const [, href] of links(html).filter(([, h]) => /^https?:/.test(h))) {
        expect(href, page).toMatch(/^https:\/\/(?:github\.com\/radosukala\/ours\/|storage\.courtlistener\.com\/|blog\.whatsapp\.com\/|about\.fb\.com\/)/);
      }
    }
  });

  it("closed: the header and footer on every public page — the wordmark, 'The idea', 'Projects', 'Build with us', 'In the open' and 'Sign in'; the footer's line, its links, the running version and the status line, unchanged from D-0016 §J; and the two front-door places point at sections the front door has", () => {
    const html = renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"));
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    // The wordmark is "our", the dot and "one" in spans; its link is named by its label.
    expect(header).toMatch(/<a [^>]*aria-label="our\.one, home"[^>]*>our<span class="public-wordmark__dot">\.<\/span>one<\/a>/);
    expect(links(header).slice(1).map(([t]) => t)).toEqual([...PLACES.map((p) => p.label), "Sign in"]);
    const footer = textOf(html.slice(html.indexOf("<footer"), html.indexOf("</footer>")));
    expect(footer).toContain(TAGLINE);
    expect(footer).toContain(STATUS_LINE);
    expect(footer).toMatch(/Version: /);
    expect(STATUS_LINE).toBe(
      "Maintained by its founder. Promised: when 100,000 people have joined, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.",
    );
    const door = renderDoor();
    for (const place of PLACES.filter((p) => p.href.startsWith("/#"))) expect(door, place.href).toContain(`id="${place.href.slice(2)}"`);
  });

  it("closed: the new words' numbers and absolutes have sources in the records (AGENTS.md §10), apart from the three this file reports ('no one holds the right', 'every one', 'every project after it') — 'ten rules' (D-0019 §C's ten), 'A person reads every proposal' (D-0018 §C, D-0020 §D), 'no new service gets anyone's data from our.one' (D-0018 §A), 'Nobody has signed it' and 'none of its collective rights is in force' (D-0017 §B, D-0018 §B), 'No member ownership has been issued' (AGENTS.md §2), 'Anyone can take their own data and leave' (D-0017 §B), 'nobody sells … never traded' (the draft's own terms), and /build's 'tried once … version 0.1.0' (M-0016's trial)", () => {
    const sources: [string, string, string][] = [
      ["ten rules and a check", "decisions/D-0019.md", "| 10 | Run the check before finishing,"],
      ["A person reads every proposal.", "decisions/D-0020.md", "Both still come by email, and a person reads each one (D-0018 §D)."],
      ["no new service gets anyone's data from our.one", "decisions/D-0018.md", "No protected service except the feed touches anyone's data before all seven exist for it."],
      ["none of its collective rights is in force", "decisions/D-0017.md", "None of the collective rights is in force on our.one yet."],
      ["No member ownership has been issued.", "AGENTS.md", "MEMBER OWNERSHIP NOT YET ISSUED"],
      ["Anyone can take their own data and leave.", "decisions/D-0017.md", "each person can always take their own data and leave."],
      ["that nobody sells, and whose users' data is never traded", "decisions/D-0017.md", "Individual rights: no majority can expose or sell a person's data or private connections."],
      ["our.one can't do it today", "decisions/D-0020.md", "It says that it is an illustration, and that our.one can't do this today."],
    ];
    const door = textOf(renderDoor());
    for (const [words, path, source] of sources) {
      expect(door, words).toContain(words);
      expect(path === "AGENTS.md" ? flat(readRoot(path)) : record(path), path).toContain(source);
    }
    expect(textOf(render(AgreementPage))).toContain("Nobody sells it.");
    expect(flat(readRoot("receipts/conformance/2026-10-02-M-0016.verification.md"))).toContain(
      "it built a small book-club app and reached READY TO PROPOSE with the tool unchanged.",
    );
    expect(readdirSync(join(ROOT, "receipts/conformance")).filter((f) => /agent-trial$/.test(f))).toEqual(["2026-10-02-M-0016-agent-trial"]);
    const absolutes = [
      ...IDEA_TEXT,
      STRIP_LINE,
      OPEN_INTRO,
      OPEN_FOOT,
      ...OPEN_ROWS.flatMap((r) => [r.text, r.detail]),
      ...PART_INTRO,
      ...Object.values(PART_OPTIONS).map((o) => o.text),
      ...POSSIBILITIES.map((p) => p.text),
    ].filter((s) => /\b(?:every|never|always|nobody|no one|anyone|all)\b/i.test(s));
    expect(absolutes.filter((s) => !sources.some(([words]) => s.includes(words)) && !/\bNobody has signed it\b/.test(s))).toEqual([]);
  });
});
