/**
 * The floor rules shown on /rules, and how each one is held.
 *
 * Only /rules imports this file (tests/claims.test.ts checks that), because
 * it holds NO_ALGORITHM_SENTENCE, the one sentence SPEC §12 allows on
 * /rules and nowhere else; the claims scan's allowlist names this file.
 *
 * Each rule carries its enforcement class (AGENTS.md §7); RuleList.tsx
 * holds the classes and their plain words. A test file named here must be
 * one SPEC §14 assigns to a module (checked in tests/transparency.test.ts).
 */
import { DEFAULT_INVITES, FEED_WINDOW_DAYS, INVITE_TTL_DAYS } from "@/core/config";
import type { RuleGroup } from "./RuleList";

export const NO_ALGORITHM_SENTENCE = "No algorithm decides the order.";

export const FLOOR_RULES: RuleGroup[] = [
  {
    title: "Joining",
    rules: [
      {
        id: "invite-only",
        text: "Accounts exist only by invitation. Every account except the founder's is invited by a person.",
        more: "The founder's account is the first one, so nobody could invite it.",
        cls: "ENFORCED",
        tests: ["tests/invites.test.ts", "tests/accounts.test.ts"],
      },
      {
        id: "invites",
        text: `Each person starts with ${DEFAULT_INVITES} invites. An invite works once and expires after ${INVITE_TTL_DAYS} days.`,
        more: `${DEFAULT_INVITES} is a founder default, chosen by the founder for the start.`,
        cls: "ENFORCED",
        tests: ["tests/invites.test.ts"],
      },
      {
        id: "adults",
        text: "Adults only. When you join, you confirm that you're 18 or older.",
        more: "It's self-attested: the box must be ticked to join, but nobody checks what you tick.",
        cls: "DECLARED",
      },
      {
        id: "controller",
        text: "Nobody new can join until a person or body is named as responsible for the data.",
        cls: "ENFORCED",
        tests: ["tests/invites.test.ts"],
      },
    ],
  },
  {
    title: "Connections",
    rules: [
      {
        id: "friendship",
        text: "Friendship is mutual: both people agree.",
        more: "If you decline a friend request, the person who sent it isn't told, but they can see that it is no longer waiting.",
        cls: "ENFORCED",
        tests: ["tests/connections.test.ts"],
      },
      {
        id: "following",
        text: "Following is one-way, and only possible toward someone who has chosen to accept followers.",
        cls: "ENFORCED",
        tests: ["tests/connections.test.ts"],
      },
      {
        id: "blocking",
        text: "A block works at once and both ways. It ends the friendship and any following, hides each of you from the other, and stops new requests, follows, replies and likes between you.",
        more: "Usernames are unique, so trying to take one tells you whether it's in use — even by someone who blocked you. Trying a new username is limited to 5 tries a day, taken names included.",
        cls: "ENFORCED",
        tests: [
          "tests/blocks.test.ts",
          "tests/visibility.test.ts",
          "tests/posts.test.ts",
          "tests/likes.test.ts",
          "tests/accounts.test.ts",
        ],
      },
      {
        id: "muting",
        text: "Muting hides someone's posts from your feed and your weekly email. It's private, and they aren't told.",
        cls: "ENFORCED",
        tests: ["tests/feed.test.ts", "tests/digest.test.ts", "tests/connections.test.ts"],
      },
    ],
  },
  {
    title: "Posts and the feed",
    rules: [
      {
        id: "audience",
        text: "A post for friends is seen only by your friends. A post for friends and followers is seen by both. Nobody else sees either, except an administrator reading it because it was reported.",
        cls: "ENFORCED",
        tests: ["tests/visibility.test.ts", "tests/posts.test.ts", "tests/moderation.test.ts"],
      },
      {
        id: "feed",
        text: `Your feed shows the posts of the people you chose, newest first, from the last ${FEED_WINDOW_DAYS} days. Then it ends.`,
        more: NO_ALGORITHM_SENTENCE,
        cls: "ENFORCED",
        tests: ["tests/feed.test.ts"],
      },
      {
        id: "likes",
        text: "Only the author of a post sees who liked it, and how many.",
        cls: "ENFORCED",
        tests: ["tests/likes.test.ts"],
      },
      {
        id: "weekly-email",
        text: "The weekly email says who posted, never what. You can stop it from the email itself, without signing in.",
        cls: "ENFORCED",
        tests: ["tests/digest.test.ts"],
      },
      {
        id: "not-built",
        text: "There is no search, no suggested people, no contact upload, no advertising and, for now, no photos.",
        more: "Nothing checks this automatically. The code is open, so anyone can look.",
        cls: "DECLARED",
      },
    ],
  },
  {
    title: "Safety",
    rules: [
      {
        id: "reports",
        text: "Anyone can report a post, a reply or a person. A person reads every report and decides what happens.",
        more: "No administrator exists until our.one is deployed; then it will be the founder, the only one. If you think a decision is wrong, write to the data controller, whose address is on the privacy page once one is named.",
        cls: "INTERPRETED",
      },
      {
        id: "queue",
        text: "Only an administrator can open the report queue. Admins can read reported content through the queue only; it shows what was reported, whoever it was shared with, because that is what it's for.",
        cls: "ENFORCED",
        tests: ["tests/moderation.test.ts"],
      },
      {
        id: "removal",
        text: "If something you posted is removed, it disappears for everyone else, and you see why.",
        cls: "ENFORCED",
        tests: ["tests/moderation.test.ts"],
      },
      {
        id: "limits",
        text: "Limits stop floods of sign-in emails, posts and reports.",
        cls: "ENFORCED",
        tests: ["tests/signin.test.ts", "tests/posts.test.ts", "tests/reports.test.ts"],
      },
    ],
  },
  {
    title: "Your data",
    rules: [
      {
        id: "export-delete",
        text: "You can download your data, and delete your account, in Settings while your account is active. Deleting removes your posts, replies, likes, connections and sessions.",
        more: "If your account is suspended, write to the data controller to get a copy or have it deleted; the address is on the privacy page once one is named.",
        cls: "ENFORCED",
        tests: ["tests/export.test.ts", "tests/accounts.test.ts"],
      },
      {
        id: "others-data",
        text: "Nobody can export your data or edit what you wrote. The author of a post can delete replies to it, and an administrator can remove content with a statement of reasons.",
        cls: "ENFORCED",
        tests: [
          "tests/export.test.ts",
          "tests/accounts.test.ts",
          "tests/posts.test.ts",
          "tests/moderation.test.ts",
        ],
      },
    ],
  },
  {
    title: "These pages",
    rules: [
      {
        id: "claims",
        text: "The public pages make no claim that hasn't happened, such as who owns our.one, how contributions are taxed, or how fast it will grow.",
        more: "The check looks for words, not meaning: it can't tell a claim from its denial, or spot one made in other words. So it reports, and a person reads what it flags.",
        cls: "CHECKED",
        tests: ["tests/claims.test.ts"],
      },
    ],
  },
];
