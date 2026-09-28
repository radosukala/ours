"use client";

/**
 * The Seats section's two forms on /admin (SPEC §18.4): open a number of
 * seats, which invites the oldest addresses in line first, and remove an
 * address from the line when its owner asks. The server checks everything
 * again, and refuses anyone who is not an administrator.
 */
import { useActionState, useId } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import type { ActionResult } from "@/web/actions";
import styles from "./seats.module.css";

export type OpenSeatsResult = ActionResult<{ opened: number; invited: number }>;
export type OpenSeatsAction = (
  previous: OpenSeatsResult | null,
  form: FormData,
) => Promise<OpenSeatsResult>;
export type ForgetAction = (
  previous: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

const format = (n: number) => n.toLocaleString("en-US");

/** What opening seats did, in words. */
export function openedText({ opened, invited }: { opened: number; invited: number }): string {
  const seats = opened === 1 ? "1 seat" : `${format(opened)} seats`;
  const line =
    invited === 0
      ? "Nobody in line was invited."
      : invited === 1
        ? "1 address in line was invited."
        : `${format(invited)} addresses in line were invited.`;
  return `Opened ${seats}. ${line}`;
}

export function SeatControls({
  openAction,
  forgetAction,
  max,
}: {
  openAction: OpenSeatsAction;
  forgetAction: ForgetAction;
  max: number;
}) {
  return (
    <div className="stack stack--lg">
      <OpenSeatsForm action={openAction} max={max} />
      <ForgetForm action={forgetAction} />
    </div>
  );
}

function OpenSeatsForm({ action, max }: { action: OpenSeatsAction; max: number }) {
  const [state, formAction, pending] = useActionState(action, null);
  const base = useId();
  const [input, hint] = [`${base}-count`, `${base}-hint`];
  return (
    <form action={formAction} className="form">
      <div className="field">
        {/* The number sits in the sentence "Open [n] seats". Its name is
            given outright too: not every reader names a control from a
            label that contains it. */}
        <label htmlFor={input} className={`field__label ${styles.inline}`}>
          <span>Open</span>{" "}
          <input
            id={input}
            aria-label="Open seats"
            name="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            step={1}
            required
            className={`input ${styles.count}`}
            aria-describedby={hint}
          />{" "}
          <span>seats</span>
        </label>
        <p id={hint} className="field__hint">
          From 1 to {format(max)} at a time. The oldest addresses in line are
          invited first, one seat each; an address that already has an account
          leaves the line without an email.
        </p>
      </div>
      {state && !state.ok ? (
        <p className="notice notice--error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="notice notice--ok" role="status">
          {openedText(state)}
        </p>
      ) : null}
      <div>
        <Button type="submit" kind="primary" disabled={pending}>
          {pending ? "Opening…" : "Open seats"}
        </Button>
      </div>
    </form>
  );
}

function ForgetForm({ action }: { action: ForgetAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = `${useId()}-email`;
  return (
    <form action={formAction} className="form">
      <Field
        id={id}
        label="Remove an address from the line"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
        hint="When its owner asks. If the address has no account, the join links, an unfinished join and development mail kept for it are deleted too."
        error={state && !state.ok ? state.error : null}
      />
      {state?.ok ? (
        <p className="notice notice--ok" role="status">
          Removed. That address is not in the line.
        </p>
      ) : null}
      <div>
        <Button type="submit" kind="outline" disabled={pending}>
          {pending ? "Removing…" : "Remove"}
        </Button>
      </div>
    </form>
  );
}
