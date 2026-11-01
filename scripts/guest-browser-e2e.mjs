/**
 * Browser/WebRTC verification for external guest meetings.
 *
 * Runs three isolated headless Chrome profiles:
 *   - host (authenticated Better Auth session)
 *   - guest one (no Apex Agent account)
 *   - guest two (no Apex Agent account)
 *
 * All three join the same Stream Video call. The script verifies the UI and the
 * Stream server's call membership, then captures screenshots.
 *
 * Usage: node scripts/guest-browser-e2e.mjs
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { StreamClient } from "@stream-io/node-sdk";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const ORIGIN = BASE;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const STREAM = new StreamClient(
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (fn, timeout = 30_000, label = "condition") => {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
};

const parseTrpc = async (response) => {
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`);
    error.data = body?.error?.data;
    throw error;
  }
  return body?.result?.data;
};

const trpcMutation = async (procedure, input, cookie) => {
  const response = await fetch(`${BASE}/api/trpc/${procedure}`, {
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
  const email = `guest-browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password: "GuestBrowserPassword123!" }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Signup failed: ${JSON.stringify(body)}`);
  const cookieHeader = response.headers.getSetCookie().join("; ");
  const sessionCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("better-auth.session_token="));
  if (!sessionCookie) throw new Error("Better Auth did not set a session cookie");
  return {
    cookie: cookieHeader,
    sessionCookie,
    user: body.user,
    email,
  };
};

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const handlers = this.events.get(message.method) ?? [];
      for (const handler of handlers) handler(message.params);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return new CDP(socket);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.events.get(method) ?? [];
    handlers.push(handler);
    this.events.set(method, handlers);
  }

  close() {
    this.socket.close();
  }
}

const evaluate = async (cdp, expression) => {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result.value;
};

const bodyText = (cdp) =>
  evaluate(cdp, "document.body ? document.body.innerText : ''");

const waitForText = (cdp, text, timeout = 30_000) =>
  waitFor(
    async () => (await bodyText(cdp)).includes(text),
    timeout,
    `text "${text}"`,
  );

const clickButton = async (cdp, text) => {
  const clicked = await evaluate(
    cdp,
    `(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        element.textContent?.trim().includes(${JSON.stringify(text)}),
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error(`Button "${text}" not found`);
};

const clickParticipantButton = async (cdp) => {
  const clicked = await evaluate(
    cdp,
    `(() => {
      const button = [...document.querySelectorAll("button")].find((element) =>
        /^\\d+$/.test(element.textContent?.trim() ?? ""),
      );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("Participant count button not found");
};

const clickLeave = async (cdp) => {
  const clicked = await evaluate(
    cdp,
    `(() => {
      const button =
        document.querySelector('[data-testid="leave-call-button"]') ??
        document.querySelector('[data-testid="cancel-call-button"]') ??
        [...document.querySelectorAll("button")].find((element) =>
          /leave/i.test(
            element.getAttribute("title") ??
              element.getAttribute("aria-label") ??
              element.textContent ??
              "",
          ),
        );
      if (!button) return false;
      button.click();
      return true;
    })()`,
  );
  if (!clicked) throw new Error("Leave call button not found");
};

const fillDisplayName = async (cdp, name) => {
  const filled = await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector("#guest-display-name");
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  if (!filled) throw new Error("Guest display name input not found");
};

const launchChrome = async (port, profileDir) => {
  const process = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--use-mock-keychain",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  process.stderr.on("data", () => {});
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        return response.ok;
      } catch {
        return false;
      }
    },
    20_000,
    `Chrome DevTools on port ${port}`,
  );
  return process;
};

const newPage = async (port) => {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  const target = await response.json();
  const cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  return cdp;
};

const navigate = async (cdp, url) => {
  await cdp.send("Page.navigate", { url });
  await waitFor(
    async () => (await evaluate(cdp, "document.readyState")) === "complete",
    30_000,
    `navigation to ${url}`,
  );
};

const rawCallSession = async (meetingId) => {
  // The server SDK deserializes live session participants as `null` in this
  // version, so read the raw REST payload to inspect the participant records.
  // Sign the server JWT directly to avoid depending on a transitive package.
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ server: true })).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", process.env.STREAM_VIDEO_SECRET_KEY)
    .update(`${header}.${payload}`)
    .digest("base64url");
  const token = `${header}.${payload}.${signature}`;
  const url = `https://video.stream-io-api.com/api/v2/video/call/default/${encodeURIComponent(
    meetingId,
  )}?api_key=${process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY}`;
  const response = await fetch(url, {
    headers: { Authorization: token, "stream-auth-type": "jwt" },
  });
  if (!response.ok) throw new Error(`Stream REST ${response.status}`);
  return response.json();
};

const callSnapshot = async (meetingId) => {
  const [response, raw] = await Promise.all([
    STREAM.video.call("default", meetingId).get({}),
    rawCallSession(meetingId),
  ]);
  const rawParticipants = raw.call?.session?.participants ?? [];
  const memberIds = (response.members ?? []).map((member) => member.user_id);
  const sessionParticipants = (response.call?.session?.participants ?? []).map(
    (participant) => participant?.user_id ?? null,
  );
  return {
    memberIds,
    sessionParticipants,
    rawParticipantCount: rawParticipants.length,
    rawParticipants: rawParticipants.map((participant) => ({
      user_id: participant?.user_id,
      name: participant?.name,
      role: participant?.role,
      type: participant?.user?.type ?? participant?.type,
    })),
    participantsCountByRole: raw.call?.session?.participants_count_by_role,
    anonymousParticipantCount: raw.call?.session?.anonymous_participant_count,
    liveStartedAt: raw.call?.session?.live_started_at,
    endedAt: raw.call?.session?.ended_at,
  };
};

const screenshot = async (cdp, name) => {
  const result = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    path.join("test-artifacts", `${name}.png`),
    Buffer.from(result.data, "base64"),
  );
};

const run = async () => {
  await mkdir("test-artifacts", { recursive: true });

  console.log("Setting up host, meeting, Stream call and invitation...");
  const host = await signUp("Browser E2E Host");
  const agent = await trpcMutation(
    "agents.create",
    { name: "Browser E2E Agent", instructions: "You are a meeting assistant." },
    host.cookie,
  );
  const meeting = await trpcMutation(
    "meetings.create",
    {
      name: "Browser Guest E2E Meeting",
      description: "Three-participant browser verification.",
      agentId: agent.id,
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      durationMinutes: 30,
      timezone: "UTC",
      participants: ["host@example.com"],
      visibility: "private",
    },
    host.cookie,
  );
  await trpcMutation("meetings.generateToken", { meetingId: meeting.id }, host.cookie);
  const invite = await trpcMutation(
    "meetings.createInvite",
    { meetingId: meeting.id, requireAccount: false },
    host.cookie,
  );
  assert("Invitation URL is shareable", invite.url.startsWith(`${BASE}/join/`), invite.url);

  const root = await mkdtemp(path.join(os.tmpdir(), "apex-guest-browser-"));
  const processes = [];
  let hostPage;
  let guestOnePage;
  let guestTwoPage;

  try {
    const hostChrome = await launchChrome(9222, path.join(root, "host"));
    processes.push(hostChrome);
    const guestOneChrome = await launchChrome(9223, path.join(root, "guest-one"));
    processes.push(guestOneChrome);
    const guestTwoChrome = await launchChrome(9224, path.join(root, "guest-two"));
    processes.push(guestTwoChrome);

    hostPage = await newPage(9222);
    guestOnePage = await newPage(9223);
    guestTwoPage = await newPage(9224);

    const [cookieName, cookieValue] = host.sessionCookie.split("=");
    await hostPage.send("Network.setCookie", {
      name: cookieName,
      value: cookieValue,
      url: BASE,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });

    console.log("Host joining the meeting room...");
    await navigate(hostPage, `${BASE}/call/${meeting.id}`);
    await waitForText(hostPage, "Ready to join?", 30_000);
    await clickButton(hostPage, "Join Call");
    await waitForText(hostPage, "End for all", 30_000);
    assert("Host reached the active call UI", (await bodyText(hostPage)).includes("End for all"));
    await sleep(3000);
    console.log("  Stream snapshot after host:", JSON.stringify(await callSnapshot(meeting.id)));

    console.log("Guest one joining without an account...");
    await navigate(guestOnePage, invite.url);
    await waitForText(guestOnePage, "Your display name", 30_000);
    await fillDisplayName(guestOnePage, "Browser Guest One");
    await clickButton(guestOnePage, "Continue to meeting");
    await waitForText(guestOnePage, "Join meeting", 30_000);
    await clickButton(guestOnePage, "Join meeting");
    await waitForText(guestOnePage, "Host:", 30_000);
    assert("Guest one reached the active call UI", (await bodyText(guestOnePage)).includes("Browser Guest E2E Meeting"));
    await sleep(3000);
    console.log("  Stream snapshot after guest one:", JSON.stringify(await callSnapshot(meeting.id)));

    console.log("Guest two joining without an account...");
    await navigate(guestTwoPage, invite.url);
    await waitForText(guestTwoPage, "Your display name", 30_000);
    await fillDisplayName(guestTwoPage, "Browser Guest Two");
    await clickButton(guestTwoPage, "Continue to meeting");
    await waitForText(guestTwoPage, "Join meeting", 30_000);
    await clickButton(guestTwoPage, "Join meeting");
    await waitForText(guestTwoPage, "Host:", 30_000);
    assert("Guest two reached the active call UI", (await bodyText(guestTwoPage)).includes("Browser Guest E2E Meeting"));
    await sleep(3000);
    console.log("  Stream snapshot after guest two:", JSON.stringify(await callSnapshot(meeting.id)));

    console.log("Checking participant lists in the UI...");
    await clickParticipantButton(hostPage);
    await waitForText(hostPage, "Browser Guest One", 30_000);
    await waitForText(hostPage, "Browser Guest Two", 30_000);
    assert("Host sees both external guests", true);

    await clickParticipantButton(guestOnePage);
    await waitForText(guestOnePage, "Browser E2E Host", 30_000);
    await waitForText(guestOnePage, "Browser Guest Two", 30_000);
    assert("Guest one sees the host and the other guest", true);

    console.log("Verifying Stream call membership on the server...");
    const snapshot = await waitFor(
      async () => {
        const current = await callSnapshot(meeting.id);
        return current.rawParticipantCount >= 3 ? current : null;
      },
      20_000,
      "three live Stream participants",
    );
    console.log("  Stream members:", snapshot.memberIds);
    console.log("  Stream session participant count:", snapshot.rawParticipantCount);
    console.log("  Stream participants:", JSON.stringify(snapshot.rawParticipants));
    console.log("  Stream roles:", JSON.stringify(snapshot.participantsCountByRole));
    assert(
      "Stream call has three live participants",
      snapshot.rawParticipantCount === 3,
      `count=${snapshot.rawParticipantCount}`,
    );
    assert(
      "Stream call session is live and not ended",
      Boolean(snapshot.liveStartedAt) && !snapshot.endedAt,
      `liveStartedAt=${snapshot.liveStartedAt} endedAt=${snapshot.endedAt}`,
    );

    const hostParticipantCount = await evaluate(
      hostPage,
      `(() => {
        const button = [...document.querySelectorAll("button")].find((element) =>
          /^\\d+$/.test(element.textContent?.trim() ?? ""),
        );
        return button?.textContent?.trim() ?? null;
      })()`,
    );
    // Stream's participant count control counts the other participants, so a
    // host with two guests sees "2" while the call session has three people.
    assert(
      "Host UI participant control lists the two guests",
      Number(hostParticipantCount) >= 2,
      `count=${hostParticipantCount}`,
    );

    await screenshot(hostPage, "host-active-call");
    await screenshot(guestOnePage, "guest-one-active-call");
    await screenshot(guestTwoPage, "guest-two-active-call");

    console.log("Guest one leaving the meeting...");
    await clickLeave(guestOnePage);
    await waitForText(guestOnePage, "You left the meeting", 30_000);
    assert("Guest can leave without ending the call", true);

    const stillConnected = await bodyText(hostPage);
    assert("Host remains in the call after a guest leaves", stillConnected.includes("End for all"));

    console.log("\nBrowser summary");
    console.log(`  passed: ${results.filter((result) => result.ok).length}`);
    console.log(`  failed: ${failures}`);
    console.log(`  meetingId: ${meeting.id}`);
    console.log(`  invite: ${invite.url}`);
    console.log(`  artifacts: test-artifacts/`);
  } finally {
    hostPage?.close();
    guestOnePage?.close();
    guestTwoPage?.close();
    for (const child of processes) {
      child.kill("SIGTERM");
    }
    await sleep(500);
    for (const child of processes) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
  }

  process.exit(failures > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error("\nBrowser E2E run aborted:", error);
  process.exit(1);
});
