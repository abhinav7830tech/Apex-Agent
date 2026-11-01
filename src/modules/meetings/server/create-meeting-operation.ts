import { TRPCError } from "@trpc/server";

/** Persists first, then prepares Stream; failed preparation never deletes user data. */
export const createMeetingOperation = async <TMeeting>({
  persistMeeting,
  ensureStreamCall,
  sendSuccessNotification,
}: {
  persistMeeting: () => Promise<TMeeting>;
  ensureStreamCall: (meeting: TMeeting) => Promise<boolean>;
  sendSuccessNotification: (meeting: TMeeting) => Promise<void>;
}) => {
  const meeting = await persistMeeting();
  const callReady = await ensureStreamCall(meeting);

  if (!callReady) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Your meeting was saved, but video setup failed. Open the saved meeting and retry joining. If the problem continues, contact support.",
    });
  }

  await sendSuccessNotification(meeting);
  return meeting;
};
