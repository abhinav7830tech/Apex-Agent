import { db } from "@/db";
import { agents, meetings, user, notifications } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { StreamTranscriptItem } from "@/modules/meetings/types";
import { eq, inArray } from "drizzle-orm";
import JSONParser from "jsonl-parse-stringify";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in environment variables');
    throw new Error('OpenAI API key is required');
}

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const meetingsProcessing = inngest.createFunction(
    { id: "meetings/processing" },
    { event: "meetings/processing" },
    async ({ event, step }) => {
        const response = await step.run("fetch-transcript", async () => {
            return fetch(event.data.transcriptUrl).then((res) => res.text());
        });
        const transcript = await step.run("parse-transcript", async () => {
            return JSONParser.parse<StreamTranscriptItem>(response);
        });

        const transcriptWithSpeakers = await step.run("add-speakers", async () => {
            const speakerIds = [
                ...new Set(transcript.map((item) => item.speaker_id)),
            ];
            const userSpeakers = await db
                .select()
                .from(user)
                .where(inArray(user.id, speakerIds))
                .then((user) =>
                    user.map((user) => ({
                        ...user,
                    }))
                );
            const agentsSpeakers = await db
                .select()
                .from(agents)
                .where(inArray(agents.id, speakerIds))
                .then((agents) =>
                    agents.map((agents) => ({
                        ...agents,
                    }))
                );

            const speakers = [...userSpeakers, ...agentsSpeakers];
            return transcript.map((item) => {
                const speaker = speakers.find(
                    (speaker) => speaker.id === item.speaker_id
                );

                if (!speaker) {
                    return {
                        ...item,
                        user: {
                            name: "Unknown",
                        },
                    };
                }
                return {
                    ...item,
                    user: {
                        name: speaker.name,
                    },
                };
            });
        });

        // Calculate Talk Time
        const talkTime = await step.run("calculate-talk-time", async () => {
            const userTalkTime: Record<string, number> = {};
            transcriptWithSpeakers.forEach((item) => {
                const duration = ((item as any).stop_ts || item.shop_ts || 0) - (item.start_ts || 0);
                if (duration > 0 && item.user.name !== "Unknown") {
                    userTalkTime[item.user.name] = (userTalkTime[item.user.name] || 0) + duration;
                }
            });
            return userTalkTime;
        });

        const aiInsights = await step.run("generate-ai-insights", async () => {
             const aiResponse = await ai.chat.completions.create({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                    { 
                      role: "system", 
                      content: `You are an expert meeting assistant. Output ONLY valid JSON matching this schema: 
{ 
  "summary": "Short paragraph summary", 
  "keyDecisions": ["Decision 1", "Decision 2"], 
  "actionItems": [ { "task": "Task description", "assignedTo": "Person Name" } ], 
  "sentiment": "Positive" | "Neutral" | "Negative" 
}` 
                    },
                    { role: "user", content: "Here is the transcript:\\n" + JSON.stringify(transcriptWithSpeakers) }
                ]
             });
             return global.JSON.parse(aiResponse.choices[0].message.content || '{}');
        });

        const updatedMeeting = await step.run("save-summary", async () => {
            const [meeting] = await db
                .update(meetings)
                .set({
                    summary: aiInsights.summary || "",
                    keyDecisions: aiInsights.keyDecisions || [],
                    actionItems: global.JSON.stringify(aiInsights.actionItems || []),
                    sentiment: aiInsights.sentiment || "Neutral",
                    talkTimePerUser: global.JSON.stringify(talkTime || {}),
                    status: "completed",
                })
                .where(eq(meetings.id, event.data.meetingId))
                .returning();
            return meeting;
        });

        await step.run("create-notification", async () => {
            if (updatedMeeting?.userId) {
                await db.insert(notifications).values({
                    userId: updatedMeeting.userId,
                    type: "summary_ready",
                    title: "Meeting Summary Ready",
                    message: `The AI summary and insights for your meeting "${updatedMeeting.name}" are now available to view.`,
                    meetingId: updatedMeeting.id,
                });
            }
        });
    },
);