export type InvitationDelivery = {
  accepted: number;
  failed: number;
  unconfirmed: number;
  skipped: number;
  reason?: "configuration" | "link-unavailable" | "passcode-unavailable" | "test-recipient-count";
  testMode?: true;
};

export type InvitationBatchResult = Omit<InvitationDelivery, "skipped">;
