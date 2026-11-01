"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  LoaderIcon,
  LogInIcon,
  LogOutIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import {
  Call,
  CallControls,
  CallParticipantsList,
  CallingState,
  DefaultVideoPlaceholder,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  StreamVideoParticipant,
  ToggleAudioPreviewButton,
  ToggleVideoPreviewButton,
  useCall,
  useCallStateHooks,
  VideoPreview,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { GeneratedAvatarUri } from "@/lib/avatar";

interface Props {
  meetingId: string;
  meetingName: string;
  hostName: string;
  userId: string;
  userName: string;
  userImage: string;
  streamToken: string;
  inviteToken: string;
  onExit: () => void;
}

export const GuestCall = ({
  meetingId,
  meetingName,
  hostName,
  userId,
  userName,
  userImage,
  streamToken,
  inviteToken,
  onExit,
}: Props) => {
  const trpc = useTRPC();
  const refreshToken = useMutation(
    trpc.meetings.guestRefreshToken.mutationOptions(),
  );
  const { mutateAsync: refreshGuestToken } = refreshToken;

  const [client, setClient] = useState<StreamVideoClient>();
  const [call, setCall] = useState<Call>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let videoClient: StreamVideoClient | undefined;
    let videoCall: Call | undefined;

    try {
      videoClient = new StreamVideoClient({
        apiKey: process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY!,
        user: {
          id: String(userId),
          name: String(userName),
          image: userImage ? String(userImage) : undefined,
        },
        token: streamToken,
        tokenProvider: async () => {
          const result = await refreshGuestToken({
            meetingId,
            token: inviteToken,
            guestId: userId,
          });
          return result.streamToken;
        },
      });

      videoCall = videoClient.call("default", meetingId);
      videoCall.camera.disable();
      videoCall.microphone.disable();
    } catch (cause) {
      console.error("Failed to initialise the guest video client", cause);
      if (active) {
        setError(
          "Could not connect to the video service. Refresh the page and try again.",
        );
      }
      return;
    }

    setClient(videoClient);
    setCall(videoCall);

    return () => {
      active = false;
      if (videoCall && videoCall.state.callingState !== CallingState.LEFT) {
        void videoCall.leave().catch(() => undefined);
      }
      void videoClient?.disconnectUser().catch(() => undefined);
    };
  }, [
    meetingId,
    userId,
    userName,
    userImage,
    streamToken,
    inviteToken,
    refreshGuestToken,
  ]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)] p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <AlertCircleIcon className="mx-auto size-10 text-red-500" />
          <h1 className="mt-4 text-lg font-bold text-gray-900">
            Could not join the call
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-5" onClick={onExit}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!client || !call) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)]">
        <div className="flex flex-col items-center gap-3 text-white">
          <LoaderIcon className="size-8 animate-spin" />
          <p className="text-sm text-white/80">Connecting to the meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <GuestCallUI
          meetingName={meetingName}
          hostName={hostName}
          userName={userName}
          userImage={userImage}
          onExit={onExit}
        />
      </StreamCall>
    </StreamVideo>
  );
};

const GuestCallUI = ({
  meetingName,
  hostName,
  userName,
  userImage,
  onExit,
}: {
  meetingName: string;
  hostName: string;
  userName: string;
  userImage: string;
  onExit: () => void;
}) => {
  const call = useCall();
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (
      joined &&
      (callingState === CallingState.LEFT ||
        callingState === CallingState.OFFLINE ||
        callingState === CallingState.RECONNECTING_FAILED)
    ) {
      onExit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, joined]);

  const handleJoin = async () => {
    if (!call) return;
    setJoinError(null);
    try {
      await call.join();
      setJoined(true);
    } catch (error) {
      console.error("Failed to join the guest call", error);
      setJoinError(
        "Could not join the meeting. It may have ended, or your invitation may have expired. Ask the host for a new link.",
      );
    }
  };

  const handleLeave = async () => {
    try {
      if (call && call.state.callingState !== CallingState.LEFT) {
        await call.leave();
      }
    } catch (error) {
      console.error("Error leaving call", error);
    } finally {
      onExit();
    }
  };

  return (
    <StreamTheme className="h-screen">
      {!joined ? (
        <GuestLobby
          meetingName={meetingName}
          hostName={hostName}
          userName={userName}
          userImage={userImage}
          joinError={joinError}
          onJoin={handleJoin}
          onCancel={handleLeave}
        />
      ) : (
        <GuestActive
          meetingName={meetingName}
          hostName={hostName}
          onLeave={handleLeave}
        />
      )}
    </StreamTheme>
  );
};

const GuestLobby = ({
  meetingName,
  hostName,
  userName,
  userImage,
  joinError,
  onJoin,
  onCancel,
}: {
  meetingName: string;
  hostName: string;
  userName: string;
  userImage: string;
  joinError: string | null;
  onJoin: () => void;
  onCancel: () => void;
}) => {
  const { useCameraState, useMicrophoneState } = useCallStateHooks();
  const { hasBrowserPermission: hasMicPermission } = useMicrophoneState();
  const { hasBrowserPermission: hasCameraPermission } = useCameraState();
  const hasBrowserMediaPermission = hasCameraPermission && hasMicPermission;
  const [joining, setJoining] = useState(false);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)] p-4 sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl sm:p-10">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Guest access
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {meetingName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hosted by {hostName}
          </p>
        </div>

        <VideoPreview
          DisabledVideoPreview={
            hasBrowserMediaPermission
              ? () => (
                  <DefaultVideoPlaceholder
                    participant={
                      {
                        name: userName,
                        image:
                          userImage ||
                          GeneratedAvatarUri({ seed: userName, variant: "initials" }),
                      } as StreamVideoParticipant
                    }
                  />
                )
              : () => (
                  <p className="p-4 text-center text-sm">
                    Allow camera and microphone access in your browser to join
                    with audio and video.
                  </p>
                )
          }
        />

        <div className="mt-4 flex justify-center gap-2">
          <ToggleAudioPreviewButton />
          <ToggleVideoPreviewButton />
        </div>

        {joinError && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <p>{joinError}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onCancel} disabled={joining}>
            <LogOutIcon className="mr-2 size-4" />
            Leave
          </Button>
          <Button
            onClick={async () => {
              setJoining(true);
              try {
                await onJoin();
              } finally {
                setJoining(false);
              }
            }}
            disabled={joining}
          >
            {joining ? (
              <LoaderIcon className="mr-2 size-4 animate-spin" />
            ) : (
              <LogInIcon className="mr-2 size-4" />
            )}
            {joining ? "Joining..." : "Join meeting"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const GuestActive = ({
  meetingName,
  hostName,
  onLeave,
}: {
  meetingName: string;
  hostName: string;
  onLeave: () => void;
}) => {
  const [showParticipants, setShowParticipants] = useState(false);
  const { useParticipantCount } = useCallStateHooks();
  const participantCount = useParticipantCount();

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-[#19232d] px-4 py-2">
        <VideoIcon className="size-4 text-emerald-400" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">{meetingName}</p>
          <p className="text-xs text-white/60">Host: {hostName}</p>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-20">
        <Button
          variant="secondary"
          onClick={() => setShowParticipants((value) => !value)}
        >
          <UsersIcon className="mr-2 size-4" />
          {participantCount}
        </Button>
      </div>

      <div className="flex h-full w-full items-center justify-center">
        <SpeakerLayout participantsBarPosition="bottom" />
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <div className="rounded-full bg-[#19232d] px-2 py-1">
          <CallControls onLeave={onLeave} />
        </div>
      </div>

      {showParticipants && (
        <div className="absolute bottom-24 right-4 top-20 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[#19232d]">
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      )}
    </div>
  );
};
