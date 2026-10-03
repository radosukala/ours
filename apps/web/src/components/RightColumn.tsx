/**
 * The panel of the signed-in pages (SPEC §9; D-0023 §D): beside the page's
 * column at 1000px and wider, after it below that. our.one's own card (the
 * line, the feed as its first project, and the drafts of a need and an
 * idea), the Invite someone card with the remaining invites, and the small
 * footer. `SiteFooter` is also used by the public pages.
 */
import Link from "next/link";
import { runningVersion } from "@/core/config";
import { LinkButton } from "./Button";
import { DraftButton } from "./public/Draft";
import { MEMBER_PANEL, TAGLINE } from "./public/door";
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
        <Link href="/build">Build with us</Link>
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

/** our.one's own card, beside a member's feed (D-0023 §D). */
export function OursCard({ email }: { email: string | null }) {
  return (
    <section className="card card--ours" aria-labelledby="ours-card-title">
      <p className="card__kicker">{MEMBER_PANEL.kicker}</p>
      <h2 id="ours-card-title" className="card__title">
        {TAGLINE}
      </h2>
      <p className="card__text">{MEMBER_PANEL.text}</p>
      <div className="card__actions">
        <DraftButton kind="need" label={MEMBER_PANEL.need} email={email} className="btn btn--outline btn--small card__draft" />
        <DraftButton kind="idea" label={MEMBER_PANEL.idea} email={email} className="btn btn--outline btn--small card__draft" />
      </div>
      <p className="card__links">
        <Link href="/#idea">The idea</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/projects">Projects</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/build">Build with us</Link>
        <span aria-hidden="true">{"\u00a0· "}</span>
        <Link href="/#open">In the open</Link>
      </p>
    </section>
  );
}

export function RightColumn({ invitesRemaining, email = null }: { invitesRemaining: number; email?: string | null }) {
  return (
    <aside className="aside" aria-label="our.one">
      <div className="aside__inner">
        <OursCard email={email} />
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
