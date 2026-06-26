"use client";

import { Suspense } from "react";
import { CheckIcon, LoaderIcon, Zap, Shield, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function UpgradePageContent() {
    const [loading, setLoading] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const isSuccess = searchParams.get("success") === "true";
    const isCanceled = searchParams.get("canceled") === "true";

    const onUpgrade = async (plan: string) => {
        try {
            setLoading(plan);
            const response = await fetch("/api/checkout", {
                method: "POST",
                body: JSON.stringify({ plan }), // Sending plan type if needed for future
            });

            if (!response.ok) {
                throw new Error("Failed to create checkout session");
            }

            const data = await response.json();
            window.location.href = data.url;
        } catch (error) {
            console.error(error);
            alert("Something went wrong. Please check if Stripe keys are configured.");
            setLoading(null);
        }
    };

    return (
        <div className="max-w-6xl w-full flex flex-col items-center gap-12">
            <div className="flex flex-col items-center gap-4 text-center">
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white drop-shadow-lg">
                    Choose Your Power
                </h1>
                <p className="text-lg md:text-xl text-slate-400 max-w-2xl">
                    Unlock the full potential of your agents with our premium plans. Scale as you grow.
                </p>
            </div>

            {isSuccess && (
                <Alert className="bg-green-500/10 text-green-400 border-green-500/20 max-w-md w-full backdrop-blur-sm">
                    <AlertTitle>Success!</AlertTitle>
                    <AlertDescription>You are now upgraded to Pro.</AlertDescription>
                </Alert>
            )}

            {isCanceled && (
                <Alert className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 max-w-md w-full backdrop-blur-sm">
                    <AlertTitle>Canceled</AlertTitle>
                    <AlertDescription>The payment was canceled.</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-8 md:grid-cols-3 w-full">
                {/* Free Plan */}
                <Card className="flex flex-col bg-slate-900/50 border-slate-800 text-slate-100 backdrop-blur-md hover:border-slate-700 transition-colors duration-300">
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center mb-4 text-slate-400">
                            <Zap className="size-6" />
                        </div>
                        <CardTitle className="text-2xl">Starter</CardTitle>
                        <CardDescription className="text-slate-400">Perfect for exploring</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1">
                            $0<span className="text-base font-normal text-slate-500">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-slate-300">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>1 Agent</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>Basic Transcription</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>3 Meetings per month</span>
                            </li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 hover:text-white" disabled>
                            Current Plan
                        </Button>
                    </CardFooter>
                </Card>

                {/* Pro Plan */}
                <Card className="flex flex-col bg-indigo-950/30 border-indigo-500/50 text-slate-100 backdrop-blur-md relative transform hover:scale-105 transition-all duration-300 shadow-2xl shadow-indigo-500/10 h-full md:-mt-4 md:mb-4">
                    <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
                        MOST POPULAR
                    </div>
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-indigo-900/50 flex items-center justify-center mb-4 text-indigo-400">
                            <Shield className="size-6" />
                        </div>
                        <CardTitle className="text-2xl text-indigo-300">Pro</CardTitle>
                        <CardDescription className="text-slate-400">For serious builders</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1">
                            $19<span className="text-base font-normal text-slate-500">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-slate-300">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>Unlimited Agents</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>Advanced Analytics</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>Unlimited Meetings</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-indigo-400" />
                                <span>Priority Support</span>
                            </li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/25"
                            onClick={() => onUpgrade('pro')}
                            disabled={loading === 'pro'}
                        >
                            {loading === 'pro' ? <LoaderIcon className="animate-spin size-4 mr-2" /> : "Upgrade Now"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* Enterprise Plan (New "Recharge" Option) */}
                <Card className="flex flex-col bg-slate-900/50 border-slate-800 text-slate-100 backdrop-blur-md hover:border-slate-700 transition-colors duration-300">
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-orange-900/20 flex items-center justify-center mb-4 text-orange-400">
                            <Crown className="size-6" />
                        </div>
                        <CardTitle className="text-2xl text-orange-400">Enterprise</CardTitle>
                        <CardDescription className="text-slate-400">Maximum power & scale</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1">
                            $99<span className="text-base font-normal text-slate-500">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-slate-300">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-orange-400" />
                                <span>Everything in Pro</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-orange-400" />
                                <span>Dedicated Success Manager</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-orange-400" />
                                <span>Custom API Rate Limits</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-orange-400" />
                                <span>SSO & Audit Logs</span>
                            </li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="outline"
                            className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                            onClick={() => onUpgrade('enterprise')}
                            disabled={loading === 'enterprise'}
                        >
                            {loading === 'enterprise' ? <LoaderIcon className="animate-spin size-4 mr-2" /> : "Contact Sales"}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}

export default function UpgradePage() {
    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><LoaderIcon className="animate-spin text-white size-8" /></div>}>
                <UpgradePageContent />
            </Suspense>
        </div>
    );
}
