import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const Page = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1a3d2e]">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Talk time, meeting outcomes and workspace activity.
        </p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
};

export default Page;
