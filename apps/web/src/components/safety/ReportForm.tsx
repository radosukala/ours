"use client";

/**
 * The report form (SPEC §8): a reason as radio choices, optional details
 * (up to 500 characters), and then the confirmation "Thanks. A person will
 * look at this." The action checks everything again on the server; this
 * form only collects.
 */
import { type FormEvent, startTransition, useActionState, useId } from "react";
import { Button, LinkButton } from "@/components/Button";
import { TextAreaField } from "@/components/Field";
import type { ActionResult } from "@/web/actions";
import type { ReportKind } from "./reportLink";
import styles from "./safety.module.css";

type ReportChoice = { value: string; label: string; hint: string };

/** The reasons a person can choose, in the order shown. */
const REPORT_CHOICES: readonly ReportChoice[] = [
  {
    value: "spam",
    label: "Spam",
    hint: "Ads, scams, or the same thing posted over and over.",
  },
  {
    value: "harassment",
    label: "Harassment",
    hint: "Abuse, threats, or someone being targeted.",
  },
  {
    value: "illegal",
    label: "Illegal content",
    hint: "Something that may break the law.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "It breaks the rules in another way.",
  },
];

const REPORT_DETAILS_MAX = 500;

const QUESTION: Record<ReportKind, string> = {
  post: "What's wrong with this post?",
  reply: "What's wrong with this reply?",
  account: "What's wrong with this account?",
};

export type ReportFormAction = (
  previous: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

export function ReportForm({
  action,
  kind,
  targetId,
  doneHref,
}: {
  action: ReportFormAction;
  kind: ReportKind;
  targetId: string;
  /** Where "Done" goes after the report is sent. */
  doneHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const base = useId();
  // Dispatch by hand so a refusal (for example the daily limit) keeps the
  // chosen reason and the details: React resets a form after its `action`
  // returns. The `action` attribute stays for a submit before hydration.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  if (state?.ok) {
    return (
      <div className={styles.done} role="status">
        <p className={styles.doneTitle}>Thanks. A person will look at this.</p>
        <LinkButton href={doneHref} kind="primary">
          Done
        </LinkButton>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.form}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={targetId} />

      <fieldset className={styles.choices}>
        <legend className={styles.legend}>{QUESTION[kind]}</legend>
        {REPORT_CHOICES.map((choice) => {
          const id = `${base}-${choice.value}`;
          return (
            <label key={choice.value} htmlFor={id} className={styles.choice}>
              <span className={styles.choiceText}>
                <span className={styles.choiceLabel} id={`${id}-label`}>
                  {choice.label}
                </span>
                <span className={styles.choiceHint} id={`${id}-hint`}>
                  {choice.hint}
                </span>
              </span>
              <input
                id={id}
                type="radio"
                name="category"
                value={choice.value}
                className="check__box"
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-hint`}
                required
              />
            </label>
          );
        })}
      </fieldset>

      <TextAreaField
        id={`${base}-details`}
        label="Details (optional)"
        name="details"
        maxLength={REPORT_DETAILS_MAX}
        rows={4}
        hint={`Anything that helps the person reviewing this. Up to ${REPORT_DETAILS_MAX} characters.`}
      />

      <p className={styles.fine}>
        The person reviewing reports sees your username. The person you
        report isn&apos;t told who reported them.
      </p>

      {state && !state.ok ? (
        <p className="notice notice--error" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        kind="primary"
        className={styles.submit}
        disabled={pending}
        aria-disabled={pending || undefined}
      >
        {pending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
