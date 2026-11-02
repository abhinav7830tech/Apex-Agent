import { createHash } from "node:crypto";

export type StreamStartEvidence = { meetingId: string; streamEventId: string; actualStartedAt: Date };

/**
 * Stream's installed CallSessionStartedEvent declares call.session.started_at as
 * optional Date on the nested CallSessionResponse. The outer created_at is event
 * creation/receipt metadata and is intentionally never used as a start time.
 */
export const extractStreamStartEvidence = (payload: unknown): StreamStartEvidence | null => {
  if (!payload || typeof payload !== "object") return null;
  const event = payload as Record<string, unknown>;
  const call = event.call as Record<string, unknown> | undefined;
  const custom = call?.custom as Record<string, unknown> | undefined;
  const session = call?.session as Record<string, unknown> | undefined;
  const meetingId = typeof custom?.meetingId === "string" ? custom.meetingId.trim() : "";
  const callCid = typeof event.call_cid === "string" ? event.call_cid.trim() : "";
  const sessionId = typeof event.session_id === "string" ? event.session_id.trim() : "";
  const rawStart = session?.started_at;
  const actualStartedAt = rawStart instanceof Date
    ? new Date(rawStart.getTime())
    : typeof rawStart === "string" ? new Date(rawStart) : null;
  if (!meetingId || !callCid || !sessionId || !actualStartedAt || !Number.isFinite(actualStartedAt.getTime())) return null;
  // Stable across webhook retries; no untrusted event.created_at fallback.
  const streamEventId = `stream-session:${createHash("sha256").update(`${callCid}\n${sessionId}`).digest("hex")}`;
  return { meetingId, streamEventId, actualStartedAt };
};

export const commitVerifiedStreamStart = async (
  signatureVerified: boolean,
  payload: unknown,
  commit: (meetingId: string, streamEventId: string, actualStartedAt: Date) => Promise<string>,
) => {
  if (!signatureVerified) return "unverified" as const;
  const evidence = extractStreamStartEvidence(payload);
  if (!evidence) return "untrusted" as const;
  return commit(evidence.meetingId, evidence.streamEventId, evidence.actualStartedAt);
};
