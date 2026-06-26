import { db } from "@/db";
import { notifications, meetings } from "@/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { and, desc, eq, count, gt, lt, or } from "drizzle-orm";
import { z } from "zod";

export const notificationsRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        unreadOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, unreadOnly } = input;

      const whereConditions = and(
        eq(notifications.userId, ctx.auth.user.id),
        unreadOnly ? eq(notifications.read, false) : undefined
      );

      const data = await db
        .select()
        .from(notifications)
        .where(whereConditions)
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

      return data;
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.auth.user.id),
          eq(notifications.read, false)
        )
      );

    return { count: result?.count || 0 };
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.auth.user.id)
          )
        );
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, ctx.auth.user.id));
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.auth.user.id)
          )
        );
    }),

  getCompletedMeetings: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit } = input;

      const completedMeetings = await db
        .select({
          id: meetings.id,
          name: meetings.name,
          status: meetings.status,
          summary: meetings.summary,
          startedAt: meetings.startedAt,
          endedAt: meetings.endedAt,
          createdAt: meetings.createdAt,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.userId, ctx.auth.user.id),
            or(
              eq(meetings.status, "completed"),
              eq(meetings.status, "processing")
            )
          )
        )
        .orderBy(desc(meetings.createdAt))
        .limit(limit);

      return completedMeetings;
    }),

  getUpcomingMeetings: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit } = input;

      const upcomingMeetings = await db
        .select({
          id: meetings.id,
          name: meetings.name,
          status: meetings.status,
          startedAt: meetings.startedAt,
          createdAt: meetings.createdAt,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.userId, ctx.auth.user.id),
            or(
              eq(meetings.status, "upcoming"),
              eq(meetings.status, "active")
            )
          )
        )
        .orderBy(meetings.createdAt)
        .limit(limit);

      return upcomingMeetings;
    }),
});
