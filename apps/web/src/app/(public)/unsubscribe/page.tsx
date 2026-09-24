/**
 * /unsubscribe (SPEC §8 "Weekly email"): the link at the bottom of every
 * weekly email. Works without signing in.
 */
import type { Metadata } from "next";
import styles from "@/components/public/public.module.css";
import { Unsubscribe } from "@/components/public/Unsubscribe";
import { unsubscribeAction } from "./actions";

export const metadata: Metadata = {
  title: "Stop the weekly email",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <article className={styles.page}>
      <h1 className="headline">Weekly email</h1>
      <Unsubscribe stop={unsubscribeAction} />
    </article>
  );
}
