"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PhoneOff, ShieldCheck, Users } from "lucide-react";
import {
  CallControls,
  CallParticipantsList,
  SpeakerLayout,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { Button } from "@/components/ui/button";
import { LiveTranscription } from "./live-transcription";

interface Props {
  meetingId: string;
  onLeave: () => void;
  onEnd: () => void;
  isEnding: boolean;
  meetingName: string;
}

const useMeetingDuration = () => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export const CallActive = ({
  meetingId,
  onLeave,
  onEnd,
  isEnding,
  meetingName,
}: Props) => {
  const duration = useMeetingDuration();
  const { isListening, transcripts, toggleListening } = useSpeechToText();
  const { useParticipantCount } = useCallStateHooks();
  const [showParticipants, setShowParticipants] = useState(false);
  const participantCount = useParticipantCount();

  return (
    <div className="w-full h-full relative overflow-hidden bg-black text-white">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#19232d] px-4 py-2 rounded-lg border border-[#19232d]">
        <Link
          href="/"
          className="flex items-center justify-center bg-white/10 rounded-full p-1"
        >
          <Image
            src="/logo.svg"
            width={32}
            height={32}
            alt="logo"
            className="rounded-full"
          />
        </Link>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold">{meetingName}</h4>
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-medium">
              <ShieldCheck className="size-3" /> Host
            </span>
          </div>
          <span className="text-[11px] text-white/60 font-mono">ID: {meetingId}</span>
        </div>
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-white/20 text-xs text-emerald-400 font-mono">
          <span className="size-2 rounded-full bg-red-500 animate-pulse" />
          {duration}
        </div>
      </div>
      <div className="absolute top-4 right-4 z-20">
        <Button
          variant="secondary"
          onClick={() => setShowParticipants((value) => !value)}
        >
          <Users className="mr-2 h-4 w-4" />
          {participantCount}
        </Button>
      </div>
      {showParticipants && (
        <div className="absolute bottom-24 right-4 top-20 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-[#19232d]">
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      )}
      <LiveTranscription
        transcripts={transcripts}
        isListening={isListening}
        onToggleListening={toggleListening}
      />
      <div className="flex h-full w-full items-center justify-center">
        <SpeakerLayout participantsBarPosition="bottom" />
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
        <div className="bg-[#19232d] rounded-full px-2 py-1">
          <CallControls onLeave={onLeave} />
        </div>
        <Button
          variant="destructive"
          onClick={onEnd}
          disabled={isEnding}
          title="End the meeting for everyone"
        >
          <PhoneOff className="mr-2 h-4 w-4" />
          {isEnding ? "Ending..." : "End for all"}
        </Button>
      </div>
    </div>
  );
};
