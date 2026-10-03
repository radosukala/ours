/**
 * The public header's four places (D-0020 §B): the idea and what's in the
 * open are sections of the front door; projects and building are pages.
 * A plain module, so the header (PublicNav) and the picture of the app on
 * /feed (FeedPreview, a server component) read the same list.
 */
export const PLACES: readonly { href: string; label: string; page: string | null }[] = [
  { href: "/#idea", label: "The idea", page: null },
  { href: "/projects", label: "Projects", page: "/projects" },
  { href: "/build", label: "Build with us", page: "/build" },
  { href: "/#open", label: "In the open", page: null },
];
