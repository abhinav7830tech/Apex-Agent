import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commitVerifiedStreamStart, extractStreamStartEvidence } from "./stream-start-evidence";

const payload = (overrides: Record<string, unknown> = {}) => ({
  type: "call.session_started",
  call_cid: "default:meeting-1",
  session_id: "session-1",
  created_at: "2099-01-01T00:00:00.000Z",
  call: { custom: { meetingId: "meeting-1" }, session: { started_at: "2026-10-31T23:59:00.000Z" } },
  ...overrides,
});

describe("Stream meeting start evidence", () => {
  it("uses nested actual session start and a stable call/session identity, never event created_at", () => {
    const first = extractStreamStartEvidence(payload());
    const retry = extractStreamStartEvidence(payload());
    assert.ok(first);
    assert.equal(first.actualStartedAt.toISOString(), "2026-10-31T23:59:00.000Z");
    assert.equal(first.streamEventId, retry?.streamEventId);
  });

  it("does not commit invalid-signature or missing/untrusted evidence", async () => {
    let commits = 0;
    const commit = async () => { commits++; return "committed"; };
    assert.equal(await commitVerifiedStreamStart(false, payload(), commit), "unverified");
    assert.equal(await commitVerifiedStreamStart(true, payload({ session_id: "" }), commit), "untrusted");
    assert.equal(await commitVerifiedStreamStart(true, payload({ call: { custom: { meetingId: "meeting-1" }, session: {} } }), commit), "untrusted");
    assert.equal(commits, 0);
  });

  it("allows a duplicate Stream session through to the idempotent billing operation", async () => {
    const keys: string[] = [];
    const commit = async (_meetingId: string, key: string) => { keys.push(key); return keys.length === 1 ? "normal" : "duplicate"; };
    assert.equal(await commitVerifiedStreamStart(true, payload(), commit), "normal");
    assert.equal(await commitVerifiedStreamStart(true, payload(), commit), "duplicate");
    assert.equal(keys[0], keys[1]);
  });
});
