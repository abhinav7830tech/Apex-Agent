import { db } from "@/db";
import { agents, meetings, notifications } from "@/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, count, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/constants";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas";
import { MeetingStatus } from "../types";
import { streamVideo } from "@/lib/stream-video";
import { GeneratedAvatarUri } from "@/lib/avatar";
import OpenAI from "openai";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const meetingsRouter = createTRPCRouter({
  generateToken: protectedProcedure.mutation(async ({ ctx }) => {
    await streamVideo.upsertUsers([{
      id: ctx.auth.user.id,
      name: ctx.auth.user.name,
      role: "admin",
      image: ctx.auth.user.image ??
        GeneratedAvatarUri({ seed: ctx.auth.user.name, variant: "initials" }),
    },
    ]);

    const token = streamVideo.generateUserToken({
      user_id: ctx.auth.user.id,
      validity_in_seconds: 3600,
    });
    return token;
  }),
  update: protectedProcedure
    .input(meetingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const [updatedMeeting] = await db
        .update(meetings)
        .set(input)
        .where(
          and(
            eq(meetings.id, input.id),
            eq(meetings.userId, ctx.auth.user.id),
          )
        )
        .returning();

      if (!updatedMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found"
        });
      }
      return updatedMeeting;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [removedMeeting] = await db
        .delete(meetings)
        .where(
          and(
            eq(meetings.id, input.id),
            eq(meetings.userId, ctx.auth.user.id)
          )
        )
        .returning();

      if (!removedMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found or access denied"
        });
      }
      return removedMeeting;
    }),

  create: protectedProcedure
    .input(meetingsInsertSchema)
    .mutation(async ({ input, ctx }) => {
      const [createdMeeting] = await db
        .insert(meetings)
        .values({
          ...input,
          userId: ctx.auth.user.id,
        })
        .returning();

      const call = streamVideo.video.call("default", createdMeeting.id);
      await call.create({
        data: {
          created_by_id: ctx.auth.user.id,
          custom: {
            meetingId: createdMeeting.id,
            meetingName: createdMeeting.name
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
      })

      const [existingAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, createdMeeting.agentId))

      if (!existingAgent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found"
        });
      }

      await streamVideo.upsertUsers([{
        id: existingAgent.id,
        name: existingAgent.name,
        role: "user",
        image: GeneratedAvatarUri({
          seed: existingAgent.name,  // Use the agent's name as the seed
          variant: "botttsNeutral",
        }),
      },
      ]);

      await db.insert(notifications).values({
        userId: createdMeeting.userId,
        type: "meeting_reminder",
        title: "Upcoming Meeting",
        message: `Your meeting "${createdMeeting.name}" has been scheduled.`,
        meetingId: createdMeeting.id,
      });

      return createdMeeting;
    }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [existingMeeting] = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration: sql<number>`EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt}))`.as("duration")
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(
            eq(meetings.id, input.id),
            eq(meetings.userId, ctx.auth.user.id)
          )
        );

      if (!existingMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found"
        });
      }

      return existingMeeting;
    }),

  cancel: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // First check if the meeting exists and belongs to the user
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.id),
            eq(meetings.userId, ctx.auth.user.id)
          )
        )
        .limit(1);

      if (!meeting) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Meeting not found or you do not have permission to cancel it',
        });
      }

      // Check if the meeting can be cancelled
      if (['cancelled', 'completed'].includes(meeting.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel a meeting that is already ${meeting.status}`,
        });
      }

      // Update the meeting status to cancelled
      const [updatedMeeting] = await db
        .update(meetings)
        .set({
          status: 'cancelled' as MeetingStatus,
          updatedAt: new Date()
        })
        .where(eq(meetings.id, input.id))
        .returning();

      await db.insert(notifications).values({
        userId: updatedMeeting.userId,
        type: "meeting_cancelled",
        title: "Meeting Cancelled",
        message: `Your meeting "${updatedMeeting.name}" has been cancelled.`,
        meetingId: updatedMeeting.id,
      });

      return updatedMeeting;
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
        status: z
          .enum([
            MeetingStatus.UPCOMING,
            MeetingStatus.ACTIVE,
            MeetingStatus.COMPLETED,
            MeetingStatus.PROCESSING,
            MeetingStatus.CANCELLED,
          ])
          .nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize, status, agentId } = input;

      const whereConditions = and(
        eq(meetings.userId, ctx.auth.user.id),
        search ? ilike(meetings.name, `%${search}%`) : undefined,
        status ? eq(meetings.status, status) : undefined,
        agentId ? eq(meetings.agentId, agentId) : undefined
      );

      const data = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration: sql<number>`EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt}))`.as("duration"),
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
        .where(and(
          eq(meetings.userId, ctx.auth.user.id),
          search ? ilike(meetings.name, `%${search}%`) : undefined,
          status ? eq(meetings.status, status) : undefined,
          agentId ? eq(meetings.agentId, agentId) : undefined
        ));

      const totalPages = Math.ceil(total.count / pageSize);

      return {
        items: data,
        total: total.count,
        totalPages,
        page,
        pageSize,
      };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [totalMeetings] = await db
      .select({ count: count() })
      .from(meetings)
      .where(eq(meetings.userId, ctx.auth.user.id));

    const [upcomingMeetings] = await db
      .select({ count: count() })
      .from(meetings)
      .where(
        and(
          eq(meetings.userId, ctx.auth.user.id),
          eq(meetings.status, MeetingStatus.UPCOMING)
        )
      );

    return {
      totalConfigured: totalMeetings.count,
      upcomingCount: upcomingMeetings.count
    };
  }),

  smartSearch: protectedProcedure
    .input(z.object({ meetingId: z.string(), query: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [meeting] = await db
        .select()
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id)
          )
        );

      if (!meeting) throw new TRPCError({ code: "NOT_FOUND" });
      if (!meeting.transcriptUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "No transcript available" });

      const res = await fetch(meeting.transcriptUrl);
      const transcriptJSON = await res.text();

      const aiResponse = await ai.chat.completions.create({
         model: "gpt-4o-mini",
         messages: [
            { 
               role: "system", 
               content: "You are an expert AI search assistant. Read the transcript JSON and output the exact relevant parts or a summary that directly answers the user's query." 
            },
            {
               role: "user",
               content: `Query: ${input.query}\n\nTranscript: ${transcriptJSON}`
            }
         ]
      });

      return { result: aiResponse.choices[0].message.content || "No results found." };
    }),

  getAnalytics: protectedProcedure.query(async ({ ctx }) => {
    const allMeetings = await db
      .select({
        status: meetings.status,
        talkTimePerUser: meetings.talkTimePerUser,
        duration: sql<number>`EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt}))`.as("duration"),
      })
      .from(meetings)
      .where(eq(meetings.userId, ctx.auth.user.id));

    let totalDuration = 0;
    let completedCount = 0;
    const talkTimeAgg: Record<string, number> = {};

    for (const m of allMeetings) {
       if (m.duration) totalDuration += m.duration;
       if (m.status === MeetingStatus.COMPLETED) completedCount++;

       if (m.talkTimePerUser) {
           try {
             const parsed = JSON.parse(m.talkTimePerUser);
             for (const [user, time] of Object.entries(parsed)) {
                 talkTimeAgg[user] = (talkTimeAgg[user] || 0) + Number(time);
             }
           } catch(e) {}
       }
    }

    const avgDuration = completedCount > 0 ? totalDuration / completedCount : 0;

    return {
      totalMeetings: allMeetings.length,
      averageDuration: avgDuration,
      aiUsageCount: completedCount, 
      talkTimePerUser: talkTimeAgg
    };
  }),

});