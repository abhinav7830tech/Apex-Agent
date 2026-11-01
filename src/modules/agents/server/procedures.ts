import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { agentsInsertSchema, agentsUpdateSchema } from "../schemas";
import { z } from "zod";
import { and, count, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/constants";

const meetingCountSql = sql<number>`(
  SELECT COUNT(*)::int FROM ${meetings}
  WHERE ${meetings.agentId} = ${agents.id}
)`.as("meeting_count");

export const agentsRouter = createTRPCRouter({
  update: protectedProcedure
    .input(agentsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;

      const [updatedAgent] = await db
        .update(agents)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(agents.id, id), eq(agents.userId, ctx.auth.user.id)))
        .returning();

      if (!updatedAgent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      return updatedAgent;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, input.id), eq(agents.userId, ctx.auth.user.id)));

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      const [usage] = await db
        .select({ count: count() })
        .from(meetings)
        .where(eq(meetings.agentId, agent.id));

      if (usage.count > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This agent is attached to meetings. Delete or reassign those meetings before removing the agent.",
        });
      }

      const [removeAgent] = await db
        .delete(agents)
        .where(and(eq(agents.id, input.id), eq(agents.userId, ctx.auth.user.id)))
        .returning();

      return removeAgent;
    }),

  getOne: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const [existingAgent] = await db
        .select({
          meetingCount: meetingCountSql,
          ...getTableColumns(agents),
        })
        .from(agents)
        .where(
          and(eq(agents.id, input.id), eq(agents.userId, ctx.auth.user.id)),
        );

      if (!existingAgent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
      }

      return existingAgent;
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize } = input;
      const whereConditions = and(
        eq(agents.userId, ctx.auth.user.id),
        search ? ilike(agents.name, `%${search}%`) : undefined,
      );

      const data = await db
        .select({
          meetingCount: meetingCountSql,
          ...getTableColumns(agents),
        })
        .from(agents)
        .where(whereConditions)
        .orderBy(desc(agents.createdAt), desc(agents.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [total] = await db
        .select({ count: count() })
        .from(agents)
        .where(whereConditions);

      const totalPages = Math.ceil(total.count / pageSize);

      return {
        items: data,
        total: total.count,
        totalPages,
      };
    }),

  getCount: protectedProcedure.query(async ({ ctx }) => {
    const [total] = await db
      .select({ count: count() })
      .from(agents)
      .where(eq(agents.userId, ctx.auth.user.id));

    return total.count;
  }),

  create: protectedProcedure
    .input(agentsInsertSchema)
    .mutation(async ({ input, ctx }) => {
      const [createdAgent] = await db
        .insert(agents)
        .values({
          ...input,
          userId: ctx.auth.user.id,
        })
        .returning();

      return createdAgent;
    }),
});
