# Apex Agent — Phase 2B.7 Static Readiness Report

Date: 2026-11-02

## Handoff audit

- Branch: `main`, tracking `origin/main`.
- HEAD: `c6e06ba` (`security: harden Stream meeting failure handling`). Recent history contains Phase 1 security commits/checkpoints; no Phase 2B implementation/readiness report is present in the repository. Available reports are the project audit, implementation report, Phase 1 security report, and the Phase 2B.6 operations note.
- Before Phase 2B.7 documentation changes: no staged files; eight tracked files modified and 16 untracked paths. Those are pre-existing handoff work and were preserved. No reset, checkout, commit, push, or deployment was performed.
- No `psql`, `postgres`, `initdb`, `pg_ctl`, Docker, or Podman executable was found in the checked local paths. No local PostgreSQL instance was started or contacted. No PostgreSQL software was installed.
- No environment file values, Neon service, Stripe service, production data, or customer records were inspected.

## Static database and migration review

The billing schema contains nine tables: `billing_accounts`, `billing_audit_events`, `billing_subscriptions`, `grandfathering_batches`, `grandfathering_cohort_members`, `meeting_start_reservations`, `meeting_usage_events`, `meeting_usage_periods`, and `stripe_webhook_events`. Static schema/migration review found the expected account/customer and subscription uniqueness, one-current-subscription partial unique index, one-pending-reservation-per-meeting partial unique index, immutable usage-event trigger, period/count checks, trial/grace/order checks, audit idempotency key, and webhook state/lease checks. The migration includes 15 billing SQL functions and the schema defines the related lookup/reconciliation indexes.

The 15 billing functions in `0006` are declared `SECURITY DEFINER`, set `search_path = public, pg_temp`, and have explicit `REVOKE ALL ... FROM PUBLIC` statements. This is a static source check only: function owners, effective grants, schema ownership/`CREATE` privileges, and behavior under the intended runtime role cannot be verified without PostgreSQL. The current SQL does not assign function ownership or grant runtime `EXECUTE`. `public` write privileges must be confirmed/restricted before relying on this search path for privileged execution. No least-privilege grant SQL has been added or applied.

The migration journal contains entries `0000` through `0006`. Historical `0000_even_adam_warlock.sql` is a commented introspection dump; the executable statements in `0001` start with `ALTER TYPE` and `ALTER TABLE` against objects the commented dump would have created. Therefore a clean database cannot be built by applying the migration journal alone. The Phase 2B.6 operations document now records this limitation. A separate, authoritative pre-`0001` schema artifact is missing; no baseline was invented, and `0000` was not edited. The full migration chain was not run.

The existing `src/db/billing-atomic-operations.test.ts` creates a minimal handwritten user/meeting schema and applies only `0005` and `0006` in PGlite. It is not the full migration chain, not a disposable PostgreSQL server, and its parallel promises use one in-memory PGlite client. It cannot establish multi-session PostgreSQL quota concurrency, lock behavior, function ownership, or production grants.

## Product and application review

Static source matches the approved catalog/policies: Pro is 1900 cents USD/month; Enterprise is 9900 cents USD/month; first eligible Checkout requests a 14-day trial; SQL sets a 14-day failed-payment grace; plan updates request `create_prorations`; one current subscription is protected by a partial unique index; and subscription snapshots retain cancellation-at-period-end state. Actual starts are stored after the activation cutoff for all plans, and period calculation uses UTC. The fixed cohort has one membership per account, guarded transitions, conversion after verified active/trialing state, and a terminal converted state. No cohort insertion or usage backfill was run.

Reservation SQL serializes admission on the billing-account row and recalculates from immutable starts/pending reservations before applying the five-start Starter limit. Expiry queues review and does not itself release capacity. The worker records inconclusive results only; no release is performed by the worker. Existing quota enforcement remains disabled by default and no meeting gate was added in this phase.

The Inngest workers and Stream integration are application code, not evidence of PostgreSQL function grants. The daily usage worker is bounded to 100 periods per run and uses a date-seeded hash order; it does not expose a durable cursor or an explicit “more periods remain” health value. On a large account set, complete daily coverage is not proven by this design and should be addressed before relying on it as an exhaustive daily audit.

## Legacy Stripe mapping design

No Stripe or database inventory was performed. A future read-only discovery should produce a restricted, auditable candidate manifest with: Apex billing account/user identifiers, Stripe customer/subscription identifiers, source/evidence references, canonical status, canonical configured price and interval, periods/trial/cancellation state, duplicate/ownership checks, reviewer, review time, and disposition. Evidence must connect the user to the customer independently of an old redirect, email match alone, or client-supplied metadata. A Stripe customer by itself is not a subscription or entitlement.

For each candidate, independently verify the Apex account relationship from approved account records and the Stripe customer/subscription relationship from canonical provider records; verify exactly one supported recurring price and a current eligible status; record ambiguous, terminal, duplicate, or unsupported records as “unmapped / manual review.” A second reviewer should approve a proposed customer-to-account mapping before a separate idempotent write/import. Preserve all existing billing and usage history, record before/after identifiers and source evidence, and never backfill meeting usage.

Current webhook reconciliation requires the customer to map to an existing `billing_accounts.stripe_customer_id` and requires subscription metadata to match both Apex account and user IDs. Legacy subscriptions without those fields are rejected safely; this repository does not yet implement a privileged metadata-free legacy import path. Such records must remain unmapped until a separately reviewed importer/reconciliation interface is implemented and tested. This report does not change provider metadata or grant entitlements.

## PostgreSQL validation still required

When an approved baseline source and a disposable PostgreSQL instance are available, validate in this order:

1. Record PostgreSQL version and checksum of the approved pre-`0001` schema artifact; provision an isolated empty database and separate owner/function-owner/runtime roles.
2. Restore the approved baseline as a distinct bootstrap step. Apply migrations `0001`–`0006` in journal order without rewriting or pretending `0000` creates the baseline.
3. Verify all nine tables, every index/constraint/trigger, all 15 function signatures and return paths, actual owners, `SECURITY DEFINER`, safe search path, `PUBLIC` revocation, and grants under the runtime identity. Ensure untrusted users cannot create objects in any definer search-path schema.
4. Exercise simultaneous independent PostgreSQL sessions trying to reserve beyond five starts; verify exactly five admissions and safe results for losers. Repeat with paid entitlement and Starter downgrade to verify all post-activation starts count.
5. Test duplicate Stream identities, same-meeting conflicting event identities, delayed actual starts after lease expiry, UTC month-boundary starts, reservation cancellation/failure/no-start evidence and retry recovery, counter repair, webhook lease contention/retry, and stale canonical events.
6. Test rollback only on disposable data. Prefer forward fixes; verify any down/restore procedure never deletes billing audit events, subscriptions, immutable usage events, or account history. No rollback procedure has been validated or defined here.
7. Destroy the disposable environment and retain test logs, PostgreSQL version, role/grant report, migration hashes, and review approval. Production/Neon work remains a separately authorized phase.

## Local verification status

PostgreSQL-owned properties above remain **unverified**. Local checks from this session:

- `npm run test:security` — passed, 41 tests. Includes existing in-process PGlite rate-limit tests and mocks.
- `npm run test:billing` — passed, 26 tests.
- `npx tsx --test src/db/billing-atomic-operations.test.ts` — passed, 8 tests in in-process PGlite. The suite manually creates a minimal base schema, then applies only billing migrations `0005` and `0006`; it does not test the full chain or separate PostgreSQL sessions.
- `npx tsc --noEmit` — passed.
- `npx eslint src` — passed.
- `git diff --check` — passed.

No PostgreSQL server, migration command, database URL, Neon, or Stripe service was used. No production build was needed for this static readiness pass.
