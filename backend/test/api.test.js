import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seedCheckDefinitions } from "../src/scripts/seedCheckDefinitions.js";
import { startTestDb, clearTestDb, stopTestDb } from "./mongoTestHelper.js";
import { _setClientForTesting, _resetClientForTesting } from "../src/services/llm/remediationClient.js";

const app = createApp();

beforeAll(startTestDb);
afterEach(clearTestDb);
afterEach(_resetClientForTesting);
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

describe("health check", () => {
  it("responds ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("auth", () => {
  it("rejects signup with a short password", async () => {
    const res = await request(app).post("/api/v1/auth/signup").send({ email: "a@b.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate signup for the same email", async () => {
    await signupAndLogin("dup@example.com");
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: "dup@example.com", password: "hunter22222" });
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await signupAndLogin("login@example.com", "correct-password");

    const good = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "correct-password" });
    expect(good.status).toBe(200);
    expect(typeof good.body.token).toBe("string");

    const bad = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("rejects requests to protected routes with no token", async () => {
    const res = await request(app).get("/api/v1/servers");
    expect(res.status).toBe(401);
  });

  it("rejects requests with a malformed/invalid token", async () => {
    const res = await request(app).get("/api/v1/servers").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("server creation and ownership", () => {
  it("creates a server and returns the API key exactly once", async () => {
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);
    expect(serverId).toBeTruthy();
    expect(apiKey).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
  });

  it("does not let one user see another user's servers", async () => {
    const tokenA = await signupAndLogin("a@example.com");
    const tokenB = await signupAndLogin("b@example.com");
    await createServer(tokenA, "a-server");

    const resA = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${tokenA}`);
    const resB = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${tokenB}`);

    expect(resA.body.servers).toHaveLength(1);
    expect(resB.body.servers).toHaveLength(0);
  });

  it("404s when fetching a server owned by someone else", async () => {
    const tokenA = await signupAndLogin("a2@example.com");
    const tokenB = await signupAndLogin("b2@example.com");
    const { serverId } = await createServer(tokenA);

    const res = await request(app).get(`/api/v1/servers/${serverId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });
});

describe("report ingestion", () => {
  async function setupServerWithDefinitions() {
    await seedCheckDefinitions();
    const token = await signupAndLogin();
    return { token, ...(await createServer(token)) };
  }

  it("rejects a report with no Authorization header", async () => {
    const res = await request(app).post("/api/v1/reports").send({ server_id: "x", findings: [] });
    expect(res.status).toBe(401);
  });

  it("rejects a report with an unknown API key", async () => {
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", "Bearer 0000000000000000000000000000000000000000000000000000000000000000")
      .send({ server_id: "x", findings: [] });
    expect(res.status).toBe(401);
  });

  it("rejects a report whose server_id doesn't match the API key's server", async () => {
    const { apiKey } = await setupServerWithDefinitions();
    const res = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: "some-other-server-id", findings: [] });
    expect(res.status).toBe(403);
  });

  it("accepts a real-shaped report and computes a meaningful score", async () => {
    const { serverId, apiKey } = await setupServerWithDefinitions();

    const findings = [
      { id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "PermitRootLogin yes" },
      { id: "ssh-password-auth", category: "ssh", title: "t", status: "pass", detail: "PasswordAuthentication no" },
      { id: "docker-socket-exposed", category: "docker", title: "t", status: "pass", detail: "not world-writable" },
      { id: "open-ports-scan", category: "network", title: "t", status: "info", detail: "22 <- [0.0.0.0]" },
    ];

    const res = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: serverId, agent_version: "0.1.0-test", findings, timestamp: new Date().toISOString() });

    expect(res.status).toBe(201);
    // ssh-root-login is critical and failed: 100 - 20 = 80
    expect(res.body.score.byCategory.ssh).toBe(80);
    expect(res.body.score.byCategory.docker).toBe(100);
    expect(res.body.unscoredCheckIds).toEqual([]);
  });

  it("flags an unknown checkId as unscored instead of guessing a severity", async () => {
    const { serverId, apiKey } = await setupServerWithDefinitions();

    const res = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        agent_version: "0.1.0-test",
        findings: [{ id: "not-a-real-check", category: "mystery", title: "t", status: "fail", detail: "" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.unscoredCheckIds).toEqual(["not-a-real-check"]);
  });

  it("updates the server's lastSeenAt and agentVersion, and shows the score via GET /servers", async () => {
    const { token, serverId, apiKey } = await setupServerWithDefinitions();

    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        agent_version: "0.2.0",
        findings: [{ id: "ssh-root-login", category: "ssh", title: "t", status: "pass", detail: "" }],
      });

    const res = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${token}`);
    expect(res.body.servers).toHaveLength(1);
    expect(res.body.servers[0].agentVersion).toBe("0.2.0");
    expect(res.body.servers[0].score.overall).toBe(100);
    expect(res.body.servers[0].lastSeenAt).toBeTruthy();
  });

  it("returns the latest report's findings via GET /servers/:id/findings", async () => {
    const { token, serverId, apiKey } = await setupServerWithDefinitions();

    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        agent_version: "0.2.0",
        findings: [{ id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "PermitRootLogin yes" }],
      });

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/findings`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.findings).toHaveLength(1);
    expect(res.body.findings[0].id).toBe("ssh-root-login");
    expect(res.body.findings[0].severity).toBe("critical");
    expect(res.body.findings[0].scored).toBe(true);
  });
});

describe("remediation endpoint", () => {
  async function setupServerWithFailingFinding() {
    await seedCheckDefinitions();
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);
    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        agent_version: "0.2.0",
        findings: [{ id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "PermitRootLogin yes" }],
      });
    return { token, serverId };
  }

  it("404s for a checkId not present in the latest report", async () => {
    const { token, serverId } = await setupServerWithFailingFinding();
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/findings/not-a-real-check/remediation`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("404s for a server owned by someone else", async () => {
    const { serverId } = await setupServerWithFailingFinding();
    const otherToken = await signupAndLogin("other@example.com");
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/findings/ssh-root-login/remediation`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("returns a template explanation when no LLM client is configured", async () => {
    _setClientForTesting(null); // simulates ANTHROPIC_API_KEY unset, regardless of test env
    const { token, serverId } = await setupServerWithFailingFinding();
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/findings/ssh-root-login/remediation`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.checkId).toBe("ssh-root-login");
    expect(res.body.source).toBe("template");
    expect(res.body.explanation).toContain("root SSH access");
  });

  it("returns the LLM's explanation when a client is configured and succeeds", async () => {
    _setClientForTesting({
      messages: { create: async () => ({ content: [{ type: "text", text: "Turn off root SSH login." }] }) },
    });
    const { token, serverId } = await setupServerWithFailingFinding();
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/findings/ssh-root-login/remediation`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("llm");
    expect(res.body.explanation).toBe("Turn off root SSH login.");
  });
});
