import { auth } from "@/lib/auth";
import { billingStore } from "@/modules/billing/server/store";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to view billing." } }, { status: 401 });

  try {
    const summary = await billingStore.getVerifiedSummary(session.user.id);
    if (!summary) {
      return NextResponse.json({
        entitlement: { plan: "unresolved", status: "unresolved" },
        subscription: null,
        billingAccountAvailable: false,
        manageBillingAvailable: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      entitlement: summary.entitlement,
      subscription: summary.subscription ? {
        status: summary.subscription.status,
        currentPeriodEnd: summary.subscription.currentPeriodEnd,
        trialEnd: summary.subscription.trialEnd,
        graceUntil: summary.subscription.graceUntil,
        cancelAtPeriodEnd: summary.subscription.cancelAtPeriodEnd,
        pendingPlanKey: summary.subscription.pendingPlanKey,
      } : null,
      billingAccountAvailable: true,
      manageBillingAvailable: Boolean(summary.account.stripeCustomerId),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("billing_summary_read_failed");
    return NextResponse.json({ error: { code: "BILLING_STATUS_UNAVAILABLE", message: "Billing status is temporarily unavailable." } }, { status: 503 });
  }
}
