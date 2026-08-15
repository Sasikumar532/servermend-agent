import { Router } from "express";
import crypto from "node:crypto";
import { Server } from "../models/Server.js";
import { Report } from "../models/Report.js";
import { CheckDefinition } from "../models/CheckDefinition.js";
import { requireUserAuth } from "../middleware/userAuth.js";
import { hashApiKey } from "../middleware/agentAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dashboardRateLimit } from "../middleware/rateLimit.js";
import { explainFinding } from "../services/llm/remediationClient.js";

const router = Router();

// Applied per-route below, not as a blanket router.use(requireUserAuth) —
// this router shares its /api/v1 mount prefix with authRouter and
// reportsRouter (see app.js), and Express tries same-prefix routers in
// registration order. A path-unfiltered router.use() runs for every
// request that reaches this router at all, including ones meant for a
// sibling router that just happens to share the prefix (e.g. POST
// /reports would hit this router's blanket auth middleware and 401 before
// Express ever got to check it doesn't actually match any route defined
// here). Scoping the middleware to each specific route avoids that.

// Loads the server and checks ownership in one place — every route below
// needs this, and getting the ownership check wrong once would leak
// another user's server data.
async function loadOwnedServer(req, res) {
  const server = await Server.findOne({ serverId: req.params.id });
  if (!server || server.ownerUserId.toString() !== req.userId) {
    res.status(404).json({ error: "server not found" });
    return null;
  }
  return server;
}

router.post("/servers", requireUserAuth, dashboardRateLimit, asyncHandler(async (req, res) => {
  const { hostname } = req.body ?? {};

  const serverId = crypto.randomUUID();
  const apiKey = crypto.randomBytes(32).toString("hex");

  await Server.create({
    serverId,
    ownerUserId: req.userId,
    hostname: typeof hostname === "string" ? hostname : undefined,
    apiKeyHash: hashApiKey(apiKey),
  });

  // apiKey is only ever returned here — it's stored as a hash, so this is
  // the one and only time the caller can see the plaintext value.
  res.status(201).json({ serverId, apiKey });
}));

router.get("/servers", requireUserAuth, dashboardRateLimit, asyncHandler(async (req, res) => {
  const servers = await Server.find({ ownerUserId: req.userId }).lean();

  const withScores = await Promise.all(
    servers.map(async (s) => {
      const latest = await Report.findOne({ serverId: s.serverId }).sort({ receivedAt: -1 }).lean();
      return {
        serverId: s.serverId,
        hostname: s.hostname ?? null,
        agentVersion: s.agentVersion ?? null,
        lastSeenAt: s.lastSeenAt ?? null,
        score: latest?.score ?? null,
        lastReportAt: latest?.receivedAt ?? null,
      };
    })
  );

  res.json({ servers: withScores });
}));

router.get("/servers/:id", requireUserAuth, dashboardRateLimit, asyncHandler(async (req, res) => {
  const server = await loadOwnedServer(req, res);
  if (!server) return;

  const latest = await Report.findOne({ serverId: server.serverId }).sort({ receivedAt: -1 }).lean();
  res.json({
    serverId: server.serverId,
    hostname: server.hostname ?? null,
    agentVersion: server.agentVersion ?? null,
    lastSeenAt: server.lastSeenAt ?? null,
    score: latest?.score ?? null,
  });
}));

router.get("/servers/:id/reports", requireUserAuth, dashboardRateLimit, asyncHandler(async (req, res) => {
  const server = await loadOwnedServer(req, res);
  if (!server) return;

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const reports = await Report.find({ serverId: server.serverId })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .select("-findings") // history list doesn't need every finding's detail text
    .lean();

  res.json({ reports });
}));

router.get("/servers/:id/findings", requireUserAuth, dashboardRateLimit, asyncHandler(async (req, res) => {
  const server = await loadOwnedServer(req, res);
  if (!server) return;

  const latest = await Report.findOne({ serverId: server.serverId }).sort({ receivedAt: -1 }).lean();
  if (!latest) {
    res.json({ findings: [], score: null });
    return;
  }

  res.json({ findings: latest.findings, score: latest.score, reportedAt: latest.receivedAt });
}));

// On-demand rather than baked into GET /findings — an LLM call per failed
// finding on every dashboard load would be slow and, with a real API key
// configured, expensive for no benefit (most findings are never opened).
router.post(
  "/servers/:id/findings/:checkId/remediation",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const server = await loadOwnedServer(req, res);
    if (!server) return;

    const latest = await Report.findOne({ serverId: server.serverId }).sort({ receivedAt: -1 }).lean();
    const finding = latest?.findings.find((f) => f.id === req.params.checkId);
    if (!finding) {
      res.status(404).json({ error: "finding not found in the latest report" });
      return;
    }

    const checkDefinition = await CheckDefinition.findOne({ checkId: req.params.checkId }).lean();
    const { source, explanation } = await explainFinding({ finding, checkDefinition });
    res.json({ checkId: req.params.checkId, source, explanation });
  })
);

export default router;
