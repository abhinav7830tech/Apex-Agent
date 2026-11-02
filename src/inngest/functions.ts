import { db } from "@/db";
import {
  agents,
  meetingGuests,
  meetingParticipants,
  meetings,
  notifications,
  transcriptSegments,
  user,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import type {
  MeetingActionItem,
  MeetingAiAnalysis,
  MeetingHighlight,
} from "@/modules/meetings/types";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";
import { escapeHtml, isEmailConfigured, sendEmail } from "@/lib/resend";
import { queueExpiredReservationReviews, reconcileUsageCounters, reviewExpiredReservations } from "@/modules/billing/server/reconciliation";

type NormalizedTranscriptItem = {
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
};


const normalizeTranscriptItems = (raw: unknown): NormalizedTranscriptItem[] => {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .filter(
      (item) =>
        typeof item.text === "string" &&
        item.text.trim().length > 0 &&
        typeof (item.speakerId ?? item.speaker_id) === "string",
    )
    .map((item) => {
      const startMs = Number(item.startMs ?? item.start_ts ?? 0);
      const endMs = Number(
        item.endMs ?? item.stop_ts ?? item.end_ts ?? startMs,
      );

      return {
        speakerId: String(item.speakerId ?? item.speaker_id),
        speakerName: String(item.speakerName ?? "Unknown").trim(),
        text: String(item.text).trim(),
        startMs: Math.max(0, Math.round(startMs)),
        endMs: Math.max(0, Math.round(endMs)),
      };
    });
};

const parseTranscript = (raw: string): NormalizedTranscriptItem[] => {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);

    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const objects: unknown[] = [];

    for (const line of lines) {
      try {
        let item: unknown = JSON.parse(line);

        if (typeof item === "string") {
          item = JSON.parse(item);
        }

        if (Array.isArray(item)) {
          objects.push(...item);
        } else {
          objects.push(item);
        }
      } catch {
        // Ignore non-JSON lines.
      }
    }

    parsed = objects;
  }

  return normalizeTranscriptItems(parsed);
};


const formatTimestamp = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";

      const record = item as Record<string, unknown>;
      return String(
        record.title ??
        record.topic ??
        record.question ??
        record.recommendation ??
        record.description ??
        "",
      ).trim();
    })
    .filter(Boolean);
};

const rawActionItemSchema = z.union([
  z.string(),
  z
    .object({
      task: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      assignedTo: z.string().optional().nullable(),
      dueDate: z.string().optional().nullable(),
      priority: z.string().optional().nullable(),
      completed: z.boolean().optional().nullable(),
    })
    .passthrough(),
]);

const rawAnalysisSchema = z
  .object({
    summary: z.string().optional(),
    executiveSummary: z.string().optional(),
    detailedSummary: z.string().optional(),
    keyTopics: z.array(z.any()).optional(),
    keyDecisions: z.array(z.any()).optional(),
    actionItems: z.array(rawActionItemSchema).optional(),
    unresolvedQuestions: z.array(z.any()).optional(),
    sentiment: z.string().optional(),
    highlights: z.array(z.any()).optional(),
    followUpRecommendations: z.array(z.any()).optional(),
  })
  .passthrough();

const cleanUnknown = (value?: string | null) => {
  if (!value) return undefined;
  const normalized = value.trim();
  if (
    !normalized ||
    /^(unknown|n\/a|none|not specified|unassigned|tbd)$/i.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
};

const normalizeAnalysis = (raw: unknown): MeetingAiAnalysis => {
  const parsed = rawAnalysisSchema.parse(raw);

  const summary = (parsed.summary ?? parsed.executiveSummary ?? "").trim();
  const detailedSummary = (parsed.detailedSummary ?? "").trim();

  if (!summary && !detailedSummary) {
    throw new Error("OpenAI returned an empty meeting summary");
  }

  const actionItems = (parsed.actionItems ?? [])
    .map((item): MeetingActionItem | null => {
      if (typeof item === "string") {
        const task = item.trim();
        return task ? { task } : null;
      }

      const task = String(item.task ?? item.title ?? "").trim();
      if (!task) return null;

      const priority = item.priority?.toLowerCase();
      const normalizedPriority: MeetingActionItem["priority"] =
        priority === "low" || priority === "medium" || priority === "high"
          ? priority
          : undefined;

      return {
        task,
        description: item.description?.trim() || undefined,
        assignedTo: cleanUnknown(item.assignedTo),
        dueDate: cleanUnknown(item.dueDate),
        priority: normalizedPriority,
        completed: item.completed ?? false,
      };
    })
    .filter((item): item is MeetingActionItem => item !== null);

  const highlights: MeetingHighlight[] = (parsed.highlights ?? [])
    .map((item) => {
      if (typeof item === "string") {
        return { title: item.trim(), description: "" } satisfies MeetingHighlight;
      }
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const title = String(record.title ?? record.moment ?? "").trim();
      if (!title) return null;

      return {
        title,
        description: String(record.description ?? "").trim(),
        timestamp: cleanUnknown(
          record.timestamp ? String(record.timestamp) : undefined,
        ),
      } satisfies MeetingHighlight;
    })
    .filter((item): item is MeetingHighlight => Boolean(item));

  const sentimentRaw = (parsed.sentiment ?? "Neutral").toLowerCase();
  const sentiment: MeetingAiAnalysis["sentiment"] =
    sentimentRaw.includes("positive")
      ? "Positive"
      : sentimentRaw.includes("negative")
        ? "Negative"
        : "Neutral";

  return {
    summary: summary || detailedSummary.slice(0, 500),
    detailedSummary: detailedSummary || summary,
    keyTopics: toStringArray(parsed.keyTopics),
    keyDecisions: toStringArray(parsed.keyDecisions),
    actionItems,
    unresolvedQuestions: toStringArray(parsed.unresolvedQuestions),
    sentiment,
    highlights,
    followUpRecommendations: toStringArray(parsed.followUpRecommendations),
  };
};

const extractJson = (content: string) => {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("OpenAI did not return valid JSON");
  }
};

const getAppUrl = () => {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return (configured || "http://localhost:3000").replace(/\/$/, "");
};

const formatMeetingTime = (value: Date | string | null, timeZone?: string) => {
  if (!value) return "Not scheduled";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: timeZone || undefined,
    }).format(date);
  } catch {
    return date.toISOString();
  }
};

const buildSummaryEmail = (input: {
  recipientName: string;
  meetingName: string;
  meetingId: string;
  summary: string;
  keyDecisions: string[];
  actionItems: MeetingActionItem[];
  keyTopics: string[];
}) => {
  const meetingUrl = `${getAppUrl()}/meetings/${input.meetingId}`;

  const topics = input.keyTopics
    .slice(0, 8)
    .map((topic) => `<li>${escapeHtml(topic)}</li>`)
    .join("");
  const decisions = input.keyDecisions
    .slice(0, 8)
    .map((decision) => `<li>${escapeHtml(decision)}</li>`)
    .join("");
  const actions = input.actionItems
    .slice(0, 10)
    .map((item) => {
      const owner = item.assignedTo ? ` — ${item.assignedTo}` : "";
      const due = item.dueDate ? ` (due ${item.dueDate})` : "";
      return `<li>${escapeHtml(item.task)}${escapeHtml(owner)}${escapeHtml(due)}</li>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f7f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#17251f;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #dce7e1;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0f5a44;font-weight:700;">Apex Agent</p>
      <h1 style="margin:0 0 8px;font-size:24px;line-height:1.3;">Your meeting summary is ready</h1>
      <p style="margin:0 0 24px;color:#4b5f56;">Hi ${escapeHtml(input.recipientName)}, here is what happened in <strong>${escapeHtml(input.meetingName)}</strong>.</p>
      <h2 style="font-size:16px;margin:0 0 8px;">Executive summary</h2>
      <p style="margin:0 0 24px;line-height:1.65;color:#33463d;">${escapeHtml(input.summary)}</p>
      ${topics ? `<h2 style="font-size:16px;margin:0 0 8px;">Key topics</h2><ul style="margin:0 0 24px;padding-left:20px;line-height:1.6;color:#33463d;">${topics}</ul>` : ""}
      ${decisions ? `<h2 style="font-size:16px;margin:0 0 8px;">Decisions</h2><ul style="margin:0 0 24px;padding-left:20px;line-height:1.6;color:#33463d;">${decisions}</ul>` : ""}
      ${actions ? `<h2 style="font-size:16px;margin:0 0 8px;">Action items</h2><ul style="margin:0 0 24px;padding-left:20px;line-height:1.6;color:#33463d;">${actions}</ul>` : ""}
      <a href="${meetingUrl}" style="display:inline-block;background:#0f5a44;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">View full summary</a>
      <p style="margin:24px 0 0;font-size:12px;color:#7b8f85;">You are receiving this because you scheduled this meeting in Apex Agent.</p>
    </div>
  </body>
</html>`;

  const text = [
    `Your meeting summary is ready: ${input.meetingName}`,
    "",
    input.summary,
    "",
    input.keyTopics.length ? `Key topics: ${input.keyTopics.join(", ")}` : "",
    input.keyDecisions.length
      ? `Decisions:\n- ${input.keyDecisions.join("\n- ")}`
      : "",
    input.actionItems.length
      ? `Action items:\n- ${input.actionItems
        .map((item) => item.task)
        .join("\n- ")}`
      : "",
    "",
    `View full summary: ${meetingUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text, meetingUrl };
};

const ANALYSIS_SYSTEM_PROMPT = `You are Apex Agent, an expert meeting analyst.
Return ONLY a valid JSON object with exactly these keys:
{
  "summary": "concise executive summary",
  "detailedSummary": "organized multi-paragraph summary of the discussion",
  "keyTopics": ["topic"],
  "keyDecisions": ["decision with context"],
  "actionItems": [{"task": "task", "description": "details", "assignedTo": "person or omit", "dueDate": "date or omit", "priority": "low|medium|high", "completed": false}],
  "unresolvedQuestions": ["question"],
  "sentiment": "Positive|Neutral|Negative",
  "highlights": [{"title": "moment", "description": "why it matters", "timestamp": "mm:ss"}],
  "followUpRecommendations": ["recommendation"]
}
Rules:
- Use ONLY the meeting transcript. Do not invent facts, people, decisions, deadlines, or action items.
- Omit assignedTo and dueDate when they were not explicitly stated.
- keyDecisions must be confirmed decisions, not suggestions.
- followUpRecommendations are suggestions and must be phrased as suggestions.
- Never return markdown fences or commentary outside the JSON object.`;

const condenseChunk = async (chunk: string, index: number, total: number) => {
  const completion = await getOpenAIClient().chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "Extract factual notes from this meeting transcript chunk. Include decisions, action items with explicit owners/deadlines only, unresolved questions, key topics, and important moments with timestamps. Do not invent anything. Return plain text notes.",
      },
      {
        role: "user",
        content: `Chunk ${index + 1} of ${total}:\n${chunk}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
};

const generateAnalysis = async (transcriptText: string) => {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let context = transcriptText;
  const MAX_DIRECT_CHARS = 28000;

  if (transcriptText.length > MAX_DIRECT_CHARS) {
    const lines = transcriptText.split("\n");
    const chunks: string[] = [];
    let current = "";

    for (const line of lines) {
      if (current.length + line.length + 1 > 12000 && current) {
        chunks.push(current);
        current = "";
      }
      current += `${line}\n`;
    }
    if (current.trim()) chunks.push(current);

    const notes: string[] = [];
    for (let index = 0; index < chunks.length; index++) {
      notes.push(await condenseChunk(chunks[index], index, chunks.length));
    }

    context = notes.join("\n\n").slice(0, MAX_DIRECT_CHARS);
  }

  const completion = await getOpenAIClient().chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this meeting transcript:\n\n${context}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  return normalizeAnalysis(extractJson(content));
};

export const meetingsProcessing = inngest.createFunction(
  {
    id: "meetings/processing",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.meetingId" },
  },
  { event: "meetings/processing" },
  async ({ event, step }) => {
    const meetingId = event.data.meetingId as string;

    try {
      const meeting = await step.run("load-meeting", async () => {
        const [existing] = await db
          .select()
          .from(meetings)
          .where(eq(meetings.id, meetingId));

        if (!existing) throw new Error(`Meeting ${meetingId} not found`);
        return existing;
      });

      if (meeting.status === "completed" && meeting.processedAt) {
        return { skipped: true, reason: "already-processed" };
      }

      await step.run("mark-processing", async () => {
        await db
          .update(meetings)
          .set({
            status: "processing",
            analysisError: null,
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, meetingId));
      });

      const transcriptJson = await step.run("fetch-transcript", async () => {
        if (meeting.transcript?.trim()) {
          return meeting.transcript;
        }

        const transcriptUrl = event.data.transcriptUrl ?? meeting.transcriptUrl;
        if (!transcriptUrl) {
          throw new Error(
            "No transcript URL or stored transcript is available for this meeting",
          );
        }

        const response = await fetch(transcriptUrl, {
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          throw new Error(
            `Transcript download failed with status ${response.status}`,
          );
        }

        return response.text();
      });

      const parsedTranscript = parseTranscript(transcriptJson);

      if (parsedTranscript.length === 0) {
        await step.run("mark-empty-transcript", async () => {
          await db
            .update(meetings)
            .set({
              status: "failed",
              analysisError:
                "The transcript was empty. The meeting may not have had speech or transcription enabled.",
              transcript: transcriptJson || null,
              updatedAt: new Date(),
            })
            .where(eq(meetings.id, meetingId));

          await db.insert(notifications).values({
            userId: meeting.userId,
            type: "meeting_failed",
            title: "Analysis Could Not Run",
            message: `No usable transcript was found for "${meeting.name}". Check that recording and transcription were enabled during the call.`,
            meetingId: meeting.id,
          });
        });

        return { skipped: true, reason: "empty-transcript" };
      }

      const transcriptWithSpeakers = await step.run(
        "resolve-speakers",
        async () => {
          const speakerIds = [
            ...new Set(parsedTranscript.map((item) => item.speakerId)),
          ];

          const userSpeakers = await db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, speakerIds));

          const agentSpeakers = await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(inArray(agents.id, speakerIds));

          const guestSpeakers = await db
            .select({ id: meetingGuests.id, name: meetingGuests.displayName })
            .from(meetingGuests)
            .where(inArray(meetingGuests.id, speakerIds));

          const participantSpeakers = await db
            .select({
              guestId: meetingParticipants.guestId,
              name: meetingParticipants.name,
            })
            .from(meetingParticipants)
            .where(
              and(
                eq(meetingParticipants.meetingId, meetingId),
                isNotNull(meetingParticipants.guestId),
              ),
            );

          const speakerMap = new Map<string, string>();
          for (const speaker of [
            ...userSpeakers,
            ...agentSpeakers,
            ...guestSpeakers,
          ]) {
            speakerMap.set(speaker.id, speaker.name);
          }
          for (const participant of participantSpeakers) {
            if (participant.guestId) {
              speakerMap.set(participant.guestId, participant.name);
            }
          }

          return parsedTranscript.map((item) => ({
            ...item,
            speakerName: speakerMap.get(item.speakerId) ?? "Unknown",
          }));
        },
      );

      await step.run("store-transcript", async () => {
        await db
          .delete(transcriptSegments)
          .where(eq(transcriptSegments.meetingId, meetingId));

        const BATCH_SIZE = 400;
        for (let index = 0; index < transcriptWithSpeakers.length; index += BATCH_SIZE) {
          const batch = transcriptWithSpeakers.slice(index, index + BATCH_SIZE);
          await db.insert(transcriptSegments).values(
            batch.map((item) => ({
              meetingId,
              speakerId: item.speakerId,
              speakerName: item.speakerName,
              text: item.text,
              startMs: item.startMs,
              endMs: item.endMs,
            })),
          );
        }

        await db
          .update(meetings)
          .set({
            transcript: JSON.stringify(transcriptWithSpeakers),
            transcriptUrl: event.data.transcriptUrl ?? meeting.transcriptUrl,
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, meetingId));
      });

      const talkTime = await step.run("calculate-talk-time", async () => {
        const userTalkTime: Record<string, number> = {};

        for (const item of transcriptWithSpeakers) {
          const durationSeconds = Math.max(
            0,
            (item.endMs - item.startMs) / 1000,
          );
          if (durationSeconds > 0) {
            userTalkTime[item.speakerName] =
              (userTalkTime[item.speakerName] ?? 0) + durationSeconds;
          }
        }

        return Object.fromEntries(
          Object.entries(userTalkTime).map(([name, seconds]) => [
            name,
            Math.round(seconds),
          ]),
        );
      });

      const transcriptText = transcriptWithSpeakers
        .map(
          (item) =>
            `[${formatTimestamp(item.startMs)}] ${item.speakerName}: ${item.text}`,
        )
        .join("\n");

      const analysis = await step.run("generate-ai-insights", async () =>
        generateAnalysis(transcriptText),
      );

      const updatedMeeting = await step.run("save-summary", async () => {
        const [updated] = await db
          .update(meetings)
          .set({
            summary: analysis.summary,
            detailedSummary: analysis.detailedSummary,
            keyTopics: analysis.keyTopics,
            keyDecisions: analysis.keyDecisions,
            actionItems: JSON.stringify(analysis.actionItems),
            unresolvedQuestions: analysis.unresolvedQuestions,
            highlights: JSON.stringify(analysis.highlights),
            followUpRecommendations: analysis.followUpRecommendations,
            sentiment: analysis.sentiment,
            talkTimePerUser: JSON.stringify(talkTime),
            status: "completed",
            analysisError: null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, meetingId))
          .returning();

        return updated;
      });

      await step.run("create-notification", async () => {
        if (updatedMeeting?.userId) {
          await db.insert(notifications).values({
            userId: updatedMeeting.userId,
            type: "summary_ready",
            title: "Meeting Summary Ready",
            message: `The AI summary, decisions, and action items for "${updatedMeeting.name}" are ready to view.`,
            meetingId: updatedMeeting.id,
          });
        }
      });

      await step.run("send-summary-email", async () => {
        if (!updatedMeeting?.userId || updatedMeeting.summaryEmailSentAt) {
          return { sent: false, reason: "already-sent-or-missing-user" };
        }

        if (!isEmailConfigured()) {
          return { sent: false, reason: "email-not-configured" };
        }

        const [recipient] = await db
          .select({ email: user.email, name: user.name })
          .from(user)
          .where(eq(user.id, updatedMeeting.userId));

        if (!recipient?.email) {
          return { sent: false, reason: "missing-recipient" };
        }

        const { html, text } = buildSummaryEmail({
          recipientName: recipient.name || "there",
          meetingName: updatedMeeting.name,
          meetingId: updatedMeeting.id,
          summary: analysis.summary,
          keyDecisions: analysis.keyDecisions,
          actionItems: analysis.actionItems,
          keyTopics: analysis.keyTopics,
        });

        try {
          await sendEmail({
            to: recipient.email,
            subject: `Summary ready: ${updatedMeeting.name}`,
            html,
            text,
          });

          await db
            .update(meetings)
            .set({ summaryEmailSentAt: new Date(), updatedAt: new Date() })
            .where(eq(meetings.id, meetingId));

          return { sent: true };
        } catch (error) {
          // Email is a best-effort side effect. The summary is already stored
          // and the in-app notification exists, so a mail outage must not mark
          // the whole analysis as failed.
          console.error("[EMAIL] Failed to send meeting summary email", error);
          return { sent: false, reason: "send-failed" };
        }
      });

      return { skipped: false, meetingId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown processing error";

      await step.run("mark-failed", async () => {
        const [meeting] = await db
          .select({ userId: meetings.userId, name: meetings.name })
          .from(meetings)
          .where(eq(meetings.id, meetingId));

        await db
          .update(meetings)
          .set({
            status: "failed",
            analysisError: message,
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, meetingId));

        if (meeting) {
          await db.insert(notifications).values({
            userId: meeting.userId,
            type: "meeting_failed",
            title: "Meeting Analysis Failed",
            message: `Apex Agent could not analyze "${meeting.name}". You can retry the analysis from the meeting page.`,
            meetingId,
          });
        }
      });

      throw error;
    }
  },
);

/**
 * Sends in-app (and optional email) reminders for meetings that start within
 * the next 30 minutes. Runs every five minutes and claims each meeting with an
 * atomic `reminder_sent_at IS NULL` update so duplicate cron runs cannot send
 * the same reminder twice.
 */
export const meetingReminders = inngest.createFunction(
  {
    id: "meetings/reminders",
    retries: 2,
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const result = await step.run("send-due-reminders", async () => {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

      const dueMeetings = await db
        .select({
          id: meetings.id,
          name: meetings.name,
          userId: meetings.userId,
          scheduledAt: meetings.scheduledAt,
          timezone: meetings.timezone,
          durationMinutes: meetings.durationMinutes,
          agentName: agents.name,
          email: user.email,
          recipientName: user.name,
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .innerJoin(user, eq(meetings.userId, user.id))
        .where(
          and(
            inArray(meetings.status, ["scheduled", "upcoming"]),
            isNull(meetings.reminderSentAt),
            gte(meetings.scheduledAt, now),
            lte(meetings.scheduledAt, windowEnd),
          ),
        );

      const reminded: string[] = [];

      for (const meeting of dueMeetings) {
        const [claimed] = await db
          .update(meetings)
          .set({ reminderSentAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(meetings.id, meeting.id),
              isNull(meetings.reminderSentAt),
            ),
          )
          .returning({ id: meetings.id });

        if (!claimed) continue;

        const meetingUrl = `${getAppUrl()}/meetings/${meeting.id}`;
        const when = formatMeetingTime(meeting.scheduledAt, meeting.timezone);

        await db.insert(notifications).values({
          userId: meeting.userId,
          type: "meeting_reminder",
          title: "Meeting Starting Soon",
          message: `"${meeting.name}" starts ${when} with ${meeting.agentName}.`,
          meetingId: meeting.id,
        });

        if (isEmailConfigured() && meeting.email) {
          try {
            await sendEmail({
              to: meeting.email,
              subject: `Starting soon: ${meeting.name}`,
              html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f7f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#17251f;">
                <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #dce7e1;">
                  <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0f5a44;font-weight:700;">Apex Agent</p>
                  <h1 style="margin:0 0 12px;font-size:24px;">Starting soon</h1>
                  <p style="margin:0 0 8px;line-height:1.6;color:#33463d;"><strong>${escapeHtml(meeting.name)}</strong> starts ${escapeHtml(when)}.</p>
                  <p style="margin:0 0 24px;line-height:1.6;color:#33463d;">${escapeHtml(meeting.agentName)} will join the call as your AI assistant.</p>
                  <a href="${meetingUrl}" style="display:inline-block;background:#0f5a44;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Join meeting</a>
                </div>
              </body></html>`,
              text: `"${meeting.name}" starts ${when} with ${meeting.agentName}.\n\nJoin meeting: ${meetingUrl}`,
            });
          } catch (error) {
            console.error("[EMAIL] Failed to send meeting reminder", error);
          }
        }

        reminded.push(meeting.id);
      }

      return { reminded: reminded.length, meetingIds: reminded };
    });

    return result;
  },
);

export const billingReservationReconciliation = inngest.createFunction(
  {
    id: "billing-reservation-reconciliation",
    retries: 5,
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const queued = await step.run("queue-expired-reservations", queueExpiredReservationReviews);
    const reviewed = await step.run("review-expired-reservations", reviewExpiredReservations);
    console.info("billing_reservation_reconciliation_complete", {
      queued,
      examined: reviewed.examined,
      updated: reviewed.updated,
      autoReleased: 0,
    });
    return { queued, ...reviewed, autoReleased: 0 };
  },
);

export const billingUsageReconciliation = inngest.createFunction(
  {
    id: "billing-usage-reconciliation",
    retries: 5,
    concurrency: { limit: 1 },
  },
  { cron: "17 2 * * *" },
  async ({ step }) => {
    const summary = await step.run("reconcile-usage-counters", reconcileUsageCounters);
    console.info("billing_usage_reconciliation_complete", summary);
    return summary;
  },
);
