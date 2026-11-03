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
    // Raw Date parameters inside sql`` bypass the column's UTC encoder. Without
    // sql.param, a non-UTC process timezone serializes the comparison
    // timestamp differently from the inserted column value, making every
    // window look expired and resetting the counter on each request.
    const cutoff = sql.param(
      new Date(now.getTime() - windowMs),
      publicRateLimits.windowStartedAt,
    );
    const current = sql.param(now, publicRateLimits.windowStartedAt);

    const [row] = await database
      .insert(publicRateLimits)
      .values({ key, windowStartedAt: now, requestCount: 1 })
      .onConflictDoUpdate({
        target: publicRateLimits.key,
        set: {
          windowStartedAt: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${cutoff} THEN ${current} ELSE ${publicRateLimits.windowStartedAt} END`,
          requestCount: sql`CASE WHEN ${publicRateLimits.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${publicRateLimits.requestCount} + 1 END`,
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
    // a counter refreshed after the candidate scan. Encode the cutoff exactly
    // like the column so process timezone cannot widen the deletion window.
    const encodedCutoff = sql.param(cutoff, publicRateLimits.windowStartedAt);

    await database.execute(sql`
      WITH expired AS (
        SELECT ctid
        FROM public_rate_limits
        WHERE window_started_at < ${encodedCutoff}
        ORDER BY window_started_at
        LIMIT ${limit}
      )
      DELETE FROM public_rate_limits AS rate_limit
      USING expired
      WHERE rate_limit.ctid = expired.ctid
        AND rate_limit.window_started_at < ${encodedCutoff}
    `);
  },
});
