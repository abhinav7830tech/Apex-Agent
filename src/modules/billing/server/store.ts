import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billingAccounts,
  billingSubscriptions,
  grandfatheringBatches,
  grandfatheringCohortMembers,
} from "@/db/schema";
import type { BillingPlanKey } from "../plans";
import { resolveEntitlement, type SubscriptionSnapshot } from "./entitlements";
import type {
  BillingAccountRecord,
  BillingState,
  BillingStore,
  BillingUser,
  CheckoutSession,
  SupportedBillingEvent,
} from "./operations";

const accountRecord = (row: typeof billingAccounts.$inferSelect): BillingAccountRecord => ({
  id: row.id,
  userId: row.userId,
  stripeCustomerId: row.stripeCustomerId,
  pendingCheckoutSessionId: row.pendingCheckoutSessionId,
  pendingCheckoutPlanKey: row.pendingCheckoutPlanKey as BillingPlanKey | null,
  pendingCheckoutExpiresAt: row.pendingCheckoutExpiresAt,
  pendingCheckoutIdempotencyKey: row.pendingCheckoutIdempotencyKey,
});

const subscriptionSnapshot = (row: typeof billingSubscriptions.$inferSelect | undefined): SubscriptionSnapshot | null => {
  if (!row) return null;
  return {
    stripeSubscriptionId: row.stripeSubscriptionId,
    planKey: row.planKey as BillingPlanKey,
    status: row.status,
    isCurrent: row.isCurrent,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    trialEnd: row.trialEnd,
    graceUntil: row.graceUntil,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    pendingPlanKey: row.pendingPlanKey as BillingPlanKey | null,
  };
};

const rawRows = async <T>(query: ReturnType<typeof sql>) => {
  const result = await db.execute(query);
  return result.rows as T[];
};

const getAccountById = async (id: string) => {
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.id, id)).limit(1);
  return row ?? null;
};

const getAccountByUser = async (userId: string) => {
  const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.userId, userId)).limit(1);
  return row ?? null;
};

const loadState = async (row: typeof billingAccounts.$inferSelect): Promise<BillingState> => {
  const [subscriptionRow] = await db.select().from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.billingAccountId, row.id), eq(billingSubscriptions.isCurrent, true)))
    .limit(1);
  const [cohort] = await db.select({ state: grandfatheringCohortMembers.memberState, batchStatus: grandfatheringBatches.status })
    .from(grandfatheringCohortMembers)
    .innerJoin(grandfatheringBatches, eq(grandfatheringBatches.id, grandfatheringCohortMembers.batchId))
    .where(eq(grandfatheringCohortMembers.billingAccountId, row.id))
    .limit(1);
  const [priorTrial] = await db.select({ id: billingSubscriptions.id }).from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.billingAccountId, row.id), isNotNull(billingSubscriptions.trialStart)))
    .limit(1);
  const subscription = subscriptionSnapshot(subscriptionRow);
  return {
    account: accountRecord(row),
    subscription,
    entitlement: resolveEntitlement({
      accountExists: true,
      grandfatheringState: cohort?.state ?? null,
      grandfatheringBatchStatus: cohort?.batchStatus ?? null,
      subscription,
    }),
    hasPriorTrial: Boolean(priorTrial),
  };
};

export const billingStore: BillingStore = {
  async commitMeetingStart(meetingId, streamEventId, actualStartedAt) {
    const rows = await rawRows<{ result: string }>(sql`
      SELECT commit_meeting_start(${meetingId}, ${streamEventId}, ${actualStartedAt}) AS result
    `);
    return rows[0]?.result ?? "operation_failed";
  },
  async getOrCreateAccount(user: BillingUser, activationAt: Date) {
    const existing = await getAccountByUser(user.id);
    if (existing) return accountRecord(existing);
    try {
      const [created] = await db.insert(billingAccounts).values({
        userId: user.id,
        usageTrackingStartedAt: activationAt,
      }).returning();
      if (created) return accountRecord(created);
    } catch {
      // A concurrent request may have created the unique account row.
      const concurrent = await getAccountByUser(user.id);
      if (concurrent) return accountRecord(concurrent);
      throw new Error("billing_account_create_failed");
    }
    const winner = await getAccountByUser(user.id);
    if (!winner) throw new Error("billing_account_create_failed");
    return accountRecord(winner);
  },
  async getState(accountId: string) {
    const account = await getAccountById(accountId);
    if (!account) throw new Error("billing_account_missing");
    return loadState(account);
  },
  async getAccountByCustomer(customerId: string) {
    const [row] = await db.select().from(billingAccounts).where(eq(billingAccounts.stripeCustomerId, customerId)).limit(1);
    return row ? accountRecord(row) : null;
  },
  async setCustomerIfEmpty(accountId: string, customerId: string) {
    const [updated] = await db.update(billingAccounts).set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(and(eq(billingAccounts.id, accountId), sql`${billingAccounts.stripeCustomerId} IS NULL`))
      .returning({ stripeCustomerId: billingAccounts.stripeCustomerId });
    if (updated?.stripeCustomerId) return updated.stripeCustomerId;
    const current = await getAccountById(accountId);
    if (!current?.stripeCustomerId) throw new Error("billing_customer_mapping_failed");
    return current.stripeCustomerId;
  },
  async claimCheckout(input) {
    const rows = await rawRows<{ id: string }>(sql`
      UPDATE billing_accounts AS a
      SET pending_checkout_session_id = ${input.claimId},
          pending_checkout_plan_key = ${input.planKey},
          pending_checkout_expires_at = ${input.expiresAt},
          pending_checkout_idempotency_key = ${input.idempotencyKey},
          updated_at = clock_timestamp()
      WHERE a.id = ${input.accountId}
        AND a.pending_checkout_session_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM billing_subscriptions s
          WHERE s.billing_account_id = a.id AND s.is_current
        )
      RETURNING a.id
    `);
    return rows.length === 1;
  },
  async saveCheckoutSession(accountId, claimId, session: CheckoutSession) {
    const rows = await rawRows<{ id: string }>(sql`
      UPDATE billing_accounts SET
        pending_checkout_session_id = ${session.id},
        pending_checkout_expires_at = ${session.expiresAt},
        updated_at = clock_timestamp()
      WHERE id = ${accountId} AND pending_checkout_session_id = ${claimId}
      RETURNING id
    `);
    if (rows.length !== 1) throw new Error("checkout_claim_lost");
  },
  async clearCheckoutClaim(accountId, claimId) {
    await db.execute(sql`
      UPDATE billing_accounts SET pending_checkout_session_id = NULL,
        pending_checkout_plan_key = NULL, pending_checkout_expires_at = NULL,
        pending_checkout_idempotency_key = NULL, updated_at = clock_timestamp()
      WHERE id = ${accountId} AND pending_checkout_session_id = ${claimId}
    `);
  },
  async clearExpiredCheckout(accountId, sessionId) {
    const rows = await rawRows<{ cleared: boolean }>(sql`
      SELECT revoke_expired_checkout(${accountId}, ${sessionId}, true) AS cleared
    `);
    return rows[0]?.cleared === true;
  },
  async clearResolvedCheckout(accountId, sessionId) {
    const rows = await rawRows<{ id: string }>(sql`
      UPDATE billing_accounts AS a SET
        pending_checkout_session_id = NULL,
        pending_checkout_plan_key = NULL,
        pending_checkout_expires_at = NULL,
        pending_checkout_idempotency_key = NULL,
        updated_at = clock_timestamp()
      WHERE a.id = ${accountId}
        AND a.pending_checkout_session_id = ${sessionId}
        AND NOT EXISTS (
          SELECT 1 FROM billing_subscriptions s
          WHERE s.billing_account_id = a.id AND s.is_current
        )
      RETURNING a.id
    `);
    return rows.length === 1;
  },
  async ingestWebhook(event: SupportedBillingEvent) {
    await db.execute(sql`SELECT ingest_stripe_webhook_event(
      ${event.id}, ${event.type}, ${event.objectId}, ${event.createdAt}
    )`);
  },
  async requeueWebhookReconciliation(eventId) {
    // Stripe retries a 5xx delivery. A prior canonical-read race leaves the
    // ledger in `reconcile`; move only that event back to the atomic claim path.
    await db.execute(sql`
      UPDATE stripe_webhook_events SET processing_state = 'retry',
        next_attempt_at = clock_timestamp(), lease_token = NULL,
        lease_expires_at = NULL
      WHERE stripe_event_id = ${eventId} AND processing_state = 'reconcile'
    `);
  },
  async claimWebhook(eventId, leaseToken, expiresAt) {
    const rows = await rawRows<{ claimed: boolean }>(sql`
      SELECT claim_stripe_webhook_event(${eventId}, ${leaseToken}, ${expiresAt}) AS claimed
    `);
    return rows[0]?.claimed === true;
  },
  async applyCanonicalSubscription(input) {
    const { event, subscription, account } = input;
    const rows = await rawRows<{ result: string }>(sql`
      SELECT apply_canonical_subscription_event(
        ${event.id}, ${input.leaseToken}, ${account.id}, ${subscription.id}, ${subscription.customerId},
        ${event.createdAt}, ${input.observedAt}, ${event.type}, ${input.planKey}, ${input.priceId},
        ${subscription.status}, ${subscription.currentPeriodStart}, ${subscription.currentPeriodEnd},
        ${subscription.trialStart}, ${subscription.trialEnd}, ${subscription.cancelAtPeriodEnd},
        ${subscription.cancelAt}, ${subscription.canceledAt}, ${subscription.endedAt},
        ${event.invoiceId}, ${subscription.pendingUpdate}
      ) AS result
    `);
    return rows[0]?.result ?? "operation_failed";
  },
  async recordWebhookRetry(eventId, leaseToken, code, nextAttemptAt) {
    await db.execute(sql`SELECT record_stripe_webhook_retry(
      ${eventId}, ${leaseToken}, ${code}, ${nextAttemptAt}
    )`);
  },
  async beginPlanSwitch(input) {
    const rows = await rawRows<{ result: string }>(sql`
      SELECT begin_subscription_switch(
        ${input.accountId}, ${input.subscriptionId}, ${input.planKey}, ${input.priceId}, ${input.idempotencyKey}
      ) AS result
    `);
    return rows[0]?.result ?? "operation_failed";
  },
  async clearPlanSwitch(subscriptionId, idempotencyKey) {
    await db.update(billingSubscriptions).set({
      pendingPlanKey: null,
      pendingPriceId: null,
      pendingSwitchIdempotencyKey: null,
      pendingSwitchRequestedAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(billingSubscriptions.stripeSubscriptionId, subscriptionId),
      eq(billingSubscriptions.pendingSwitchIdempotencyKey, idempotencyKey),
    ));
  },
  async getVerifiedSummary(userId) {
    const account = await getAccountByUser(userId);
    return account ? loadState(account) : null;
  },
};
