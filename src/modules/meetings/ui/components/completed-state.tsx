"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import {
  BookOpenTextIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  ClockFadingIcon,
  FileTextIcon,
  FileVideoIcon,
  LightbulbIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDuration } from "@/lib/utils";
import {
  MeetingActionItem,
  MeetingGetOne,
  MeetingHighlight,
} from "../../types";

interface Props {
  data: MeetingGetOne;
}

type DisplayTranscriptItem = {
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
};

const formatTimestamp = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const safeJsonParse = (value: string | null | undefined): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeTranscript = (
  raw: unknown,
  fallbackAgentId: string,
  fallbackAgentName: string,
): DisplayTranscriptItem[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const text = String(item.text ?? "").trim();
      if (!text) return null;

      const speakerId = String(item.speakerId ?? item.speaker_id ?? "unknown");
      const speakerNameRaw = String(item.speakerName ?? "").trim();
      const speakerName =
        speakerNameRaw && speakerNameRaw !== "Unknown"
          ? speakerNameRaw
          : speakerId === fallbackAgentId
            ? fallbackAgentName
            : "Participant";

      const startMs = Math.max(
        0,
        Number(item.startMs ?? item.start_ts ?? 0) || 0,
      );
      const endMs = Math.max(
        startMs,
        Number(item.endMs ?? item.stop_ts ?? item.end_ts ?? item.shop_ts ?? startMs) ||
          startMs,
      );

      return { speakerId, speakerName, text, startMs, endMs };
    })
    .filter((item): item is DisplayTranscriptItem => item !== null);
};

const parseTranscriptText = (
  raw: string,
  agentId: string,
  agentName: string,
) => {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parsedJson = safeJsonParse(trimmed);
  if (parsedJson) return normalizeTranscript(parsedJson, agentId, agentName);

  const objects: unknown[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const parsedLine = safeJsonParse(line);
    if (parsedLine) objects.push(parsedLine);
  }

  return normalizeTranscript(objects, agentId, agentName);
};

const parseActionItems = (raw: string | null): MeetingActionItem[] => {
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry): MeetingActionItem | null => {
      if (typeof entry === "string") {
        const task = entry.trim();
        return task ? { task } : null;
      }
      if (!entry || typeof entry !== "object") return null;

      const item = entry as Record<string, unknown>;
      const task = String(item.task ?? item.title ?? "").trim();
      if (!task) return null;

      return {
        task,
        description: item.description ? String(item.description) : undefined,
        assignedTo: item.assignedTo ? String(item.assignedTo) : undefined,
        dueDate: item.dueDate ? String(item.dueDate) : undefined,
        priority:
          item.priority === "low" ||
          item.priority === "medium" ||
          item.priority === "high"
            ? item.priority
            : undefined,
        completed: Boolean(item.completed),
      } satisfies MeetingActionItem;
    })
    .filter((item): item is MeetingActionItem => item !== null);
};

const parseHighlights = (raw: string | null): MeetingHighlight[] => {
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (typeof entry === "string") {
        return { title: entry.trim(), description: "" } satisfies MeetingHighlight;
      }
      if (!entry || typeof entry !== "object") return null;

      const item = entry as Record<string, unknown>;
      const title = String(item.title ?? "").trim();
      if (!title) return null;

      return {
        title,
        description: String(item.description ?? "").trim(),
        timestamp: item.timestamp ? String(item.timestamp) : undefined,
      } satisfies MeetingHighlight;
    })
    .filter((item): item is MeetingHighlight => item !== null);
};

const parseTalkTime = (raw: string | null) => {
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [] as { speaker: string; seconds: number; percent: number }[];
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
    .map(([speaker, value]) => ({
      speaker,
      seconds: Math.max(0, Number(value) || 0),
    }))
    .filter((entry) => entry.seconds > 0);

  const total = entries.reduce((sum, entry) => sum + entry.seconds, 0);

  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((entry.seconds / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);
};

const getLegacySummary = (raw: string | null) => {
  if (!raw) return { summary: "", detailedSummary: "" };

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = safeJsonParse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        summary: String(record.summary ?? "").trim() || raw,
        detailedSummary: String(record.detailedSummary ?? "").trim(),
      };
    }
  }

  return { summary: raw, detailedSummary: "" };
};

export const CompletedState = ({ data }: Props) => {
  const legacy = useMemo(() => getLegacySummary(data.summary), [data.summary]);
  const summary = data.detailedSummary ? data.summary : legacy.summary;
  const detailedSummary = data.detailedSummary ?? legacy.detailedSummary;
  const actionItems = useMemo(
    () => parseActionItems(data.actionItems),
    [data.actionItems],
  );
  const highlights = useMemo(
    () => parseHighlights(data.highlights),
    [data.highlights],
  );
  const talkTime = useMemo(
    () => parseTalkTime(data.talkTimePerUser),
    [data.talkTimePerUser],
  );

  const meetingDate = data.startedAt ?? data.scheduledAt;
  const durationSeconds = data.duration
    ? data.duration
    : (data.durationMinutes ?? 0) * 60;

  const handleExportSummaryPDF = () => {
    const doc = new jsPDF();
    let yPos = 20;
    const pageHeight = 280;

    const write = (
      text: string,
      options?: { size?: number; spacing?: number },
    ) => {
      const size = options?.size ?? 11;
      const spacing = options?.spacing ?? 6;
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, 182);

      for (const line of lines) {
        if (yPos + spacing > pageHeight) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, 14, yPos);
        yPos += spacing;
      }
    };

    doc.setFontSize(20);
    doc.text(`Meeting Summary: ${data.name}`, 14, yPos);
    yPos += 12;

    write(
      [
        meetingDate
          ? `Date: ${format(new Date(meetingDate), "PPP")}`
          : "Date: Not recorded",
        `Duration: ${durationSeconds > 0 ? formatDuration(durationSeconds) : "Not recorded"}`,
        `AI Agent: ${data.agent.name}`,
        data.participants?.length
          ? `Participants: ${data.participants.join(", ")}`
          : "Participants: Not recorded",
      ].join("\n"),
      { size: 10 },
    );

    yPos += 5;
    write("Executive Summary", { size: 14 });
    write(summary || "No summary available.");

    if (detailedSummary && detailedSummary !== summary) {
      yPos += 5;
      write("Detailed Summary", { size: 14 });
      write(detailedSummary);
    }

    if (data.keyTopics?.length) {
      yPos += 5;
      write("Key Topics", { size: 14 });
      write(data.keyTopics.join(", "));
    }

    if (data.keyDecisions?.length) {
      yPos += 5;
      write("Key Decisions", { size: 14 });
      write(data.keyDecisions.map((decision) => `- ${decision}`).join("\n"));
    }

    if (actionItems.length) {
      yPos += 5;
      write("Action Items", { size: 14 });
      write(
        actionItems
          .map((item, index) => {
            const meta = [
              item.assignedTo ? `Owner: ${item.assignedTo}` : null,
              item.dueDate ? `Due: ${item.dueDate}` : null,
              item.priority ? `Priority: ${item.priority}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return `${index + 1}. ${item.task}${meta ? ` (${meta})` : ""}`;
          })
          .join("\n"),
      );
    }

    if (data.unresolvedQuestions?.length) {
      yPos += 5;
      write("Unresolved Questions", { size: 14 });
      write(
        data.unresolvedQuestions.map((question) => `- ${question}`).join("\n"),
      );
    }

    if (highlights.length) {
      yPos += 5;
      write("Highlights", { size: 14 });
      write(
        highlights
          .map(
            (highlight) =>
              `- ${highlight.title}${highlight.timestamp ? ` [${highlight.timestamp}]` : ""}${highlight.description ? `: ${highlight.description}` : ""}`,
          )
          .join("\n"),
      );
    }

    if (data.followUpRecommendations?.length) {
      yPos += 5;
      write("Follow-up Recommendations", { size: 14 });
      write(
        data.followUpRecommendations
          .map((recommendation) => `- ${recommendation}`)
          .join("\n"),
      );
    }

    if (talkTime.length) {
      yPos += 5;
      write("Talk Time", { size: 14 });
      write(
        talkTime
          .map(
            (entry) =>
              `- ${entry.speaker}: ${formatDuration(entry.seconds)} (${entry.percent}%)`,
          )
          .join("\n"),
      );
    }

    doc.save(`${data.name.replace(/\s+/g, "_")}_summary.pdf`);
  };

  return (
    <div className="flex flex-col gap-y-6 animate-in fade-in zoom-in-95 duration-500">
      <Tabs defaultValue="summary" className="w-full">
        <div className="bg-card shadow-sm border border-border/50 rounded-xl px-2 py-2 mb-4">
          <ScrollArea>
            <TabsList className="bg-transparent h-auto p-0 flex space-x-2">
              <TabsTrigger
                value="summary"
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all"
              >
                <BookOpenTextIcon className="size-4 mr-2" />
                Summary
              </TabsTrigger>
              <TabsTrigger
                value="transcript"
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all"
              >
                <FileTextIcon className="size-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger
                value="recording"
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all"
              >
                <FileVideoIcon className="size-4 mr-2" />
                Recording
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none rounded-lg px-4 py-2 text-muted-foreground hover:text-foreground transition-all"
              >
                <SparklesIcon className="size-4 mr-2" />
                Ask AI
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        <TabsContent value="recording" className="mt-0 outline-none">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm px-6 py-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Video Recording</h2>
              {data.recordingUrl && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={data.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileVideoIcon className="size-4 mr-2" /> Open Recording
                  </a>
                </Button>
              )}
            </div>
            {data.recordingUrl ? (
              <div className="rounded-xl overflow-hidden border border-border/50 bg-black/5">
                <video
                  src={data.recordingUrl}
                  className="w-full shadow-inner aspect-video"
                  controls
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground rounded-xl border border-dashed border-border">
                <FileVideoIcon className="size-10 mb-3 opacity-50" />
                <p className="font-semibold text-lg text-foreground mb-1">
                  Recording not available
                </p>
                <p className="text-sm">
                  The recording is being processed or was not found.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-0 outline-none">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="px-6 py-8 flex flex-col gap-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold capitalize tracking-tight">
                    {data.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <Link
                      href={`/agents/${data.agent.id}`}
                      className="flex items-center hover:text-primary transition-colors"
                    >
                      <GeneratedAvatar
                        variant="botttsNeutral"
                        seed={data.agent.name}
                        className="size-6 mr-2 ring-2 ring-background"
                      />
                      <span className="font-medium text-foreground">
                        {data.agent.name}
                      </span>
                    </Link>
                    <div className="h-1 w-1 rounded-full bg-border" />
                    <span>
                      {meetingDate
                        ? format(new Date(meetingDate), "PPP")
                        : "Unknown date"}
                    </span>
                    <div className="h-1 w-1 rounded-full bg-border" />
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-x-1.5 font-normal"
                    >
                      <ClockFadingIcon className="size-3" />
                      {durationSeconds > 0
                        ? formatDuration(durationSeconds)
                        : "N/A"}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportSummaryPDF}
                  className="shrink-0 bg-background hover:bg-muted"
                >
                  <FileTextIcon className="size-4 mr-2" /> Export Summary
                </Button>
              </div>

              <div className="h-px w-full bg-border/50" />

              <div className="space-y-4">
                <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                  <SparklesIcon className="size-4" />
                  <h3>Executive Summary</h3>
                </div>
                <div className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none prose-headings:font-semibold text-foreground/90 leading-relaxed">
                  <Markdown>
                    {summary ||
                      "No summary is available for this meeting yet."}
                  </Markdown>
                </div>
              </div>

              {detailedSummary && detailedSummary !== summary && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                    Detailed Summary
                  </h3>
                  <div className="prose prose-sm md:prose-base prose-slate dark:prose-invert max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {detailedSummary}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                {data.sentiment && (
                  <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                      Overall Sentiment
                    </h3>
                    <Badge
                      className={`px-3 py-1 text-sm font-medium ${
                        data.sentiment === "Positive"
                          ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20"
                          : data.sentiment === "Negative"
                            ? "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20"
                            : "bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 border-slate-500/20"
                      }`}
                      variant="outline"
                    >
                      {data.sentiment}
                    </Badge>
                  </div>
                )}

                {data.keyTopics && data.keyTopics.length > 0 && (
                  <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                      Key Topics
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.keyTopics.map((topic) => (
                        <Badge key={topic} variant="secondary" className="font-normal">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {data.keyDecisions && data.keyDecisions.length > 0 && (
                  <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                      Key Decisions
                    </h3>
                    <ul className="space-y-2">
                      {data.keyDecisions.map((decision, index) => (
                        <li
                          key={`${decision}-${index}`}
                          className="flex gap-2 text-sm text-foreground/80"
                        >
                          <CheckCircle2Icon className="size-4 mt-0.5 shrink-0 text-emerald-500" />
                          {decision}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.unresolvedQuestions &&
                  data.unresolvedQuestions.length > 0 && (
                    <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                      <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                        Unresolved Questions
                      </h3>
                      <ul className="space-y-2">
                        {data.unresolvedQuestions.map((question, index) => (
                          <li
                            key={`${question}-${index}`}
                            className="flex gap-2 text-sm text-foreground/80"
                          >
                            <CircleHelpIcon className="size-4 mt-0.5 shrink-0 text-amber-500" />
                            {question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>

              {actionItems.length > 0 && (
                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                    <CheckCircle2Icon className="size-4" />
                    <h3>Action Items</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {actionItems.map((item, index) => (
                      <div
                        key={`${item.task}-${index}`}
                        className="flex flex-col gap-2 bg-background/50 p-4 rounded-xl border border-border/50 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-medium text-foreground/90">
                            {item.task}
                          </span>
                          {item.priority && (
                            <Badge variant="outline" className="shrink-0 capitalize">
                              {item.priority}
                            </Badge>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {item.assignedTo && (
                            <span>Owner: {item.assignedTo}</span>
                          )}
                          {item.dueDate && <span>Due: {item.dueDate}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {highlights.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                    <MessageSquareTextIcon className="size-4" />
                    <h3>Highlights</h3>
                  </div>
                  <div className="space-y-3">
                    {highlights.map((highlight, index) => (
                      <div
                        key={`${highlight.title}-${index}`}
                        className="rounded-xl border border-border/50 bg-background/50 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {highlight.title}
                          </span>
                          {highlight.timestamp && (
                            <Badge variant="secondary" className="text-[10px]">
                              {highlight.timestamp}
                            </Badge>
                          )}
                        </div>
                        {highlight.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {highlight.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.followUpRecommendations &&
                data.followUpRecommendations.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                      <LightbulbIcon className="size-4" />
                      <h3>Follow-up Recommendations</h3>
                    </div>
                    <ul className="space-y-2">
                      {data.followUpRecommendations.map(
                        (recommendation, index) => (
                          <li
                            key={`${recommendation}-${index}`}
                            className="flex gap-2 text-sm text-foreground/80"
                          >
                            <span className="text-primary font-bold">•</span>
                            {recommendation}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

              {talkTime.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-x-2 text-primary font-medium tracking-wide text-sm uppercase">
                    <UsersIcon className="size-4" />
                    <h3>Talk Time</h3>
                  </div>
                  <div className="space-y-2">
                    {talkTime.map((entry) => (
                      <div key={entry.speaker} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{entry.speaker}</span>
                          <span className="text-muted-foreground">
                            {formatDuration(entry.seconds)} · {entry.percent}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(entry.percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="mt-0 outline-none">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6">
            <TranscriptView
              meetingId={data.id}
              storedTranscript={data.transcript}
              url={data.transcriptUrl}
              agentId={data.agent.id}
              agentName={data.agent.name}
              meetingName={data.name}
              meetingDate={meetingDate}
            />
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-0 outline-none">
          <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6">
            <AskAI meetingId={data.id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface TranscriptViewProps {
  meetingId: string;
  storedTranscript: string | null;
  url: string | null;
  agentId: string;
  agentName: string;
  meetingName: string;
  meetingDate: Date | string | null;
}

const TranscriptView = ({
  meetingId,
  storedTranscript,
  url,
  agentId,
  agentName,
  meetingName,
  meetingDate,
}: TranscriptViewProps) => {
  const trpc = useTRPC();
  const [transcript, setTranscript] = useState<DisplayTranscriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: storedSegments, isLoading: isSegmentsLoading } = useQuery({
    ...trpc.meetings.getTranscript.queryOptions({ meetingId }),
    enabled: !storedTranscript && !url,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (storedTranscript) {
        const parsed = parseTranscriptText(
          storedTranscript,
          agentId,
          agentName,
        );
        if (!cancelled) {
          setTranscript(parsed);
          setLoading(false);
          if (parsed.length === 0) setError("The stored transcript is empty.");
        }
        return;
      }

      if (url) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch transcript: ${response.status}`);
          }
          const text = await response.text();
          if (!cancelled) {
            const parsed = parseTranscriptText(text, agentId, agentName);
            setTranscript(parsed);
            if (parsed.length === 0) setError("Transcript is empty.");
          }
        } catch {
          if (!cancelled) setError("Failed to load transcript.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (isSegmentsLoading) return;

      const parsed = (storedSegments ?? [])
        .map((segment) => {
          const text = segment.text?.trim();
          if (!text) return null;

          return {
            speakerId: segment.speakerId,
            speakerName:
              segment.speakerName && segment.speakerName !== "Unknown"
                ? segment.speakerName
                : segment.speakerId === agentId
                  ? agentName
                  : "Participant",
            text,
            startMs: segment.startMs,
            endMs: segment.endMs,
          } satisfies DisplayTranscriptItem;
        })
        .filter((item): item is DisplayTranscriptItem => item !== null);

      if (!cancelled) {
        setTranscript(parsed);
        setLoading(false);
        if (parsed.length === 0) {
          setError("No transcript segments were stored for this meeting.");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    storedTranscript,
    url,
    agentId,
    agentName,
    storedSegments,
    isSegmentsLoading,
  ]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let yPos = 20;

    const write = (text: string, size = 10, spacing = 6) => {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, 182);
      for (const line of lines) {
        if (yPos + spacing > 280) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, 14, yPos);
        yPos += spacing;
      }
    };

    doc.setFontSize(16);
    doc.text(`Transcript: ${meetingName}`, 14, yPos);
    yPos += 10;

    if (meetingDate) {
      write(`Date: ${format(new Date(meetingDate), "PPP")}`, 10, 8);
    }

    transcript.forEach((item) => {
      write(
        `${item.speakerName} [${formatTimestamp(item.startMs)}]: ${item.text}`,
      );
    });

    doc.save(`${meetingName.replace(/\s+/g, "_")}_transcript.pdf`);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-red-500 p-8">{error}</div>;
  }

  if (!transcript.length) {
    return (
      <div className="text-center text-muted-foreground p-8">
        Transcript is empty.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleExportPDF}>
          <FileTextIcon className="size-4 mr-2" /> Export as PDF
        </Button>
      </div>
      <div className="flex flex-col gap-y-4 p-4 max-h-[500px] overflow-y-auto bg-slate-50 border rounded-lg">
        {transcript.map((item, index) => (
          <div key={`${item.startMs}-${index}`} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {item.speakerName}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatTimestamp(item.startMs)}
              </span>
            </div>
            <p className="text-sm leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

function AskAI({ meetingId }: { meetingId: string }) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState("");

  const searchMutation = useMutation(
    trpc.meetings.smartSearch.mutationOptions({
      onSuccess: (data) => setResult(data.result),
      onError: (error) => setResult(`Could not search: ${error.message}`),
    }),
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      searchMutation.mutate({ meetingId, query });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-2">
        <SparklesIcon className="size-5 text-purple-500" />
        <h3 className="text-lg font-semibold">Ask this meeting</h3>
      </div>
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. What did we decide about the API?"
          disabled={searchMutation.isPending}
        />
        <Button type="submit" disabled={searchMutation.isPending}>
          {searchMutation.isPending ? "Searching..." : "Ask"}
        </Button>
      </form>

      {result && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {result}
        </div>
      )}
    </div>
  );
}
