import { TRPCError } from "@trpc/server";
import { assertGuestJoinPolicy } from "./guest-access-policy";

export type GuestSessionUser = {
  id: string;
  name: string;
  image?: string | null;
};

export type GuestAccessContext = {
  invite: {
    id: string;
    requireAccount: boolean;
  };
  meeting: {
    id: string;
    userId: string;
  };
  state: "joinable" | "waiting";
};

type GuestIdentity = {
  userId: string;
  userName: string;
  userImage: string;
  guestRecordId: string | null;
};

type GuestStreamClient = {
  upsertUsers: (users: Array<{
    id: string;
    name: string;
    role: string;
    image: string;
  }>) => Promise<unknown>;
  generateUserToken: (input: {
    user_id: string;
    validity_in_seconds: number;
  }) => string;
};

type RateLimitScope = "validate" | "join" | "refresh";

/** Injectable operations used by the public guest tRPC procedures. */
export const createGuestAccessOperations = <
  TContext extends GuestAccessContext,
  TMeeting,
>({
  enforceRateLimit,
  loadInviteContext,
  getSession,
  createGuestIdentity,
  assertGuestTokenOwner,
  toGuestMeeting,
  stream,
  incrementInviteUse,
  isMeetingOwned,
  getInviteId,
  markInviteRevoked,
  revokeStreamUsers,
  now = () => new Date(),
}: {
  enforceRateLimit: (scope: RateLimitScope) => Promise<void>;
  loadInviteContext: (input: { meetingId: string; token: string }) => Promise<TContext>;
  getSession: () => Promise<GuestSessionUser | null>;
  createGuestIdentity: (input: {
    meetingId: string;
    inviteId: string;
    displayName?: string;
    sessionUser?: GuestSessionUser | null;
  }) => Promise<GuestIdentity>;
  assertGuestTokenOwner: (input: {
    meetingId: string;
    token: string;
    guestId: string;
    sessionUserId?: string | null;
  }) => Promise<void>;
  toGuestMeeting: (context: TContext) => TMeeting;
  stream: GuestStreamClient;
  incrementInviteUse: (inviteId: string, usedAt: Date) => Promise<void>;
  isMeetingOwned: (meetingId: string, userId: string) => Promise<boolean>;
  getInviteId: (meetingId: string, inviteId: string) => Promise<string | null>;
  markInviteRevoked: (meetingId: string, inviteId: string, revokedAt: Date) => Promise<void>;
  revokeStreamUsers: (inviteIds: string[], meetingId: string) => Promise<unknown>;
  now?: () => Date;
}) => ({
  async validateInvite(input: { meetingId: string; token: string }) {
    await enforceRateLimit("validate");
    const context = await loadInviteContext(input);
    const session = await getSession();

    return {
      meeting: toGuestMeeting(context),
      viewer: {
        authenticated: Boolean(session),
        isHost: session?.id === context.meeting.userId,
        name: session?.name ?? null,
      },
    };
  },

  async join(input: {
    meetingId: string;
    token: string;
    displayName?: string;
  }) {
    await enforceRateLimit("join");
    const context = await loadInviteContext(input);
    const session = await getSession();
    assertGuestJoinPolicy(context, Boolean(session));

    const identity = await createGuestIdentity({
      meetingId: context.meeting.id,
      inviteId: context.invite.id,
      displayName: input.displayName,
      sessionUser: session,
    });

    await stream.upsertUsers([
      {
        id: identity.userId,
        name: identity.userName,
        role: "user",
        image: identity.userImage,
      },
    ]);

    const validityInSeconds = 30 * 60;
    const streamToken = stream.generateUserToken({
      user_id: identity.userId,
      validity_in_seconds: validityInSeconds,
    });
    await incrementInviteUse(context.invite.id, now());

    return {
      ...identity,
      streamToken,
      expiresInSeconds: validityInSeconds,
      meeting: toGuestMeeting(context),
    };
  },

  async refreshToken(input: {
    meetingId: string;
    token: string;
    guestId: string;
  }) {
    await enforceRateLimit("refresh");
    const context = await loadInviteContext(input);
    const session = await getSession();
    assertGuestJoinPolicy(context, Boolean(session));
    await assertGuestTokenOwner({
      meetingId: input.meetingId,
      token: input.token,
      guestId: input.guestId,
      sessionUserId: session?.id,
    });

    const validityInSeconds = 30 * 60;
    const streamToken = stream.generateUserToken({
      user_id: input.guestId,
      validity_in_seconds: validityInSeconds,
    });
    return { streamToken, expiresInSeconds: validityInSeconds };
  },

  async revokeInvite(input: {
    meetingId: string;
    inviteId: string;
    userId: string;
  }) {
    if (!(await isMeetingOwned(input.meetingId, input.userId))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
    }

    const inviteId = await getInviteId(input.meetingId, input.inviteId);
    await markInviteRevoked(input.meetingId, input.inviteId, now());
    if (inviteId) await revokeStreamUsers([inviteId], input.meetingId);
    return { success: true };
  },
});
