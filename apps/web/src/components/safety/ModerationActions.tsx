"use client";

/**
 * The three decisions on an open report (SPEC §8): Remove (a category and a
 * statement of reasons the author reads), Suspend account (a reason kept
 * with the decision), and Dismiss (an optional note the reporter reads).
 * One form is open at a time. The server checks everything again and
 * records who decided and when; after a decision the report leaves the
 * queue.
 */
import {
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useId,
  useState,
} from "react";
import { Button, type ButtonKind } from "@/components/Button";
import { SelectField, TextAreaField } from "@/components/Field";
import type { ActionResult } from "@/web/actions";
import styles from "./safety.module.css";

export type DecisionAction = (
  previous: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

type Panel = "remove" | "suspend" | "dismiss";

export type ModerationLimits = {
  reasonMin: number;
  reasonMax: number;
  noteMax: number;
};

export function ModerationActions({
  reportId,
  noun,
  canRemove,
  canSuspend,
  categories,
  defaultCategory,
  limits,
  actions,
}: {
  reportId: string;
  /** What is reported: "post", "reply" or "account". */
  noun: string;
  canRemove: boolean;
  canSuspend: boolean;
  categories: { value: string; label: string }[];
  defaultCategory: string;
  limits: ModerationLimits;
  actions: { remove: DecisionAction; suspend: DecisionAction; dismiss: DecisionAction };
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const base = useId();
  const panelId = (panel: Panel) => `${base}-${panel}`;
  const toggle = (panel: Panel) =>
    setOpen((current) => (current === panel ? null : panel));
  const close = () => setOpen(null);

  const opener = (panel: Panel, label: string, kind: ButtonKind) => (
    <Button
      type="button"
      kind={kind}
      size="small"
      aria-expanded={open === panel}
      aria-controls={open === panel ? panelId(panel) : undefined}
      onClick={() => toggle(panel)}
    >
      {label}
    </Button>
  );

  return (
    <div>
      <div className={styles.actions} role="group" aria-label="Decision">
        {canRemove ? opener("remove", `Remove ${noun}`, "danger") : null}
        {canSuspend ? opener("suspend", "Suspend account", "danger") : null}
        {opener("dismiss", "Dismiss", "outline")}
      </div>

      {open === "remove" && canRemove ? (
        <DecisionForm
          id={panelId("remove")}
          reportId={reportId}
          action={actions.remove}
          submitLabel={`Remove ${noun}`}
          submitKind="danger"
          onCancel={close}
        >
          <SelectField
            id={`${panelId("remove")}-category`}
            label="Category"
            name="category"
            options={categories}
            defaultValue={defaultCategory}
          />
          <TextAreaField
            id={`${panelId("remove")}-reason`}
            label="Statement of reasons"
            name="reason"
            required
            minLength={limits.reasonMin}
            maxLength={limits.reasonMax}
            rows={3}
            hint={`The author reads this with the category, and where to write if they think it's wrong. At least ${limits.reasonMin} characters.`}
          />
        </DecisionForm>
      ) : null}

      {open === "suspend" && canSuspend ? (
        <DecisionForm
          id={panelId("suspend")}
          reportId={reportId}
          action={actions.suspend}
          submitLabel="Suspend account"
          submitKind="danger"
          onCancel={close}
        >
          <p className="small muted">
            Its sessions end, and its posts, replies and profile are hidden.
            It can&apos;t sign in.
          </p>
          <TextAreaField
            id={`${panelId("suspend")}-reason`}
            label="Reason"
            name="reason"
            required
            minLength={limits.reasonMin}
            maxLength={limits.reasonMax}
            rows={3}
            hint={`Kept with the decision. At least ${limits.reasonMin} characters.`}
          />
        </DecisionForm>
      ) : null}

      {open === "dismiss" ? (
        <DecisionForm
          id={panelId("dismiss")}
          reportId={reportId}
          action={actions.dismiss}
          submitLabel="Dismiss report"
          submitKind="primary"
          onCancel={close}
        >
          <TextAreaField
            id={`${panelId("dismiss")}-note`}
            label="Note to the person who reported (optional)"
            name="note"
            maxLength={limits.noteMax}
            rows={2}
            hint="They read it with the outcome. Nothing is removed."
          />
        </DecisionForm>
      ) : null}
    </div>
  );
}

function DecisionForm({
  id,
  reportId,
  action,
  submitLabel,
  submitKind,
  onCancel,
  children,
}: {
  id: string;
  reportId: string;
  action: DecisionAction;
  submitLabel: string;
  submitKind: ButtonKind;
  onCancel: () => void;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  // Dispatch by hand so a refused decision keeps what was typed: React
  // resets a form after its `action` returns, even with an error. The
  // `action` attribute stays for a submit before the page has hydrated.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
  return (
    <form id={id} action={formAction} onSubmit={onSubmit} className={styles.panel}>
      <input type="hidden" name="reportId" value={reportId} />
      {children}
      {state && !state.ok ? (
        <p className="notice notice--error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className={styles.panelButtons}>
        <Button
          type="submit"
          kind={submitKind}
          size="small"
          disabled={pending}
          aria-disabled={pending || undefined}
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" kind="outline" size="small" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
