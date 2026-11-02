export type BillingPlanKey = "pro" | "enterprise";

export const BILLING_PLAN_DISPLAY: Record<BillingPlanKey, {
  label: string;
  unitAmount: number;
  currency: "USD";
  interval: "month";
  description: string;
}> = {
  pro: {
    label: "Pro",
    unitAmount: 1900,
    currency: "USD",
    interval: "month",
    description: "Apex Agent Pro subscription",
  },
  enterprise: {
    label: "Enterprise",
    unitAmount: 9900,
    currency: "USD",
    interval: "month",
    description: "Apex Agent Enterprise subscription",
  },
};
