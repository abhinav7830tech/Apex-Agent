import Link from "next/link";

import { Button } from "@/components/ui/button";
import "@stream-io/video-react-sdk/dist/css/styles.css";

interface Props {
  endedForAll?: boolean;
}

export const CallEnded = ({ endedForAll = false }: Props) => {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen w-full bg-[radial-gradient(circle,_#0F5A44,_#062E24)]">
      <div className="w-full max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center gap-y-8 bg-white rounded-xl p-12 shadow-lg w-full">
          <div className="flex flex-col gap-y-2 text-center">
            <h6 className="text-2xl font-bold text-gray-800">
              {endedForAll ? "Meeting ended" : "You left the meeting"}
            </h6>
            <p className="text-gray-600">
              {endedForAll
                ? "The transcript is being processed. The AI summary will appear on the meeting page when it is ready."
                : "The meeting is still running for other participants. You can rejoin from the meeting page."}
            </p>
          </div>
          <Button asChild>
            <Link href="/meetings">Back to meetings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
