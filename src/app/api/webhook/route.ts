import { and, eq, not } from "drizzle-orm"

import { NextRequest, NextResponse } from "next/server"
import {
    CallEndedEvent,
    CallTranscriptionReadyEvent,
    CallSessionParticipantLeftEvent,
    CallRecordingReadyEvent,
    CallSessionStartedEvent,
} from "@stream-io/node-sdk"

import { db } from "@/db"
import { agents, meetings } from "@/db/schema"
import { streamVideo } from "@/lib/stream-video"
// Removed unused imports
import { inngest } from "@/inngest/client"


function verifySignatureWithSDK(body: string, signature: string): boolean {
    return streamVideo.verifyWebhook(body, signature);

};

export async function POST(req: NextRequest) {
    const signature = req.headers.get("x-signature");
    const apiKey = req.headers.get("x-api-key");


    if (!signature) {
        console.error('Missing x-signature header');
        return NextResponse.json(
            { error: "Missing x-signature header" },
            { status: 400 }
        );
    }

    if (!apiKey) {
        console.error('Missing x-api-key header');
        return NextResponse.json(
            { error: "Missing x-api-key header" },
            { status: 400 }
        );
    }

    const body = await req.text();

    console.log('Verifying webhook signature...');
    console.log('Signature:', signature.substring(0, 10) + '...');
    console.log('API Key:', apiKey);

    const isSignatureValid = verifySignatureWithSDK(body, signature);
    console.log('Signature valid:', isSignatureValid);

    if (!isSignatureValid) {
        console.error('Invalid webhook signature');
        return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
        );
    }

    let payload: unknown;
    try {
        console.log('Parsing webhook body...');
        payload = JSON.parse(body) as Record<string, unknown>;
        console.log('Event type:', (payload as Record<string, unknown>)?.type);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        console.log('Raw body:', body);
        return NextResponse.json(
            { error: "Invalid JSON payload" },
            { status: 400 }
        );
    }

    const eventType = (payload as Record<string, unknown>)?.type;


    if (eventType === "call.session_started") {
        const event = payload as CallSessionStartedEvent;
        const meetingId = event.call.custom?.meetingId;

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
        }


        const [existingMeeting] = await db
            .select()
            .from(meetings)
            .where(
                and(
                    eq(meetings.id, meetingId),
                    not(eq(meetings.status, "completed")),
                    not(eq(meetings.status, "active")),
                    not(eq(meetings.status, "cancelled")),
                    not(eq(meetings.status, "processing")),

                )
            );
        if (!existingMeeting) {
            return NextResponse.json({ error: "Missing not found" }, { status: 400 });
        }
        await db
            .update(meetings)
            .set({
                status: "active",
                startedAt: new Date(),
            })
            .where(eq(meetings.id, existingMeeting.id));
        const [existingAgent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, existingMeeting.agentId))

        if (!existingAgent) {
            return NextResponse.json({ error: "Agent  not found" }, { status: 400 });
        }
        const call = streamVideo.video.call("default", meetingId);
        const realtimeClient = await streamVideo.video.connectOpenAi({
            call,
            openAiApiKey: process.env.OPENAI_API_KEY!,
            agentUserId: existingAgent.id
        });

        realtimeClient.updateSession({
            instructions: existingAgent.instructions,
        });
    } else if (eventType === "call.session_participant_left") {
        const event = payload as CallSessionParticipantLeftEvent;
        const meetingId = event.call_cid.split(":")[1];
        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId " }, { status: 400 })
        }
        const call = streamVideo.video.call("default", meetingId);
        await call.end();

    } else if (eventType === "call.session_ended") {
        const event = payload as CallEndedEvent;
        const meetingId = event.call.custom?.meetingId;
        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId " }, { status: 400 });
        }
        await db
            .update(meetings)
            .set({
                status: "processing",
                endedAt: new Date(),
            })
            .where(and(eq(meetings.id, meetingId), eq(meetings.status, "active")));
    } else if (eventType === "call.transcription_ready") {
        const event = payload as CallTranscriptionReadyEvent;
        const meetingId = event.call_cid.split(":")[1];
        const [updateMeeting] = await db
            .update(meetings)
            .set({
                transcriptUrl: event.call_transcription.url,
            })
            .where(eq(meetings.id, meetingId))
            .returning();

        if (!updateMeeting) {
            return NextResponse.json({ error: "Meeting not Found " }, { status: 400 })
        }

        await inngest.send({
            name: "meetings/processing",
            data: {
                meetingId: updateMeeting.id,
                transcriptUrl: updateMeeting.transcriptUrl,
            }
        })

    } else if (eventType === "call.recording_ready") {
        const event = payload as CallRecordingReadyEvent;
        const meetingId = event.call_cid.split(":")[1];

        console.log(`Webhook: Processing call.recording_ready for meetingId: ${meetingId}`);

        if (!meetingId) {
            return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
        }

        const [updated] = await db
            .update(meetings)
            .set({
                recordingUrl: event.call_recording.url,
            })
            .where(eq(meetings.id, meetingId))
            .returning();

        if (updated) {
            console.log(`Webhook: Successfully updated recording URL for meeting ${meetingId}`);
        } else {
            console.error(`Webhook: Failed to update recording URL for meeting ${meetingId} - Meeting not found`);
        }
    }

    return NextResponse.json({ status: "ok" });
}