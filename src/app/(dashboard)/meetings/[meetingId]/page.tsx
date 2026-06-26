import { redirect } from 'next/navigation';
import { getQueryClient, trpc } from '@/trpc/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import MeetingIdView, { MeetingsViewError } from '@/modules/meetings/ui/views/meeting-id-view';
import { MeetingsViewLoading } from '@/modules/meetings/ui/views/meetings-view';

export default async function Page({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  // Get the session using the auth utility from your project
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    redirect('/sign-in');
  }

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(
    trpc.meetings.getOne.queryOptions({ id: meetingId })
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<MeetingsViewLoading />}>
        <ErrorBoundary fallback={<MeetingsViewError />}>
          <MeetingIdView meetingId={meetingId} />
        </ErrorBoundary>
      </Suspense>
    </HydrationBoundary>
  );

}