import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMeetingProcessingEventId,
  MEETING_PROCESSING_EVENT,
} from "@/inngest/events";

describe("meeting processing event contract", () => {
  it("uses the event name the Inngest function triggers on", () => {
    assert.equal(MEETING_PROCESSING_EVENT, "meetings/processing");
  });

  it("generates a unique event id per trigger so retries are not deduplicated", () => {
    assert.notEqual(
      createMeetingProcessingEventId("meeting-1", "meeting-ended"),
      createMeetingProcessingEventId("meeting-1", "meeting-ended"),
    );
  });
});
