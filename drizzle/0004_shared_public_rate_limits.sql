CREATE TABLE "public_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp NOT NULL,
	"request_count" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "public_rate_limits_window_started_at_idx" ON "public_rate_limits" USING btree ("window_started_at");
