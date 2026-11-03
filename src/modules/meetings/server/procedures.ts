import { db } from "@/db";
import {
  agents,
  meetingGuests,
  meetingInvites,
  meetingParticipants,
  meetings,
  notifications,
  transcriptSegments,
} from "@/db/schema";
import { generatePasscode, hashPasscode, verifyPasscode } from "@/lib/passcode";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  AppUrlConfigurationError,
  buildMeetingInviteUrl,
  getRequiredAppBaseUrl,
} from "@/lib/app-url";
import {
  assertGuestTokenOwner,
  createGuestIdentity,
  loadInviteContext,
  revokeInviteStreamUsers,
  toGuestMeeting,
} from "./guest-access";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/constants";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus } from "../types";
import { getMeetingEnd, parseScheduledAt } from "../utils";
import { streamVideo } from "@/lib/stream-video";
import { GeneratedAvatarUri } from "@/lib/avatar";
import { getOpenAIClient, isOpenAIConfigured, OPENAI_MODEL } from "@/lib/openai";
import { enforcePublicGuestRateLimit } from "@/lib/public-rate-limit";
import { createGuestAccessOperations } from "./guest-access-operations";
import {
  createHostTokenOperation,
  hostTokenInputSchema,
} from "./stream-token-operations";
import { callMemberUpdates } from "./stream-call-members";
import { createMeetingOperation } from "./create-meeting-operation";

const CLOSED_STATUSES = [
  MeetingStatus.COMPLETED,
  MeetingStatus.CANCELLED,
  MeetingStatus.FAILED,
] as const;

const ensureAgentOwnership = async (userId: string, agentId: string) => {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)));

  if (!agent) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agent not found or you do not have access to it",
    });
  }

  return agent;
};

const assertNoOverlap = async ({
  userId,
  scheduledAt,
  endsAt,
  excludeMeetingId,
}: {
  userId: string;
  scheduledAt: Date;
  endsAt: Date;
  excludeMeetingId?: string;
}) => {
  const conditions = [
    eq(meetings.userId, userId),
    isNotNull(meetings.scheduledAt),
    isNotNull(meetings.endsAt),
    notInArray(meetings.status, [...CLOSED_STATUSES]),
    lt(meetings.scheduledAt, endsAt),
    gt(meetings.endsAt, scheduledAt),
  ];

  if (excludeMeetingId) {
    conditions.push(ne(meetings.id, excludeMeetingId));
  }

  const [conflict] = await db
    .select({ id: meetings.id, name: meetings.name, scheduledAt: meetings.scheduledAt })
    .from(meetings)
    .where(and(...conditions))
    .limit(1);

  if (conflict) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This time overlaps with "${conflict.name}". Choose another time slot.`,
    });
  }
};

const createNotification = async (input: {
  userId: string;
  type:
    | "meeting_reminder"
    | "meeting_started"
    | "meeting_ended"
    | "meeting_cancelled"
    | "meeting_updated"
    | "meeting_failed"
    | "summary_ready";
  title: string;
  message: string;
  meetingId: string;
}) => {
  await db.insert(notifications).values(input);
};

const guestAccessOperations = createGuestAccessOperations({
  enforceRateLimit: enforcePublicGuestRateLimit,
  loadInviteContext,
  getSession: async () => {
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      return session
        ? { id: session.user.id, name: session.user.name, image: session.user.image }
        : null;
    } catch {
      return null;
    }
  },
  createGuestIdentity,
  assertGuestTokenOwner,
  toGuestMeeting,
  stream: streamVideo,
  incrementInviteUse: async (inviteId, usedAt) => {
    await db
      .update(meetingInvites)
      .set({
        useCount: sql`${meetingInvites.useCount} + 1`,
        lastUsedAt: usedAt,
      })
      .where(eq(meetingInvites.id, inviteId));
  },
  isMeetingOwned: async (meetingId, userId) => {
    const [meeting] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)));
    return Boolean(meeting);
  },
  getInviteId: async (meetingId, inviteId) => {
    const [invite] = await db
      .select({ id: meetingInvites.id })
      .from(meetingInvites)
      .where(
        and(
          eq(meetingInvites.id, inviteId),
          eq(meetingInvites.meetingId, meetingId),
        ),
      );
    return invite?.id ?? null;
  },
  markInviteRevoked: async (meetingId, inviteId, revokedAt) => {
    await db
      .update(meetingInvites)
      .set({ revokedAt })
      .where(
        and(
          eq(meetingInvites.id, inviteId),
          eq(meetingInvites.meetingId, meetingId),
        ),
      );
  },
  revokeStreamUsers: revokeInviteStreamUsers,
  recordParticipantJoin: async ({ meetingId, userId, guestId, name, role }) => {
    try {
      await db.insert(meetingParticipants).values({
        meetingId,
        userId: userId ?? null,
        guestId: guestId ?? null,
        name,
        role: role || "participant",
      });
    } catch (error) {
      console.error("[PARTICIPANTS] Failed to record participant join", error);
    }
  },
});

const ensureStreamCall = async (input: {
  meetingId: string;
  meetingName: string;
  userId: string;
  agent: { id: string; name: string };
}) => {
  try {
    // 1. Ensure both host and agent exist in Stream first.
    await streamVideo.upsertUsers([
      {
        id: input.userId,
        name: "Meeting Host",
        role: "user",
      },
      {
        id: input.agent.id,
        name: input.agent.name,
        role: "user",
        image: GeneratedAvatarUri({
          seed: input.agent.name,
          variant: "botttsNeutral",
        }),
      },
    ]);

    // 2. Create or get the Stream call.
    const call = streamVideo.video.call("default", input.meetingId);

    await call.getOrCreate({
      data: {
        created_by_id: input.userId,
        custom: {
          meetingId: input.meetingId,
          meetingName: input.meetingName,
        },
        settings_override: {
          transcription: {
            language: "en",
            mode: "auto-on",
            closed_caption_mode: "auto-on",
          },
          recording: {
            mode: "auto-on",
            quality: "1080p",
          },
        },
      },
    });

    // 3. Add host and agent after their Stream users exist.
    await call.updateCallMembers(
      callMemberUpdates(input.userId, input.agent.id),
    );

    return true;
  } catch (error) {
    console.error(
      "[STREAM] Failed to create call for meeting",
      input.meetingId,
      error,
    );
    return false;
  }
};


const generateHostStreamToken = createHostTokenOperation({
  getOwnedMeeting: async (meetingId, userId) => {
    const [meeting] = await db
      .select({ id: meetings.id, name: meetings.name, agentId: meetings.agentId })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), eq(meetings.userId, userId)));
    return meeting ?? null;
  },
  ensureCall: async (meeting, user) => {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, meeting.agentId));

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Meeting agent not found" });
    }

    const ensured = await ensureStreamCall({
      meetingId: meeting.id,
      meetingName: meeting.name,
      userId: user.id,
      agent,
    });
    if (!ensured) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to authorize meeting call" });
    }
  },
  upsertUser: async (user) => {
    await streamVideo.upsertUsers([
      {
        id: user.id,
        name: user.name,
        role: user.role,
        image:
          user.image ??
          GeneratedAvatarUri({ seed: user.name, variant: "initials" }),
      },
    ]);
  },
  generateToken: (userId) =>
    streamVideo.generateUserToken({
      user_id: userId,
      validity_in_seconds: 3600,
    }),
});

export const meetingsRouter = createTRPCRouter({
  generateToken: protectedProcedure
    .input(hostTokenInputSchema)
    .mutation(({ ctx, input }) =>
      generateHostStreamToken({
        meetingId: input.meetingId,
        user: {
          id: ctx.auth.user.id,
          name: ctx.auth.user.name,
          image: ctx.auth.user.image,
        },
      }),
    ),

  createInvite: protectedProcedure
    .input(
      z.object({
        meetingId: z.string().min(1),
        regenerate: z.boolean().optional(),
        requireAccount: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id),
          ),
        );

      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found or you do not have access to it.",
        });
      }

      if (
        [
          MeetingStatus.CANCELLED,
          MeetingStatus.COMPLETED,
          MeetingStatus.FAILED,
          MeetingStatus.PROCESSING,
        ].includes(meeting.status as MeetingStatus)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This meeting has ended, so new invitations cannot be created.",
        });
      }

      let baseUrl: string;
      try {
        baseUrl = getRequiredAppBaseUrl();
      } catch (error) {
        if (error instanceof AppUrlConfigurationError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }

      const now = new Date();

      if (input.regenerate) {
        const activeInvites = await db
          .select({ id: meetingInvites.id })
          .from(meetingInvites)
          .where(
            and(
              eq(meetingInvites.meetingId, meeting.id),
              isNull(meetingInvites.revokedAt),
            ),
          );
        await db
          .update(meetingInvites)
          .set({ revokedAt: now })
          .where(
            and(
              eq(meetingInvites.meetingId, meeting.id),
              isNull(meetingInvites.revokedAt),
            ),
          );
        await revokeInviteStreamUsers(
          activeInvites.map(({ id }) => id),
          meeting.id,
        );
      } else {
        const [existing] = await db
          .select()
          .from(meetingInvites)
          .where(
            and(
              eq(meetingInvites.meetingId, meeting.id),
              isNull(meetingInvites.revokedAt),
              gt(meetingInvites.expiresAt, now),
            ),
          )
          .orderBy(desc(meetingInvites.createdAt))
          .limit(1);

        if (existing) {
          if (
            input.requireAccount !== undefined &&
            existing.requireAccount !== input.requireAccount
          ) {
            const [updated] = await db
              .update(meetingInvites)
              .set({ requireAccount: input.requireAccount })
              .where(eq(meetingInvites.id, existing.id))
              .returning();

            return {
              token: updated.id,
              url: buildMeetingInviteUrl({
                meetingId: meeting.id,
                token: updated.id,
                baseUrl,
              }),
              expiresAt: updated.expiresAt,
              requireAccount: updated.requireAccount,
            };
          }

          return {
            token: existing.id,
            url: buildMeetingInviteUrl({
              meetingId: meeting.id,
              token: existing.id,
              baseUrl,
            }),
            expiresAt: existing.expiresAt,
            requireAccount: existing.requireAccount,
          };
        }
      }

      const meetingEndsAt =
        meeting.endsAt ??
        (meeting.scheduledAt
          ? new Date(
              meeting.scheduledAt.getTime() +
                meeting.durationMinutes * 60 * 1000,
            )
          : null);
      const defaultExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const meetingExpiry = meetingEndsAt
        ? new Date(meetingEndsAt.getTime() + 24 * 60 * 60 * 1000)
        : defaultExpiry;
      const expiresAt = new Date(
        Math.max(
          now.getTime() + 60 * 60 * 1000,
          Math.min(defaultExpiry.getTime(), meetingExpiry.getTime()),
        ),
      );

      const [invite] = await db
        .insert(meetingInvites)
        .values({
          meetingId: meeting.id,
          createdBy: ctx.auth.user.id,
          requireAccount: input.requireAccount ?? false,
          expiresAt,
        })
        .returning();

      return {
        token: invite.id,
        url: buildMeetingInviteUrl({
          meetingId: meeting.id,
          token: invite.id,
          baseUrl,
        }),
        expiresAt: invite.expiresAt,
        requireAccount: invite.requireAccount,
      };
    }),

  revokeInvite: protectedProcedure
    .input(z.object({ meetingId: z.string().min(1), inviteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return guestAccessOperations.revokeInvite({
        meetingId: input.meetingId,
        inviteId: input.inviteId,
        userId: ctx.auth.user.id,
      });
    }),

  getInvite: publicProcedure
    .input(z.object({ meetingId: z.string().min(1), token: z.string().min(1) }))
    .query(({ input }) => guestAccessOperations.validateInvite(input)),

  guestJoin: publicProcedure
    .input(
      z.object({
        meetingId: z.string().min(1),
        token: z.string().min(1),
        displayName: z.string().max(80).optional(),
        passcode: z.string().optional(),
      }),
    )
    .mutation(({ input }) => guestAccessOperations.join(input)),

  guestRefreshToken: publicProcedure
    .input(
      z.object({
        meetingId: z.string().min(1),
        token: z.string().min(1),
        guestId: z.string().min(1),
      }),
    )
    .mutation(({ input }) => guestAccessOperations.refreshToken(input)),

  update: protectedProcedure
    .input(meetingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;

      const [existingMeeting] = await db
        .select()
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.userId, ctx.auth.user.id)));

      if (!existingMeeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      if (
        existingMeeting.status === MeetingStatus.ACTIVE ||
        existingMeeting.status === MeetingStatus.PROCESSING
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An active or processing meeting cannot be edited.",
        });
      }

      if (changes.agentId) {
        await ensureAgentOwnership(ctx.auth.user.id, changes.agentId);
      }

      let scheduledAt = existingMeeting.scheduledAt;
      let endsAt = existingMeeting.endsAt;
      const durationMinutes =
        changes.durationMinutes ?? existingMeeting.durationMinutes;

      if (changes.scheduledAt !== undefined) {
        const parsed = parseScheduledAt(changes.scheduledAt);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter a valid meeting date and time.",
          });
        }
        if (parsed.getTime() < Date.now() - 2 * 60 * 1000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A meeting cannot be scheduled in the past.",
          });
        }
        scheduledAt = parsed;
        endsAt = getMeetingEnd(parsed, durationMinutes);
        await assertNoOverlap({
          userId: ctx.auth.user.id,
          scheduledAt: parsed,
          endsAt,
          excludeMeetingId: id,
        });
      } else if (changes.durationMinutes !== undefined && scheduledAt) {
        endsAt = getMeetingEnd(scheduledAt, durationMinutes);
        await assertNoOverlap({
          userId: ctx.auth.user.id,
          scheduledAt,
          endsAt,
          excludeMeetingId: id,
        });
      }

      const nextStatus =
        changes.scheduledAt !== undefined &&
        [MeetingStatus.CANCELLED, MeetingStatus.FAILED].includes(
          existingMeeting.status as MeetingStatus,
        )
          ? MeetingStatus.SCHEDULED
          : existingMeeting.status;

      const [updatedMeeting] = await db
        .update(meetings)
        .set({
          ...changes,
          scheduledAt,
          endsAt,
          durationMinutes,
          status: nextStatus,
          // A rescheduled meeting deserves a fresh reminder window.
          reminderSentAt:
            changes.scheduledAt !== undefined
              ? null
              : existingMeeting.reminderSentAt,
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, id), eq(meetings.userId, ctx.auth.user.id)))
        .returning();

      await createNotification({
        userId: updatedMeeting.userId,
        type: "meeting_updated",
        title: "Meeting Updated",
        message: `Your meeting "${updatedMeeting.name}" has been updated.`,
        meetingId: updatedMeeting.id,
      });

      return updatedMeeting;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found or access denied",
        });
      }

      if (meeting.status === MeetingStatus.ACTIVE) {
        try {
          await streamVideo.video.call("default", meeting.id).end();
        } catch (error) {
          console.error("[STREAM] Failed to end call before deleting meeting", error);
        }
      }

      const [removedMeeting] = await db
        .delete(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        )
        .returning();

      return removedMeeting;
    }),

  create: protectedProcedure
    .input(meetingsInsertSchema)
    .mutation(async ({ input, ctx }) => {
      const isInstant = Boolean(input.isInstant);
      let scheduledAt: Date;
      let endsAt: Date;
      let initialStatus = MeetingStatus.SCHEDULED;

      if (isInstant) {
        scheduledAt = new Date();
        endsAt = getMeetingEnd(scheduledAt, input.durationMinutes);
        initialStatus = MeetingStatus.ACTIVE;
      } else {
        const parsed = parseScheduledAt(input.scheduledAt ?? "");

        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter a valid meeting date and time.",
          });
        }

        if (parsed.getTime() < Date.now() - 2 * 60 * 1000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A meeting cannot be scheduled in the past.",
          });
        }

        scheduledAt = parsed;
        endsAt = getMeetingEnd(scheduledAt, input.durationMinutes);
        await assertNoOverlap({
          userId: ctx.auth.user.id,
          scheduledAt,
          endsAt,
        });
      }

      const agent = await ensureAgentOwnership(ctx.auth.user.id, input.agentId);
      const meetingId = nanoid();

      const rawPasscode = input.passcode?.trim() || generatePasscode();
      const passcodeHash = hashPasscode(rawPasscode);

      const createdMeetingResult = await createMeetingOperation({
        persistMeeting: async () => {
          const { isInstant: _, passcode: __, ...meetingValues } = input;
          const [createdMeeting] = await db
            .insert(meetings)
            .values({
              ...meetingValues,
              id: meetingId,
              scheduledAt,
              endsAt,
              passcodeHash,
              streamCallId: meetingId,
              status: initialStatus,
              startedAt: isInstant ? scheduledAt : null,
              userId: ctx.auth.user.id,
            })
            .returning();
          return createdMeeting;
        },
        ensureStreamCall: (createdMeeting) =>
          ensureStreamCall({
            meetingId: createdMeeting.id,
            meetingName: createdMeeting.name,
            userId: ctx.auth.user.id,
            agent,
          }),
        sendSuccessNotification: (createdMeeting) =>
          createNotification({
            userId: createdMeeting.userId,
            type: "meeting_reminder",
            title: isInstant ? "Instant Meeting Started" : "Meeting Scheduled",
            message: isInstant
              ? `Your meeting "${createdMeeting.name}" is live now.`
              : `Your meeting "${createdMeeting.name}" has been scheduled successfully.`,
            meetingId: createdMeeting.id,
          }),
      });

      // Automatically pre-create an active invitation link for seamless sharing
      let inviteUrl = "";
      let inviteToken = "";
      try {
        const baseUrl = getRequiredAppBaseUrl();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [invite] = await db
          .insert(meetingInvites)
          .values({
            meetingId: createdMeetingResult.id,
            createdBy: ctx.auth.user.id,
            expiresAt,
          })
          .returning();
        if (invite) {
          inviteToken = invite.id;
          inviteUrl = buildMeetingInviteUrl({
            meetingId: createdMeetingResult.id,
            token: invite.id,
            baseUrl,
          });
        }
      } catch (error) {
        console.warn("[MEETING_CREATE] Could not generate invite link at creation:", error);
      }

      return {
        ...createdMeetingResult,
        passcode: rawPasscode,
        inviteUrl,
        inviteToken,
      };
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const [existingMeeting] = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration: sql<number>`COALESCE(EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt})), 0)::int`.as(
            "duration",
          ),
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!existingMeeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      const participants = await db
        .select()
        .from(meetingParticipants)
        .where(eq(meetingParticipants.meetingId, input.id))
        .orderBy(asc(meetingParticipants.joinedAt));

      return {
        ...existingMeeting,
        hasPasscode: Boolean(existingMeeting.passcodeHash),
        participantRecords: participants,
      };
    }),

  getTranscript: protectedProcedure
    .input(z.object({ meetingId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const [meeting] = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id),
          ),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      return db
        .select({
          id: transcriptSegments.id,
          speakerId: transcriptSegments.speakerId,
          speakerName: transcriptSegments.speakerName,
          text: transcriptSegments.text,
          startMs: transcriptSegments.startMs,
          endMs: transcriptSegments.endMs,
        })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.meetingId, input.meetingId))
        .orderBy(asc(transcriptSegments.startMs));
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        )
        .limit(1);

      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found or you do not have permission to cancel it",
        });
      }

      if (
        [MeetingStatus.CANCELLED, MeetingStatus.COMPLETED].includes(
          meeting.status as MeetingStatus,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel a meeting that is already ${meeting.status}`,
        });
      }

      if (meeting.status === MeetingStatus.ACTIVE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This meeting is live. End the meeting instead of cancelling it.",
        });
      }

      const [updatedMeeting] = await db
        .update(meetings)
        .set({ status: MeetingStatus.CANCELLED, updatedAt: new Date() })
        .where(and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)))
        .returning();

      // Cancellation is terminal for the invitation credentials. If the host
      // later reactivates the meeting, they must issue a fresh invitation.
      const activeInvites = await db
        .select({ id: meetingInvites.id })
        .from(meetingInvites)
        .where(
          and(
            eq(meetingInvites.meetingId, input.id),
            isNull(meetingInvites.revokedAt),
          ),
        );
      await db
        .update(meetingInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(meetingInvites.meetingId, input.id),
            isNull(meetingInvites.revokedAt),
          ),
        );
      await revokeInviteStreamUsers(
        activeInvites.map(({ id }) => id),
        input.id,
      );

      try {
        await streamVideo.video.call("default", meeting.id).end();
      } catch (error) {
        console.error("[STREAM] Failed to end cancelled call", error);
      }

      await createNotification({
        userId: updatedMeeting.userId,
        type: "meeting_cancelled",
        title: "Meeting Cancelled",
        message: `Your meeting "${updatedMeeting.name}" has been cancelled.`,
        meetingId: updatedMeeting.id,
      });

      return updatedMeeting;
    }),

  end: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      let streamEnded = true;
      try {
        await streamVideo.video.call("default", meeting.id).end();
      } catch (error) {
        streamEnded = false;
        console.error("[STREAM] Failed to end call", error);
      }

      const [updatedMeeting] = await db
        .update(meetings)
        .set({
          status: MeetingStatus.PROCESSING,
          endedAt: meeting.endedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)))
        .returning();

      await createNotification({
        userId: updatedMeeting.userId,
        type: "meeting_ended",
        title: "Meeting Ended",
        message: streamEnded
          ? `"${updatedMeeting.name}" has ended. Apex Agent is now processing the transcript.`
          : `"${updatedMeeting.name}" was marked as ended, but Stream could not be reached. Check your Stream configuration.`,
        meetingId: updatedMeeting.id,
      });

      // Mark active participants as left
      await db
        .update(meetingParticipants)
        .set({ leftAt: new Date() })
        .where(
          and(
            eq(meetingParticipants.meetingId, meeting.id),
            isNull(meetingParticipants.leftAt),
          ),
        )
        .catch(() => undefined);

      // Check if Stream has completed transcriptions ready
      try {
        const call = streamVideo.video.call("default", meeting.id);
        const transcriptions = await call.listTranscriptions();
        if (transcriptions?.transcriptions?.length) {
          const latest = transcriptions.transcriptions[transcriptions.transcriptions.length - 1];
          if (latest?.url) {
            updatedMeeting.transcriptUrl = latest.url;
            await db
              .update(meetings)
              .set({ transcriptUrl: latest.url })
              .where(eq(meetings.id, meeting.id));
          }
        }
      } catch {
        // Stream listTranscriptions best-effort
      }

      // If Stream already delivered the transcript while the call was active,
      // transcription_ready intentionally deferred processing until the call
      // ended. Trigger it now so manually-ended meetings do not stay stuck in
      // "processing".
      if (updatedMeeting.transcriptUrl || updatedMeeting.transcript) {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          id: `meeting-ended-${updatedMeeting.id}-${Date.now()}`,
          name: "meetings/processing",
          data: {
            meetingId: updatedMeeting.id,
            transcriptUrl: updatedMeeting.transcriptUrl,
          },
        });
      }

      return { meeting: updatedMeeting, streamEnded };
    }),

  start: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      if (
        meeting.status === MeetingStatus.CANCELLED ||
        meeting.status === MeetingStatus.COMPLETED
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot start a meeting that has ended or been cancelled.",
        });
      }

      const startedAt = meeting.startedAt ?? new Date();

      const [updatedMeeting] = await db
        .update(meetings)
        .set({
          status: MeetingStatus.ACTIVE,
          startedAt,
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, input.id))
        .returning();

      // Record host as participant
      await db
        .insert(meetingParticipants)
        .values({
          meetingId: meeting.id,
          userId: ctx.auth.user.id,
          name: ctx.auth.user.name,
          email: ctx.auth.user.email,
          role: "host",
          joinedAt: new Date(),
        })
        .catch(() => undefined);

      // Connect AI participant if OpenAI is configured
      if (isOpenAIConfigured()) {
        try {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, meeting.agentId));

          if (agent) {
            const call = streamVideo.video.call("default", meeting.id);
            const realtimeClient = await streamVideo.video.connectOpenAi({
              call,
              openAiApiKey: process.env.OPENAI_API_KEY!,
              agentUserId: agent.id,
            });
            await realtimeClient.updateSession({
              instructions: agent.instructions,
            });
            await db
              .insert(meetingParticipants)
              .values({
                meetingId: meeting.id,
                name: agent.name,
                role: "agent",
                joinedAt: new Date(),
              })
              .catch(() => undefined);
          }
        } catch (error) {
          console.error("[START] Failed to connect AI agent to call", error);
        }
      }

      await createNotification({
        userId: updatedMeeting.userId,
        type: "meeting_started",
        title: "Meeting Started",
        message: `"${updatedMeeting.name}" is now live.`,
        meetingId: updatedMeeting.id,
      });

      return updatedMeeting;
    }),

  joinByMeetingId: publicProcedure
    .input(
      z.object({
        meetingId: z
          .string()
          .trim()
          .min(1, { message: "Meeting ID is required" }),
        passcode: z
          .string()
          .trim()
          .min(1, { message: "Passcode is required" }),
        displayName: z
          .string()
          .trim()
          .min(2, { message: "Display name must have at least 2 characters" })
          .max(80),
      }),
    )
    .mutation(async ({ input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(eq(meetings.id, input.meetingId));

      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found. Please verify the Meeting ID.",
        });
      }

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
          message:
            "This meeting could not be completed and is no longer joinable.",
        });
      }

      if (meeting.passcodeHash) {
        const isValid = verifyPasscode(input.passcode, meeting.passcodeHash);
        if (!isValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Invalid meeting passcode. Please check the passcode and try again.",
          });
        }
      }

      // Find or create an active invite
      const now = new Date();
      let [invite] = await db
        .select()
        .from(meetingInvites)
        .where(
          and(
            eq(meetingInvites.meetingId, meeting.id),
            isNull(meetingInvites.revokedAt),
            gt(meetingInvites.expiresAt, now),
          ),
        )
        .orderBy(desc(meetingInvites.createdAt))
        .limit(1);

      if (!invite) {
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const [newInvite] = await db
          .insert(meetingInvites)
          .values({
            meetingId: meeting.id,
            createdBy: meeting.userId,
            expiresAt,
          })
          .returning();
        invite = newInvite;
      }

      const joinResult = await guestAccessOperations.join({
        meetingId: meeting.id,
        token: invite.id,
        displayName: input.displayName,
        passcode: input.passcode,
      });

      return {
        ...joinResult,
        inviteToken: invite.id,
      };
    }),

  generateNewPasscode: protectedProcedure
    .input(z.object({ meetingId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id),
          ),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      const passcode = generatePasscode();
      const passcodeHash = hashPasscode(passcode);

      await db
        .update(meetings)
        .set({ passcodeHash, updatedAt: new Date() })
        .where(eq(meetings.id, input.meetingId));

      return { passcode };
    }),

  submitLiveTranscript: protectedProcedure
    .input(
      z.object({
        meetingId: z.string().min(1),
        segments: z.array(
          z.object({
            text: z.string().trim().min(1),
            speakerId: z.string().optional(),
            speakerName: z.string().optional(),
            startMs: z.number().optional(),
            endMs: z.number().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id),
          ),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      if (input.segments.length > 0 && !meeting.transcript) {
        const normalized = input.segments.map((seg, idx) => ({
          speakerId: seg.speakerId || ctx.auth.user.id,
          speakerName: seg.speakerName || ctx.auth.user.name,
          text: seg.text,
          startMs: seg.startMs ?? idx * 5000,
          endMs: seg.endMs ?? (idx + 1) * 5000,
        }));

        await db
          .update(meetings)
          .set({
            transcript: JSON.stringify(normalized),
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, input.meetingId));
      }

      return { success: true };
    }),

  retryAnalysis: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.id), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!meeting) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      }

      if (!meeting.transcriptUrl && !meeting.transcript) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No transcript is available yet. Wait for Stream to deliver the transcription, or verify the call was recorded.",
        });
      }

      if (!isOpenAIConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "OPENAI_API_KEY is not configured on the server.",
        });
      }

      await db
        .update(meetings)
        .set({
          status: MeetingStatus.PROCESSING,
          analysisError: null,
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, meeting.id));

      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        id: `meeting-retry-${meeting.id}-${Date.now()}`,
        name: "meetings/processing",
        data: {
          meetingId: meeting.id,
          transcriptUrl: meeting.transcriptUrl,
        },
      });

      return { success: true };
    }),

  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(MIN_PAGE_SIZE)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE),
        search: z.string().nullish(),
        agentId: z.string().nullish(),
        status: z.nativeEnum(MeetingStatus).nullish(),
        from: z.string().nullish(),
        to: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize, status, agentId, from, to } = input;

      const dateFrom = from ? new Date(from) : null;
      const dateTo = to ? new Date(to) : null;

      const whereConditions = and(
        eq(meetings.userId, ctx.auth.user.id),
        search
          ? or(
              ilike(meetings.name, `%${search}%`),
              ilike(meetings.description, `%${search}%`),
            )
          : undefined,
        status ? eq(meetings.status, status) : undefined,
        agentId ? eq(meetings.agentId, agentId) : undefined,
        dateFrom && !Number.isNaN(dateFrom.getTime())
          ? gte(meetings.scheduledAt, dateFrom)
          : undefined,
        dateTo && !Number.isNaN(dateTo.getTime())
          ? lte(meetings.scheduledAt, dateTo)
          : undefined,
      );

      const data = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration:
            sql<number>`COALESCE(EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt})), 0)::int`.as(
              "duration",
            ),
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(whereConditions)
        .orderBy(desc(meetings.createdAt), desc(meetings.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [total] = await db
        .select({ count: count() })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(whereConditions);

      const totalPages = Math.ceil(total.count / pageSize);

      return {
        items: data,
        total: total.count,
        totalPages,
        page,
        pageSize,
      };
    }),

  getCalendar: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      const from = new Date(input.from);
      const to = new Date(input.to);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date range" });
      }

      return db
        .select({
          id: meetings.id,
          name: meetings.name,
          status: meetings.status,
          scheduledAt: meetings.scheduledAt,
          endsAt: meetings.endsAt,
          durationMinutes: meetings.durationMinutes,
          timezone: meetings.timezone,
          participants: meetings.participants,
          agent: {
            id: agents.id,
            name: agents.name,
          },
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(
            eq(meetings.userId, ctx.auth.user.id),
            isNotNull(meetings.scheduledAt),
            gte(meetings.scheduledAt, from),
            lte(meetings.scheduledAt, to),
            notInArray(meetings.status, [MeetingStatus.CANCELLED]),
          ),
        )
        .orderBy(meetings.scheduledAt);
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [totals] = await db
      .select({
        totalConfigured: count(),
        upcomingCount: sql<number>`COUNT(*) FILTER (WHERE ${meetings.status} IN ('scheduled', 'upcoming'))::int`,
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${meetings.status} = 'completed')::int`,
        processingCount: sql<number>`COUNT(*) FILTER (WHERE ${meetings.status} = 'processing')::int`,
        failedCount: sql<number>`COUNT(*) FILTER (WHERE ${meetings.status} = 'failed')::int`,
      })
      .from(meetings)
      .where(eq(meetings.userId, ctx.auth.user.id));

    return totals;
  }),

  askAI: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1, { message: "Ask a question first" }).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOpenAIConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Ask AI is unavailable because OPENAI_API_KEY is not configured on the server.",
        });
      }

      const rows = await db
        .select({
          id: meetings.id,
          name: meetings.name,
          status: meetings.status,
          startedAt: meetings.startedAt,
          scheduledAt: meetings.scheduledAt,
          summary: meetings.summary,
          detailedSummary: meetings.detailedSummary,
          keyTopics: meetings.keyTopics,
          keyDecisions: meetings.keyDecisions,
          actionItems: meetings.actionItems,
          unresolvedQuestions: meetings.unresolvedQuestions,
          transcript: meetings.transcript,
          transcriptUrl: meetings.transcriptUrl,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.userId, ctx.auth.user.id),
            inArray(meetings.status, [
              MeetingStatus.COMPLETED,
              MeetingStatus.PROCESSING,
            ]),
          ),
        )
        .orderBy(desc(meetings.startedAt), desc(meetings.createdAt))
        .limit(50);

      if (rows.length === 0) {
        return {
          answer:
            "You do not have any analyzed meetings yet. Complete a meeting and wait for Apex Agent to generate its summary before asking questions.",
          sources: [] as { id: string; name: string; date: string | null }[],
        };
      }

      const terms = input.query
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.replace(/[^a-z0-9]/g, ""))
        .filter((term) => term.length > 2);

      const scored = rows
        .map((meeting) => {
          const transcript = meeting.transcript ?? "";
          const haystack = [
            meeting.name,
            meeting.summary,
            meeting.detailedSummary,
            (meeting.keyTopics ?? []).join(" "),
            (meeting.keyDecisions ?? []).join(" "),
            meeting.actionItems,
            (meeting.unresolvedQuestions ?? []).join(" "),
            transcript,
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();

          let score = 0;
          for (const term of terms) {
            if (!term) continue;
            const matches = haystack.split(term).length - 1;
            score += Math.min(matches, 10);
            if (meeting.name.toLowerCase().includes(term)) score += 5;
            if (meeting.summary?.toLowerCase().includes(term)) score += 3;
          }

          return { meeting, score };
        })
        .sort((a, b) => b.score - a.score);

      const matching = scored.filter((item) => item.score > 0).slice(0, 6);
      const selected = (matching.length > 0 ? matching : scored.slice(0, 5)).map(
        (item) => item.meeting,
      );

      const context = selected
        .map((meeting, index) => {
          const transcript = (meeting.transcript ?? "").slice(0, 8000);
          return [
            `--- MEETING ${index + 1} ---`,
            `Title: ${meeting.name}`,
            `Date: ${
              meeting.startedAt
                ? new Date(meeting.startedAt).toISOString()
                : meeting.scheduledAt
                  ? new Date(meeting.scheduledAt).toISOString()
                  : "Unknown"
            }`,
            `Summary: ${meeting.summary ?? "No summary"}`,
            `Detailed summary: ${meeting.detailedSummary ?? "Not available"}`,
            `Key topics: ${(meeting.keyTopics ?? []).join(", ") || "None"}`,
            `Key decisions: ${(meeting.keyDecisions ?? []).join("; ") || "None"}`,
            `Action items: ${meeting.actionItems ?? "None"}`,
            `Unresolved questions: ${(meeting.unresolvedQuestions ?? []).join("; ") || "None"}`,
            `Transcript excerpt: ${transcript || "Not stored"}`,
          ].join("\n");
        })
        .join("\n\n");

      try {
        const completion = await getOpenAIClient().chat.completions.create({
          model: OPENAI_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `You are Apex Agent's meeting knowledge assistant. Answer ONLY using the provided meeting context. Never invent decisions, people, or deadlines. If the answer is not present, say clearly that the information is not available in the user's meetings. Cite the meeting title and date in brackets after each fact, for example [Weekly Sync — 2026-05-12]. Keep the answer concise and useful.`,
            },
            {
              role: "user",
              content: `Question: ${input.query}\n\nMeeting context:\n${context}`,
            },
          ],
        });

        const answer =
          completion.choices[0]?.message?.content?.trim() ||
          "I could not generate an answer from your meeting history.";

        return {
          answer,
          sources: selected.map((meeting) => ({
            id: meeting.id,
            name: meeting.name,
            date: meeting.startedAt
              ? new Date(meeting.startedAt).toISOString()
              : meeting.scheduledAt
                ? new Date(meeting.scheduledAt).toISOString()
                : null,
          })),
        };
      } catch (error) {
        console.error("[ASK_AI] OpenAI request failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Ask AI could not reach OpenAI. Check the API key and billing configuration.",
        });
      }
    }),

  smartSearch: protectedProcedure
    .input(z.object({ meetingId: z.string().min(1), query: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!isOpenAIConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "OPENAI_API_KEY is not configured on the server.",
        });
      }

      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(eq(meetings.id, input.meetingId), eq(meetings.userId, ctx.auth.user.id)),
        );

      if (!meeting) throw new TRPCError({ code: "NOT_FOUND" });

      let transcriptText = meeting.transcript ?? "";

      if (!transcriptText && meeting.transcriptUrl) {
        try {
          const response = await fetch(meeting.transcriptUrl, {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error(`Transcript fetch failed: ${response.status}`);
          transcriptText = await response.text();
        } catch (error) {
          console.error("[SMART_SEARCH] Failed to fetch transcript", error);
        }
      }

      if (!transcriptText.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No transcript is available for this meeting yet.",
        });
      }

      const aiResponse = await getOpenAIClient().chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an expert AI search assistant. Read the meeting transcript and answer the user's question using only the transcript. Quote or reference timestamps when useful. If the answer is absent, say so.",
          },
          {
            role: "user",
            content: `Query: ${input.query}\n\nTranscript: ${transcriptText.slice(0, 60000)}`,
          },
        ],
      });

      return {
        result:
          aiResponse.choices[0]?.message?.content?.trim() || "No results found.",
      };
    }),

  getAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const allMeetings = await db
      .select({
        id: meetings.id,
        status: meetings.status,
        scheduledAt: meetings.scheduledAt,
        startedAt: meetings.startedAt,
        endedAt: meetings.endedAt,
        durationMinutes: meetings.durationMinutes,
        participants: meetings.participants,
        talkTimePerUser: meetings.talkTimePerUser,
        summary: meetings.summary,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .where(eq(meetings.userId, ctx.auth.user.id));

    const now = Date.now();
    let totalDuration = 0;
    let completedCount = 0;
    let totalParticipants = 0;
    let aiUsageCount = 0;
    const talkTimeAgg: Record<string, number> = {};
    const activityMap = new Map<string, number>();

    for (const meeting of allMeetings) {
      if (meeting.status === MeetingStatus.COMPLETED) {
        completedCount++;
        if (meeting.summary) aiUsageCount++;

        if (meeting.startedAt && meeting.endedAt) {
          const seconds =
            (new Date(meeting.endedAt).getTime() -
              new Date(meeting.startedAt).getTime()) /
            1000;
          if (seconds > 0) totalDuration += seconds;
        }
      }

      totalParticipants += meeting.participants?.length ?? 0;

      if (meeting.talkTimePerUser) {
        try {
          const parsed = JSON.parse(meeting.talkTimePerUser) as Record<
            string,
            number
          >;
          for (const [speaker, time] of Object.entries(parsed)) {
            talkTimeAgg[speaker] = (talkTimeAgg[speaker] ?? 0) + Number(time);
          }
        } catch {
          // Ignore malformed historical data.
        }
      }

      const activityDate = meeting.scheduledAt ?? meeting.createdAt;
      if (activityDate) {
        const key = new Date(activityDate).toISOString().slice(0, 10);
        activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
      }
    }

    const talkTimeEntries = Object.entries(talkTimeAgg);
    const totalTalkTime = talkTimeEntries.reduce(
      (sum, [, time]) => sum + Number(time),
      0,
    );

    const averageDuration =
      completedCount > 0 ? totalDuration / completedCount : 0;

    const upcomingMeetings = allMeetings.filter(
      (meeting) =>
        (meeting.status === MeetingStatus.SCHEDULED ||
          meeting.status === MeetingStatus.UPCOMING) &&
        (!meeting.scheduledAt || new Date(meeting.scheduledAt).getTime() >= now),
    ).length;

    return {
      totalMeetings: allMeetings.length,
      completedMeetings: completedCount,
      upcomingMeetings,
      activeMeetings: allMeetings.filter(
        (meeting) => meeting.status === MeetingStatus.ACTIVE,
      ).length,
      processingMeetings: allMeetings.filter(
        (meeting) => meeting.status === MeetingStatus.PROCESSING,
      ).length,
      cancelledMeetings: allMeetings.filter(
        (meeting) => meeting.status === MeetingStatus.CANCELLED,
      ).length,
      failedMeetings: allMeetings.filter(
        (meeting) => meeting.status === MeetingStatus.FAILED,
      ).length,
      totalDuration,
      averageDuration,
      totalParticipants,
      processedMeetings: aiUsageCount,
      aiUsageCount,
      talkTimePerUser: talkTimeAgg,
      talkTimePercent: Object.fromEntries(
        talkTimeEntries.map(([speaker, time]) => [
          speaker,
          totalTalkTime > 0
            ? Math.round((Number(time) / totalTalkTime) * 1000) / 10
            : 0,
        ]),
      ),
      activity: Array.from(activityMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, meetingsCount]) => ({ date, count: meetingsCount })),
    };
  }),
});
