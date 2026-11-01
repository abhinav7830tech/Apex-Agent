import { z } from "zod";

export const meetingVisibilitySchema = z.enum(["private", "public"]);

export const meetingsInsertSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Meeting title is required" })
    .max(200, { message: "Title must be 200 characters or fewer" }),
  description: z
    .string()
    .trim()
    .max(5000, { message: "Description must be 5000 characters or fewer" })
    .optional()
    .nullable(),
  agentId: z.string().min(1, { message: "An AI agent is required" }),
  scheduledAt: z
    .string()
    .min(1, { message: "Meeting date and time is required" }),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(5, { message: "Meeting must be at least 5 minutes" })
    .max(480, { message: "Meeting cannot be longer than 8 hours" })
    .default(30),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  participants: z
    .array(z.string().trim().min(1).max(200))
    .max(50, { message: "A meeting cannot have more than 50 participants" })
    .default([]),
  visibility: meetingVisibilitySchema.default("private"),
});

export const meetingsUpdateSchema = meetingsInsertSchema
  .partial()
  .extend({
    id: z.string().min(1, { message: "Id is required" }),
  });

export type MeetingInsertInput = z.infer<typeof meetingsInsertSchema>;
