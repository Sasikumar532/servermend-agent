import { Router } from "express";
import { Server } from "../models/Server.js";
import { Report } from "../models/Report.js";
import { CheckDefinition } from "../models/CheckDefinition.js";
import { scoreReport } from "../services/rulesEngine.js";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { reportsRateLimit } from "../middleware/rateLimit.js";

const router = Router();

router.post("/reports", asyncHandler(requireAgentAuth), reportsRateLimit, asyncHandler(async (req, res) => {
  const { server_id, agent_version, findings, timestamp } = req.body ?? {};

  if (typeof server_id !== "string" || !Array.isArray(findings)) {
    res.status(400).json({ error: "server_id (string) and findings (array) are required" });
    return;
  }
  // The API key already identified which server this is — the body's own
  // claim must match, or a valid key for server A could post as server B.
  if (req.agentServerId !== server_id) {
    res.status(403).json({ error: "API key does not match server_id in the report body" });
    return;
  }

  const definitions = await CheckDefinition.find({}).lean();
  const defMap = new Map(definitions.map((d) => [d.checkId, d]));

  const { overall, byCategory, scoredFindings, unscoredCheckIds } = scoreReport(findings, defMap);

  const report = await Report.create({
    serverId: server_id,
    agentVersion: typeof agent_version === "string" ? agent_version : "unknown",
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    findings: scoredFindings,
    score: { overall, byCategory },
    receivedAt: new Date(),
  });

  await Server.updateOne(
    { serverId: server_id },
    { $set: { agentVersion: agent_version, lastSeenAt: new Date() } }
  );

  res.status(201).json({
    reportId: report._id,
    score: { overall, byCategory },
    unscoredCheckIds,
  });
}));

export default router;
