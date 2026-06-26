
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden text-white">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-purple-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-blue-500/10 rounded-full blur-3xl"></div>
            </div>

            <Card className="w-full max-w-4xl backdrop-blur-xl bg-white/5 border-white/10 shadow-2xl z-10">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Privacy Policy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-gray-300">
                    <p>Last updated: {new Date().toLocaleDateString()}</p>
                    <p>
                        Your privacy is important to us. This Privacy Policy outlines how we collect, use, and share your personal information.
                    </p>
                    <h2 className="text-xl font-semibold text-white mt-4">1. Information We Collect</h2>
                    <p>
                        We collect information you provide directly to us, such as when you create an account, update your profile, or communicate with us.
                    </p>
                    <h2 className="text-xl font-semibold text-white mt-4">2. Use of Information</h2>
                    <p>
                        We use the information we collect to operate, maintain, and provide you with the features and functionality of the Service.
                    </p>
                    <div className="pt-6">
                        <Link href="/sign-in">
                            <Button className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white">
                                Back to Sign In
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
