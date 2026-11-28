import { auth } from '@/lib/auth';
import {initTRPC, TRPCError} from '@trpc/server'

export const createTRPCContext = (requestHeaders: Headers) => ({ requestHeaders });

const t = initTRPC.context<ReturnType<typeof createTRPCContext>>().create();

export const createTRPCRouter=t.router;
export const createCallerFactary=t.createCallerFactory;
export const baseProducedure=t.procedure;
// Used by endpoints that must be reachable by external guests, such as
// invitation validation. Those endpoints enforce their own invitation-token
// checks and never expose private meeting data.
export const publicProcedure=baseProducedure;
export const protectedProcedure=baseProducedure.use(async ({ctx,next})=>{
     const session=await auth.api.getSession({
        headers: ctx.requestHeaders
      });

      if (!session) {
        throw new TRPCError({code:"UNAUTHORIZED",message:"UNAUTHORIZED"})
      }

      return next({ctx: {...ctx,auth:session}})
})
