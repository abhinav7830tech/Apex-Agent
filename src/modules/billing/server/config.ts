import { parseProductionOrigin } from "@/lib/application-origin";
import { BILLING_PLAN_DISPLAY, type BillingPlanKey } from "../plans";

export type TrialPaymentCollection = "always" | "if_required";
export type MissingPaymentMethodBehavior = "cancel" | "pause" | "create_invoice";

export type BillingPlan = {
  key: BillingPlanKey;
  label: string;
  unitAmount: number;
  currency: "usd";
  interval: "month";
  stripePriceId: string;
  description: string;
};

export type BillingEnvironment = Record<string, string | undefined>;

export class BillingConfigurationError extends Error {
  readonly code = "BILLING_CONFIGURATION_MISSING";

  constructor() {
    super("Billing is not configured. Contact the administrator.");
    this.name = "BillingConfigurationError";
  }
}

export class BillingRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "BillingRequestError";
  }
}

export const assertBillingEnabled = (configuration: Pick<BillingConfiguration, "billingEnabled">) => {
  if (!configuration.billingEnabled) {
    throw new BillingRequestError("BILLING_DISABLED", "Billing changes are temporarily unavailable.", 503);
  }
};

const required = (env: BillingEnvironment, key: string): string => {
  const value = env[key]?.trim();
  if (!value) throw new BillingConfigurationError();
  return value;
};

const productionOrigin = (env: BillingEnvironment): string => {
  if (env.NODE_ENV === "production") {
    const origin = parseProductionOrigin(env.NEXT_PUBLIC_APP_URL);
    if (!origin) throw new BillingConfigurationError();
    return origin;
  }

  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) throw new BillingConfigurationError();
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash
    ) throw new Error("invalid origin");
    return url.origin;
  } catch {
    throw new BillingConfigurationError();
  }
};

const parseTrialPaymentCollection = (value: string): TrialPaymentCollection => {
  if (value === "always" || value === "if_required") return value;
  throw new BillingConfigurationError();
};

const parseMissingPaymentMethodBehavior = (value: string): MissingPaymentMethodBehavior => {
  if (value === "cancel" || value === "pause" || value === "create_invoice") return value;
  throw new BillingConfigurationError();
};

export type BillingConfiguration = {
  billingEnabled: boolean;
  quotaEnforcementEnabled: boolean;
  secretKey: string;
  webhookSecret: string;
  appOrigin: string;
  usageActivationAt: Date;
  trialPaymentCollection: TrialPaymentCollection;
  missingPaymentMethodBehavior: MissingPaymentMethodBehavior;
  plans: Record<BillingPlanKey, BillingPlan>;
};

export type BillingWebhookConfiguration = Pick<BillingConfiguration, "secretKey" | "webhookSecret" | "plans">;

export const getBillingWebhookConfiguration = (
  env: BillingEnvironment = process.env,
): BillingWebhookConfiguration => {
  const proPriceId = required(env, "STRIPE_PRO_PRICE_ID");
  const enterprisePriceId = required(env, "STRIPE_ENTERPRISE_PRICE_ID");
  if (proPriceId === enterprisePriceId) throw new BillingConfigurationError();
  return {
    secretKey: required(env, "STRIPE_SECRET_KEY"),
    webhookSecret: required(env, "STRIPE_WEBHOOK_SECRET"),
    plans: {
      pro: { key: "pro", ...BILLING_PLAN_DISPLAY.pro, currency: "usd", stripePriceId: proPriceId },
      enterprise: { key: "enterprise", ...BILLING_PLAN_DISPLAY.enterprise, currency: "usd", stripePriceId: enterprisePriceId },
    },
  };
};

export const getBillingConfiguration = (
  env: BillingEnvironment = process.env,
): BillingConfiguration => {
  const activationValue = required(env, "BILLING_USAGE_ACTIVATION_AT");
  if (!/Z$/i.test(activationValue)) throw new BillingConfigurationError();
  const usageActivationAt = new Date(activationValue);
  if (!Number.isFinite(usageActivationAt.getTime())) throw new BillingConfigurationError();

  const webhook = getBillingWebhookConfiguration(env);

  return {
    // Opt-in only. Existing subscription records and webhook reconciliation remain available.
    billingEnabled: env.BILLING_ENABLED === "true",
    // Deliberately independent and disabled unless explicitly enabled in a later phase.
    quotaEnforcementEnabled: env.BILLING_QUOTA_ENFORCEMENT_ENABLED === "true",
    secretKey: webhook.secretKey,
    webhookSecret: webhook.webhookSecret,
    appOrigin: productionOrigin(env),
    usageActivationAt,
    trialPaymentCollection: parseTrialPaymentCollection(
      required(env, "STRIPE_TRIAL_PAYMENT_METHOD_COLLECTION"),
    ),
    missingPaymentMethodBehavior: parseMissingPaymentMethodBehavior(
      required(env, "STRIPE_TRIAL_MISSING_PAYMENT_METHOD_BEHAVIOR"),
    ),
    plans: webhook.plans,
  };
};

export const parsePlanKey = (value: unknown): BillingPlanKey => {
  if (value === "pro" || value === "enterprise") return value;
  throw new BillingRequestError("INVALID_PLAN", "Choose a valid billing plan.");
};

export const getPlanByPriceId = (
  plans: BillingConfiguration["plans"],
  priceId: string,
): BillingPlan | null =>
  Object.values(plans).find((plan) => plan.stripePriceId === priceId) ?? null;

export const buildBillingRedirects = (appOrigin: string) => ({
  successUrl: `${appOrigin}/upgrade?checkout=complete`,
  cancelUrl: `${appOrigin}/upgrade?checkout=cancelled`,
  portalReturnUrl: `${appOrigin}/upgrade`,
});
