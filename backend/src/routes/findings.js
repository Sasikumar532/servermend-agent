import { Router } from "express";
import { Server } from "../models/Server.js";
import { Report } from "../models/Report.js";
import { requireUserAuth } from "../middleware/userAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dashboardRateLimit } from "../middleware/rateLimit.js";

const router = Router();

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Every failing finding from each owned server's latest report, worst
// first — the fleet-wide counterpart to GET /servers/:id/findings (which
// is scoped to one server). Only "fail" status is included: a findings
// *inbox* is about what needs fixing, not a full pass/fail audit trail
// (that's what the per-server Findings tab is for).
router.get(
  "/findings",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const servers = await Server.find({ ownerUserId: req.userId }).lean();

    const latestReports = await Promise.all(
      servers.map((s) => Report.findOne({ serverId: s.serverId }).sort({ receivedAt: -1 }).lean())
    );

    const findings = [];
    servers.forEach((server, i) => {
      const report = latestReports[i];
      if (!report) return;
      for (const finding of report.findings) {
        if (finding.status !== "fail") continue;
        findings.push({
          serverId: server.serverId,
          hostname: server.hostname ?? null,
          checkId: finding.id,
          category: finding.category,
          title: finding.title,
          detail: finding.detail,
          severity: finding.severity,
          scored: finding.scored,
          reportedAt: report.receivedAt,
        });
      }
    });

    findings.sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.reportedAt) - new Date(a.reportedAt);
    });

    res.json({ findings });
  })
);

export default router;
