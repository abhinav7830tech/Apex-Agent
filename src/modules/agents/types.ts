import { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/trpc/routers/_app"

type AgentOutput = inferRouterOutputs<AppRouter>["agents"]

export type AgentGetOne = AgentOutput["getOne"]
export type AgentGetMany = AgentOutput["getMany"]["items"]

