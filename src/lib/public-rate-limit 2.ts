import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { publicRateLimits } from "@/db/schema";
import { getRetryAfterSeconds, isRateLimited } from "@/lib/rate-limit-policy";

const LIMITS = { validate: 30, join: 10, refresh: 20 } as const;
const WINDOW_MS = 60_000;

/** PostgreSQL-backed atomic fixed-window limiter shared by all app instances. */
export const enforcePublicGuestRateLimit = async (
  scope: keyof typeof LIMITS,
) => {
  const requestHeaders = await headers();
  // On hosted deployments x-forwarded-for is set by the trusted ingress. Use
  // only its first (client) address; never key limits on invitation tokens.
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || requestHeaders.get("x-real-ip") || "unknown";
  const key = createHash("sha256").update(`${scope}:${address}`).digest("hex");
  const now = new Date();

  try {
    const [row] = await db
      .insert(publicRateLimits)
      .values({ key, windowStartedAt: now, requestCount: 1 })
      .onConflictDoUpdate({
        target: publicRateLimits.key,
        set: {
          windowStartedAt: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${new Date(now.getTime() - WINDOW_MS)} THEN ${now} ELSE ${publicRateLimits.windowStartedAt} END`,
          requestCount: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${new Date(now.getTime() - WINDOW_MS)} THEN 1 ELSE ${publicRateLimits.requestCount} + 1 END`,
        },
      })
      .returning({
        count: publicRateLimits.requestCount,
        startedAt: publicRateLimits.windowStartedAt,
      });

    if (!row) throw new Error("Rate limit counter did not return a row");
    if (isRateLimited(row.count, LIMITS[scope])) {
      const retryAfter = getRetryAfterSeconds(row.startedAt, now);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Retry after ${retryAfter} seconds.`,
      });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    // Do not silently fall back to process-local limits in a multi-instance
    // deployment: that would make an infrastructure outage fail open.
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Guest access is temporarily unavailable. Please retry shortly.",
      cause: error,
    });
  }
};
