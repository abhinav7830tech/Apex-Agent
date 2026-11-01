CREATE TABLE "meeting_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"invite_id" text,
	"display_name" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"created_by" text NOT NULL,
	"require_account" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_guests" ADD CONSTRAINT "meeting_guests_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_guests" ADD CONSTRAINT "meeting_guests_invite_id_meeting_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."meeting_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_invites" ADD CONSTRAINT "meeting_invites_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_invites" ADD CONSTRAINT "meeting_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_guests_meeting_id_idx" ON "meeting_guests" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_guests_invite_id_idx" ON "meeting_guests" USING btree ("invite_id");--> statement-breakpoint
CREATE INDEX "meeting_invites_meeting_id_idx" ON "meeting_invites" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_invites_expires_at_idx" ON "meeting_invites" USING btree ("expires_at");