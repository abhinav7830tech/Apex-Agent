import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  latestTranscriptionUrl,
  lookupStreamTranscriptUrl,
  TRANSCRIPT_POLL_DELAYS,
} from "./transcript-resolution";

describe("Stream transcript resolution", () => {
  it("returns the newest non-empty transcription URL", () => {
    assert.equal(
      latestTranscriptionUrl([
        { url: "https://cdn.example.com/old.jsonl" },
        { url: "" },
        { url: "https://cdn.example.com/new.jsonl" },
        { url: "   " },
      ]),
      "https://cdn.example.com/new.jsonl",
    );
  });

  it("returns null when no transcription has a usable URL", () => {
    assert.equal(latestTranscriptionUrl([]), null);
    assert.equal(latestTranscriptionUrl(null), null);
    assert.equal(latestTranscriptionUrl([{ url: null }, {}]), null);
  });

  it("distinguishes a missing transcript from a Stream lookup failure", async () => {
    const missing = await lookupStreamTranscriptUrl(async () => ({
      transcriptions: [],
    }));
    assert.deepEqual(missing, { status: "missing" });

    const found = await lookupStreamTranscriptUrl(async () => ({
      transcriptions: [{ url: "https://cdn.example.com/transcript.jsonl" }],
    }));
    assert.deepEqual(found, {
      status: "found",
      url: "https://cdn.example.com/transcript.jsonl",
    });

    const failed = await lookupStreamTranscriptUrl(async () => {
      throw new Error("stream unavailable");
    });
    assert.equal(failed.status, "error");
    assert.equal(
      failed.status === "error" ? failed.message : null,
      "stream unavailable",
    );
  });

  it("keeps a bounded polling window", () => {
    assert.ok(TRANSCRIPT_POLL_DELAYS.length > 0);
    assert.ok(TRANSCRIPT_POLL_DELAYS.length <= 8);
  });
});
