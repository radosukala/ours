"use client";

/**
 * The illustration on the front door (D-0020 §A): the maintainer changes,
 * and the people, their relationships and their rules stay. It says what it
 * is: an illustration of something our.one can't do today.
 *
 * Without JavaScript it shows its first state and its words, with no
 * button to press.
 */
import { useState } from "react";
import { useHydrated } from "./useHydrated";
import { ILLUSTRATION } from "./door";
import styles from "./door.module.css";

const PEOPLE = ["A", "B", "C", "D"] as const;

export function Continuity() {
  const ready = useHydrated();
  const [changed, setChanged] = useState(false);

  return (
    <figure className={styles.continuity} aria-labelledby="continuity-label">
      <p id="continuity-label" className={styles.eyebrowSmall}>
        {ILLUSTRATION.label}
      </p>
      <div className={styles.people} aria-hidden="true">
        {PEOPLE.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
      <p className={styles.stay}>{ILLUSTRATION.stay}</p>
      <p className={styles.kept}>
        {ILLUSTRATION.kept.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <div className={styles.operator}>
        <div>
          <p className={styles.operatorRole}>{ILLUSTRATION.role}</p>
          <p className={styles.operatorName}>{changed ? ILLUSTRATION.after : ILLUSTRATION.before}</p>
        </div>
        <span className={`${styles.glyph} ${changed ? styles.glyphChanged : ""}`} aria-hidden="true">
          {changed ? "b" : "a"}
        </span>
      </div>
      {ready ? (
        <button
          type="button"
          className={`btn btn--outline ${styles.changeButton}`}
          onClick={() => setChanged((c) => !c)}
        >
          {changed ? ILLUSTRATION.reset : ILLUSTRATION.change}
        </button>
      ) : null}
      <p className={styles.result} role="status">
        {!ready ? ILLUSTRATION.still : changed ? ILLUSTRATION.done : ILLUSTRATION.idle}
      </p>
    </figure>
  );
}
