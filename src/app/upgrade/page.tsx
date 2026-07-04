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
                body: JSON.stringify({ plan }),
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
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900">
                    Choose Your Power
                </h1>
                <p className="text-lg md:text-xl text-gray-500 max-w-2xl">
                    Unlock the full potential of your agents with our premium plans. Scale as you grow.
                </p>
            </div>

            {isSuccess && (
                <Alert className="bg-green-50 text-green-800 border-green-200 max-w-md w-full">
                    <AlertTitle>Success!</AlertTitle>
                    <AlertDescription>You are now upgraded to Pro.</AlertDescription>
                </Alert>
            )}

            {isCanceled && (
                <Alert className="bg-yellow-50 text-yellow-800 border-yellow-200 max-w-md w-full">
                    <AlertTitle>Canceled</AlertTitle>
                    <AlertDescription>The payment was canceled.</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-8 md:grid-cols-3 w-full">
                {/* Free Plan */}
                <Card className="flex flex-col bg-white border border-gray-200 shadow-sm hover:border-gray-300 transition-colors duration-300">
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-4 text-gray-500">
                            <Zap className="size-6" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-gray-900">Starter</CardTitle>
                        <CardDescription className="text-gray-500">Perfect for exploring</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1 text-gray-900">
                            $0<span className="text-base font-normal text-gray-400">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-gray-600">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>1 Agent</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>Basic Transcription</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>3 Meetings per month</span>
                            </li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button variant="outline" className="w-full border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700" disabled>
                            Current Plan
                        </Button>
                    </CardFooter>
                </Card>

                {/* Pro Plan */}
                <Card className="flex flex-col bg-white border-indigo-200 shadow-lg shadow-indigo-100/50 relative transform hover:scale-105 transition-all duration-300 h-full md:-mt-4 md:mb-4">
                    <div className="absolute -top-px left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white px-3 py-1 text-xs font-bold rounded-bl-lg">
                        MOST POPULAR
                    </div>
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center mb-4 text-indigo-600">
                            <Shield className="size-6" />
                        </div>
                        <CardTitle className="text-2xl text-indigo-700">Pro</CardTitle>
                        <CardDescription className="text-gray-500">For serious builders</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1 text-gray-900">
                            $19<span className="text-base font-normal text-gray-400">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-gray-600">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>Unlimited Agents</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>Advanced Analytics</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
                                <span>Unlimited Meetings</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-green-500" />
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

                {/* Enterprise Plan */}
                <Card className="flex flex-col bg-white border border-gray-200 shadow-sm hover:border-gray-300 transition-colors duration-300">
                    <CardHeader>
                        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center mb-4 text-orange-500">
                            <Crown className="size-6" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-orange-700">Enterprise</CardTitle>
                        <CardDescription className="text-gray-500">Maximum power & scale</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div className="text-4xl font-bold mb-6 flex items-baseline gap-1 text-gray-900">
                            $99<span className="text-base font-normal text-gray-400">/mo</span>
                        </div>
                        <ul className="space-y-4 text-sm text-gray-600">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-gray-400" />
                                <span>Everything in Pro</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-gray-400" />
                                <span>Dedicated Success Manager</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-gray-400" />
                                <span>Custom API Rate Limits</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-gray-400" />
                                <span>SSO & Audit Logs</span>
                            </li>
                        </ul>
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="outline"
                            className="w-full border-orange-200 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
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
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 bg-[#FAFAFA]">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><LoaderIcon className="animate-spin text-gray-400 size-8" /></div>}>
                <UpgradePageContent />
            </Suspense>
        </div>
    );
}
