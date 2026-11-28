import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { TRPCError } from "@trpc/server";
import type { InvitationDelivery } from "../invitation-result";
import { createMeetingOperation } from "./create-meeting-operation";
import {
  getInvitationSchedule,
  getMeetingInviteExpiry,
  meetingIdForRequest,
  passcodeForRequest,
  requireInvitableMeeting,
  resolveInvitationRecipients,
} from "./invitation-details";
import { sendInvitationBatchOnce } from "./invitation-delivery";

describe("meeting invitation details", () => {
  it("selects unique email addresses and counts invalid or duplicate entries", () => {
    assert.deepEqual(resolveInvitationRecipients([
      " First@Example.com ", "first@example.com", "Second@example.com", "A Participant", "",
    ]), {
      recipients: ["First@Example.com", "Second@example.com"],
      skipped: 3,
    });
  });

  it("keeps future invite links usable through the meeting with one hour of grace", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const scheduledAt = new Date("2026-11-22T10:00:00Z");
    assert.equal(getMeetingInviteExpiry({ scheduledAt, durationMinutes: 30, endsAt: null }, now).toISOString(),
      "2026-11-22T11:30:00.000Z");
    assert.equal(getMeetingInviteExpiry({ scheduledAt: now, durationMinutes: 30, endsAt: null }, now).toISOString(),
      "2026-11-01T11:30:00.000Z");
  });

  it("formats the scheduled date and time in the supplied timezone", () => {
    const scheduledAt = new Date("2026-11-06T00:15:00Z");
    assert.match(getInvitationSchedule(scheduledAt, "America/New_York").date, /November 5, 2026/);
    assert.match(getInvitationSchedule(scheduledAt, "America/New_York").time, /7:15 PM/);
    assert.equal(getInvitationSchedule(scheduledAt, "unrecognized").timezone, "UTC");
  });

  it("uses a stable creation identity per owner and a stable generated passcode on retry", () => {
    const meetingId = meetingIdForRequest("host-1", "request-1");
    assert.equal(meetingId, meetingIdForRequest("host-1", "request-1"));
    assert.notEqual(meetingId, meetingIdForRequest("host-2", "request-1"));
    assert.notEqual(meetingId, meetingIdForRequest("host-1", "request-2"));
    const passcode = passcodeForRequest(meetingId, "test-secret");
    assert.match(passcode, /^[1-9]\d{5}$/);
    assert.equal(passcode, passcodeForRequest(meetingId, "test-secret"));
  });

  it("requires meeting ownership and an open meeting to resend", () => {
    const meeting = { userId: "host-1", status: "scheduled" };
    assert.equal(requireInvitableMeeting(meeting, "host-1"), meeting);
    const hasCode = (code: string) => (error: unknown) => error instanceof TRPCError && error.code === code;
    assert.throws(() => requireInvitableMeeting(undefined, "host-1"), hasCode("NOT_FOUND"));
    assert.throws(() => requireInvitableMeeting(meeting, "host-2"), hasCode("NOT_FOUND"));
    assert.throws(() => requireInvitableMeeting({ ...meeting, status: "processing" }, "host-1"), hasCode("BAD_REQUEST"));
  });
});

describe("invitation retries", () => {
  it("uses the migration's unique claim to keep concurrent requests and later replays to one send", async (t) => {
    const sql = new PGlite();
    t.after(() => sql.close());
    await sql.exec("CREATE TABLE meetings (id text PRIMARY KEY); INSERT INTO meetings VALUES ('meeting-1');");
    await sql.exec(await readFile("drizzle/0008_meeting_email_invitations.sql", "utf8"));

    const requestKey = "meeting-email/meeting-1/creation";
    let sent = 0;
    const first = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const run = () => sendInvitationBatchOnce({
      count: 2,
      skipped: 1,
      claim: async (result) => {
        const insert = await sql.query(
          "INSERT INTO meeting_email_invitations VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING RETURNING request_key",
          [requestKey, "meeting-1", result],
        );
        if (insert.rows.length) return null;
        const stored = await sql.query<{ result: InvitationDelivery }>(
          "SELECT result FROM meeting_email_invitations WHERE request_key = $1",
          [requestKey],
        );
        return stored.rows[0].result;
      },
      send: async () => {
        sent++;
        first.resolve();
        await finish.promise;
        return { accepted: 2, failed: 0, unconfirmed: 0 };
      },
      save: async (result) => {
        await sql.query("UPDATE meeting_email_invitations SET result = $2::jsonb WHERE request_key = $1",
          [requestKey, result]);
      },
      onSaveError: () => assert.fail("result persistence failed"),
    });

    const request = run();
    await first.promise;
    const concurrent = await run();
    finish.resolve();
    const accepted = await request;
    assert.deepEqual(concurrent, { accepted: 0, failed: 0, unconfirmed: 2, skipped: 1 });
    assert.deepEqual(accepted, { accepted: 2, failed: 0, unconfirmed: 0, skipped: 1 });
    assert.deepEqual(await run(), accepted);
    assert.equal(sent, 1);
  });

  it("keeps the created meeting and development test context when Resend throws", async () => {
    const saved = { id: "meeting-1" };
    const meeting = await createMeetingOperation({
      persistMeeting: async () => saved,
      ensureStreamCall: async () => true,
      sendSuccessNotification: async () => undefined,
    });
    let stored: InvitationDelivery | null = null;
    const run = () => sendInvitationBatchOnce({
      count: 1,
      skipped: 0,
      testMode: true,
      claim: async (result) => {
        const previous = stored;
        stored ??= result;
        return previous;
      },
      send: async () => { throw new Error("connection timed out"); },
      save: async (result) => { stored = result; },
      onSaveError: () => assert.fail("result persistence failed"),
    });
    assert.equal(meeting, saved);
    assert.deepEqual(await run(), { accepted: 0, failed: 0, unconfirmed: 1, skipped: 0, testMode: true });
    assert.deepEqual(await run(), stored);
  });
});
