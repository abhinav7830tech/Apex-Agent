import { NextRequest, NextResponse } from "next/server";
import type {
  CallEndedEvent,
  CallRecordingReadyEvent,
  CallSessionStartedEvent,
  CallTranscriptionFailedEvent,
  CallTranscriptionReadyEvent,
} from "@stream-io/node-sdk";

import { db } from "@/db";
import { agents, meetings, notifications } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";
import { isOpenAIConfigured } from "@/lib/openai";
import { eq } from "drizzle-orm";
import { billingStore } from "@/modules/billing/server/store";
import { commitVerifiedStreamStart, extractStreamStartEvidence } from "@/modules/meetings/server/stream-start-evidence";

const getMeetingIdFromCid = (callCid: string | undefined) =>
  callCid?.split(":").pop();

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature");
  const apiKey = req.headers.get("x-api-key");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing x-signature header" },
      { status: 400 },
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing x-api-key header" },
      { status: 400 },
    );
  }

  const expectedApiKey = process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    console.error("Stream webhook rejected: API key mismatch");
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await req.text();

  let isSignatureValid = false;
  try {
    isSignatureValid = streamVideo.verifyWebhook(body, signature);
  } catch {
    console.error("stream_webhook_signature_verification_failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!isSignatureValid) {
    console.error("Stream webhook rejected: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: string } & Record<string, unknown>;
  try {
    payload = JSON.parse(body) as { type?: string } & Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventType = payload.type;

  if (eventType === "call.session_started") {
    const event = payload as unknown as CallSessionStartedEvent;
    const evidence = extractStreamStartEvidence(payload);
    const meetingId = event.call.custom?.meetingId;

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    const [existingMeeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!existingMeeting) {
      console.error("stream_webhook_meeting_not_found");
      return NextResponse.json({ status: "ignored" });
    }

    // The request signature was verified above. Bill only when Stream supplies
    // its nested session start timestamp and stable call/session identity.
    if (evidence) {
      try {
        const result = await commitVerifiedStreamStart(
          isSignatureValid,
          payload,
          (id, eventId, startedAt) => billingStore.commitMeetingStart(id, eventId, startedAt),
        );
        if (result === "operation_failed") console.error("billing_stream_start_commit_unavailable");
      } catch {
        // Billing SQL grants/functions may be absent during staged rollout.
        // Preserve the established meeting lifecycle and surface a safe signal.
        console.error("billing_stream_start_commit_failed");
      }
    } else {
      console.info("billing_stream_start_evidence_untrusted");
    }

    if (
      ["completed", "cancelled", "processing"].includes(existingMeeting.status)
    ) {
      return NextResponse.json({ status: "ignored" });
    }

    const wasAlreadyActive = existingMeeting.status === "active";

    await db
      .update(meetings)
      .set({
        status: "active",
        startedAt: existingMeeting.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    if (!wasAlreadyActive) {
      await db.insert(notifications).values({
        userId: existingMeeting.userId,
        type: "meeting_started",
        title: "Meeting Started",
        message: `"${existingMeeting.name}" is live. Your AI agent is joining the call.`,
        meetingId,
      });
    }

    if (!isOpenAIConfigured()) {
      console.error(
        "Stream webhook: OPENAI_API_KEY is not configured; agent will not join the call",
      );
      return NextResponse.json({ status: "ok" });
    }

    const [existingAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, existingMeeting.agentId));

    if (!existingAgent) {
      console.error(
        `Stream webhook: agent ${existingMeeting.agentId} not found for meeting ${meetingId}`,
      );
      return NextResponse.json({ status: "ok" });
    }

    try {
      const call = streamVideo.video.call("default", meetingId);
      const realtimeClient = await streamVideo.video.connectOpenAi({
        call,
        openAiApiKey: process.env.OPENAI_API_KEY!,
        agentUserId: existingAgent.id,
      });

      await realtimeClient.updateSession({
        instructions: existingAgent.instructions,
      });
    } catch (error) {
      console.error(
        `Stream webhook: failed to connect OpenAI agent for meeting ${meetingId}`,
        error,
      );
    }

    return NextResponse.json({ status: "ok" });
  }

  if (eventType === "call.session_participant_left") {
    // A single participant leaving must not end the call for everyone.
    // The call is ended explicitly by the owner or by Stream when the last participant leaves.
    return NextResponse.json({ status: "ok" });
  }

  if (eventType === "call.session_ended") {
    const event = payload as unknown as CallEndedEvent;
    const meetingId =
      event.call.custom?.meetingId ?? getMeetingIdFromCid(event.call_cid);

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!meeting) {
      return NextResponse.json({ status: "ignored" });
    }

    if (meeting.status === "active") {
      await db
        .update(meetings)
        .set({
          status: "processing",
          endedAt: meeting.endedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, meetingId));

      if (meeting.transcriptUrl) {
        await inngest.send({
          name: "meetings/processing",
          data: { meetingId, transcriptUrl: meeting.transcriptUrl },
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  }

  if (eventType === "call.transcription_ready") {
    const event = payload as unknown as CallTranscriptionReadyEvent;
    const meetingId = getMeetingIdFromCid(event.call_cid);

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!meeting) {
      console.error(`Stream webhook: meeting ${meetingId} not found`);
      return NextResponse.json({ status: "ignored" });
    }

    if (meeting.status === "cancelled") {
      return NextResponse.json({ status: "ignored" });
    }

    await db
      .update(meetings)
      .set({
        transcriptUrl: event.call_transcription.url,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    // If the call is still active, wait for call.session_ended to trigger analysis.
    if (meeting.status !== "active") {
      await inngest.send({
        name: "meetings/processing",
        data: { meetingId, transcriptUrl: event.call_transcription.url },
      });
    }

    return NextResponse.json({ status: "ok" });
  }

  if (eventType === "call.transcription_failed") {
    const event = payload as unknown as CallTranscriptionFailedEvent;
    const meetingId = getMeetingIdFromCid(event.call_cid);

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (!meeting) {
      console.error(`Stream webhook: meeting ${meetingId} not found`);
      return NextResponse.json({ status: "ignored" });
    }

    if (["cancelled", "completed"].includes(meeting.status)) {
      return NextResponse.json({ status: "ignored" });
    }

    const reason =
      event.error?.trim() ||
      "Stream could not transcribe this call. Check that transcription is enabled for the call.";

    await db
      .update(meetings)
      .set({
        status: "failed",
        analysisError: reason,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    await db.insert(notifications).values({
      userId: meeting.userId,
      type: "meeting_failed",
      title: "Transcription Failed",
      message: `Apex Agent could not transcribe "${meeting.name}". ${reason}`,
      meetingId,
    });

    return NextResponse.json({ status: "ok" });
  }

  if (eventType === "call.recording_ready") {
    const event = payload as unknown as CallRecordingReadyEvent;
    const meetingId = getMeetingIdFromCid(event.call_cid);

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    await db
      .update(meetings)
      .set({
        recordingUrl: event.call_recording.url,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({ status: "ok" });
}
