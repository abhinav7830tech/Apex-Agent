"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import {
  OctagonAlertIcon,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Github,
  Chrome,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, { message: "Password is required" }),
});

type FormData = z.infer<typeof formSchema>;

export const SignInView = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);

    try {
      await authClient.signIn.email(
        {
          email: data.email,
          password: data.password,
        },
        {
          onSuccess: () => {
            router.push("/");
          },
          onError: ({ error }) => {
            setError(error.message || "An error occurred during sign in");
            setIsLoading(false);
          },
        }
      );
    } catch (err) {
      setError("Invalid email or password. Please try again.");
      setIsLoading(false);
      console.log(err);

    }
  };



  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
      <div className="w-full max-w-5xl mx-auto">
        <Card className="rounded-2xl bg-white shadow-md border border-gray-200 overflow-hidden">
          <CardContent className="grid p-0 lg:grid-cols-2">
            {/* Left Side - Form */}
            <div className="p-10 lg:p-12">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-gray-900">
                      Welcome back
                    </h1>
                    <p className="text-gray-500">
                      Sign in to continue to Apex-Agent
                    </p>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-5">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 font-medium text-sm">
                            Email
                          </FormLabel>
                          <FormControl>
                            <div className="relative group">
                              <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-green-600 transition-colors" />
                              <Input
                                type="email"
                                placeholder="m@example.com"
                                disabled={isLoading}
                                className="h-[50px] pl-11 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:ring-green-600/20 rounded-xl transition-all duration-200"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-red-500 text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 font-medium text-sm">
                            Password
                          </FormLabel>
                          <FormControl>
                            <div className="relative group">
                              <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-green-600 transition-colors" />
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                disabled={isLoading}
                                className="h-[50px] pl-11 pr-11 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:ring-green-600/20 rounded-xl transition-all duration-200"
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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
                          <FormMessage className="text-red-500 text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Error Alert */}
                  {error && (
                    <Alert className="bg-red-50 border border-red-200 rounded-xl">
                      <OctagonAlertIcon className="h-4 w-4 text-red-500" />
                      <AlertTitle className="text-red-700 text-sm font-medium">{error}</AlertTitle>
                    </Alert>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full h-[50px] bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                    disabled={isLoading}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {isLoading && (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {isLoading ? "Signing in..." : "Sign In"}
                    </div>
                  </Button>

                  {/* Forgot Password */}
                  <div className="text-center">
                    <Link
                      href="/forgot-password"
                      className="text-sm text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-4"
                    >
                      Forgot your password?
                    </Link>
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-3 text-gray-400">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  {/* Social Login Buttons */}
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        authClient.signIn.social({
                          provider: "google",
                        });
                      }}
                      className="h-[48px] bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading}
                    >
                      <Chrome className="w-4 h-4 mr-2" />
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        authClient.signIn.social({
                          provider: "github",
                        });
                      }}
                      className="h-[48px] bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading}
                    >
                      <Github className="w-4 h-4 mr-2" />
                      GitHub
                    </Button>
                  </div>

                  {/* Sign Up Link */}
                  <div className="text-center text-sm">
                    <span className="text-gray-500">
                      Don&apos;t have an account?{" "}
                    </span>
                    <Link
                      href="/sign-up"
                      className="text-green-600 font-semibold hover:text-green-700 transition-colors underline underline-offset-4"
                    >
                      Sign up
                    </Link>
                  </div>
                </form>
              </Form>
            </div>

            {/* Right Side - Branding */}
            <div className="relative hidden lg:flex flex-col items-center justify-center bg-slate-50 p-12">
              {/* Logo and Branding */}
              <div className="text-center space-y-8">
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-green-500/10 rounded-full blur-md" />
                    <div className="relative h-24 w-24 rounded-full border-2 border-gray-200 bg-white shadow-sm overflow-hidden flex items-center justify-center">
                      <Image
                        width={80}
                        height={80}
                        src="/logo.svg"
                        alt="Apex-Agent Logo"
                        className="object-contain rounded-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Apex-Agent
                  </h2>
                  <p className="text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
                    Your intelligent agent for seamless automation and
                    productivity
                  </p>
                </div>

                {/* Feature Badges */}
                <div className="flex flex-wrap gap-3 justify-center max-w-xs mx-auto">
                  <div className="inline-flex items-center px-3.5 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm">
                    AI Powered
                  </div>
                  <div className="inline-flex items-center px-3.5 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm">
                    Secure
                  </div>
                  <div className="inline-flex items-center px-3.5 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm">
                    Fast & Reliable
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <div className="text-center text-xs text-gray-400 mt-6">
          By clicking continue, you agree to our{" "}
          <Link
            href="/terms"
            className="text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-2"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-gray-500 hover:text-gray-900 transition-colors underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </div>
  );
};
