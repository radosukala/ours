/**
 * The invite page's words (D-0016 §I, SPEC §18.16 item 7, M-0014): a
 * signed-out visitor reads the front page's lede as what our.one is; while
 * they can join, "Free to join." and a link to the promise follow the
 * form. The heading that names the inviter, the form and the way to sign
 * in are unchanged, and so is what accepting an invite does (SPEC §8).
 *
 * Denial path first: joining closed. Everyone here is FICTIONAL, with an
 * example.test address.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a request there is no session cookie: a visitor who is not signed in.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import InvitePage from "@/app/(public)/i/[code]/page";
import { FrontPage, LEDE as FRONT_LEDE } from "@/components/public/FrontPage";
import { LEDE } from "@/components/public/lede";
import { createInvite } from "@/core/invites";
import { db, makeAccount, reset } from "./helpers";

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;?!])/g, "$1")
    .trim();
}

/** The invite page for a fresh invite from Anna, as a signed-out visitor sees it. */
async function invitePage(): Promise<string> {
  const anna = await makeAccount({ handle: "anna_inv", displayName: "Anna FICTIONAL", email: "anna_inv@example.test" });
  const { code } = await createInvite(db(), anna.id, {});
  return renderToStaticMarkup((await InvitePage({ params: Promise.resolve({ code }) })) as ReactElement);
}

const HEADING = "Anna FICTIONAL (@anna_inv) invited you to connect on our.one";
const OLD_PITCH = "A home for friends and people you choose to follow. Their posts, in order, with an end when you're caught up.";
// Changed after the verification of M-0017: the section on who runs it moved
// to /feed with the front page's words (D-0020 §B), so the link goes there.
const PROMISE_LINK = /<a [^>]*href="\/feed#front-runs"[^>]*>The promise behind our\.one<\/a>/;

beforeEach(async () => {
  await reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the invite page, signed out (D-0016 §I)", () => {
  it("joining closed: the heading names the inviter, the pitch is the front page's lede, and nothing says it is free to join", async () => {
    vi.stubEnv("DATA_CONTROLLER", "");
    vi.stubEnv("DATA_CONTROLLER_EMAIL", "");
    const html = await invitePage();
    const text = textOf(html);
    expect(text).toContain(HEADING);
    expect(text).toContain(LEDE);
    expect(text).toContain("our.one isn't open for new accounts yet.");
    expect(html).not.toContain("<form");
    expect(text).not.toContain("Free to join.");
    expect(html).not.toMatch(PROMISE_LINK);
    expect(text).not.toContain(OLD_PITCH);
  });

  it("joining open: the pitch is the front page's lede, then the form, then 'Free to join.' with the link to the promise, then the way to sign in", async () => {
    const html = await invitePage();
    const text = textOf(html);
    expect(text).toContain(HEADING);
    expect(html).toContain("<form");
    expect(html).toMatch(PROMISE_LINK);
    expect(text).not.toContain(OLD_PITCH);
    const order = [
      text.indexOf(HEADING),
      text.indexOf(LEDE),
      text.indexOf("Your email"),
      text.indexOf("Free to join. The promise behind our.one"),
      text.indexOf("Already on our.one? Sign in, then open this link again."),
    ];
    expect(order.every((at) => at >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The form and its words are unchanged.
    expect(text).toContain("We'll email you a link to join.");
    expect(html).toMatch(/<button type="submit"[^>]*>Send me a link<\/button>/);
  });

  it("the pitch is the front page's lede, word for word, from one place; and the link lands on the section about the promise", () => {
    expect(LEDE).toBe(FRONT_LEDE);
    expect(LEDE).toBe(
      "A social network for your friends and the people you choose to follow. Their posts, newest first. No ads and no suggested posts. When you've seen them all, it tells you, and you can get on with your day.",
    );
    const front = renderToStaticMarkup(createElement(FrontPage, { count: null, joining: true, seatsOpen: null }));
    expect(front).toMatch(/<h2 id="front-runs">Keep your people\. Change who runs it\.<\/h2>/);
  });
});
