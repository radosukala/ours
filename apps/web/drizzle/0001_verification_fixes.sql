ALTER TABLE "mail_log" DROP CONSTRAINT "mail_log_kind";--> statement-breakpoint
CREATE INDEX "rate_events_created_idx" ON "rate_events" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "mail_log" ADD CONSTRAINT "mail_log_kind" CHECK (kind in ('sign_in', 'join', 'digest', 'notice'));