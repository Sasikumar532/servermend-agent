import { Router } from "express";
import { Server } from "../models/Server.js";
import { Baseline } from "../models/Baseline.js";
import { requireUserAuth } from "../middleware/userAuth.js";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dashboardRateLimit, baselineRateLimit } from "../middleware/rateLimit.js";
import { diffBaseline, hasDrift } from "../services/baselineDiff.js";

const router = Router();

// Shares the /api/v1 mount prefix with every other router — auth applied
// per-route, never via a blanket router.use(). See the comment in app.js
// and routes/servers.js for the bug that pattern caused before.

// Wire field names (snake_case, matching agent/baseline/baseline.go's json
// tags) -> the camelCase schema fields stored here.
function toSnapshot(raw) {
  return {
    capturedAt: raw?.captured_at ? new Date(raw.captured_at) : new Date(),
    authorizedKeys: raw?.authorized_keys ?? [],
    systemCronEntries: raw?.system_cron_entries ?? [],
    userCronEntries: raw?.user_cron_entries ?? [],
    systemdUnits: raw?.systemd_units ?? [],
    suidBinaries: raw?.suid_binaries ?? [],
  };
}

async function loadOwnedServer(req, res) {
  const server = await Server.findOne({ serverId: req.params.id });
  if (!server || server.ownerUserId.toString() !== req.userId) {
    res.status(404).json({ error: "server not found" });
    return null;
  }
  return server;
}

// Agent pushes what it currently observes, on every run (not just capture
// runs — the Go side always populates RunContext.NewBaseline now, whether
// or not it also overwrites the local baseline file). First push for a
// server becomes the confirmed baseline outright, mirroring the agent's
// own "captured automatically on first run" rule. After that, an addition
// versus the confirmed baseline is held as `pending` until a user
// explicitly confirms it from the dashboard — never auto-applied, even
// though the agent's local file has its own independent confirmation path
// (--update-baseline). The two are deliberately separate: this endpoint
// existing doesn't change what the agent scores findings against locally.
router.post(
  "/servers/:id/baseline",
  asyncHandler(requireAgentAuth),
  baselineRateLimit,
  asyncHandler(async (req, res) => {
    const { server_id, baseline } = req.body ?? {};
    if (typeof server_id !== "string" || typeof baseline !== "object" || baseline === null) {
      res.status(400).json({ error: "server_id (string) and baseline (object) are required" });
      return;
    }
    if (req.agentServerId !== server_id) {
      res.status(403).json({ error: "API key does not match server_id in the body" });
      return;
    }

    const observed = toSnapshot(baseline);
    const existing = await Baseline.findOne({ serverId: server_id });

    if (!existing || !existing.confirmed) {
      const doc = await Baseline.findOneAndUpdate(
        { serverId: server_id },
        { $set: { confirmed: observed, pending: null, pendingSince: null } },
        { upsert: true, new: true }
      );
      res.json({ status: "confirmed", baseline: doc.confirmed });
      return;
    }

    const diff = diffBaseline(existing.confirmed, observed);
    if (!hasDrift(diff)) {
      // Matches the confirmed baseline — clear any stale pending left over
      // from earlier, since-resolved drift (e.g. a temp cron job that was
      // added and then removed again before anyone confirmed it).
      if (existing.pending) {
        existing.pending = null;
        existing.pendingSince = null;
        await existing.save();
      }
      res.json({ status: "confirmed", baseline: existing.confirmed });
      return;
    }

    existing.pending = observed;
    existing.pendingSince = new Date();
    await existing.save();
    res.json({ status: "pending", diff, baseline: existing.confirmed });
  })
);

router.get(
  "/servers/:id/baseline",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const server = await loadOwnedServer(req, res);
    if (!server) return;

    const doc = await Baseline.findOne({ serverId: server.serverId }).lean();
    if (!doc || !doc.confirmed) {
      res.json({ confirmed: null, pending: null, pendingSince: null, diff: null });
      return;
    }

    const diff = doc.pending ? diffBaseline(doc.confirmed, doc.pending) : null;
    res.json({ confirmed: doc.confirmed, pending: doc.pending, pendingSince: doc.pendingSince, diff });
  })
);

router.post(
  "/servers/:id/baseline/confirm",
  requireUserAuth,
  dashboardRateLimit,
  asyncHandler(async (req, res) => {
    const server = await loadOwnedServer(req, res);
    if (!server) return;

    const doc = await Baseline.findOne({ serverId: server.serverId });
    if (!doc || !doc.pending) {
      res.status(404).json({ error: "no pending baseline to confirm" });
      return;
    }

    doc.confirmed = doc.pending;
    doc.pending = null;
    doc.pendingSince = null;
    await doc.save();
    res.json({ status: "confirmed", baseline: doc.confirmed });
  })
);

export default router;
