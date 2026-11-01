import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRPCError } from "@trpc/server";
import { MeetingStatus } from "../types";
import { evaluateInviteContext } from "./guest-access-policy";
import { createGuestAccessOperations } from "./guest-access-operations";

const future = new Date("2026-11-01T12:00:00.000Z");
const baseRow = () => ({
  invite: {
    id: "invite-1",
    requireAccount: false,
    expiresAt: new Date("2026-11-02T00:00:00.000Z"),
    revokedAt: null as Date | null,
  },
  meeting: {
    id: "meeting-1",
    userId: "host-1",
    status: MeetingStatus.ACTIVE,
    scheduledAt: null as Date | null,
    endsAt: null as Date | null,
    durationMinutes: 30,
  },
  hostName: "Host",
  agentName: "Agent",
});

const fixture = () => {
  const row = baseRow();
  const calls = {
    scopes: [] as string[],
    identities: [] as Array<{ meetingId: string; inviteId: string; displayName?: string; sessionUser?: { id: string; name: string; image?: string | null } | null }>,
    increments: [] as Array<{ inviteId: string; usedAt: Date }>,
    revocations: [] as Array<{ inviteIds: string[]; meetingId: string }>,
    tokens: [] as Array<{ user_id: string; validity_in_seconds: number }>,
    users: [] as Array<{ id: string; role: string }>,
    callMembers: [] as Array<{ meetingId: string; userId: string }>,
  };
  let session: { id: string; name: string; image?: string | null } | null = null;
  let owner = true;
  let streamFailure = false;
  let membershipFailure = false;
  const operations = createGuestAccessOperations({
    enforceRateLimit: async (scope) => { calls.scopes.push(scope); },
    loadInviteContext: async ({ meetingId, token }) => evaluateInviteContext(
      meetingId === row.meeting.id && token === row.invite.id ? row : undefined,
      future,
    ),
    getSession: async () => session,
    createGuestIdentity: async (input) => {
      calls.identities.push(input);
      return input.sessionUser
        ? { userId: input.sessionUser.id, userName: input.sessionUser.name, userImage: input.sessionUser.image ?? "avatar", guestRecordId: null }
        : { userId: "guest-1", userName: input.displayName ?? "Guest", userImage: "avatar", guestRecordId: "guest-1" };
    },
    assertGuestTokenOwner: async ({ guestId, sessionUserId }) => {
      if (guestId !== "guest-1" && guestId !== sessionUserId) throw new TRPCError({ code: "FORBIDDEN" });
    },
    toGuestMeeting: (context) => ({ meetingId: context.meeting.id }),
    stream: {
      upsertUsers: async (users) => {
        if (streamFailure) throw new Error("mock Stream outage");
        calls.users.push(...users.map(({ id, role }) => ({ id, role })));
      },
      generateUserToken: (input) => { calls.tokens.push(input); return "stream-token"; },
      video: {
        call: (_type, meetingId) => ({
          updateCallMembers: async ({ update_members }) => {
            if (membershipFailure) throw new Error("mock Stream membership outage");
            calls.callMembers.push(...update_members.map(({ user_id }) => ({ meetingId, userId: user_id })));
          },
        }),
      },
    },
    incrementInviteUse: async (inviteId, usedAt) => { calls.increments.push({ inviteId, usedAt }); },
    isMeetingOwned: async () => owner,
    getInviteId: async (_meetingId, inviteId) => inviteId === row.invite.id ? inviteId : null,
    markInviteRevoked: async (_meetingId, _inviteId, revokedAt) => { row.invite.revokedAt = revokedAt; },
    revokeStreamUsers: async (inviteIds, meetingId) => {
      calls.revocations.push({ inviteIds, meetingId });
      if (streamFailure) return { tokenRevocationSucceeded: false, kickedCount: 0 };
    },
    now: () => future,
  });
  return {
    calls,
    operations,
    row,
    setSession: (value: typeof session) => { session = value; },
    setOwner: (value: boolean) => { owner = value; },
    setStreamFailure: (value: boolean) => { streamFailure = value; },
    setMembershipFailure: (value: boolean) => { membershipFailure = value; },
  };
};

const rejectsTRPCCode = async (promise: Promise<unknown>, code: string) => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof TRPCError && error.code === code,
  );
};

describe("guest access operations (mocked repository, auth and Stream)", () => {
  it("validates invites and reports anonymous, signed-in and host viewers", async () => {
    const f = fixture();
    assert.deepEqual(await f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), {
      meeting: { meetingId: "meeting-1" },
      viewer: { authenticated: false, isHost: false, name: null },
    });
    f.setSession({ id: "member-1", name: "Member" });
    assert.deepEqual((await f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" })).viewer,
      { authenticated: true, isHost: false, name: "Member" });
    f.setSession({ id: "host-1", name: "Host" });
    assert.equal((await f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" })).viewer.isHost, true);
  });

  it("rejects invalid, expired, revoked, cancelled, ended and not-yet-open invites", async () => {
    const f = fixture();
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "wrong", token: "invite-1" }), "NOT_FOUND");
    f.row.invite.expiresAt = future;
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
    f.row.invite.expiresAt = new Date("2026-11-02T00:00:00.000Z");
    f.row.invite.revokedAt = new Date("2026-10-31T00:00:00.000Z");
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "FORBIDDEN");
    f.row.invite.revokedAt = null;
    f.row.meeting.status = MeetingStatus.CANCELLED;
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
    f.row.meeting.status = MeetingStatus.COMPLETED;
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
    f.row.meeting.status = MeetingStatus.PROCESSING;
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
    f.row.meeting.status = MeetingStatus.FAILED;
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
    f.row.meeting.status = MeetingStatus.SCHEDULED;
    f.row.meeting.scheduledAt = new Date(future.getTime() + 60 * 60_000);
    await rejectsTRPCCode(f.operations.join({ meetingId: "meeting-1", token: "invite-1" }), "PRECONDITION_FAILED");
    f.row.meeting.scheduledAt = new Date(future.getTime() - 2 * 60 * 60_000);
    f.row.meeting.endsAt = new Date(future.getTime() - 60 * 60_000);
    await rejectsTRPCCode(f.operations.validateInvite({ meetingId: "meeting-1", token: "invite-1" }), "BAD_REQUEST");
  });

  it("joins anonymous guests, persists invite usage, and issues a 30-minute token", async () => {
    const f = fixture();
    const joined = await f.operations.join({ meetingId: "meeting-1", token: "invite-1", displayName: "Test Guest" });
    assert.equal(joined.userId, "guest-1");
    assert.equal(joined.guestRecordId, "guest-1");
    assert.equal(joined.expiresInSeconds, 1800);
    assert.equal(f.calls.increments[0]?.inviteId, "invite-1");
    assert.equal(f.calls.tokens[0]?.validity_in_seconds, 1800);
    assert.deepEqual(f.calls.users[0], { id: "guest-1", role: "user" });
    assert.deepEqual(f.calls.callMembers[0], { meetingId: "meeting-1", userId: "guest-1" });
  });

  it("keeps signed-in users as their own identity and enforces account-only invites", async () => {
    const f = fixture();
    f.setSession({ id: "member-1", name: "Member" });
    const joined = await f.operations.join({ meetingId: "meeting-1", token: "invite-1" });
    assert.equal(joined.userId, "member-1");
    assert.equal(joined.guestRecordId, null);
    assert.equal(f.calls.identities[0]?.sessionUser?.id, "member-1");
    assert.deepEqual(f.calls.users[0], { id: "member-1", role: "user" });
    assert.deepEqual(f.calls.callMembers[0], { meetingId: "meeting-1", userId: "member-1" });

    const restricted = fixture();
    restricted.row.invite.requireAccount = true;
    await rejectsTRPCCode(restricted.operations.join({ meetingId: "meeting-1", token: "invite-1" }), "FORBIDDEN");
    restricted.setSession({ id: "member-1", name: "Member" });
    assert.equal((await restricted.operations.join({ meetingId: "meeting-1", token: "invite-1" })).userId, "member-1");
  });

  it("requires invite ownership and current validity to refresh a guest token", async () => {
    const f = fixture();
    const refreshed = await f.operations.refreshToken({ meetingId: "meeting-1", token: "invite-1", guestId: "guest-1" });
    assert.equal(refreshed.expiresInSeconds, 1800);
    await rejectsTRPCCode(f.operations.refreshToken({ meetingId: "meeting-1", token: "invite-1", guestId: "other" }), "FORBIDDEN");
    f.row.invite.revokedAt = future;
    await rejectsTRPCCode(f.operations.refreshToken({ meetingId: "meeting-1", token: "invite-1", guestId: "guest-1" }), "FORBIDDEN");
    f.row.invite.revokedAt = null;
    f.row.invite.expiresAt = future;
    await rejectsTRPCCode(f.operations.refreshToken({ meetingId: "meeting-1", token: "invite-1", guestId: "guest-1" }), "BAD_REQUEST");
  });

  it("does not mint a token when the Stream user upsert fails", async () => {
    const f = fixture();
    f.setStreamFailure(true);
    await assert.rejects(f.operations.join({ meetingId: "meeting-1", token: "invite-1", displayName: "Guest" }), /Stream outage/);
    assert.equal(f.calls.tokens.length, 0);
    assert.equal(f.calls.increments.length, 0);
  });

  it("does not issue a token, increment invite usage, or return success when call membership update fails", async () => {
    const f = fixture();
    f.setMembershipFailure(true);

    await assert.rejects(
      f.operations.join({ meetingId: "meeting-1", token: "invite-1", displayName: "Guest" }),
      /Stream membership outage/,
    );
    assert.equal(f.calls.tokens.length, 0);
    assert.equal(f.calls.increments.length, 0);
    assert.equal(f.calls.callMembers.length, 0);
  });

  it("commits invite revocation before best-effort Stream cleanup and enforces host ownership", async () => {
    const f = fixture();
    f.setOwner(false);
    await rejectsTRPCCode(f.operations.revokeInvite({ meetingId: "meeting-1", inviteId: "invite-1", userId: "attacker" }), "NOT_FOUND");
    assert.equal(f.row.invite.revokedAt, null);
    f.setOwner(true);
    f.setStreamFailure(true);
    assert.deepEqual(await f.operations.revokeInvite({ meetingId: "meeting-1", inviteId: "invite-1", userId: "host-1" }), { success: true });
    assert.equal(
      (f.row.invite as { revokedAt: Date | null }).revokedAt?.getTime(),
      future.getTime(),
    );
    assert.deepEqual(f.calls.revocations, [{ inviteIds: ["invite-1"], meetingId: "meeting-1" }]);
    await rejectsTRPCCode(f.operations.refreshToken({ meetingId: "meeting-1", token: "invite-1", guestId: "guest-1" }), "FORBIDDEN");
  });
});
