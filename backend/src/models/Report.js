import { Schema, model } from "mongoose";

/**
 * @typedef {"pass"|"fail"|"info"|"error"} FindingStatus
 */

// Mirrors the agent's report.Finding wire format exactly, plus severity
// looked up server-side from CheckDefinition — the agent never sends
// severity itself.
const ScoredFindingSchema = new Schema(
  {
    id: { type: String, required: true },
    category: { type: String, required: true },
    // title/detail are NOT required: Mongoose's built-in required
    // validator treats an empty string as "missing" (a well-known
    // footgun), and there's no real integrity reason to reject a
    // terse-but-legitimate finding — id/category/status are what actually
    // need to always be present for lookups and scoring to work.
    title: { type: String, default: "" },
    status: { type: String, enum: ["pass", "fail", "info", "error"], required: true },
    detail: { type: String, default: "" },
    severity: { type: String, enum: ["critical", "high", "medium", "low", null], default: null },
    scored: { type: Boolean, required: true },
  },
  { _id: false }
);

const ReportSchema = new Schema({
  serverId: { type: String, required: true, index: true },
  agentVersion: { type: String, required: true },
  timestamp: { type: Date, required: true },
  findings: { type: [ScoredFindingSchema], required: true },
  score: {
    overall: { type: Number, required: true },
    byCategory: { type: Schema.Types.Mixed, required: true },
  },
  receivedAt: { type: Date, required: true, default: Date.now },
});

// Reports are queried almost exclusively "latest N for this server" —
// this index makes that the cheap case.
ReportSchema.index({ serverId: 1, receivedAt: -1 });

export const Report = model("Report", ReportSchema);
