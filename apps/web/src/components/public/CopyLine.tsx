"use client";

/**
 * A button that copies the line for a coding agent (D-0020 §A). It appears
 * once the page's JavaScript runs; without it, the line itself is selected
 * whole with one tap (public.module.css, .prompt code).
 */
import { useState } from "react";
import { useHydrated } from "./useHydrated";

export function CopyLine({ text, className }: { text: string; className?: string }) {
  const ready = useHydrated();
  const [status, setStatus] = useState("");
  if (!ready) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Paste it into your coding agent.");
    } catch {
      setStatus("This browser won't let the page copy it. Select the line, and copy it from there.");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={copy}>
        Copy the line
      </button>
      <span className="copy-status" role="status">
        {status}
      </span>
    </>
  );
}
