
import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { createPostgresRateLimitStore } from "@/lib/postgres-rate-limit-store";
import {
  ClientIdentityError,
  enforceRateLimit,
  getTrustedClientIp,
  RateLimitExceededError,
} from "@/lib/rate-limit-policy";

const LIMITS = { validate: 30, join: 10, refresh: 20 } as const;

const postgresRateLimitStore = createPostgresRateLimitStore(db);

/** Enforces per-address, per-endpoint limits shared by all app instances. */
export const enforcePublicGuestRateLimit = async (
  scope: keyof typeof LIMITS,
) => {
  try {
    const requestHeaders = await headers();

    const address = getTrustedClientIp(requestHeaders, {
      production: process.env.NODE_ENV === "production",
      trustedHeader: process.env.PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER,
      vercel: process.env.VERCEL === "1",
    });

    const key = createHash("sha256")
      .update(`${scope}:${address}`)
      .digest("hex");

    await enforceRateLimit({
      store: postgresRateLimitStore,
      key,
      limit: LIMITS[scope],
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
      });
    }

    if (error instanceof TRPCError) {
      throw error;
    }

    if (error instanceof ClientIdentityError) {
      console.error(
        "[SECURITY] Trusted client identity unavailable",
        JSON.stringify({
          event: "public_rate_limit_identity_unavailable",
          reason: error.message,
          configuredHeader:
            process.env.PUBLIC_RATE_LIMIT_TRUSTED_IP_HEADER ?? null,
          vercelRuntime: process.env.VERCEL === "1",
        }),
      );
    } else {
      console.error(
        "[SECURITY] Guest rate-limit storage unavailable",
        JSON.stringify({
          event: "public_rate_limit_storage_unavailable",
          reason: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }

    // Missing/untrusted identity and storage failure both fail closed.
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Guest access is temporarily unavailable. Please retry shortly.",
      cause: error,
    });
  }
};
