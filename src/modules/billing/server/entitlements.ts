import type { BillingPlanKey } from "../plans";

export type SubscriptionSnapshot = {
  stripeSubscriptionId: string;
  planKey: BillingPlanKey;
  status: string;
  isCurrent: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanKey: BillingPlanKey | null;
};

export type EntitlementInput = {
  accountExists: boolean;
  grandfatheringState: string | null;
  grandfatheringBatchStatus: string | null;
  subscription: SubscriptionSnapshot | null;
  now?: Date;
};

export type Entitlement = {
  plan: "starter" | BillingPlanKey | "legacy" | "unresolved";
  status: "starter" | "grandfathered" | "active" | "trialing" | "grace" | "canceling" | "expired" | "unresolved";
  source: "starter" | "grandfathering" | "subscription" | "unknown";
  periodStart: Date | null;
  periodEnd: Date | null;
  trialEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: BillingPlanKey | null;
};

const starter = (status: "starter" | "expired" = "starter"): Entitlement => ({
  plan: "starter",
  status,
  source: "starter",
  periodStart: null,
  periodEnd: null,
  trialEnd: null,
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlan: null,
});

export const resolveEntitlement = (input: EntitlementInput): Entitlement => {
  const now = input.now ?? new Date();
  if (!input.accountExists) {
    return {
      ...starter(),
      plan: "unresolved",
      status: "unresolved",
      source: "unknown",
    };
  }

  if (
    input.grandfatheringState === "grandfathered" &&
    ["applied", "verified"].includes(input.grandfatheringBatchStatus ?? "")
  ) {
    return {
      ...starter(),
      plan: "legacy",
      status: "grandfathered",
      source: "grandfathering",
    };
  }

  const subscription = input.subscription;
  if (!subscription?.isCurrent) return starter(subscription ? "expired" : "starter");

  const common = {
    source: "subscription" as const,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    trialEnd: subscription.trialEnd,
    graceUntil: subscription.graceUntil,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    pendingPlan: subscription.pendingPlanKey,
  };

  if (
    subscription.status === "trialing" &&
    subscription.trialEnd && subscription.trialEnd > now
  ) {
    return { ...common, plan: subscription.planKey, status: "trialing" };
  }

  if (
    subscription.status === "active" &&
    subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
  ) {
    return { ...common, plan: subscription.planKey, status: "active" };
  }

  if (
    subscription.graceUntil && subscription.graceUntil > now &&
    ["past_due", "unpaid"].includes(subscription.status)
  ) {
    return { ...common, plan: subscription.planKey, status: "grace" };
  }

  if (
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd && subscription.currentPeriodEnd > now &&
    ["active", "canceled"].includes(subscription.status)
  ) {
    return { ...common, plan: subscription.planKey, status: "canceling" };
  }

  return starter("expired");
};
