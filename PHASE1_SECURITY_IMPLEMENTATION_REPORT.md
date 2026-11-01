# Phase 1 — Production Security Hardening

## Changes made

- Added a PostgreSQL-backed, atomic fixed-window limiter for guest invite validation, join, and refresh procedures. Limits are per client address and endpoint class; over-limit requests return tRPC `TOO_MANY_REQUESTS` (HTTP 429) with retry seconds in the response message. Database failures fail closed with `SERVICE_UNAVAILABLE` (HTTP 503).
- Added Stream revocation for anonymous guest users associated with a revoked invite. Stream tokens issued before revocation are invalidated with `revoke_tokens_issued_before`; active guest sessions are also kicked and blocked from rejoining the meeting call.
- Revoked active invitation records when a meeting is cancelled. Reactivating a cancelled meeting therefore requires the host to issue a new invite. Explicit invite regeneration also invalidates associated Stream guest identities.
- Removed hard-coded production and preview origins from Better Auth. Production trusts only configured HTTPS, non-local origins; Vercel preview hostnames and localhost are not added in production.
- Existing production invitation URL construction already required an explicitly configured HTTPS origin; that behavior remains the production requirement.

## Files changed

- `src/lib/public-rate-limit.ts`
- `src/lib/rate-limit-policy.ts`
- `src/lib/rate-limit-policy.test.ts`
- `src/lib/auth.ts`
- `src/modules/meetings/server/guest-access.ts`
- `src/modules/meetings/server/procedures.ts`
- `src/db/schema.ts`
- `drizzle/0004_shared_public_rate_limits.sql`
- `drizzle/meta/_journal.json`
- `package.json`

## Security improvements

- Shared rate-limit state works across application instances and does not degrade to per-process memory. Missing rate-limit storage disables public guest access temporarily instead of allowing requests through.
- Revoked invitations cannot pass guest validation, joining, or refresh. For anonymous guest Stream identities, the SDK’s user token revocation timestamp is applied and active call sessions are kicked.
- Cancelled meeting invitations are permanently revoked, so reactivation cannot make their old credentials valid again. Rescheduling keeps otherwise valid invitations; normal expiry and meeting time checks still apply.
- Production authentication trust no longer includes checked-in preview domains or localhost.

## Tests and checks executed

- `npm run test:security` — **passed**, 2 tests. Covers per-window threshold behavior and positive retry timing. It required an elevated local run because `tsx` creates an IPC socket that the sandbox denied.
- `npx tsc --noEmit` — **passed**.
- `npm run lint` — **passed**, no ESLint warnings or errors. The command reports that `next lint` is deprecated.
- `npm run build` — **passed**, optimized production build completed. Next.js warned that it inferred the workspace root from a parent lockfile; this did not fail the build.
- `git diff --check` — **passed**.

## Remaining risks and unverified behavior

- The automated suite is currently a policy unit test, not an integration suite. Unauthorized access, expired/revoked invitation responses, cancellation/reactivation, rescheduling, database-backed rate-limit enforcement, and Stream refresh/revocation were not exercised end to end.
- Rate-limit keys use the client address supplied by the hosting ingress (`x-forwarded-for`, then `x-real-ip`). Production ingress must overwrite/sanitize these headers so clients cannot choose their own rate-limit identity.
- Stream token revocation is applied only to anonymous guest identities recorded against the invite. Signed-in users retain their account identity and are not revoked globally when one invite is revoked. A currently active anonymous guest session is kicked; behavior ultimately depends on Stream accepting the SDK update/kick requests.
- Rate-limit counters remain in PostgreSQL after their windows expire. Periodic cleanup should be added before sustained high-volume operation to bound table growth.
- Revocation cannot reach Stream if its service is unavailable at the time of the operation. The invitation is already marked revoked in PostgreSQL, so further token refresh is blocked; already-issued Stream access may remain valid until Stream processes revocation or its 30-minute token expires.

## External configuration required

- Apply `drizzle/0004_shared_public_rate_limits.sql` to the intended database through the normal reviewed deployment process before enabling the guest APIs with the new limiter. **No migration was run in this task.**
- Set `NEXT_PUBLIC_APP_URL` and/or `BETTER_AUTH_URL` to the canonical public production HTTPS origin. Production invite creation requires this configuration; production Better Auth trusts only those configured HTTPS origins.
- Ensure the production proxy supplies a trustworthy client IP header.
- Stream API credentials must remain configured for issuing and revoking guest tokens. No new external service or credential was introduced.

## Features not fully verified

- End-to-end guest API abuse handling and `Retry-After` HTTP header behavior. Retry seconds are currently included in the tRPC error message; a dedicated HTTP `Retry-After` header is not emitted by this implementation.
- Stream server-side revocation and live-session kick against a real Stream project.
- Lifecycle and authorization regression scenarios listed above require an isolated test database and Stream test credentials. They should be added and run before production rollout.

Phase 1 implementation work is complete in this checkpoint. Phase 2 has not been started.
