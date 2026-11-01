import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ClientIdentityError,
  enforceRateLimit,
  getRetryAfterSeconds,
  getTrustedClientIp,
  isRateLimited,
  RateLimitExceededError,
  type RateLimitStore,
} from "./rate-limit-policy";

class MockPostgresRateLimitStore implements RateLimitStore {
  rows = new Map<string, { count: number; startedAt: Date }>();
  cleanupBatches: Array<{ cutoff: Date; limit: number }> = [];

  async increment({ key, now, windowMs }: { key: string; now: Date; windowMs: number }) {
    const existing = this.rows.get(key);
    const expired = existing && existing.startedAt.getTime() <= now.getTime() - windowMs;
    const next = expired
      ? { count: 1, startedAt: now }
      : existing
        ? { count: existing.count + 1, startedAt: existing.startedAt }
        : { count: 1, startedAt: now };
    this.rows.set(key, next);
    return next;
  }

  async cleanupExpired({ cutoff, limit }: { cutoff: Date; limit: number }) {
    this.cleanupBatches.push({ cutoff, limit });
    const expired = [...this.rows.entries()]
      .filter(([, row]) => row.startedAt.getTime() < cutoff.getTime())
      .sort(([, a], [, b]) => a.startedAt.getTime() - b.startedAt.getTime())
      .slice(0, limit);
    for (const [key, row] of expired) {
      // Model the production DELETE's repeated cutoff predicate. If a counter
      // was refreshed since selection, its active window must survive.
      if (row.startedAt.getTime() < cutoff.getTime()) this.rows.delete(key);
    }
  }
}

describe("public guest rate limit policy", () => {
  it("allows requests through the configured boundary and blocks the next one", () => {
    assert.equal(isRateLimited(10, 10), false);
    assert.equal(isRateLimited(11, 10), true);
    assert.equal(isRateLimited(31, 30), true);
  });

  it("returns positive retry information until the fixed window resets", () => {
    const started = new Date("2026-11-01T00:00:00.000Z");
    assert.equal(getRetryAfterSeconds(started, new Date("2026-11-01T00:00:30.000Z")), 30);
    assert.equal(getRetryAfterSeconds(started, new Date("2026-11-01T00:01:01.000Z")), 1);
  });

  it("uses only the configured trusted header and rejects spoofable fallbacks", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.77",
      "x-real-ip": "203.0.113.45",
      "cf-connecting-ip": "203.0.113.9",
    });
    assert.equal(
      getTrustedClientIp(headers, {
        production: true,
        trustedHeader: "cf-connecting-ip",
      }),
      "203.0.113.9",
    );
    assert.throws(
      () => getTrustedClientIp(headers, { production: true }),
      ClientIdentityError,
    );
  });

  it("accepts one valid Vercel address and rejects ambiguous or malformed headers", () => {
    assert.equal(
      getTrustedClientIp(new Headers({ "x-forwarded-for": "2001:db8::5" }), {
        production: true,
        trustedHeader: "x-forwarded-for",
      }),
      "2001:db8::5",
    );
    assert.throws(
      () => getTrustedClientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }), {
        production: true,
        trustedHeader: "x-forwarded-for",
      }),
      ClientIdentityError,
    );
    assert.throws(
      () => getTrustedClientIp(new Headers({ "x-forwarded-for": "attacker" }), {
        production: true,
        trustedHeader: "x-forwarded-for",
      }),
      ClientIdentityError,
    );
    assert.equal(
      getTrustedClientIp(
        new Headers({
          "x-forwarded-for": "2001:0db8:0:0:0:0:0:5",
          "x-real-ip": "198.51.100.88",
        }),
        { production: true, trustedHeader: "x-forwarded-for" },
      ),
      "2001:db8::5",
    );
    assert.throws(
      () => getTrustedClientIp(new Headers({ "x-forwarded-for": "198.51.100.2" }), {
        production: true,
      }),
      ClientIdentityError,
      "runtime platform detection must not silently select a production proxy header",
    );
  });

  it("models atomic PostgreSQL counters across concurrent requests", async () => {
    const store = new MockPostgresRateLimitStore();
    const now = new Date("2026-11-01T00:00:00.000Z");
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        enforceRateLimit({ store, key: "join:client", limit: 10, now, cleanupRandom: 1 }),
      ),
    );
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 10);
    assert.equal(
      outcomes.filter((result) => result.status === "rejected" && result.reason instanceof RateLimitExceededError).length,
      2,
    );
    assert.equal(store.rows.get("join:client")?.count, 12);
  });

  it("fails closed when shared counter storage is unavailable", async () => {
    const store: RateLimitStore = {
      async increment() { throw new Error("mock storage outage"); },
      async cleanupExpired() {},
    };
    await assert.rejects(
      enforceRateLimit({
        store,
        key: "join:client",
        limit: 10,
        now: new Date(),
        cleanupRandom: 1,
      }),
      /mock storage outage/,
    );
  });

  it("performs bounded cleanup without deleting active counters", async () => {
    const store = new MockPostgresRateLimitStore();
    const now = new Date("2026-11-01T00:02:00.000Z");
    for (let index = 0; index < 150; index += 1) {
      store.rows.set(`expired-${index}`, {
        count: 1,
        startedAt: new Date(now.getTime() - 120_000),
      });
    }
    store.rows.set("active", { count: 2, startedAt: new Date(now.getTime() - 30_000) });
    await enforceRateLimit({ store, key: "active", limit: 10, now, cleanupRandom: 0 });
    assert.equal(store.cleanupBatches[0]?.limit, 100);
    assert.equal([...store.rows.keys()].filter((key) => key.startsWith("expired-")).length, 50);
    assert.equal(store.rows.get("active")?.count, 3);
  });
});
