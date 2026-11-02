import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BillingConfigurationError,
  BillingRequestError,
  getBillingConfiguration,
  getBillingWebhookConfiguration,
  getPlanByPriceId,
  parsePlanKey,
} from "./config";
import { resolveEntitlement, type SubscriptionSnapshot } from "./entitlements";
import {
  createCheckoutOperation,
  createPortalOperation,
  processBillingWebhook,
  switchPlanOperation,
  type BillingAccountRecord,
  type BillingState,
  type BillingStore,
  type BillingStripeGateway,
  type CanonicalSubscription,
  type CheckoutSession,
  type SupportedBillingEvent,
} from "./operations";

const NOW = new Date("2026-11-01T00:00:00.000Z");
const environment = {
  NODE_ENV: "production",
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_mock_only",
  STRIPE_WEBHOOK_SECRET: "whsec_mock_only",
  STRIPE_PRO_PRICE_ID: "price_pro_configured",
  STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise_configured",
  NEXT_PUBLIC_APP_URL: "https://apex.example.com",
  BILLING_USAGE_ACTIVATION_AT: "2026-11-15T00:00:00.000Z",
  STRIPE_TRIAL_PAYMENT_METHOD_COLLECTION: "always",
  STRIPE_TRIAL_MISSING_PAYMENT_METHOD_BEHAVIOR: "cancel",
} satisfies Record<string, string>;
const config = () => getBillingConfiguration(environment);
const user = { id: "user-1", email: "user@example.com", name: "Apex User" };

const makeAccount = (overrides: Partial<BillingAccountRecord> = {}): BillingAccountRecord => ({
  id: "account-1",
  userId: "user-1",
  stripeCustomerId: "cus-1",
  pendingCheckoutSessionId: null,
  pendingCheckoutPlanKey: null,
  pendingCheckoutExpiresAt: null,
  pendingCheckoutIdempotencyKey: null,
  ...overrides,
});

const makeSnapshot = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  stripeSubscriptionId: "sub-1",
  planKey: "pro",
  status: "active",
  isCurrent: true,
  currentPeriodStart: new Date("2026-10-15T00:00:00Z"),
  currentPeriodEnd: new Date("2026-11-15T00:00:00Z"),
  trialEnd: null,
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlanKey: null,
  ...overrides,
});

const makeState = (overrides: Partial<BillingState> = {}): BillingState => ({
  account: makeAccount(),
  subscription: null,
  entitlement: resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: null, now: NOW }),
  hasPriorTrial: false,
  ...overrides,
});

const makeSession = (overrides: Partial<CheckoutSession> = {}): CheckoutSession => ({
  id: "cs-1",
  url: "https://checkout.stripe.com/c/pay/cs-1",
  status: "open",
  expiresAt: new Date("2026-11-02T00:00:00Z"),
  customerId: "cus-1",
  subscriptionId: null,
  metadata: { billingAccountId: "account-1", apexUserId: "user-1" },
  ...overrides,
});

const makeCanonical = (overrides: Partial<CanonicalSubscription> = {}): CanonicalSubscription => ({
  id: "sub-1",
  customerId: "cus-1",
  metadata: { billingAccountId: "account-1", apexUserId: "user-1" },
  status: "active",
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  currentPeriodStart: new Date("2026-10-15T00:00:00Z"),
  currentPeriodEnd: new Date("2026-11-15T00:00:00Z"),
  trialStart: null,
  trialEnd: null,
  pendingUpdate: false,
  items: [{ id: "si-1", priceId: "price_pro_configured" }],
  ...overrides,
});

const makeStore = (overrides: Partial<BillingStore> = {}) => {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const account = makeAccount();
  let state = makeState({ account });
  const store: BillingStore = {
    commitMeetingStart: async () => "duplicate",
    getOrCreateAccount: async () => account,
    getState: async () => state,
    getAccountByCustomer: async () => account,
    setCustomerIfEmpty: async (_accountId, customerId) => customerId,
    claimCheckout: async (input) => { calls.push({ name: "claimCheckout", input }); return true; },
    saveCheckoutSession: async (_accountId, _claimId, session) => { calls.push({ name: "saveCheckoutSession", input: session }); },
    clearCheckoutClaim: async (_accountId, claimId) => { calls.push({ name: "clearCheckoutClaim", input: claimId }); },
    clearExpiredCheckout: async () => true,
    clearResolvedCheckout: async () => true,
    ingestWebhook: async (event) => { calls.push({ name: "ingestWebhook", input: event }); },
    requeueWebhookReconciliation: async (eventId) => { calls.push({ name: "requeueWebhookReconciliation", input: eventId }); },
    claimWebhook: async () => true,
    applyCanonicalSubscription: async (input) => { calls.push({ name: "applyCanonicalSubscription", input }); return "applied"; },
    recordWebhookRetry: async (_eventId, _lease, code) => { calls.push({ name: "recordWebhookRetry", input: code }); },
    beginPlanSwitch: async (input) => { calls.push({ name: "beginPlanSwitch", input }); return "switch_recorded"; },
    clearPlanSwitch: async (_subscriptionId, key) => { calls.push({ name: "clearPlanSwitch", input: key }); },
    getVerifiedSummary: async () => state,
    ...overrides,
  };
  return { store, calls, account, setState: (next: BillingState) => { state = next; } };
};

const makeStripe = (overrides: Partial<BillingStripeGateway> = {}) => {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const stripe: BillingStripeGateway = {
    createCustomer: async () => { calls.push({ name: "createCustomer" }); return { id: "cus-created" }; },
    createCheckoutSession: async (input) => { calls.push({ name: "createCheckoutSession", input }); return makeSession(); },
    retrieveCheckoutSession: async (id) => { calls.push({ name: "retrieveCheckoutSession", input: id }); return makeSession({ id }); },
    retrievePrice: async (id) => { calls.push({ name: "retrievePrice", input: id }); return { id, unitAmount: id === "price_enterprise_configured" ? 9900 : 1900, currency: "usd", interval: "month", active: true }; },
    retrieveSubscription: async (id) => { calls.push({ name: "retrieveSubscription", input: id }); return makeCanonical({ id }); },
    createPortalSession: async (customerId, returnUrl) => { calls.push({ name: "createPortalSession", input: { customerId, returnUrl } }); return { url: "https://billing.stripe.com/p/session" }; },
    updateSubscription: async (input) => { calls.push({ name: "updateSubscription", input }); return input.subscription; },
    constructWebhookEvent: async () => null,
    ...overrides,
  };
  return { stripe, calls };
};

describe("billing plan and configuration policy", () => {
  it("allows only stable plan keys and maps configured Stripe prices", () => {
    const cfg = config();
    assert.equal(parsePlanKey("pro"), "pro");
    assert.equal(parsePlanKey("enterprise"), "enterprise");
    assert.equal(getPlanByPriceId(cfg.plans, "price_pro_configured")?.key, "pro");
    assert.equal(getPlanByPriceId(cfg.plans, "price_enterprise_configured")?.unitAmount, 9900);
    assert.throws(() => parsePlanKey("price_pro_configured"), BillingRequestError);
    assert.throws(() => parsePlanKey(1900), BillingRequestError);
  });

  it("fails safely when required configuration or canonical HTTPS origin is missing or invalid", () => {
    const cfg = { ...environment };
    delete (cfg as Partial<typeof environment>).STRIPE_SECRET_KEY;
    assert.throws(() => getBillingConfiguration(cfg), (error: unknown) => {
      assert.ok(error instanceof BillingConfigurationError);
      assert.equal(error.message.includes("sk_test_mock_only"), false);
      return true;
    });
    assert.throws(() => getBillingConfiguration({ ...environment, NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), BillingConfigurationError);
    assert.throws(() => getBillingConfiguration({ ...environment, BILLING_USAGE_ACTIVATION_AT: "2026-11-15T00:00:00" }), BillingConfigurationError);
  });

  it("keeps signed webhook reconciliation configured without purchase-only settings", () => {
    const webhookConfig = getBillingWebhookConfiguration({
      STRIPE_SECRET_KEY: "sk_mock",
      STRIPE_WEBHOOK_SECRET: "whsec_mock",
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise",
    });
    assert.equal(webhookConfig.plans.pro.stripePriceId, "price_pro");
    assert.throws(() => getBillingConfiguration({
      STRIPE_SECRET_KEY: "sk_mock",
      STRIPE_WEBHOOK_SECRET: "whsec_mock",
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise",
    }), BillingConfigurationError);
  });
});

describe("server-side subscription entitlements", () => {
  it("resolves Starter, Pro, Enterprise and trial entitlements from verified rows", () => {
    const starter = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: null, now: NOW });
    assert.equal(starter.plan, "starter");
    const pro = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot(), now: NOW });
    assert.equal(pro.plan, "pro");
    const enterprise = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ planKey: "enterprise" }), now: NOW });
    assert.equal(enterprise.plan, "enterprise");
    const trial = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ status: "trialing", trialEnd: new Date("2026-11-10T00:00:00Z") }), now: NOW });
    assert.equal(trial.status, "trialing");
  });

  it("grants grace and period-end cancellation only through their verified deadline", () => {
    const grace = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ status: "past_due", graceUntil: new Date("2026-11-05T00:00:00Z") }), now: NOW });
    assert.equal(grace.status, "grace");
    const noGrace = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ status: "unpaid", graceUntil: new Date("2026-10-31T00:00:00Z") }), now: NOW });
    assert.equal(noGrace.plan, "starter");
    const canceling = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ status: "canceled", cancelAtPeriodEnd: true }), now: NOW });
    assert.equal(canceling.status, "canceling");
    const canceled = resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot({ status: "canceled", cancelAtPeriodEnd: false }), now: NOW });
    assert.equal(canceled.plan, "starter");
  });

  it("keeps grandfathered legacy access until verified conversion and never restores it after cancellation", () => {
    const grandfathered = resolveEntitlement({ accountExists: true, grandfatheringState: "grandfathered", grandfatheringBatchStatus: "applied", subscription: null, now: NOW });
    assert.equal(grandfathered.plan, "legacy");
    const converted = resolveEntitlement({ accountExists: true, grandfatheringState: "converted", grandfatheringBatchStatus: "verified", subscription: makeSnapshot({ status: "canceled", isCurrent: false }), now: NOW });
    assert.equal(converted.plan, "starter");
    const absentAccount = resolveEntitlement({ accountExists: false, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: null, now: NOW });
    assert.equal(absentAccount.status, "unresolved");
  });
});

describe("authenticated checkout and portal operations with Stripe mocks", () => {
  it("keeps quota enforcement disabled by default and blocks new billing when the kill switch is off", async () => {
    const disabled = getBillingConfiguration({ ...environment, BILLING_ENABLED: "false" });
    assert.equal(disabled.billingEnabled, false);
    assert.equal(disabled.quotaEnforcementEnabled, false);
    const store = makeStore();
    const stripe = makeStripe();
    await assert.rejects(createCheckoutOperation({ user, plan: "pro", config: disabled, store: store.store, stripe: stripe.stripe }), (error: unknown) => error instanceof BillingRequestError && error.code === "BILLING_DISABLED");
    await assert.rejects(switchPlanOperation({ user, plan: "enterprise", config: disabled, store: store.store, stripe: stripe.stripe }), (error: unknown) => error instanceof BillingRequestError && error.code === "BILLING_DISABLED");
    assert.equal(stripe.calls.length, 0);
  });

  it("creates Checkout from the allow-listed Price ID and configured trial policy", async () => {
    const { store, calls: storeCalls } = makeStore();
    const { stripe, calls } = makeStripe();
    const result = await createCheckoutOperation({ user, plan: "pro", config: config(), store, stripe, now: NOW });
    assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs-1");
    const request = calls.find((call) => call.name === "createCheckoutSession")?.input as Record<string, unknown>;
    assert.equal(request.priceId, "price_pro_configured");
    assert.equal("amount" in request, false);
    assert.equal(request.trialDays, 14);
    assert.equal(request.successUrl, "https://apex.example.com/upgrade?checkout=complete");
    assert.equal((storeCalls.find((call) => call.name === "saveCheckoutSession")?.input as CheckoutSession).id, "cs-1");
  });

  it("blocks an existing subscription and an unresolved different-plan checkout", async () => {
    const active = makeState({ subscription: makeSnapshot() });
    const activeStore = makeStore({ getState: async () => active });
    const activeStripe = makeStripe();
    await assert.rejects(createCheckoutOperation({ user, plan: "enterprise", config: config(), store: activeStore.store, stripe: activeStripe.stripe, now: NOW }), /already has a subscription/);
    assert.equal(activeStripe.calls.some((call) => call.name === "createCheckoutSession"), false);

    const pending = makeState({ account: makeAccount({ pendingCheckoutSessionId: "cs-pending", pendingCheckoutPlanKey: "pro" }) });
    const pendingStore = makeStore({ getState: async () => pending });
    const pendingStripe = makeStripe();
    await assert.rejects(createCheckoutOperation({ user, plan: "enterprise", config: config(), store: pendingStore.store, stripe: pendingStripe.stripe, now: NOW }), /checkout is already pending/);
    assert.equal(pendingStripe.calls.some((call) => call.name === "createCheckoutSession"), false);
  });

  it("reuses a still-open session only after retrieving its provider state", async () => {
    const pending = makeState({ account: makeAccount({ pendingCheckoutSessionId: "cs-open", pendingCheckoutPlanKey: "pro" }) });
    const store = makeStore({ getState: async () => pending });
    const retrieveCalls: string[] = [];
    const stripe = makeStripe({ retrieveCheckoutSession: async (id) => { retrieveCalls.push(id); return makeSession({ id }); } });
    const result = await createCheckoutOperation({ user, plan: "pro", config: config(), store: store.store, stripe: stripe.stripe, now: NOW });
    assert.deepEqual(result, { url: "https://checkout.stripe.com/c/pay/cs-1", reused: true });
    assert.deepEqual(retrieveCalls, ["cs-open"]);
  });

  it("reconciles an expired checkout with Stripe before claiming a replacement", async () => {
    let state = makeState({ account: makeAccount({ pendingCheckoutSessionId: "cs-expired", pendingCheckoutPlanKey: "pro" }) });
    const store = makeStore({
      getState: async () => state,
      clearExpiredCheckout: async () => { state = makeState(); return true; },
    });
    const calls: string[] = [];
    const stripe = makeStripe({
      retrieveCheckoutSession: async (id) => { calls.push(`retrieve:${id}`); return makeSession({ id, status: "expired", url: null, expiresAt: new Date("2026-10-31T23:00:00Z") }); },
    });
    const result = await createCheckoutOperation({ user, plan: "pro", config: config(), store: store.store, stripe: stripe.stripe, now: NOW });
    assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs-1");
    assert.deepEqual(calls, ["retrieve:cs-expired"]);
    assert.equal(store.calls.some((call) => call.name === "claimCheckout"), true);
  });

  it("does not offer another trial after a trial was already recorded", async () => {
    const state = makeState({ hasPriorTrial: true });
    const store = makeStore({ getState: async () => state });
    const stripe = makeStripe();
    await createCheckoutOperation({ user, plan: "enterprise", config: config(), store: store.store, stripe: stripe.stripe, now: NOW });
    const checkoutInput = stripe.calls.find((call) => call.name === "createCheckoutSession")?.input as { trialDays: number | null };
    assert.equal(checkoutInput.trialDays, null);
  });

  it("uses the user-mapped Stripe customer for the portal and never accepts a customer argument", async () => {
    const store = makeStore();
    const stripe = makeStripe();
    const result = await createPortalOperation({ userId: user.id, appOrigin: "https://apex.example.com", store: store.store, stripe: stripe.stripe });
    assert.equal(result.url, "https://billing.stripe.com/p/session");
    assert.deepEqual(stripe.calls[0]?.input, { customerId: "cus-1", returnUrl: "https://apex.example.com/upgrade" });
  });
});

describe("Stripe webhook processing with controlled provider/store mocks", () => {
  const event: SupportedBillingEvent = {
    id: "evt-1",
    type: "customer.subscription.updated",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    objectId: "sub-1",
    customerId: "cus-1",
    subscriptionId: "sub-1",
    billingAccountId: "account-1",
  apexUserId: "user-1",
    invoiceId: null,
  };

  it("rejects invalid signatures before recording or claiming an event", async () => {
    const store = makeStore();
    const stripe = makeStripe({ constructWebhookEvent: async () => { throw new Error("mock signature failure"); } });
    await assert.rejects(processBillingWebhook({ rawBody: "raw", signature: "bad", config: config(), store: store.store, stripe: stripe.stripe, now: NOW }), (error: unknown) => error instanceof BillingRequestError && error.code === "INVALID_SIGNATURE");
    assert.equal(store.calls.length, 0);
  });

  it("deduplicates delivery and retrieves canonical subscription before applying state", async () => {
    const store = makeStore();
    const stripe = makeStripe({ constructWebhookEvent: async () => event });
    const duplicateStore = makeStore({ claimWebhook: async () => false });
    const duplicateStripe = makeStripe({ constructWebhookEvent: async () => event });
    assert.deepEqual(await processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: duplicateStore.store, stripe: duplicateStripe.stripe, now: NOW }), { status: "duplicate" });
    assert.equal(duplicateStripe.calls.some((call) => call.name === "retrieveSubscription"), false);

    assert.deepEqual(await processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store.store, stripe: stripe.stripe, now: NOW }), { status: "applied" });
    assert.equal(stripe.calls.find((call) => call.name === "retrieveSubscription")?.input, "sub-1");
    assert.equal(store.calls.some((call) => call.name === "applyCanonicalSubscription"), true);
  });

  it("rejects cross-account, metadata, and unconfigured-price associations", async () => {
    const wrongCustomer = makeCanonical({ customerId: "cus-other" });
    const store = makeStore();
    const stripe = makeStripe({ constructWebhookEvent: async () => event, retrieveSubscription: async () => wrongCustomer });
    await assert.rejects(processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store.store, stripe: stripe.stripe, now: NOW }), /could not be verified/);
    assert.equal(store.calls.some((call) => call.name === "recordWebhookRetry"), true);

    const wrongMetadata = makeCanonical({ metadata: { billingAccountId: "account-other" } });
    const store2 = makeStore();
    const stripe2 = makeStripe({ constructWebhookEvent: async () => event, retrieveSubscription: async () => wrongMetadata });
    await assert.rejects(processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store2.store, stripe: stripe2.stripe, now: NOW }), /could not be verified/);

    // Legacy Checkout redirects/client metadata do not establish ownership or entitlement.
    const legacyNoMetadata = makeCanonical({ metadata: {} });
    const legacyStore = makeStore();
    const legacyStripe = makeStripe({ constructWebhookEvent: async () => event, retrieveSubscription: async () => legacyNoMetadata });
    await assert.rejects(processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: legacyStore.store, stripe: legacyStripe.stripe, now: NOW }), /could not be verified/);
    assert.equal(legacyStore.calls.some((call) => call.name === "applyCanonicalSubscription"), false);

    const wrongPrice = makeCanonical({ items: [{ id: "si-1", priceId: "price-not-configured" }] });
    const store3 = makeStore();
    const stripe3 = makeStripe({ constructWebhookEvent: async () => event, retrieveSubscription: async () => wrongPrice });
    await assert.rejects(processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store3.store, stripe: stripe3.stripe, now: NOW }), /not configured/);
  });

  it("passes provider event identity through to stale-event protection", async () => {
    const store = makeStore({ applyCanonicalSubscription: async () => "stale_event" });
    const stripe = makeStripe({ constructWebhookEvent: async () => event });
    assert.deepEqual(await processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store.store, stripe: stripe.stripe, now: NOW }), { status: "stale_event" });
  });

  it("returns a retryable failure for a canonical reconciliation race", async () => {
    const store = makeStore({ applyCanonicalSubscription: async () => "reconciliation_required" });
    const stripe = makeStripe({ constructWebhookEvent: async () => event });
    await assert.rejects(
      processBillingWebhook({ rawBody: "raw", signature: "sig", config: config(), store: store.store, stripe: stripe.stripe, now: NOW }),
      (error: unknown) => error instanceof BillingRequestError && error.code === "WEBHOOK_RECONCILIATION_REQUIRED" && error.status === 503,
    );
    assert.equal(store.calls.some((call) => call.name === "requeueWebhookReconciliation" && call.input === event.id), true);
  });
});

describe("plan switch protection", () => {
  it("requires the account's canonical current subscription and records the switch before Stripe update", async () => {
    const state = makeState({
      subscription: makeSnapshot(),
      entitlement: resolveEntitlement({ accountExists: true, grandfatheringState: null, grandfatheringBatchStatus: null, subscription: makeSnapshot(), now: NOW }),
    });
    const store = makeStore({ getVerifiedSummary: async () => state });
    const stripe = makeStripe();
    const result = await switchPlanOperation({ user, plan: "enterprise", config: config(), store: store.store, stripe: stripe.stripe });
    assert.deepEqual(result, { status: "pending_verification" });
    const switchRequest = store.calls.find((call) => call.name === "beginPlanSwitch")?.input as { subscriptionId: string; priceId: string };
    assert.equal(switchRequest.subscriptionId, "sub-1");
    assert.equal(switchRequest.priceId, "price_enterprise_configured");
  });
});
