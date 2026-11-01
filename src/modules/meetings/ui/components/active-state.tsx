import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneOffIcon, UserPlusIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/client";

interface Props {
  meetingId: string;
  onInvite: () => void;
}

export const ActiveState = ({ meetingId, onInvite }: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const endMeeting = useMutation(
    trpc.meetings.end.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.meetings.getOne.queryKey({ id: meetingId }),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.meetings.getMany.queryKey({}),
        });
        toast.success("Meeting ended. Apex Agent is processing the transcript.");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <div className="bg-white rounded-lg px-4 py-5 flex flex-col gap-y-8 items-center">
      <EmptyState
        image="/upcoming.svg"
        title="Meeting is active"
        description="Join the call or end it for everyone when the discussion is finished."
      />
      <div className="flex flex-col-reverse lg:flex-row lg:justify-center items-center gap-2 w-full">
        <Button
          variant="destructive"
          className="w-full lg:w-auto"
          onClick={() => endMeeting.mutate({ id: meetingId })}
          disabled={endMeeting.isPending}
        >
          <PhoneOffIcon className="mr-2 size-4" />
          {endMeeting.isPending ? "Ending..." : "End Meeting"}
        </Button>
        <Button
          variant="outline"
          className="w-full lg:w-auto"
          onClick={onInvite}
        >
          <UserPlusIcon className="mr-2 size-4" />
          Invite Guests
        </Button>
        <Button asChild className="w-full lg:w-auto">
          <Link href={`/call/${meetingId}`}>
            <VideoIcon className="mr-2 size-4" />
            Join Meeting
          </Link>
        </Button>
      </div>
    </div>
  );
};
