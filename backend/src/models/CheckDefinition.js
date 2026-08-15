import { Schema, model } from "mongoose";

/**
 * @typedef {"critical"|"high"|"medium"|"low"} Severity
 * @typedef {"mvp"|"phase2"|"later"} Priority
 */

// Check definitions are versioned here, separate from the agent binary —
// severity, rationale, and fix commands can be tuned without shipping a
// new agent release. severityDefault is optional: a handful of checks
// (open-ports-scan) are purely informational and never carry a severity.
const CheckDefinitionSchema = new Schema(
  {
    checkId: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    title: { type: String, required: true },
    priority: { type: String, enum: ["mvp", "phase2", "later"], required: true },
    severityDefault: { type: String, enum: ["critical", "high", "medium", "low"] },
    rationale: { type: String, required: true },
    reference: { type: String },
    fixCommandsByDistro: {
      debian: String,
      rhel: String,
      generic: String,
    },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true }
);

export const CheckDefinition = model("CheckDefinition", CheckDefinitionSchema);
