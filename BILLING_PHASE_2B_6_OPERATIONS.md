# Billing Phase 2B.6 operations

## Safe feature switches

`BILLING_ENABLED` is opt-in and defaults to off when absent. When false, authenticated Checkout creation and plan switches return `BILLING_DISABLED`; billing history reads, portal access, signed Stripe webhook ingestion, and subscription reconciliation remain available when their server configuration is complete. The webhook route requires only the Stripe API key, webhook signing secret, and both configured recurring price IDs; it does not require purchase-only trial or return-origin settings. Missing required Stripe configuration causes the billing operation to fail closed with a generic configuration error. This switch does not affect auth or meetings.

`BILLING_QUOTA_ENFORCEMENT_ENABLED` is a separate opt-in switch and defaults to off. Phase 2B.6 does not use it to gate meeting creation, joins, or starts. Do not enable it in this phase.

## Stream start evidence

The installed `@stream-io/node-sdk` declaration for `CallSessionStartedEvent` contains outer `created_at` and nested `call.session.started_at?: Date` (`node_modules/@stream-io/node-sdk/dist/src/gen/models/index.d.ts`, `CallSessionStartedEvent` and `CallSessionResponse`). The handler verifies the Stream webhook signature before parsing or acting on the event. Billing uses only `call.session.started_at`; it never substitutes outer `created_at` or request receipt time. Stable idempotency identity is derived from `call_cid` plus `session_id`, hashed before passing to `commit_meeting_start`. Missing/invalid timestamp, call CID, session ID, or meeting ID skips billing. Existing meeting lifecycle work continues if the optional billing SQL function is unavailable.

## Reconciliation operations

Inngest runs reservation review every five minutes and usage-counter reconciliation daily at 02:17 UTC. Each execution is concurrency-limited to one and processes at most 100 rows. Inngest retries failed runs up to five times. Structured logs report only counts and a fixed operation name.

Expired reservations are queued for review and recorded as inconclusive when no trusted no-start evidence is available. Expiration itself never releases capacity. A release requires trusted server-side confirmation of failure, cancellation, or confirmed no-start, and must call `release_meeting_reservation` with its evidence reason. No automatic release path is implemented. The usage worker calls `reconcile_meeting_usage_period`, whose SQL recomputes counts from authoritative event/reservation rows and is safe to repeat. The database functions are revoked from PUBLIC; deployment must grant only the application backend role the required EXECUTE permissions. Missing grants surface as failed, retryable Inngest runs and sanitized application logs.

Worker health is visible in the Inngest function run history: inspect latest successful run time, retry count, terminal failures, and the structured `billing_*_reconciliation_complete` counts. Do not mark a failed run healthy until permissions and function availability are corrected.

## Legacy Checkout account reconciliation

The repository contains the authenticated `/api/checkout` flow and its signed webhook processing. No separate pre-billing customer/subscription migration implementation or authoritative legacy mapping file is present in this checkout. Legacy subscriptions must therefore be reconciled manually through an audited operator workflow before any Apex entitlement is created.

For each candidate, establish the Apex user from an independently verified account record, retrieve the canonical Stripe customer and subscription through the authorized Stripe operator workflow, verify subscription status and configured recurring price, and verify customer ownership using records independent of Checkout success redirects or client-supplied metadata. Then map the Stripe customer ID to the matching `billing_accounts` row and apply the canonical subscription snapshot through the normal signed-webhook/reconciliation path. If multiple or no Apex account matches, ownership is unclear, the subscription is terminal, or price/status is unsupported, leave it unmapped and escalate for manual review. Never infer active entitlement from a redirect, email match alone, Checkout metadata alone, or the existence of a Stripe customer. Do not create subscriptions or grant plans as part of discovery.

This phase adds no automatic legacy importer, no cohort/grandfathering membership, and no backfill.

## Fresh database bootstrap (separate from normal migrations)

Do not rewrite `0000` or any historical migration and do not invent a baseline. `0000_even_adam_warlock.sql` is a commented introspection dump whose statement-breakpoint markers are inside the block comment, so the standard Drizzle runner cannot execute it. `0001_confused_kate_bishop.sql` then alters types and tables that the commented portion of `0000` would have created. The preserved pre-`0001` baseline is `drizzle/bootstrap/0000_pre_migration_baseline.sql`; its DDL is byte-identical to the commented block in `0000` and is checked by `npm run test:bootstrap`.

Phase 2B.7-C validated the full sequence on an isolated disposable PostgreSQL 17.11 instance. The baseline produced 7 tables; `0001` through `0006` produced 20 tables, 2 enums, and 15 functions. Catalog comparison matched `0006_snapshot.json` for 221 columns, 11 unique constraints, 19 foreign keys, 24 check constraints, 30 indexes, and 15 functions. The only differences were three foreign-key names truncated to PostgreSQL's 63-byte identifier limit; the definitions themselves matched. All 64 functional tests passed, including separate-session quota concurrency. The disposable environment was destroyed afterwards.

For a fresh, disposable database, use the dedicated command:

```bash
DATABASE_URL='postgres://...' npm run db:init
```

`db:init` validates the journal and baseline provenance, refuses populated or incompatible schemas, applies the baseline and the exact `0000` history record (original SHA-256 hash and journal `when`) in one transaction, then invokes the standard `drizzle-kit migrate` runner for `0001` through `0006`. The command is retry-safe: an interrupted baseline transaction rolls back; a failed later migration rolls back all pending migrations and leaves the committed baseline registered. Rerunning `db:init` is idempotent. See `drizzle/bootstrap/README.md` for accepted database states and limitations.

Exact procedure for a later disposable PostgreSQL/Neon validation:

1. Provision an isolated disposable database with no production or staging data and record its version.
2. Point a temporary `DATABASE_URL` at that disposable database only; do not copy production credentials.
3. Verify the baseline artifact checksum and run `npm run db:init`. Do not apply `0000` through the standard runner on an empty database.
4. Confirm the baseline and `0000` history row were committed, then confirm `0001` through `0006` were applied in journal order with the standard runner.
5. As a separate privilege-bootstrap action, create/identify a dedicated non-login function-owner role and a distinct application runtime role. Verify the function owner has only necessary table privileges, the runtime role is not an owner, `PUBLIC` has no execute grants, and untrusted roles cannot create objects in schemas on a definer function's search path. Grant only required runtime table access and `EXECUTE` permissions.
6. Run the full migration/function/permission validation suite on that disposable instance, including clean/repeat migration behavior, function contracts, separate-session quota concurrency, locking/idempotency, boundaries, expiry recovery, and history-preserving rollback. Capture PostgreSQL version, baseline artifact checksum, role grants, and results.
7. Destroy the disposable database and temporary credentials. Only after review may an independently planned production rollout use the approved sequence.

Normal upgrades continue to apply only the next unapplied historical migration. The bootstrap role/grant procedure is not another migration and must not be folded into `0000` or used to replace the migration journal.
