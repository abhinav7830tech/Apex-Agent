import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppUrlConfigurationError, buildMeetingInviteUrl } from "@/lib/app-url";
import { isInvitationEmailConfigured, sendInvitationEmails } from "@/lib/resend";

const sample = (to: string) => ({ to, subject: "Planning", html: "<p>Planning</p>", text: "Planning" });

describe("Resend batch invitation transport", () => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_DEV_TEST_RECIPIENT: process.env.RESEND_DEV_TEST_RECIPIENT,
  };
  before(() => {
    process.env.RESEND_API_KEY = "mock-key";
    process.env.RESEND_FROM_EMAIL = "Apex Agent <invitations@example.test>";
    delete process.env.RESEND_DEV_TEST_RECIPIENT;
  });
  after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends recipients separately and retries an ambiguous request with the same body and key", async (t) => {
    const calls: RequestInit[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      assert.equal(url, "https://api.resend.com/emails/batch");
      calls.push(init);
      if (calls.length === 1) throw new Error("response lost");
      return Response.json({ data: [{ id: "one" }, { id: "two" }] });
    });

    const recipients = ["first@example.test", "second@example.test"];
    const result = await sendInvitationEmails(recipients.map(sample), "meeting-email/meeting-1/creation");
    assert.equal(fetch.mock.callCount(), 2);
    assert.deepEqual(calls[0].headers, calls[1].headers);
    assert.equal(calls[0].body, calls[1].body);
    assert.deepEqual(JSON.parse(String(calls[0].body)).map(({ to }: { to: string[] }) => to), recipients.map((address) => [address]));
    assert.deepEqual(result, { accepted: 2, failed: 0, unconfirmed: 0 });
  });

  it("counts a provider rejection separately from an unconfirmed acceptance", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
    assert.deepEqual(await sendInvitationEmails([sample("guest@example.test")], "rejected"), {
      accepted: 0, failed: 1, unconfirmed: 0, reason: "configuration",
    });
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.mockImplementation(async () => Response.json({}));
    assert.deepEqual(await sendInvitationEmails([sample("guest@example.test")], "unknown"), {
      accepted: 0, failed: 0, unconfirmed: 1,
    });
  });

  it("skips transport when the sender is the Resend test sender", async (t) => {
    const sender = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "Apex Agent <onboarding@resend.dev>";
    t.after(() => { process.env.RESEND_FROM_EMAIL = sender; });
    const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("network request attempted"));
    const result = await sendInvitationEmails([sample("guest@example.test")], "sender");
    assert.equal(result.reason, "configuration");
    assert.equal(fetch.mock.callCount(), 0);
  });

  it("routes one development invitation to the test inbox and keeps the batch idempotency key", async (t) => {
    Object.assign(process.env, { NODE_ENV: "development", RESEND_DEV_TEST_RECIPIENT: "  Owner@example.test  " });
    assert.equal(isInvitationEmailConfigured(), true);

    const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      assert.equal(url, "https://api.resend.com/emails/batch");
      assert.equal(new Headers(init.headers).get("Idempotency-Key"), "development-invite");
      assert.deepEqual(JSON.parse(String(init.body)), [{
        from: "Apex Agent <onboarding@resend.dev>",
        ...sample("Owner@example.test"),
        to: ["Owner@example.test"],
      }]);
      return Response.json({ data: [{ id: "accepted" }] });
    });
    assert.deepEqual(await sendInvitationEmails([sample("guest@example.test")], "development-invite"), {
      accepted: 1, failed: 0, unconfirmed: 0, testMode: true,
    });
    assert.equal(fetch.mock.callCount(), 1);
  });

  it("blocks empty or multiple-recipient test batches and invalid development configuration", async (t) => {
    Object.assign(process.env, { NODE_ENV: "development", RESEND_DEV_TEST_RECIPIENT: "owner@example.test" });
    const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("network request attempted"));

    for (const recipients of [[], ["owner@example.test", "guest@example.test"]]) {
      assert.deepEqual(await sendInvitationEmails(recipients.map(sample), "blocked"), {
        accepted: 0, failed: recipients.length, unconfirmed: 0, reason: "test-recipient-count", testMode: true,
      });
    }
    for (const address of ["owner@example.test, guest@example.test", "delivered@resend.dev"]) {
      process.env.RESEND_DEV_TEST_RECIPIENT = address;
      assert.equal(isInvitationEmailConfigured(), false);
      assert.equal((await sendInvitationEmails([sample("owner@example.test")], "invalid")).reason, "configuration");
    }
    assert.equal(fetch.mock.callCount(), 0);
  });

  it("ignores the development opt-in outside development and still requires a verified-domain sender", async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      RESEND_DEV_TEST_RECIPIENT: "owner@example.test",
      RESEND_FROM_EMAIL: "Apex Agent <onboarding@resend.dev>",
    });
    const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("network request attempted"));
    for (const environment of ["production", "test"]) {
      Object.assign(process.env, { NODE_ENV: environment });
      assert.equal(isInvitationEmailConfigured(), false);
      assert.equal((await sendInvitationEmails([sample("owner@example.test")], "non-dev")).reason, "configuration");
    }
    assert.equal(fetch.mock.callCount(), 0);

    Object.assign(process.env, { NODE_ENV: "production", RESEND_FROM_EMAIL: "Apex Agent <invitations@example.test>" });
    const recipients = ["guest@example.test", "other@example.test"];
    fetch.mock.mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const emails = JSON.parse(String(init?.body));
      assert.deepEqual(emails, recipients.map((to) => ({
        ...sample(to),
        from: process.env.RESEND_FROM_EMAIL,
        to: [to],
      })));
      return Response.json({ data: [{ id: "first" }, { id: "second" }] });
    });
    assert.deepEqual(await sendInvitationEmails(recipients.map(sample), "production-invite"), {
      accepted: 2, failed: 0, unconfirmed: 0,
    });
  });
});

describe("production guest invitations", () => {
  it("uses the configured production origin and encodes the meeting ID and token", (t) => {
    const env = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL };
    t.after(() => {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://apex.example.com", BETTER_AUTH_URL: "http://localhost:3000" });
    assert.equal(buildMeetingInviteUrl({ meetingId: "a/b", token: "x&y" }), "https://apex.example.com/join/a%2Fb?token=x%26y");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    assert.throws(() => buildMeetingInviteUrl({ meetingId: "meeting-1", token: "token" }), AppUrlConfigurationError);
  });

  it("includes all meeting details and keeps the passcode separate from the join link", async () => {
    const { renderMeetingInvitation } = await import("../email-invitations");
    const meeting = {
      name: "<Planning>",
      scheduledAt: new Date("2026-11-06T00:15:00Z"),
      timezone: "America/New_York",
      durationMinutes: 45,
    };
    const url = "https://apex.example.com/join/meeting-1?token=guest-token";
    const { html, text } = renderMeetingInvitation(meeting, url, "123456");
    assert.match(html, /&lt;Planning&gt;/);
    assert.match(text, /November 5, 2026/);
    assert.match(text, /7:15 PM/);
    assert.ok(text.includes("America/New_York"));
    assert.ok(text.includes("45 minutes"));
    assert.ok(text.includes(`Join meeting: ${url}`));
    assert.ok(text.includes("Passcode: 123456"));
    assert.equal(renderMeetingInvitation(meeting, url).text.includes("Passcode"), false);
  });

  it("exposes the invitee count in the guest payload without the participant addresses", async () => {
    const { toGuestMeeting } = await import("../guest-access");
    const result = toGuestMeeting({
      invite: { requireAccount: true },
      meeting: {
        id: "meeting-1",
        name: "Planning",
        description: null,
        status: "scheduled",
        scheduledAt: new Date("2026-11-06T00:15:00Z"),
        endsAt: null,
        durationMinutes: 30,
        passcodeHash: "stored-hash",
        participants: ["guest@example.test", "other@example.test"],
      },
      hostName: "Host",
      agentName: "Agent",
      state: "waiting",
      joinableAt: null,
      now: new Date("2026-11-05T14:30:00Z"),
    } as Parameters<typeof toGuestMeeting>[0]);
    assert.equal(result.participantCount, 2);
    assert.equal(result.requiresPasscode, true);
    assert.equal(result.requireAccount, true);
    assert.equal("participants" in result, false);
    assert.equal(JSON.stringify(result).includes("example.test"), false);
  });
});
