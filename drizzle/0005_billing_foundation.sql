CREATE TABLE "billing_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"stripe_customer_id" text,
	"usage_tracking_started_at" timestamp with time zone NOT NULL,
	"pending_checkout_session_id" text,
	"pending_checkout_plan_key" text,
	"pending_checkout_expires_at" timestamp with time zone,
	"pending_checkout_idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "billing_accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_accounts_pending_checkout_session_id_unique" UNIQUE("pending_checkout_session_id"),
	CONSTRAINT "billing_accounts_pending_checkout_idempotency_key_unique" UNIQUE("pending_checkout_idempotency_key"),
	CONSTRAINT "billing_accounts_pending_checkout_complete_check" CHECK ((
      "billing_accounts"."pending_checkout_session_id" IS NULL AND
      "billing_accounts"."pending_checkout_plan_key" IS NULL AND
      "billing_accounts"."pending_checkout_expires_at" IS NULL AND
      "billing_accounts"."pending_checkout_idempotency_key" IS NULL
    ) OR (
      "billing_accounts"."pending_checkout_session_id" IS NOT NULL AND
      "billing_accounts"."pending_checkout_plan_key" IS NOT NULL AND "billing_accounts"."pending_checkout_plan_key" IN ('pro', 'enterprise') AND
      "billing_accounts"."pending_checkout_expires_at" IS NOT NULL AND
      "billing_accounts"."pending_checkout_idempotency_key" IS NOT NULL
    ))
);
--> statement-breakpoint
CREATE TABLE "billing_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_account_id" text,
	"idempotency_key" text NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text,
	"batch_id" text,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"details" jsonb,
	CONSTRAINT "billing_audit_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_account_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"grace_started_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"grace_invoice_id" text,
	"pending_plan_key" text,
	"pending_price_id" text,
	"pending_switch_idempotency_key" text,
	"pending_switch_requested_at" timestamp with time zone,
	"last_provider_event_created_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "billing_subscriptions_plan_key_check" CHECK ("billing_subscriptions"."plan_key" IN ('pro', 'enterprise')),
	CONSTRAINT "billing_subscriptions_period_order_check" CHECK ("billing_subscriptions"."current_period_start" IS NULL OR "billing_subscriptions"."current_period_end" IS NULL OR "billing_subscriptions"."current_period_end" >= "billing_subscriptions"."current_period_start"),
	CONSTRAINT "billing_subscriptions_trial_order_check" CHECK ("billing_subscriptions"."trial_start" IS NULL OR "billing_subscriptions"."trial_end" IS NULL OR "billing_subscriptions"."trial_end" >= "billing_subscriptions"."trial_start"),
	CONSTRAINT "billing_subscriptions_grace_order_check" CHECK ("billing_subscriptions"."grace_started_at" IS NULL OR "billing_subscriptions"."grace_until" IS NULL OR "billing_subscriptions"."grace_until" >= "billing_subscriptions"."grace_started_at"),
	CONSTRAINT "billing_subscriptions_pending_switch_complete_check" CHECK ((
      "billing_subscriptions"."pending_plan_key" IS NULL AND "billing_subscriptions"."pending_price_id" IS NULL AND "billing_subscriptions"."pending_switch_idempotency_key" IS NULL AND "billing_subscriptions"."pending_switch_requested_at" IS NULL
    ) OR (
      "billing_subscriptions"."pending_plan_key" IS NOT NULL AND "billing_subscriptions"."pending_plan_key" IN ('pro', 'enterprise') AND "billing_subscriptions"."pending_price_id" IS NOT NULL AND "billing_subscriptions"."pending_switch_idempotency_key" IS NOT NULL AND "billing_subscriptions"."pending_switch_requested_at" IS NOT NULL
    ))
);
--> statement-breakpoint
CREATE TABLE "grandfathering_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"eligibility_rule_version" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"candidate_count" integer,
	"candidate_digest" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grandfathering_batches_status_check" CHECK ("grandfathering_batches"."status" IN ('planned', 'approved', 'applied', 'verified', 'aborted')),
	CONSTRAINT "grandfathering_batches_candidate_count_check" CHECK ("grandfathering_batches"."candidate_count" IS NULL OR "grandfathering_batches"."candidate_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "grandfathering_cohort_members" (
	"batch_id" text NOT NULL,
	"billing_account_id" text NOT NULL,
	"eligibility_reason" text NOT NULL,
	"member_state" text DEFAULT 'candidate' NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"grandfathered_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	CONSTRAINT "grandfathering_cohort_members_pk" PRIMARY KEY("batch_id","billing_account_id"),
	CONSTRAINT "grandfathering_cohort_members_one_batch_per_account_unique" UNIQUE("billing_account_id"),
	CONSTRAINT "grandfathering_cohort_members_state_check" CHECK ("grandfathering_cohort_members"."member_state" IN ('candidate', 'grandfathered', 'converted', 'excluded')),
	CONSTRAINT "grandfathering_cohort_members_applied_check" CHECK ("grandfathering_cohort_members"."member_state" IN ('candidate', 'excluded') OR ("grandfathering_cohort_members"."applied_at" IS NOT NULL AND "grandfathering_cohort_members"."grandfathered_at" IS NOT NULL)),
	CONSTRAINT "grandfathering_cohort_members_conversion_check" CHECK ("grandfathering_cohort_members"."member_state" <> 'converted' OR "grandfathering_cohort_members"."converted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "meeting_start_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"billing_account_id" text NOT NULL,
	"period_start" date NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"reconciliation_state" text DEFAULT 'none' NOT NULL,
	"reconciliation_attempts" integer DEFAULT 0 NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"next_reconciliation_at" timestamp with time zone,
	"stream_event_id" text,
	CONSTRAINT "meeting_start_reservations_stream_event_id_unique" UNIQUE("stream_event_id"),
	CONSTRAINT "meeting_start_reservations_state_check" CHECK ("meeting_start_reservations"."state" IN ('pending', 'committed', 'released', 'expired')),
	CONSTRAINT "meeting_start_reservations_reconcile_state_check" CHECK ("meeting_start_reservations"."reconciliation_state" IN ('none', 'required', 'in_progress', 'confirmed_started', 'confirmed_not_started')),
	CONSTRAINT "meeting_start_reservations_attempts_check" CHECK ("meeting_start_reservations"."reconciliation_attempts" >= 0),
	CONSTRAINT "meeting_start_reservations_lease_check" CHECK ("meeting_start_reservations"."lease_expires_at" > "meeting_start_reservations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "meeting_usage_events" (
	"meeting_id" text PRIMARY KEY NOT NULL,
	"billing_account_id" text NOT NULL,
	"period_start" date NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stream_event_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciliation_state" text DEFAULT 'normal' NOT NULL,
	"details" jsonb,
	CONSTRAINT "meeting_usage_events_stream_event_id_unique" UNIQUE("stream_event_id"),
	CONSTRAINT "meeting_usage_events_period_check" CHECK ("meeting_usage_events"."period_start" = date_trunc('month', "meeting_usage_events"."started_at" AT TIME ZONE 'UTC')::date),
	CONSTRAINT "meeting_usage_events_reconciliation_state_check" CHECK ("meeting_usage_events"."reconciliation_state" IN ('normal', 'reconciled', 'unreserved_start', 'boundary_overage'))
);
--> statement-breakpoint
CREATE TABLE "meeting_usage_periods" (
	"billing_account_id" text NOT NULL,
	"period_start" date NOT NULL,
	"started_count" integer DEFAULT 0 NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_usage_periods_pk" PRIMARY KEY("billing_account_id","period_start"),
	CONSTRAINT "meeting_usage_periods_counts_check" CHECK ("meeting_usage_periods"."started_count" >= 0 AND "meeting_usage_periods"."reserved_count" >= 0),
	CONSTRAINT "meeting_usage_periods_month_start_check" CHECK (EXTRACT(DAY FROM "meeting_usage_periods"."period_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"provider_object_id" text,
	"provider_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_state" text DEFAULT 'received' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_summary" text,
	CONSTRAINT "stripe_webhook_events_state_check" CHECK ("stripe_webhook_events"."processing_state" IN ('received', 'processing', 'processed', 'retry', 'failed', 'stale', 'reconcile')),
	CONSTRAINT "stripe_webhook_events_attempt_count_check" CHECK ("stripe_webhook_events"."attempt_count" >= 0),
	CONSTRAINT "stripe_webhook_events_lease_check" CHECK ("stripe_webhook_events"."processing_state" <> 'processing' OR ("stripe_webhook_events"."lease_token" IS NOT NULL AND "stripe_webhook_events"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "stripe_webhook_events_processed_check" CHECK ("stripe_webhook_events"."processing_state" <> 'processed' OR "stripe_webhook_events"."processed_at" IS NOT NULL),
	CONSTRAINT "stripe_webhook_events_error_length_check" CHECK ("stripe_webhook_events"."last_error_summary" IS NULL OR char_length("stripe_webhook_events"."last_error_summary") <= 512)
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_audit_events" ADD CONSTRAINT "billing_audit_events_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grandfathering_cohort_members" ADD CONSTRAINT "grandfathering_cohort_members_batch_id_grandfathering_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."grandfathering_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grandfathering_cohort_members" ADD CONSTRAINT "grandfathering_cohort_members_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_start_reservations" ADD CONSTRAINT "meeting_start_reservations_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_usage_events" ADD CONSTRAINT "meeting_usage_events_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_usage_periods" ADD CONSTRAINT "meeting_usage_periods_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_audit_events_account_time_idx" ON "billing_audit_events" USING btree ("billing_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "billing_audit_events_source_event_idx" ON "billing_audit_events" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "billing_audit_events_batch_idx" ON "billing_audit_events" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_one_current_per_account_idx" ON "billing_subscriptions" USING btree ("billing_account_id") WHERE "billing_subscriptions"."is_current";--> statement-breakpoint
CREATE INDEX "billing_subscriptions_account_status_idx" ON "billing_subscriptions" USING btree ("billing_account_id","status");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_grace_until_idx" ON "billing_subscriptions" USING btree ("grace_until");--> statement-breakpoint
CREATE INDEX "grandfathering_batches_status_cutoff_idx" ON "grandfathering_batches" USING btree ("status","cutoff_at");--> statement-breakpoint
CREATE INDEX "grandfathering_cohort_members_batch_state_idx" ON "grandfathering_cohort_members" USING btree ("batch_id","member_state");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_start_reservations_one_pending_per_meeting_idx" ON "meeting_start_reservations" USING btree ("meeting_id") WHERE "meeting_start_reservations"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "meeting_start_reservations_account_period_state_idx" ON "meeting_start_reservations" USING btree ("billing_account_id","period_start","state");--> statement-breakpoint
CREATE INDEX "meeting_start_reservations_reconcile_idx" ON "meeting_start_reservations" USING btree ("reconciliation_state","next_reconciliation_at");--> statement-breakpoint
CREATE INDEX "meeting_usage_events_account_period_idx" ON "meeting_usage_events" USING btree ("billing_account_id","period_start");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_retry_idx" ON "stripe_webhook_events" USING btree ("processing_state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_lease_idx" ON "stripe_webhook_events" USING btree ("processing_state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_object_idx" ON "stripe_webhook_events" USING btree ("provider_object_id","provider_created_at");