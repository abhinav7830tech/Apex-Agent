import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const emailAddress = z.string().email().max(254);
const hour = 60 * 60 * 1000;

export function resolveInvitationRecipients(participants: readonly string[]) {
  const addresses = new Map<string, string>();
  for (const participant of participants) {
    const address = participant.trim();
    const key = address.toLowerCase();
    if (emailAddress.safeParse(address).success && !addresses.has(key)) {
      addresses.set(key, address);
    }
  }
  return { recipients: [...addresses.values()], skipped: participants.length - addresses.size };
}

export function getMeetingInviteExpiry(
  meeting: { scheduledAt: Date | null; endsAt: Date | null; durationMinutes: number },
  now: Date,
) {
  const end = meeting.endsAt?.getTime()
    ?? (meeting.scheduledAt
      ? meeting.scheduledAt.getTime() + meeting.durationMinutes * 60 * 1000
      : now.getTime());
  return new Date(Math.max(now.getTime(), end) + hour);
}

export function getInvitationSchedule(scheduledAt: Date | null, timezone: string) {
  let timeZone = timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    timeZone = "UTC";
  }
  return {
    date: scheduledAt
      ? new Intl.DateTimeFormat("en", { timeZone, dateStyle: "full" }).format(scheduledAt)
      : "Available now",
    time: scheduledAt
      ? new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(scheduledAt)
      : "Available now",
    timezone: timeZone,
  };
}

export const meetingIdForRequest = (userId: string, requestId: string) =>
  createHash("sha256").update(JSON.stringify(["meeting-creation", userId, requestId])).digest("base64url").slice(0, 21);

// Keep generated passcodes stable for a replay without storing them in plaintext.
export const passcodeForRequest = (meetingId: string, secret: string) => {
  const digest = createHmac("sha256", secret).update(`meeting-passcode/${meetingId}`).digest();
  return String(100000 + (digest.readUIntBE(0, 6) % 900000));
};


export function assertMeetingAcceptsInvitations(status: string) {
  if (["cancelled", "completed", "failed", "processing"].includes(status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This meeting has ended, so new invitations cannot be created.",
    });
  }
}

export function requireInvitableMeeting<T extends { userId: string; status: string }>(
  meeting: T | undefined,
  userId: string,
): T {
  if (!meeting || meeting.userId !== userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Meeting not found or you do not have access to it.",
    });
  }
  assertMeetingAcceptsInvitations(meeting.status);
  return meeting;
}
