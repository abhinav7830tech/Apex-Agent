import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeetingStatus } from "../types";
import {
  assertGuestJoinPolicy,
  evaluateInviteContext,
  isGuestIdentityOwner,
  type GuestInviteContextRow,
} from "./guest-access-policy";

const now = new Date("2026-11-01T12:00:00.000Z");
const validContext = (): GuestInviteContextRow => ({
  invite: {
    revokedAt: null as Date | null,
    expiresAt: new Date("2026-11-02T12:00:00.000Z"),
    requireAccount: false,
  },
  meeting: {
    status: MeetingStatus.ACTIVE,
    scheduledAt: null,
    endsAt: null,
    durationMinutes: 30,
  },
  hostName: "Host",
  agentName: "Agent",
});

describe("guest invite validation and lifecycle", () => {
  it("rejects missing, revoked, expired, and cancelled invite contexts", () => {
    assert.throws(() => evaluateInviteContext(undefined, now), { code: "NOT_FOUND" });
    const revoked = validContext();
    revoked.invite.revokedAt = new Date("2026-11-01T11:59:00.000Z");
    assert.throws(() => evaluateInviteContext(revoked, now), { code: "FORBIDDEN" });
    const expired = validContext();
    expired.invite.expiresAt = now;
    assert.throws(() => evaluateInviteContext(expired, now), { code: "BAD_REQUEST" });
    const cancelled = validContext();
    cancelled.meeting.status = MeetingStatus.CANCELLED;
    assert.throws(() => evaluateInviteContext(cancelled, now), { code: "BAD_REQUEST" });
  });

  it("permits valid active meetings and enforces scheduled waiting windows", () => {
    assert.equal(evaluateInviteContext(validContext(), now).state, "joinable");
    const scheduled = validContext();
    scheduled.meeting.status = MeetingStatus.SCHEDULED;
    scheduled.meeting.scheduledAt = new Date("2026-11-01T13:00:00.000Z");
    assert.equal(evaluateInviteContext(scheduled, now).state, "waiting");
  });

  it("applies account requirements to both join and refresh authorization", () => {
    const context = evaluateInviteContext(validContext(), now);
    assert.doesNotThrow(() => assertGuestJoinPolicy(context, false));
    context.invite.requireAccount = true;
    assert.throws(() => assertGuestJoinPolicy(context, false), { code: "FORBIDDEN" });
    assert.doesNotThrow(() => assertGuestJoinPolicy(context, true));
  });

  it("binds anonymous refresh ownership to guest, meeting, and invite", () => {
    const guest = { id: "guest_1", meetingId: "meeting_1", inviteId: "invite_1" };
    assert.equal(
      isGuestIdentityOwner({ guest, guestId: "guest_1", meetingId: "meeting_1", inviteId: "invite_1" }),
      true,
    );
    assert.equal(
      isGuestIdentityOwner({ guest, guestId: "guest_1", meetingId: "meeting_2", inviteId: "invite_1" }),
      false,
    );
    assert.equal(
      isGuestIdentityOwner({ guest, guestId: "guest_1", meetingId: "meeting_1", inviteId: "invite_2" }),
      false,
    );
  });
});
