import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  agents,
  meetingGuests,
  meetingInvites,
  meetings,
  user,
} from "@/db/schema";
import { GeneratedAvatarUri } from "@/lib/avatar";
import { streamVideo } from "@/lib/stream-video";
import { revokeStreamGuestIdentities } from "./stream-guest-revocation";
import {
  evaluateInviteContext,
  isGuestIdentityOwner,
  type GuestAccessState,
} from "./guest-access-policy";

export { assertGuestJoinPolicy } from "./guest-access-policy";
export type { GuestAccessState } from "./guest-access-policy";

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
  requiresPasscode: boolean;
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

  return evaluateInviteContext(row, new Date());
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
  requiresPasscode: Boolean(meeting.passcodeHash),
  state,
  joinableAt: joinableAt ? joinableAt.toISOString() : null,
  serverTime: now.toISOString(),
});

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
    .select({
      id: meetingGuests.id,
      meetingId: meetingGuests.meetingId,
      inviteId: meetingGuests.inviteId,
    })
    .from(meetingGuests)
    .where(
      and(
        eq(meetingGuests.id, guestId),
        eq(meetingGuests.meetingId, meetingId),
        eq(meetingGuests.inviteId, token),
      ),
    );

  if (!isGuestIdentityOwner({
    guest,
    guestId,
    meetingId,
    inviteId: token,
  })) {
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

/**
 * Invalidate anonymous Stream identities attached to revoked invites. Stream
 * rejects tokens issued before this timestamp; kicking blocks a current call
 * session. This cannot revoke signed-in Apex accounts shared across invites.
 */
export const revokeInviteStreamUsers = async (inviteIds: string[], meetingId: string) => {
  if (!inviteIds.length) return;
  const guests = await db
    .select({ id: meetingGuests.id })
    .from(meetingGuests)
    .where(inArray(meetingGuests.inviteId, inviteIds));
  return revokeStreamGuestIdentities({
    guestIds: guests.map(({ id }) => id),
    meetingId,
    client: streamVideo,
  });
};
