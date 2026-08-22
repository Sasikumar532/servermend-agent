import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { seedCheckDefinitions } from "../src/scripts/seedCheckDefinitions.js";
import { checkCatalog } from "../src/data/checkCatalog.js";
import { startTestDb, clearTestDb, stopTestDb } from "./mongoTestHelper.js";
import {
  _setTransportForTesting,
  _resetTransportForTesting,
} from "../src/services/alerting/emailTransport.js";

const app = createApp();

beforeAll(startTestDb);
afterEach(clearTestDb);
afterEach(_resetTransportForTesting);
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

describe("GET /dashboard/summary", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/v1/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("returns a zeroed summary with no servers registered", async () => {
    const token = await signupAndLogin();
    const res = await request(app).get("/api/v1/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      servers: { total: 0, reporting: 0, neverReported: 0 },
      averageScore: null,
      needsAttention: 0,
      openCriticals: 0,
      lastIngestAt: null,
      checkDefinitionsActive: checkCatalog.length,
      categoryCounts: [],
      recentActivity: [],
      attentionServers: [],
      recentlySeen: [],
      scoreTrend: [],
    });
  });

  it("aggregates scores, criticals, categories, and activity across a fleet", async () => {
    await seedCheckDefinitions();
    _setTransportForTesting(null); // exercise the skipped_no_smtp path, not real delivery
    const token = await signupAndLogin();

    const { serverId: reportingId, apiKey: reportingKey } = await createServer(token, "db-primary.example.com");
    const { serverId: neverId } = await createServer(token, "edge-proxy.example.com");

    const ingest = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${reportingKey}`)
      .send({
        server_id: reportingId,
        agent_version: "1.4.2",
        findings: [
          { id: "ssh-root-login", category: "ssh", title: "t", status: "fail", detail: "PermitRootLogin yes" },
          { id: "ssh-password-auth", category: "ssh", title: "t", status: "fail", detail: "PasswordAuthentication yes" },
        ],
      });
    expect(ingest.status).toBe(201);
    expect(ingest.body.score.overall).toBeLessThan(70); // both ssh checks critical and failing

    const res = await request(app).get("/api/v1/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.servers).toEqual({ total: 2, reporting: 1, neverReported: 1 });
    expect(res.body.averageScore).toBe(ingest.body.score.overall);
    expect(res.body.needsAttention).toBe(1);
    expect(res.body.openCriticals).toBe(2); // both failing findings are critical
    expect(res.body.checkDefinitionsActive).toBe(checkCatalog.length);
    expect(res.body.categoryCounts).toEqual([{ category: "ssh", count: 2 }]);

    expect(res.body.attentionServers).toEqual([
      { serverId: reportingId, hostname: "db-primary.example.com", score: ingest.body.score.overall },
    ]);

    // Only the reporting server has ever pushed a report, so it's the only
    // one with lastSeenAt set — the never-reported server shouldn't appear.
    expect(res.body.recentlySeen).toHaveLength(1);
    expect(res.body.recentlySeen[0].serverId).toBe(reportingId);

    // A new critical failure on first report triggers an alert (see
    // detectNewCriticalFailures.test.js) — two here, one per critical fail.
    expect(res.body.recentActivity).toHaveLength(2);
    expect(res.body.recentActivity[0].hostname).toBe("db-primary.example.com");
    expect(res.body.recentActivity[0].severity).toBe("critical");
    expect(res.body.recentActivity[0].emailStatus).toBe("skipped_no_smtp");

    expect(res.body.scoreTrend).toEqual([{ receivedAt: expect.any(String), score: ingest.body.score.overall }]);

    void neverId; // present only to be excluded from the reporting-derived fields above
  });

  it("scoreTrend spans the whole fleet, oldest first, capped at 12", async () => {
    await seedCheckDefinitions();
    const token = await signupAndLogin();
    const { serverId: aId, apiKey: aKey } = await createServer(token, "a.example.com");
    const { serverId: bId, apiKey: bKey } = await createServer(token, "b.example.com");

    // Interleaved across two servers — the trend orders by receivedAt
    // across the fleet, not grouped per server.
    for (const [serverId, apiKey] of [[aId, aKey], [bId, bKey], [aId, aKey], [bId, bKey]]) {
      await request(app)
        .post("/api/v1/reports")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({ server_id: serverId, agent_version: "1.0.0", findings: [] });
    }

    const summary = await request(app).get("/api/v1/dashboard/summary").set("Authorization", `Bearer ${token}`);
    expect(summary.body.scoreTrend).toHaveLength(4);
    // Chronological (oldest first) — receivedAt is non-decreasing.
    const receivedAtValues = summary.body.scoreTrend.map((p) => new Date(p.receivedAt).getTime());
    expect(receivedAtValues).toEqual([...receivedAtValues].sort((a, b) => a - b));
  });

  it("only aggregates the authenticated user's own servers", async () => {
    const ownerToken = await signupAndLogin("owner@example.com");
    const otherToken = await signupAndLogin("other@example.com");
    await createServer(ownerToken, "owners-server.example.com");

    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.servers.total).toBe(0);
  });
});
