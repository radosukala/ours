/**
 * A list of settings rows that lead somewhere: a title, a sentence, and a
 * chevron, like the settings lists people already know.
 *
 * `download` rows are plain links, so nothing prefetches a file download.
 */
import Link from "next/link";
import styles from "./settings.module.css";

export type SettingsLinkItem = {
  href: string;
  title: string;
  description: string;
  download?: boolean;
  danger?: boolean;
};

function Body({ item }: { item: SettingsLinkItem }) {
  return (
    <>
      <span className={styles.linkText}>
        <span className={styles.linkTitle}>{item.title}</span>
        <span className={styles.linkDescription}>{item.description}</span>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </>
  );
}

export function SettingsLinks({
  items,
  label,
}: {
  items: SettingsLinkItem[];
  label?: string;
}) {
  return (
    <ul className={styles.links} role="list" aria-label={label}>
      {items.map((item) => {
        const className = `${styles.linkRow}${item.danger ? ` ${styles.danger}` : ""}`;
        return (
          <li key={item.href}>
            {item.download ? (
              <a href={item.href} download className={className}>
                <Body item={item} />
              </a>
            ) : (
              <Link href={item.href} className={className}>
                <Body item={item} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
