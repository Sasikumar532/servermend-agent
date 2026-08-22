import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seedCheckDefinitions } from "../src/scripts/seedCheckDefinitions.js";
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
  return res.body;
}

describe("GET /findings", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/v1/findings");
    expect(res.status).toBe(401);
  });

  it("returns an empty list with no servers registered", async () => {
    const token = await signupAndLogin();
    const res = await request(app).get("/api/v1/findings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ findings: [] });
  });

  it("aggregates failing findings across the fleet, worst severity first", async () => {
    await seedCheckDefinitions();
    const token = await signupAndLogin();

    const serverA = await createServer(token, "a.example.com");
    const serverB = await createServer(token, "b.example.com");

    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${serverA.apiKey}`)
      .send({
        server_id: serverA.serverId,
        agent_version: "1.0.0",
        findings: [
          { id: "nginx-server-tokens", category: "nginx", title: "low one", status: "fail", detail: "d" }, // low
          { id: "ssh-root-login", category: "ssh", title: "t", status: "pass", detail: "d" }, // passing, excluded
        ],
      });
    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${serverB.apiKey}`)
      .send({
        server_id: serverB.serverId,
        agent_version: "1.0.0",
        findings: [{ id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "d" }], // critical
      });

    const res = await request(app).get("/api/v1/findings").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.findings).toHaveLength(2);
    // Critical (server B) sorts ahead of low (server A), regardless of report order.
    expect(res.body.findings[0]).toMatchObject({
      serverId: serverB.serverId,
      hostname: "b.example.com",
      checkId: "ssh-root-login",
      severity: "critical",
    });
    expect(res.body.findings[1]).toMatchObject({
      serverId: serverA.serverId,
      hostname: "a.example.com",
      checkId: "nginx-server-tokens",
      severity: "low",
    });
  });

  it("only aggregates the authenticated user's own servers", async () => {
    const ownerToken = await signupAndLogin("owner@example.com");
    const otherToken = await signupAndLogin("other@example.com");
    await createServer(ownerToken, "owners-server.example.com");

    const res = await request(app).get("/api/v1/findings").set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual([]);
  });
});
