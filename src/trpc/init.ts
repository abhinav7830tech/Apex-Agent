import { auth } from '@/lib/auth';
import {initTRPC, TRPCError} from '@trpc/server'
import { headers } from 'next/headers';
import { cache } from 'react'


export const createTRPCContext=cache(async ()=>{
    
    return {userId:'user_123'}
});


const t=initTRPC.create({

});

export const createTRPCRouter=t.router;
export const createCallerFactary=t.createCallerFactory;
export const baseProducedure=t.procedure;
export const protectedProcedure=baseProducedure.use(async ({ctx,next})=>{
     const session=await auth.api.getSession({
        headers:await headers()
      });

      if (!session) {
        throw new TRPCError({code:"UNAUTHORIZED",message:"UNAUTHORIZED"})
      }

      return next({ctx: {...ctx,auth:session}})
})
