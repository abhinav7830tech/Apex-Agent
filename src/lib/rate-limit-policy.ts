import { isIP } from "node:net";

const WINDOW_MS = 60_000;

export const getRetryAfterSeconds = (windowStartedAt: Date, now: Date) =>
  Math.max(1, Math.ceil((windowStartedAt.getTime() + WINDOW_MS - now.getTime()) / 1000));

export const isRateLimited = (count: number, limit: number) => count > limit;

export class ClientIdentityError extends Error {
  constructor(message = "A trusted client IP address is unavailable") {
    super(message);
    this.name = "ClientIdentityError";
  }
}

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many requests. Retry after ${retryAfterSeconds} seconds.`);
    this.name = "RateLimitExceededError";
  }
}

type HeaderReader = { get(name: string): string | null };

/**
 * Read only an explicitly configured trusted ingress header in production.
 * VERCEL=1 identifies the runtime but does not prove traffic reaches it directly.
 */
export const getTrustedClientIp = (
  requestHeaders: HeaderReader,
  {
    production,
    trustedHeader,
  }: { production: boolean; trustedHeader?: string | null },
) => {
  const normalizedHeader = trustedHeader?.trim().toLowerCase();
  const headerName = normalizedHeader || (production ? null : "x-forwarded-for");

  if (production && !headerName) {
    throw new ClientIdentityError(
      "Production must configure a trusted client IP header",
    );
  }

  // Local development may use the framework's forwarded address, but never
  // relies on it for a production deployment outside the verified proxy mode.
  const selectedHeader = headerName ?? "x-forwarded-for";
  if (!/^[a-z0-9-]+$/.test(selectedHeader)) {
    throw new ClientIdentityError("Trusted client IP header name is invalid");
  }

  const rawAddress = requestHeaders.get(selectedHeader)?.trim();
  // Do not choose one element from a chain: its trust boundary is ambiguous.
  if (!rawAddress || rawAddress.includes(",") || isIP(rawAddress) === 0) {
    if (!production) return "127.0.0.1";
    throw new ClientIdentityError();
  }

  if (isIP(rawAddress) === 6) {
    // URL canonicalizes equivalent IPv6 spellings so they cannot create
    // separate rate-limit buckets for the same client address.
    return new URL(`http://[${rawAddress}]/`).hostname.slice(1, -1);
  }
  return rawAddress;
};

export type RateLimitCounter = { count: number; startedAt: Date };

export type RateLimitStore = {
  increment: (input: {
    key: string;
    now: Date;
    windowMs: number;
  }) => Promise<RateLimitCounter>;
  cleanupExpired: (input: { cutoff: Date; limit: number }) => Promise<void>;
};

export const enforceRateLimit = async ({
  store,
  key,
  limit,
  now,
  cleanupRandom = Math.random(),
}: {
  store: RateLimitStore;
  key: string;
  limit: number;
  now: Date;
  cleanupRandom?: number;
}) => {
  const counter = await store.increment({ key, now, windowMs: WINDOW_MS });

  // Opportunistic bounded cleanup keeps write overhead low across instances.
  // The store must re-check the expiry cutoff at deletion time.
  if (cleanupRandom < 0.01) {
    try {
      await store.cleanupExpired({
        cutoff: new Date(now.getTime() - WINDOW_MS),
        limit: 100,
      });
    } catch (error) {
      console.warn(
        "[SECURITY] Rate-limit cleanup failed",
        JSON.stringify({
          event: "public_rate_limit_cleanup_failed",
          errorType: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  }

  if (isRateLimited(counter.count, limit)) {
    throw new RateLimitExceededError(
      getRetryAfterSeconds(counter.startedAt, now),
    );
  }
};
