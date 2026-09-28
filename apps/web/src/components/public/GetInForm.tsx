"use client";

/**
 * The front page's Get in form (SPEC §18.2 item 4): the label "Your
 * email", the button "Get in", and the action `takeSeat` (SPEC §18.4).
 *
 * After any valid submission everyone reads the same words, whether a seat
 * was open, the address now waits in line, or it already has an account:
 * the answer never tells which. A refusal (joining closed, an address that
 * isn't one, a rate limit) is shown at the field, in the words the action
 * returns.
 */
import { useActionState } from "react";
import { type SeatResult, takeSeat } from "@/app/(public)/seat-actions";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

/** The one answer to every valid submission (SPEC §18.2). */
export const CHECK_YOUR_EMAIL =
  "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.";

export function GetInForm() {
  const [state, formAction, pending] = useActionState<SeatResult | null, FormData>(
    takeSeat,
    null,
  );
  return <GetInFormView state={state} action={formAction} pending={pending} />;
}

/**
 * The form as it looks for a given answer: none yet, a refusal, or the
 * one answer. Separate from the hook so each state can be rendered in a
 * test.
 */
export function GetInFormView({
  state,
  action,
  pending,
}: {
  state: SeatResult | null;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const error = state !== null && "error" in state ? state.error : null;
  const answered = state !== null && error === null;

  return (
    <div className="stack">
      <form action={action} className="form" noValidate>
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
          error={error}
        />
        <Button type="submit" kind="primary" size="large" block disabled={pending}>
          Get in
        </Button>
      </form>
      {answered ? (
        <p className="notice notice--ok" role="status">
          {CHECK_YOUR_EMAIL}
        </p>
      ) : null}
    </div>
  );
}
