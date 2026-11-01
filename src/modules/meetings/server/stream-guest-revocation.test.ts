import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revokeStreamGuestIdentities } from "./stream-guest-revocation";

const testClient = (failTokenAttempts = 0, failKickAttempts = 0) => {
  let tokenAttempts = 0;
  let kickAttempts = 0;
  const revokedIdentities: string[] = [];
  const kickedIdentities: string[] = [];
  return {
    client: {
      async updateUsers({ users }: { users: Record<string, { id: string }> }) {
        tokenAttempts += 1;
        if (tokenAttempts <= failTokenAttempts) throw new Error("mock failure");
        revokedIdentities.push(...Object.keys(users));
      },
      video: {
        call: () => ({
          async kickUser({ user_id }: { user_id: string }) {
            kickAttempts += 1;
            if (kickAttempts <= failKickAttempts) throw new Error("mock failure");
            kickedIdentities.push(user_id);
          },
        }),
      },
    },
    revokedIdentities,
    kickedIdentities,
    get tokenAttempts() { return tokenAttempts; },
    get kickAttempts() { return kickAttempts; },
  };
};

describe("mocked Stream guest revocation", () => {
  it("retries failed token revocation and kicks only supplied anonymous guests", async () => {
    const mock = testClient(1, 1);
    const result = await revokeStreamGuestIdentities({
      guestIds: ["guest_1", "guest_2"],
      meetingId: "meeting_1",
      client: mock.client,
      logger: { error: () => undefined },
    });
    assert.equal(mock.tokenAttempts, 2);
    assert.equal(result.tokenRevocationSucceeded, true);
    assert.deepEqual(mock.revokedIdentities.sort(), ["guest_1", "guest_2"]);
    assert.equal(result.kickedCount, 2);
    assert.deepEqual(mock.kickedIdentities.sort(), ["guest_1", "guest_2"]);
    assert.equal(mock.kickAttempts, 3);
  });

  it("returns an observable failure after bounded retries without claiming immediate revocation", async () => {
    const mock = testClient(2, 2);
    const events: unknown[][] = [];
    const result = await revokeStreamGuestIdentities({
      guestIds: ["guest_anonymous"],
      meetingId: "meeting_1",
      client: mock.client,
      logger: { error: (...values) => events.push(values) },
    });
    assert.equal(result.tokenRevocationSucceeded, false);
    assert.equal(result.kickedCount, 0);
    assert.equal(mock.tokenAttempts, 2);
    assert.equal(mock.kickAttempts, 2);
    assert.equal(events.length, 2);
    assert.equal(mock.revokedIdentities.length, 0);
  });

  it("does not call Stream for an empty anonymous guest set", async () => {
    const mock = testClient();
    const result = await revokeStreamGuestIdentities({
      guestIds: [],
      meetingId: "meeting_1",
      client: mock.client,
    });
    assert.deepEqual(result, { guestCount: 0, tokenRevocationSucceeded: true, kickedCount: 0 });
    assert.equal(mock.tokenAttempts, 0);
  });
});
