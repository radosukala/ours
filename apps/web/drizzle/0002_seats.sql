CREATE TABLE "seat_state" (
	"id" text PRIMARY KEY NOT NULL,
	"open" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_state_open_nonnegative" CHECK ("open" >= 0),
	CONSTRAINT "seat_state_one_row" CHECK (id = 'seats')
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "waitlist_created_idx" ON "waitlist" USING btree ("created_at","email");