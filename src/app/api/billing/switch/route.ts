import { auth } from "@/lib/auth";
import { getBillingConfiguration, BillingConfigurationError, BillingRequestError } from "@/modules/billing/server/config";
import { switchPlanOperation } from "@/modules/billing/server/operations";
import { billingStore } from "@/modules/billing/server/store";
import { createStripeGateway } from "@/modules/billing/server/stripe-gateway";
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to change plans." } }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as { plan?: unknown };
    const configuration = getBillingConfiguration();
    const result = await switchPlanOperation({
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      plan: body.plan,
      config: configuration,
      store: billingStore,
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
    console.error("billing_plan_switch_failed");
    return NextResponse.json({ error: { code: "PLAN_CHANGE_FAILED", message: "The plan change could not be started." } }, { status: 500 });
  }
}
