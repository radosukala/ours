"use client";

/**
 * The two forms on an invite page: the email form for a signed-out person,
 * and "Add <Name> as a friend" for a signed-in one.
 */
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import {
  acceptInviteAction,
  type InviteFormState,
  requestJoinAction,
} from "./actions";

export const CHECK_EMAIL = "Check your email — we've sent a link.";

export function JoinRequestForm({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    requestJoinAction,
    null,
  );
  if (state?.ok) {
    return (
      <div className="notice notice--ok" role="status">
        <p>
          <strong>{CHECK_EMAIL}</strong>
        </p>
        <p className="small">It works once, for 15 minutes.</p>
      </div>
    );
  }
  return (
    <form action={formAction} className="form">
      <input type="hidden" name="code" value={code} />
      <Field
        label="Your email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        required
        hint="We'll email you a link to join."
        error={state && !state.ok ? state.error : null}
      />
      <Button type="submit" kind="primary" block disabled={pending}>
        {pending ? "Sending…" : "Send me a link"}
      </Button>
    </form>
  );
}

export function AddFriendForm({ code, name }: { code: string; name: string }) {
  const [state, formAction, pending] = useActionState<InviteFormState, FormData>(
    acceptInviteAction,
    null,
  );
  return (
    <form action={formAction} className="form">
      <input type="hidden" name="code" value={code} />
      {state && !state.ok ? (
        <p className="notice notice--error" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" kind="primary" block disabled={pending}>
        {pending ? "Adding…" : `Add ${name} as a friend`}
      </Button>
    </form>
  );
}
