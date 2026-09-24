"use client";

/**
 * One button that undoes something about one person (Unblock, Unmute).
 * The list re-renders from the server when it succeeds.
 */
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import type { ActionResult } from "@/web/actions";
import styles from "./settings.module.css";

export function PersonActionButton({
  personId,
  label,
  accessibleLabel,
  action,
}: {
  personId: string;
  label: string;
  /** e.g. "Unblock @anna" */
  accessibleLabel: string;
  action: (personId: string) => Promise<ActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.personAction}>
      <Button
        type="button"
        kind="outline"
        size="small"
        disabled={pending}
        aria-label={accessibleLabel}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(personId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {label}
      </Button>
      {error ? (
        <p className={styles.personError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
