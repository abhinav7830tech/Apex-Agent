import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  index,
} from "drizzle-orm/pg-core";
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
