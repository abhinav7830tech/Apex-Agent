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
 * Vercel's edge network overwrites the forwarded address before the request
 * reaches the function, so this header is only trusted when the runtime is
 * verified as Vercel (`VERCEL=1`). Operators behind another ingress must set
 * PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER to the single-value header that ingress
 * overwrites.
 *
 * https://vercel.com/docs/headers/request-headers#x-forwarded-for
 */
export const VERCEL_TRUSTED_IP_HEADER = "x-forwarded-for";

const LOCAL_DEVELOPMENT_HEADER = "x-forwarded-for";

const resolveTrustedHeader = ({
  production,
  trustedHeader,
  vercel,
}: {
  production: boolean;
  trustedHeader?: string | null;
  vercel?: boolean;
}) => {
  const configuredHeader = trustedHeader?.trim().toLowerCase();
  if (configuredHeader) return configuredHeader;
  if (!production) return LOCAL_DEVELOPMENT_HEADER;
  return vercel ? VERCEL_TRUSTED_IP_HEADER : null;
};

/**
 * Reads the client IP from the one header the current runtime is allowed to
 * trust. A production runtime without either an explicit header or a verified
 * Vercel platform fails closed instead of guessing a spoofable fallback.
 */
export const getTrustedClientIp = (
  requestHeaders: HeaderReader,
  {
    production,
    trustedHeader,
    vercel = false,
  }: { production: boolean; trustedHeader?: string | null; vercel?: boolean },
) => {
  const selectedHeader = resolveTrustedHeader({
    production,
    trustedHeader,
    vercel,
  });

  if (!selectedHeader) {
    throw new ClientIdentityError(
      "Production must configure PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER or run on a verified Vercel deployment",
    );
  }

  if (!/^[a-z0-9-]+$/.test(selectedHeader)) {
    throw new ClientIdentityError("Trusted client IP header name is invalid");
  }

  const rawAddress = requestHeaders.get(selectedHeader)?.trim();
  // Do not choose one element from a chain: its trust boundary is ambiguous.
  if (!rawAddress || rawAddress.includes(",") || isIP(rawAddress) === 0) {
    if (!production) return "127.0.0.1";
    throw new ClientIdentityError(
      `Trusted client IP header "${selectedHeader}" is missing or contains an invalid address`,
    );
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
