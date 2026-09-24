"use client";

/**
 * Add / Not now on /join/confirm (SPEC §17 item 1). Add shows a refusal in
 * place; Not now simply leaves.
 */
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { addInviterAction, type ConfirmState, notNowAction } from "./actions";

export function ConfirmForms() {
  const [state, addAction, pending] = useActionState<ConfirmState, FormData>(
    addInviterAction,
    null,
  );
  return (
    <div className="stack">
      {state && !state.ok ? (
        <p className="notice notice--error" role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={addAction}>
        <Button type="submit" kind="primary" block disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      <form action={notNowAction}>
        <Button type="submit" kind="outline" block disabled={pending}>
          Not now
        </Button>
      </form>
    </div>
  );
}
