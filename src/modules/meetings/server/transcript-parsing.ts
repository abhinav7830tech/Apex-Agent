export type NormalizedTranscriptItem = {
  speakerId: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
};

export const normalizeTranscriptItems = (
  raw: unknown,
): NormalizedTranscriptItem[] => {
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

/**
 * Parses both formats Stream can produce:
 * - a JSON array of transcript items
 * - newline-delimited JSON (`.jsonl`), which is what Stream CDN currently serves
 */
export const parseTranscript = (raw: string): NormalizedTranscriptItem[] => {
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
