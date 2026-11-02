import { auth } from "@/lib/auth";
import { createBillingStore } from "@/modules/billing/server/store-instance";
import { getBillingConfiguration, BillingConfigurationError, BillingRequestError } from "@/modules/billing/server/config";
import { createCheckoutOperation } from "@/modules/billing/server/operations";
import { createStripeGateway } from "@/modules/billing/server/stripe-gateway";
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as { plan?: unknown };
    const configuration = getBillingConfiguration();
    const result = await createCheckoutOperation({
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      plan: body.plan,
      config: configuration,
      store: createBillingStore(),
      stripe: createStripeGateway(configuration),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingConfigurationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 503 });
    }
    if (error instanceof BillingRequestError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("billing_checkout_failed");
    return NextResponse.json({ error: { code: "CHECKOUT_FAILED", message: "Checkout could not be started. Try again later." } }, { status: 500 });
  }
}
