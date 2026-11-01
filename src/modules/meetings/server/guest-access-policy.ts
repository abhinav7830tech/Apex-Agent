import { TRPCError } from "@trpc/server";
import { MeetingStatus } from "../types";

/** Guests may enter the waiting room / join shortly before the start time. */
export const JOIN_EARLY_MS = 10 * 60 * 1000;
/** A scheduled meeting stays joinable for a short grace period after its end. */
export const JOIN_GRACE_MS = 15 * 60 * 1000;

export type GuestAccessState = "joinable" | "waiting";

export type GuestInviteContextRow = {
  invite: {
    revokedAt: Date | null;
    expiresAt: Date;
    requireAccount: boolean;
  };
  meeting: {
    status: string;
    scheduledAt: Date | null;
    endsAt: Date | null;
    durationMinutes: number;
  };
  hostName: string;
  agentName: string;
};

const endOfMeeting = (meeting: {
  endsAt: Date | null;
  scheduledAt: Date | null;
  durationMinutes: number;
}) => {
  if (meeting.endsAt) return meeting.endsAt;
  if (!meeting.scheduledAt) return null;
  return new Date(meeting.scheduledAt.getTime() + meeting.durationMinutes * 60_000);
};

/** Pure lifecycle and credential validation used by the DB loader and tests. */
export const evaluateInviteContext = <T extends GuestInviteContextRow>(
  row: T | undefined,
  now: Date,
) => {
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This invitation link is invalid. Check that you copied the full link, or ask the host for a new invitation.",
    });
  }
  if (row.invite.revokedAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This invitation link has been revoked by the host. Ask them for a new link.",
    });
  }
  if (row.invite.expiresAt.getTime() <= now.getTime()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This invitation link has expired. Ask the host to send you a new invitation.",
    });
  }

  const { meeting } = row;
  if (meeting.status === MeetingStatus.CANCELLED) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This meeting has been cancelled by the host." });
  }
  if (meeting.status === MeetingStatus.COMPLETED || meeting.status === MeetingStatus.PROCESSING) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This meeting has already ended." });
  }
  if (meeting.status === MeetingStatus.FAILED) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This meeting could not be completed, so it is no longer joinable.",
    });
  }

  let state: GuestAccessState = "joinable";
  let joinableAt: Date | null = null;
  if (meeting.status !== MeetingStatus.ACTIVE && meeting.scheduledAt) {
    const opensAt = new Date(meeting.scheduledAt.getTime() - JOIN_EARLY_MS);
    const closesAt = endOfMeeting(meeting);
    if (now.getTime() < opensAt.getTime()) {
      state = "waiting";
      joinableAt = opensAt;
    } else if (closesAt && now.getTime() > closesAt.getTime() + JOIN_GRACE_MS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The scheduled time for this meeting has passed. Ask the host to reschedule or send a new invitation.",
      });
    }
  }

  return { ...row, state, joinableAt, now };
};

export const assertJoinable = (context: { state: GuestAccessState }) => {
  if (context.state !== "joinable") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The meeting is not open yet. Stay on this page and you will be able to join when the host starts it.",
    });
  }
};

export const assertGuestJoinPolicy = (
  context: { state: GuestAccessState; invite: { requireAccount: boolean } },
  hasSession: boolean,
) => {
  assertJoinable(context);
  if (context.invite.requireAccount && !hasSession) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The host requires guests to sign in before joining this meeting.",
    });
  }
};

export const isGuestIdentityOwner = ({
  guest,
  guestId,
  meetingId,
  inviteId,
}: {
  guest: { id: string; meetingId: string; inviteId: string | null } | null | undefined;
  guestId: string;
  meetingId: string;
  inviteId: string;
}) =>
  Boolean(
    guest &&
      guest.id === guestId &&
      guest.meetingId === meetingId &&
      guest.inviteId === inviteId,
  );
