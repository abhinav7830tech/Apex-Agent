import { z } from "zod";

export const agentsInsertSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be 100 characters or fewer" }),
  instructions: z
    .string()
    .trim()
    .min(1, { message: "Instructions are required" })
    .max(10000, { message: "Instructions must be 10000 characters or fewer" }),
  description: z
    .string()
    .trim()
    .max(1000, { message: "Description must be 1000 characters or fewer" })
    .optional()
    .nullable(),
  role: z
    .string()
    .trim()
    .max(100, { message: "Role must be 100 characters or fewer" })
    .optional()
    .nullable(),
  avatarVariant: z.string().trim().max(50).optional(),
});

export const agentsUpdateSchema = agentsInsertSchema
  .partial()
  .extend({
    id: z.string().min(1, { message: "Id is required" }),
  });

export type AgentInsertInput = z.infer<typeof agentsInsertSchema>;
