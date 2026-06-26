
"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Lock, Eye, EyeOff, OctagonAlertIcon, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";

const formSchema = z.object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

type FormData = z.infer<typeof formSchema>;

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            password: "",
            confirmPassword: "",
        },
    });

    const onSubmit = async (data: FormData) => {
        if (!token) {
            setError("Invalid or missing reset token.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            await authClient.resetPassword({
                newPassword: data.password,
                token: token // Pass the token specifically if required, or authClient might pick it up if not passed but safer to pass
            }, {
                onSuccess: () => {
                    setSuccess(true);
                    setIsLoading(false);
                    setTimeout(() => router.push("/sign-in"), 3000);
                },
                onError: (ctx: { error: { message: string } }) => {
                    setError(ctx.error.message);
                    setIsLoading(false);
                }
            })
        } catch {
            setError("An error occurred. Please try again.");
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <Card className="backdrop-blur-xl bg-white/5 border-white/10 shadow-2xl overflow-hidden p-8 text-center text-white">
                <OctagonAlertIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Invalid Link</h2>
                <p className="text-gray-400 mb-6">This password reset link is invalid or has expired.</p>
                <Link href="/forgot-password">
                    <Button variant="outline" className="border-white/20 hover:bg-white/10 text-white">
                        Request new link
                    </Button>
                </Link>
            </Card>
        )
    }

    return (
        <Card className="backdrop-blur-xl bg-white/5 border-white/10 shadow-2xl overflow-hidden w-full max-w-md">
            <CardContent className="p-8">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="relative group p-1">
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-opacity"></div>
                            <Image
                                width={64}
                                height={64}
                                src="/logo.svg"
                                alt="Apex-Agent Logo"
                                className="relative h-16 w-16 object-contain rounded-full border-2 border-white/30 backdrop-blur-sm"
                            />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                        Set New Password
                    </h1>
                    <p className="text-gray-400 text-sm mt-2">
                        Enter your new password below
                    </p>
                </div>

                {success ? (
                    <div className="space-y-6 text-center">
                        <Alert className="bg-green-500/10 border-green-500/30 backdrop-blur-sm">
                            <AlertTitle className="text-green-300">Password reset successfully!</AlertTitle>
                        </Alert>
                        <p className="text-gray-400">Redirecting to sign in...</p>
                        <Link href="/sign-in">
                            <Button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 mt-4">
                                Sign In Now
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-white/90 font-medium">New Password</FormLabel>
                                        <FormControl>
                                            <div className="relative group">
                                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                                <Input
                                                    {...field}
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="Enter new password"
                                                    disabled={isLoading}
                                                    className="pl-10 pr-10 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-400 focus:ring-purple-400/20 transition-all duration-300 hover:bg-white/10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                                    disabled={isLoading}
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage className="text-red-300" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-white/90 font-medium">Confirm Password</FormLabel>
                                        <FormControl>
                                            <div className="relative group">
                                                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                                <Input
                                                    {...field}
                                                    type={showConfirmPassword ? "text" : "password"}
                                                    placeholder="Confirm new password"
                                                    disabled={isLoading}
                                                    className="pl-10 pr-10 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-400 focus:ring-purple-400/20 transition-all duration-300 hover:bg-white/10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                                    disabled={isLoading}
                                                >
                                                    {showConfirmPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        </FormControl>
                                        <FormMessage className="text-red-300" />
                                    </FormItem>
                                )}
                            />

                            {error && (
                                <Alert className="bg-red-500/10 border-red-500/30 backdrop-blur-sm animate-in slide-in-from-top-2">
                                    <OctagonAlertIcon className="h-4 w-4 text-red-400" />
                                    <AlertTitle className="text-red-300">{error}</AlertTitle>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                disabled={isLoading}
                            >
                                {isLoading ? "Resetting..." : "Reset Password"}
                            </Button>
                        </form>
                    </Form>
                )}

                <div className="mt-6 text-center">
                    <Link
                        href="/sign-in"
                        className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Sign In
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-purple-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-blue-500/10 rounded-full blur-3xl"></div>
            </div>

            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:16px_16px]"></div>
            </div>

            <Suspense fallback={<div className="text-white">Loading...</div>}>
                <ResetPasswordContent />
            </Suspense>
        </div>
    )
}
