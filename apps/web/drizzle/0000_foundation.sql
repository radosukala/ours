CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"invited_by" text,
	"invites_remaining" integer DEFAULT 10 NOT NULL,
	"accepts_followers" boolean DEFAULT false NOT NULL,
	"weekly_email" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"adult_confirmed_at" timestamp with time zone NOT NULL,
	"feed_last_visit_at" timestamp with time zone,
	"feed_previous_visit_at" timestamp with time zone,
	"notifications_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_handle_unique" UNIQUE("handle"),
	CONSTRAINT "accounts_handle_format" CHECK (handle ~ '^[a-z0-9_]{3,20}$'),
	CONSTRAINT "accounts_invites_remaining_nonnegative" CHECK (invites_remaining >= 0)
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK (blocker_id <> blocked_id)
);
--> statement-breakpoint
CREATE TABLE "digest_deliveries" (
	"account_id" text NOT NULL,
	"week_start" date NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_deliveries_account_id_week_start_pk" PRIMARY KEY("account_id","week_start"),
	CONSTRAINT "digest_deliveries_status" CHECK (status in ('sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"invite_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "email_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "email_tokens_purpose" CHECK (purpose in ('sign_in', 'join')),
	CONSTRAINT "email_tokens_invite_only_for_join" CHECK ((purpose = 'join') = (invite_id is not null))
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id"),
	CONSTRAINT "follows_not_self" CHECK (follower_id <> followee_id)
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friend_requests_status" CHECK (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
	CONSTRAINT "friend_requests_not_self" CHECK (from_id <> to_id)
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"a_id" text NOT NULL,
	"b_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_a_id_b_id_pk" PRIMARY KEY("a_id","b_id"),
	CONSTRAINT "friendships_ordered" CHECK (a_id < b_id)
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"inviter_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"post_id" text NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_post_id_account_id_pk" PRIMARY KEY("post_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "mail_log" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"account_id" text,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_log_kind" CHECK (kind in ('sign_in', 'join', 'digest')),
	CONSTRAINT "mail_log_status" CHECK (status in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "mutes" (
	"muter_id" text NOT NULL,
	"muted_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutes_muter_id_muted_id_pk" PRIMARY KEY("muter_id","muted_id"),
	CONSTRAINT "mutes_not_self" CHECK (muter_id <> muted_id)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"post_id" text,
	"reply_id" text,
	"report_id" text,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_kind" CHECK (kind in ('friend_request', 'friend_accepted', 'invite_joined', 'reply', 'like', 'content_removed', 'report_outcome', 'new_follower')),
	CONSTRAINT "notifications_body_only_for_reasons" CHECK (body is null or kind in ('content_removed', 'report_outcome'))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_joins" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"invite_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removal_category" text,
	"removal_reason" text,
	CONSTRAINT "posts_audience" CHECK (audience in ('friends', 'followers'))
);
--> statement-breakpoint
CREATE TABLE "rate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removal_category" text,
	"removal_reason" text
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text,
	"target_kind" text NOT NULL,
	"target_post_id" text,
	"target_reply_id" text,
	"target_account_id" text,
	"category" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_target_kind" CHECK (target_kind in ('post', 'reply', 'account')),
	CONSTRAINT "reports_category" CHECK (category in ('spam', 'harassment', 'illegal', 'other')),
	CONSTRAINT "reports_status" CHECK (status in ('open', 'actioned', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invited_by_accounts_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_accounts_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_accounts_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_accounts_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_accounts_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_id_accounts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_id_accounts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_a_id_accounts_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_b_id_accounts_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_id_accounts_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_accounts_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_log" ADD CONSTRAINT "mail_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muter_id_accounts_id_fk" FOREIGN KEY ("muter_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_id_accounts_id_fk" FOREIGN KEY ("muted_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_accounts_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_joins" ADD CONSTRAINT "pending_joins_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_accounts_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_post_id_posts_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_reply_id_replies_id_fk" FOREIGN KEY ("target_reply_id") REFERENCES "public"."replies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_decided_by_accounts_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_one_pending_per_pair" ON "friend_requests" USING btree (least(from_id, to_id),greatest(from_id, to_id)) WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_to_idx" ON "friend_requests" USING btree ("to_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_from_idx" ON "friend_requests" USING btree ("from_id","status");--> statement-breakpoint
CREATE INDEX "friendships_b_idx" ON "friendships" USING btree ("b_id");--> statement-breakpoint
CREATE INDEX "invites_inviter_idx" ON "invites" USING btree ("inviter_id","created_at");--> statement-breakpoint
CREATE INDEX "likes_account_idx" ON "likes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rate_events_key_created_idx" ON "rate_events" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "replies_post_created_idx" ON "replies" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");