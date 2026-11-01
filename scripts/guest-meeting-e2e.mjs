/**
 * Server-side end-to-end checks for the external guest meeting flow.
 *
 * This exercises the real Better Auth signup, protected tRPC procedures, public
 * guest procedures, the database, and Stream token generation. Browser/WebRTC
 * coverage lives in scripts/guest-browser-e2e.mjs.
 *
 * Usage: node scripts/guest-meeting-e2e.mjs
 */
import "dotenv/config";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { StreamClient } from "@stream-io/node-sdk";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const ORIGIN = BASE;
const sql = neon(process.env.DATABASE_URL);

const stream = new StreamClient(
  process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY,
  process.env.STREAM_VIDEO_SECRET_KEY,
);

const results = [];
let failures = 0;

const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const assert = (name, condition, detail = "") => {
  record(name, Boolean(condition), detail);
  if (!condition) throw new Error(`Assertion failed: ${name}${detail ? ` (${detail})` : ""}`);
};

const expectError = async (name, promise, expectedCode, messagePart) => {
  try {
    await promise;
    record(name, false, "expected an error but the call succeeded");
  } catch (error) {
    const code = error?.data?.code ?? error?.code;
    const message = error?.message ?? String(error);
    const ok =
      code === expectedCode &&
      (!messagePart || message.toLowerCase().includes(messagePart.toLowerCase()));
    record(name, ok, `code=${code} message="${message.slice(0, 120)}"`);
    if (!ok) {
      throw new Error(
        `Expected ${expectedCode}${messagePart ? ` containing "${messagePart}"` : ""}, got ${code}: ${message}`,
      );
    }
  }
};

const parseTrpc = async (response) => {
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`);
    error.data = body?.error?.data;
    error.code = body?.error?.data?.code;
    throw error;
  }
  return body?.result?.data;
};

const trpcQuery = async (path, input, cookie) => {
  const url = `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetch(url, {
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
  });
  return parseTrpc(response);
};

const trpcMutation = async (path, input, cookie) => {
  const response = await fetch(`${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(input),
  });
  return parseTrpc(response);
};

const signUp = async (name) => {
  const email = `guest-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password: "GuestE2ePassword123!" }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Signup failed: ${JSON.stringify(body)}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { cookie, user: body.user, email };
};

const createAgent = (cookie) =>
  trpcMutation(
    "agents.create",
    {
      name: "Guest E2E Agent",
      instructions: "You are a helpful meeting assistant.",
      description: "Created by the guest meeting E2E test.",
    },
    cookie,
  );

let meetingSequence = 0;
const createMeeting = async (cookie, agentId, { joinable = false, ...overrides } = {}) => {
  meetingSequence += 1;
  const meeting = await trpcMutation(
    "meetings.create",
    {
      name: "Guest E2E Meeting",
      description: "External guest verification meeting.",
      agentId,
      scheduledAt:
        overrides.scheduledAt ??
        new Date(Date.now() + meetingSequence * 31 * 60_000).toISOString(),
      durationMinutes: 30,
      timezone: "UTC",
      participants: ["host@example.com"],
      visibility: "private",
      ...overrides,
    },
    cookie,
  );

  // The create procedure rejects overlapping meetings for the same host. The
  // tests need several joinable meetings at once, so create them at unique
  // future times and then move them into the join window directly.
  if (joinable) {
    await sql`
      update meetings
      set scheduled_at = now() + interval '1 minute',
          ends_at = now() + interval '31 minutes'
      where id = ${meeting.id}
    `;
  }

  return meeting;
};

const verifyStreamJwt = (token, expectedUserId, expectedTtl = 1800) => {
  const parts = token.split(".");
  assert("Stream token is a three-part JWT", parts.length === 3);
  const [header, payload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.STREAM_VIDEO_SECRET_KEY)
    .update(`${header}.${payload}`)
    .digest("base64url");
  assert("Stream token signature verifies with server secret", signature === expectedSignature);
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert("Stream token belongs to the expected user", decoded.user_id === expectedUserId, decoded.user_id);
  const ttl = decoded.exp - decoded.iat;
  assert(`Stream token TTL is ${expectedTtl} seconds`, ttl === expectedTtl, `${ttl}s`);
  assert("Stream token is not already expired", decoded.exp * 1000 > Date.now());
  return decoded;
};

const run = async () => {
  const health = await fetch(`${BASE}/join/health-check`);
  assert("Join route responds", health.status === 200, `HTTP ${health.status}`);

  const host = await signUp("Guest E2E Host");
  assert("Host signup works with Better Auth", Boolean(host.user.id));
  const agent = await createAgent(host.cookie);
  assert("Host can create an agent", Boolean(agent.id));
  const meeting = await createMeeting(host.cookie, agent.id, { joinable: true });
  assert("Host can create a meeting", Boolean(meeting.id));

  const hostToken = await trpcMutation(
    "meetings.generateToken",
    { meetingId: meeting.id },
    host.cookie,
  );
  const hostClaims = verifyStreamJwt(hostToken, host.user.id, 3600);
  assert("Host token generation is authorized", hostClaims.user_id === host.user.id);

  const streamCall = await stream.video.call("default", meeting.id).get({});
  assert(
    "Host token generation created the Stream call",
    streamCall.call?.custom?.meetingId === meeting.id,
    streamCall.call?.custom?.meetingId,
  );

  const invite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: meeting.id, requireAccount: false },
    host.cookie,
  );
  assert("Host can create an invitation", Boolean(invite.token));
  assert("Invitation URL uses configured app base URL", invite.url.startsWith(`${BASE}/join/`), invite.url);
  assert(
    "Invitation URL includes the meeting id and token",
    invite.url.includes(`/join/${encodeURIComponent(meeting.id)}?token=${encodeURIComponent(invite.token)}`),
  );
  assert("Invitation URL is not a production localhost leak in this dev run", invite.url.startsWith("http://localhost:3000/"));

  const inviteForHost = await trpcQuery(
    "meetings.getInvite",
    { meetingId: meeting.id, token: invite.token },
    host.cookie,
  );
  assert("Host is recognized on the invitation", inviteForHost.viewer.isHost === true);
  assert("Invitation is joinable", inviteForHost.meeting.state === "joinable");

  const inviteForGuest = await trpcQuery("meetings.getInvite", {
    meetingId: meeting.id,
    token: invite.token,
  });
  assert("Anonymous viewer is not authenticated", inviteForGuest.viewer.authenticated === false);
  assert("Anonymous viewer is not the host", inviteForGuest.viewer.isHost === false);
  assert("Invitation exposes the meeting name", inviteForGuest.meeting.name === meeting.name);
  assert("Invitation does not expose the host's user id", !JSON.stringify(inviteForGuest).includes(host.user.id));

  await expectError(
    "createInvite requires authentication",
    trpcMutation("meetings.createInvite", { meetingId: meeting.id }),
    "UNAUTHORIZED",
  );

  const guest = await trpcMutation("meetings.guestJoin", {
    meetingId: meeting.id,
    token: invite.token,
    displayName: "External Guest",
  });
  assert("Guest can join without an account", guest.userId.startsWith("guest_"), guest.userId);
  assert("Guest display name is preserved", guest.userName === "External Guest");
  assert("Guest receives a guest record id", guest.guestRecordId === guest.userId);
  verifyStreamJwt(guest.streamToken, guest.userId);

  const refreshed = await trpcMutation("meetings.guestRefreshToken", {
    meetingId: meeting.id,
    token: invite.token,
    guestId: guest.userId,
  });
  verifyStreamJwt(refreshed.streamToken, guest.userId);
  assert("Guest token refresh works", refreshed.expiresInSeconds === 1800);

  await expectError(
    "Guest cannot refresh another guest's token",
    trpcMutation("meetings.guestRefreshToken", {
      meetingId: meeting.id,
      token: invite.token,
      guestId: "guest_not_owned_by_this_invite",
    }),
    "FORBIDDEN",
    "guest session",
  );

  await expectError(
    "Invalid invitation token is rejected",
    trpcQuery("meetings.getInvite", { meetingId: meeting.id, token: "invalid-token" }),
    "NOT_FOUND",
    "invalid",
  );

  await expectError(
    "Invitation token is bound to its meeting",
    trpcQuery("meetings.getInvite", { meetingId: "different-meeting", token: invite.token }),
    "NOT_FOUND",
  );

  // requireAccount = true
  const accountMeeting = await createMeeting(host.cookie, agent.id, { name: "Account Required Meeting", joinable: true });
  const accountInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: accountMeeting.id, requireAccount: true },
    host.cookie,
  );
  assert("Host can require an account", accountInvite.requireAccount === true);

  await expectError(
    "Anonymous guest is blocked when account is required",
    trpcMutation("meetings.guestJoin", {
      meetingId: accountMeeting.id,
      token: accountInvite.token,
      displayName: "Blocked Guest",
    }),
    "FORBIDDEN",
    "sign in",
  );

  const registeredGuest = await signUp("Registered Guest");
  const registeredJoin = await trpcMutation(
    "meetings.guestJoin",
    { meetingId: accountMeeting.id, token: accountInvite.token },
    registeredGuest.cookie,
  );
  assert("Signed-in guest can join an account-required meeting", registeredJoin.userId === registeredGuest.user.id);
  assert("Signed-in guest does not create an anonymous guest record", registeredJoin.guestRecordId === null);
  verifyStreamJwt(registeredJoin.streamToken, registeredGuest.user.id);

  await expectError(
    "Another host cannot create an invite for this meeting",
    trpcMutation("meetings.createInvite", { meetingId: meeting.id }, registeredGuest.cookie),
    "NOT_FOUND",
  );
  await expectError(
    "Another user cannot generate a host token for this meeting",
    trpcMutation("meetings.generateToken", { meetingId: meeting.id }, registeredGuest.cookie),
    "NOT_FOUND",
  );

  // Expired invite
  const expiredMeeting = await createMeeting(host.cookie, agent.id, { name: "Expired Invite Meeting", joinable: true });
  const expiredInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: expiredMeeting.id },
    host.cookie,
  );
  await sql`update meeting_invites set expires_at = now() - interval '1 minute' where id = ${expiredInvite.token}`;
  await expectError(
    "Expired invitation is rejected",
    trpcQuery("meetings.getInvite", { meetingId: expiredMeeting.id, token: expiredInvite.token }),
    "BAD_REQUEST",
    "expired",
  );

  // Revoked invite
  const revokedMeeting = await createMeeting(host.cookie, agent.id, { name: "Revoked Invite Meeting", joinable: true });
  const revokedInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: revokedMeeting.id },
    host.cookie,
  );
  await sql`update meeting_invites set revoked_at = now() where id = ${revokedInvite.token}`;
  await expectError(
    "Revoked invitation is rejected",
    trpcQuery("meetings.getInvite", { meetingId: revokedMeeting.id, token: revokedInvite.token }),
    "FORBIDDEN",
    "revoked",
  );

  // Cancelled / completed / processing / failed meetings
  const cancelledMeeting = await createMeeting(host.cookie, agent.id, { name: "Cancelled Meeting", joinable: true });
  const cancelledInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: cancelledMeeting.id },
    host.cookie,
  );
  await sql`update meetings set status = 'cancelled' where id = ${cancelledMeeting.id}`;
  await expectError(
    "Cancelled meeting is rejected",
    trpcQuery("meetings.getInvite", { meetingId: cancelledMeeting.id, token: cancelledInvite.token }),
    "BAD_REQUEST",
    "cancelled",
  );

  const completedMeeting = await createMeeting(host.cookie, agent.id, { name: "Completed Meeting", joinable: true });
  const completedInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: completedMeeting.id },
    host.cookie,
  );
  await sql`update meetings set status = 'completed' where id = ${completedMeeting.id}`;
  await expectError(
    "Completed meeting is rejected",
    trpcQuery("meetings.getInvite", { meetingId: completedMeeting.id, token: completedInvite.token }),
    "BAD_REQUEST",
    "already ended",
  );

  const processingMeeting = await createMeeting(host.cookie, agent.id, { name: "Processing Meeting", joinable: true });
  const processingInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: processingMeeting.id },
    host.cookie,
  );
  await sql`update meetings set status = 'processing' where id = ${processingMeeting.id}`;
  await expectError(
    "Processing meeting is rejected",
    trpcQuery("meetings.getInvite", { meetingId: processingMeeting.id, token: processingInvite.token }),
    "BAD_REQUEST",
    "already ended",
  );

  const failedMeeting = await createMeeting(host.cookie, agent.id, { name: "Failed Meeting", joinable: true });
  const failedInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: failedMeeting.id },
    host.cookie,
  );
  await sql`update meetings set status = 'failed' where id = ${failedMeeting.id}`;
  await expectError(
    "Failed meeting is rejected",
    trpcQuery("meetings.getInvite", { meetingId: failedMeeting.id, token: failedInvite.token }),
    "BAD_REQUEST",
    "could not be completed",
  );

  // Waiting room
  const waitingMeeting = await createMeeting(host.cookie, agent.id, {
    name: "Waiting Room E2E Meeting",
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });
  const waitingInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: waitingMeeting.id },
    host.cookie,
  );
  const waitingView = await trpcQuery("meetings.getInvite", {
    meetingId: waitingMeeting.id,
    token: waitingInvite.token,
  });
  assert("Future meeting exposes a waiting state", waitingView.meeting.state === "waiting");
  assert("Waiting room includes a joinableAt time", Boolean(waitingView.meeting.joinableAt));
  await expectError(
    "Guest cannot bypass the waiting room",
    trpcMutation("meetings.guestJoin", {
      meetingId: waitingMeeting.id,
      token: waitingInvite.token,
      displayName: "Early Guest",
    }),
    "PRECONDITION_FAILED",
    "not open",
  );

  // Past the grace window
  const pastMeeting = await createMeeting(host.cookie, agent.id, { name: "Past Meeting", joinable: true });
  const pastInvite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: pastMeeting.id },
    host.cookie,
  );
  await sql`
    update meetings
    set scheduled_at = now() - interval '2 hours',
        ends_at = now() - interval '90 minutes'
    where id = ${pastMeeting.id}
  `;
  await expectError(
    "Meeting past its join window is rejected",
    trpcQuery("meetings.getInvite", { meetingId: pastMeeting.id, token: pastInvite.token }),
    "BAD_REQUEST",
    "scheduled time",
  );

  // Invite regeneration revokes the previous token.
  const regenerated = await trpcMutation(
    "meetings.createInvite",
    { meetingId: meeting.id, regenerate: true },
    host.cookie,
  );
  assert("Regenerated invitation has a new token", regenerated.token !== invite.token);
  await expectError(
    "Old invitation is revoked after regeneration",
    trpcQuery("meetings.getInvite", { meetingId: meeting.id, token: invite.token }),
    "FORBIDDEN",
    "revoked",
  );

  console.log("\nServer-side summary");
  console.log(`  passed: ${results.filter((r) => r.ok).length}`);
  console.log(`  failed: ${failures}`);
  console.log(`  host: ${host.email}`);
  console.log(`  meetingId: ${meeting.id}`);
  console.log(`  guestId: ${guest.userId}`);

  if (failures > 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error("\nE2E run aborted:", error);
  process.exitCode = 1;
});
