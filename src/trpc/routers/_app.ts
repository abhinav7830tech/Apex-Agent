


import { meetingsRouter } from "@/modules/meetings/server/procedures";
import {createTRPCRouter} from "../init"
import { agentsRouter } from "@/modules/agents/server/procedures";
import { notificationsRouter } from "@/modules/notifications/server/procedures";

export const appRouter=createTRPCRouter({
  agents:agentsRouter,
  meetings:meetingsRouter,
  notifications:notificationsRouter,
});

export type AppRouter = typeof appRouter;