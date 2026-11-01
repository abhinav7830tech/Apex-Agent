import Link from "next/link";
import {
  BanIcon,
  ClockIcon,
  UserPlusIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MeetingGetOne } from "../../types";
import { formatMeetingWindow } from "../../utils";

interface Props {
  meeting: MeetingGetOne;
  onCancelMeeting: () => void;
  onInvite: () => void;
  isCancelling: boolean;
}

export const UpcomingState = ({
  meeting,
  onCancelMeeting,
  onInvite,
  isCancelling,
}: Props) => {
  return (
    <div className="bg-white rounded-lg px-4 py-6 flex flex-col gap-y-6">
      <EmptyState
        image="/upcoming.svg"
        title="Not started yet"
        description="Join at the scheduled time. The AI agent will attend, transcribe, and summarize the meeting."
      />

      <div className="mx-auto w-full max-w-xl rounded-xl border border-border/60 bg-muted/20 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon className="size-4 text-primary" />
          {formatMeetingWindow(meeting.scheduledAt, meeting.durationMinutes)}
        </div>

        {meeting.timezone && (
          <p className="text-xs text-muted-foreground">
            Timezone: {meeting.timezone}
          </p>
        )}

        {meeting.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {meeting.description}
          </p>
        )}

        {meeting.participants && meeting.participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <UsersIcon className="size-4 text-muted-foreground" />
            {meeting.participants.map((participant) => (
              <Badge key={participant} variant="secondary" className="font-normal">
                {participant}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse lg:flex-row lg:justify-center items-center gap-2 w-full">
        <Button
          variant="secondary"
          className="w-full lg:w-auto"
          onClick={onCancelMeeting}
          disabled={isCancelling}
        >
          <BanIcon className="mr-2 size-4" />
          {isCancelling ? "Cancelling..." : "Cancel Meeting"}
        </Button>
        <Button
          variant="outline"
          className="w-full lg:w-auto"
          onClick={onInvite}
        >
          <UserPlusIcon className="mr-2 size-4" />
          Invite Guests
        </Button>
        <Button disabled={isCancelling} asChild className="w-full lg:w-auto">
          <Link href={`/call/${meeting.id}`}>
            <VideoIcon className="mr-2 size-4" />
            Start Meeting
          </Link>
        </Button>
      </div>
    </div>
  );
};
