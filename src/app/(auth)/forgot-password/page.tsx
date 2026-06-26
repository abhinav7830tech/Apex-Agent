
"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
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
import { Mail, OctagonAlertIcon, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";

const formSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
});

type FormData = z.infer<typeof formSchema>;

export default function ForgotPasswordPage() {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            await authClient.requestPasswordReset({
                email: data.email,
                redirectTo: "/reset-password" // Ensure this page exists or update later
            }, {
                onSuccess: () => {
                    setSuccess(true);
                    setIsLoading(false);
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

            <div className="w-full max-w-md mx-auto relative z-10">
                <Card className="backdrop-blur-xl bg-white/5 border-white/10 shadow-2xl overflow-hidden">
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
                                Reset Password
                            </h1>
                            <p className="text-gray-400 text-sm mt-2">
                                Enter your email to receive a password reset link
                            </p>
                        </div>

                        {success ? (
                            <div className="space-y-6">
                                <Alert className="bg-green-500/10 border-green-500/30 backdrop-blur-sm">
                                    <AlertTitle className="text-green-300">Success! Check your email for the reset link.</AlertTitle>
                                </Alert>
                                <Link href="/sign-in">
                                    <Button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 mt-4">
                                        Back to Sign In
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/90 font-medium">Email</FormLabel>
                                                <FormControl>
                                                    <div className="relative group">
                                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                                                        <Input
                                                            {...field}
                                                            type="email"
                                                            placeholder="name@example.com"
                                                            disabled={isLoading}
                                                            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-400 focus:ring-purple-400/20 transition-all duration-300 hover:bg-white/10"
                                                        />
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
                                        {isLoading ? "Sending Link..." : "Send Reset Link"}
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
            </div>
        </div>
    );
}
