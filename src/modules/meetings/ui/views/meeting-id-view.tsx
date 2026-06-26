'use client';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { LoadingState } from '@/components/loading-state';
import { CompletedState } from '../components/completed-state';
import { ErrorState } from '@/components/error-state';
import { MeetingIdViewHeader } from '../components/MeetingIdViewHeader';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/hooks/use-confirm';
import { UpdateMeetingDialog } from '../components/update-meeting-dialog';
import { useState } from 'react';
import { UpcomingState } from '../components/upcoming-state';
import { ActiveState } from '../components/active-state';
import { CancelledState } from '../components/cancelled-state';
import { ProcessingState } from '../components/processing-state';

interface Props {

  meetingId: string;
};

export const MeetingIdView = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [Reomveconfirmation, confirmRemove] = useConfirm(
    "are you sure",
    "This Action Can Be  Done!"

  );
  const [updateMeetingDialogOpen, setUpdateMeetingDialogOpen] = useState(false);

  const { data } = useSuspenseQuery(
    trpc.meetings.getOne.queryOptions({ id: meetingId })
  );
  const removeMeeting = useMutation(
    trpc.meetings.remove.mutationOptions({

      onSuccess: () => {
        // Redirect to meetings list after successful deletion
        queryClient.invalidateQueries(trpc.meetings.getMany.queryOptions({}));
        router.push("/meetings")
      },
      onError: (error) => {
        console.error('Failed to delete meeting:', error);
        // You might want to show an error toast here
      },
    }),
  )

  const handleRemoveMeeting = async () => {
    const ok = await confirmRemove();
    if (!ok) return;
    await removeMeeting.mutateAsync({ id: meetingId })
  };

  const isUpcoming = data.status === "upcoming";
  const isActive = data.status === "active";
  const isCompleted = data.status === "completed";
  const isProcessing = data.status === "processing";
  const isCancelled = data.status === "cancelled";


  return (
    <>
      <Reomveconfirmation />
      <UpdateMeetingDialog
        open={updateMeetingDialogOpen}
        onOpenChange={setUpdateMeetingDialogOpen}
        initialValues={data} />

      <div className='flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4'>
        <MeetingIdViewHeader
          meetingId={meetingId}
          meetingName={data.name}
          onEdit={() => setUpdateMeetingDialogOpen(true)}
          onRemove={handleRemoveMeeting} />

        {isUpcoming && (<UpcomingState
          meetingId={meetingId}
          onCancelMeeting={() => { }}
          isCancelling={false} />)}

        {isActive && (<ActiveState
          meetingId={meetingId} />

        )}
        {isCompleted && <CompletedState data={data} />}
        {isProcessing && <ProcessingState />}
        {isCancelled && <CancelledState />}
      </div>


    </>
  );
};


export const MeetingsViewLoading = () => {
  return (
    <LoadingState
      title="Loading Agents"
      description="This may take some time"
    />
  );
};

export const MeetingsViewError = () => {
  return (
    <ErrorState
      title="Error Loading Agents"
      description="Somethings went wrong"
    />
  );
};
export default MeetingIdView;