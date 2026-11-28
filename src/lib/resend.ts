import "server-only";

import { z } from "zod";
import type { InvitationBatchResult } from "@/modules/meetings/invitation-result";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const DEFAULT_FROM = "Apex Agent <onboarding@resend.dev>";

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const resendHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

const emailPayload = (from: string, { to, subject, html, text }: SendEmailInput) => ({
  from,
  to: [to],
  subject,
  html,
  text,
});

interface SendEmailResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

/**
 * Sends a transactional email through the Resend REST API.
 *
 * The app intentionally does not depend on the Resend SDK: a single fetch keeps
 * the dependency tree small and works in every Next.js runtime. When
 * RESEND_API_KEY is not configured the helper becomes a no-op so meeting
 * processing never fails just because email is disabled.
 */
export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<SendEmailResult> => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, reason: "email-not-configured" };
  }

  if (!to.trim()) {
    return { sent: false, reason: "missing-recipient" };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: resendHeaders(apiKey),
    body: JSON.stringify(emailPayload(process.env.RESEND_FROM_EMAIL || DEFAULT_FROM, { to, subject, html, text })),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend request failed with status ${response.status}${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
  };

  return { sent: true, id: payload.id };
};

const invitationTestAddress = z.string().email().max(254);
const isResendTestAddress = (address: string) => /@resend\.dev(?:[>\s]|$)/i.test(address);

const getInvitationConfiguration = () => {
  const testRecipient = process.env.NODE_ENV === "development"
    ? process.env.RESEND_DEV_TEST_RECIPIENT?.trim()
    : undefined;
  if (testRecipient) {
    if (!invitationTestAddress.safeParse(testRecipient).success || isResendTestAddress(testRecipient)) return;
    return { from: DEFAULT_FROM, testRecipient };
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (from && !isResendTestAddress(from)) return { from, testRecipient: undefined };
};

export const isInvitationEmailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY?.trim() && getInvitationConfiguration());

export const isInvitationTestMode = () => Boolean(getInvitationConfiguration()?.testRecipient);

/** One private email per recipient. An acceptance ID confirms queueing only. */
export async function sendInvitationEmails(
  emails: SendEmailInput[],
  requestKey: string,
): Promise<InvitationBatchResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const configuration = getInvitationConfiguration();
  const testMode = configuration?.testRecipient ? { testMode: true as const } : {};
  const rejected = { accepted: 0, failed: emails.length, unconfirmed: 0, ...testMode };
  const unconfirmed = { accepted: 0, failed: 0, unconfirmed: emails.length, ...testMode };
  if (!apiKey || !configuration) {
    return { ...rejected, reason: "configuration" };
  }

  const { from, testRecipient } = configuration;
  if (testRecipient && emails.length !== 1) {
    return { ...rejected, reason: "test-recipient-count" };
  }

  const headers = { ...resendHeaders(apiKey), "Idempotency-Key": requestKey };
  const body = JSON.stringify(emails.map((email) => emailPayload(from, { ...email, to: testRecipient ?? email.to })));
  let outcomeUnconfirmed = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${RESEND_ENDPOINT}/batch`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      outcomeUnconfirmed = true;
      continue;
    }

    if (response.ok) {
      const payload = await response.json().catch(() => null);
      const accepted = Array.isArray(payload?.data) && payload.data.length <= emails.length
        ? payload.data.filter((item: { id?: unknown } | null) => typeof item?.id === "string" && item.id).length
        : 0;
      return { accepted, failed: 0, unconfirmed: emails.length - accepted, ...testMode };
    }

    if (response.status >= 500 || response.status === 409) {
      outcomeUnconfirmed = true;
      continue;
    }

    if (outcomeUnconfirmed) return unconfirmed;
    return response.status === 401 || response.status === 403
      ? { ...rejected, reason: "configuration" }
      : rejected;
  }

  return unconfirmed;
}
