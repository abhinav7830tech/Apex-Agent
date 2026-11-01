# 📌 Project Overview

**Project Name:** Apex Agent — "Your intelligent agent for seamless automation and productivity."

**Short Description:** Apex Agent is a modern SaaS platform that combines AI-powered meeting management, autonomous AI agents, and real-time video collaboration inside a single, elegant dashboard.

**What the project does:** A user can create their own AI agent, schedule a video meeting with that agent, let the agent listen in on the call, and automatically receive a full AI-generated summary, key decisions, action items, sentiment analysis, transcript, and recording after the meeting ends. It is a complete "AI meeting assistant" product built as a full-stack web application.

---

# 🎯 Problem Statement

**What real-world problem this project solves:**

After any video meeting, valuable information is scattered. Teams struggle to:

- Remember exactly what was decided during a call.
- Track who is responsible for which action item.
- Go back and search for a specific topic that was discussed ("When did we talk about the API?") without watching the whole recording.
- Know who actually spoke and for how long (talk-time distribution).

Apex Agent solves this by sending an **AI agent** into every meeting. The agent listens, the platform records + transcribes the call, and an AI engine automatically produces:

- A written meeting summary
- Key decisions
- Action items with assignees
- Overall sentiment
- Per-user talk time
- A full transcript and recording (both exportable as PDF)

**Why this problem is important:** Meetings consume a huge amount of professional time. Automating note-taking and follow-up removes manual busywork, reduces miscommunication, and makes the information from every call searchable and reusable. This is exactly the kind of productivity gain that AI products like Otter.ai or Fireflies.ai monetize — and this project builds a working version of it from scratch.

---

# 💡 Motivation

**Why this project was built:** The team wanted to go beyond "hello world" SaaS demos and build a **real, production-shaped product** that uses the modern AI stack: real-time voice AI, background job processing, serverless databases, and end-to-end type-safe APIs.

**What inspired this idea:** The explosion of AI meeting assistants and AI agents in 2024–2026. Tools that "attend" meetings as a participant, combined with platforms like Stream (video infra), Inngest (durable background jobs), and OpenAI Realtime, made it possible for a small team to build a product that previously required huge infrastructure. The project was also a learning exercise: prove that a student team can architect a full SaaS — auth, payments, real-time video, AI, and analytics — with modern tooling.

---

# ⚙️ Tech Stack

| Layer | Technology | Why it is used |
|-------|-----------|----------------|
| **Framework** | Next.js 15 (App Router) | Server Components, RSC data fetching, file-based routing, API routes, and Vercel-native deployment. |
| **Language** | TypeScript | Full type safety across frontend, backend, database, and tRPC contracts. |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Utility-first rapid UI development with a consistent, accessible component library. |
| **API Layer** | tRPC v11 | End-to-end type-safe API calls. The backend router types flow straight into the frontend hooks — no manual API clients, no runtime schema mismatches. |
| **Data Fetching** | TanStack React Query | Caching, background refetch, query invalidation, and suspense support for server + client data. |
| **Database** | PostgreSQL via Neon + Drizzle ORM | Serverless Postgres with a lightweight TypeScript-first ORM and type-safe migrations. |
| **Auth** | Better Auth | Drop-in, modern auth library supporting email/password + Google + GitHub OAuth, with a Drizzle adapter. |
| **Video/Audio** | Stream Video SDK (React SDK + Node SDK) | Handles real-time video calls, audio, transcription, recording, and participants. |
| **AI (Realtime)** | OpenAI Realtime API + `@stream-io/openai-realtime-api` | Powers the in-call AI agent voice. The agent joins the call as a live participant. |
| **AI (Analysis)** | OpenAI `gpt-4o-mini` | Generates summaries, key decisions, action items, sentiment, and answers "smart search" questions over transcripts. |
| **Background Jobs** | Inngest + Agent Kit | Durable, retryable event-driven processing after a meeting ends. |
| **Payments** | Stripe | Checkout for the "Pro" subscription plan ($19/month). |
| **Forms** | react-hook-form + zod | Robust, validated forms with resolver-based schema validation. |
| **URL State** | nuqs | Type-safe search-param state for filters/pagination in list pages. |
| **Avatars** | DiceBear | Generates deterministic robot/initials avatars for users and AI agents. |
| **PDF Export** | jsPDF | Client-side export of meeting summaries and transcripts. |
| **Charts** | Recharts | Analytics bar charts for talk-time per user. |
| **Notifications UI** | sonner + custom bell dropdown | Toasts and an in-app notification center. |

---

# 🏗️ Project Architecture

## Folder Structure

```
src/
├── app/                        # Next.js App Router (pages + API routes)
│   ├── (auth)/                 # sign-in, sign-up, forgot/reset password
│   ├── (dashboard)/            # home, meetings, meetings/[id], agents, agents/[id]
│   ├── call/[meetingId]/       # full-screen video call page
│   ├── api/
│   │   ├── auth/[...all]       # Better Auth handler
│   │   ├── trpc/[trpc]         # tRPC HTTP handler
│   │   ├── inngest             # Inngest background-job endpoint
│   │   ├── checkout            # Stripe checkout session
│   │   └── webhook             # Stream Video webhooks
│   ├── upgrade/                # Pricing page
│   ├── about-developers/       # Team page
│   ├── terms/ & privacy/       # Legal pages
│   └── layout.tsx, globals.css # Root layout, fonts, global providers
│
├── components/                 # Shared UI (shadcn/ui) + common states
├── db/
│   ├── index.ts                # Drizzle client (Neon)
│   └── schema.ts               # All tables & enums
├── hooks/                      # useSpeechToText, useConfirm, useMediaQuery…
├── inngest/
│   ├── client.ts               # Inngest client
│   └── functions.ts            # Post-meeting AI processing pipeline
├── lib/                        # auth, auth-client, stream-video, avatar, utils
├── modules/                    # Domain-driven feature modules
│   ├── agents/                 # AI agent CRUD (schemas, procedures, UI)
│   ├── auth/                   # Sign-in / Sign-up views
│   ├── call/                   # Video call UI (lobby, active, ended, transcription)
│   ├── dashboard/              # Sidebar, navbar, command palette, user button
│   ├── home/                   # Dashboard home view (stats + analytics)
│   ├── meetings/               # Meeting CRUD, statuses, states, smart search
│   └── notifications/          # Notifications + quick meeting summaries
├── trpc/
│   ├── init.ts                 # Router factory + auth middleware
│   ├── client.tsx              # Browser provider (httpBatchLink)
│   ├── server.tsx              # Server-side proxy for RSC prefetching
│   ├── query-client.ts         # Shared QueryClient factory
│   └── routers/_app.ts         # Merged app router
└── types/                      # Global type declarations
```

## How Frontend and Backend Communicate

```
Browser (React/Next.js)
   │  1. useTRPC() hooks  (typed queries/mutations)
   ▼
tRPC httpBatchLink  ───────►  /api/trpc  (fetch adapter)
   │                              │
   │                              ▼
   │                    createTRPCContext (auth session via Better Auth)
   │                              ▼
   │                    appRouter → modules routers → Drizzle queries
   │                              │
   │                              ▼
   └── typed responses ◄────  PostgreSQL (Neon)
```

- **Server Components** prefetch data using `trpc` (a server-side proxy) and hydrate it with `HydrationBoundary`.
- **Client Components** call the same procedures through typed React Query hooks — the server router's input/output types are literally inferred on the client, so a change on the server breaks the build if the client mismatches.
- **External events** (call started, ended, transcript/recording ready) arrive via the **Stream webhook** route, which writes to the DB and triggers **Inngest** jobs.

## Data Flow Diagram (text-based)

```
┌──────────────┐   1. create agent   ┌──────────────┐
│    Browser   │ ───────────────────►│   tRPC / DB  │──►  agents table
└──────────────┘                     └──────────────┘
        │ 2. create meeting (pick agent)
        ▼
   tRPC create ──► meetings table + Stream call created (transcription/recording auto-on)
        │ 3. join call
        ▼
   Stream Video (real-time) ──► OpenAI Realtime agent joins (voice)
        │ 4. call ends
        ▼
   Stream Webhook: session_ended → status "processing"
   Stream Webhook: transcription_ready → save transcriptUrl → send Inngest event
        │ 5. Inngest job (durable)
        ▼
   fetch transcript → parse JSONL → attach speaker names → calc talk time
        │ 6. OpenAI gpt-4o-mini
        ▼
   summary + keyDecisions + actionItems + sentiment
        │ 7. save to meetings row (status "completed") + notification
        ▼
   User views summary / transcript / recording / smart search / analytics
```

---

# 🔄 Workflow / Working of Project

Here is the whole product told as a story:

1. **User visits the app** → Next.js renders the landing/auth page.
2. **Authentication happens** → the user signs in with email/password or Google/GitHub via Better Auth. Sessions are cookie-based.
3. **User creates an AI agent** → gives it a name and a set of *instructions* (the agent's personality & behavior). This is stored in the `agents` table.
4. **User creates a meeting** → names the meeting and picks which agent will attend. On the backend, a **Stream video call** is created with transcription and recording enabled automatically, and a "meeting scheduled" notification is inserted.
5. **User joins the call** → the call page gets a temporary Stream token (via `meetings.generateToken`), the user is placed in a lobby, then joins the call.
6. **The AI agent joins** → when Stream fires `call.session_started`, the webhook marks the meeting `active` and connects an **OpenAI Realtime agent** to the call using the agent's stored instructions. The agent becomes a real voice participant.
7. **The meeting happens** → participants talk, the browser can also show live speech-to-text via the Web Speech API.
8. **The call ends** → `call.session_ended` sets the meeting status to `processing`. When the transcript is ready, `call.transcription_ready` saves its URL and **sends an Inngest event**.
9. **AI processes the data** → an Inngest function fetches the transcript, parses the JSONL lines, maps speaker IDs to real names, calculates per-user talk time, and sends everything to `gpt-4o-mini`, which returns a summary, key decisions, action items, and sentiment.
10. **Output is generated** → the results are saved to the meeting row, the status becomes `completed`, and a `summary_ready` notification is created.
11. **User reviews the output** → on the meeting detail page they can view Summary / Transcript / Recording tabs, export the summary or transcript as PDF, and use "Ask AI" to run semantic questions over the transcript.
12. **Dashboard reflects everything** → total agents, total meetings, average duration, upcoming count, and a talk-time bar chart all update via analytics procedures.

---

# 🔑 Key Features

- **Authentication** — Email/password plus Google & GitHub social login; forgot-password and reset-password flows; cookie-based sessions with a tRPC auth middleware protecting every procedure.
- **AI Agent Management** — Create, list, search, edit, and delete AI agents, each with custom *instructions* that drive its in-call behavior.
- **Meeting Management** — Create meetings linked to an agent, edit, cancel, delete (with confirmation), and track a full lifecycle: `upcoming → active → processing → completed` (or `cancelled`).
- **Real-time Video Calls** — Full Stream-powered call UI: lobby with camera/mic preview and toggles, speaker layout, join/leave controls, and auto-starting transcription + recording.
- **AI Agent in the Call** — The OpenAI Realtime agent joins the actual call as a participant and follows the user-defined instructions.
- **Live Speech-to-Text** — Optional in-browser live transcription panel (Web Speech API) with a mic toggle.
- **AI Meeting Insights** — Automatic summary, key decisions, action items with assignees, and sentiment analysis.
- **Smart Search ("Ask AI")** — Ask natural-language questions about a meeting's transcript and get an AI-generated answer.
- **Transcript & Recording** — View the raw transcript and video recording; export either as a PDF.
- **Analytics Dashboard** — Total meetings, average duration, AI usage count, and per-user talk-time charts.
- **Notifications** — In-app notification center (meeting reminders, started, ended, cancelled, summary ready) with unread badge, mark-read, and "mark all read".
- **Pricing / Payments** — Stripe-powered Pro subscription ($19/mo) with success/canceled states.
- **Responsive Design** — Works on desktop, tablet, and mobile; sidebar/navbar adapt via shadcn/ui primitives.
- **URL-driven Filtering** — Search, status, agent filters, and pagination live in the URL (nuqs), so pages are shareable and back-button friendly.

---

# 🧠 Important Logic Explanation

## 1. Authentication Flow

`src/lib/auth.ts` builds a Better Auth instance with the Drizzle adapter:

```ts
betterAuth({
  socialProviders: { github, google },
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  rateLimit: { window: 60, max: 100 },
})
```

The handler is mounted at `src/app/api/auth/[...all]/route.ts`. The client uses `authClient` (`src/lib/auth-client.ts`).

**The tRPC auth guard** (`src/trpc/init.ts`) is the heart of backend security:

```ts
export const protectedProcedure = baseProducedure.use(async ({ ctx, next }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, auth: session } });
});
```

Every query/mutation that touches user data uses `protectedProcedure`, and every database query is additionally scoped by `eq(<table>.userId, ctx.auth.user.id)` — so users can only ever read/write their own rows.

## 2. Creating a Meeting (the tRPC `create` procedure)

`src/modules/meetings/server/procedures.ts`:
1. Inserts the meeting row for the current user.
2. Creates a **Stream call** for the meeting with `transcription` and `recording` both set to `auto-on`, 1080p quality.
3. Ensures the linked **agent exists** and upserts it into Stream as a participant user with a DiceBear robot avatar.
4. Inserts a `meeting_reminder` notification.

This is a good example of the "write DB → call external service → write DB" transaction pattern used throughout.

## 3. Stream Webhook Handler (the event brain)

`src/app/api/webhook/route.ts` verifies each request with `streamVideo.verifyWebhook(body, signature)` before trusting it, then reacts to four event types:

| Event | What it does |
|-------|--------------|
| `call.session_started` | Marks the meeting `active`, sets `startedAt`, connects the OpenAI Realtime agent to the call with the agent's instructions. |
| `call.session_participant_left` | Ends the Stream call for the meeting. |
| `call.session_ended` | Marks the meeting `processing`, sets `endedAt`. |
| `call.transcription_ready` | Saves the transcript URL, then **sends** the `meetings/processing` event to Inngest. |
| `call.recording_ready` | Saves the recording URL. |

The AI agent is connected with:

```ts
const realtimeClient = await streamVideo.video.connectOpenAi({
  call, openAiApiKey, agentUserId: existingAgent.id
});
realtimeClient.updateSession({ instructions: existingAgent.instructions });
```

## 4. The Inngest AI Pipeline

`src/inngest/functions.ts` is a **durable function** (each `step.run` is individually retryable):

1. `fetch-transcript` — downloads the raw transcript file.
2. `parse-transcript` — parses JSONL into `StreamTranscriptItem[]` (`jsonl-parse-stringify`).
3. `add-speakers` — maps `speaker_id` to real names by looking up both `users` and `agents` in the DB.
4. `calculate-talk-time` — sums each speaker's speaking duration (in ms).
5. `generate-ai-insights` — sends the transcript to `gpt-4o-mini` with a strict JSON schema:

```json
{
  "summary": "...", 
  "keyDecisions": ["..."],
  "actionItems": [{ "task": "...", "assignedTo": "..." }],
  "sentiment": "Positive" | "Neutral" | "Negative"
}
```

6. `save-summary` — updates the meeting row (`summary`, `keyDecisions`, `actionItems` as JSON string, `sentiment`, `talkTimePerUser`, status `completed`).
7. `create-notification` — inserts a `summary_ready` notification.

## 5. Smart Search ("Ask AI")

`meetings.smartSearch` checks the meeting belongs to the user, fetches the transcript, and asks `gpt-4o-mini` to return only the relevant parts answering the query — a lightweight retrieval-QA flow.

## 6. Analytics

`meetings.getAnalytics` pulls all of a user's meetings and aggregates total duration, completed count, and per-user talk time (parsed from the stored JSON). `getStats` returns totals for the dashboard cards.

## 7. Video Call Token Flow

`meetings.generateToken` upserts the user into Stream and returns a short-lived (1-hour) user token. The client uses it as a `tokenProvider` for `StreamVideoClient` so users never need to handle secret keys in the browser.

---

# 🖼️ UI/UX Explanation

**Pages available:**

- **`/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`** — Clean card-based auth screens with email/password forms, Google/GitHub buttons, and full branding panel.
- **`/` (Dashboard)** — Welcome header, stat cards (Total Agents, Total Meetings, Avg Duration, Upcoming), and an AI Insights & Talk-Time bar chart.
- **`/meetings`** — Card grid of meetings with status dots, agent avatars, and click-to-open detail. Header supports search, status filter, and "New Meeting".
- **`/meetings/[id]`** — Meeting detail. Renders one of five states: Upcoming, Active, Completed, Processing, Cancelled. Completed meetings get tabs for **Summary**, **Transcript**, **Recording**, and **Ask AI**.
- **`/agents`** — Data-table listing of agents with search/pagination and a "New Agent" dialog.
- **`/agents/[id]`** — Agent detail with avatar, meeting count badge, and instructions; edit/delete actions.
- **`/call/[meetingId]`** — Full-screen, dark video call experience: lobby → active call (speaker layout, controls, live transcript panel) → ended screen.
- **`/upgrade`** — Three-tier pricing (Starter $0, Pro $19, Enterprise $99) wired to Stripe checkout.
- **`/about-developers`** — Team page.
- **`/terms`, `/privacy`** — Legal pages.
- **Notification bell in navbar** — dropdown showing unread count, upcoming meetings, completed meetings with summaries, and all notifications.

**How the user interacts with the system:**
- Every list page is **server-rendered and prefetched**, then hydrated — so navigation feels instant.
- Mutations (create/edit/delete) are wrapped in React Query mutations with optimistic toast feedback and query invalidation.
- Filters and pagination are stored in the URL (`nuqs`), making every filtered view shareable.
- Destructive actions (delete agent/meeting, cancel meeting) go through a promise-based `useConfirm` dialog to prevent accidents.
- The navbar has a **⌘K** search/command palette stub ready for global search.

---

# 🚀 Deployment

**How it is deployed:** The app is built for **Vercel** (Next.js native host) with Neon (serverless Postgres), Inngest Cloud for background jobs, and Stream for video.

**Steps to deploy:**

1. Push the repo to GitHub and import it into Vercel.
2. Add all environment variables in Vercel → Project Settings → Environment Variables (see the `.env` list below).
3. Configure **BETTER_AUTH_URL** to the deployed URL (e.g. `https://your-project.vercel.app`) — never `localhost` in production.
4. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from the **Inngest Cloud** dashboard; Inngest automatically syncs functions at `/api/inngest`.
5. Add your deployed URL's callback paths to the authorized redirect URIs in your Google/GitHub OAuth apps (e.g. `https://your-project.vercel.app/api/auth/callback/google`).
6. Configure Stripe keys and Stream API keys.
7. Deploy (or wait for automatic deployment) and verify sign-up/login + a full meeting flow.

> Note: `npm run dev:webhook` is available locally using ngrok to expose the webhook route for local Stream testing.

---

# ⚠️ Challenges Faced

- **End-to-end type safety across the stack** — Getting tRPC + TanStack Query + Server Components to share the same router types took careful setup (`src/trpc/client.tsx`, `server.tsx`, `query-client.ts`). Solved by following the official tRPC + RSC hydration pattern with `HydrationBoundary`.
- **Bridging external events with the DB** — Stream events arrive via webhook, not through tRPC. The team had to build a signature-verified webhook router (`verifyWebhook`) that keeps DB state in sync with real-time call state.
- **AI agent joining a live call** — Connecting OpenAI Realtime to a Stream call required the `@stream-io/openai-realtime-api` bridge and careful timing (connecting on `session_started`, passing the agent's instructions). Getting the agent to behave per-instructions was tuned through the `updateSession({ instructions })` call.
- **Transcript parsing** — Stream transcripts arrive as JSONL (one JSON object per line) with fields like `speaker_id`, `start_ts`, `stop_ts`. The code handles both plain-JSON and JSONL formats (in the UI parser) and uses `jsonl-parse-stringify` on the server.
- **Talk-time calculation** — Transcript items had inconsistent/misnamed timestamp fields (`stop_ts` vs `shop_ts`), so the calculation guards against missing/zero durations and only counts known speakers.
- **Deployment auth failures** — Better Auth returning `429 Too Many Requests` during testing led to relaxing the rate limit to 100 req/60s and adding a dedicated `DEPLOYMENT_INSTRUCTIONS.md` covering callback URLs and env vars.
- **Status lifecycle bugs** — Guarding against double-transitions (e.g. cancelling an already-completed meeting, session_started firing when a meeting is already active/completed) required explicit status checks in both the procedures and the webhook.
- **PDF exports** — Multi-page handling with `jsPDF` (splitting long transcripts onto new pages, wrapping text) required custom pagination logic in the export functions.

---

# 🔮 Future Scope

- **Global semantic search** — Turn the ⌘K command palette into a real AI search across *all* meetings and agents (there's already a stub `DashboardCommand`).
- **Live in-call AI summaries** — Generate rolling summaries during the meeting, not just after.
- **Email notifications** — Send summary emails via Resend or similar when `summary_ready` fires.
- **Real subscription enforcement** — Gate agent/meeting creation behind the actual Stripe subscription (currently checkout is wired but limits aren't enforced in procedures).
- **Stream Agent Kit / Inngest Agent Kit** — Upgrade the static instructions-based agent into a multi-step autonomous agent.
- **Meeting attendance scheduling** — Let agents join scheduled meetings automatically on a timer (Inngest `cron` + `event` triggers).
- **More analytics** — Sentiment trends over time, meeting frequency charts, and agent performance scores.
- **Real-time search** — Live-filter the meetings/agents tables and add server-side sortable columns.
- **i18n & dark mode** — `next-themes` is already a dependency, so dark mode can be added cheaply.
- **Testing** — Add unit tests for procedures and end-to-end tests (Playwright) for the full meeting flow.

---

# 📚 Learning Outcomes

**Technical skills gained by building this project:**

- **Full-stack TypeScript** — End-to-end typed contracts from DB schema (Drizzle) to API (tRPC) to UI (React).
- **Next.js 15 App Router** — Server Components, route groups, prefetching/hydration, dynamic routes, and route handlers.
- **tRPC + TanStack Query** — Writing routers, procedures, auth middleware, server-side proxies, and caching/invalidation patterns.
- **Database design with Drizzle ORM** — Schema design, enums, relations, joins, aggregate queries (EXTRACT, COUNT), and Neon serverless Postgres.
- **Authentication systems** — Better Auth configuration, OAuth providers, session handling, and protecting API routes.
- **Real-time infrastructure** — Stream Video SDK (client + server), call lifecycle management, webhook signature verification, and transcription/recording.
- **AI integration** — OpenAI chat completions with strict JSON output, OpenAI Realtime voice agents, and prompt engineering for meeting insights.
- **Durable background jobs** — Inngest event-driven functions with retryable steps.
- **Payments** — Stripe Checkout session creation and webhook/redirect handling.
- **UI engineering** — shadcn/ui, Tailwind CSS 4, forms with react-hook-form + zod, charts with Recharts, and responsive design.
- **Software architecture** — Domain-driven module structure, separation of concerns (schemas/types/procedures/UI per module), and composing multiple external services into one product.

---

# 📦 Installation Guide

**Prerequisites:** Node.js 18+, npm, and accounts/keys for Neon (Postgres), Stream Video, Inngest, OpenAI, and (optionally) Stripe.

**1. Clone and install dependencies**

```bash
git clone <your-repo-url>
cd AI-agent---Meet
npm install
```

**2. Create the `.env` file** (at the project root):

```env
# Database
DATABASE_URL=

# Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Social providers (optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stream Video
NEXT_PUBLIC_STREAM_VIDEO_API_KEY=
STREAM_VIDEO_SECRET_KEY=

# Inngest
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=

# OpenAI
OPENAI_API_KEY=

# Stripe (optional, for payments)
STRIPE_SECRET_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**3. Push the database schema**

```bash
npm run db:push
```

**4. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**5. (For local webhook testing)** expose the webhook endpoint to Stream:

```bash
npm run dev:webhook
```

**Available scripts:**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push Drizzle schema to the database |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run dev:webhook` | Expose webhook via ngrok |

---

# 🧾 Conclusion

Apex Agent is a complete, production-shaped AI meeting assistant built by a student team. It combines a polished Next.js 15 frontend with a fully type-safe tRPC backend, a serverless PostgreSQL database, real-time video via Stream, an OpenAI-powered in-call agent, durable AI post-processing via Inngest, authentication via Better Auth, and Stripe billing — all in one dashboard.

The project demonstrates the full lifecycle of a modern AI SaaS product: a user can authenticate, create a custom AI agent, hold a real video meeting with that agent as a live participant, and automatically receive a rich AI-generated deliverable (summary, decisions, action items, sentiment, transcript, recording, analytics). It is a strong proof of concept that is already close to a shippable MVP, with clear paths to scale via subscriptions, email, and deeper agent automation.

This documentation is directly derived from the actual implementation of the project.  
Key modules referenced include:

- src/trpc/init.ts → API communication layer
- src/inngest/functions.ts → Background job processing
- src/app/api/webhook/route.ts → External event handling

This ensures that the documentation reflects the real architecture and behavior of the system.