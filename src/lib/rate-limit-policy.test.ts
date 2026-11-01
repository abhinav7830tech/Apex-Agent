import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRetryAfterSeconds, isRateLimited } from "./rate-limit-policy";

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
});
