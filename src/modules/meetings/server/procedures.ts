import { db } from "@/db";
import {
  agents,
  meetingInvites,
  meetings,
  notifications,
  transcriptSegments,
} from "@/db/schema";
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
});

const ensureStreamCall = async (input: {
  meetingId: string;
  meetingName: string;
  userId: string;
  agent: { id: string; name: string };
}) => {
  try {
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

    // Membership is scoped to this call. No role name is assigned; Stream's
    // configured call-type defaults remain authoritative.
    await call.updateCallMembers(
      callMemberUpdates(input.userId, input.agent.id),
    );

    await streamVideo.upsertUsers([
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

    return true;
  } catch (error) {
    console.error("[STREAM] Failed to create call for meeting", input.meetingId, error);
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
      const scheduledAt = parseScheduledAt(input.scheduledAt);

      if (!scheduledAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid meeting date and time.",
        });
      }

      if (scheduledAt.getTime() < Date.now() - 2 * 60 * 1000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A meeting cannot be scheduled in the past.",
        });
      }

      const endsAt = getMeetingEnd(scheduledAt, input.durationMinutes);
      const agent = await ensureAgentOwnership(ctx.auth.user.id, input.agentId);
      await assertNoOverlap({
        userId: ctx.auth.user.id,
        scheduledAt,
        endsAt,
      });

      const meetingId = nanoid();
      return createMeetingOperation({
        persistMeeting: async () => {
          const [createdMeeting] = await db
            .insert(meetings)
            .values({
              ...input,
              id: meetingId,
              scheduledAt,
              endsAt,
              streamCallId: meetingId,
              status: MeetingStatus.SCHEDULED,
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
            title: "Meeting Scheduled",
            message: `Your meeting "${createdMeeting.name}" has been scheduled successfully.`,
            meetingId: createdMeeting.id,
          }),
      });
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

      return existingMeeting;
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
