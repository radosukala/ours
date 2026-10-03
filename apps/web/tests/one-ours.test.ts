/**
 * One our.one, signed in or not (D-0023, M-0020, SPEC §18.22): one
 * identity, one header, the front door for members, the feed as the first
 * project. Every person and address here is FICTIONAL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

import PublicLayout from "@/app/(public)/layout";
import { MemberLinks } from "@/components/MemberLinks";
import { navItems } from "@/components/Nav";
import { OursCard } from "@/components/RightColumn";
import { SiteHeader } from "@/components/SiteHeader";
import { MEMBER_JOIN, MEMBER_PANEL, TAGLINE } from "@/components/public/door";
import { FrontDoor } from "@/components/public/FrontDoor";
import { FrontPage } from "@/components/public/FrontPage";
import { memberCountLine } from "@/components/public/join";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const VIEWER = { handle: "ada_fict", displayName: "Ada (FICTIONAL)", isAdmin: true };

describe("one identity (D-0023 §A)", () => {
  it("the root tokens are our.one's, light and dark, and none of X's colours is left anywhere", () => {
    const css = read("src/app/globals.css");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    expect(root).toContain("--bg: #f5f3eb;");
    expect(root).toContain("--text: #222b24;");
    expect(root).toContain("--accent: #bf411d;");
    const everything = [css, read("src/components/public/public.module.css"), read("src/app/icon.svg"), read("src/app/manifest.ts"), read("src/app/layout.tsx")].join("\n");
    for (const x of ["#1d9bf0", "#f91880", "#0f1419", "#536471", "#eff3f4"]) expect(everything, x).not.toContain(x);
  });

  it("there is no left navigation and no Post pill: the app's layout draws the header every page has", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("<SiteHeader>");
    expect(layout).toContain("<MemberLinks");
    expect(layout).not.toMatch(/<Nav\b/);
    expect(read("src/components/Nav.tsx")).not.toMatch(/export function Nav\b/);
    expect(read("src/app/globals.css")).not.toMatch(/\.nav__post|\.nav__item|\.nav__inner/);
  });
});

describe("one header (D-0023 §B)", () => {
  it("the header has the wordmark, which goes to the front door, and the four places", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, null, "FICTIONAL"));
    expect(html).toContain('href="/"');
    expect(html).toContain('our<span class="public-wordmark__dot">.</span>one');
    for (const place of ["The idea", "Projects", "Build with us", "In the open"]) expect(textOf(html)).toContain(place);
  });

  it("a member's links: the feed, notifications and people with their counts, and a menu with the profile, settings and moderation", () => {
    const html = renderToStaticMarkup(createElement(MemberLinks, { viewer: VIEWER, counts: { unread: 3, pending: 1 } }));
    const text = textOf(html);
    for (const words of ["Feed", "Notifications 3", "People 1", "Your profile", "Settings", "Moderation"]) expect(text).toContain(words);
    expect(text).not.toMatch(/\bHome\b/);
    expect(html).toContain('href="/home"');
    expect(html).toContain('aria-current="page"');
    const plain = renderToStaticMarkup(createElement(MemberLinks, { viewer: { ...VIEWER, isAdmin: false }, counts: { unread: 0, pending: 0 } }));
    expect(textOf(plain)).not.toContain("Moderation");
  });

  it("the feed is named the feed (D-0023 §D)", () => {
    expect(navItems(VIEWER, { unread: 0, pending: 0 })[0]).toMatchObject({ href: "/home", label: "Feed" });
    expect(read("src/components/TabBar.tsx")).toContain('label: "Feed"');
    expect(read("src/app/(app)/home/page.tsx")).toContain('<PageHeader title="Feed" />');
  });

  it("the public layout offers Sign in until it knows, and Your feed to a member, without depending on the database", () => {
    const html = renderToStaticMarkup(createElement(PublicLayout, null, "FICTIONAL page"));
    expect(textOf(html)).toContain("Sign in");
    const layout = read("src/app/(public)/layout.tsx");
    expect(layout).toContain("<Suspense fallback={<SignIn />}>");
    expect(layout).toContain("Your feed");
    expect(read("src/web/viewer.ts")).toMatch(/export async function isMemberHere\(\)[\s\S]*catch \{\s*return true;/);
  });
});

describe("the front door for members (D-0023 §C)", () => {
  it("where a visitor is asked to join, a member is shown their feed, on / and on /feed, with the count and no rank", () => {
    const door = renderToStaticMarkup(createElement(FrontDoor, { joining: true, email: null, count: 12, seatsOpen: 3, seatsWaiting: 0, member: true }) as ReactElement);
    const feed = renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, seatsWaiting: 0, member: true }) as ReactElement);
    for (const html of [door, feed]) {
      expect(textOf(html)).toContain(MEMBER_JOIN.line);
      expect(textOf(html)).toContain(MEMBER_JOIN.link);
      expect(html).toContain('href="/home"');
      expect(html).not.toContain("<form");
      expect(textOf(html)).toContain(memberCountLine(12));
      expect(textOf(html)).not.toContain("You'd be #13");
    }
    expect(textOf(feed)).not.toContain("Who would you like to hear from?");
    const visitor = renderToStaticMarkup(createElement(FrontPage, { count: 12, joining: true, seatsOpen: 3, seatsWaiting: 0 }) as ReactElement);
    expect(visitor).toContain("<form");
  });
});

describe("the feed as the first project (D-0023 §D)", () => {
  it("our.one's panel: the line, the feed as its first project, the two drafts and the places, asking what to make ours without saying anything is", () => {
    const html = renderToStaticMarkup(createElement(OursCard, { email: null }));
    const text = textOf(html);
    expect(text).toContain(TAGLINE);
    expect(text).toContain(MEMBER_PANEL.text);
    expect(MEMBER_PANEL.text).not.toMatch(/ours next|ours else/);
    expect(text).toContain(MEMBER_PANEL.need);
    expect(text).toContain(MEMBER_PANEL.idea);
    for (const href of ['href="/projects"', 'href="/build"', 'href="/#idea"', 'href="/#open"']) expect(html).toContain(href);
  });
});
