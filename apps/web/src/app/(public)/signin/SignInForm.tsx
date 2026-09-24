"use client";

/**
 * The sign-in form: one email field. After sending it shows the one answer
 * everyone gets, and the form stays so a person can try another address.
 */
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { requestSignInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    requestSignInAction,
    null,
  );
  const sent = state?.ok ? state.message : null;
  const error = state && !state.ok ? state.error : null;

  return (
    <div className="stack">
      {sent ? (
        <p className="notice notice--ok" role="status">
          {sent}
        </p>
      ) : null}
      <form action={formAction} className="form" noValidate>
        <Field
          label="Email address"
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
          {pending ? "Sending…" : sent ? "Send another link" : "Send me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}
