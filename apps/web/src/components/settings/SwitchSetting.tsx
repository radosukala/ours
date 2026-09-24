"use client";

/**
 * An on/off setting: a label, a sentence, and a switch. With `confirmOff`,
 * turning it off first shows what will happen and asks again (SPEC §6:
 * turning off "Accept followers" removes followers).
 */
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import type { ActionResult } from "@/web/actions";
import styles from "./settings.module.css";

export function SwitchSetting({
  label,
  description,
  checked,
  action,
  confirmOff,
}: {
  label: string;
  description: string;
  checked: boolean;
  action: (value: boolean) => Promise<ActionResult>;
  confirmOff?: { text: string; confirm: string };
}) {
  const id = useId();
  const [on, setOn] = useState(checked);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(value: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await action(value);
      if (result.ok) {
        setOn(value);
      } else {
        setError(result.error);
      }
      setConfirming(false);
    });
  }

  function toggle() {
    if (on && confirmOff) {
      setConfirming(true);
      return;
    }
    apply(!on);
  }

  return (
    <div>
      <div className={styles.setting}>
        <div className={styles.settingText}>
          <span id={`${id}-label`} className={styles.settingLabel}>
            {label}
          </span>
          <p id={`${id}-description`} className={styles.settingDescription}>
            {description}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description`}
          className={styles.switch}
          disabled={pending || confirming}
          onClick={toggle}
        >
          <span className={styles.knob} aria-hidden="true" />
        </button>
      </div>
      {confirming && confirmOff ? (
        <div className={`notice ${styles.confirm}`} role="alert">
          <p>{confirmOff.text}</p>
          <div className="cluster">
            <Button
              type="button"
              kind="danger"
              size="small"
              disabled={pending}
              onClick={() => apply(false)}
            >
              {confirmOff.confirm}
            </Button>
            <Button
              type="button"
              kind="outline"
              size="small"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
