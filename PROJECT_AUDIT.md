# Apex Agent — Project Audit

Audit date: 2026-10-30
Scope: full Next.js application (`src/`), database schema, Drizzle migrations, Stream webhook, Inngest pipeline, tRPC routers, meeting/agent UI, call UI, dashboard shell.

## Executive summary

The application had a solid UI shell and a working authentication/video foundation, but the meeting lifecycle was largely non-functional: scheduling fields did not exist in the database, status values used by the UI were not part of the database enum, the AI analysis pipeline could not run reliably, the Stream webhook trusted every request, and several dashboard routes linked to missing pages.

The project has now been repaired end-to-end at the code, schema, and migration level. Type checking and a production build pass, and the additive migration has been applied to the configured Neon database.

## Findings and resolution

| # | Severity | Finding | Resolution | Status |
|---|----------|---------|------------|--------|
| 1 | Critical | `meetings` table had no scheduling columns (`scheduled_at`, `duration_minutes`, `ends_at`, `timezone`, `participants`) while the UI required them. | Added all scheduling columns plus indexes in `src/db/schema.ts` and migration `0001`. | Fixed |
| 2 | Critical | `meeting_status` enum lacked `scheduled` and `failed`, so new meeting rows and failed-analysis states could not be stored. | Added enum values in the migration; status values are now shared via `MeetingStatus`. | Fixed |
| 3 | Critical | Meeting `create` procedure contained a duplicate object key that dropped the validated `scheduledAt` value and stored no schedule. | Procedure rewritten; parses, validates, computes `endsAt`, rejects past/overlapping slots, assigns a Stream call id, and notifies the user. | Fixed |
| 4 | Critical | Webhook accepted unauthenticated requests, logged secrets, ended meetings on `participant_left`, and could double-trigger analysis. | Verifies the `x-api-key` and Stream signature, ignores participant-left for meeting completion, transitions status explicitly, checks existing state before triggering Inngest. | Fixed |
| 5 | Critical | Inngest analysis threw at module load when `OPENAI_API_KEY` was missing, and transcript/summary parsing was brittle. | Lazy OpenAI client, robust JSON/JSONL transcript parsing, speaker resolution, segment persistence, chunked analysis, normalized output, idempotency, failure recording, per-meeting concurrency limit. | Fixed |
| 6 | High | `call-connect` ended the call when the component unmounted, so leaving the page terminated the meeting for everybody. | Unmount cleanup now only leaves the call. Ending for all participants is an explicit action. | Fixed |
| 7 | High | Call UI auto-started the microphone, ignored the `endedForAll` state, and the token request omitted the meeting id. | Mic is user-controlled; token request passes `meetingId`; ended state is respected and the end-for-all action is available. | Fixed |
| 8 | High | Meeting form used a mismatched resolver/input/output type and wrote dates without timezone handling. | Form typed with `useForm<Input, unknown, Output>`, IANA timezone conversion helpers, duration and participant inputs, correct query invalidation. | Fixed |
| 9 | High | Meeting detail views did not handle `scheduled`, `failed`, or detailed AI output; PDF export/transcript tabs were incomplete. | Rewrote status routing and views, added `failed-state`, completed-state with summaries, topics, decisions, action items, highlights, recommendations, talk time, transcript, PDFs, Ask AI. | Fixed |
| 10 | High | Agent schema/UI had no description or role, and agent meeting counts were not reliably available. | Added `description`, `role`, `avatar_variant`; correlated meeting-count subquery; form/detail/list updated. | Fixed |
| 11 | High | Dashboard linked to `/notifications`, `/calendar` and analytics without those routes existing; command palette was a stub. | Added notifications, calendar, analytics, and Ask AI pages; implemented searchable command palette; updated sidebar and navbar. | Fixed |
| 12 | Medium | No `.env.example`; setup relied on undocumented variables. | Added `.env.example` covering database, auth, OAuth, Stream, OpenAI, Inngest, Stripe, Resend, URL configuration. | Fixed |
| 13 | Medium | Agent detail page had no server-side session guard. | Added session check and redirect to sign-in. | Fixed |
| 14 | Medium | Dates returned through tRPC are serialized as strings (no superjson transformer) but were typed as `Date`. | All new UI parses dates with `new Date(value)` before formatting. | Mitigated |
| 15 | Low | Home dashboard used a hard-coded fallback user name and contained no meeting activity context. | Fallback replaced; analytics/status pages now expose workspace activity. | Fixed |
| 16 | Info | Live captions in the call UI are browser-local preview only; Stream transcription is processed server-side after the call. | UI label clarified so it is not presented as the authoritative transcript. | Documented |

## Database changes

Migration: `drizzle/0001_confused_kate_bishop.sql`

- New enum values: `meeting_status.scheduled`, `meeting_status.failed`, `notification_type.meeting_updated`, `notification_type.meeting_failed`.
- New table `transcript_segments` (meeting id, speaker id/name, text, start/end ms) with indexes and cascade delete.
- New `agents` columns: `description`, `role`, `avatar_variant`.
- New `meetings` columns: scheduling, participants, Stream call id, stored transcript, detailed AI output, analysis error, processed timestamp.
- Indexes for user/status/schedule/agent lookups and notification access.

All changes are additive. No user, meeting, agent, or notification rows were deleted or reset.

## Verification performed

- `./node_modules/.bin/tsc --noEmit` — passes.
- `npm run build` — passes (22 routes generated).
- `drizzle-kit migrate` — applied `0001` successfully.
- Schema introspection confirmed the new columns and `transcript_segments` table exist.
- Migration bookkeeping confirmed both baseline `0000` and applied `0001` are recorded.

## Remaining known limitations

- End-to-end transcription requires real Stream, OpenAI, and Inngest credentials plus a publicly reachable webhook URL (`npm run dev:webhook`).
- Meeting reminders run through the `meetings/reminders` Inngest cron function; email delivery additionally requires `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`. In-app reminders work without email.
- Summary emails are best-effort and depend on Resend availability; the summary itself is always stored in the meeting record.
- The upgrade/pricing screen is present but payment fulfilment must be configured in Stripe for production use.
- There is no role-based admin surface; data is scoped per authenticated user.
