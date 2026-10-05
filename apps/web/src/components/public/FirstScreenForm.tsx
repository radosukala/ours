"use client";

/**
 * The first screen's form (D-0024 §C; SPEC §18.23): the address, an
 * optional need ("Which app would you take back?"), and one button with
 * D-0016 §B's words. It posts to the same action as the feed's join form,
 * `takeSeat`, which asks for a seat and then keeps the need, without the
 * address.
 *
 * After any valid submission everyone reads the same words as on /feed,
 * whether a seat was open, the address now waits in line, or it already
 * has an account. A refusal is shown at the field it concerns: the address
 * (joining closed, an address that isn't one, a rate limit) or the need
 * (too long).
 */
import { useActionState } from "react";
import { type SeatResult, takeSeat } from "@/app/(public)/seat-actions";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { NEED_LABEL, NEED_MAX, needsLine } from "@/core/needs";
import { CHECK_YOUR_EMAIL } from "./GetInForm";
import { JOIN_LABEL } from "./join";
import styles from "./door.module.css";

/** Under the need's field: what happens to it. */
export const NEED_HINT = "Optional. Kept without your address.";

export type FirstScreenFormProps = {
  /** The button's words for the seats now (`joinLabel`). */
  label?: string;
  /** The lines under the button, in order: the seat line (when none is open), the free line. */
  lines: readonly string[];
  /** How many needs have been named, or null when it couldn't be read. */
  needs: number | null;
};

export function FirstScreenForm(props: FirstScreenFormProps) {
  const [state, formAction, pending] = useActionState<SeatResult | null, FormData>(takeSeat, null);
  return <FirstScreenFormView {...props} state={state} action={formAction} pending={pending} />;
}

/** The form as it looks for a given answer, so each state can be rendered in a test. */
export function FirstScreenFormView({
  state,
  action,
  pending,
  label = JOIN_LABEL,
  lines,
  needs,
}: FirstScreenFormProps & {
  state: SeatResult | null;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const refused = state !== null && "error" in state ? state : null;
  const emailError = refused && refused.field !== "need" ? refused.error : null;
  const needError = refused && refused.field === "need" ? refused.error : null;
  const answered = state !== null && refused === null;

  return (
    <div className={styles.heroJoin}>
      <form action={action} className={`form ${styles.heroForm}`} noValidate>
        <Field
          label="Your email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          error={emailError}
        />
        <Field
          label={NEED_LABEL}
          name="need"
          type="text"
          autoComplete="off"
          maxLength={NEED_MAX}
          hint={NEED_HINT}
          error={needError}
        />
        <Button type="submit" kind="primary" size="large" block disabled={pending}>
          {label}
        </Button>
      </form>
      {answered ? (
        <p className="notice notice--ok" role="status">
          {CHECK_YOUR_EMAIL}
        </p>
      ) : null}
      {lines.map((line) => (
        <p key={line} className={styles.joinStrong}>
          {line}
        </p>
      ))}
      {needs !== null && needs > 0 ? <p className={styles.needsLine}>{needsLine(needs)}</p> : null}
    </div>
  );
}
