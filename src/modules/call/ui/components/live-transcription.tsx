"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Bot } from "lucide-react";
import { TranscriptEntry } from "@/hooks/use-speech-to-text";

interface Props {
  transcripts: TranscriptEntry[];
  isListening: boolean;
  onToggleListening: () => void;
}

export const LiveTranscription = ({
  transcripts,
  isListening,
  onToggleListening,
}: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  return (
    <div className="absolute top-16 left-4 w-72 h-[calc(100%-8rem)] bg-black/50 backdrop-blur-sm rounded-lg border border-white/10 flex flex-col overflow-hidden z-20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <h4 className="text-xs font-semibold text-white">Live Transcript</h4>
        <button
          onClick={onToggleListening}
          className={`p-1.5 rounded-full transition-colors ${
            isListening
              ? "bg-red-500/30 text-red-400"
              : "bg-white/10 text-white/50"
          }`}
        >
          {isListening ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-2"
      >
        {transcripts.length === 0 && (
          <p className="text-white/40 text-xs text-center">
            {isListening ? "Listening..." : "Tap mic to start"}
          </p>
        )}
        {transcripts.map((entry) => (
          <div
            key={entry.id}
            className="rounded-md p-2 bg-white/5"
          >
            <div className="flex items-center gap-1.5 mb-1">
              {entry.speaker === "user" ? (
                <Mic className="w-2.5 h-2.5 text-blue-400" />
              ) : entry.speaker === "ai" ? (
                <Bot className="w-2.5 h-2.5 text-green-400" />
              ) : null}
              <span
                className={`text-[10px] font-medium ${
                  entry.speaker === "user"
                    ? "text-blue-400"
                    : entry.speaker === "ai"
                    ? "text-green-400"
                    : "text-white/50"
                }`}
              >
                {entry.speaker === "user" ? "You" : entry.speaker === "ai" ? "AI" : "?"}
              </span>
            </div>
            <p className="text-xs text-white/80 leading-tight">{entry.text}</p>
          </div>
        ))}
      </div>

      {isListening && (
        <div className="px-3 py-1.5 border-t border-white/10 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
          </span>
          <span className="text-[10px] text-white/40">Recording</span>
        </div>
      )}
    </div>
  );
};