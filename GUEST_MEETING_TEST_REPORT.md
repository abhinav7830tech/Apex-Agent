# Guest Meeting Invitation and Joining — Test Report

**Date:** 2026-11-01  
**Project:** Apex Agent (`AI-agent---Meet`)  
**Scope:** external guest invitations, public join route, Stream Video guest tokens, waiting/error states, and host + multi-guest calls.

## 1. Executive summary

The external guest meeting flow is implemented and was functionally exercised against the real database, Better Auth, and Stream Video credentials.

Verified in this run:

- A signed-in host can create a meeting, start the Stream call, and open the meeting room.
- Two separate browser profiles with **no Apex Agent account** joined the same meeting through an invitation URL by entering display names.
- The host saw both guest names in the participant list, and guest one saw the host and the other guest.
- Stream reported **3 live session participants** for the same call.
- A guest could leave without ending the call for the host.
- Invalid, expired, revoked, cancelled, completed, processing, and failed invitations are rejected with specific errors.
- Guest Stream tokens are generated **server-side**, are signed with the Stream secret, and are short-lived.
- Production URL generation rejects `http://localhost:3000` and uses only an explicit HTTPS origin.
- TypeScript, ESLint, and the production build pass.
- The Stream secret is not present in the client static bundle.

Not verified in this run:

- A deployed production session. The browser test ran against the local dev server. Production URL behavior was verified separately by executing the URL module with `NODE_ENV=production`.
- Real camera/microphone hardware or media quality. Headless Chrome used fake media devices.
- Email delivery of invitations. The host copies the link manually.

## 2. What was implemented

### Data model

`src/db/schema.ts` and `drizzle/0003_lame_sally_floyd.sql` add:

- `meeting_invites`: unguessable 32-character invitation token, meeting binding, creator, optional account requirement, expiry, revocation, usage counters.
- `meeting_guests`: anonymous guest records. The record id is also the Stream user id (`guest_...`), bound to the meeting and invitation.

### Invitation creation (host only)

`src/modules/meetings/server/procedures.ts`:

- `meetings.createInvite` is a protected procedure. It verifies that the signed-in user owns the meeting.
- Reuses a valid invitation, updates `requireAccount` when explicitly changed, or creates a new one.
- `regenerate: true` revokes existing invitations and issues a new token.
- Builds the shareable URL with `buildMeetingInviteUrl` from `src/lib/app-url.ts`.
- Refuses to create invitations when the meeting is cancelled, completed, processing, or failed.
- `meetings.revokeInvite` revokes an invitation owned by the host.

`src/modules/meetings/ui/components/invite-guests-dialog.tsx`:

- Host-facing dialog with copyable link, expiry display, “Require guests to sign in” toggle, and “New link” regeneration.
- Opening the dialog no longer overwrites an existing invitation's `requireAccount` setting; the checkbox syncs from the server response.

### Public join route

- `src/app/join/[meetingId]/page.tsx`: public route with `noindex`, `nofollow`, and `referrer: "no-referrer"` metadata.
- `src/modules/join/ui/views/join-view.tsx`: display-name entry, meeting summary, loading state, error state, waiting room, host redirect card, account-required card, and rejoin state.
- `src/modules/join/ui/components/guest-call.tsx`: guest Stream client, camera/mic preview, join lobby, active call, participant list, leave control, and join-error UI.

### Server-side validation and tokens

`src/modules/meetings/server/guest-access.ts`:

- Loads the invitation by `(meetingId, token)`. A meeting id alone is never sufficient.
- Rejects revoked and expired invitations.
- Rejects cancelled, completed, processing, and failed meetings.
- Opens the join window 10 minutes before the scheduled start.
- Keeps a scheduled meeting joinable for 15 minutes after its scheduled end (`endsAt`, or `scheduledAt + durationMinutes`).
- Returns a `waiting` state with `joinableAt` before the window opens.
- Sanitizes guest display names (2–80 characters, control characters removed).

`src/modules/meetings/server/procedures.ts`:

- `meetings.getInvite` (public): returns safe meeting data plus whether the viewer is the host or authenticated.
- `meetings.guestJoin` (public): re-validates the invitation, enforces `requireAccount`, creates an anonymous guest identity when needed, upserts the Stream user, and generates a **30-minute** Stream token on the server.
- `meetings.guestRefreshToken` (public): verifies that the guest id belongs to the same meeting and invitation, then issues a new 30-minute token.
- `meetings.generateToken` (protected, existing): verifies meeting ownership, creates the Stream call, and issues a **60-minute** host token.

### Host and registered-user access

- `/call/[meetingId]` still requires a Better Auth session and verifies meeting ownership through the protected procedures.
- A signed-in guest joining an invitation is identified by their Better Auth user id instead of an anonymous guest record.
- Sign-in and sign-up now preserve the `redirectTo` parameter, including through social sign-in and the cross-links between the two pages.

## 3. Security review

| Control | Result |
| --- | --- |
| Invitation token is unguessable | 32-character `nanoid`, not derived from the meeting id |
| Token is bound to a meeting | `getInvite` and `guestJoin` query by `(meetingId, token)` |
| Revoked invitations | Rejected with `FORBIDDEN` |
| Expired invitations | Rejected with `BAD_REQUEST` |
| Cancelled / completed / processing / failed meetings | Rejected with specific `BAD_REQUEST` messages |
| Account requirement | Enforced server-side in `guestJoin` and `guestRefreshToken`; UI shows a sign-in card |
| Host authorization | `createInvite`, `revokeInvite`, and `generateToken` require ownership |
| Guest token ownership | Refresh requires the guest record to belong to the meeting and invitation |
| Stream secret exposure | `src/lib/stream-video.ts` imports `server-only`; zero occurrences in the client static bundle |
| Token leakage through referrer | Join page sets `referrer: "no-referrer"` and is not indexed |
| Production localhost links | Production rejects non-HTTPS/localhost origins and returns a configuration error |
| Preview-domain fallback | `VERCEL_URL` / `NEXT_PUBLIC_VERCEL_URL` are not used for production invitation links |
| Client bundle localhost links | Zero `http://localhost:3000` occurrences in `.next/static` after the production build |

Remaining hardening opportunities are listed in section 6.

## 4. Verification performed

### 4.1 TypeScript and ESLint

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass, no output |
| `npx eslint src --max-warnings=0` | Pass, no output |

`next.config.ts` sets `eslint.ignoreDuringBuilds: true`, so ESLint was run separately rather than relying on the build.

### 4.2 Production URL checks

Executed with `NODE_ENV=production` against `src/lib/app-url.ts`:

| Configuration | `getAppBaseUrl()` | Invitation result |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL=http://localhost:3000` | `null` | `AppUrlConfigurationError` |
| `NEXT_PUBLIC_APP_URL=https://apex-agent-rust.vercel.app` | `https://apex-agent-rust.vercel.app` | `https://apex-agent-rust.vercel.app/join/m1?token=t1` |
| Only `VERCEL_URL=my-preview-abc.vercel.app` | `null` | `AppUrlConfigurationError` |

This is the intentional production guard: if the HTTPS application URL is missing, the host sees a configuration error instead of a link that points at localhost or a preview deployment.

### 4.3 Server-side end-to-end suite

Command: `node scripts/guest-meeting-e2e.mjs`  
Result: **62 passed, 0 failed**

The suite exercised the real Better Auth signup, protected tRPC procedures, public guest procedures, the database, and Stream:

- Join route responds.
- Host signup, agent creation, and meeting creation.
- Host Stream token is a valid three-part JWT, signed with the server secret, owned by the host, 3600 seconds, and not expired.
- Host token generation creates the Stream call with `custom.meetingId`.
- Invitation URL uses the configured base URL and contains the meeting id and token.
- Host is recognized on the invitation; anonymous viewers are not.
- Invitation response does not expose the host's user id.
- Invitation creation requires authentication.
- Guest joins without an account and receives a `guest_...` id.
- Guest display name is preserved and a guest record is created.
- Guest Stream token is a valid three-part JWT, signed with the server secret, owned by the guest, 1800 seconds, and not expired.
- Guest token refresh works and remains scoped to the same guest.
- A guest cannot refresh another guest's token.
- Invalid invitation tokens are rejected.
- An invitation token cannot be used with a different meeting id.
- Host can require an account.
- Anonymous guests are blocked when an account is required.
- A signed-in guest can join an account-required meeting and does not create an anonymous guest record.
- Another user cannot create an invitation or a host token for someone else's meeting.
- Expired invitations are rejected.
- Revoked invitations are rejected.
- Cancelled meetings are rejected.
- Completed meetings are rejected.
- Processing meetings are rejected.
- Failed meetings are rejected.
- Future meetings expose a waiting state with `joinableAt`.
- Guests cannot bypass the waiting room.
- Meetings past the join window are rejected.
- Regenerating an invitation produces a new token and revokes the old one.

### 4.4 Browser / WebRTC end-to-end suite

Command: `node scripts/guest-browser-e2e.mjs`  
Result: **11 passed, 0 failed**  
Meeting: `2y_tlmB7DxaEOcfSkqwr-`

The script launched **three isolated headless Chrome profiles**:

- Host profile with a Better Auth session cookie.
- Guest one profile with a fresh browser profile and no Apex Agent account.
- Guest two profile with a fresh browser profile and no Apex Agent account.

Headless Chrome used fake camera/microphone devices.

Verified:

| # | Assertion | Result |
| --- | --- | --- |
| 1 | Invitation URL is shareable | Pass |
| 2 | Host reached the active call UI | Pass |
| 3 | Guest one reached the active call UI after entering a display name | Pass |
| 4 | Guest two reached the active call UI after entering a display name | Pass |
| 5 | Host participant list showed both external guest names | Pass |
| 6 | Guest one participant list showed the host and the other guest | Pass |
| 7 | Stream call had three live session participants | Pass |
| 8 | Stream call session was live and not ended | Pass |
| 9 | Host UI participant control listed the guests | Pass |
| 10 | Guest one could leave without ending the call | Pass |
| 11 | Host remained in the call after the guest left | Pass |

Screenshots captured in `test-artifacts/`:

- `host-active-call.png`
- `guest-one-active-call.png`
- `guest-two-active-call.png`

Implementation detail worth noting: the Stream server SDK's `call.get({}).members` returned an empty list even while the UI and session participant count showed three people. Stream distinguishes persistent call members from live session participants. The browser test therefore verifies the live `call.session.participants` count through the raw Stream REST response. It also does not rely on `participants_count_by_role`, which reported only two of the three participants in this run. Identity was verified through the participant lists in the UI and through the signed token claims in the server-side suite.

### 4.5 Secret exposure scan

Scanned 86 files in `.next/static` after the production build:

- `STREAM_VIDEO_SECRET_KEY` value occurrences: **0**
- `http://localhost:3000` occurrences: **0**
- Source references to `STREAM_VIDEO_SECRET_KEY`: only `src/lib/stream-video.ts`, which imports `server-only`.

### 4.6 Production build

Command: `npm run build`  
Result: **Pass**

- Compiled successfully.
- Type validity check passed.
- All 22 static pages generated.
- `/join/[meetingId]` built as a dynamic route (8.4 kB page size, 357 kB first load JS).
- `/call/[meetingId]` built as a dynamic route (6.33 kB page size, 363 kB first load JS).

A production-server smoke test on port 3001 (`npm start`) returned HTTP 200 for both `/join/health-check` and `/join/test?token=test`.

## 5. Credentials required

| Capability | Environment variables |
| --- | --- |
| Database and invitations | `DATABASE_URL` |
| Better Auth host/registered-user sessions | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` |
| Stream Video calls and guest tokens | `NEXT_PUBLIC_STREAM_VIDEO_API_KEY`, `STREAM_VIDEO_SECRET_KEY` |
| Social sign-in (optional) | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| AI agent analysis, transcription, summaries (not required for joining) | `OPENAI_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, Stream webhook configuration |
| Email reminders (optional) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Paid upgrade flow (optional) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` |

The guest join flow itself requires the database, Better Auth, and Stream Video credentials. It does not require OpenAI, Inngest, Resend, or Stripe.

## 6. Known limitations and production checklist

### Limitations

- **No deployed production test.** The browser flow was tested against the local dev server. The production URL guard was verified at the module level with `NODE_ENV=production`.
- **No email delivery.** The host copies the invitation link manually. There is no per-guest email or per-guest unique link.
- **One reusable link per meeting.** The link is not single-use; it is protected by expiry, revocation, and an optional account requirement.
- **Time-based waiting room, not host admission.** Guests wait until 10 minutes before the scheduled start. There is no “admit” button for the host.
- **No explicit rate limiting on public guest procedures.** `getInvite` and `guestJoin` are public. The 32-character token and expiry help, but production should add rate limiting or a WAF rule.
- **Invitation token is in the URL.** `no-referrer` and `noindex` reduce leakage, but the token can still appear in browser history, copied links, or server logs. Always use HTTPS and rotate/revoke links if exposed.
- **Guest tokens expire after 30 minutes.** The guest client refreshes them through `guestRefreshToken`. If the invitation is revoked or the meeting closes, refresh fails and the guest must rejoin with a new link.
- **Host token expires after 60 minutes.** This is the existing host behavior; the host client refreshes through the normal Stream token provider.
- **Joinability depends on scheduled time or webhook-updated status.** If the Stream webhook is not configured, a meeting's status may not become `active`, but the scheduled window still permits joining from 10 minutes before to 15 minutes after the scheduled end. A host starting a call much earlier than that window would leave guests in the waiting room.
- **Media verification used fake devices.** The browser test proves the join, participant-list, and leave flows, not real camera/microphone hardware or media quality.
- **Test data remains in the configured database.** The E2E suites create temporary Better Auth users, agents, meetings, invitations, and guest records. They are not automatically deleted.

### Production checklist

1. Apply the database migration for `meeting_invites` and `meeting_guests` (`npm run db:migrate` or `npm run db:push`).
2. Set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the public HTTPS domain, for example `https://apex-agent-rust.vercel.app`.
3. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_STREAM_VIDEO_API_KEY`, and `STREAM_VIDEO_SECRET_KEY` in the deployment environment.
4. Configure the Stream webhook to `/api/webhook` so meeting status transitions to active/completed as expected.
5. Open a meeting's **Invite guests** dialog and confirm the copied link starts with the HTTPS production domain.
6. Consider adding rate limiting for `meetings.getInvite`, `meetings.guestJoin`, and `meetings.guestRefreshToken`.
7. Optionally configure email delivery for invitations; the current flow is copy-and-share.

## 7. How to reproduce

```bash
# Local dev server with explicit localhost URLs for the dev environment
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
BETTER_AUTH_URL=http://localhost:3000 \
npm run dev

# Server-side guest flow checks (62 assertions)
node scripts/guest-meeting-e2e.mjs

# Browser/WebRTC checks (three isolated Chrome profiles)
node scripts/guest-browser-e2e.mjs

# Static checks
npx tsc --noEmit
npx eslint src --max-warnings=0

# Production build
npm run build
```

The browser script writes screenshots to `test-artifacts/`.
