import { LogInIcon } from "lucide-react";
import Link from "next/link";
import {
  DefaultVideoPlaceholder,
  StreamVideoParticipant,
  ToggleAudioPreviewButton,
  ToggleVideoPreviewButton,
  useCallStateHooks,
  VideoPreview,
} from "@stream-io/video-react-sdk";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { GeneratedAvatarUri } from "@/lib/avatar";
import "@stream-io/video-react-sdk/dist/css/styles.css";

interface Props {
  onJoin: () => void;
}

const DisableVideoPreview = () => {
  const { data } = authClient.useSession();

  return (
    <DefaultVideoPlaceholder
      participant={{
        name: data?.user?.name || "",
        image:
          data?.user?.image ||
          GeneratedAvatarUri({
            seed: data?.user?.name ?? "",
            variant: "initials",
          }),
      } as StreamVideoParticipant}
    />
  );
};

const AllowBrowserPermission = () => {
  return (
    <p className="text-sm">
      pls Grant your permission to acess your camrea and microphone.
    </p>
  );
};

export const CallLobby = ({ onJoin }: Props) => {
  const { useCameraState, useMicrophoneState } = useCallStateHooks();

  const { hasBrowserPermission: hasMicPermission } = useMicrophoneState();
  const { hasBrowserPermission: hasCameraPermission } = useCameraState();

  const hasBrowserMediaPermission = hasCameraPermission && hasMicPermission;

  return (
    <div className="flex flex-col justify-center items-center min-h-screen w-full bg-[radial-gradient(circle,_#0F5A44,_#062E24)]">
      <div className="w-full max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center gap-y-8 bg-white rounded-xl p-12 shadow-lg w-full">
          <div className="flex flex-col gap-y-2 text-center">
            <h6 className="text-2xl font-bold text-gray-800">
              Ready to join?
            </h6>
            <p className="text-gray-600">
              Set up your call before joining
            </p>
          </div>

          <VideoPreview
            DisabledVideoPreview={
              hasBrowserMediaPermission
                ? DisableVideoPreview
                : AllowBrowserPermission
            }
          />
          <div className="flex gap-x-2">
          <ToggleAudioPreviewButton/>
          <ToggleVideoPreviewButton/>
          </div>
          <div className="flex gap-x-2 justify-between w-full">
           <Button asChild variant="ghost">
            <Link href="/meetings">
              Cancel
            </Link>
           </Button>
           <Button onClick={onJoin}>
            <LogInIcon className="mr-2 h-4 w-4" />
            Join Call 
           </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
