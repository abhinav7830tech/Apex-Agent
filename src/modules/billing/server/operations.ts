import { randomUUID } from "node:crypto";
import {
  buildBillingRedirects,
  assertBillingEnabled,
  getPlanByPriceId,
  parsePlanKey,
  type BillingConfiguration,
  type BillingWebhookConfiguration,
} from "./config";
import type { BillingPlanKey } from "../plans";
import type { Entitlement, SubscriptionSnapshot } from "./entitlements";
import { BillingRequestError } from "./config";

export type BillingUser = { id: string; email: string; name: string };

export type BillingAccountRecord = {
  id: string;
  userId: string | null;
  stripeCustomerId: string | null;
  pendingCheckoutSessionId: string | null;
  pendingCheckoutPlanKey: BillingPlanKey | null;
  pendingCheckoutExpiresAt: Date | null;
  pendingCheckoutIdempotencyKey: string | null;
};

export type BillingState = {
  account: BillingAccountRecord;
  subscription: SubscriptionSnapshot | null;
  entitlement: Entitlement;
  hasPriorTrial: boolean;
};

export type CheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  expiresAt: Date;
  customerId: string | null;
  subscriptionId: string | null;
  metadata: Record<string, string | undefined> | null;
};

export type CanonicalSubscription = {
  id: string;
  customerId: string;
  metadata: Record<string, string | undefined>;
  status: "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  pendingUpdate: boolean;
  items: Array<{ id: string; priceId: string }>;
};

export type StripePriceSnapshot = {
  id: string;
  unitAmount: number | null;
  currency: string;
  interval: string | null;
  active: boolean;
};

export type SupportedBillingEvent = {
  id: string;
  type: "checkout.session.completed" | "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted" | "invoice.paid" | "invoice.payment_failed";
  createdAt: Date;
  objectId: string;
  customerId: string | null;
  subscriptionId: string | null;
  billingAccountId: string | null;
  apexUserId: string | null;
  invoiceId: string | null;
};

export interface BillingStore {
  commitMeetingStart(meetingId: string, streamEventId: string, actualStartedAt: Date): Promise<string>;
  getOrCreateAccount(user: BillingUser, activationAt: Date): Promise<BillingAccountRecord>;
  getState(accountId: string): Promise<BillingState>;
  getAccountByCustomer(customerId: string): Promise<BillingAccountRecord | null>;
  setCustomerIfEmpty(accountId: string, customerId: string): Promise<string>;
  claimCheckout(input: { accountId: string; planKey: BillingPlanKey; claimId: string; idempotencyKey: string; expiresAt: Date }): Promise<boolean>;
  saveCheckoutSession(accountId: string, claimId: string, session: CheckoutSession): Promise<void>;
  clearCheckoutClaim(accountId: string, claimId: string): Promise<void>;
  clearExpiredCheckout(accountId: string, sessionId: string): Promise<boolean>;
  clearResolvedCheckout(accountId: string, sessionId: string): Promise<boolean>;
  ingestWebhook(event: SupportedBillingEvent): Promise<void>;
  requeueWebhookReconciliation(eventId: string): Promise<void>;
  claimWebhook(eventId: string, leaseToken: string, expiresAt: Date): Promise<boolean>;
  applyCanonicalSubscription(input: {
    event: SupportedBillingEvent;
    leaseToken: string;
    account: BillingAccountRecord;
    subscription: CanonicalSubscription;
    planKey: BillingPlanKey;
    priceId: string;
    observedAt: Date;
  }): Promise<string>;
  recordWebhookRetry(eventId: string, leaseToken: string, code: string, nextAttemptAt: Date): Promise<void>;
  beginPlanSwitch(input: { accountId: string; subscriptionId: string; planKey: BillingPlanKey; priceId: string; idempotencyKey: string }): Promise<string>;
  clearPlanSwitch(subscriptionId: string, idempotencyKey: string): Promise<void>;
  getVerifiedSummary(userId: string): Promise<BillingState | null>;
}

export interface BillingStripeGateway {
  createCustomer(input: { email: string; name: string; billingAccountId: string; userId: string }, idempotencyKey: string): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customerId: string;
    accountId: string;
    userId: string;
    planKey: BillingPlanKey;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    trialDays: number | null;
    paymentMethodCollection: BillingConfiguration["trialPaymentCollection"];
    missingPaymentMethodBehavior: BillingConfiguration["missingPaymentMethodBehavior"];
    idempotencyKey: string;
  }): Promise<CheckoutSession>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  retrievePrice(priceId: string): Promise<StripePriceSnapshot>;
  retrieveSubscription(subscriptionId: string): Promise<CanonicalSubscription>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  updateSubscription(input: { subscription: CanonicalSubscription; priceId: string; accountId: string; idempotencyKey: string }): Promise<CanonicalSubscription>;
  constructWebhookEvent(rawBody: string, signature: string, secret: string): Promise<SupportedBillingEvent | null>;
}

const safe = (code: string, message: string, status = 409) =>
  new BillingRequestError(code, message, status);

const isClaimId = (id: string | null) => id?.startsWith("pending:") ?? false;

const getCustomerId = async (
  user: BillingUser,
  account: BillingAccountRecord,
  store: BillingStore,
  stripe: BillingStripeGateway,
) => {
  if (account.stripeCustomerId) return account.stripeCustomerId;
  const customer = await stripe.createCustomer(
    { email: user.email, name: user.name, billingAccountId: account.id, userId: user.id },
    `apex-customer-${account.id}`,
  );
  return store.setCustomerIfEmpty(account.id, customer.id);
};

const clearVerifiedExpiredSession = async (
  accountId: string,
  sessionId: string,
  store: BillingStore,
  stripe: BillingStripeGateway,
  now: Date,
  verifiedSession?: CheckoutSession,
) => {
  const providerSession = verifiedSession ?? await stripe.retrieveCheckoutSession(sessionId);
  if (providerSession.id !== sessionId || providerSession.status !== "expired" || providerSession.subscriptionId) {
    throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Billing is still being verified. Try again shortly.");
  }
  if (providerSession.expiresAt > now) {
    throw safe("CHECKOUT_STILL_OPEN", "A checkout session is already open for this account.");
  }
  const cleared = await store.clearExpiredCheckout(accountId, sessionId);
  if (!cleared) throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Billing is still being verified. Try again shortly.");
};

const reconcileCompletedSession = async (
  account: BillingAccountRecord,
  session: CheckoutSession,
  config: BillingConfiguration,
  store: BillingStore,
  stripe: BillingStripeGateway,
  now: Date,
) => {
  if (!session.subscriptionId) return false;
  const subscription = await stripe.retrieveSubscription(session.subscriptionId);
  const plan = await validateSubscription(account, subscription, config, stripe);
  void plan;
  const isTerminal = subscription.status === "incomplete_expired" ||
    (subscription.status === "canceled" && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd <= now));
  if (!isTerminal) return false;
  return store.clearResolvedCheckout(account.id, session.id);
};

export const createCheckoutOperation = async (input: {
  user: BillingUser;
  plan: unknown;
  config: BillingConfiguration;
  store: BillingStore;
  stripe: BillingStripeGateway;
  now?: Date;
}) => {
  assertBillingEnabled(input.config);
  const now = input.now ?? new Date();
  const planKey = parsePlanKey(input.plan);
  const plan = input.config.plans[planKey];
  const providerPrice = await input.stripe.retrievePrice(plan.stripePriceId);
  if (
    providerPrice.id !== plan.stripePriceId || !providerPrice.active ||
    providerPrice.unitAmount !== plan.unitAmount ||
    providerPrice.currency !== plan.currency ||
    providerPrice.interval !== plan.interval
  ) throw new BillingRequestError("STRIPE_PRICE_CONFIGURATION_INVALID", "The selected plan price is not configured correctly.", 503);
  const account = await input.store.getOrCreateAccount(input.user, input.config.usageActivationAt);
  let state = await input.store.getState(account.id);

  if (state.subscription?.isCurrent) {
    throw safe("SUBSCRIPTION_EXISTS", "This account already has a subscription. Use Manage Billing to change it.");
  }

  let claimId: string | undefined;
  let idempotencyKey: string | undefined;
  if (state.account.pendingCheckoutSessionId) {
    if (state.account.pendingCheckoutPlanKey !== planKey) {
      throw safe("CHECKOUT_ALREADY_PENDING", "Another plan checkout is already pending.");
    }
    if (isClaimId(state.account.pendingCheckoutSessionId)) {
      claimId = state.account.pendingCheckoutSessionId;
      idempotencyKey = state.account.pendingCheckoutIdempotencyKey ?? "";
      if (!idempotencyKey) throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Billing is still being verified.");
    } else {
      const pendingSession = await input.stripe.retrieveCheckoutSession(state.account.pendingCheckoutSessionId);
      if (pendingSession.status === "open" && pendingSession.expiresAt > now && pendingSession.url && !pendingSession.subscriptionId) {
        return { url: pendingSession.url, reused: true };
      }
      if (pendingSession.status === "complete" || pendingSession.subscriptionId) {
        if (await reconcileCompletedSession(account, pendingSession, input.config, input.store, input.stripe, now)) {
          state = await input.store.getState(account.id);
        } else {
          throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Checkout has completed or is still being verified. Try again shortly.");
        }
      }
      if (pendingSession.status === "expired" && !pendingSession.subscriptionId) {
        await clearVerifiedExpiredSession(account.id, pendingSession.id, input.store, input.stripe, now, pendingSession);
        state = await input.store.getState(account.id);
      } else if (state.account.pendingCheckoutSessionId) {
        throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Checkout has completed or is still being verified. Try again shortly.");
      }
    }
  }

  if (!state.account.pendingCheckoutSessionId) {
    claimId = `pending:${randomUUID()}`;
    idempotencyKey = `apex-checkout-${randomUUID()}`;
    const claimed = await input.store.claimCheckout({
      accountId: account.id,
      planKey,
      claimId,
      idempotencyKey,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    if (!claimed) throw safe("CHECKOUT_ALREADY_PENDING", "Billing is already being processed for this account.");
  }

  if (!claimId || !idempotencyKey) {
    throw safe("CHECKOUT_RECONCILIATION_REQUIRED", "Billing is still being verified. Try again shortly.");
  }

  let checkoutRequestStarted = false;
  try {
    const customerId = await getCustomerId(input.user, account, input.store, input.stripe);
    const redirects = buildBillingRedirects(input.config.appOrigin);
    checkoutRequestStarted = true;
    const session = await input.stripe.createCheckoutSession({
      customerId,
      accountId: account.id,
      userId: input.user.id,
      planKey,
      priceId: plan.stripePriceId,
      successUrl: redirects.successUrl,
      cancelUrl: redirects.cancelUrl,
      trialDays: state.hasPriorTrial ? null : 14,
      paymentMethodCollection: input.config.trialPaymentCollection,
      missingPaymentMethodBehavior: input.config.missingPaymentMethodBehavior,
      idempotencyKey,
    });
    await input.store.saveCheckoutSession(account.id, claimId, session);
    if (!session.url || session.status !== "open" || session.expiresAt <= now) {
      if (session.status === "expired" && !session.subscriptionId) {
        await clearVerifiedExpiredSession(account.id, session.id, input.store, input.stripe, now, session);
      }
      throw safe("CHECKOUT_NOT_OPEN", "Stripe did not return an active checkout session. Please try again.", 502);
    }
    return { url: session.url, reused: false };
  } catch (error) {
    if (!checkoutRequestStarted) {
      await input.store.clearCheckoutClaim(account.id, claimId).catch(() => undefined);
    }
    throw error;
  }
};

export const createPortalOperation = async (input: {
  userId: string;
  appOrigin: string;
  store: BillingStore;
  stripe: BillingStripeGateway;
}) => {
  const summary = await input.store.getVerifiedSummary(input.userId);
  const customerId = summary?.account.stripeCustomerId;
  if (!customerId) throw safe("BILLING_CUSTOMER_MISSING", "No billing account is available for this user.", 404);
  const { portalReturnUrl } = buildBillingRedirects(input.appOrigin);
  return input.stripe.createPortalSession(customerId, portalReturnUrl);
};

const validateSubscription = async (
  account: BillingAccountRecord,
  subscription: CanonicalSubscription,
  config: Pick<BillingConfiguration, "plans">,
  stripe: BillingStripeGateway,
) => {
  if (
    !account.stripeCustomerId ||
    !account.userId ||
    subscription.customerId !== account.stripeCustomerId ||
    subscription.metadata.billingAccountId !== account.id ||
    subscription.metadata.apexUserId !== account.userId ||
    subscription.items.length !== 1
  ) throw safe("SUBSCRIPTION_ASSOCIATION_INVALID", "The subscription could not be verified.", 409);
  const plan = getPlanByPriceId(config.plans, subscription.items[0]!.priceId);
  if (!plan) throw safe("SUBSCRIPTION_PRICE_INVALID", "The subscription price is not configured.", 409);
  const providerPrice = await stripe.retrievePrice(plan.stripePriceId);
  if (
    providerPrice.id !== plan.stripePriceId ||
    providerPrice.unitAmount !== plan.unitAmount ||
    providerPrice.currency !== plan.currency ||
    providerPrice.interval !== plan.interval
  ) throw safe("SUBSCRIPTION_PRICE_INVALID", "The subscription price could not be verified.", 409);
  return plan;
};

export const switchPlanOperation = async (input: {
  user: BillingUser;
  plan: unknown;
  config: BillingConfiguration;
  store: BillingStore;
  stripe: BillingStripeGateway;
}) => {
  assertBillingEnabled(input.config);
  const planKey = parsePlanKey(input.plan);
  const summary = await input.store.getVerifiedSummary(input.user.id);
  if (!summary?.subscription?.isCurrent) throw safe("SUBSCRIPTION_MISSING", "There is no active subscription to change.", 404);
  if (!summary.entitlement || !["active", "trialing", "grace", "canceling"].includes(summary.entitlement.status)) {
    throw safe("SUBSCRIPTION_NOT_ENTITLED", "The subscription must be verified before it can be changed.");
  }
  if (summary.subscription.pendingPlanKey) throw safe("PLAN_SWITCH_PENDING", "A plan change is already being processed.");
  const canonical = await input.stripe.retrieveSubscription(summary.subscription.stripeSubscriptionId);
  const current = await validateSubscription(summary.account, canonical, input.config, input.stripe);
  const target = input.config.plans[planKey];
  const targetPrice = await input.stripe.retrievePrice(target.stripePriceId);
  if (
    targetPrice.id !== target.stripePriceId || !targetPrice.active ||
    targetPrice.unitAmount !== target.unitAmount || targetPrice.currency !== target.currency ||
    targetPrice.interval !== target.interval
  ) throw safe("STRIPE_PRICE_CONFIGURATION_INVALID", "The selected plan price is not configured correctly.", 503);
  if (current.key === target.key) return { status: "already_on_plan" as const };
  const idempotencyKey = `apex-switch-${randomUUID()}`;
  const started = await input.store.beginPlanSwitch({
    accountId: summary.account.id,
    subscriptionId: canonical.id,
    planKey,
    priceId: target.stripePriceId,
    idempotencyKey,
  });
  if (started !== "switch_recorded" && started !== "switch_reused") {
    throw safe("PLAN_SWITCH_PENDING", "A plan change is already being processed.");
  }
  try {
    await input.stripe.updateSubscription({
      subscription: canonical,
      priceId: target.stripePriceId,
      accountId: summary.account.id,
      idempotencyKey,
    });
    return { status: "pending_verification" as const };
  } catch (error) {
    // A network failure can occur after Stripe accepted the change. Clear the
    // pending marker only after a canonical read proves the old price remains.
    try {
      const latest = await input.stripe.retrieveSubscription(canonical.id);
      const unchanged = latest.items.length === canonical.items.length &&
        latest.items.every((item, index) => item.priceId === canonical.items[index]?.priceId) &&
        !latest.pendingUpdate;
      if (unchanged) await input.store.clearPlanSwitch(canonical.id, idempotencyKey);
    } catch {
      // Leave the pending state for webhook or operator reconciliation.
    }
    throw error;
  }
};

export const processBillingWebhook = async (input: {
  rawBody: string;
  signature: string;
  config: BillingWebhookConfiguration;
  store: BillingStore;
  stripe: BillingStripeGateway;
  now?: Date;
}) => {
  let event: SupportedBillingEvent | null;
  try {
    event = await input.stripe.constructWebhookEvent(input.rawBody, input.signature, input.config.webhookSecret);
  } catch {
    throw new BillingRequestError("INVALID_SIGNATURE", "Invalid webhook signature.", 400);
  }
  if (!event) return { status: "ignored" as const };
  await input.store.ingestWebhook(event);
  // A canonical read can race with a newer event that has not yet been
  // reconciled. Return a retryable response and requeue only that terminal
  // reconciliation state on Stripe's next delivery.
  await input.store.requeueWebhookReconciliation(event.id);
  const leaseToken = randomUUID();
  const claimed = await input.store.claimWebhook(event.id, leaseToken, new Date((input.now ?? new Date()).getTime() + 5 * 60 * 1000));
  if (!claimed) return { status: "duplicate" as const };

  try {
    if (!event.customerId || !event.subscriptionId) {
      throw safe("EVENT_ASSOCIATION_MISSING", "The billing event could not be associated with a subscription.", 409);
    }
    const account = await input.store.getAccountByCustomer(event.customerId);
    if (!account || (event.billingAccountId && event.billingAccountId !== account.id) ||
      (event.apexUserId && event.apexUserId !== account.userId)) {
      throw safe("CUSTOMER_ACCOUNT_MISMATCH", "The billing event account could not be verified.", 409);
    }
    const subscription = await input.stripe.retrieveSubscription(event.subscriptionId);
    if (subscription.id !== event.subscriptionId) throw safe("SUBSCRIPTION_ID_MISMATCH", "The subscription could not be verified.", 409);
    const plan = await validateSubscription(account, subscription, input.config, input.stripe);
    const result = await input.store.applyCanonicalSubscription({
      event,
      leaseToken,
      account,
      subscription,
      planKey: plan.key,
      priceId: plan.stripePriceId,
      observedAt: input.now ?? new Date(),
    });
    if (result === "reconciliation_required") {
      throw safe("WEBHOOK_RECONCILIATION_REQUIRED", "The billing event is awaiting canonical reconciliation.", 503);
    }
    if (!["applied", "stale_event"].includes(result)) {
      throw safe("WEBHOOK_STATE_REJECTED", "The billing event requires reconciliation.", 409);
    }
    return { status: result as "applied" | "stale_event" };
  } catch (error) {
    const code = error instanceof BillingRequestError ? error.code : "CANONICAL_RETRIEVAL_FAILED";
    await input.store.recordWebhookRetry(event.id, leaseToken, code, new Date((input.now ?? new Date()).getTime() + 60_000)).catch(() => undefined);
    throw error;
  }
};
