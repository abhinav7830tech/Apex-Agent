import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  date,
  jsonb,
  index,
  uniqueIndex,
  check,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export const notificationType = pgEnum("notification_type", [
  "meeting_reminder",
  "meeting_started",
  "meeting_ended",
  "meeting_cancelled",
  "meeting_updated",
  "meeting_failed",
  "summary_ready",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    meetingId: text("meeting_id"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

export const agents = pgTable(
  "agents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    instructions: text("instructions").notNull(),
    description: text("description"),
    role: text("role").default("Meeting Assistant"),
    avatarVariant: text("avatar_variant").default("botttsNeutral"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("agents_user_id_idx").on(table.userId)],
);

export const meetingStatus = pgEnum("meeting_status", [
  "scheduled",
  "upcoming",
  "active",
  "completed",
  "processing",
  "failed",
  "cancelled",
]);

export const meetings = pgTable(
  "meetings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    description: text("description"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    status: meetingStatus("status").notNull().default("upcoming"),
    visibility: text("visibility").notNull().default("private"),
    passcodeHash: text("passcode_hash"),
    scheduledAt: timestamp("scheduled_at"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    endsAt: timestamp("ends_at"),
    timezone: text("timezone").notNull().default("UTC"),
    participants: text("participants").array().default([]),
    streamCallId: text("stream_call_id"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    transcriptUrl: text("transcript_url"),
    transcript: text("transcript"),
    recordingUrl: text("recording_url"),
    summary: text("summary"),
    detailedSummary: text("detailed_summary"),
    keyTopics: text("key_topics").array(),
    keyDecisions: text("key_decisions").array(),
    actionItems: text("action_items"),
    unresolvedQuestions: text("unresolved_questions").array(),
    highlights: text("highlights"),
    followUpRecommendations: text("follow_up_recommendations").array(),
    sentiment: text("sentiment"),
    talkTimePerUser: text("talk_time_per_user"),
    analysisError: text("analysis_error"),
    processedAt: timestamp("processed_at"),
    reminderSentAt: timestamp("reminder_sent_at"),
    summaryEmailSentAt: timestamp("summary_email_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("meetings_user_id_idx").on(table.userId),
    index("meetings_status_idx").on(table.status),
    index("meetings_scheduled_at_idx").on(table.scheduledAt),
    index("meetings_agent_id_idx").on(table.agentId),
    index("meetings_reminder_sent_at_idx").on(table.reminderSentAt),
  ],
);

export const meetingInvites = pgTable(
  "meeting_invites",
  {
    // The id is the unguessable invitation token. It is never derived from
    // the meeting id so a leaked meeting id cannot be used to join.
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid(32)),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // When true, only signed-in Apex Agent users may join through this link.
    requireAccount: boolean("require_account").notNull().default(false),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("meeting_invites_meeting_id_idx").on(table.meetingId),
    index("meeting_invites_expires_at_idx").on(table.expiresAt),
  ],
);

export const meetingGuests = pgTable(
  "meeting_guests",
  {
    // Also used as the Stream user id for anonymous guests.
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `guest_${nanoid(16)}`),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    inviteId: text("invite_id").references(() => meetingInvites.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (table) => [
    index("meeting_guests_meeting_id_idx").on(table.meetingId),
    index("meeting_guests_invite_id_idx").on(table.inviteId),
  ],
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    guestId: text("guest_id").references(() => meetingGuests.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role").notNull().default("participant"),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    leftAt: timestamp("left_at"),
  },
  (table) => [
    index("meeting_participants_meeting_id_idx").on(table.meetingId),
    index("meeting_participants_user_id_idx").on(table.userId),
    index("meeting_participants_role_idx").on(table.role),
  ],
);

export const publicRateLimits = pgTable(
  "public_rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: integer("request_count").notNull(),
  },
  (table) => [index("public_rate_limits_window_started_at_idx").on(table.windowStartedAt)],
);

/** Durable billing identity. userId becomes NULL on account deletion so billing history can be retained. */
export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    userId: text("user_id").unique().references(() => user.id, { onDelete: "set null" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    usageTrackingStartedAt: timestamp("usage_tracking_started_at", { withTimezone: true, mode: "date" }).notNull(),
    pendingCheckoutSessionId: text("pending_checkout_session_id").unique(),
    pendingCheckoutPlanKey: text("pending_checkout_plan_key"),
    pendingCheckoutExpiresAt: timestamp("pending_checkout_expires_at", { withTimezone: true, mode: "date" }),
    pendingCheckoutIdempotencyKey: text("pending_checkout_idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("billing_accounts_pending_checkout_complete_check", sql`(
      ${table.pendingCheckoutSessionId} IS NULL AND
      ${table.pendingCheckoutPlanKey} IS NULL AND
      ${table.pendingCheckoutExpiresAt} IS NULL AND
      ${table.pendingCheckoutIdempotencyKey} IS NULL
    ) OR (
      ${table.pendingCheckoutSessionId} IS NOT NULL AND
      ${table.pendingCheckoutPlanKey} IS NOT NULL AND ${table.pendingCheckoutPlanKey} IN ('pro', 'enterprise') AND
      ${table.pendingCheckoutExpiresAt} IS NOT NULL AND
      ${table.pendingCheckoutIdempotencyKey} IS NOT NULL
    )`),
  ],
);

/** Provider state is a snapshot; `isCurrent` is protected by a partial unique index. */
export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "restrict" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    planKey: text("plan_key").notNull(),
    status: text("status").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true, mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: "date" }),
    trialStart: timestamp("trial_start", { withTimezone: true, mode: "date" }),
    trialEnd: timestamp("trial_end", { withTimezone: true, mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelAt: timestamp("cancel_at", { withTimezone: true, mode: "date" }),
    canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    graceStartedAt: timestamp("grace_started_at", { withTimezone: true, mode: "date" }),
    graceUntil: timestamp("grace_until", { withTimezone: true, mode: "date" }),
    graceInvoiceId: text("grace_invoice_id"),
    pendingPlanKey: text("pending_plan_key"),
    pendingPriceId: text("pending_price_id"),
    pendingSwitchIdempotencyKey: text("pending_switch_idempotency_key"),
    pendingSwitchRequestedAt: timestamp("pending_switch_requested_at", { withTimezone: true, mode: "date" }),
    lastProviderEventCreatedAt: timestamp("last_provider_event_created_at", { withTimezone: true, mode: "date" }),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("billing_subscriptions_plan_key_check", sql`${table.planKey} IN ('pro', 'enterprise')`),
    check("billing_subscriptions_period_order_check", sql`${table.currentPeriodStart} IS NULL OR ${table.currentPeriodEnd} IS NULL OR ${table.currentPeriodEnd} >= ${table.currentPeriodStart}`),
    check("billing_subscriptions_trial_order_check", sql`${table.trialStart} IS NULL OR ${table.trialEnd} IS NULL OR ${table.trialEnd} >= ${table.trialStart}`),
    check("billing_subscriptions_grace_order_check", sql`${table.graceStartedAt} IS NULL OR ${table.graceUntil} IS NULL OR ${table.graceUntil} >= ${table.graceStartedAt}`),
    check("billing_subscriptions_pending_switch_complete_check", sql`(
      ${table.pendingPlanKey} IS NULL AND ${table.pendingPriceId} IS NULL AND ${table.pendingSwitchIdempotencyKey} IS NULL AND ${table.pendingSwitchRequestedAt} IS NULL
    ) OR (
      ${table.pendingPlanKey} IS NOT NULL AND ${table.pendingPlanKey} IN ('pro', 'enterprise') AND ${table.pendingPriceId} IS NOT NULL AND ${table.pendingSwitchIdempotencyKey} IS NOT NULL AND ${table.pendingSwitchRequestedAt} IS NOT NULL
    )`),
    uniqueIndex("billing_subscriptions_one_current_per_account_idx").on(table.billingAccountId).where(sql`${table.isCurrent}`),
    index("billing_subscriptions_account_status_idx").on(table.billingAccountId, table.status),
    index("billing_subscriptions_grace_until_idx").on(table.graceUntil),
  ],
);

/** Stores sanitized webhook data only; never persist raw payment payloads. */
export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    stripeEventId: text("stripe_event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    providerObjectId: text("provider_object_id"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true, mode: "date" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    processingState: text("processing_state").notNull().default("received"),
    attemptCount: integer("attempt_count").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),
  },
  (table) => [
    check("stripe_webhook_events_state_check", sql`${table.processingState} IN ('received', 'processing', 'processed', 'retry', 'failed', 'stale', 'reconcile')`),
    check("stripe_webhook_events_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check("stripe_webhook_events_lease_check", sql`${table.processingState} <> 'processing' OR (${table.leaseToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`),
    check("stripe_webhook_events_processed_check", sql`${table.processingState} <> 'processed' OR ${table.processedAt} IS NOT NULL`),
    check("stripe_webhook_events_error_length_check", sql`${table.lastErrorSummary} IS NULL OR char_length(${table.lastErrorSummary}) <= 512`),
    index("stripe_webhook_events_retry_idx").on(table.processingState, table.nextAttemptAt),
    index("stripe_webhook_events_lease_idx").on(table.processingState, table.leaseExpiresAt),
    index("stripe_webhook_events_object_idx").on(table.providerObjectId, table.providerCreatedAt),
  ],
);

/** Append-only entitlement and reconciliation history. */
export const billingAuditEvents = pgTable(
  "billing_audit_events",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    billingAccountId: text("billing_account_id").references(() => billingAccounts.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id"),
    batchId: text("batch_id"),
    action: text("action").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    actorId: text("actor_id"),
    beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
    afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
    details: jsonb("details").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("billing_audit_events_account_time_idx").on(table.billingAccountId, table.occurredAt),
    index("billing_audit_events_source_event_idx").on(table.sourceEventId),
    index("billing_audit_events_batch_idx").on(table.batchId),
  ],
);

export const grandfatheringBatches = pgTable(
  "grandfathering_batches",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true, mode: "date" }).notNull(),
    eligibilityRuleVersion: text("eligibility_rule_version").notNull(),
    status: text("status").notNull().default("planned"),
    candidateCount: integer("candidate_count"),
    candidateDigest: text("candidate_digest"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("grandfathering_batches_status_check", sql`${table.status} IN ('planned', 'approved', 'applied', 'verified', 'aborted')`),
    check("grandfathering_batches_candidate_count_check", sql`${table.candidateCount} IS NULL OR ${table.candidateCount} >= 0`),
    index("grandfathering_batches_status_cutoff_idx").on(table.status, table.cutoffAt),
  ],
);

/** Materialized membership is the single source of grandfathering state. */
export const grandfatheringCohortMembers = pgTable(
  "grandfathering_cohort_members",
  {
    batchId: text("batch_id").notNull().references(() => grandfatheringBatches.id, { onDelete: "restrict" }),
    billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "restrict" }),
    eligibilityReason: text("eligibility_reason").notNull(),
    memberState: text("member_state").notNull().default("candidate"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    grandfatheredAt: timestamp("grandfathered_at", { withTimezone: true, mode: "date" }),
    convertedAt: timestamp("converted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.billingAccountId], name: "grandfathering_cohort_members_pk" }),
    unique("grandfathering_cohort_members_one_batch_per_account_unique").on(table.billingAccountId),
    check("grandfathering_cohort_members_state_check", sql`${table.memberState} IN ('candidate', 'grandfathered', 'converted', 'excluded')`),
    check("grandfathering_cohort_members_applied_check", sql`${table.memberState} IN ('candidate', 'excluded') OR (${table.appliedAt} IS NOT NULL AND ${table.grandfatheredAt} IS NOT NULL)`),
    check("grandfathering_cohort_members_conversion_check", sql`${table.memberState} <> 'converted' OR ${table.convertedAt} IS NOT NULL`),
    index("grandfathering_cohort_members_batch_state_idx").on(table.batchId, table.memberState),
  ],
);

export const meetingUsagePeriods = pgTable(
  "meeting_usage_periods",
  {
    billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    startedCount: integer("started_count").notNull().default(0),
    reservedCount: integer("reserved_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.billingAccountId, table.periodStart], name: "meeting_usage_periods_pk" }),
    check("meeting_usage_periods_counts_check", sql`${table.startedCount} >= 0 AND ${table.reservedCount} >= 0`),
    check("meeting_usage_periods_month_start_check", sql`EXTRACT(DAY FROM ${table.periodStart}) = 1`),
  ],
);

/** Each reservation is an attempt; a lease expiry requires reconciliation before release. */
export const meetingStartReservations = pgTable(
  "meeting_start_reservations",
  {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    meetingId: text("meeting_id").notNull(),
    billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true, mode: "date" }),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    releaseReason: text("release_reason"),
    reconciliationState: text("reconciliation_state").notNull().default("none"),
    reconciliationAttempts: integer("reconciliation_attempts").notNull().default(0),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true, mode: "date" }),
    nextReconciliationAt: timestamp("next_reconciliation_at", { withTimezone: true, mode: "date" }),
    streamEventId: text("stream_event_id").unique(),
  },
  (table) => [
    check("meeting_start_reservations_state_check", sql`${table.state} IN ('pending', 'committed', 'released', 'expired')`),
    check("meeting_start_reservations_reconcile_state_check", sql`${table.reconciliationState} IN ('none', 'required', 'in_progress', 'confirmed_started', 'confirmed_not_started')`),
    check("meeting_start_reservations_attempts_check", sql`${table.reconciliationAttempts} >= 0`),
    check("meeting_start_reservations_lease_check", sql`${table.leaseExpiresAt} > ${table.createdAt}`),
    uniqueIndex("meeting_start_reservations_one_pending_per_meeting_idx").on(table.meetingId).where(sql`${table.state} = 'pending'`),
    index("meeting_start_reservations_account_period_state_idx").on(table.billingAccountId, table.periodStart, table.state),
    index("meeting_start_reservations_reconcile_idx").on(table.reconciliationState, table.nextReconciliationAt),
  ],
);

/** Immutable quota source of truth; do not cascade-delete on meeting deletion. */
export const meetingUsageEvents = pgTable(
  "meeting_usage_events",
  {
    meetingId: text("meeting_id").primaryKey(),
    billingAccountId: text("billing_account_id").notNull().references(() => billingAccounts.id, { onDelete: "restrict" }),
    periodStart: date("period_start").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    streamEventId: text("stream_event_id").notNull().unique(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    reconciliationState: text("reconciliation_state").notNull().default("normal"),
    details: jsonb("details").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    check("meeting_usage_events_period_check", sql`${table.periodStart} = date_trunc('month', ${table.startedAt} AT TIME ZONE 'UTC')::date`),
    check("meeting_usage_events_reconciliation_state_check", sql`${table.reconciliationState} IN ('normal', 'reconciled', 'unreserved_start', 'boundary_overage')`),
    index("meeting_usage_events_account_period_idx").on(table.billingAccountId, table.periodStart),
  ],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speakerId: text("speaker_id").notNull(),
    speakerName: text("speaker_name").notNull().default("Unknown"),
    text: text("text").notNull(),
    startMs: integer("start_ms").notNull().default(0),
    endMs: integer("end_ms").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("transcript_segments_meeting_id_idx").on(table.meetingId),
    index("transcript_segments_start_ms_idx").on(table.startMs),
  ],
);
