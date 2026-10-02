/**
 * The drafts' words and the text they make (D-0020 §D and §E), in a plain
 * module, so the pages, the dialog and the tests read the same.
 */

export type DraftKind = "need" | "idea";

type Question = { label: string; placeholder: string; hint?: string };

export type DraftWords = {
  eyebrow: string;
  title: string;
  intro: string;
  questions: readonly [Question, Question, Question];
  /** The first line of the draft, and the email's subject. */
  subject: string;
  /** Shown under the buttons until something happens. */
  note: string;
};

const NOTE =
  "Nothing is saved, sent or counted. Copying puts the draft on your clipboard; email opens your own email app, and you decide whether to send it. Close or reload this page, and a draft you haven't copied is gone.";

export const DRAFT_KINDS: Readonly<Record<DraftKind, DraftWords>> = {
  need: {
    eyebrow: "A need, to start a conversation",
    title: "What would make it worth coming together?",
    intro: "A concrete need helps someone build something useful. Keep it about the service: leave out names and private details.",
    questions: [
      { label: "What do you use today?", placeholder: "A tool or a service you depend on" },
      { label: "What would you change?", placeholder: "What isn't working for you, and who else feels it?" },
      {
        label: "What would make you try an alternative?",
        hint: "A feature, a way to move your work, or the people you'd bring.",
        placeholder: "I'd try it if…",
      },
    ],
    subject: "A need for our.one",
    note: NOTE,
  },
  idea: {
    eyebrow: "An idea, before any code",
    title: "What would you build for people?",
    intro: "Start with what you'd make and who it's for. This is an early idea, not a checked project.",
    questions: [
      {
        label: "What would you build, and for whom?",
        placeholder: "An idea, or a project you already have. No code needed.",
      },
      { label: "What do those people use today?", placeholder: "And what would yours do better?" },
      {
        label: "How would you find out whether they want it?",
        hint: "Interest is a start. It isn't an audience, or funding.",
        placeholder: "People you could ask, or a trial you could offer",
      },
    ],
    subject: "An idea for our.one",
    note: NOTE,
  },
};

/** Where the button goes without JavaScript: /maintainers says how to write. */
export const DRAFT_FALLBACK: Readonly<Record<DraftKind, string>> = {
  need: "/maintainers#maintainers-need",
  idea: "/maintainers#maintainers-propose",
};

/** The last line of every draft. */
export const DRAFT_CLOSE =
  "A starting point for a conversation, not a promise to join, fund or build anything.";

/** The draft as text: its subject, each question and its answer, and the last line. */
export function draftText(kind: DraftKind, answers: readonly string[]): string {
  const words = DRAFT_KINDS[kind];
  const parts = words.questions.map((q, i) => `${q.label}\n${(answers[i] ?? "").trim()}`);
  return [words.subject, ...parts, DRAFT_CLOSE].join("\n\n");
}

/**
 * The longest mailto link the draft goes into whole. Past it, some email
 * apps cut the link, so the link carries the subject only and the visitor
 * pastes the draft.
 */
export const MAILTO_LIMIT = 1800;

/** The link that opens the visitor's own email app; `whole` says whether the draft is in it. */
export function draftMailto(email: string, kind: DraftKind, text: string): { href: string; whole: boolean } {
  const subject = `mailto:${email}?subject=${encodeURIComponent(DRAFT_KINDS[kind].subject)}`;
  const full = `${subject}&body=${encodeURIComponent(text)}`;
  return full.length <= MAILTO_LIMIT ? { href: full, whole: true } : { href: subject, whole: false };
}
