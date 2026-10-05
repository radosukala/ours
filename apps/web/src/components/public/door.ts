/**
 * The front door's words (D-0020 §A; SPEC §18.19), in one place, so the
 * page, the layout's footer and the tests read the same sentences.
 *
 * Every sentence here is held to D-0020 §F: no sentence claims user control,
 * the holder or any safeguard before it is there; the agreement's rights are
 * proposed; each possibility is labelled; no pay or audience is promised;
 * and every status is as true on the deployed site as off it.
 */

/** The line under the wordmark in every public footer, and the headline's words. */
export const TAGLINE = "The software we live in should be ours.";

/** Above the headline. */
export const DOOR_EYEBROW = "AI helps us build. Together, we can make it ours.";

/** The headline, one line each; the last word is set apart (D-0020 §A). */
export const DOOR_HEADLINE = ["The software", "we live in", "should be", "ours."] as const;

/** The metadata title. */
export const DOOR_TITLE = `our.one · ${TAGLINE}`;

/** The description of our.one, for the page's metadata and the manifest (D-0023). */
export const DOOR_LEDE =
  "We're bringing people and builders together to create services their users can control. Starting with a friends feed. Building toward much more.";

/** What it is, one line, under the headline (D-0024 §A): the video's own words. */
export const DOOR_WHAT = "It starts with a friends feed: your people, newest first, and then it ends. No ads.";

/** Under the promise (D-0020 §F): what holds today, before anything else. */
export const DOOR_STATUS = "Founder-led today. User control isn't built yet.";

/**
 * The builders' entrance (D-0020 §A), a text link under the form since
 * D-0024 §C; the people's entrance is the form itself.
 */
export const ENTRANCES = {
  builders: "I want to build",
} as const;

export const STRIP_LINE = "Software should answer to the people who depend on it.";

/* ------------------------------------------------------------- the idea */

export const IDEA_HEADING = ["AI is changing who can build.", "Let's change who has a say."] as const;

export const IDEA_TEXT: readonly string[] = [
  "Think about the software you depend on. The people you reach through it. The work you keep there. The rules you have to accept to stay.",
  "What if we brought our needs together, found people to build for them, and kept the authority to decide what those services become?",
];

export const IDEA_CLOSE = ["We can ask for a better app.", "Or come together to make it ours."] as const;

/* ------------------------------------------------------------- projects */

export type Possibility = {
  id: string;
  tab: string;
  label: string;
  heading: readonly [string, string];
  text: string;
  card: { title: string; tag: string };
};

/** The two possibilities beside the feed: labelled, with no project announced (D-0020 §A). */
export const POSSIBILITY_LABEL = "A possibility · no project announced";

export const POSSIBILITIES: readonly Possibility[] = [
  {
    id: "work",
    tab: "Your work",
    label: POSSIBILITY_LABEL,
    heading: ["Your team's work.", "Your team's terms."],
    text: "Imagine planning your work in a service whose users approve its budget and its essential rules, pay the people who keep it useful, and can appoint someone new if they leave.",
    card: { title: "A shared workspace", tag: "Concept only" },
  },
  {
    id: "audience",
    tab: "Your audience",
    label: POSSIBILITY_LABEL,
    heading: ["The relationship", "is the valuable part."],
    text: "Imagine a place creators and their readers shape together, with agreed rules for how it's paid for and who runs it.",
    card: { title: "A letter to my readers", tag: "Concept only" },
  },
];

export const WORK_ROWS: readonly string[] = ["Our projects", "Our shared knowledge", "Our agreed budget"];
export const WORK_NOTE = "An illustration of a possible service, not an app you can use.";
export const AUDIENCE_QUOTE = "What if we had a say in the place we meet?";
export const AUDIENCE_NOTE = "Illustrative words. No creator service is announced.";

/* ------------------------------------------------------------------ ours */

export const OURS_HEADING = ["A say in the rules.", "A say in the money.", "A say in who runs it."] as const;

export const OURS_LEDE =
  "The common agreement proposes real authority for the people who use a service, and fair terms for the people who look after it.";

/** What the agreement proposes, in its order (D-0017 §B and §C), shown as proposed. */
export const OURS_RIGHTS: readonly { title: string; text: string }[] = [
  { title: "The rules", text: "Its users decide its essential rules, together." },
  { title: "The money", text: "They approve its budget. What it costs, and what its maintainer is paid, is public." },
  { title: "Who runs it", text: "They can appoint someone new, and the service carries on. Anyone can take their own data and leave." },
];

export const OURS_STATUS =
  "Proposed, in a draft nobody has signed yet. None of its collective rights is in force: today, the founder decides. On the feed, you can already take your data and leave, and its costs are public.";

/** The illustration (D-0020 §A): what it shows, and what it isn't. */
export const ILLUSTRATION = {
  label: "The idea, as an illustration",
  stay: "The people stay.",
  kept: ["Your relationships.", "Your shared records.", "Your agreed rules."],
  role: "Who looks after the service",
  before: "The first maintainer",
  after: "A new maintainer",
  change: "Appoint a successor",
  reset: "Back to the start",
  idle: "Try changing the maintainer. This only illustrates the idea: our.one can't do it today.",
  done: "The maintainer changed. The people, their relationships and their rules stayed. An illustration: no one has made this change, and today only the founder could.",
  /** Before the page's JavaScript runs, there is no button to press (the verification of M-0017). */
  still: "This only illustrates the idea: our.one can't do it today.",
} as const;

/* -------------------------------------------------------------- builders */

export const BUILD_HEADING = ["Build something", "people can depend on."] as const;

export const BUILD_LEDE =
  "Start with an idea and the people it would serve. Show it to them before you build it all. Or bring a project you already have.";

export const BUILD_PAY =
  "When people choose a service and fund it, its agreed budget can pay you, or your team, to run it.";

/** From /maintainers' "What you get" (D-0017 §C). */
export const BUILD_TERMS: readonly string[] = [
  "A defined scope, with ordinary product decisions yours.",
  "Agreed pay once the service is funded, for an agreed term.",
  "Your name on your work, and a reputation you keep.",
];

export const BUILD_EXCHANGE =
  "The exchange: a service that can carry on under its users' control, that nobody sells, and whose users' data is never traded. The agreement is a draft. An audience and an income still have to be earned.";

export const AGENT_HEADING = ["Your idea. Your coding agent.", "A shared set of rules."] as const;

export const AGENT_FOOT =
  "For a coding agent that can read a web page and run commands. It drafts your idea with you first, then builds the project and checks it.";

export const BUILD_STEPS: readonly { title: string; text: string }[] = [
  { title: "Draft the idea", text: "Find out who wants it." },
  { title: "Build under the rules", text: "The check runs as you go." },
  { title: "Propose it", text: "A person reads every proposal." },
];

export const BUILD_LIMIT =
  "The check reads a project's files. Passing makes it ready to propose, nothing more: it isn't approved, listed or protected. The safeguards that would protect people's data while a service runs aren't built yet.";

/* --------------------------------------------------------------- the open */

export type OpenState = "Built" | "Draft" | "Not built yet";

export const OPEN_HEADING = ["Early. Real.", "Open about what's missing."] as const;

export const OPEN_INTRO =
  "Some of it you can use and read today. Some of it is a draft. The most important part isn't built yet.";

/** Each true whether or not the site is deployed (D-0020 §F). */
export const OPEN_ROWS: readonly {
  state: OpenState;
  title: string;
  text: string;
  detail: string;
}[] = [
  {
    state: "Built",
    title: "The feed",
    text: "Its code is open and its costs are public. It passes the kit's check.",
    detail: "Founder-run: the founder holds its domain, its data and its keys.",
  },
  {
    state: "Built",
    title: "The builder kit",
    text: "Instructions for coding agents, ten rules and a check.",
    detail: "Passing the check makes a project ready to propose, nothing more.",
  },
  {
    state: "Draft",
    title: "The common agreement",
    text: "Rights for the people who use a service. Fair terms for the people who run it.",
    detail: "Nobody has signed it, and none of its collective rights is in force.",
  },
  {
    state: "Not built yet",
    title: "Control that doesn't depend on the founder",
    text: "The holder, the data safeguards, and a way to change who runs a service.",
    detail: "Until they exist, the founder decides, and no new service gets anyone's data from our.one.",
  },
];

export const OPEN_FOOT = "Authority today: the founder, under bootstrap. No member ownership has been issued.";

/* ------------------------------------------------------------- your part */

export const PART_HEADING = ["What should we", "make ours?"] as const;

export const PART_INTRO: readonly string[] = [
  "Bring the people you'd want to hear from.",
  "Bring the thing you wish existed.",
  "Or bring the skills to build it.",
];

export const PART_OPTIONS = {
  feed: {
    eyebrow: "For you and your people",
    title: "Start with the feed.",
    text: "Your friends and the people you choose to follow, newest first, and then it ends.",
  },
  need: {
    eyebrow: "For the people who use software",
    title: "Give builders a reason to build.",
    text: "Tell us what you depend on, what you'd change, and what would make an alternative worth trying.",
  },
  idea: {
    eyebrow: "For the people who make it",
    title: "Bring your idea.",
    text: "Draft it first, and find out who wants it. Then build it with your coding agent, under the rules.",
  },
} as const;

/** Under the options: what a draft does, as true with the address set as without (D-0020 §E). */
export function partFoot(emailSet: boolean): string {
  return emailSet
    ? "A draft stays in your browser until you copy it, or send it from your own email. A person reads every one you send."
    : "A draft stays in your browser until you copy it. Needs and ideas open at launch: until then, keep yours.";
}

/* --------------------------------------------------------------- members */

/**
 * The panel beside a member's feed (D-0023 §D): what our.one is, that the
 * feed is its first project, and the two drafts the front door offers.
 */
export const MEMBER_PANEL = {
  kicker: "our.one",
  text: "The feed is our.one's first project. What should we make ours?",
  need: "Name a need",
  idea: "Bring an idea",
} as const;

/** Where a visitor is asked to join, a member is shown their feed (D-0023 §C). */
export const MEMBER_JOIN = {
  /** The name of the section that holds the two, for a screen reader. */
  heading: "Your feed",
  line: "You're in.",
  link: "Open your feed",
} as const;
