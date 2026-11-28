import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { AccountSettingsForm } from "@/modules/dashboard/ui/account-settings-form";
import { ArrowLeftIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f9] p-4 md:p-8">
      <section className="mx-auto w-full max-w-xl space-y-6">
        <Button asChild variant="outline">
          <Link href="/"><ArrowLeftIcon /> Back to dashboard</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle><h2>Profile</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <AccountSettingsForm name={session.user.name} email={session.user.email} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
