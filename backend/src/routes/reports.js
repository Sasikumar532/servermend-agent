import { Router } from "express";
import { Server } from "../models/Server.js";
import { Report } from "../models/Report.js";
import { CheckDefinition } from "../models/CheckDefinition.js";
import { User } from "../models/User.js";
import { scoreReport } from "../services/rulesEngine.js";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { reportsRateLimit } from "../middleware/rateLimit.js";
import { detectNewCriticalFailures } from "../services/alerting/detectNewCriticalFailures.js";
import { triggerCriticalFindingAlerts } from "../services/alerting/alertService.js";

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

  // Fetched before creating the new report — this is what "previous"
  // means for alert transition detection below. previousReport is null on
  // a server's first-ever report, which detectNewCriticalFailures treats
  // as "everything currently critical-and-failing is new" (see that
  // file's header comment).
  const previousReport = await Report.findOne({ serverId: server_id })
    .sort({ receivedAt: -1 })
    .select("findings")
    .lean();

  const report = await Report.create({
    serverId: server_id,
    agentVersion: typeof agent_version === "string" ? agent_version : "unknown",
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    findings: scoredFindings,
    score: { overall, byCategory },
    receivedAt: new Date(),
  });

  // findOneAndUpdate with new:true, not the old separate updateOne — the
  // returned doc's ownerUserId/hostname is what alerting needs below, and
  // this way it's one round trip instead of two.
  const serverDoc = await Server.findOneAndUpdate(
    { serverId: server_id },
    { $set: { agentVersion: agent_version, lastSeenAt: new Date() } },
    { new: true }
  ).lean();

  // Best-effort, deliberately non-fatal: an alerting problem (a bad SMTP
  // config, a transient Mongo hiccup on the Alert insert) must never turn
  // a successful report ingestion into a 500 for the agent. Mirrors the
  // baseline push's best-effort framing on the agent side.
  try {
    const newCriticalFailures = detectNewCriticalFailures(previousReport?.findings ?? [], scoredFindings);
    if (newCriticalFailures.length > 0 && serverDoc) {
      const owner = await User.findById(serverDoc.ownerUserId).select("email").lean();
      await triggerCriticalFindingAlerts({
        server: serverDoc,
        ownerEmail: owner?.email ?? null,
        report,
        findings: newCriticalFailures,
      });
    }
  } catch (err) {
    console.error("alert triggering failed (non-fatal, report still ingested):", err.message);
  }

  res.status(201).json({
    reportId: report._id,
    score: { overall, byCategory },
    unscoredCheckIds,
  });
}));

export default router;
