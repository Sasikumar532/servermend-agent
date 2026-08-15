import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { startTestDb, clearTestDb, stopTestDb } from "./mongoTestHelper.js";

const app = createApp();

beforeAll(startTestDb);
afterEach(clearTestDb);
afterAll(stopTestDb);

async function signupAndLogin(email = "owner@example.com", password = "hunter22222") {
  const res = await request(app).post("/api/v1/auth/signup").send({ email, password });
  expect(res.status).toBe(201);
  return res.body.token;
}

async function createServer(token, hostname = "web-1") {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Authorization", `Bearer ${token}`)
    .send({ hostname });
  expect(res.status).toBe(201);
  return res.body; // { serverId, apiKey }
}

// Wire-shaped like the Go agent's baseline.Baseline JSON (snake_case), not
// the backend's internal camelCase schema — this is what a real POST body
// from the agent looks like.
function wireBaseline(overrides = {}) {
  return {
    captured_at: new Date().toISOString(),
    authorized_keys: ["alice:abc123"],
    system_cron_entries: [],
    user_cron_entries: [],
    systemd_units: ["nginx.service"],
    suid_binaries: [],
    ...overrides,
  };
}

describe("baseline sync (agent-facing)", () => {
  it("rejects a push with no agent auth", async () => {
    const res = await request(app)
      .post("/api/v1/servers/whatever/baseline")
      .send({ server_id: "whatever", baseline: wireBaseline() });
    expect(res.status).toBe(401);
  });

  it("rejects a push whose server_id doesn't match the API key's server", async () => {
    const token = await signupAndLogin();
    const { apiKey } = await createServer(token);
    const res = await request(app)
      .post("/api/v1/servers/some-other-id/baseline")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: "some-other-id-but-wrong", baseline: wireBaseline() });
    expect(res.status).toBe(403);
  });

  it("the first push for a server becomes the confirmed baseline outright", async () => {
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: serverId, baseline: wireBaseline() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.baseline.authorizedKeys).toEqual(["alice:abc123"]);
    expect(res.body.baseline.systemdUnits).toEqual(["nginx.service"]);
  });

  it("a second push with an addition is held as pending, not applied automatically", async () => {
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);

    await request(app)
      .post(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: serverId, baseline: wireBaseline() });

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        baseline: wireBaseline({ authorized_keys: ["alice:abc123", "mallory:evil456"] }),
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.diff).toEqual({ authorizedKeys: ["mallory:evil456"] });
    // The confirmed baseline is unchanged by a pending push.
    expect(res.body.baseline.authorizedKeys).toEqual(["alice:abc123"]);
  });

  it("a push matching the confirmed baseline again clears a stale pending", async () => {
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);
    const push = (baseline) =>
      request(app)
        .post(`/api/v1/servers/${serverId}/baseline`)
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ server_id: serverId, baseline });

    await push(wireBaseline());
    const drifted = await push(wireBaseline({ authorized_keys: ["alice:abc123", "mallory:evil456"] }));
    expect(drifted.body.status).toBe("pending");

    const resolved = await push(wireBaseline()); // mallory's key is gone again
    expect(resolved.body.status).toBe("confirmed");

    const getRes = await request(app)
      .get(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.body.pending).toBeNull();
  });
});

describe("baseline read + confirm (dashboard-facing)", () => {
  async function setupServerWithPendingDrift() {
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);
    const push = (baseline) =>
      request(app)
        .post(`/api/v1/servers/${serverId}/baseline`)
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ server_id: serverId, baseline });

    await push(wireBaseline());
    await push(wireBaseline({ system_cron_entries: ["/etc/cron.d/new-job:sha1"] }));
    return { token, serverId };
  }

  it("GET returns confirmed=null, pending=null before any push", async () => {
    const token = await signupAndLogin();
    const { serverId } = await createServer(token);
    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ confirmed: null, pending: null, pendingSince: null, diff: null });
  });

  it("GET shows the pending snapshot and its diff against confirmed", async () => {
    const { token, serverId } = await setupServerWithPendingDrift();
    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.confirmed.systemCronEntries).toEqual([]);
    expect(res.body.pending.systemCronEntries).toEqual(["/etc/cron.d/new-job:sha1"]);
    expect(res.body.diff).toEqual({ systemCronEntries: ["/etc/cron.d/new-job:sha1"] });
    expect(res.body.pendingSince).toBeTruthy();
  });

  it("404s GET for a server owned by someone else", async () => {
    const { serverId } = await setupServerWithPendingDrift();
    const otherToken = await signupAndLogin("other@example.com");
    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("confirm promotes pending to confirmed and clears pending", async () => {
    const { token, serverId } = await setupServerWithPendingDrift();

    const confirmRes = await request(app)
      .post(`/api/v1/servers/${serverId}/baseline/confirm`)
      .set("Authorization", `Bearer ${token}`);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe("confirmed");
    expect(confirmRes.body.baseline.systemCronEntries).toEqual(["/etc/cron.d/new-job:sha1"]);

    const getRes = await request(app)
      .get(`/api/v1/servers/${serverId}/baseline`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.body.pending).toBeNull();
    expect(getRes.body.confirmed.systemCronEntries).toEqual(["/etc/cron.d/new-job:sha1"]);
  });

  it("404s confirm when there is nothing pending", async () => {
    const token = await signupAndLogin();
    const { serverId } = await createServer(token);
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/baseline/confirm`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("404s confirm for a server owned by someone else", async () => {
    const { serverId } = await setupServerWithPendingDrift();
    const otherToken = await signupAndLogin("other2@example.com");
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/baseline/confirm`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});
