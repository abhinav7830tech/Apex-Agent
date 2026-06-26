import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import {
  CallControls,
  SpeakerLayout,
} from "@stream-io/video-react-sdk";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { LiveTranscription } from "./live-transcription";

interface Props {
  onLeave: () => void;
  meetingName: string;
}

export const CallActive = ({ onLeave, meetingName }: Props) => {
  const { isListening, transcripts, toggleListening, startListening } = useSpeechToText();

  useEffect(() => {
    const timer = setTimeout(() => {
      startListening();
    }, 1500);
    return () => clearTimeout(timer);
  }, [startListening]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#19232d] px-4 py-2 rounded-lg border border-[#19232d]">
        <Link href="/" className="flex items-center justify-center bg-white/10 rounded-full p-1">
          <Image src="/logo.svg" width={32} height={32} alt="logo" className="rounded-full" />
        </Link>
        <h4 className="text-sm font-semibold">
          {meetingName}
        </h4>
      </div>
      <LiveTranscription
        transcripts={transcripts}
        isListening={isListening}
        onToggleListening={toggleListening}
      />
      <div className="flex h-full w-full items-center justify-center">
        <SpeakerLayout participantsBarPosition="bottom" />
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-[#19232d] rounded-full px-2 py-1">
        <CallControls onLeave={onLeave} />
      </div>
    </div>
  );
};
