import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetingEmailInvitations, type meetings } from "@/db/schema";
import { escapeHtml, isInvitationEmailConfigured, isInvitationTestMode, sendInvitationEmails } from "@/lib/resend";
import { verifyPasscode } from "@/lib/passcode";
import { AppUrlConfigurationError } from "@/lib/app-url";
import { getInvitationSchedule, resolveInvitationRecipients } from "./invitation-details";
import { sendInvitationBatchOnce } from "./invitation-delivery";
import type { InvitationDelivery } from "../invitation-result";

export function renderMeetingInvitation(
  meeting: { name: string; scheduledAt: Date | null; timezone: string; durationMinutes: number },
  url: string,
  validPasscode?: string,
) {
  const { date, time, timezone } = getInvitationSchedule(meeting.scheduledAt, meeting.timezone);
  const subject = `Meeting invitation: ${meeting.name.replace(/[\r\n]+/g, " ")}`;
  const details = [
    ["Date", date],
    ["Time", time],
    ["Timezone", timezone],
    ["Duration", `${meeting.durationMinutes} minutes`],
    ...(validPasscode ? [["Passcode", validPasscode]] : []),
  ];
  const text = [subject, ...details.map(([label, value]) => `${label}: ${value}`), `Join meeting: ${url}`].join("\n");
  const html = [
    `<h1>${escapeHtml(meeting.name)}</h1>`,
    "<dl>",
    ...details.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`),
    "</dl>",
    `<p><a href="${escapeHtml(url)}">Join meeting</a></p>`,
  ].join("");
  return { subject, text, html };
}

export async function emailMeetingInvitations({
  meeting,
  requestKey,
  passcode,
  getInviteUrl,
}: {
  meeting: Pick<typeof meetings.$inferSelect, "id" | "name" | "scheduledAt" | "timezone" | "durationMinutes" | "participants" | "passcodeHash">;
  requestKey: string;
  passcode?: string;
  getInviteUrl: () => Promise<string>;
}): Promise<InvitationDelivery> {
  const { recipients, skipped } = resolveInvitationRecipients(meeting.participants ?? []);
  const rejected = { accepted: 0, failed: recipients.length, unconfirmed: 0 };

  try {
    return await sendInvitationBatchOnce({
      count: recipients.length,
      skipped,
      testMode: recipients.length > 0 && isInvitationTestMode(),
      claim: async (result) => {
        const [claimed] = await db.insert(meetingEmailInvitations)
          .values({ requestKey, meetingId: meeting.id, result })
          .onConflictDoNothing({ target: meetingEmailInvitations.requestKey })
          .returning({ requestKey: meetingEmailInvitations.requestKey });
        if (claimed) return null;

        const [existing] = await db.select({ result: meetingEmailInvitations.result })
          .from(meetingEmailInvitations)
          .where(eq(meetingEmailInvitations.requestKey, requestKey));
        if (!existing) throw new Error("Invitation claim is unavailable");
        return existing.result;
      },
      send: async () => {
        if (recipients.length === 0) return rejected;
        if (!isInvitationEmailConfigured()) return { ...rejected, reason: "configuration" };
        const validPasscode = meeting.passcodeHash && passcode && verifyPasscode(passcode, meeting.passcodeHash)
          ? passcode
          : undefined;
        if (meeting.passcodeHash && !validPasscode) {
          return { ...rejected, reason: "passcode-unavailable" };
        }
        let url: string;
        try {
          url = await getInviteUrl();
        } catch (error) {
          if (!(error instanceof AppUrlConfigurationError)) {
            console.warn("meeting_invitation_link_unavailable", { meetingId: meeting.id });
          }
          return { ...rejected, reason: "link-unavailable" };
        }

        const message = renderMeetingInvitation(meeting, url, validPasscode);
        return sendInvitationEmails(recipients.map((to) => ({ to, ...message })), requestKey);
      },
      save: async (result) => {
        await db.update(meetingEmailInvitations).set({ result })
          .where(eq(meetingEmailInvitations.requestKey, requestKey));
      },
      onSaveError: () => console.warn("meeting_invitation_result_unavailable", { meetingId: meeting.id }),
    });
  } catch {
    console.warn("meeting_invitation_claim_unavailable", { meetingId: meeting.id });
    return { ...rejected, skipped };
  }
}
