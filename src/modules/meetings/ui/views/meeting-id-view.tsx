"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { LoadingState } from "@/components/loading-state";
import { ErrorState } from "@/components/error-state";
import { useConfirm } from "@/hooks/use-confirm";
import { MeetingIdViewHeader } from "../components/MeetingIdViewHeader";
import { CompletedState } from "../components/completed-state";
import { UpdateMeetingDialog } from "../components/update-meeting-dialog";
import { InviteGuestsDialog } from "../components/invite-guests-dialog";
import { UpcomingState } from "../components/upcoming-state";
import { ActiveState } from "../components/active-state";
import { CancelledState } from "../components/cancelled-state";
import { ProcessingState } from "../components/processing-state";
import { FailedState } from "../components/failed-state";
import { MeetingStatus } from "../../types";

interface Props {
  meetingId: string;
}

export const MeetingIdView = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [RemoveConfirmation, confirmRemove] = useConfirm(
    "Delete this meeting?",
    "This permanently deletes the meeting, its transcript, and its AI summary.",
  );
  const [updateMeetingDialogOpen, setUpdateMeetingDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const { data } = useSuspenseQuery(
    trpc.meetings.getOne.queryOptions(
      { id: meetingId },
      {
        refetchInterval: (query) =>
          query.state.data?.status === MeetingStatus.PROCESSING ? 3000 : false,
      },
    ),
  );

  const invalidateMeeting = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.meetings.getOne.queryKey({ id: meetingId }),
    });
    await queryClient.invalidateQueries({
      queryKey: trpc.meetings.getMany.queryKey({}),
    });
  };

  const removeMeeting = useMutation(
    trpc.meetings.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.meetings.getMany.queryKey({}),
        });
        toast.success("Meeting deleted.");
        router.push("/meetings");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const cancelMeeting = useMutation(
    trpc.meetings.cancel.mutationOptions({
      onSuccess: async () => {
        await invalidateMeeting();
        toast.success("Meeting cancelled.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const handleRemoveMeeting = async () => {
    const ok = await confirmRemove();
    if (!ok) return;
    await removeMeeting.mutateAsync({ id: meetingId });
  };

  const isScheduled =
    data.status === MeetingStatus.SCHEDULED ||
    data.status === MeetingStatus.UPCOMING;
  const isActive = data.status === MeetingStatus.ACTIVE;
  const isCompleted = data.status === MeetingStatus.COMPLETED;
  const isProcessing = data.status === MeetingStatus.PROCESSING;
  const isCancelled = data.status === MeetingStatus.CANCELLED;
  const isFailed = data.status === MeetingStatus.FAILED;
  const canEdit = !isActive && !isProcessing;

  return (
    <>
      <RemoveConfirmation />
      <UpdateMeetingDialog
        open={updateMeetingDialogOpen}
        onOpenChange={setUpdateMeetingDialogOpen}
        initialValues={data}
      />
      <InviteGuestsDialog
        meetingId={meetingId}
        meetingTitle={data.name}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
      />

      <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
        <MeetingIdViewHeader
          meetingId={meetingId}
          meetingName={data.name}
          onEdit={() => setUpdateMeetingDialogOpen(true)}
          onRemove={handleRemoveMeeting}
          canEdit={canEdit}
        />

        {isScheduled && (
          <UpcomingState
            meeting={data}
            onCancelMeeting={() => cancelMeeting.mutate({ id: meetingId })}
            onInvite={() => setInviteDialogOpen(true)}
            isCancelling={cancelMeeting.isPending}
          />
        )}

        {isActive && (
          <ActiveState
            meetingId={meetingId}
            onInvite={() => setInviteDialogOpen(true)}
          />
        )}
        {isCompleted && <CompletedState data={data} />}
        {isProcessing && <ProcessingState />}
        {isCancelled && <CancelledState />}
        {isFailed && (
          <FailedState
            meeting={data}
            onEdit={() => setUpdateMeetingDialogOpen(true)}
          />
        )}
      </div>
    </>
  );
};

export const MeetingsViewLoading = () => {
  return (
    <LoadingState title="Loading Meeting" description="This may take some time" />
  );
};

export const MeetingsViewError = () => {
  return (
    <ErrorState
      title="Error Loading Meeting"
      description="Something went wrong"
    />
  );
};

export default MeetingIdView;
