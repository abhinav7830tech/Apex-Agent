import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRPCError } from "@trpc/server";
import {
  createHostTokenOperation,
  hostTokenInputSchema,
} from "./stream-token-operations";

describe("authenticated Stream host token authorization (mocked repository and Stream)", () => {
  it("requires a non-empty meetingId", () => {
    assert.equal(hostTokenInputSchema.safeParse(undefined).success, false);
    assert.equal(hostTokenInputSchema.safeParse({}).success, false);
    assert.equal(hostTokenInputSchema.safeParse({ meetingId: "" }).success, false);
  });

  it("issues a token only for an owned meeting and assigns no global admin role", async () => {
    const calls: Array<{ name: string; value: unknown }> = [];
    const operation = createHostTokenOperation({
      getOwnedMeeting: async (meetingId, userId) =>
        (() => {
          calls.push({ name: "authorize", value: { meetingId, userId } });
          return meetingId === "meeting-1" && userId === "host-1"
            ? { id: meetingId }
            : null;
        })(),
      ensureCall: async (meeting) => { calls.push({ name: "ensureCall", value: meeting }); },
      upsertUser: async (user) => { calls.push({ name: "upsertUser", value: user }); },
      generateToken: (userId) => {
        calls.push({ name: "generateToken", value: userId });
        return "mock-token";
      },
    });

    assert.equal(
      await operation({ meetingId: "meeting-1", user: { id: "host-1", name: "Host" } }),
      "mock-token",
    );
    assert.deepEqual(calls[1], {
      name: "ensureCall",
      value: { id: "meeting-1" },
    });
    assert.deepEqual(calls[2], {
      name: "upsertUser",
      value: { id: "host-1", name: "Host", role: "user" },
    });
    assert.equal(calls.some(({ value }) => (value as { role?: string }).role === "admin"), false);
    assert.deepEqual(calls.map(({ name }) => name), [
      "authorize",
      "ensureCall",
      "upsertUser",
      "generateToken",
    ]);
  });

  it("rejects cross-meeting access before call setup, user upsert, or token issuance", async () => {
    const calls: string[] = [];
    const operation = createHostTokenOperation({
      getOwnedMeeting: async () => { calls.push("authorize"); return null; },
      ensureCall: async () => { calls.push("ensureCall"); },
      upsertUser: async () => { calls.push("upsertUser"); },
      generateToken: () => { calls.push("generateToken"); return "mock-token"; },
    });

    await assert.rejects(
      operation({ meetingId: "someone-elses-meeting", user: { id: "attacker", name: "Attacker" } }),
      (error: unknown) => error instanceof TRPCError && error.code === "NOT_FOUND",
    );
    assert.deepEqual(calls, ["authorize"]);
    assert.equal(calls.includes("generateToken"), false);
  });

  it("does not upsert a user or issue a token when call authorization setup fails", async () => {
    const calls: string[] = [];
    const operation = createHostTokenOperation({
      getOwnedMeeting: async () => ({ id: "meeting-1" }),
      ensureCall: async () => { calls.push("ensureCall"); throw new Error("Stream setup failed"); },
      upsertUser: async () => { calls.push("upsertUser"); },
      generateToken: () => { calls.push("generateToken"); return "mock-token"; },
    });

    await assert.rejects(
      operation({ meetingId: "meeting-1", user: { id: "host-1", name: "Host" } }),
      /Stream setup failed/,
    );
    assert.deepEqual(calls, ["ensureCall"]);
    assert.equal(calls.includes("generateToken"), false);
  });
});
