ALTER TYPE "public"."meeting_status" ADD VALUE 'scheduled' BEFORE 'upcoming';--> statement-breakpoint
ALTER TYPE "public"."meeting_status" ADD VALUE 'failed' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'meeting_updated' BEFORE 'summary_ready';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'meeting_failed' BEFORE 'summary_ready';--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"speaker_id" text NOT NULL,
	"speaker_name" text DEFAULT 'Unknown' NOT NULL,
	"text" text NOT NULL,
	"start_ms" integer DEFAULT 0 NOT NULL,
	"end_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "role" text DEFAULT 'Meeting Assistant';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "avatar_variant" text DEFAULT 'botttsNeutral';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "duration_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "participants" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "stream_call_id" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "detailed_summary" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "key_topics" text[];--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "unresolved_questions" text[];--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "highlights" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "follow_up_recommendations" text[];--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "analysis_error" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_segments_meeting_id_idx" ON "transcript_segments" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_start_ms_idx" ON "transcript_segments" USING btree ("start_ms");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_user_id_idx" ON "meetings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_scheduled_at_idx" ON "meetings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "meetings_agent_id_idx" ON "meetings" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");