"use client";

/**
 * Type your username to confirm, then delete (SPEC §8). On success the
 * action signs out and leaves for the goodbye page; this form only ever
 * shows a refusal.
 */
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import type { ActionFail } from "@/web/actions";

export type DeleteState = ActionFail | null;

export function DeleteAccountForm({
  handle,
  action,
}: {
  handle: string;
  action: (previous: DeleteState, form: FormData) => Promise<DeleteState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="form" noValidate>
      <Field
        label={`Type your username, ${handle}, to confirm`}
        name="confirm"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={state?.error ?? null}
      />
      <div>
        <Button type="submit" kind="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </form>
  );
}
