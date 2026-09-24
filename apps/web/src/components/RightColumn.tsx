/**
 * The right column (SPEC §9), shown at 1000px and wider: an Invite someone
 * card with the remaining invites, and the small footer. `SiteFooter` is
 * also used by the public pages.
 */
import Link from "next/link";
import { runningVersion } from "@/core/config";
import { LinkButton } from "./Button";

export const OPEN_CODE_URL =
  "https://github.com/radosukala/ours/tree/main/apps/web";

export const STATUS_LINE =
  "Founder-led and founder-funded at launch. Working toward control by the people using it.";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <div className={`site-footer${className ? ` ${className}` : ""}`}>
      <nav className="site-footer__links" aria-label="About OURS">
        <a href={OPEN_CODE_URL} rel="noopener noreferrer" target="_blank">
          Open code
        </a>
        <span aria-hidden="true"> · </span>
        <Link href="/costs">Costs</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/power">Who controls what</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/rules">Rules</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <p className="site-footer__version">Version: {runningVersion()}</p>
      <p className="site-footer__status">{STATUS_LINE}</p>
    </div>
  );
}

export function RightColumn({ invitesRemaining }: { invitesRemaining: number }) {
  return (
    <aside className="aside" aria-label="More">
      <div className="aside__inner">
        <section className="card" aria-labelledby="invite-card-title">
          <h2 id="invite-card-title" className="card__title">
            Invite someone
          </h2>
          <p className="card__text">
            {invitesRemaining === 0
              ? "You have no invites left."
              : invitesRemaining === 1
                ? "You have 1 invite left."
                : `You have ${invitesRemaining} invites left.`}
          </p>
          <LinkButton href="/people/invites" kind="primary" size="small">
            Create invite link
          </LinkButton>
        </section>
        <SiteFooter />
      </div>
    </aside>
  );
}
