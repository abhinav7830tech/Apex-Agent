import { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

export type MeetingGetOne = inferRouterOutputs<AppRouter>["meetings"]["getOne"];
export type MeetingGetMany = inferRouterOutputs<AppRouter>["meetings"]["getMany"]["items"];
export type MeetingGetInvite = inferRouterOutputs<AppRouter>["meetings"]["getInvite"];
export type GuestJoinResult = inferRouterOutputs<AppRouter>["meetings"]["guestJoin"];

export enum MeetingStatus {
  SCHEDULED = "scheduled",
  UPCOMING = "upcoming",
  ACTIVE = "active",
  COMPLETED = "completed",
  PROCESSING = "processing",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export type StreamTranscriptItem = {
  speaker_id: string;
  type: string;
  text: string;
  start_ts: number;
  stop_ts?: number;
  end_ts?: number;
  // Stream has historically used both spellings in their docs.
  shop_ts?: number;
};

export type MeetingActionItem = {
  task: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high";
  completed?: boolean;
};

export type MeetingHighlight = {
  title: string;
  description: string;
  timestamp?: string;
};

export type MeetingAiAnalysis = {
  summary: string;
  detailedSummary: string;
  keyTopics: string[];
  keyDecisions: string[];
  actionItems: MeetingActionItem[];
  unresolvedQuestions: string[];
  sentiment: "Positive" | "Neutral" | "Negative";
  highlights: MeetingHighlight[];
  followUpRecommendations: string[];
};
