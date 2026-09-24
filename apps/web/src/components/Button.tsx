/**
 * Pill buttons (SPEC §9): radius 9999px, 36px (small 32px), 15px / 700.
 * Kinds: primary, outline and danger (outline in --danger).
 *
 * `type` is required on <Button> so a form never submits by accident.
 * <LinkButton> is a link that looks like a button.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonKind = "primary" | "outline" | "danger";
export type ButtonSize = "normal" | "small" | "large";

function classes(
  kind: ButtonKind,
  size: ButtonSize,
  block: boolean | undefined,
  extra: string | undefined,
): string {
  return [
    "btn",
    `btn--${kind}`,
    size !== "normal" ? `btn--${size}` : "",
    block ? "btn--block" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type: "button" | "submit" | "reset";
  kind?: ButtonKind;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
};

export function Button({
  kind = "primary",
  size = "normal",
  block,
  className,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(kind, size, block, className)}
      {...rest}
    />
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  kind?: ButtonKind;
  size?: ButtonSize;
  block?: boolean;
};

export function LinkButton({
  kind = "primary",
  size = "normal",
  block,
  className,
  ...rest
}: LinkButtonProps) {
  return <Link className={classes(kind, size, block, className)} {...rest} />;
}
