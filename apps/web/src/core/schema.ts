/**
 * The data model, exactly as SPEC §5 states it.
 *
 * All timestamps are timestamptz. Ids are ulid text. Emails are stored
 * lowercased and trimmed; handles lowercased. Columns whose values the
 * spec enumerates carry a check constraint with those values, so the
 * database refuses a value the spec does not allow.
 *
 * Migrations are generated from this file (`pnpm --filter @ours/web
 * db:generate`) into drizzle/, and never hand-edited after commit.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DEFAULT_INVITES } from "./config";

const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/* ---------------------------------------------------------------- values */

export const EMAIL_TOKEN_PURPOSES = ["sign_in", "join"] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

export const FRIEND_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

export const AUDIENCES = ["friends", "followers"] as const;
/** 'followers' means friends *and* followers. */
export type Audience = (typeof AUDIENCES)[number];

export const NOTIFICATION_KINDS = [
  "friend_request",
  "friend_accepted",
  "invite_joined",
  "reply",
  "like",
  "content_removed",
  "report_outcome",
  "new_follower",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const REPORT_TARGET_KINDS = ["post", "reply", "account"] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "illegal",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** `notice`: the one email a suspended person is sent (SPEC §17 item 14). */
export const MAIL_KINDS = ["sign_in", "join", "digest", "notice"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export const MAIL_STATUSES = ["sent", "failed"] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];

export const DIGEST_STATUSES = ["sent", "failed", "skipped"] as const;
export type DigestStatus = (typeof DIGEST_STATUSES)[number];

/** `status in ('a', 'b')` for a check constraint. Values are our own constants. */
function oneOf(column: string, values: readonly string[]) {
  return sql.raw(
    `${column} in (${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`,
  );
}

/* -------------------------------------------------------------- accounts */

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    handle: text("handle").notNull().unique(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    /** Null only for a seeded founder. */
    invitedBy: text("invited_by").references((): AnyPgColumn => accounts.id, {
      onDelete: "set null",
    }),
    invitesRemaining: integer("invites_remaining")
      .notNull()
      .default(DEFAULT_INVITES),
    acceptsFollowers: boolean("accepts_followers").notNull().default(false),
    weeklyEmail: boolean("weekly_email").notNull().default(true),
    isAdmin: boolean("is_admin").notNull().default(false),
    suspendedAt: tstz("suspended_at"),
    /** Self-attested 18+ at joining. */
    adultConfirmedAt: tstz("adult_confirmed_at").notNull(),
    feedLastVisitAt: tstz("feed_last_visit_at"),
    feedPreviousVisitAt: tstz("feed_previous_visit_at"),
    notificationsSeenAt: tstz("notifications_seen_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  () => [
    check("accounts_handle_format", sql`handle ~ '^[a-z0-9_]{3,20}$'`),
    check("accounts_invites_remaining_nonnegative", sql`invites_remaining >= 0`),
  ],
);

/* --------------------------------------------------------------- invites */

export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    /** sha256 hex of the code; the code is shown to the inviter once. */
    codeHash: text("code_hash").notNull().unique(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** ≤40 chars, private to the inviter. */
    note: text("note").notNull().default(""),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    usedBy: text("used_by").references(() => accounts.id, {
      onDelete: "set null",
    }),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [index("invites_inviter_idx").on(t.inviterId, t.createdAt)],
);

/* ---------------------------------------------------------- email_tokens */

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: text("id").primaryKey(),
    /** sha256 hex of the raw token; the raw token exists only in the email. */
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    purpose: text("purpose", { enum: EMAIL_TOKEN_PURPOSES }).notNull(),
    /** Set only for 'join'. */
    inviteId: text("invite_id").references(() => invites.id, {
      onDelete: "cascade",
    }),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
  },
  () => [
    check("email_tokens_purpose", oneOf("purpose", EMAIL_TOKEN_PURPOSES)),
    check(
      "email_tokens_invite_only_for_join",
      sql`(purpose = 'join') = (invite_id is not null)`,
    ),
  ],
);

/* --------------------------------------------------------- pending_joins */

export const pendingJoins = pgTable("pending_joins", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  inviteId: text("invite_id")
    .notNull()
    .references(() => invites.id, { onDelete: "cascade" }),
  createdAt: tstz("created_at").notNull().defaultNow(),
  expiresAt: tstz("expires_at").notNull(),
  completedAt: tstz("completed_at"),
});

/* -------------------------------------------------------------- sessions */

/** No IP address or user agent is stored. */
export const sessions = pgTable(
  "sessions",
  {
    /** 32 random bytes, base64url; the cookie carries `id.hmac(id)`. */
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [index("sessions_account_idx").on(t.accountId)],
);

/* ------------------------------------------------------- friend_requests */

export const friendRequests = pgTable(
  "friend_requests",
  {
    id: text("id").primaryKey(),
    fromId: text("from_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: text("status", { enum: FRIEND_REQUEST_STATUSES }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    respondedAt: tstz("responded_at"),
  },
  (t) => [
    check("friend_requests_status", oneOf("status", FRIEND_REQUEST_STATUSES)),
    check("friend_requests_not_self", sql`from_id <> to_id`),
    // At most one pending request per unordered pair.
    uniqueIndex("friend_requests_one_pending_per_pair")
      .on(sql`least(from_id, to_id)`, sql`greatest(from_id, to_id)`)
      .where(sql`status = 'pending'`),
    index("friend_requests_to_idx").on(t.toId, t.status),
    index("friend_requests_from_idx").on(t.fromId, t.status),
  ],
);

/* ----------------------------------------------------------- friendships */

export const friendships = pgTable(
  "friendships",
  {
    /** Always the smaller id. */
    aId: text("a_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Always the larger id. */
    bId: text("b_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.aId, t.bId] }),
    check("friendships_ordered", sql`a_id < b_id`),
    index("friendships_b_idx").on(t.bId),
  ],
);

/* --------------------------------------------------------------- follows */

export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("follows_not_self", sql`follower_id <> followee_id`),
    index("follows_followee_idx").on(t.followeeId),
  ],
);

/* -------------------------------------------------------- blocks, mutes */

export const blocks = pgTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("blocks_not_self", sql`blocker_id <> blocked_id`),
    index("blocks_blocked_idx").on(t.blockedId),
  ],
);

export const mutes = pgTable(
  "mutes",
  {
    muterId: text("muter_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    mutedId: text("muted_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.muterId, t.mutedId] }),
    check("mutes_not_self", sql`muter_id <> muted_id`),
  ],
);

/* ----------------------------------------------------------------- posts */

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** 1–2000 chars after trim. */
    body: text("body").notNull(),
    audience: text("audience", { enum: AUDIENCES }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    removedAt: tstz("removed_at"),
    removalCategory: text("removal_category"),
    /** The statement of reasons shown to the author. */
    removalReason: text("removal_reason"),
  },
  (t) => [
    check("posts_audience", oneOf("audience", AUDIENCES)),
    index("posts_author_created_idx").on(t.authorId, t.createdAt.desc()),
  ],
);

/* --------------------------------------------------------------- replies */

export const replies = pgTable(
  "replies",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** 1–1000 chars after trim. */
    body: text("body").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    removedAt: tstz("removed_at"),
    removalCategory: text("removal_category"),
    removalReason: text("removal_reason"),
  },
  (t) => [index("replies_post_created_idx").on(t.postId, t.createdAt)],
);

/* ----------------------------------------------------------------- likes */

export const likes = pgTable(
  "likes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.accountId] }),
    index("likes_account_idx").on(t.accountId),
  ],
);

/* --------------------------------------------------------------- reports */

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    targetKind: text("target_kind", { enum: REPORT_TARGET_KINDS }).notNull(),
    targetPostId: text("target_post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    targetReplyId: text("target_reply_id").references(() => replies.id, {
      onDelete: "set null",
    }),
    targetAccountId: text("target_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    category: text("category", { enum: REPORT_CATEGORIES }).notNull(),
    /** ≤500 chars. */
    details: text("details").notNull().default(""),
    status: text("status", { enum: REPORT_STATUSES })
      .notNull()
      .default("open"),
    decidedBy: text("decided_by").references(() => accounts.id, {
      onDelete: "set null",
    }),
    decidedAt: tstz("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("reports_target_kind", oneOf("target_kind", REPORT_TARGET_KINDS)),
    check("reports_category", oneOf("category", REPORT_CATEGORIES)),
    check("reports_status", oneOf("status", REPORT_STATUSES)),
    index("reports_status_created_idx").on(t.status, t.createdAt),
  ],
);

/* --------------------------------------------------------- notifications */

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    actorId: text("actor_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    postId: text("post_id").references(() => posts.id, {
      onDelete: "cascade",
    }),
    replyId: text("reply_id").references(() => replies.id, {
      onDelete: "cascade",
    }),
    reportId: text("report_id").references(() => reports.id, {
      onDelete: "cascade",
    }),
    /** Only for content_removed and report_outcome: the statement of reasons. */
    body: text("body"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    readAt: tstz("read_at"),
  },
  (t) => [
    check("notifications_kind", oneOf("kind", NOTIFICATION_KINDS)),
    check(
      "notifications_body_only_for_reasons",
      sql`body is null or kind in ('content_removed', 'report_outcome')`,
    ),
    index("notifications_recipient_created_idx").on(
      t.recipientId,
      t.createdAt.desc(),
    ),
  ],
);

/* ----------------------------------------------------------- rate_events */

/**
 * Keys: signin:email:<h>, signin:ip:<h>, join:email:<h>, join:ip:<h>,
 * join:invite:<inviteId>, post:<accountId>, reply:<accountId>,
 * friendreq:<accountId>, follow:<accountId>, report:<accountId>,
 * invite:<accountId>, handle:<accountId>, seat:email:<h>, seat:ip:<h>.
 * `<h>` is `rateKeyHash` (limits.ts).
 *
 * The index on `created_at` alone serves the prune every `hit()` runs over
 * all keys (SPEC §17 item 3); without it that delete scans the table.
 */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("rate_events_key_created_idx").on(t.key, t.createdAt),
    index("rate_events_created_idx").on(t.createdAt),
  ],
);

/* ---------------------------------------------------------------- outbox */

/** The development mail transport. `kind` is one of MAIL_KINDS (typed, not checked). */
export const outbox = pgTable("outbox", {
  id: text("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  kind: text("kind", { enum: MAIL_KINDS }).notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

/* -------------------------------------------------------------- mail_log */

/** No address is stored here. */
export const mailLog = pgTable(
  "mail_log",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: MAIL_KINDS }).notNull(),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: MAIL_STATUSES }).notNull(),
    errorCode: text("error_code"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  () => [
    check("mail_log_kind", oneOf("kind", MAIL_KINDS)),
    check("mail_log_status", oneOf("status", MAIL_STATUSES)),
  ],
);

/* ----------------------------------------------------- digest_deliveries */

export const digestDeliveries = pgTable(
  "digest_deliveries",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Monday 00:00 UTC of the week, as YYYY-MM-DD. */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    status: text("status", { enum: DIGEST_STATUSES }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.weekStart] }),
    check("digest_deliveries_status", oneOf("status", DIGEST_STATUSES)),
  ],
);

/* ------------------------------------------------ seat_state, waitlist */

/**
 * Seats (SPEC §18.4, M-0011): one row, id 'seats', made the first time a
 * seat is asked for or opened. `open` is how many seats an administrator
 * opened that nobody has taken yet. The checks keep it to that one row and
 * never below zero, whatever the code does.
 */
export const seatState = pgTable(
  "seat_state",
  {
    id: text("id").primaryKey(),
    open: integer("open").notNull().default(0),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  () => [
    check("seat_state_open_nonnegative", sql`"open" >= 0`),
    check("seat_state_one_row", sql`id = 'seats'`),
  ],
);

/**
 * The waiting list (SPEC §18.4): an address (normalized, like
 * `accounts.email`) and when it was added. Nothing else is kept. An address
 * leaves when it is invited, or when its owner asks.
 */
export const waitlist = pgTable(
  "waitlist",
  {
    email: text("email").primaryKey(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  // Oldest first is the order a wave of seats invites in.
  (t) => [index("waitlist_created_idx").on(t.createdAt, t.email)],
);

/* ---------------------------------------------------------------- needs */

/**
 * A need named on the front door (D-0024 §C, SPEC §18.23): the answer to
 * "Which app would you take back?", and the day it was written (needs.ts
 * keeps the day, not the moment). The check keeps it to the words, at most
 * 140 characters, and the table has no column for anything else: no
 * address. Kept for 12 months, or until a decision publishes or deletes
 * them.
 */
export const needs = pgTable(
  "needs",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("needs_text_length", sql`char_length(${t.text}) BETWEEN 1 AND 140`),
    index("needs_created_idx").on(t.createdAt),
  ],
);

/* ----------------------------------------------------------------- types */

export type Account = typeof accounts.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type EmailToken = typeof emailTokens.$inferSelect;
export type PendingJoin = typeof pendingJoins.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type Mute = typeof mutes.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type Like = typeof likes.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type RateEvent = typeof rateEvents.$inferSelect;
export type OutboxMessage = typeof outbox.$inferSelect;
export type MailLogEntry = typeof mailLog.$inferSelect;
export type DigestDelivery = typeof digestDeliveries.$inferSelect;
export type SeatState = typeof seatState.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
export type Need = typeof needs.$inferSelect;
