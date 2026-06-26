"use client";

import { useCallback, useRef, useState } from "react";

export interface TranscriptEntry {
  id: string;
  speaker: "user" | "ai" | "unknown";
  text: string;
  timestamp: number;
}

export interface UseSpeechToTextResult {
  isListening: boolean;
  transcript: string;
  transcripts: TranscriptEntry[];
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  addAiTranscript: (text: string) => void;
}

export const useSpeechToText = (): UseSpeechToTextResult => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    if (recognitionRef.current) return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.error("Speech Recognition API not supported");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        setTranscripts((prev) => [
          ...prev,
          {
            id: generateId(),
            speaker: "user",
            text: finalTranscript,
            timestamp: Date.now(),
          },
        ]);
      } else {
        setTranscript(interimTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (e) {
      console.warn("Failed to start speech recognition:", e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setTranscript("");
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const addAiTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    setTranscripts((prev) => [
      ...prev,
      {
        id: generateId(),
        speaker: "ai",
        text: text.trim(),
        timestamp: Date.now(),
      },
    ]);
  }, []);

  return {
    isListening,
    transcript,
    transcripts,
    startListening,
    stopListening,
    toggleListening,
    addAiTranscript,
  };
};

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}