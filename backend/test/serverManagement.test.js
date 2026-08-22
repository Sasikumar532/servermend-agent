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

describe("PATCH /servers/:id", () => {
  it("renames the display hostname", async () => {
    const token = await signupAndLogin();
    const { serverId } = await createServer(token, "old-name.example.com");

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hostname: "new-name.example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ serverId, hostname: "new-name.example.com" });

    const list = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${token}`);
    expect(list.body.servers[0].hostname).toBe("new-name.example.com");
  });

  it("trims whitespace and clears the hostname on an empty string", async () => {
    const token = await signupAndLogin();
    const { serverId } = await createServer(token, "old-name.example.com");

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hostname: "   " });

    expect(res.status).toBe(200);
    expect(res.body.hostname).toBeNull();
  });

  it("404s for a server owned by someone else", async () => {
    const ownerToken = await signupAndLogin("owner@example.com");
    const otherToken = await signupAndLogin("other@example.com");
    const { serverId } = await createServer(ownerToken);

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ hostname: "hijacked.example.com" });

    expect(res.status).toBe(404);
  });

  it("400s on a non-string hostname", async () => {
    const token = await signupAndLogin();
    const { serverId } = await createServer(token);

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hostname: 12345 });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /servers/:id", () => {
  it("removes the server and everything derived from it", async () => {
    await seedCheckDefinitions();
    const token = await signupAndLogin();
    const { serverId, apiKey } = await createServer(token);

    await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        server_id: serverId,
        agent_version: "1.0.0",
        findings: [{ id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "PermitRootLogin yes" }],
      });

    const del = await request(app).delete(`/api/v1/servers/${serverId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${token}`);
    expect(list.body.servers).toHaveLength(0);

    // The API key hash lived on the now-deleted Server document, so
    // requireAgentAuth's lookup-by-hash fails — this is the revocation.
    const reportAfterDelete = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({ server_id: serverId, findings: [] });
    expect(reportAfterDelete.status).toBe(401);
  });

  it("404s for a server owned by someone else", async () => {
    const ownerToken = await signupAndLogin("owner@example.com");
    const otherToken = await signupAndLogin("other@example.com");
    const { serverId } = await createServer(ownerToken);

    const res = await request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(404);

    const list = await request(app).get("/api/v1/servers").set("Authorization", `Bearer ${ownerToken}`);
    expect(list.body.servers).toHaveLength(1);
  });

  it("404s for a nonexistent server", async () => {
    const token = await signupAndLogin();

    const res = await request(app)
      .delete("/api/v1/servers/does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
