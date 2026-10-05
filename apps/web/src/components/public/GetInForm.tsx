"use client";

/**
 * The front page's join form (SPEC §18.2 item 4, as §18.16 amends it): the
 * label "Your email", the button "Join our.one", or "Join the waiting list"
 * when no seat is open (`joinLabel`, D-0016 §B), and the action `takeSeat`
 * (SPEC §18.4).
 *
 * After any valid submission everyone reads the same words, whether a seat
 * was open, the address now waits in line, or it already has an account:
 * the answer never tells which. A refusal (joining closed, an address that
 * isn't one, a rate limit) is shown at the field, in the words the action
 * returns.
 *
 * On the front door (D-0024 §A) the form has a second, optional field, *"Which
 * app would you take back?"* (`need`). Its words are kept without the address
 * and never change the answer; a refusal of them (too long, or an email
 * address in them) is shown at their own field. /feed's form has no such
 * field, and sends none.
 *
 * The form gives `useActionState` the server action itself, so it still posts
 * without JavaScript. A refusal carries what was typed (`values`), which the
 * form puts back: React empties a form's fields after every submit. The one
 * answer is drawn first, above the fields, where the person was; and the
 * button is `aria-disabled` while the form is sent, not `disabled`, so
 * keyboard focus stays on it.
 */
import { useActionState } from "react";
import { type SeatResult, type Sent, takeSeat } from "@/app/(public)/seat-actions";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { NEED_HINT, NEED_LABEL } from "./door";
import { JOIN_LABEL } from "./join";

/** The one answer to every valid submission (SPEC §18.2). */
export const CHECK_YOUR_EMAIL =
  "Check your email. If a seat was open, your link is there. If not, you're in line, and we'll write when one opens. If this address already has an account, just sign in.";

/** The form, with the button's words for the seats open now (`joinLabel`). */
export function GetInForm({ label = JOIN_LABEL, need = false }: { label?: string; need?: boolean }) {
  const [state, formAction, pending] = useActionState<SeatResult | null, FormData>(
    takeSeat,
    null,
  );
  return <GetInFormView state={state} action={formAction} pending={pending} label={label} need={need} />;
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
  label = JOIN_LABEL,
  need = false,
  values: given,
}: {
  state: SeatResult | null;
  action: (form: FormData) => void;
  pending: boolean;
  label?: string;
  need?: boolean;
  /** What to put back in the fields: a refusal's own values, unless given. */
  values?: Sent;
}) {
  const refusal = state !== null && "error" in state ? state : null;
  // What was typed when the form was refused, put back in its fields.
  const values = given ?? refusal?.values;
  // A refusal belongs to the field it names; the address's is the default.
  const error = refusal !== null && refusal.field !== "need" ? refusal.error : null;
  const needError = refusal !== null && refusal.field === "need" ? refusal.error : null;
  const answered = state !== null && refusal === null;

  return (
    <div className="stack">
      {answered ? (
        <p className="notice notice--ok" role="status">
          {CHECK_YOUR_EMAIL}
        </p>
      ) : null}
      <form action={action} className={`form get-in-form${need ? " get-in-form--need" : ""}`} noValidate>
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
          defaultValue={values?.email}
          error={error}
        />
        {need ? (
          <Field
            label={NEED_LABEL}
            name="need"
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            defaultValue={values?.need}
            hint={NEED_HINT}
            error={needError}
          />
        ) : null}
        <Button
          type="submit"
          kind="primary"
          size="large"
          block
          aria-disabled={pending || undefined}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          {label}
        </Button>
      </form>
    </div>
  );
}
