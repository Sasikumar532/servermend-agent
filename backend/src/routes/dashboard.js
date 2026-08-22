import { Router } from "express";
import { Server } from "../models/Server.js";
import { Report } from "../models/Report.js";
import { Alert } from "../models/Alert.js";
import { checkCatalog } from "../data/checkCatalog.js";
import { requireUserAuth } from "../middleware/userAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dashboardRateLimit } from "../middleware/rateLimit.js";

const router = Router();

const ATTENTION_THRESHOLD = 70;
const RECENT_ACTIVITY_LIMIT = 8;
const RECENTLY_SEEN_LIMIT = 5;
const SCORE_TREND_LIMIT = 12;

// One aggregate read for the whole Dashboard page, rather than the page
// making its own per-server fan-out — findings/alerts only exist
// per-server, so "open criticals across the fleet" or "recent activity
// across the fleet" would otherwise mean N+1 requests from the client on
// every load. This does that fan-out once, server-side.
router.get(
  "/dashboard/summary",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const servers = await Server.find({ ownerUserId: req.userId }).lean();
    const hostnameById = new Map(servers.map((s) => [s.serverId, s.hostname ?? s.serverId]));

    const latestReports = await Promise.all(
      servers.map((s) => Report.findOne({ serverId: s.serverId }).sort({ receivedAt: -1 }).lean())
    );
    const reporting = latestReports.filter(Boolean);

    const scores = reporting.map((r) => r.score.overall);
    const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const attentionServers = servers
      .map((s, i) => ({ server: s, report: latestReports[i] }))
      .filter(({ report }) => report && report.score.overall < ATTENTION_THRESHOLD)
      .sort((a, b) => a.report.score.overall - b.report.score.overall)
      .map(({ server, report }) => ({
        serverId: server.serverId,
        hostname: server.hostname ?? null,
        score: report.score.overall,
      }));

    const recentlySeen = servers
      .filter((s) => s.lastSeenAt)
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
      .slice(0, RECENTLY_SEEN_LIMIT)
      .map((s) => ({ serverId: s.serverId, hostname: s.hostname ?? null, lastSeenAt: s.lastSeenAt }));

    let openCriticals = 0;
    const categoryCounts = new Map();
    for (const report of reporting) {
      for (const finding of report.findings) {
        if (finding.status !== "fail") continue;
        categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + 1);
        if (finding.severity === "critical") openCriticals += 1;
      }
    }

    const lastIngestAt = servers.reduce(
      (latest, s) => (s.lastSeenAt && (!latest || s.lastSeenAt > latest) ? s.lastSeenAt : latest),
      null
    );

    const serverIds = servers.map((s) => s.serverId);
    const recentAlerts = serverIds.length
      ? await Alert.find({ serverId: { $in: serverIds } })
          .sort({ createdAt: -1 })
          .limit(RECENT_ACTIVITY_LIMIT)
          .lean()
      : [];

    // Most recent reports across the whole fleet (not per-server) —
    // chronological across every server, not one line per server. Fetched
    // newest-first (cheap with the existing serverId+receivedAt index),
    // then reversed so the chart draws oldest-to-newest, left-to-right.
    const trendReports = serverIds.length
      ? await Report.find({ serverId: { $in: serverIds } })
          .sort({ receivedAt: -1 })
          .limit(SCORE_TREND_LIMIT)
          .select("score.overall receivedAt")
          .lean()
      : [];
    const scoreTrend = trendReports
      .slice()
      .reverse()
      .map((r) => ({ receivedAt: r.receivedAt, score: r.score.overall }));

    res.json({
      servers: { total: servers.length, reporting: reporting.length, neverReported: servers.length - reporting.length },
      averageScore,
      needsAttention: attentionServers.length,
      openCriticals,
      lastIngestAt,
      checkDefinitionsActive: checkCatalog.length,
      categoryCounts: [...categoryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      recentActivity: recentAlerts.map((a) => ({
        serverId: a.serverId,
        hostname: hostnameById.get(a.serverId) ?? a.serverId,
        checkId: a.checkId,
        title: a.title,
        severity: a.severity,
        emailStatus: a.emailStatus,
        createdAt: a.createdAt,
      })),
      attentionServers,
      recentlySeen,
      scoreTrend,
    });
  })
);

export default router;
