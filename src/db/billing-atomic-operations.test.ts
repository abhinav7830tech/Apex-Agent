import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = async (client: PGlite, path: string) => {
  const source = await readFile(path, "utf8");
  for (const statement of source.split(/--> statement-breakpoint\s*/).map((part) => part.trim()).filter(Boolean)) {
    await client.exec(statement);
  }
};

const setup = async () => {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE "user" (id text PRIMARY KEY);
    CREATE TABLE meetings (id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), status text NOT NULL DEFAULT 'upcoming');
  `);
  await migration(client, "drizzle/0005_billing_foundation.sql");
  await migration(client, "drizzle/0006_billing_atomic_operations.sql");
  await client.exec(`
    INSERT INTO "user" VALUES ('user-1');
    INSERT INTO meetings (id, user_id) SELECT 'meeting-' || n, 'user-1' FROM generate_series(1, 12) n;
    INSERT INTO billing_accounts (id, user_id, stripe_customer_id, usage_tracking_started_at)
    VALUES ('account-1', 'user-1', 'cus-1', '2026-01-01T00:00:00Z');
  `);
  return client;
};

const reserve = (client: PGlite, meeting: string, reservation: string) =>
  client.query<{ result: string }>(
    "SELECT reserve_meeting_start('account-1', $1, $2) AS result",
    [meeting, reservation],
  );

describe("billing and usage PostgreSQL functions in disposable PGlite", () => {
  it("enforces the Starter cap and reuses a pending reservation", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reserve(db, `meeting-${i + 1}`, `reservation-${i + 1}`)),
    );
    const values = outcomes.map((r) => r.rows[0]?.result);
    assert.equal(values.filter((v) => v === "reserved").length, 5);
    assert.equal(values.filter((v) => v === "quota_exceeded").length, 1);
    assert.equal((await reserve(db, "meeting-1", "reservation-new")).rows[0]?.result, "reservation_reused");
  });

  it("commits only the actual UTC start month and ignores duplicate starts", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    assert.equal((await reserve(db, "meeting-1", "reservation-1")).rows[0]?.result, "reserved");
    const started = "2026-02-01T00:00:01Z";
    assert.equal((await db.query<{ result: string }>(
      "SELECT commit_meeting_start('meeting-1', 'evt-start-1', $1::timestamptz) AS result", [started],
    )).rows[0]?.result, "boundary_overage");
    assert.equal((await db.query<{ result: string }>(
      "SELECT commit_meeting_start('meeting-1', 'evt-start-1', $1::timestamptz) AS result", [started],
    )).rows[0]?.result, "duplicate");
    const periods = await db.query<{ period_start: string; started_count: number; reserved_count: number }>(
      "SELECT period_start::text, started_count, reserved_count FROM meeting_usage_periods ORDER BY period_start",
    );
    assert.equal(periods.rows.find((r) => r.period_start === "2026-02-01")?.started_count, 1);
    assert.equal(periods.rows.reduce((count, row) => count + row.reserved_count, 0), 0);
  });

  it("counts successful starts while paid so a later downgrade cannot reset usage", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    await db.exec(`
      INSERT INTO billing_subscriptions (id, billing_account_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan_key, status, is_current, current_period_end)
      VALUES ('sub-1', 'account-1', 'sub-1', 'cus-1', 'price-pro', 'pro', 'active', true, clock_timestamp() + interval '1 month');
    `);
    const started = await db.query<{ started_at: Date }>("SELECT clock_timestamp() AS started_at");
    assert.equal((await db.query<{ result: string }>(
      "SELECT commit_meeting_start('meeting-1', 'evt-paid-start', $1::timestamptz) AS result",
      [started.rows[0]?.started_at],
    )).rows[0]?.result, "normal");
    await db.exec("UPDATE billing_subscriptions SET status = 'canceled', is_current = false WHERE id = 'sub-1'");
    const reservations = await Promise.all(
      [2, 3, 4, 5].map((n) => reserve(db, `meeting-${n}`, `reservation-${n}`)),
    );
    assert.equal(reservations.filter((r) => r.rows[0]?.result === "reserved").length, 4);
    assert.equal((await reserve(db, "meeting-6", "reservation-6")).rows[0]?.result, "quota_exceeded");
  });

  it("does not release an expired reservation until reconciliation confirms no start", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    await reserve(db, "meeting-1", "reservation-1");
    await db.exec(`UPDATE meeting_start_reservations SET created_at = clock_timestamp() - interval '2 hours', lease_expires_at = clock_timestamp() - interval '1 hour' WHERE id = 'reservation-1'`);
    assert.equal((await db.query<{ count: number }>("SELECT queue_expired_meeting_reservations(10) AS count")).rows[0]?.count, 1);
    assert.equal((await db.query<{ result: string }>("SELECT release_meeting_reservation('reservation-1', 'reconciled_no_start') AS result")).rows[0]?.result, "reconciliation_not_confirmed");
    assert.equal((await db.query<{ reserved_count: number }>("SELECT reserved_count FROM meeting_usage_periods WHERE billing_account_id = 'account-1'")).rows[0]?.reserved_count, 1);
    assert.equal((await db.query<{ result: string }>("SELECT record_meeting_reservation_reconciliation('reservation-1', 'confirmed_not_started') AS result")).rows[0]?.result, "confirmed_not_started");
    assert.equal((await db.query<{ result: string }>("SELECT release_meeting_reservation('reservation-1', 'reconciled_no_start') AS result")).rows[0]?.result, "released");
    assert.equal((await db.query<{ result: string }>("SELECT release_meeting_reservation('reservation-1', 'reconciled_no_start') AS result")).rows[0]?.result, "no_op");
  });

  it("repairs counters from immutable usage events", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    await reserve(db, "meeting-1", "reservation-1");
    await db.query("SELECT commit_meeting_start('meeting-1', 'evt-1', '2026-01-15T00:00:00Z')");
    await db.exec("UPDATE meeting_usage_periods SET started_count = 9");
    await db.query("SELECT reconcile_meeting_usage_period('account-1', '2026-01-01')");
    const counts = await db.query<{ started_count: number; reserved_count: number }>("SELECT started_count, reserved_count FROM meeting_usage_periods WHERE period_start = '2026-01-01'");
    assert.deepEqual(counts.rows[0], { started_count: 1, reserved_count: 0 });
    await assert.rejects(db.exec("UPDATE meeting_usage_events SET reconciliation_state = 'normal'"), /immutable/);
  });

  it("repairs stale counters before admission and preserves an actual start on counter underflow", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    const currentMonth = await db.query<{ month: string }>("SELECT date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date::text AS month");
    await db.query(
      "INSERT INTO meeting_usage_periods (billing_account_id, period_start, started_count, reserved_count) VALUES ('account-1', $1::date, 5, 0)",
      [currentMonth.rows[0]?.month],
    );
    assert.equal((await reserve(db, "meeting-1", "reservation-1")).rows[0]?.result, "reserved");
    await db.exec("UPDATE meeting_usage_periods SET reserved_count = 0 WHERE billing_account_id = 'account-1'");
    const started = await db.query<{ started_at: Date }>("SELECT clock_timestamp() AS started_at");
    const committed = await db.query<{ result: string }>(
      "SELECT commit_meeting_start('meeting-1', 'evt-underflow', $1::timestamptz) AS result",
      [started.rows[0]?.started_at],
    );
    assert.equal(committed.rows[0]?.result, "counter_anomaly");
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM meeting_usage_events WHERE meeting_id = 'meeting-1'")).rows[0]?.count, 1);
    assert.equal((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM billing_audit_events WHERE action = 'reservation_counter_underflow'")).rows[0]?.count, 1);
    const counts = await db.query<{ started_count: number; reserved_count: number }>("SELECT started_count, reserved_count FROM meeting_usage_periods WHERE period_start = $1::date", [currentMonth.rows[0]?.month]);
    assert.deepEqual(counts.rows[0], { started_count: 1, reserved_count: 0 });
  });

  it("deduplicates webhook events and protects the canonical subscription state", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    const inserted = await db.query<{ fresh: boolean }>(
      "SELECT ingest_stripe_webhook_event('evt-1', 'customer.subscription.updated', 'sub-1', '2026-01-01T00:00:00Z') AS fresh",
    );
    assert.equal(inserted.rows[0]?.fresh, true);
    assert.equal((await db.query<{ fresh: boolean }>(
      "SELECT ingest_stripe_webhook_event('evt-1', 'customer.subscription.updated', 'sub-1', '2026-01-01T00:00:00Z') AS fresh",
    )).rows[0]?.fresh, false);
    assert.equal((await db.query<{ claimed: boolean }>(
      "SELECT claim_stripe_webhook_event('evt-1', 'lease-1', clock_timestamp() + interval '1 minute') AS claimed",
    )).rows[0]?.claimed, true);
    assert.equal((await db.query<{ claimed: boolean }>(
      "SELECT claim_stripe_webhook_event('evt-1', 'lease-2', clock_timestamp() + interval '1 minute') AS claimed",
    )).rows[0]?.claimed, false);
    assert.equal((await db.query<{ retry: boolean }>(
      "SELECT record_stripe_webhook_retry('evt-1', 'lease-1', 'network timeout', clock_timestamp() + interval '1 hour') AS retry",
    )).rows[0]?.retry, true);
    assert.equal((await db.query<{ claimed: boolean }>(
      "SELECT claim_stripe_webhook_event('evt-1', 'lease-3', clock_timestamp() + interval '1 minute') AS claimed",
    )).rows[0]?.claimed, false);
  });

  it("converts a grandfathered member only once after an active subscription", async (t) => {
    const db = await setup();
    t.after(() => db.close());
    const providerCreatedAt = "2026-01-15T00:00:00Z";
    await db.exec(`
      INSERT INTO grandfathering_batches (id, cutoff_at, eligibility_rule_version, status) VALUES ('batch-1', '2026-01-01T00:00:00Z', 'rule-v1', 'applied');
      INSERT INTO grandfathering_cohort_members (batch_id, billing_account_id, eligibility_reason, member_state, applied_at, grandfathered_at)
      VALUES ('batch-1', 'account-1', 'approved cohort', 'grandfathered', clock_timestamp(), clock_timestamp());
      INSERT INTO stripe_webhook_events (stripe_event_id, event_type, provider_created_at, processing_state, lease_token, lease_expires_at)
      VALUES ('evt-active', 'customer.subscription.created', '${providerCreatedAt}', 'processing', 'lease-active', clock_timestamp() + interval '1 minute');
    `);
    const fn = `SELECT apply_canonical_subscription_event(
      'evt-active', 'lease-active', 'account-1', 'sub-1', 'cus-1', '${providerCreatedAt}', clock_timestamp(),
      'customer.subscription.created', 'pro', 'price-pro', 'active', clock_timestamp(), clock_timestamp() + interval '1 month',
      NULL, NULL, false, NULL, NULL, NULL, NULL, false
    ) AS result`;
    assert.equal((await db.query<{ result: string }>(fn)).rows[0]?.result, "applied");
    assert.equal((await db.query<{ member_state: string }>("SELECT member_state FROM grandfathering_cohort_members")).rows[0]?.member_state, "converted");
    await assert.rejects(db.exec("UPDATE grandfathering_cohort_members SET member_state = 'grandfathered'"), /permanent/);
    await assert.rejects(db.exec(`
      INSERT INTO billing_subscriptions (id, billing_account_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, plan_key, status, is_current)
      VALUES ('sub-2', 'account-1', 'sub-2', 'cus-1', 'price-enterprise', 'enterprise', 'active', true)
    `), /billing_subscriptions_one_current_per_account_idx/);

    const olderEvent = "2026-01-14T00:00:00Z";
    await db.query(
      "SELECT ingest_stripe_webhook_event('evt-older', 'customer.subscription.updated', 'sub-1', $1::timestamptz)",
      [olderEvent],
    );
    await db.query("SELECT claim_stripe_webhook_event('evt-older', 'lease-older', clock_timestamp() + interval '1 minute')");
    const stale = await db.query<{ result: string }>(`SELECT apply_canonical_subscription_event(
      'evt-older', 'lease-older', 'account-1', 'sub-1', 'cus-1', '${olderEvent}', clock_timestamp(),
      'customer.subscription.updated', 'enterprise', 'price-enterprise', 'active', clock_timestamp(), clock_timestamp() + interval '1 month',
      NULL, NULL, false, NULL, NULL, NULL, NULL, false
    ) AS result`);
    assert.equal(stale.rows[0]?.result, "stale_event");
    assert.equal((await db.query<{ stripe_price_id: string }>("SELECT stripe_price_id FROM billing_subscriptions WHERE stripe_subscription_id = 'sub-1'")).rows[0]?.stripe_price_id, "price-pro");
  });
});
