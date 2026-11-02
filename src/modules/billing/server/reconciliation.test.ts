import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewReservationBatch, runWithSanitizedBillingFailure } from "./reconciliation-policy";

describe("billing reconciliation policy", () => {
  it("reviews expired reservations as inconclusive and never releases on expiry", async () => {
    const decisions: string[] = [];
    const summary = await reviewReservationBatch(["r1", "r2"], async (id, result) => {
      decisions.push(`${id}:${result}`);
      return "inconclusive";
    });
    assert.deepEqual(summary, { examined: 2, updated: 2 });
    assert.deepEqual(decisions, ["r1:inconclusive", "r2:inconclusive"]);
  });

  it("bounds batches and propagates transient failures so Inngest can retry", async () => {
    const hundredOne = Array.from({ length: 101 }, (_, index) => `r${index}`);
    let count = 0;
    const summary = await reviewReservationBatch(hundredOne, async () => { count++; return "inconclusive"; });
    assert.deepEqual(summary, { examined: 100, updated: 100 });
    assert.equal(count, 100);
    await assert.rejects(reviewReservationBatch(["r1"], async () => { throw new Error("transient"); }), /transient/);
  });

  it("hides missing SQL function/grant details while preserving retry visibility", async () => {
    const logs: unknown[] = [];
    await assert.rejects(
      runWithSanitizedBillingFailure("commit_meeting_start", async () => { throw new Error("permission denied for function commit_meeting_start"); }, (_event, details) => logs.push(details)),
      /billing_reconciliation_database_failure/,
    );
    assert.deepEqual(logs, [{ operation: "commit_meeting_start", code: "BILLING_SQL_UNAVAILABLE" }]);
  });
});
