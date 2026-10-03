"use client";

/**
 * The projects on the front door, one part of life at a time (D-0020 §A):
 * the feed, then the two labelled possibilities.
 *
 * Without JavaScript every panel is shown, one after the other, and the
 * tabs aren't drawn. With it, the tabs take their place, with the arrow
 * keys, Home and End, as WAI-ARIA's tabs pattern describes.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "./useHydrated";
import styles from "./door.module.css";

export type Tab = { id: string; label: string; panel: ReactNode };

export function ServiceTabs({ tabs, label }: { tabs: readonly Tab[]; label: string }) {
  const ready = useHydrated();
  const [current, setCurrent] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();

  // Drawing the tabs hides two panels, and what's below them moves up; a
  // visitor who came for a section further down (/#build, /#open) is taken
  // back to it, once (the re-check of M-0017).
  useEffect(() => {
    if (!ready) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target === null) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);

  function move(to: number) {
    const next = (to + tabs.length) % tabs.length;
    setCurrent(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className={styles.tabsBox} data-ready={ready ? "" : undefined}>
      {ready ? (
        <div role="tablist" aria-label={label} className={styles.tabs}>
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={i === current}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={i === current ? 0 : -1}
              className={styles.tab}
              onClick={() => setCurrent(i)}
              onKeyDown={(e) => {
                const to =
                  e.key === "ArrowRight" ? i + 1
                  : e.key === "ArrowLeft" ? i - 1
                  : e.key === "Home" ? 0
                  : e.key === "End" ? tabs.length - 1
                  : null;
                if (to === null) return;
                e.preventDefault();
                move(to);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          id={`${base}-panel-${tab.id}`}
          role={ready ? "tabpanel" : undefined}
          aria-labelledby={ready ? `${base}-tab-${tab.id}` : undefined}
          hidden={ready && i !== current}
          tabIndex={ready ? 0 : undefined}
          className={styles.panel}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
