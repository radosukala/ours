/**
 * Labelled form fields (SPEC §9): 1px border, radius 4px, padding 12px, a
 * 2px --accent focus ring. Every input has a label; hints and errors are
 * tied to it with aria-describedby.
 */
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Common = {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  error?: string | null;
  /** Hide the label visually (it is still read by screen readers). */
  hideLabel?: boolean;
};

function ids(name: string, id: string | undefined) {
  const base = id ?? `field-${name}`;
  return { id: base, hint: `${base}-hint`, error: `${base}-error` };
}

function describedBy(
  i: ReturnType<typeof ids>,
  hint: ReactNode,
  error: string | null | undefined,
): string | undefined {
  const parts = [hint ? i.hint : null, error ? i.error : null].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function Wrap({
  i,
  label,
  hint,
  error,
  hideLabel,
  children,
}: {
  i: ReturnType<typeof ids>;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label
        htmlFor={i.id}
        className={hideLabel ? "field__label visually-hidden" : "field__label"}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p id={i.hint} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={i.error} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  error,
  hideLabel,
  id,
  className,
  ...input
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const i = ids(name, id);
  return (
    <Wrap i={i} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input
        id={i.id}
        name={name}
        className={`input${className ? ` ${className}` : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(i, hint, error)}
        {...input}
      />
    </Wrap>
  );
}

export function TextAreaField({
  label,
  name,
  hint,
  error,
  hideLabel,
  id,
  className,
  ...input
}: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const i = ids(name, id);
  return (
    <Wrap i={i} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea
        id={i.id}
        name={name}
        className={`input textarea${className ? ` ${className}` : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(i, hint, error)}
        {...input}
      />
    </Wrap>
  );
}

export function SelectField({
  label,
  name,
  hint,
  error,
  hideLabel,
  id,
  className,
  options,
  ...input
}: Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
    options: { value: string; label: string }[];
  }) {
  const i = ids(name, id);
  return (
    <Wrap i={i} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <select
        id={i.id}
        name={name}
        className={`input select${className ? ` ${className}` : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(i, hint, error)}
        {...input}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

/** A checkbox with its label beside it, e.g. "I'm 18 or older". */
export function CheckboxField({
  label,
  name,
  hint,
  error,
  id,
  className,
  ...input
}: Omit<Common, "hideLabel"> &
  Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type">) {
  const i = ids(name, id);
  return (
    <div className={`field field--check${error ? " field--error" : ""}`}>
      <div className="check">
        <input
          id={i.id}
          name={name}
          type="checkbox"
          className={`check__box${className ? ` ${className}` : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(i, hint, error)}
          {...input}
        />
        <label htmlFor={i.id} className="check__label">
          {label}
        </label>
      </div>
      {hint ? (
        <p id={i.hint} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={i.error} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
