ALTER TABLE "meetings" ADD COLUMN "passcode_hash" text;
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"user_id" text,
	"guest_id" text,
	"name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'participant' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_guest_id_meeting_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."meeting_guests"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants" USING btree ("meeting_id");
--> statement-breakpoint
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "meeting_participants_role_idx" ON "meeting_participants" USING btree ("role");
