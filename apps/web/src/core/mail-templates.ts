/**
 * Every email OURS sends, as plain text. The claims scan reads this file.
 *
 * No template includes a post's text: the weekly email names who posted,
 * never what (D-0011 §D.5).
 */
import { EMAIL_TOKEN_TTL_MINUTES } from "./config";

export type MailContent = { subject: string; body: string };

export function signInEmail(url: string): MailContent {
  return {
    subject: "Your sign-in link for our.one",
    body: [
      "Here's your link to sign in to our.one:",
      "",
      url,
      "",
      "It works once, for 15 minutes.",
      "",
      "If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.",
    ].join("\n"),
  };
}

/**
 * The join link. The body names the inviter as "Name (@handle)", as the
 * invite page does (SPEC §17 item 2): a display name alone can be copied by
 * anyone, a handle cannot. The handle has a default, so `joinEmail.length`
 * stays 2: a link and a name, never a post.
 */
export function joinEmail(
  url: string,
  inviterName: string,
  inviterHandle: string | null = null,
): MailContent {
  const inviter = inviterHandle ? `${inviterName} (@${inviterHandle})` : inviterName;
  return {
    // The handle is in the subject too: a display name alone can be copied.
    subject: `${inviter} invited you to our.one`,
    body: [
      `${inviter} invited you to connect on our.one.`,
      "",
      "Open this link to join:",
      "",
      url,
      "",
      "It works once, for 15 minutes.",
      "",
      "If you weren't expecting this, you can ignore this email. Nothing is created unless you open the link and join.",
    ].join("\n"),
  };
}

/**
 * The one email a suspended person is sent (SPEC §17 item 14): that the
 * account is suspended, the statement of reasons as the administrator wrote
 * it, and where to write. While no data controller is named, it says so
 * instead of inventing an address (SPEC §2 rule 6).
 *
 * It also says how to get a copy of your data or have it deleted, since a
 * suspended account can do neither in Settings, as /rules and /privacy say
 * (the final verification's honesty-2).
 */
export function suspensionEmail(
  reason: string,
  controllerEmail: string | null,
): MailContent {
  return {
    subject: "Your our.one account is suspended",
    body: [
      "Your our.one account is suspended. You can't sign in, and your profile, posts and replies are hidden from everyone.",
      "",
      "The reason, as the administrator wrote it:",
      "",
      reason,
      "",
      controllerEmail
        ? `If you think this is wrong, write to ${controllerEmail}.`
        : "If you think this is wrong, the address to write to is not named yet.",
      "",
      "While your account is suspended, you can't download your data or delete your account in Settings.",
      controllerEmail
        ? `To get a copy or have it deleted, write to ${controllerEmail}.`
        : "To get a copy or have it deleted, write to the data controller; the address to write to is not named yet.",
    ].join("\n"),
  };
}

/** One line of the weekly email: a person and how many times they posted. */
export type DigestLine = { name: string; posts: number };

const DIGEST_NAMES = 5;

function postedTimes(n: number): string {
  return n === 1 ? "once" : `${n} times`;
}

/**
 * The weekly email. Up to five names with how often each posted, then
 * "and N others". Never the text of a post.
 */
export function digestEmail(
  lines: DigestLine[],
  appUrl: string,
  unsubUrl: string,
): MailContent {
  const shown = lines.slice(0, DIGEST_NAMES);
  const rest = lines.length - shown.length;
  const names = shown.map((l) => `${l.name} posted ${postedTimes(l.posts)}.`);
  if (rest > 0) names.push(rest === 1 ? "and 1 other" : `and ${rest} others`);
  const base = appUrl.replace(/\/+$/, "");
  return {
    subject: "This week on our.one",
    body: [
      ...names,
      "",
      `Open our.one: ${base}/home`,
      "",
      `Stop these emails: ${unsubUrl}`,
    ].join("\n"),
  };
}

/**
 * The seat email (SPEC §18.4): the join link for a seat, sent when someone
 * takes one on the front page or is invited from the waiting list. The
 * link is an ordinary join link, so its lifetime is the join link's, and
 * the body states it from the same constant.
 */
export function seatEmail(url: string): MailContent {
  return {
    subject: "Your seat on our.one",
    body: [
      `You asked for a seat on our.one. Here is your link to join. It works once and expires in ${EMAIL_TOKEN_TTL_MINUTES} minutes.`,
      "",
      url,
      "",
      "If you didn't ask, ignore this email. Nothing is kept unless you join.",
    ].join("\n"),
  };
}
