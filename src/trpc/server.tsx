import 'server-only'; 
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { headers } from 'next/headers';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';

export const getQueryClient = cache(makeQueryClient);
const getRequestContext = cache(async () => createTRPCContext(await headers()));
export const trpc = createTRPCOptionsProxy({
  ctx: getRequestContext,
  router: appRouter,
  queryClient: getQueryClient,
});
