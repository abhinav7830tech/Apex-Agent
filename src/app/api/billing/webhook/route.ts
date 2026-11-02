import { getBillingWebhookConfiguration, BillingConfigurationError, BillingRequestError } from "@/modules/billing/server/config";
import { processBillingWebhook } from "@/modules/billing/server/operations";
import { billingStore } from "@/modules/billing/server/store";
import { createStripeGateway } from "@/modules/billing/server/stripe-gateway";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: { code: "SIGNATURE_REQUIRED", message: "Missing Stripe signature." } }, { status: 400 });
  }

  try {
    const rawBody = await request.text();
    const configuration = getBillingWebhookConfiguration();
    const result = await processBillingWebhook({
      rawBody,
      signature,
      config: configuration,
      store: billingStore,
      stripe: createStripeGateway(configuration),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 503 });
    }
    if (error instanceof BillingRequestError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    // Stripe may retry; logs contain no payload, secret, or payment details.
    console.error("stripe_webhook_processing_failed");
    return NextResponse.json({ error: { code: "WEBHOOK_PROCESSING_FAILED", message: "The billing event could not be processed." } }, { status: 500 });
  }
}
