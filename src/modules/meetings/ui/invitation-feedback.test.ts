import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { toast } from "sonner";
import type { InvitationDelivery } from "../invitation-result";
import { showInvitationFeedback, showMeetingCreationFeedback } from "./invitation-feedback";

const noInvitations: InvitationDelivery = { accepted: 0, failed: 0, unconfirmed: 0, skipped: 0 };
const saved = "Meeting scheduled successfully.";

function captureToasts(t: TestContext) {
  const calls: { kind: string; title: unknown; description: unknown }[] = [];
  for (const kind of ["success", "error", "warning", "info"] as const) {
    t.mock.method(toast, kind, (...[title, options]: Parameters<typeof toast.success>) => {
      calls.push({ kind, title, description: options?.description });
    });
  }
  return calls;
}

const cases = [
  {
    name: "accepted",
    outcome: { accepted: 1 },
    kind: "success",
    description: "1 invitation email accepted by Resend. Inbox delivery is unverified.",
  },
  {
    name: "rejected",
    outcome: { failed: 2, reason: "configuration" },
    kind: "warning",
    description: "2 invitation emails could not be sent. Check the Resend API key and verified sender.",
  },
  {
    name: "unconfirmed",
    outcome: { unconfirmed: 1 },
    kind: "warning",
    description: "Resend acceptance could not be confirmed for 1 invitation email.",
  },
  {
    name: "skipped",
    outcome: { skipped: 2 },
    kind: "success",
    description: "2 invalid or duplicate participant email entries skipped.",
  },
] as const;

for (const { name, outcome, kind, description } of cases) {
  test(`meeting creation shows one toast for ${name} invitations`, (t) => {
    const calls = captureToasts(t);
    showMeetingCreationFeedback({ ...noInvitations, ...outcome });
    assert.deepEqual(calls, [{ kind, title: saved, description }]);
  });
}

test("meeting creation includes every mixed outcome in one warning", (t) => {
  const calls = captureToasts(t);
  showMeetingCreationFeedback({ accepted: 1, failed: 2, unconfirmed: 1, skipped: 2, reason: "configuration" });
  assert.deepEqual(calls, [{
    kind: "warning",
    title: saved,
    description: cases.map(({ description }) => description).join(" "),
  }]);
});

test("meeting creation keeps its success message when there were no invitations", (t) => {
  const calls = captureToasts(t);
  showMeetingCreationFeedback(noInvitations);
  assert.deepEqual(calls, [{ kind: "success", title: saved, description: undefined }]);
});

test("standalone invitation feedback keeps the original toast severities and messages", (t) => {
  const calls = captureToasts(t);
  showInvitationFeedback({ accepted: 1, failed: 2, unconfirmed: 1, skipped: 2, reason: "configuration" });
  assert.deepEqual(calls, ["success", "error", "warning", "info"].map((kind, index) => ({
    kind,
    title: cases[index].description,
    description: undefined,
  })));
});

test("meeting creation labels a test invitation as accepted only for the test recipient", (t) => {
  const calls = captureToasts(t);
  showMeetingCreationFeedback({ ...noInvitations, accepted: 1, testMode: true });
  assert.deepEqual(calls, [{
    kind: "success",
    title: saved,
    description: "1 invitation email accepted by Resend for the configured development test recipient only. Inbox delivery is unverified.",
  }]);
});

test("manual resend explains a blocked test batch and an unconfirmed test invitation", (t) => {
  const calls = captureToasts(t);
  showInvitationFeedback({ ...noInvitations, failed: 2, testMode: true, reason: "test-recipient-count" });
  showInvitationFeedback({ ...noInvitations, unconfirmed: 1, testMode: true });
  assert.deepEqual(calls, [
    {
      kind: "error",
      title: "2 invitation emails could not be sent. Development email testing requires exactly one invitation recipient.",
      description: undefined,
    },
    {
      kind: "warning",
      title: "Resend acceptance could not be confirmed for the invitation to the configured development test recipient.",
      description: undefined,
    },
  ]);
});
