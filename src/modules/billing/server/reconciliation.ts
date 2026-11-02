import { sql } from "drizzle-orm";
import { db } from "@/db";
import { reviewReservationBatch, runWithSanitizedBillingFailure } from "./reconciliation-policy";

const BATCH_LIMIT = 100;
type RawResult<T> = { rows: T[] };
const execute = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query) as RawResult<T>).rows;
const sanitized = runWithSanitizedBillingFailure;

export type ReconciliationSummary = { examined: number; updated: number };

/** Queue expired reservations for review; expiry is never treated as proof of failure. */
export const queueExpiredReservationReviews = async (): Promise<number> => {
  return sanitized("queue_expired_reservations", async () => {
    const rows = await execute<{ queued: number }>(sql`SELECT queue_expired_meeting_reservations(${BATCH_LIMIT}) AS queued`);
    return Number(rows[0]?.queued ?? 0);
  });
};

/** Record an inconclusive review and defer it. No capacity is released here. */
export const reviewExpiredReservations = async (): Promise<ReconciliationSummary> => {
  return sanitized("review_expired_reservations", async () => {
  const candidates = await execute<{ id: string }>(sql`
    SELECT id FROM meeting_start_reservations
    WHERE state = 'pending' AND lease_expires_at <= clock_timestamp()
      AND reconciliation_state IN ('required', 'in_progress')
      AND (last_reconciled_at IS NULL OR last_reconciled_at < clock_timestamp() - interval '5 minutes')
    ORDER BY COALESCE(next_reconciliation_at, lease_expires_at), id
    LIMIT ${BATCH_LIMIT} FOR UPDATE SKIP LOCKED
  `);
  return reviewReservationBatch(candidates.map(({ id }) => id), async (id, result) => {
    const rows = await execute<{ result: string }>(sql`SELECT record_meeting_reservation_reconciliation(${id}, ${result}) AS result`);
    return rows[0]?.result ?? "operation_failed";
  });
  });
};

/** Recompute only already materialized periods, in bounded, idempotent calls. */
export const reconcileUsageCounters = async (): Promise<ReconciliationSummary> => {
  return sanitized("reconcile_usage_periods", async () => {
  const periods = await execute<{ billing_account_id: string; period_start: string }>(sql`
    SELECT billing_account_id, period_start::text AS period_start FROM (
      SELECT billing_account_id, period_start FROM meeting_usage_periods
      UNION
      SELECT billing_account_id, period_start FROM meeting_start_reservations
      UNION
      SELECT billing_account_id, period_start FROM meeting_usage_events
    ) p ORDER BY md5(current_date::text || p.billing_account_id || p.period_start::text) LIMIT ${BATCH_LIMIT}
  `);
  let updated = 0;
  for (const period of periods) {
    await db.execute(sql`SELECT reconcile_meeting_usage_period(${period.billing_account_id}, ${period.period_start}::date)`);
    updated++;
  }
  return { examined: periods.length, updated };
  });
};
