"use client";

/**
 * A button that runs one server action (already bound to its arguments),
 * with an optional confirmation, a pending state, and the action's error
 * sentence shown beside it. The action revalidates, so the page updates
 * itself afterwards.
 */
import { useState, useTransition } from "react";
import { Button, type ButtonKind, type ButtonSize } from "@/components/Button";
import type { ActionResult } from "@/web/actions";
import styles from "./people.module.css";

export type BoundAction = () => Promise<ActionResult | undefined | void>;

export function ActionButton({
  action,
  children,
  kind = "outline",
  size = "small",
  confirm,
  pendingLabel,
  pressed,
  label,
  className,
}: {
  action: BoundAction;
  children: React.ReactNode;
  kind?: ButtonKind;
  size?: ButtonSize;
  /** Asked with the browser's own dialog before running. */
  confirm?: string;
  pendingLabel?: string;
  /** For toggles such as Follow / Following. */
  pressed?: boolean;
  /** An accessible name when the visible text is not enough. */
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <span className={styles.actionWrap}>
      <Button
        type="button"
        kind={kind}
        size={size}
        onClick={onClick}
        disabled={pending}
        aria-pressed={pressed}
        aria-label={label}
        className={className}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </Button>
      {error ? (
        <span role="alert" className={styles.actionError}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
