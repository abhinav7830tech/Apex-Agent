import { LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  Call,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  CallingState,

} from "@stream-io/video-react-sdk";

import { useTRPC } from "@/trpc/client";
import "@stream-io/video-react-sdk/dist/css/styles.css";

import { CallUI } from "./call-ui";

interface Props {
  meetingId: string
  meetingName: string
  userId: string
  userName: string
  userImage: string
}

export const CallConnect = ({
  meetingId,
  meetingName,
  userId,
  userName,
  userImage,
}: Props) => {
  const trpc = useTRPC();
  const { mutateAsync } = useMutation(
    trpc.meetings.generateToken.mutationOptions(),
  )
  const [client, setClient] = useState<StreamVideoClient>();
  useEffect(() => {
    const user = {
      id: String(userId),
      name: String(userName),
      image: userImage ? String(userImage) : undefined
    };

    const _client = new StreamVideoClient({
      apiKey: process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY!,
      user,
      tokenProvider: () => mutateAsync(),
    });

    setClient(_client);

    return () => {
      _client.disconnectUser();
    };
  }, [userId, userName, userImage]);

  const [call, setCall] = useState<Call>();
  useEffect(() => {
    if (!client) return;

    const call = client.call("default", meetingId);
    call.camera.disable();
    call.microphone.disable();
    setCall(call);

    return () => {
      if (call.state.callingState !== CallingState.LEFT) {
        call.leave();
        call.endCall();
        setCall(undefined);
      }
    };
  }, [client, meetingId]);

  if (!client || !call) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <LoaderIcon className="size-6 animate-spin text-white" />
      </div>
    );
  }
  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <CallUI meetingName={meetingName} />
      </StreamCall>
    </StreamVideo>
  )
}
