"use client";

/**
 * The public header's four places (D-0020 §B; the list is in places.ts):
 * the idea and what's in the open are sections of the front door; projects
 * and building are pages. The page you are on is marked for screen readers
 * and underlined.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLACES } from "./places";

export { PLACES };

export function PublicNav() {
  const path = usePathname();
  return (
    <nav className="public-nav" aria-label="our.one">
      {PLACES.map((place) => (
        <Link
          key={place.href}
          href={place.href}
          aria-current={place.page !== null && path === place.page ? "page" : undefined}
        >
          {place.label}
        </Link>
      ))}
    </nav>
  );
}
