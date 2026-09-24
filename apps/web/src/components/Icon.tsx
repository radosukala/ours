/**
 * Inline SVG icons (SPEC §9): 24×24 viewBox, 1.75 stroke, currentColor.
 * No icon library and no network request.
 */
import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "bell"
  | "people"
  | "person"
  | "gear"
  | "plus"
  | "heart"
  | "heart-filled"
  | "chat"
  | "dots"
  | "lock"
  | "globe-people"
  | "arrow-left"
  | "share"
  | "copy"
  | "flag"
  | "check"
  | "x";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3.5 10.2 12 3.5l8.5 6.7" />
      <path d="M5.5 8.8V19a1.5 1.5 0 0 0 1.5 1.5h3.5v-6h3v6H17a1.5 1.5 0 0 0 1.5-1.5V8.8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 21h4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.4-3.6 3-5.8 6.5-5.8s6.1 2.2 6.5 5.8" />
      <path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M17.5 14.6c2.2.7 3.6 2.6 4 5.4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c.6-4 3.8-6.5 8-6.5s7.4 2.5 8 6.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8l1.7 2.3 2.8-.5.9 2.7 2.7.9-.5 2.8 2.3 1.7-2.3 1.7.5 2.8-2.7.9-.9 2.7-2.8-.5L12 21.2l-1.7-2.3-2.8.5-.9-2.7-2.7-.9.5-2.8L2.8 12l2.3-1.7-.5-2.8 2.7-.9.9-2.7 2.8.5z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  heart: (
    <path d="M12 20s-7.5-4.4-9-9.2C1.9 7.4 4 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.2 0 5.3 2.9 4.2 6.3C19.5 15.6 12 20 12 20z" />
  ),
  "heart-filled": (
    <path
      d="M12 20s-7.5-4.4-9-9.2C1.9 7.4 4 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.9 1.2-1.8 2.8-2.9 4.8-2.9 3.2 0 5.3 2.9 4.2 6.3C19.5 15.6 12 20 12 20z"
      fill="currentColor"
    />
  ),
  chat: (
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.5L5.6 20.2A1 1 0 0 1 4 19.4z" />
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  "globe-people": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.3 2.3 3.5 5.1 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.1-3.5-8.5s1.2-6.2 3.5-8.5z" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M19.5 12H4.5" />
      <path d="M10.5 6l-6 6 6 6" />
    </>
  ),
  share: (
    <>
      <path d="M12 3.5v12" />
      <path d="M7.5 8 12 3.5 16.5 8" />
      <path d="M5 13v5.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V13" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5h11l-2.2 4 2.2 4h-11" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  name: IconName;
  size?: number;
  /** An accessible name; without it the icon is decorative (aria-hidden). */
  title?: string;
};

export function Icon({ name, size = 24, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
