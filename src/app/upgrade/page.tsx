"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckIcon, LoaderIcon, Shield, Crown, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BILLING_PLAN_DISPLAY } from "@/modules/billing/plans";

const monthlyPrice = (amount: number) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(amount / 100);

type BillingSummary = {
  entitlement: { plan: "starter" | "pro" | "enterprise" | "legacy" | "unresolved"; status: string };
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    graceUntil: string | null;
    cancelAtPeriodEnd: boolean;
    pendingPlanKey: string | null;
  } | null;
  billingAccountAvailable: boolean;
  manageBillingAvailable: boolean;
};

const dateLabel = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : null;

function UpgradePageContent() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const checkoutReturn = searchParams.get("checkout");

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch("/api/billing/summary", { cache: "no-store" });
      if (!response.ok) throw new Error("Billing status is temporarily unavailable.");
      setSummary(await response.json() as BillingSummary);
    } catch {
      setMessage("Billing status is temporarily unavailable. Refresh to check again.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void refreshSummary(); }, [refreshSummary]);

  const onPlanAction = async (plan: "pro" | "enterprise") => {
    setMessage(null);
    setLoading(plan);
    try {
      const isPaidSubscription = summary?.entitlement.plan === "pro" || summary?.entitlement.plan === "enterprise";
      const endpoint = isPaidSubscription ? "/api/billing/switch" : "/api/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = await response.json() as { url?: string; status?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Billing request failed.");
      if (result.url) {
        const destination = new URL(result.url);
        if (destination.protocol !== "https:") throw new Error("Stripe returned an invalid checkout URL.");
        window.location.assign(destination.href);
        return;
      }
      setMessage(result.status === "pending_verification"
        ? "Your plan change is being confirmed by Stripe. This page will show the verified status when it arrives."
        : "Your billing request has been received.");
      await refreshSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing request failed. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const manageBilling = async () => {
    setMessage(null);
    setLoading("portal");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const result = await response.json() as { url?: string; error?: { message?: string } };
      if (!response.ok || !result.url) throw new Error(result.error?.message ?? "Billing management is unavailable.");
      const destination = new URL(result.url);
      if (destination.protocol !== "https:") throw new Error("Stripe returned an invalid portal URL.");
      window.location.assign(destination.href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing management is unavailable.");
    } finally {
      setLoading(null);
    }
  };

  const planLabel = summary?.entitlement.plan === "legacy" ? "Grandfathered access" :
    summary?.entitlement.plan === "unresolved" ? "Status not yet available" :
      `${summary?.entitlement.plan ?? "starter"} plan`;

  return (
    <div className="max-w-6xl w-full flex flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900">Plans for your team</h1>
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl">Choose an Apex Agent subscription for your meeting workflows.</p>
      </div>

      {checkoutReturn === "complete" && (
        <Alert className="max-w-2xl w-full">
          <AlertTitle>Checkout returned</AlertTitle>
          <AlertDescription>Subscription access is shown only after Stripe confirms it. Refresh billing status below if it is still pending.</AlertDescription>
        </Alert>
      )}
      {checkoutReturn === "cancelled" && (
        <Alert className="max-w-2xl w-full">
          <AlertTitle>Checkout canceled</AlertTitle>
          <AlertDescription>No subscription change is assumed from this redirect.</AlertDescription>
        </Alert>
      )}
      {message && <Alert className="max-w-2xl w-full"><AlertDescription>{message}</AlertDescription></Alert>}

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Your verified billing status</CardTitle>
          <CardDescription>{summaryLoading ? "Checking subscription status…" : planLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          {summary?.subscription && <p>Subscription status: {summary.subscription.status.replaceAll("_", " ")}</p>}
          {summary?.subscription?.trialEnd && <p>Trial ends: {dateLabel(summary.subscription.trialEnd)}</p>}
          {summary?.subscription?.graceUntil && <p>Payment grace ends: {dateLabel(summary.subscription.graceUntil)}</p>}
          {summary?.subscription?.currentPeriodEnd && <p>{summary.subscription.cancelAtPeriodEnd ? "Access ends" : "Renews"}: {dateLabel(summary.subscription.currentPeriodEnd)}</p>}
          {summary?.subscription?.pendingPlanKey && <p>Plan change pending confirmation: {summary.subscription.pendingPlanKey}</p>}
          {summary?.entitlement.status === "unresolved" && <p>Billing account setup is not complete. Your current application access remains unchanged.</p>}
        </CardContent>
        <CardFooter className="gap-3">
          <Button variant="outline" onClick={() => void refreshSummary()} disabled={summaryLoading}>Refresh status</Button>
          {summary?.manageBillingAvailable && (
            <Button variant="outline" onClick={() => void manageBilling()} disabled={loading === "portal"}>
              {loading === "portal" ? <LoaderIcon className="animate-spin size-4 mr-2" /> : null}Manage Billing
            </Button>
          )}
        </CardFooter>
      </Card>

      <div className="grid gap-8 md:grid-cols-3 w-full">
        <Card className="flex flex-col bg-white border border-gray-200 shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-4 text-gray-500"><Zap className="size-6" /></div>
            <CardTitle className="text-2xl font-bold">Starter</CardTitle>
            <CardDescription>Core agent and meeting workflows</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="text-4xl font-bold mb-6">$0<span className="text-base font-normal text-gray-400">/mo</span></div>
            <ul className="space-y-4 text-sm text-gray-600">
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Create and manage AI agents</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Schedule and review meetings</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Meeting summaries and action items</span></li>
            </ul>
          </CardContent>
          <CardFooter><Button variant="outline" className="w-full" disabled>{summary?.entitlement.plan === "starter" ? "Current Plan" : "Starter"}</Button></CardFooter>
        </Card>

        <Card className="flex flex-col bg-white border-indigo-200 shadow-lg relative">
          <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center mb-4 text-indigo-600"><Shield className="size-6" /></div>
            <CardTitle className="text-2xl text-indigo-700">Pro</CardTitle>
            <CardDescription>For teams using Apex Agent more broadly</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="text-4xl font-bold mb-6">{monthlyPrice(BILLING_PLAN_DISPLAY.pro.unitAmount)}<span className="text-base font-normal text-gray-400">/mo</span></div>
            <ul className="space-y-4 text-sm text-gray-600">
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>14-day trial</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Meeting summaries and analytics</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Billing managed securely through Stripe</span></li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => void onPlanAction("pro")} disabled={loading !== null || summary?.entitlement.plan === "pro"}>
              {loading === "pro" ? <LoaderIcon className="animate-spin size-4 mr-2" /> : summary?.entitlement.plan === "pro" && summary.subscription?.cancelAtPeriodEnd ? "Cancellation Scheduled" : summary?.entitlement.plan === "pro" ? "Current Plan" : "Choose Pro"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col bg-white border border-gray-200 shadow-sm">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center mb-4 text-orange-500"><Crown className="size-6" /></div>
            <CardTitle className="text-2xl font-bold text-orange-700">Enterprise</CardTitle>
            <CardDescription>Enterprise subscription, available for self-service</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="text-4xl font-bold mb-6">{monthlyPrice(BILLING_PLAN_DISPLAY.enterprise.unitAmount)}<span className="text-base font-normal text-gray-400">/mo</span></div>
            <ul className="space-y-4 text-sm text-gray-600">
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>14-day trial</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Enterprise plan subscription</span></li>
              <li className="flex items-center gap-3"><CheckIcon className="size-5 text-green-500" /><span>Manage billing through Stripe</span></li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full border-orange-200 text-orange-600 hover:bg-orange-50" onClick={() => void onPlanAction("enterprise")} disabled={loading !== null || summary?.entitlement.plan === "enterprise"}>
              {loading === "enterprise" ? <LoaderIcon className="animate-spin size-4 mr-2" /> : summary?.entitlement.plan === "enterprise" && summary.subscription?.cancelAtPeriodEnd ? "Cancellation Scheduled" : summary?.entitlement.plan === "enterprise" ? "Current Plan" : "Choose Enterprise"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 bg-[#FAFAFA]">
      <Suspense fallback={<div className="flex items-center justify-center h-full"><LoaderIcon className="animate-spin text-gray-400 size-8" /></div>}>
        <UpgradePageContent />
      </Suspense>
    </div>
  );
}
