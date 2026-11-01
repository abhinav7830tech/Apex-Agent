# Phase 1 Security Hardening — Phase 1.3

## Scope delivered

- Trusted client IP extraction requires the operator to name the production ingress header with `PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER`. `VERCEL=1` is not treated as proof that the deployment has direct Vercel ingress. Only one syntactically valid address is accepted; missing, malformed, chained, or unconfigured production identity fails closed. IPv6 spellings are canonicalized before hashing.
- The shared PostgreSQL limiter uses atomic upsert counters and a sampled cleanup query capped at 100 expired rows per pass. The delete repeats its expiry predicate, so active windows are retained. Cleanup errors are logged and do not interrupt the request; limiter storage failures fail closed.
- The shared production URL parser requires a public HTTPS origin, rejects credentials and URL components beyond the origin, and classifies IP literals using `ipaddr.js` with explicit handling for `3ff0::/13` and the globally reachable `192.0.0.9` and `192.0.0.10` exceptions. Development URL behavior remains unchanged.
- Guest validation, join, refresh, and invite revocation delegate to injectable operations. Existing PostgreSQL invite state remains authoritative for future validation, join, and refresh. Stream revocation is best effort, retries twice, and emits structured error events; Stream calls are scoped to anonymous guest records. Signed-in account identities are not stored as guest records or revoked through this path.
- Guest lifecycle policy rejects invalid, expired, revoked, cancelled, completed, processing, failed, and past-window meetings, and preserves scheduled waiting behavior and the account requirement.

## Verification

Test categories and coverage:

- **Unit tests:** URL/IP classification, trusted-header choice and parsing, limiter policy, invite lifecycle and guest ownership.
- **Isolated PostgreSQL adapter tests:** `@electric-sql/pglite` runs a disposable in-memory PostgreSQL engine against the production Drizzle adapter. Coverage includes atomic upsert counts, exact window expiry, 32 concurrent increments, bounded cleanup with active rows retained, and adapter storage failures. This is not Neon or production PostgreSQL, and does not verify a separate multi-connection deployment.
- **Mocked guest operation integration tests:** Exercise the same injectable operations called by the tRPC procedures with in-memory repository/auth state and mocked Stream calls. Coverage includes invite validation, viewer/host information, join, token lifetime, account gating, signed-in identity preservation, refresh ownership, expiry/revocation, lifecycle states, invite use counts, host-only invite revocation, and Stream failures. These do not make real HTTP/tRPC requests or use a real database/Auth/Stream service.
- **Mocked Stream tests:** Verify bounded retries, failure reporting, and empty guest handling. No Stream project was contacted.

Commands and results:

- `npm run test:security` — **passed: 29 tests, 6 suites** after the final guest lifecycle and refresh-expiry assertions. Uses PGlite in-memory and mocks only; no Neon/production DB connection. The sandbox initially denied the `tsx` local IPC socket; the approved command was rerun with local IPC permission.
- `npx tsc --noEmit` — **passed** after the guest operation return types were preserved for tRPC inference.
- `npm run lint` — **passed**, no ESLint warnings or errors. Next.js reports `next lint` is deprecated and warns it inferred the workspace root from the parent lockfile.
- `npm run build` — **passed**, optimized Next.js production build completed. It was supplied placeholder credentials and `DATABASE_URL` pointed at `127.0.0.1:1`; no database connection or migration command was made. Next.js reports the same workspace-root warning. The build log indicates Next.js loaded the `.env` filename; no `.env` contents were read or displayed, and explicit placeholder process environment values were supplied for the build.
- `git diff --check` — **passed**; no whitespace errors. `git diff --name-only -- drizzle` returned no paths.

## Deployment configuration and limits

- Repository evidence does not verify the production Vercel project or ingress topology. Dashboard access or operator confirmation is still required.
- Set `PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER` to the single-value client IP header the actual ingress overwrites. For a verified direct Vercel deployment, confirm the current ingress behavior and configure the corresponding header (expected `x-forwarded-for`). Do not rely on `VERCEL=1` alone. Ensure there is no bypass route to the app where clients can forge that header. Missing or invalid identity intentionally makes guest access unavailable with a service error.
- Set `NEXT_PUBLIC_APP_URL` and/or `BETTER_AUTH_URL` to the canonical public HTTPS origin. Invalid production values are rejected. Better Auth production trust is limited to those valid configured origins.
- Apply the existing shared rate-limit table SQL through the normal reviewed deployment process before enabling the endpoints. No database was contacted, no migration was run, and no migration-history/schema file was changed in this phase.
- PostgreSQL behavior was exercised only in PGlite. Production database concurrency, schema rollout, and ingress behavior remain unverified.
- Stream behavior remains mocked. Invite revocation in the database blocks subsequent API access; it does not prove immediate revocation of a Stream token already issued. If Stream revocation fails, an already-issued token may remain valid for up to its configured 30-minute lifetime. There is no durable retry queue. A join already past its invite check may finish during a concurrent revocation.
- Hostname validation is offline and does not resolve DNS. A configured public-looking hostname that resolves to an internal address is not detected.
- No Phase 2 work has started.
