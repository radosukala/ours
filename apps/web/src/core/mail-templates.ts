/**
 * Every email OURS sends, as plain text. The claims scan reads this file.
 *
 * No template includes a post's text: the weekly email names who posted,
 * never what (D-0011 §D.5).
 */

export type MailContent = { subject: string; body: string };

export function signInEmail(url: string): MailContent {
  return {
    subject: "Your sign-in link for OURS",
    body: [
      "Here's your link to sign in to OURS:",
      "",
      url,
      "",
      "It works once, for 15 minutes.",
      "",
      "If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.",
    ].join("\n"),
  };
}

export function joinEmail(url: string, inviterName: string): MailContent {
  return {
    subject: `${inviterName} invited you to OURS`,
    body: [
      `${inviterName} invited you to connect on OURS.`,
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
    subject: "This week on OURS",
    body: [
      ...names,
      "",
      `Open OURS: ${base}/home`,
      "",
      `Stop these emails: ${unsubUrl}`,
    ].join("\n"),
  };
}
