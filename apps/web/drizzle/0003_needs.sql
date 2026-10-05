CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "needs_text_length" CHECK (char_length("needs"."text") BETWEEN 1 AND 140)
);
--> statement-breakpoint
CREATE INDEX "needs_created_idx" ON "needs" USING btree ("created_at");