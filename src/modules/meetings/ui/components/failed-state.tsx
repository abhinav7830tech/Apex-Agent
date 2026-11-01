"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";
import { MeetingGetOne } from "../../types";

interface Props {
  meeting: MeetingGetOne;
  onEdit: () => void;
}

export const FailedState = ({ meeting, onEdit }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

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
    <div className="bg-white rounded-lg px-4 py-8 flex flex-col items-center gap-y-6 text-center">
      <div className="rounded-full bg-rose-50 p-4">
        <AlertTriangleIcon className="size-8 text-rose-500" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Meeting analysis failed</h3>
        <p className="text-sm text-muted-foreground max-w-xl">
          {meeting.analysisError ||
            "Apex Agent could not analyze this meeting. Retry the analysis or update the meeting details."}
        </p>
        {!meeting.transcriptUrl && !meeting.transcript && (
          <p className="text-xs text-muted-foreground max-w-xl">
            No transcript has been delivered yet. Verify that Stream recording and
            transcription were enabled during the call.
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={() => retryAnalysis.mutate({ id: meeting.id })}
          disabled={retryAnalysis.isPending}
        >
          <RefreshCwIcon className="mr-2 size-4" />
          {retryAnalysis.isPending ? "Retrying..." : "Retry Analysis"}
        </Button>
        <Button variant="outline" onClick={onEdit}>
          <PencilIcon className="mr-2 size-4" />
          Edit Meeting
        </Button>
      </div>
    </div>
  );
};
