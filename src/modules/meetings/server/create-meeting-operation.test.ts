import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRPCError } from "@trpc/server";
import { createMeetingOperation } from "./create-meeting-operation";

describe("meeting creation Stream setup (mocked persistence and Stream)", () => {
  it("preserves the saved meeting and reports setup failure without a success notification", async () => {
    const persisted = { id: "meeting-1", name: "Planning" };
    const calls: string[] = [];

    await assert.rejects(
      createMeetingOperation({
        persistMeeting: async () => { calls.push("persist"); return persisted; },
        ensureStreamCall: async (meeting) => {
          assert.equal(meeting, persisted);
          calls.push("stream-setup");
          return false;
        },
        sendSuccessNotification: async () => { calls.push("notification"); },
      }),
      (error: unknown) =>
        error instanceof TRPCError &&
        error.code === "INTERNAL_SERVER_ERROR" &&
        /meeting was saved/i.test(error.message) &&
        /retry joining/i.test(error.message),
    );

    assert.deepEqual(calls, ["persist", "stream-setup"]);
  });

  it("returns the meeting and sends the existing success notification after setup succeeds", async () => {
    const meeting = { id: "meeting-2" };
    const calls: string[] = [];

    assert.equal(
      await createMeetingOperation({
        persistMeeting: async () => meeting,
        ensureStreamCall: async () => { calls.push("stream-setup"); return true; },
        sendSuccessNotification: async (created) => {
          assert.equal(created, meeting);
          calls.push("notification");
        },
      }),
      meeting,
    );
    assert.deepEqual(calls, ["stream-setup", "notification"]);
  });
});
