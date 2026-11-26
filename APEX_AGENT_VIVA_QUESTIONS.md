# APEX AGENT — Viva & Faculty Question Bank

**Prepared:** 20 November 2026  
**Total questions:** 98 across 9 categories.  
**Answer policy:** Answers describe the current repository, not an idealised product. Where a feature depends on external credentials or was not executed, the answer says so explicitly.

---

## Quick honesty checklist (learn this first)

- **Never say** the live AI summary was successfully generated end-to-end locally; it was not part of the available evidence. Unit tests and implementation exist.
- **Never say** the system has role-based admin or enforced billing quotas; neither is active by default.
- **Never say** live captions are the real transcript; they are a browser-local preview.
- **Never say** speaker recognition uses voice biometrics; it maps Stream speaker IDs to stored names.
- **Never say** production deployment and real camera/mic validation were verified; they were not.

---

## Project Overview & Architecture

### Q1. What is Apex Agent in one sentence?

**Answer.** Apex Agent is a Next.js 15 SaaS platform where a user creates a configurable AI agent, holds a real video meeting through Stream Video, and receives post-meeting intelligence such as a summary, decisions, action items, talk time, a transcript, and searchable answers through Ask AI.

### Q2. What is the main problem your project solves?

**Answer.** Meetings produce a lot of spoken information but very little reliable written output. Decisions, owners and context get lost. The technical side is equally hard: webhook events arrive asynchronously, transcripts are unstructured, and AI steps can fail. Apex Agent addresses both the productivity problem and the engineering problem.

### Q3. What is meant by 'SaaS' in your title?

**Answer.** SaaS means Software as a Service — the application runs on hosted infrastructure and is used through a browser rather than installed locally. In this project the deploy target is Vercel, with Neon PostgreSQL and third-party APIs for video and AI.

### Q4. Draw the high-level architecture from memory.

**Answer.** Browser/Host and Guest → Next.js 15 App Router (UI, tRPC API, Better Auth, Drizzle) → External services: Stream Video (media/transcripts/recording), Inngest (events/crons/retries), OpenAI (gpt-4o-mini analysis and Realtime agent), Neon PostgreSQL (data). The webhook path is: signed Stream event → /api/webhook → idempotent Inngest event → durable pipeline → database → notification.

### Q5. Which layers does the application have?

**Answer.** Four main layers: (1) presentation — React Server Components and shadcn/ui, (2) API — tRPC v11 routers with Zod validation, (3) domain/data — meeting, agent and notification modules with Drizzle ORM, and (4) integrations — Stream SDK, Inngest, OpenAI, Stripe and Resend adapters.

### Q6. What is the difference between the data path, media path and event path?

**Answer.** The data path is browser → HTTPS → tRPC/Better Auth → Drizzle → Neon. The media path is browser ↔ Stream via WebRTC. The event path is Stream webhook → /api/webhook → Inngest → pipeline → Neon → notification. Separating them keeps media out of the database and keeps AI work off the request thread.

### Q7. Why did you use an event-driven design?

**Answer.** Transcript finalisation and AI analysis take time and can fail. An event-driven design lets the HTTP request finish quickly while Inngest retries individual steps safely. It also allows reconciliation crons to fix meetings stuck in processing.

### Q8. What is your original contribution compared with existing AI assistants?

**Answer.** The integration itself: a user-configurable agent whose instructions are stored in the database, a signature-verified Stream webhook with an idempotent processing event, a durable and retryable transcript-to-insights pipeline, and user-scoped, source-linked knowledge with explicit failure states.

---

## Next.js, React, TypeScript & tRPC

### Q9. Why Next.js 15 and the App Router?

**Answer.** Next.js 15 gives server-rendered React pages, file-system routing, API route handlers in app/api, and deployment integration with Vercel. The App Router lets us co-locate pages and server logic and keeps secrets on the server.

### Q10. What are React Server Components and why do they matter here?

**Answer.** RSC render on the server and send HTML/some payload to the browser, reducing client JavaScript. Dashboard pages can fetch user-scoped data on the server, while interactive parts such as forms and the call UI are client components.

### Q11. Why TypeScript across the whole project?

**Answer.** It gives compile-time checks across the schema, routers and UI. A change in a router input breaks the client build if the caller is not updated, which catches contract drift early.

### Q12. What is tRPC and how does it help?

**Answer.** tRPC lets the server define typed procedures that the client calls directly with inferred types. There is no hand-written REST client and no separate schema to keep in sync. Zod validates inputs at runtime.

### Q13. What is the difference between protectedProcedure and publicProcedure?

**Answer.** protectedProcedure checks the Better Auth session from request headers and throws UNAUTHORIZED when absent, then passes the authenticated user in context. publicProcedure skips that check and is used only where external guests are involved, such as invite validation and guest join; those endpoints do their own token checks.

### Q14. What is Zod used for?

**Answer.** Zod schemas validate mutation inputs before database access — for example checking that a meeting name is non-empty, a date is valid, and a query length is within bounds. Invalid input returns a clear error instead of reaching the database.

### Q15. What does 'end-to-end type safety' mean in this project?

**Answer.** The Drizzle schema types flow into server code, tRPC router types flow through the client hook, and React components consume typed results. A field renamed in the database or router shows up as a TypeScript error rather than a runtime surprise.

### Q16. What are React Query and TanStack Query used for?

**Answer.** tRPC uses TanStack Query under the hood for client-side caching, invalidation and refetching. After creating a meeting, the meetings list query can be invalidated so the UI refreshes.

### Q17. How is state handled in the video call UI?

**Answer.** Client components use React state and hooks for local UI such as captions, participant list, lobby and call controls. Server state comes from tRPC queries. The useSpeechToText hook manages browser SpeechRecognition state.

### Q18. Why shadcn/ui and Tailwind CSS?

**Answer.** Tailwind provides consistent utility-based styling, and shadcn/ui gives accessible, source-owned components that can be customised in the repository rather than hidden inside a dependency.

---

## Database, ORM & Data Design

### Q19. Which database do you use and why?

**Answer.** Neon serverless PostgreSQL. PostgreSQL gives relational integrity and JSONB support; Neon provides a serverless connection model suitable for a Vercel-deployed Next.js application.

### Q20. What is Drizzle ORM and why choose it?

**Answer.** A TypeScript-first ORM that defines the schema in code, generates migrations and produces typed query builders. It keeps database definitions close to application code and avoids heavy runtime abstraction.

### Q21. What are the main tables in your schema?

**Answer.** user/session/account/verification from Better Auth, agents, meetings, meeting_invites, meeting_guests, meeting_participants, transcript_segments, notifications, public_rate_limits, and a billing cluster of nine tables with immutable usage events.

### Q22. What fields does the meetings table hold?

**Answer.** Identity and ownership (id, user_id, agent_id), scheduling (name, description, scheduled_at, duration_minutes, ends_at, timezone, participants, location), Stream state (stream_call_id, passcode), lifecycle (status, started_at, ended_at), transcription (transcript_url, recording_url, transcript, transcript_segments), AI output (summary, detailed_summary, topics, decisions, action_items, unresolved_questions, highlights, recommendations, sentiment, analysis_error, processed_at) and timestamps.

### Q23. How are meeting statuses represented?

**Answer.** As a PostgreSQL enum: upcoming, scheduled, active, processing, completed, failed and cancelled. The UI and procedures use the same enum so status strings cannot drift.

### Q24. How are results related to meetings?

**Answer.** Transcript segments and participants reference meeting_id with cascade delete. Notifications reference user_id and optionally meeting_id, invites reference the meeting and creator, and guests are bound to a meeting and invite.

### Q25. What is the primary key type in your tables?

**Answer.** Mostly text IDs generated by nanoid, not auto-increment integers. This avoids enumerable IDs and works well across distributed services. Invite tokens are 32-character nanoid values and guest IDs use a 'guest_' prefix for Stream.

### Q26. What are indexes used for in your schema?

**Answer.** Indexes on user_id, meeting status, scheduled_at and similar columns keep common queries fast — for example listing a user's upcoming meetings or finding meetings stuck in processing.

### Q27. What is JSONB used for?

**Answer.** Structured AI output such as topics, decisions, action items and highlights is stored as JSONB. It stays typed at the application layer while allowing flexible internal structure.

### Q28. How does the billing data model protect usage records?

**Answer.** Billing uses immutable usage events plus reconciliation functions; the Phase 2B static review describes nine billing tables and fifteen SQL functions. Quota enforcement is opt-in and off by default, so it is a foundation rather than an enforced limit.

### Q29. What does cascade delete mean?

**Answer.** When a parent row such as a meeting is deleted, related rows such as participants, transcript segments and invites are removed automatically by the database, preventing orphan records.

---

## Authentication, Authorisation & Security

### Q30. Which authentication library do you use?

**Answer.** Better Auth with a Drizzle adapter. It supports email/password and optional Google/GitHub OAuth, stores sessions in the database, and exposes session lookup through auth.api.getSession().

### Q31. How does a protected procedure know who the user is?

**Answer.** The tRPC middleware reads request headers, calls auth.api.getSession(), throws UNAUTHORIZED if there is no session, and injects the authenticated session into the context so procedures can use ctx.auth.user.id.

### Q32. How do you prevent one user from reading another user's meeting?

**Answer.** Queries and mutations include an ownership predicate such as eq(meetings.userId, ctx.auth.user.id). A direct call with someone else's meeting ID returns NOT_FOUND rather than the record.

### Q33. How do external guests join without an account?

**Answer.** The host creates an invite with a 32-character token. The guest opens the public join route, submits a display name, the server validates the invitation state, and issues a short-lived Stream token scoped to that call. Guests never receive database access.

### Q34. What makes a Stream webhook trustworthy?

**Answer.** The route verifies the Stream webhook signature and also checks the x-api-key header against STREAM_API_KEY. A valid signature alone is not treated as sufficient.

### Q35. What happens when the participant_left webhook arrives?

**Answer.** It is explicitly ignored in /api/webhook. A guest leaving must not end the call for everyone; ending is an explicit host/owner action.

### Q36. What are the reconciliation checks in the webhook?

**Answer.** The webhook checks current database state against incoming events, so stale or duplicate events cannot incorrectly move a meeting backwards. Stream start evidence is extracted and committed idempotently.

### Q37. How are rate limits handled?

**Answer.** There is a shared PostgreSQL limiter using atomic upsert counters and bounded cleanup. Production ingress identity must be configured through PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER; unconfigured or malformed identity fails closed.

### Q38. How are production URLs validated?

**Answer.** The shared parser requires a public HTTPS origin, rejects credentials and path components, and classifies IP literals carefully, with explicit handling for reserved and special ranges. Development behaviour remains unchanged.

### Q39. Where are secrets stored?

**Answer.** In environment variables such as DATABASE_URL, BETTER_AUTH_SECRET, STREAM_API_KEY/SECRET, OPENAI_API_KEY, INNGEST keys, STRIPE keys and RESEND_API_KEY. The .env file is gitignored and .env.example documents the expected names.

### Q40. Why must the Stream secret stay on the server?

**Answer.** It can mint tokens for any call. The browser only receives a short-lived token for one specific call and user, so a leaked browser bundle cannot compromise the whole project.

### Q41. Is billing quota enforced?

**Answer.** No. BILLING_ENABLED and BILLING_QUOTA_ENFORCEMENT_ENABLED are separate opt-in switches, both off by default. The operations note explicitly says not to enable quota enforcement in this phase.

---

## WebRTC, Stream Video & Real-Time Communication

### Q42. What is WebRTC in simple terms?

**Answer.** A browser standard for peer-to-peer-style real-time audio, video and data. It handles media transport; an application still needs signalling, rooms, tokens, permissions and TURN infrastructure — which is why we use Stream Video.

### Q43. Why use Stream Video instead of writing raw WebRTC?

**Answer.** Stream provides call rooms, participant management, signalling, TURN infrastructure, client SDKs, server tokens, transcription, recording and webhooks. Building that from scratch would be a separate project.

### Q44. What is the Stream Video React SDK used for?

**Answer.** It provides the React components and hooks for the lobby, active call, video tiles, participant list, microphone/camera controls and call state in the /call and /join routes.

### Q45. How does a host start a meeting?

**Answer.** The start procedure checks ownership and allowed status, creates or reuses the Stream call, generates a host token, enables transcription/recording as configured, and updates started_at and status. The browser then connects with that token.

### Q46. How do guests get a Stream token?

**Answer.** The public guestJoin procedure validates the invitation token and meeting state, creates or reuses a guest user with a 'guest_' ID, adds them to the call, and returns a short-lived Stream token via an authenticated server call.

### Q47. What is transcription in Stream?

**Answer.** Stream can convert speech in a call to a transcript file and emit webhooks such as transcription_ready or transcription_failed. The application stores the resulting URL and later resolves and parses the file.

### Q48. How do you know who spoke when?

**Answer.** Stream transcript segments carry speaker IDs and timing. The processing pipeline maps those IDs to Apex users, the AI agent, or meeting guests and stores start_ms/end_ms per segment.

### Q49. What is the live caption panel in the call UI?

**Answer.** A browser-local preview driven by the Web Speech API through useSpeechToText. It is explicitly labelled 'Your mic (local preview)' and is not the authoritative transcript used for AI analysis.

### Q50. How is recording handled?

**Answer.** Recording is configured on the Stream call; the recording_ready webhook stores the URL. The repository does not claim a custom recording implementation — the capability comes from Stream.

### Q51. What happens if media permission is denied?

**Answer.** The call UI shows waiting/error states; the guest test report covers waiting and rejection paths. The project does not claim validation on real camera/microphone hardware because the E2E run used fake media devices.

### Q52. Can a guest end the meeting for everyone?

**Answer.** No. There is an explicit end-for-all action for the owner. Guest leaving is designed to be local to that guest.

### Q53. How does the OpenAI Realtime agent fit in?

**Answer.** There is a Realtime session bridge that can connect the configured AI agent to the call. It is conditional on OpenAI/Realtime configuration and Stream user setup; the code exists, but the deck does not claim a successful end-to-end Realtime run without keys.

---

## OpenAI, LLM Integration & Prompt Engineering

### Q54. Which OpenAI model do you use and where is it configured?

**Answer.** gpt-4o-mini by default, defined as OPENAI_MODEL in src/lib/openai.ts with override through the OPENAI_MODEL environment variable. The same module checks whether OPENAI_API_KEY is present.

### Q55. What does the AI pipeline actually produce?

**Answer.** An executive summary, detailed summary, key topics, decisions, action items, unresolved questions, highlights, recommendations, sentiment and talk-time metrics, all stored on the meeting and exposed in the UI.

### Q56. How do you prevent the LLM from inventing facts?

**Answer.** The prompt instructs the model to use only the supplied transcript, omit unstated owners and deadlines, and never invent decisions, people or dates. Output is requested as structured JSON and validated before persistence.

### Q57. Why ask for JSON instead of free text?

**Answer.** JSON can be validated and mapped into typed fields such as action_items and decisions. Free-form prose would be harder to store, search and render consistently.

### Q58. How do you handle long transcripts?

**Answer.** The pipeline chunks long transcripts and condenses intermediate results before the final analysis step, so the request stays within practical context limits.

### Q59. What is Ask AI in this project?

**Answer.** A protected procedure that accepts a question, gathers the user's completed meeting intelligence from the database, builds a context-grounded prompt, and returns an answer with links back to the source meetings.

### Q60. Is Ask AI global or per meeting?

**Answer.** Both patterns are supported: an overall Ask AI page over the user's meeting history, and a per-meeting question form that focuses on a single meeting's analysis and transcript.

### Q61. What happens if OPENAI_API_KEY is missing?

**Answer.** isOpenAIConfigured() returns false. Ask AI throws a PRECONDITION_FAILED error with a clear message, the Realtime bridge cannot connect, and the processing pipeline marks the meeting failed rather than producing fabricated output.

### Q62. What is prompt engineering in your context?

**Answer.** Designing the system and user instructions so the model receives the transcript, speaker labels and required output schema, follows the 'transcript only' rule, and returns predictable JSON.

### Q63. What is temperature and why might you keep it low here?

**Answer.** Temperature controls randomness. For meeting intelligence, a low value is preferable because the task is extraction and summarisation from evidence, not creative writing.

### Q64. Why not send the entire database to the model?

**Answer.** Privacy, cost and context limits. Only the relevant user-scoped meeting text is sent, and secrets or other users' data are never included.

### Q65. Did you run a live end-to-end OpenAI generation as evidence?

**Answer.** No such run is recorded in the available evidence. Unit tests cover parsing and pipeline behaviour; the deck explicitly marks live AI summary generation as not run E2E.

---

## Transcription, Speaker Identification & Summarisation

### Q66. What is the difference between a transcript and a summary?

**Answer.** A transcript is the near-verbatim, time-ordered record of what was said with speaker labels. A summary is a condensed, structured abstraction of decisions, topics and actions.

### Q67. What is speaker identification in your system?

**Answer.** It is ID-based attribution: the transcript's speaker IDs are mapped to known users, the configured agent, or guest display names stored for the meeting. It is not voice-biometric recognition.

### Q68. How is talk time calculated?

**Answer.** Segment start and end times are parsed, grouped by speaker and summed in seconds. The dashboard visualises the distribution with Recharts.

### Q69. What formats do Stream transcripts use?

**Answer.** The parser handles JSON and JSONL-style transcript content, extracting speaker labels, text and timestamps into transcript_segments rows.

### Q70. Why store transcript segments separately?

**Answer.** It enables speaker attribution, talk-time analytics, per-meeting search and clean reprocessing without re-downloading the original file every time.

### Q71. What is the bounded transcript poll?

**Answer.** When the webhook does not supply a transcript URL immediately, the pipeline polls Stream a limited number of times with defined delays instead of looping forever.

### Q72. What happens on a transcript failure event?

**Answer.** The meeting moves to a failed state, an error is recorded, a notification is created, and the user can retry analysis after the issue is resolved.

### Q73. What is extractive versus abstractive summarisation?

**Answer.** Extractive picking important existing sentences; abstractive generating new condensed wording. An LLM-based summary is largely abstractive, grounded in the transcript text.

### Q74. Why is meeting summarisation difficult?

**Answer.** Overlapping speech, ambiguous pronouns, unresolved references, noisy transcription and implicit decisions. Research such as the AMI corpus documents these challenges.

### Q75. How do action items differ from decisions?

**Answer.** A decision records what was agreed. An action item records what must be done, ideally with an owner and deadline. The prompt is instructed not to invent owners or dates that were not in the transcript.

### Q76. What are unresolved questions and highlights used for?

**Answer.** They preserve open issues and important moments from the meeting so follow-up is possible without replaying the recording.

---

## Inngest, Background Jobs & Automation

### Q77. What is Inngest and why use it?

**Answer.** An event-driven durable execution platform. Each step is individually retryable, concurrency can be controlled, and scheduled functions can run crons — all without managing a queue server.

### Q78. What triggers the meeting processing function?

**Answer.** Stream webhooks such as call.session_ended and call.transcription_ready. The route emits an Inngest event with a deterministic, idempotent event ID derived from the meeting.

### Q79. What does idempotent mean here?

**Answer.** If the same Stream event arrives twice, the deterministic event ID and database state checks prevent duplicate transcript inserts, duplicate notifications or double processing.

### Q80. What are Inngest steps?

**Answer.** Individual units of work inside a function — for example resolve transcript URL, download, parse, persist segments, call OpenAI, save output. A failure retries the relevant step rather than restarting everything blindly.

### Q81. How is concurrency controlled?

**Answer.** The processing function is configured with per-meeting concurrency so two analysis runs for the same meeting cannot corrupt its state.

### Q82. What crons exist in the project?

**Answer.** A meeting reminder cron, a stale invitation reservation review, and a daily usage reconciliation (the report records 02:17 UTC). These are implemented in the Inngest configuration.

### Q83. What is the stuck-meeting reconciliation?

**Answer.** An event/function that finds meetings left in processing beyond an expected window and moves them to an appropriate state or retries them, improving reliability after partial failures.

### Q84. Why not do AI processing inside the webhook request?

**Answer.** Webhooks must respond quickly and Stream may retry on timeout. Long LLM and download work belongs in a background job with retries and observable status.

### Q85. How are failures surfaced to users?

**Answer.** The meeting status becomes failed, analysis_error is stored, a notification is created, and a retry action is available from the meeting page.

### Q86. What is the role of Resend email?

**Answer.** Best-effort notification emails such as meeting reminders and summary-ready messages, sent only when email configuration is present. In-app notifications are the primary channel.

---

## Testing, Deployment, Limitations & Future Scope

### Q87. Which tests did you personally run for this presentation?

**Answer.** npm run test:security — 56 tests in 14 suites, all passing — and npm run test:billing — 26 tests in 8 suites, all passing. TypeScript type-check and production build were also verified in the project history.

### Q88. What did the guest meeting E2E report verify?

**Answer.** 62 server assertions and 11 browser assertions, including invalid/expired/revoked invites, account-required links, waiting states, host plus two account-less guests, three live Stream participants, and a guest leaving without ending the host's call.

### Q89. Were the browser tests using real cameras?

**Answer.** No. They used fake media devices in isolated Chrome profiles against a local development server. This is stated as a limitation rather than hidden.

### Q90. Which test is explicitly not run E2E?

**Answer.** Live AI summary generation with a real OpenAI call. The pipeline is implemented and unit-tested, but no successful live end-to-end run is part of the available evidence.

### Q91. How do you test webhook behaviour without a live Stream call?

**Answer.** Unit tests cover signature/identity handling, idempotency, start-evidence extraction and transcript resolution. The browser/server E2E suite covers real Stream calls for meeting access and participation.

### Q92. What is PGlite used for?

**Answer.** An embedded PostgreSQL-compatible test database used by some tests to exercise database code without requiring a separate local PostgreSQL server.

### Q93. Where would you deploy this application?

**Answer.** Vercel is the intended target, with Neon PostgreSQL and the external services configured via environment variables. A deployed production instance is not verified in this repository.

### Q94. What are the three most important limitations?

**Answer.** AI depends on credentials and transcript availability; there is no live rolling in-call summary; and guest links are reusable/time-windowed without host admission or email binding.

### Q95. What would you improve first with more time?

**Answer.** Host admission and single-use guest invitations, then full Playwright E2E coverage, then role-based access control and activated billing quotas.

### Q96. What future feature is most technically interesting?

**Answer.** Rolling in-call summaries using the Realtime stream, so participants see evolving notes during the meeting rather than only after it ends.

### Q97. How would you scale the system?

**Answer.** Use Neon pooling, keep heavy work in Inngest with controlled concurrency, cache read-heavy dashboard queries, add indexes for common filters, and rely on Stream for media scaling rather than self-hosting WebRTC infrastructure.

### Q98. What did you learn as a team?

**Answer.** Full-stack TypeScript, authentication, real-time video integration, LLM prompting, durable background jobs, database design, security hardening and evidence-based testing.

---

