/**
 * The site footer inside the signed-in app, for widths where the right
 * column (and its footer) is hidden (SPEC §17 item 20): the links Open code
 * · Costs · Who controls what · Rules · Privacy, the running version and
 * the status line. It is the same `SiteFooter` the public pages and the
 * right column show; from 1000px it hides, because the right column shows
 * it there.
 */
import { SiteFooter } from "@/components/RightColumn";
import styles from "./public.module.css";

export function InAppSiteFooter() {
  return (
    <footer className={styles.inAppFooter}>
      <SiteFooter />
    </footer>
  );
}
