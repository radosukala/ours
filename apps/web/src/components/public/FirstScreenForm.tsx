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
 * (too long). React empties an uncontrolled form once its action returns,
 * whatever it returned, so the fields are controlled: after a refusal the
 * words stay, and the person doesn't retype an address or a need that was
 * refused (the verification of M-0021, R4); an answer starts the form again.
 * Words typed before the page's script ran are in the fields but not in the
 * state, which starts empty, so they are taken in when the script runs:
 * otherwise the first keystroke would write the state over them (the
 * re-check, RC2). That holds with JavaScript; a refused post made without
 * it comes back with empty fields (RC3). The action is `takeSeat` itself,
 * not a wrapper, so the form still posts
 * without JavaScript, or before the page's script has loaded (R1). The
 * fields' ids are the first screen's own: the Projects panel's form on the
 * same page has `field-email` (R3). Under the lines, the feed's own privacy
 * note (D-0016 §B), which says what is done with the address and leads to
 * the notice.
 */
import Link from "next/link";
import { type Ref, useActionState, useEffect, useRef, useState } from "react";
import { type SeatResult, takeSeat } from "@/app/(public)/seat-actions";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { NEED_LABEL, NEED_MAX, needsLine } from "@/core/need-words";
import { CHECK_YOUR_EMAIL } from "./GetInForm";
import { JOIN_LABEL } from "./join";
import styles from "./door.module.css";

/** Under the need's field: what happens to it. */
export const NEED_HINT = "Optional. Kept without your address.";

/** The words the person typed, put back after a refusal. */
export type Typed = { email: string; need: string };
const NOTHING_TYPED: Typed = { email: "", need: "" };

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
  const [typed, setTyped] = useState<Typed>(NOTHING_TYPED);
  const form = useRef<HTMLFormElement>(null);
  // Take in what was typed before this script ran (RC2).
  useEffect(() => {
    if (!form.current) return;
    const data = new FormData(form.current);
    const email = data.get("email");
    const need = data.get("need");
    const early = { email: typeof email === "string" ? email : "", need: typeof need === "string" ? need : "" };
    if (early.email !== "" || early.need !== "") setTyped(early);
  }, []);
  // When an answer comes (not a refusal), the form starts again.
  const [seen, setSeen] = useState<SeatResult | null>(state);
  if (state !== seen) {
    setSeen(state);
    if (state !== null && !("error" in state)) setTyped(NOTHING_TYPED);
  }
  return <FirstScreenFormView {...props} state={state} action={formAction} pending={pending} typed={typed} onType={setTyped} formRef={form} />;
}

/** The form as it looks for a given answer, so each state can be rendered in a test. */
export function FirstScreenFormView({
  state,
  action,
  pending,
  label = JOIN_LABEL,
  lines,
  needs,
  typed = NOTHING_TYPED,
  onType = () => undefined,
  formRef,
}: FirstScreenFormProps & {
  state: SeatResult | null;
  action: (form: FormData) => void;
  pending: boolean;
  typed?: Typed;
  onType?: (typed: Typed) => void;
  formRef?: Ref<HTMLFormElement>;
}) {
  const refused = state !== null && "error" in state ? state : null;
  const emailError = refused && refused.field !== "need" ? refused.error : null;
  const needError = refused && refused.field === "need" ? refused.error : null;
  const answered = state !== null && refused === null;

  return (
    <div className={styles.heroJoin}>
      <form action={action} className={`form ${styles.heroForm}`} noValidate ref={formRef}>
        <Field
          id="first-screen-email"
          label="Your email"
          name="email"
          type="email"
          value={typed.email}
          onChange={(event) => onType({ ...typed, email: event.target.value })}
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          error={emailError}
        />
        <Field
          id="first-screen-need"
          label={NEED_LABEL}
          name="need"
          type="text"
          value={typed.need}
          onChange={(event) => onType({ ...typed, need: event.target.value })}
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
      <p className={styles.joinSmall}>
        {"We'll email you the link. Once you've joined, you also get a weekly email, which you can stop. What we keep, and for how long, is in "}
        <Link href="/privacy">Privacy</Link>.
      </p>
    </div>
  );
}
