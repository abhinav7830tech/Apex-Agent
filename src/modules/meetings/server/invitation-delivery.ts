import type { InvitationBatchResult, InvitationDelivery } from "../invitation-result";

/** The claim is unique and durable. A lost response must never trigger a fresh batch. */
export async function sendInvitationBatchOnce({
  count,
  skipped,
  testMode,
  claim,
  send,
  save,
  onSaveError,
}: {
  count: number;
  skipped: number;
  testMode?: boolean;
  claim: (pending: InvitationDelivery) => Promise<InvitationDelivery | null>;
  send: () => Promise<InvitationBatchResult>;
  save: (result: InvitationDelivery) => Promise<void>;
  onSaveError: () => void;
}): Promise<InvitationDelivery> {
  const pending: InvitationDelivery = {
    accepted: 0,
    failed: 0,
    unconfirmed: count,
    skipped,
    ...(testMode ? { testMode: true } : {}),
  };
  const existing = await claim(pending);
  if (existing) return existing;

  let result = pending;
  try {
    result = { ...await send(), skipped };
  } catch {
    // A timeout can happen after Resend accepted the request.
  }

  try {
    await save(result);
  } catch {
    onSaveError();
  }
  return result;
}
