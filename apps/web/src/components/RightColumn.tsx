/**
 * The right column (SPEC §9), shown at 1000px and wider: an Invite someone
 * card with the remaining invites, and the small footer. `SiteFooter` is
 * also used by the public pages.
 */
import Link from "next/link";
import { runningVersion } from "@/core/config";
import { LinkButton } from "./Button";
import { THRESHOLD } from "./public/handover";

export const OPEN_CODE_URL =
  "https://github.com/radosukala/ours/tree/main/apps/web";

/**
 * The status line (D-0016 §J, which replaces D-0012 §D's; SPEC §18.16),
 * wherever control is described: every footer, /power, /costs and /rules.
 * It names the three things the contract promises and who receives them,
 * and says it is a promise; nothing in it reads as done, so the claims
 * scan has nothing to let through. The number is the handover threshold's one constant.
 */
export const STATUS_LINE = `Maintained by its founder. Promised: when ${THRESHOLD} people have joined, its domain, its data and the right to replace the maintainer go to a not-for-profit body of its members.`;

export function SiteFooter({ className }: { className?: string }) {
  return (
    <div className={`site-footer${className ? ` ${className}` : ""}`}>
      <nav className="site-footer__links" aria-label="About our.one">
        <Link href="/contract">Contract</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/agreement">Agreement</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/projects">Projects</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/maintainers">Build with us</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <a href={OPEN_CODE_URL} rel="noopener noreferrer" target="_blank">
          Open code
        </a>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/costs">Costs</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/power">Who controls what</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/rules">Rules</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
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
