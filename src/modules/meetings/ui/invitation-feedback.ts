import { toast } from "sonner";
import type { InvitationDelivery } from "../invitation-result";

const emailCount = (count: number) => `${count} invitation email${count === 1 ? "" : "s"}`;

type InvitationMessage = {
  kind: "success" | "error" | "warning" | "info";
  text: string;
};

function invitationMessages(result: InvitationDelivery): InvitationMessage[] {
  const messages: InvitationMessage[] = [];
  const recipientContext = result.testMode ? " for the configured development test recipient only" : "";
  if (result.accepted) {
    messages.push({
      kind: "success",
      text: `${emailCount(result.accepted)} accepted by Resend${recipientContext}. Inbox delivery is unverified.`,
    });
  }
  if (result.failed) {
    const explanation = {
      configuration: " Check the Resend API key and verified sender.",
      "link-unavailable": " Check the public app URL and guest link.",
      "passcode-unavailable": " Enter the current meeting passcode.",
      "test-recipient-count": " Development email testing requires exactly one invitation recipient.",
    };
    const testNote = result.testMode && result.reason !== "test-recipient-count"
      ? " Development test mode uses the configured Resend test recipient only."
      : "";
    messages.push({
      kind: "error",
      text: `${emailCount(result.failed)} could not be sent.${result.reason ? explanation[result.reason] : ""}${testNote}`,
    });
  }
  if (result.unconfirmed) {
    messages.push({
      kind: "warning",
      text: result.testMode
        ? "Resend acceptance could not be confirmed for the invitation to the configured development test recipient."
        : `Resend acceptance could not be confirmed for ${emailCount(result.unconfirmed)}.`,
    });
  }
  if (result.skipped) {
    messages.push({
      kind: "info",
      text: `${result.skipped} invalid or duplicate participant email entr${result.skipped === 1 ? "y" : "ies"} skipped.`,
    });
  }
  return messages;
}

export function showInvitationFeedback(result: InvitationDelivery) {
  for (const { kind, text } of invitationMessages(result)) {
    toast[kind](text);
  }
}

export function showMeetingCreationFeedback(result: InvitationDelivery) {
  const description = invitationMessages(result).map(({ text }) => text).join(" ");
  const kind = result.failed || result.unconfirmed ? "warning" : "success";
  toast[kind]("Meeting scheduled successfully.", description ? { description } : undefined);
}
