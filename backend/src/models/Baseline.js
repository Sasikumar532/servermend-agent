import { Schema, model } from "mongoose";

// Server-side mirror of the agent's local persistence baseline
// (agent/baseline/baseline.go) — one document per server. The agent's own
// local baseline file (diffed by every persistence/ssh check on every
// run) is completely unaffected by this collection; this exists purely so
// drift can be reviewed and confirmed from the dashboard instead of only
// via a local --update-baseline run on the box itself.
const BaselineSnapshotSchema = new Schema(
  {
    capturedAt: { type: Date, required: true },
    authorizedKeys: { type: [String], default: [] },
    systemCronEntries: { type: [String], default: [] },
    userCronEntries: { type: [String], default: [] },
    systemdUnits: { type: [String], default: [] },
    suidBinaries: { type: [String], default: [] },
  },
  { _id: false }
);

const BaselineSchema = new Schema(
  {
    serverId: { type: String, required: true, unique: true },
    // null until the agent's first push for this server.
    confirmed: { type: BaselineSnapshotSchema, default: null },
    // The most recently observed snapshot, when it adds something not in
    // `confirmed` — set by POST /servers/:id/baseline, cleared by either
    // POST /baseline/confirm (promotes it to confirmed) or a later push
    // that no longer differs (drift resolved itself, e.g. a temp cron job
    // was removed again).
    pending: { type: BaselineSnapshotSchema, default: null },
    pendingSince: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Baseline = model("Baseline", BaselineSchema);
