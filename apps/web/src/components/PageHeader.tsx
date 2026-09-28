/**
 * The sticky page header (SPEC §9): 53px, a blurred background, the page's
 * one h1. On phones (<700px) it is the top bar; on /home pass `wordmark`
 * and phones show the our.one wordmark in place of the title.
 *
 * `back` adds an arrow back to that address. `actions` sit on the right.
 * `children` render under the title row, inside the sticky area — use it
 * for tabs (see `HeaderTabs`).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function PageHeader({
  title,
  subtitle,
  back,
  wordmark,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  wordmark?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__row">
        {back ? (
          <Link href={back} className="icon-btn page-header__back" aria-label="Back">
            <Icon name="arrow-left" size={20} />
          </Link>
        ) : null}
        <div className="page-header__titles">
          <h1
            className={`page-header__title${wordmark ? " page-header__title--home" : ""}`}
          >
            {title}
          </h1>
          {wordmark ? (
            <span className="page-header__wordmark wordmark" aria-hidden="true">
              our.one
            </span>
          ) : null}
          {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** Tabs under a page header, e.g. People: Friends · Requests · Following. */
export function HeaderTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; current: boolean; count?: number }[];
}) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="tabs__tab"
          aria-current={tab.current ? "page" : undefined}
          aria-label={tab.count ? `${tab.label}, ${tab.count}` : undefined}
        >
          <span className="tabs__label">
            {tab.label}
            {tab.count ? (
              <span className="badge badge--inline" aria-hidden="true">
                {tab.count}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}
