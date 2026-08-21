import { Schema, model } from "mongoose";

// One document per newly-critical-and-failing finding (see
// services/alerting/detectNewCriticalFailures.js). This is the source of
// truth that GET /servers/:id/alerts reads — it always gets written,
// regardless of whether email delivery succeeded, so an alert is never
// silently lost just because SMTP is unconfigured or an outage happens to
// coincide with it. emailStatus records what happened to the *delivery*
// attempt for the batch this alert belongs to, separate from the alert's
// own existence.
const AlertSchema = new Schema(
  {
    serverId: { type: String, required: true, index: true },
    reportId: { type: Schema.Types.ObjectId, required: true },
    checkId: { type: String, required: true },
    category: { type: String, required: true },
    title: { type: String, default: "" },
    detail: { type: String, default: "" },
    severity: { type: String, enum: ["critical", "high", "medium", "low"], required: true },
    emailStatus: { type: String, enum: ["sent", "failed", "skipped_no_smtp"], required: true },
    emailError: { type: String },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false } // createdAt is explicit above; no separate updatedAt needed for an append-only log
);

AlertSchema.index({ serverId: 1, createdAt: -1 });

export const Alert = model("Alert", AlertSchema);
