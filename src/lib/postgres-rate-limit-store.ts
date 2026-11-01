import { sql } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { publicRateLimits } from "@/db/schema";
import type { RateLimitStore } from "@/lib/rate-limit-policy";

/**
 * Builds the actual PostgreSQL counter adapter. The database is injected so
 * the same Drizzle statements can run against an isolated PostgreSQL engine.
 */
export const createPostgresRateLimitStore = (
  database: typeof productionDb,
): RateLimitStore => ({
  async increment({ key, now, windowMs }) {
    const [row] = await database
      .insert(publicRateLimits)
      .values({ key, windowStartedAt: now, requestCount: 1 })
      .onConflictDoUpdate({
        target: publicRateLimits.key,
        set: {
          windowStartedAt: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${new Date(now.getTime() - windowMs)} THEN ${now} ELSE ${publicRateLimits.windowStartedAt} END`,
          requestCount: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${new Date(now.getTime() - windowMs)} THEN 1 ELSE ${publicRateLimits.requestCount} + 1 END`,
        },
      })
      .returning({
        count: publicRateLimits.requestCount,
        startedAt: publicRateLimits.windowStartedAt,
      });

    if (!row) throw new Error("Rate limit counter did not return a row");
    return row;
  },

  async cleanupExpired({ cutoff, limit }) {
    // ctid bounds each deletion batch; rechecking expiry prevents deletion of
    // a counter refreshed after the candidate scan.
    await database.execute(sql`
      WITH expired AS (
        SELECT ctid
        FROM public_rate_limits
        WHERE window_started_at < ${cutoff}
        ORDER BY window_started_at
        LIMIT ${limit}
      )
      DELETE FROM public_rate_limits AS rate_limit
      USING expired
      WHERE rate_limit.ctid = expired.ctid
        AND rate_limit.window_started_at < ${cutoff}
    `);
  },
});
