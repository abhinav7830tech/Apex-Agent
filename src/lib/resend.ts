import "server-only";

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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
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
