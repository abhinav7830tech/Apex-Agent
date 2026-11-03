"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { useTRPC } from "@/trpc/client";
import { MeetingGetOne } from "../../types";

// Matches the UI expectation of "a few minutes". The backend worker polls Stream
// for ~19 minutes, so after this point a retry is safe and useful.
const STALE_PROCESSING_MS = 15 * 60 * 1000;

interface Props {
  meeting: MeetingGetOne;
}

export const ProcessingState = ({ meeting }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const updatedAt = new Date(meeting.updatedAt).getTime();
    setIsStale(
      Number.isFinite(updatedAt) &&
        Date.now() - updatedAt > STALE_PROCESSING_MS,
    );
  }, [meeting.updatedAt]);

  const retryAnalysis = useMutation(
    trpc.meetings.retryAnalysis.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.meetings.getOne.queryKey({ id: meeting.id }),
        });
        toast.success("Analysis restarted. This can take a few minutes.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="bg-white rounded-lg px-4 py-5 flex flex-col items-center gap-y-2">
      <EmptyState
        image="/processing.svg"
        title="Meeting completed"
        description="This meeting was completed. The AI summary will appear here shortly."
      />

      {isStale && (
        <div className="flex max-w-xl flex-col items-center gap-y-3 pb-8 text-center">
          <div className="flex items-center gap-x-2 text-sm font-medium text-amber-600">
            <TriangleAlertIcon className="size-4" />
            This is taking longer than expected.
          </div>
          <p className="text-xs text-muted-foreground">
            {meeting.analysisError ||
              "Apex Agent is still waiting for the transcript or the AI summary. You can retry the analysis, or verify that Stream recording and transcription were enabled during the call."}
          </p>
          <Button
            variant="outline"
            onClick={() => retryAnalysis.mutate({ id: meeting.id })}
            disabled={retryAnalysis.isPending}
          >
            <RefreshCwIcon className="mr-2 size-4" />
            {retryAnalysis.isPending ? "Retrying..." : "Retry Analysis"}
          </Button>
        </div>
      )}
    </div>
  );
};
