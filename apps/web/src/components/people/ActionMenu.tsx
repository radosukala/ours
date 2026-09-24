"use client";

/**
 * A small menu (a native <details> disclosure, so it works before the
 * script loads and with the keyboard): a trigger, then items that either
 * run a bound server action or follow a link. Closes on a choice, on a
 * click outside and on Escape.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/Icon";
import type { BoundAction } from "./ActionButton";
import styles from "./people.module.css";

export type MenuItem =
  | {
      kind: "action";
      label: string;
      action: BoundAction;
      /** Asked with the browser's own dialog before running. */
      confirm?: string;
      danger?: boolean;
      icon?: IconName;
    }
  | { kind: "link"; label: string; href: string; danger?: boolean; icon?: IconName };

export function ActionMenu({
  trigger,
  label,
  items,
  triggerClassName = "icon-btn",
  align = "end",
}: {
  trigger: React.ReactNode;
  /** An accessible name for an icon-only trigger. */
  label?: string;
  items: MenuItem[];
  triggerClassName?: string;
  /** Which edge of the trigger the list lines up with. */
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function close() {
      if (ref.current) ref.current.open = false;
    }
    function onPointerDown(event: PointerEvent) {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      const details = ref.current;
      if (event.key === "Escape" && details?.open) {
        close();
        details.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function choose(item: Extract<MenuItem, { kind: "action" }>) {
    if (ref.current) ref.current.open = false;
    if (item.confirm && !window.confirm(item.confirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await item.action();
      if (result && !result.ok) setError(result.error);
    });
  }

  const itemClass = (danger?: boolean) =>
    `menu__item${danger ? " menu__item--danger" : ""}`;

  return (
    <span className={styles.menuWrap}>
      <details
        ref={ref}
        className={`menu${align === "start" ? ` ${styles.menuStart}` : ""}`}
      >
        <summary
          className={triggerClassName}
          aria-label={label}
          aria-disabled={pending || undefined}
        >
          {trigger}
        </summary>
        <ul className="menu__list" role="list">
          {items.map((item) => (
            <li key={item.label}>
              {item.kind === "link" ? (
                <Link href={item.href} className={itemClass(item.danger)}>
                  {item.icon ? <Icon name={item.icon} size={20} /> : null}
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={itemClass(item.danger)}
                  onClick={() => choose(item)}
                  disabled={pending}
                >
                  {item.icon ? <Icon name={item.icon} size={20} /> : null}
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
      {error ? (
        <span role="alert" className={styles.actionError}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
