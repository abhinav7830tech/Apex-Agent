import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { StreamTheme, useCall } from "@stream-io/video-react-sdk";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
  meetingId: string;
  meetingName: string;
}

export const CallUI = ({ meetingId, meetingName }: Props) => {
  const call = useCall();
  const trpc = useTRPC();
  const endMeeting = useMutation(trpc.meetings.end.mutationOptions());
  const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");
  const [endedForAll, setEndedForAll] = useState(false);

  const handleJoin = async () => {
    if (!call) return;

    try {
      await call.join();
      setShow("call");
    } catch (error) {
      console.error("Failed to join call", error);
      toast.error("Could not join the call. Please refresh and try again.");
    }
  };

  const handleLeave = async () => {
    try {
      if (call && call.state.callingState !== "left") {
        await call.leave();
      }
    } catch (error) {
      console.error("Error leaving call:", error);
    } finally {
      setShow("ended");
    }
  };

  const handleEndForAll = async () => {
    try {
      await endMeeting.mutateAsync({ id: meetingId });
      setEndedForAll(true);
      toast.success("Meeting ended. Apex Agent is processing the transcript.");
    } catch (error) {
      console.error("Failed to end meeting", error);
      toast.error("Could not end the meeting. Please try again.");
      return;
    }

    try {
      if (call && call.state.callingState !== "left") {
        await call.leave();
      }
    } catch (error) {
      console.error("Error leaving call after ending it:", error);
    } finally {
      setShow("ended");
    }
  };

  return (
    <StreamTheme className="h-full">
      {show === "lobby" && <CallLobby onJoin={handleJoin} />}
      {show === "call" && (
        <CallActive
          onLeave={handleLeave}
          onEnd={handleEndForAll}
          isEnding={endMeeting.isPending}
          meetingName={meetingName}
        />
      )}
      {show === "ended" && <CallEnded endedForAll={endedForAll} />}
    </StreamTheme>
  );
};
