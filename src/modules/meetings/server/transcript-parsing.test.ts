import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTranscript } from "./transcript-parsing";

describe("meeting transcript parsing", () => {
  it("parses the newline-delimited JSON format Stream CDN serves", () => {
    const raw = [
      '{"speaker_id":"user-1","type":"speech","text":"Hello everyone.","start_ts":0,"stop_ts":1500}',
      '{"speaker_id":"agent-1","type":"speech","text":"Welcome.","start_ts":1600,"stop_ts":3200}',
      '{"speaker_id":"user-1","type":"speech","text":"  ","start_ts":3300,"stop_ts":3400}',
    ].join("\n");

    const parsed = parseTranscript(raw);

    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], {
      speakerId: "user-1",
      speakerName: "Unknown",
      text: "Hello everyone.",
      startMs: 0,
      endMs: 1500,
    });
    assert.equal(parsed[1].speakerId, "agent-1");
  });

  it("parses a JSON array and normalizes milliseconds fields", () => {
    const parsed = parseTranscript(
      JSON.stringify([
        {
          speakerId: "guest-1",
          speakerName: "Guest",
          text: "A decision was made.",
          startMs: 1000.4,
          endMs: 2500.6,
        },
      ]),
    );

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].speakerName, "Guest");
    assert.equal(parsed[0].startMs, 1000);
    assert.equal(parsed[0].endMs, 2501);
  });

  it("returns no items for empty, malformed, or speaker-less input", () => {
    assert.deepEqual(parseTranscript(""), []);
    assert.deepEqual(parseTranscript("not json at all"), []);
    assert.deepEqual(
      parseTranscript('[{"text":"No speaker","start_ts":0}]'),
      [],
    );
  });
});
