import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const hostTokenInputSchema = z.object({ meetingId: z.string().min(1) });

export type StreamTokenUser = {
  id: string;
  name: string;
  image?: string | null;
};

/** Token issuance for authenticated hosts. Ownership is checked on every call. */
export const createHostTokenOperation = <TMeeting extends { id: string }>({
  getOwnedMeeting,
  ensureCall,
  upsertUser,
  generateToken,
}: {
  getOwnedMeeting: (meetingId: string, userId: string) => Promise<TMeeting | null>;
  ensureCall: (meeting: TMeeting, user: StreamTokenUser) => Promise<void>;
  upsertUser: (user: StreamTokenUser & { role: "user" }) => Promise<void>;
  generateToken: (userId: string) => string;
}) => async ({ meetingId, user }: { meetingId: string; user: StreamTokenUser }) => {
  const meeting = await getOwnedMeeting(meetingId, user.id);
  if (!meeting) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
  }

  await ensureCall(meeting, user);
  await upsertUser({ ...user, role: "user" });
  return generateToken(user.id);
};
