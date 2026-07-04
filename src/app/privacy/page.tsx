
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl bg-white border border-gray-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold text-gray-900">Privacy Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-gray-600">
                    <p>Last updated: {new Date().toLocaleDateString()}</p>
                    <p>
                        Your privacy is important to us. This Privacy Policy outlines how we collect, use, and share your personal information.
                    </p>
                    <h2 className="text-xl font-semibold text-gray-900 mt-4">1. Information We Collect</h2>
                    <p>
                        We collect information you provide directly to us, such as when you create an account, update your profile, or communicate with us.
                    </p>
                    <h2 className="text-xl font-semibold text-gray-900 mt-4">2. Use of Information</h2>
                    <p>
                        We use the information we collect to operate, maintain, and provide you with the features and functionality of the Service.
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
