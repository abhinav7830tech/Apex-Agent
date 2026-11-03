/**
 * Stream transcription resolution helpers.
 *
 * Kept free of `server-only` imports so they can be unit tested without a real
 * Stream client. The Inngest function supplies the actual `listTranscriptions`
 * callback.
 */

export type TranscriptionRecord = { url?: string | null } | null | undefined;

export type TranscriptLookup =
  | { status: "found"; url: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export type TranscriptionListResult =
  | { transcriptions?: TranscriptionRecord[] | null }
  | null
  | undefined;

/**
 * Stream returns transcriptions oldest-first. Take the newest usable URL.
 */
export const latestTranscriptionUrl = (
  transcriptions: readonly TranscriptionRecord[] | null | undefined,
): string | null => {
  if (!Array.isArray(transcriptions)) return null;

  for (let index = transcriptions.length - 1; index >= 0; index -= 1) {
    const url = transcriptions[index]?.url;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }

  return null;
};

/**
 * Distinguishes "Stream answered: nothing ready yet" from "Stream lookup
 * failed". The caller must not mark a meeting failed on a transient API error.
 */
export const lookupStreamTranscriptUrl = async (
  listTranscriptions: () => Promise<TranscriptionListResult>,
): Promise<TranscriptLookup> => {
  try {
    const result = await listTranscriptions();
    const url = latestTranscriptionUrl(result?.transcriptions ?? []);
    return url ? { status: "found", url } : { status: "missing" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unknown Stream lookup error",
    };
  }
};

/**
 * Bounded, durable polling schedule used with `step.sleep`. Stream transcript
 * egress is asynchronous and is typically ready within a few minutes; the total
 * wait here is ~19 minutes before the workflow gives up with a clear error.
 */
export const TRANSCRIPT_POLL_DELAYS = [
  "15s",
  "30s",
  "1m",
  "2m",
  "5m",
  "10m",
] as const;
