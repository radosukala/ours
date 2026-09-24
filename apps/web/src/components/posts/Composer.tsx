"use client";

/**
 * The composer (SPEC §8 "Posts", §10): a textarea with a counter that
 * appears near the limit, the audience select only for people who accept
 * followers, and a Post button. The same component is the reply box on a
 * post's page.
 *
 * The textarea carries the `id` (on /home: "compose"). The Post pill and
 * the ＋ tab link to /home#compose: on a client navigation Next scrolls to
 * that element and focuses it; on a full page load, or a hash change, this
 * component focuses it itself.
 *
 * Submitting is a plain onSubmit that calls the server action and keeps
 * the text if the server refuses (a React form action would reset the form
 * either way).
 */
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { charCount } from "@/core/validate";
import { AUDIENCE_LABEL } from "./links";
import styles from "./posts.module.css";

export type ComposerResult = { ok: true } | { ok: false; error: string };

export function Composer({
  id,
  viewer,
  label,
  placeholder,
  max,
  counterFrom,
  submitLabel,
  audience = false,
  submit,
  variant = "post",
}: {
  /** The textarea's id; the page is focused on it when the URL hash names it. */
  id: string;
  viewer: { handle: string; displayName: string };
  /** The accessible name of the textarea. */
  label: string;
  placeholder: string;
  /** The limit in characters (2000 for a post, 1000 for a reply). */
  max: number;
  /** Show the counter from this many characters. */
  counterFrom: number;
  submitLabel: string;
  /** Offer "Friends" / "Friends & followers" (only if you accept followers). */
  audience?: boolean;
  submit: (form: FormData) => Promise<ComposerResult>;
  variant?: "post" | "reply";
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  useEffect(() => {
    const focusIfNamed = () => {
      if (window.location.hash === `#${id}`) input.current?.focus();
    };
    focusIfNamed();
    window.addEventListener("hashchange", focusIfNamed);
    return () => window.removeEventListener("hashchange", focusIfNamed);
  }, [id]);

  // The server counts characters after trimming; so does the counter.
  const used = charCount(text.trim());
  const left = max - used;
  const empty = used === 0;
  const over = left < 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || empty || over) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await submit(form);
        if (result.ok) {
          setText("");
        } else {
          setError(result.error);
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form
      className={variant === "post" ? "composer" : "reply-box"}
      onSubmit={onSubmit}
      aria-label={label}
    >
      <Avatar name={viewer.displayName} handle={viewer.handle} size={40} />
      <div>
        <label htmlFor={id} className="visually-hidden">
          {label}
        </label>
        <textarea
          ref={input}
          id={id}
          name="body"
          className={`composer__input ${styles.anchor}${variant === "reply" ? ` ${styles.replyInput}` : ""}`}
          placeholder={placeholder}
          rows={variant === "post" ? 2 : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          aria-invalid={over || error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          maxLength={max * 2}
        />
        <div className="composer__bar">
          {audience ? (
            <div className={styles.barStart}>
              <label htmlFor={`${id}-audience`} className="visually-hidden">
                Who can see this
              </label>
              <select
                id={`${id}-audience`}
                name="audience"
                defaultValue="friends"
                className={`input select ${styles.audience}`}
              >
                <option value="friends">{AUDIENCE_LABEL.friends}</option>
                <option value="followers">{AUDIENCE_LABEL.followers}</option>
              </select>
            </div>
          ) : (
            <input type="hidden" name="audience" value="friends" />
          )}
          <div className={styles.barEnd}>
            {used >= counterFrom ? (
              <span
                className={`counter${over ? " counter--over" : left <= 20 ? " counter--warn" : ""}`}
                aria-live="polite"
                aria-label={
                  over
                    ? `${-left} characters over the limit`
                    : `${left} characters left`
                }
              >
                {left}
              </span>
            ) : null}
            <Button type="submit" size="small" disabled={pending || empty || over}>
              {submitLabel}
            </Button>
          </div>
        </div>
        {error ? (
          <p id={errorId} className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
