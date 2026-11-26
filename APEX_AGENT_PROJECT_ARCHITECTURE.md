# APEX AGENT — Project Architecture Report

**Project:** APEX AGENT — AI-Powered Meeting Management and Intelligence SaaS Platform  
**Tagline:** One Platform. Smarter Work.  
**Prepared:** 20 November 2026  
**Repository:** `AI-agent---Meet` (Next.js application, package name `apex-agents`, version 0.1.0)  
**Source of truth:** current source code, database schema, migrations, configuration templates and test reports in the repository. Older documentation was read for context but was overridden wherever it conflicted with code.

---

## 1. Executive summary

Apex Agent is a full-stack, browser-based SaaS application that unifies four concerns that are normally split across separate tools: **AI agent configuration**, **real-time video meetings**, **post-meeting intelligence** and **user-scoped knowledge retrieval**. A signed-in user creates an agent with a role and instructions, schedules or starts a meeting through Stream Video, optionally invites external guests without accounts, and receives a durable, AI-generated record of the meeting — executive and detailed summaries, topics, decisions, action items, unresolved questions, highlights, sentiment, speaker-labelled transcript and talk-time analytics.

The engineering contribution is not a single AI call. It is the composition of a type-safe tRPC/Drizzle core, a signature-verified webhook boundary, an idempotent event hand-off to Inngest, a retryable multi-step analysis pipeline, explicit failure states, and user-scoped retrieval with source links. The project was evaluated against its real implementation: features that depend on credentials, that are only partially wired, or that are not implemented are listed separately in Section 13.

---

## 2. Scope and evidence policy

| Evidence type | Used for |
|---|---|
| `package.json`, `.env.example` | Verified technology stack and configuration surface |
| `src/db/schema.ts`, `drizzle/*.sql` | Authoritative entity/relationship model and migration history |
| `src/app/api/webhook/route.ts`, `src/inngest/functions.ts` | Authoritative event and AI pipeline behaviour |
| `src/modules/**/server/procedures.ts` | Authoritative API surface (37 typed procedures across agents, meetings and notifications) |
| `src/lib/auth.ts`, `src/trpc/init.ts` | Authentication and authorisation boundaries |
| `GUEST_MEETING_TEST_REPORT.md`, audit and implementation reports | Recorded E2E evidence and repaired-lifecycle history |
| Local execution of `npm run test:security` and `npm run test:billing` | Current, reproducible test results (56 + 26 passing) |

Not verified: a deployed production session, live OpenAI end-to-end generation, real camera/microphone hardware, performance benchmarks, and production database grants. These are reported as limitations, not hidden.

---

## 3. System context

**Primary actors**

- **Host / registered user** — signs in, configures agents, schedules and starts meetings, manages invites, reviews intelligence, asks questions and exports PDFs.
- **External guest** — follows a signed invitation link, enters a display name, waits if required, joins the call and leaves without ending it for others. No Apex account is required.
- **AI agent** — a configured participant that can join the Stream call (conditional on Realtime configuration) and whose instructions shape AI analysis.
- **Scheduler / cron** — sends meeting reminders, reconciles stuck processing meetings, reviews expired guest reservations and reconciles billing usage.

**External systems**

| System | Role |
|---|---|
| Stream Video | WebRTC media, call rooms, participant tokens, transcription, recording, webhooks |
| OpenAI | `gpt-4o-mini` for analysis and Ask AI; Realtime API for the in-call agent bridge |
| Inngest | Durable background functions, retries, concurrency control and crons |
| Neon PostgreSQL | Primary relational data store (serverless driver) |
| Stripe | Checkout, customer/subscription state, signed webhooks (opt-in purchase flows) |
| Resend | Best-effort reminder and summary-ready emails |
| Vercel | Intended deployment target and ingress context for rate limiting |

---

## 4. Technology stack (verified)

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15.5, React 19.1, TypeScript, Tailwind CSS 4, shadcn/ui | App Router pages, RSC + client components, responsive dashboard UI |
| API | tRPC 11.1, Zod 3.25, TanStack React Query 5 | End-to-end typed procedures with runtime input validation and client caching |
| Database | Neon serverless PostgreSQL 1.0, Drizzle ORM 0.44, Drizzle Kit | Typed schema, migrations (`0000`–`0007`), relational queries, indexes |
| Authentication | Better Auth 1.3 with Drizzle adapter | Email/password, optional Google/GitHub OAuth, database-backed sessions |
| Real-time | Stream Video React SDK 1.28, Stream Node SDK 0.7, WebRTC | Calls, lobby, participants, tokens, transcription, recording, webhooks |
| AI/LLM | OpenAI SDK 6 (`gpt-4o-mini` default), `@stream-io/openai-realtime-api`, `@inngest/agent-kit` | Transcript analysis, Ask AI, optional Realtime voice agent, agent tooling |
| Background jobs | Inngest + Inngest functions | Event-driven durable steps, per-meeting concurrency, four scheduled crons |
| Infrastructure/extras | Stripe 20, Resend, jsPDF 4, Recharts 2, react-hook-form, sonner, nanoid | Payments, email, PDF export, analytics charts, forms, notifications, IDs |

Environment variable names documented in `.env.example` include `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, OAuth client credentials, `NEXT_PUBLIC_STREAM_VIDEO_API_KEY`, `STREAM_VIDEO_SECRET_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER` and Vercel URL variables.

---

## 5. Logical architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HOST BROWSER            EXTERNAL GUEST              BROWSER SPEECH API       │
│ Next.js UI + Stream SDK /join + display name / local caption preview only    │
└───────────────┬──────────────────┬────────────────────────┬───────────────────┘
                │ HTTPS/tRPC       │ public tRPC            │ WebRTC media
                ▼                  ▼                        │
┌───────────────────────────────────────────────────────────┼───────────────────┐
│ APEX AGENT — NEXT.JS 15 APP ON VERCEL                                        │
│  UI: App Router pages, RSC, shadcn/ui, client call UI                       │
│  API: tRPC routers (37 procedures) + Zod + app/api route handlers           │
│  SECURITY: Better Auth session, protectedProcedure, owner-scoped queries    │
│  DOMAIN: agents · meetings · notifications · billing · transcript parsing   │
│  DATA: Drizzle ORM typed queries and migrations                              │
└───────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┘
        ▼                 ▼                 ▼                 ▼
   Stream Video        Inngest          OpenAI          Neon PostgreSQL
   media, STT, REC     events, crons    LLM + Realtime   relational data
        │
        └──signed webhook──▶ /api/webhook ──idempotent event──▶ Inngest ──▶ DB ──▶ notification
```

**Design rules visible in the code**

1. Secrets never leave server modules; the browser receives only short-lived call tokens.
2. All user data is scoped with `user_id`; ownership failures return `NOT_FOUND`.
3. Long-running work is never performed inside an HTTP request.
4. Events carry deterministic IDs and database state is rechecked to resist duplicates/stale events.
5. Failure states are persisted and shown to users instead of being swallowed.

---

## 6. Core flows

### 6.1 Authentication

`protectedProcedure` reads request headers, calls `auth.api.getSession()`, rejects anonymous requests with `UNAUTHORIZED`, and injects the authenticated user into tRPC context. `publicProcedure` exists for guest-facing endpoints and performs its own invitation-token validation.

### 6.2 Agent creation

A user creates an agent with name, role, description, instructions and an avatar variant. The instructions are used when the configured AI agent participates in a meeting and when analysis is prompted.

### 6.3 Meeting scheduling and start

The `meetings.create` procedure validates a future, timezone-aware date/time, computes `endsAt` from `duration_minutes`, detects overlapping meetings, creates a Stream call with transcription/recording configured, upserts the agent as a call member and inserts a reminder notification. `start`, `update`, `cancel`, `end`, `remove`, `retryAnalysis` and reschedule paths enforce ownership and status guards. Participant-leave webhooks are deliberately ignored so one guest leaving cannot end the host's call.

### 6.4 Guest joining

A host creates an invite (32-character nanoid token) with expiry, optional account requirement and optional revocation. `getInvite` validates state for the public join page. `guestJoin` validates the invitation, creates/reuses a `guest_*` Stream user, adds them to the call and returns a short-lived token. `guestRefreshToken` supports refresh. Passcode rotation is supported on the call.

### 6.5 Webhook and post-meeting processing

Signed Stream events (`call.session.started`, `call.session_ended`, `call.transcription_ready`, `call.transcription_failed`, `call.recording_ready`, and others) arrive at `/api/webhook`. The route verifies the signature and `x-api-key`, checks current database state, extracts start evidence, and sends an idempotent Inngest event. The `meetings/processing` function then:

1. Resolves a transcript URL from the webhook payload or a bounded Stream poll (with a signed-URL refresh retry).
2. Downloads and parses JSON/JSONL transcript content into segments.
3. Maps Stream speaker IDs to users, the configured agent and meeting guests; inserts `transcript_segments` in batches and computes talk time.
4. Calls `gpt-4o-mini` with a structured prompt; long transcripts are chunked and condensed.
5. Validates the JSON response and persists summary, topics, decisions, actions, questions, highlights, recommendations and sentiment.
6. Sets status to `completed`, writes a notification and sends a best-effort email.

Failure at any stage sets `failed`, stores `analysis_error`, notifies the owner and exposes a retry action. A `meetings-processing-reconciliation` cron (`*/10 * * * *`) handles meetings stuck in processing.

### 6.6 Ask AI and analytics

`askAI` gathers the authenticated user's completed meeting intelligence, builds a grounded prompt and returns an answer with source links. Per-meeting questioning is also available. The dashboard computes counts by status and talk-time distributions rendered with Recharts; PDFs are produced client-side with jsPDF.

---

## 7. Module map

| Path | Responsibility |
|---|---|
| `src/app/(auth)/`, `src/lib/auth.ts` | Sign-in, sign-up, password recovery, Better Auth configuration |
| `src/app/(dashboard)/` | Dashboard, agents, meetings, ask-ai, analytics, calendar, notifications |
| `src/app/call/`, `src/app/join/` | Active call UI, lobby and public guest join |
| `src/app/api/trpc/[trpc]/` | tRPC HTTP handler |
| `src/app/api/webhook/` | Signed Stream webhook boundary |
| `src/app/api/inngest/` | Inngest serve endpoint |
| `src/app/api/billing/`, `src/app/api/checkout/` | Stripe checkout, portal, switch, summary, signed webhook |
| `src/modules/meetings/server/procedures.ts` | 24 meeting procedures: scheduling, invites, guests, lifecycle, transcript, Ask AI |
| `src/modules/agents/server/procedures.ts` | 6 agent CRUD procedures |
| `src/modules/notifications/server/procedures.ts` | 7 notification procedures |
| `src/modules/call/ui/components/` | Call layout, lobby, active call, participants, live transcription |
| `src/inngest/functions.ts` | Processing, reconciliation, reminders, billing crons |
| `src/db/schema.ts`, `drizzle/` | Schema, relations, migrations, bootstrap tooling |
| `src/lib/` | Stream, OpenAI, Resend, rate limiting, URL parsing, utilities |
| `src/components/` | Shared UI primitives, analytics dashboard, pagination, forms |

---

## 8. Database design

**Core entities**

| Entity | Key fields and relationships |
|---|---|
| `user` | Better Auth identity; parent of agents, meetings, notifications |
| `agents` | `id`, `user_id → user`, name, role, description, instructions, avatar_variant |
| `meetings` | `id`, `user_id → user`, `agent_id → agents`, scheduling fields, status enum, Stream call id/passcode, transcript/recording URLs, AI output JSON, `analysis_error`, `processed_at` |
| `meeting_invites` | primary key is the 32-char token; `meeting_id → meetings`, `created_by → user`, expiry, revocation, account requirement |
| `meeting_guests` | `id` prefixed `guest_`, `meeting_id`, `invite_id`, display name, joined/last-seen timestamps |
| `meeting_participants` | `meeting_id`, optional `user_id`/`guest_id`, name, role, joined/left timestamps |
| `transcript_segments` | `meeting_id`, speaker id/name, text, `start_ms`, `end_ms` |
| `notifications` | `user_id`, type enum, title/message, optional `meeting_id`, read flag |
| Auth cluster | `session`, `account`, `verification` from Better Auth |
| `public_rate_limits` | Shared atomic counters for rate limiting |
| Billing cluster | 9 tables with immutable usage events and 15 SQL functions (foundation, opt-in switches) |

**Enums and constraints.** PostgreSQL enums cover notification types and meeting statuses. Checks, unique indexes and cascade deletes protect integrity. Primary keys are text/nanoid rather than sequential integers. Indexes cover common filters such as user, status and scheduled time.

**Migration history.** `0000` (baseline), `0001` (scheduling and analysis extension), `0002`, `0003`, `0004` (public rate limits), `0005` (billing foundation), `0006` (billing atomic operations), `0007` (meeting passcode and participants), plus a bootstrap baseline recorded without execution. Migrations are Drizzle-generated SQL files.

---

## 9. API surface

- **tRPC:** 37 procedures — 24 meetings, 7 notifications, 6 agents. Representative procedures: `meetings.create`, `getOne`, `getTranscript`, `start`, `end`, `cancel`, `update`, `remove`, `retryAnalysis`, `generateToken`, `createInvite`, `getInvite`, `guestJoin`, `guestRefreshToken`, `revokeInvite`, `joinByMeetingId`, `getStatusCounts`, `getAnalytics`, `askAI`.
- **REST route handlers:** `/api/auth/[...all]`, `/api/trpc/[trpc]`, `/api/webhook`, `/api/inngest`, `/api/checkout`, `/api/billing/portal`, `/api/billing/summary`, `/api/billing/switch`, `/api/billing/webhook`.
- **Pages:** App Router pages for dashboard, agents, meetings, ask-ai, analytics, calendar, notifications, upgrade, privacy, terms, about-developers, sign-in, sign-up, password recovery, join and active call. The production build documented 22 generated routes.

---

## 10. Security model

| Boundary | Mechanism |
|---|---|
| Session | Better Auth cookies; `protectedProcedure` middleware |
| Ownership | `user_id` predicates in queries and mutations; `NOT_FOUND` on mismatch |
| Guest access | Signed invitations with expiry/revocation, short-lived Stream tokens, optional account requirement |
| Webhooks | Stream HMAC signature verification plus `x-api-key` check; state reconciliation and idempotent event IDs |
| Rate limiting | Shared PostgreSQL limiter with atomic counters; trusted ingress header must be configured in production; failures fail closed |
| Production URLs | Strict public HTTPS origin parser; rejects credentials and extra URL components |
| Secrets | Environment variables only; server-only SDK modules |
| Billing | Signed Stripe webhooks; purchase flows gated by `BILLING_ENABLED` (default off) |

---

## 11. Background processing and automation

Inngest function IDs in `src/inngest/functions.ts`:

| Function | Schedule / trigger | Purpose |
|---|---|---|
| `meetings/processing` | Stream webhook event | Durable transcript-to-intelligence pipeline |
| `meetings-processing-reconciliation` | `*/10 * * * *` | Rescue meetings stuck in processing |
| `meetings/reminders` | `*/5 * * * *` | Send due meeting reminders using an atomic marker |
| `billing-reservation-reconciliation` | `*/5 * * * *` | Review expired reservations |
| `billing-usage-reconciliation` | `17 2 * * *` | Daily usage reconciliation |

---

## 12. Testing and validation

| Suite / evidence | Result |
|---|---|
| `npm run test:security` (local, this build) | 56 tests, 14 suites, 56 pass / 0 fail |
| `npm run test:billing` (local, this build) | 26 tests, 8 suites, 26 pass / 0 fail |
| Guest meeting server E2E (recorded report) | 62/62 assertions |
| Guest meeting browser E2E (recorded report) | 11/11 assertions; host + two account-less guests; 3 live Stream participants |
| Type-check and production build (project history) | Pass; 22 routes generated |
| Static PPTX QA for this deliverable | 26 slides, 6 embedded screenshots, 0 bounds/overflow/numbering issues |

Live OpenAI generation, deployed production behaviour, real hardware media and performance benchmarks were **not** executed and are not claimed anywhere in the deliverables.

---

## 13. Feature status

### Implemented (code and, where noted, test evidence)

- Next.js dashboard with stats, status split and talk-time charts; 22 generated routes.
- Better Auth email/password and optional OAuth; protected, owner-scoped procedures.
- Agent CRUD with role, description, instructions and avatar variant.
- Meeting scheduling with timezone, duration, overlap detection and reminders.
- Stream call creation, host start, end-for-all, cancel, reschedule, delete and retry analysis.
- Signed invitations, expiry/revocation, account requirement, passcode rotation, guest tokens and refresh.
- Webhook signature verification, idempotent events, state reconciliation, explicit failure states.
- Transcript parsing, speaker-ID mapping, segment persistence and talk-time computation.
- Structured AI output fields, Ask AI with source links, PDF export, notifications and crons.
- Billing foundation: checkout, portal, signed webhook and usage reconciliation (purchase flows opt-in).

### Partial / conditional

- **AI analysis, Ask AI and summary email** — fully implemented but conditional on `OPENAI_API_KEY` / `RESEND_API_KEY`, a reachable webhook and available Stream transcription. Recorded evidence is unit tests plus pipeline implementation, not a live end-to-end AI run.
- **OpenAI Realtime in-call agent** — code-supported bridge; requires valid Realtime/OpenAI and Stream configuration. No successful live run is claimed.
- **Billing** — infrastructure and reconciliation exist; `BILLING_ENABLED` and quota enforcement are off by default and no role-based admin surface exists.
- **Live captions** — browser-local preview via Web Speech API, not the authoritative transcript.

### Pending / not implemented

- Rolling in-call summaries generated during the meeting.
- Host admission control, single-use guest links and per-guest invitation email delivery.
- Role-based access control and activated subscription quotas.
- Full Playwright E2E coverage and production observability dashboards.
- Verification of production database grants and a deployed production session.

---

## 14. Limitations

1. AI quality and availability depend on external credentials and transcript availability; the system fails visibly rather than inventing results.
2. Stream transcription finalises asynchronously, so intelligence is post-meeting rather than instantaneous.
3. Guest invitations are reusable within their time window; they are not single-use or email-bound.
4. Browser E2E used fake media devices and a local server; real hardware and production ingress were not validated.
5. Billing quotas and admin roles are not active; this is a foundation, not a monetisation rollout.
6. No performance benchmark or latency measurement was collected.

---

## 15. Future enhancements

1. Rolling Realtime summaries and live action-item capture during the call.
2. Host admission queue, single-use/email-bound invitations and finer guest permissions.
3. Role-based access control and activation of billing quotas with plan limits.
4. Deeper `@inngest/agent-kit` autonomy — agents that act on decisions after a meeting.
5. Trend analytics: sentiment over time, meeting frequency and agent effectiveness.
6. Production readiness: full Playwright suite, observability, grant validation and load testing.

---

## 16. References (IEEE style)

[1] J. Carletta *et al.*, “The AMI meeting corpus: A pre-announcement,” in *Machine Learning for Multimodal Interaction (MLMI 2005)*, ser. LNCS. Springer, 2006, pp. 28–39, doi: 10.1007/11677482_3.

[2] A. Nenkova and K. McKeown, “Automatic summarization,” *Found. Trends Inf. Retr.*, vol. 5, no. 2–3, pp. 103–233, 2011, doi: 10.1561/1500000015.

[3] Next.js, “Next.js documentation.” [Online]. Available: https://nextjs.org/docs

[4] tRPC, “tRPC documentation.” [Online]. Available: https://trpc.io/docs

[5] Drizzle ORM, “Documentation.” [Online]. Available: https://orm.drizzle.team/docs/overview

[6] Better Auth, “Documentation.” [Online]. Available: https://www.better-auth.com/docs

[7] Stream, “Video React SDK documentation.” [Online]. Available: https://getstream.io/video/docs/react/

[8] Inngest, “Documentation.” [Online]. Available: https://www.inngest.com/docs

[9] OpenAI, “Chat completions API reference.” [Online]. Available: https://platform.openai.com/docs/api-reference/chat/create

[10] OpenAI, “Realtime API guide.” [Online]. Available: https://platform.openai.com/docs/guides/realtime

[11] PostgreSQL, “PostgreSQL documentation.” [Online]. Available: https://www.postgresql.org/docs/

[12] W3C, “WebRTC 1.0: Real-time Communication Between Browsers.” [Online]. Available: https://www.w3.org/TR/webrtc/

[13] MDN, “Web Speech API.” [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

[14] Stripe, “API documentation.” [Online]. Available: https://docs.stripe.com/api

[15] Resend, “Documentation.” [Online]. Available: https://resend.com/docs

*Online documentation and standards accessed 20 November 2026. Research DOIs [1]–[2] verified via Crossref; the AMI corpus overview was also checked at https://groups.inf.ed.ac.uk/ami/corpus/.*

---

## 17. Information still required from the project owner

The following could not be found in the repository, git history or existing presentation and therefore remain clearly marked editable placeholders in the PPTX:

1. Student roll numbers / enrolment numbers for Abhinav Agnihotri, Aman Sharma and Swati Saini.
2. Faculty guide name and designation.
3. Academic session (for example 2025–26) and, if needed, section/group.
