
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl bg-white border border-gray-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold text-gray-900">Terms of Service</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-gray-600">
                    <p>Last updated: {new Date().toLocaleDateString()}</p>
                    <p>
                        Welcome to Apex-Agent. By accessing our website, you agree to these Terms of Service.
                    </p>
                    <h2 className="text-xl font-semibold text-gray-900 mt-4">1. Usage</h2>
                    <p>
                        You agree to use our services only for lawful purposes and in accordance with these Terms.
                    </p>
                    <h2 className="text-xl font-semibold text-gray-900 mt-4">2. Account</h2>
                    <p>
                        You are responsible for maintaining the confidentiality of your account and password.
                    </p>
                    <div className="pt-6">
                        <Link href="/sign-in">
                            <Button className="bg-green-500 hover:bg-green-600 text-white font-medium px-4 py-2 rounded-lg shadow-md shadow-green-100">
                                Back to Sign In
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
