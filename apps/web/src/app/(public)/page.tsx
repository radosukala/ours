/**
 * The landing page (SPEC §1, §9, §10): the working copy, exactly; the
 * status line; how to get in; and the pages to read before joining.
 * Signed-in people go straight to /home.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LinkButton } from "@/components/Button";
import styles from "@/components/public/public.module.css";
import { OPEN_CODE_URL, STATUS_LINE } from "@/components/RightColumn";
import { readSessionCookie } from "@/web/session";
import { getViewer } from "@/web/viewer";

export const metadata: Metadata = {
  title: { absolute: "OURS · Stay connected. On our terms." },
};

/**
 * Whether this request is signed in. Without a session cookie the database
 * is not touched, so the page works while it is down; if the check fails,
 * the visitor sees the landing page rather than an error.
 */
async function signedIn(): Promise<boolean> {
  if (!(await readSessionCookie())) return false;
  try {
    return (await getViewer()) !== null;
  } catch (error) {
    console.error(
      "[ours] landing: the session could not be checked:",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }
}

export default async function LandingPage() {
  if (await signedIn()) redirect("/home");

  return (
    <article className={styles.landing}>
      <h1 className="headline">Stay connected. On our terms.</h1>
      <p className="lede">
        A home for friends and people you choose to follow. Their posts, in
        order, with an end when you&apos;re caught up.
      </p>
      <p className="lede">
        We&apos;re building OURS so our connections can stay with us as apps
        change — and the people using it can control its future.
      </p>
      <p className={styles.promises}>
        <a href={OPEN_CODE_URL} rel="noopener noreferrer" target="_blank">
          Open code.
        </a>{" "}
        <Link href="/costs">Public costs.</Link>{" "}
        <Link href="/rules">Clear rules.</Link>
      </p>
      <p className={styles.connect}>Connect with me on OURS.</p>

      <section className={styles.invite} aria-label="Getting in">
        <p>Have an invite? Open the link you were sent.</p>
        <LinkButton href="/signin" kind="primary">
          Sign in
        </LinkButton>
      </section>

      <p className={styles.status}>{STATUS_LINE}</p>

      <nav aria-label="Before you join">
        <ul className={styles.links}>
          <li>
            <Link href="/costs">Costs</Link>
          </li>
          <li>
            <Link href="/power">Who controls what</Link>
          </li>
          <li>
            <Link href="/rules">Rules</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
          <li>
            <a href={OPEN_CODE_URL} rel="noopener noreferrer" target="_blank">
              Open code
            </a>
          </li>
        </ul>
      </nav>
    </article>
  );
}
