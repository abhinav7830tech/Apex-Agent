import Stripe from "stripe";
import type { BillingConfiguration } from "./config";
import type {
  BillingStripeGateway,
  CanonicalSubscription,
  CheckoutSession,
  SupportedBillingEvent,
} from "./operations";

const STRIPE_API_VERSION = "2026-01-28.clover" as const;

const expandableId = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id ?? null;

const dateFromUnix = (value: number | null | undefined) =>
  typeof value === "number" ? new Date(value * 1000) : null;

const normalizeSession = (session: Stripe.Checkout.Session): CheckoutSession => ({
  id: session.id,
  url: session.url,
  status: session.status,
  expiresAt: new Date(session.expires_at * 1000),
  customerId: expandableId(session.customer),
  subscriptionId: expandableId(session.subscription),
  metadata: session.metadata,
});

const normalizeSubscription = (subscription: Stripe.Subscription): CanonicalSubscription => ({
  id: subscription.id,
  customerId: expandableId(subscription.customer) ?? "",
  metadata: subscription.metadata,
  status: subscription.status,
  cancelAtPeriodEnd: subscription.cancel_at_period_end,
  cancelAt: dateFromUnix(subscription.cancel_at),
  canceledAt: dateFromUnix(subscription.canceled_at),
  endedAt: dateFromUnix(subscription.ended_at),
  currentPeriodStart: dateFromUnix(subscription.items.data[0]?.current_period_start),
  currentPeriodEnd: dateFromUnix(subscription.items.data[0]?.current_period_end),
  trialStart: dateFromUnix(subscription.trial_start),
  trialEnd: dateFromUnix(subscription.trial_end),
  pendingUpdate: subscription.pending_update !== null,
  items: subscription.items.data.map((item) => ({ id: item.id, priceId: item.price.id })),
});

const normalizeEvent = (event: Stripe.Event): SupportedBillingEvent | null => {
  const supported = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]);
  if (!supported.has(event.type)) return null;

  let objectId = "";
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  let billingAccountId: string | null = null;
  let apexUserId: string | null = null;
  let invoiceId: string | null = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    objectId = session.id;
    customerId = expandableId(session.customer);
    subscriptionId = expandableId(session.subscription);
    billingAccountId = session.metadata?.billingAccountId ?? null;
    apexUserId = session.metadata?.apexUserId ?? null;
  } else if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    objectId = subscription.id;
    customerId = expandableId(subscription.customer);
    subscriptionId = subscription.id;
    billingAccountId = subscription.metadata.billingAccountId ?? null;
    apexUserId = subscription.metadata.apexUserId ?? null;
  } else {
    const invoice = event.data.object as Stripe.Invoice;
    const parentSubscription = invoice.parent?.subscription_details?.subscription;
    objectId = invoice.id;
    customerId = expandableId(invoice.customer);
    subscriptionId = expandableId(parentSubscription);
    invoiceId = invoice.id;
  }

  return {
    id: event.id,
    type: event.type as SupportedBillingEvent["type"],
    createdAt: new Date(event.created * 1000),
    objectId,
    customerId,
    subscriptionId,
    billingAccountId,
    apexUserId,
    invoiceId,
  };
};

export const createStripeGateway = (configuration: Pick<BillingConfiguration, "secretKey">, mockedClient?: Stripe): BillingStripeGateway => {
  const stripe = mockedClient ?? new Stripe(configuration.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });

  return {
    async createCustomer(input, idempotencyKey) {
      const customer = await stripe.customers.create({
        email: input.email,
        name: input.name,
        metadata: { billingAccountId: input.billingAccountId, apexUserId: input.userId },
      }, { idempotencyKey });
      return { id: customer.id };
    },
    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customerId,
        client_reference_id: input.accountId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        metadata: { billingAccountId: input.accountId, apexUserId: input.userId, planKey: input.planKey },
        payment_method_collection: input.paymentMethodCollection,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        subscription_data: {
          metadata: { billingAccountId: input.accountId, apexUserId: input.userId, planKey: input.planKey },
          ...(input.trialDays ? {
            trial_period_days: input.trialDays,
            trial_settings: { end_behavior: { missing_payment_method: input.missingPaymentMethodBehavior } },
          } : {}),
        },
      }, { idempotencyKey: input.idempotencyKey });
      return normalizeSession(session);
    },
    async retrieveCheckoutSession(sessionId) {
      return normalizeSession(await stripe.checkout.sessions.retrieve(sessionId));
    },
    async retrievePrice(priceId) {
      const price = await stripe.prices.retrieve(priceId);
      return {
        id: price.id,
        unitAmount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
        active: price.active,
      };
    },
    async retrieveSubscription(subscriptionId) {
      return normalizeSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    },
    async createPortalSession(customerId, returnUrl) {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: session.url };
    },
    async updateSubscription(input) {
      const item = input.subscription.items[0];
      if (!item || input.subscription.items.length !== 1) throw new Error("subscription_items_invalid");
      const subscription = await stripe.subscriptions.update(input.subscription.id, {
        items: [{ id: item.id, price: input.priceId }],
        proration_behavior: "create_prorations",
        payment_behavior: "pending_if_incomplete",
        metadata: { ...input.subscription.metadata, billingAccountId: input.accountId },
      }, { idempotencyKey: input.idempotencyKey });
      return normalizeSubscription(subscription);
    },
    async constructWebhookEvent(rawBody, signature, secret) {
      return normalizeEvent(stripe.webhooks.constructEvent(rawBody, signature, secret));
    },
  };
};
