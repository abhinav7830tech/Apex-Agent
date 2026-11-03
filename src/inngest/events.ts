/**
 * Shared event contract for meeting processing.
 *
 * The event name is defined once and imported by every producer and by the
 * Inngest function trigger so a rename can never silently break the pipeline.
 */
export const MEETING_PROCESSING_EVENT = "meetings/processing" as const;

export type MeetingProcessingEventData = {
  meetingId: string;
  /**
   * Optional because the transcript is often not ready at the exact moment the
   * call ends. The processing function resolves it from Stream when absent.
   */
  transcriptUrl?: string | null;
};

/**
 * Inngest deduplicates events that share an `id` within its retention window.
 * Meeting lifecycle events must always carry a unique id so a genuine re-trigger
 * (end, retry, reconciliation) is never dropped as a duplicate.
 */
export const createMeetingProcessingEventId = (
  meetingId: string,
  reason: string,
) => {
  const uniqueSuffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `meeting-processing-${reason}-${meetingId}-${uniqueSuffix}`;
};
