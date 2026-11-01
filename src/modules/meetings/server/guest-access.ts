import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns } from "drizzle-orm";

import { db } from "@/db";
import {
  agents,
  meetingGuests,
  meetingInvites,
  meetings,
  user,
} from "@/db/schema";
import { GeneratedAvatarUri } from "@/lib/avatar";
import { MeetingStatus } from "../types";

/** Guests may enter the waiting room / join shortly before the start time. */
export const JOIN_EARLY_MS = 10 * 60 * 1000;
/** A scheduled meeting stays joinable for a short grace period after its end. */
export const JOIN_GRACE_MS = 15 * 60 * 1000;

export type GuestAccessState = "joinable" | "waiting";

export type GuestMeeting = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scheduledAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  hostName: string;
  agentName: string;
  participants: string[];
  requireAccount: boolean;
  state: GuestAccessState;
  joinableAt: string | null;
  serverTime: string;
};

const endOfMeeting = (meeting: {
  endsAt: Date | null;
  scheduledAt: Date | null;
  durationMinutes: number;
}) => {
  if (meeting.endsAt) return meeting.endsAt;
  if (!meeting.scheduledAt) return null;
  return new Date(
    meeting.scheduledAt.getTime() + meeting.durationMinutes * 60 * 1000,
  );
};

/**
 * Loads and validates an invitation. The token is the primary credential, so
 * a meeting id alone is never enough to join.
 */
export const loadInviteContext = async ({
  meetingId,
  token,
}: {
  meetingId: string;
  token: string;
}) => {
  const [row] = await db
    .select({
      invite: getTableColumns(meetingInvites),
      meeting: getTableColumns(meetings),
      hostName: user.name,
      agentName: agents.name,
    })
    .from(meetingInvites)
    .innerJoin(meetings, eq(meetingInvites.meetingId, meetings.id))
    .innerJoin(user, eq(meetings.userId, user.id))
    .innerJoin(agents, eq(meetings.agentId, agents.id))
    .where(
      and(eq(meetingInvites.id, token), eq(meetingInvites.meetingId, meetingId)),
    );

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

  const now = new Date();

  if (row.invite.expiresAt.getTime() <= now.getTime()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This invitation link has expired. Ask the host to send you a new invitation.",
    });
  }

  const { meeting } = row;

  if (meeting.status === MeetingStatus.CANCELLED) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This meeting has been cancelled by the host.",
    });
  }

  if (
    meeting.status === MeetingStatus.COMPLETED ||
    meeting.status === MeetingStatus.PROCESSING
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This meeting has already ended.",
    });
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
    } else if (
      closesAt &&
      now.getTime() > closesAt.getTime() + JOIN_GRACE_MS
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The scheduled time for this meeting has passed. Ask the host to reschedule or send a new invitation.",
      });
    }
  }

  return { ...row, state, joinableAt, now };
};

export const toGuestMeeting = ({
  invite,
  meeting,
  hostName,
  agentName,
  state,
  joinableAt,
  now,
}: Awaited<ReturnType<typeof loadInviteContext>>): GuestMeeting => ({
  id: meeting.id,
  name: meeting.name,
  description: meeting.description,
  status: meeting.status,
  scheduledAt: meeting.scheduledAt ? meeting.scheduledAt.toISOString() : null,
  endsAt: endOfMeeting(meeting)?.toISOString() ?? null,
  durationMinutes: meeting.durationMinutes,
  hostName,
  agentName,
  participants: meeting.participants ?? [],
  requireAccount: invite.requireAccount,
  state,
  joinableAt: joinableAt ? joinableAt.toISOString() : null,
  serverTime: now.toISOString(),
});

export const assertJoinable = (
  context: Awaited<ReturnType<typeof loadInviteContext>>,
) => {
  if (context.state !== "joinable") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The meeting is not open yet. Stay on this page and you will be able to join when the host starts it.",
    });
  }
};

export const sanitizeDisplayName = (value: string) => {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please enter a display name with at least 2 characters.",
    });
  }

  return cleaned.slice(0, 80);
};

export const createGuestIdentity = async ({
  meetingId,
  inviteId,
  displayName,
  sessionUser,
}: {
  meetingId: string;
  inviteId: string;
  displayName?: string;
  sessionUser?: { id: string; name: string; image?: string | null } | null;
}) => {
  if (sessionUser) {
    return {
      userId: sessionUser.id,
      userName: sessionUser.name,
      userImage:
        sessionUser.image ??
        GeneratedAvatarUri({ seed: sessionUser.name, variant: "initials" }),
      guestRecordId: null as string | null,
    };
  }

  const name = sanitizeDisplayName(displayName ?? "");
  const [guest] = await db
    .insert(meetingGuests)
    .values({
      meetingId,
      inviteId,
      displayName: name,
    })
    .returning();

  return {
    userId: guest.id,
    userName: guest.displayName,
    userImage: GeneratedAvatarUri({ seed: guest.displayName, variant: "initials" }),
    guestRecordId: guest.id,
  };
};

export const assertGuestTokenOwner = async ({
  meetingId,
  token,
  guestId,
  sessionUserId,
}: {
  meetingId: string;
  token: string;
  guestId: string;
  sessionUserId?: string | null;
}) => {
  if (sessionUserId && sessionUserId === guestId) {
    return;
  }

  const [guest] = await db
    .select({ id: meetingGuests.id })
    .from(meetingGuests)
    .where(
      and(
        eq(meetingGuests.id, guestId),
        eq(meetingGuests.meetingId, meetingId),
        eq(meetingGuests.inviteId, token),
      ),
    );

  if (!guest) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your guest session is no longer valid. Rejoin using the invitation link.",
    });
  }

  await db
    .update(meetingGuests)
    .set({ lastSeenAt: new Date() })
    .where(eq(meetingGuests.id, guest.id));
};
