ALTER TABLE "meetings" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "summary_email_sent_at" timestamp;--> statement-breakpoint
CREATE INDEX "meetings_reminder_sent_at_idx" ON "meetings" USING btree ("reminder_sent_at");