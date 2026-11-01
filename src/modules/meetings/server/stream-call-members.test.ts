import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callMemberUpdates } from "./stream-call-members";

describe("Stream call membership (mocked contract)", () => {
  it("scopes host and AI identities to the call without inventing role names", () => {
    const request = callMemberUpdates("host-1", "agent-1");
    assert.deepEqual(request, {
      update_members: [{ user_id: "host-1" }, { user_id: "agent-1" }],
    });
    assert.equal("role" in request.update_members[0]!, false);
  });

  it("creates membership updates only for explicitly authorized identities", () => {
    assert.deepEqual(callMemberUpdates("invite-authorized-guest"), {
      update_members: [{ user_id: "invite-authorized-guest" }],
    });
  });
});
