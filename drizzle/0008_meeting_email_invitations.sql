CREATE TABLE "meeting_email_invitations" (
	"request_key" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "creation_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "meeting_email_invitations" ADD CONSTRAINT "meeting_email_invitations_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_email_invitations_meeting_id_idx" ON "meeting_email_invitations" USING btree ("meeting_id");