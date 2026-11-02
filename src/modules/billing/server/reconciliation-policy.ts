const MAX_BATCH = 100;
export type ReconciliationSummary = { examined: number; updated: number };

export const runWithSanitizedBillingFailure = async <T>(
  operation: string,
  run: () => Promise<T>,
  log: (event: string, details: { operation: string; code: string }) => void = console.error,
): Promise<T> => {
  try {
    return await run();
  } catch {
    log("billing_reconciliation_database_failure", { operation, code: "BILLING_SQL_UNAVAILABLE" });
    throw new Error("billing_reconciliation_database_failure");
  }
};

/** Expiry produces an inconclusive review only; callers cannot request release. */
export const reviewReservationBatch = async (
  ids: string[],
  record: (id: string, result: "inconclusive") => Promise<string>,
): Promise<ReconciliationSummary> => {
  let updated = 0;
  for (const id of ids.slice(0, MAX_BATCH)) {
    if (await record(id, "inconclusive") === "inconclusive") updated++;
  }
  return { examined: Math.min(ids.length, MAX_BATCH), updated };
};
