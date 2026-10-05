CREATE TABLE "needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"named_on" date DEFAULT (now() at time zone 'utc')::date NOT NULL,
	CONSTRAINT "needs_body_length" CHECK (char_length("body") between 1 and 140)
);
