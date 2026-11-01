import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db as productionDb } from "@/db";
import { createPostgresRateLimitStore } from "./postgres-rate-limit-store";

const makeStore = async () => {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE public_rate_limits (
      key text PRIMARY KEY NOT NULL,
      window_started_at timestamp NOT NULL,
      request_count integer NOT NULL
    );
    CREATE INDEX public_rate_limits_window_started_at_idx
      ON public_rate_limits (window_started_at);
  `);
  const database = drizzle(client);
  const store = createPostgresRateLimitStore(
    database as unknown as typeof productionDb,
  );
  return { client, store };
};

describe("PostgreSQL rate-limit adapter against disposable PGlite", () => {
  it("executes atomic upserts and returns each persisted count", async (t) => {
    const { client, store } = await makeStore();
    t.after(() => client.close());
    const now = new Date("2026-11-01T00:00:00.000Z");

    for (let count = 1; count <= 5; count += 1) {
      const row = await store.increment({ key: "join:client", now, windowMs: 60_000 });
      assert.equal(row.count, count);
      assert.equal(row.startedAt.getTime(), now.getTime());
    }
  });

  it("resets the persisted counter when the fixed window expires", async (t) => {
    const { client, store } = await makeStore();
    t.after(() => client.close());
    const start = new Date("2026-11-01T00:00:00.000Z");

    assert.equal((await store.increment({ key: "validate:client", now: start, windowMs: 60_000 })).count, 1);
    assert.equal((await store.increment({ key: "validate:client", now: new Date(start.getTime() + 59_999), windowMs: 60_000 })).count, 2);
    const reset = await store.increment({ key: "validate:client", now: new Date(start.getTime() + 60_000), windowMs: 60_000 });
    assert.equal(reset.count, 1);
    assert.equal(reset.startedAt.getTime(), start.getTime() + 60_000);
  });

  it("preserves all increments submitted concurrently through the adapter", async (t) => {
    const { client, store } = await makeStore();
    t.after(() => client.close());
    const now = new Date("2026-11-01T00:00:00.000Z");

    const rows = await Promise.all(
      Array.from({ length: 32 }, () =>
        store.increment({ key: "refresh:client", now, windowMs: 60_000 }),
      ),
    );
    assert.equal(rows.length, 32);
    const persisted = await client.query<{ request_count: number }>(
      "SELECT request_count FROM public_rate_limits WHERE key = 'refresh:client'",
    );
    assert.equal(persisted.rows[0]?.request_count, 32);
  });

  it("deletes at most the requested number of expired rows and retains active rows", async (t) => {
    const { client, store } = await makeStore();
    t.after(() => client.close());
    const now = new Date("2026-11-01T00:02:00.000Z");
    await client.query(`
      INSERT INTO public_rate_limits (key, window_started_at, request_count)
      SELECT 'stale-' || n, $1::timestamp - interval '2 minutes', 1
      FROM generate_series(1, 150) AS n
    `, [now]);
    await store.increment({
      key: "active",
      now: new Date(now.getTime() - 30_000),
      windowMs: 60_000,
    });

    await store.cleanupExpired({
      cutoff: new Date(now.getTime() - 60_000),
      limit: 100,
    });

    const counts = await client.query<{ stale: number; active: number }>(`
      SELECT
        count(*) FILTER (WHERE key LIKE 'stale-%')::int AS stale,
        count(*) FILTER (WHERE key = 'active')::int AS active
      FROM public_rate_limits
    `);
    assert.equal(counts.rows[0]?.stale, 50);
    assert.equal(counts.rows[0]?.active, 1);
  });

  it("surfaces storage failures from the actual adapter", async (t) => {
    const { client, store } = await makeStore();
    t.after(() => client.close());
    await client.exec("DROP TABLE public_rate_limits");

    await assert.rejects(
      store.increment({ key: "join:client", now: new Date(), windowMs: 60_000 }),
    );
    await assert.rejects(
      store.cleanupExpired({ cutoff: new Date(), limit: 100 }),
    );
  });
});
