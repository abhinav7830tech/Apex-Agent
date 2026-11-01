import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderIcon } from "lucide-react";

import { JoinView } from "@/modules/join/ui/views/join-view";

export const metadata: Metadata = {
  title: "Join meeting | Apex Agent",
  description: "Join an Apex Agent meeting as a guest.",
  robots: {
    index: false,
    follow: false,
  },
  // Invitation tokens live in the query string. Never leak them to third
  // parties through the Referer header.
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)]">
          <LoaderIcon className="size-8 animate-spin text-white" />
        </div>
      }
    >
      <JoinView meetingId={meetingId} />
    </Suspense>
  );
}
