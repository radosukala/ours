"use client";

/**
 * The drafts (D-0020 §D and §E): a need, or an idea before any code,
 * written in the visitor's browser.
 *
 * - Nothing is sent, stored or counted. The draft lives in this page's
 *   memory, shared by every button on the page, until the page is closed
 *   or reloaded.
 * - "Copy my draft" puts it on the clipboard; where the clipboard can't be
 *   reached, the draft is shown, selected, to copy by hand.
 * - "Open in my email" appears only when PROPOSALS_EMAIL is set (`email`):
 *   it opens the visitor's own email app with the draft in it, and they
 *   decide whether to send it. Email stays the only route (D-0018 §D).
 * - Without JavaScript the button is a link to /maintainers, which says how
 *   to write.
 */
import { useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "./useHydrated";
import {
  DRAFT_FALLBACK,
  DRAFT_KINDS,
  type DraftKind,
  draftMailto,
  draftText,
} from "./drafts";

/** The answers so far, per kind: page memory only, never storage. */
const answers: Record<DraftKind, string[]> = { need: ["", "", ""], idea: ["", "", ""] };

/** The event a button sends its dialog as it opens it. */
const OPENING = "draft-opening";

/** Keeps a kind's answers for every button on the page, until it is closed or reloaded. */
function remember(kind: DraftKind, values: string[]): void {
  answers[kind] = values;
}

export function DraftButton({
  kind,
  label,
  email,
  className,
}: {
  kind: DraftKind;
  label: string;
  /** PROPOSALS_EMAIL, or null while it is unset. */
  email: string | null;
  className?: string;
}) {
  const ready = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);

  if (!ready) {
    return (
      <a href={DRAFT_FALLBACK[kind]} className={className}>
        {label}
        <span aria-hidden="true"> ↗</span>
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          const d = dialog.current;
          if (!d) return;
          // The dialog takes up this kind's answers so far, from any button on the page.
          d.dispatchEvent(new Event(OPENING));
          d.showModal();
          d.querySelector("textarea")?.focus();
        }}
      >
        {label}
        <span aria-hidden="true"> ↗</span>
      </button>
      <DraftDialog ref={dialog} kind={kind} email={email} />
    </>
  );
}

function DraftDialog({
  ref,
  kind,
  email,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  kind: DraftKind;
  email: string | null;
}) {
  const words = DRAFT_KINDS[kind];
  const id = useId();
  const [values, setValues] = useState<string[]>(() => [...answers[kind]]);
  const [status, setStatus] = useState<string>(words.note);
  const [fallback, setFallback] = useState<string | null>(null);
  const fields = useRef<(HTMLTextAreaElement | null)[]>([]);
  const fallbackField = useRef<HTMLTextAreaElement>(null);

  // As it opens: this kind's answers so far, typed under any button on the
  // page, and the note in place of whatever the last opening said.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opening = () => {
      setValues([...answers[kind]]);
      setStatus(words.note);
      setFallback(null);
    };
    el.addEventListener(OPENING, opening);
    return () => el.removeEventListener(OPENING, opening);
  }, [ref, kind, words.note]);

  // When the draft is shown to copy by hand, select it once, as it appears.
  useEffect(() => {
    if (fallback === null) return;
    fallbackField.current?.focus();
    fallbackField.current?.select();
  }, [fallback]);

  function update(i: number, value: string) {
    const next = values.map((v, j) => (j === i ? value : v));
    setValues(next);
    remember(kind, next);
    setFallback(null);
  }

  /** The draft, or null after pointing at the first empty answer. */
  function ready(): string | null {
    const empty = values.findIndex((v) => v.trim() === "");
    if (empty !== -1) {
      setStatus("Add a short answer to each question first, so the draft gives someone something to start from.");
      fields.current[empty]?.focus();
      return null;
    }
    return draftText(kind, values);
  }

  async function copy() {
    const text = ready();
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setStatus("Copied. Nothing was sent.");
    } catch {
      setFallback(text);
      setStatus("This browser won't let the page copy it. The draft is below, selected: copy it from there. Nothing was sent.");
    }
  }

  function openEmail() {
    if (email === null) return;
    const text = ready();
    if (text === null) return;
    const link = draftMailto(email, kind, text);
    setStatus(
      link.whole
        ? "Your email app should open with the draft in it. Nothing is sent until you send it."
        : "The draft is too long for an email link: your email app should open with the subject only. Copy the draft, and paste it in.",
    );
    window.location.href = link.href;
  }

  return (
    <dialog ref={ref} className="draft" aria-labelledby={`${id}-title`}>
      <div className="draft__head">
        <p className="draft__eyebrow">{words.eyebrow}</p>
        <button
          type="button"
          className="draft__close"
          aria-label="Close"
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
      </div>
      <div className="draft__body">
        <h2 id={`${id}-title`} className="draft__title">
          {words.title}
        </h2>
        <p className="draft__intro">{words.intro}</p>
        {words.questions.map((q, i) => (
          <label key={q.label} className="draft__field" htmlFor={`${id}-${i}`}>
            <span className="draft__label">{q.label}</span>
            {q.hint ? <span className="draft__hint">{q.hint}</span> : null}
            <textarea
              id={`${id}-${i}`}
              ref={(el) => {
                fields.current[i] = el;
              }}
              value={values[i]}
              placeholder={q.placeholder}
              maxLength={600}
              rows={3}
              onChange={(e) => update(i, e.target.value)}
            />
          </label>
        ))}
        <div className="draft__actions">
          <button type="button" className="btn btn--primary btn--large" onClick={copy}>
            Copy my draft
          </button>
          {email !== null ? (
            <button type="button" className="btn btn--outline btn--large" onClick={openEmail}>
              Open in my email
            </button>
          ) : null}
        </div>
        <p className="draft__status" role="status">
          {status}
        </p>
        {fallback !== null ? (
          <textarea
            ref={fallbackField}
            className="draft__fallback"
            aria-label="Your draft, to copy"
            readOnly
            value={fallback}
          />
        ) : null}
      </div>
    </dialog>
  );
}
