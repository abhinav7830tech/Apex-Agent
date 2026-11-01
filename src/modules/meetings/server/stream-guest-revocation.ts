type GuestRevocationClient = {
  updateUsers: (input: { users: Record<string, { id: string; revoke_tokens_issued_before: Date }> }) => Promise<unknown>;
  video: {
    call: (type: string, id: string) => {
      kickUser: (input: { user_id: string; block: boolean }) => Promise<unknown>;
    };
  };
};

type SecurityLogger = {
  error: (...values: unknown[]) => void;
};

/**
 * Stream revocation is best-effort. PostgreSQL invite state remains the
 * authorization source of truth; already issued Stream tokens can live for
 * up to their configured 30-minute lifetime if Stream is unavailable.
 */
export const revokeStreamGuestIdentities = async ({
  guestIds,
  meetingId,
  client,
  logger = console,
}: {
  guestIds: string[];
  meetingId: string;
  client: GuestRevocationClient;
  logger?: SecurityLogger;
}) => {
  if (!guestIds.length) {
    return { guestCount: 0, tokenRevocationSucceeded: true, kickedCount: 0 };
  }

  const revokedAt = new Date();
  let tokenRevocationSucceeded = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await client.updateUsers({
        users: Object.fromEntries(
          guestIds.map((id) => [id, { id, revoke_tokens_issued_before: revokedAt }]),
        ),
      });
      tokenRevocationSucceeded = true;
      break;
    } catch (error) {
      if (attempt === 2) {
        logger.error(
          "[SECURITY] Stream guest token revocation failed",
          JSON.stringify({
            event: "stream_guest_token_revocation_failed",
            guestCount: guestIds.length,
            retryAttempts: attempt,
            errorType: error instanceof Error ? error.name : "unknown",
          }),
        );
      }
    }
  }

  const kickResults = await Promise.all(
    guestIds.map(async (id) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await client.video.call("default", meetingId).kickUser({
            user_id: id,
            block: true,
          });
          return true;
        } catch {
          if (attempt === 2) return false;
        }
      }
      return false;
    }),
  );
  const kickedCount = kickResults.filter(Boolean).length;
  if (kickedCount !== guestIds.length) {
    logger.error(
      "[SECURITY] Stream guest disconnect failed",
      JSON.stringify({
        event: "stream_guest_disconnect_failed",
        guestCount: guestIds.length,
        kickedCount,
        retryAttempts: 2,
      }),
    );
  }

  return { guestCount: guestIds.length, tokenRevocationSucceeded, kickedCount };
};
