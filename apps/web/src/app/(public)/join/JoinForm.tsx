"use client";

/**
 * The details form on /join (SPEC §8 step 3): display name, username and
 * the required "I'm 18 or older". The username is checked on the server
 * when the form is sent; what was typed stays in the fields if it is
 * refused.
 */
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { CheckboxField, Field } from "@/components/Field";
import { completeJoinAction, type JoinFormState } from "./actions";

export function JoinForm() {
  const [state, formAction, pending] = useActionState<JoinFormState, FormData>(
    completeJoinAction,
    null,
  );
  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="form">
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      <Field
        label="Name"
        name="displayName"
        autoComplete="name"
        maxLength={50}
        required
        defaultValue={state?.values.displayName}
        hint="How people you know will see you. Up to 50 characters."
      />
      <Field
        label="Username"
        name="handle"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={21}
        required
        defaultValue={state?.values.handle}
        hint="3–20 characters: letters a–z, numbers and underscores. Your profile will be at /@username."
      />
      <CheckboxField
        label="I'm 18 or older"
        name="adult"
        value="yes"
        required
        defaultChecked={state?.values.adult}
      />
      <p className="small muted">
        By joining you agree to the{" "}
        <Link href="/rules" className="link">
          rules
        </Link>{" "}
        and have read the{" "}
        <Link href="/privacy" className="link">
          privacy notice
        </Link>
        .
      </p>
      <Button type="submit" kind="primary" block disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </Button>
    </form>
  );
}
