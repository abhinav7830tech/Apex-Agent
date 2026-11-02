import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { getBillingConfiguration } from "./config";
import { createStripeGateway } from "./stripe-gateway";

const configuration = getBillingConfiguration({
  NODE_ENV: "production",
  STRIPE_SECRET_KEY: "sk_mock_only",
  STRIPE_WEBHOOK_SECRET: "whsec_mock_only",
  STRIPE_PRO_PRICE_ID: "price_pro_configured",
  STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise_configured",
  NEXT_PUBLIC_APP_URL: "https://apex.example.com",
  BILLING_USAGE_ACTIVATION_AT: "2026-11-15T00:00:00.000Z",
  STRIPE_TRIAL_PAYMENT_METHOD_COLLECTION: "if_required",
  STRIPE_TRIAL_MISSING_PAYMENT_METHOD_BEHAVIOR: "pause",
});

describe("Stripe SDK adapter with injected mock client", () => {
  it("sends only the configured Stripe Price ID, account metadata, canonical redirects, and the configured trial policy", async () => {
    let createParams: Stripe.Checkout.SessionCreateParams | undefined;
    let requestOptions: Stripe.RequestOptions | undefined;
    const mockClient = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
            createParams = params;
            requestOptions = options;
            return {
              id: "cs-mock",
              url: "https://checkout.stripe.com/c/pay/cs-mock",
              status: "open",
              expires_at: 1_800_000_000,
              customer: "cus-mock",
              subscription: null,
              metadata: { billingAccountId: "account-mock" },
            } as unknown as Stripe.Checkout.Session;
          },
        },
      },
    } as unknown as Stripe;
    const gateway = createStripeGateway(configuration, mockClient);
    const result = await gateway.createCheckoutSession({
      customerId: "cus-mock",
      accountId: "account-mock",
      userId: "user-mock",
      planKey: "pro",
      priceId: configuration.plans.pro.stripePriceId,
      successUrl: "https://apex.example.com/upgrade?checkout=complete",
      cancelUrl: "https://apex.example.com/upgrade?checkout=cancelled",
      trialDays: 14,
      paymentMethodCollection: "if_required",
      missingPaymentMethodBehavior: "pause",
      idempotencyKey: "checkout-mock-idem",
    });

    assert.equal(result.id, "cs-mock");
    assert.equal(createParams?.line_items?.[0]?.price, "price_pro_configured");
    assert.equal("price_data" in (createParams?.line_items?.[0] ?? {}), false);
    assert.equal(createParams?.payment_method_collection, "if_required");
    assert.equal(createParams?.subscription_data?.trial_period_days, 14);
    assert.equal(createParams?.subscription_data?.metadata?.billingAccountId, "account-mock");
    assert.equal(createParams?.metadata?.billingAccountId, "account-mock");
    assert.equal(createParams?.success_url, "https://apex.example.com/upgrade?checkout=complete");
    assert.equal(requestOptions?.idempotencyKey, "checkout-mock-idem");
  });
});
