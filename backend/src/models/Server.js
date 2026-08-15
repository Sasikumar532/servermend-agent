import { Schema, model } from "mongoose";

// Identity + auth only. The persistence baseline (cron entries,
// authorized_keys, etc.) that the agent diffs against locally on every
// run is a separate concern — see models/Baseline.js — this collection
// never holds it.
const ServerSchema = new Schema(
  {
    serverId: { type: String, required: true, unique: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostname: { type: String },
    apiKeyHash: { type: String, required: true, unique: true },
    agentVersion: { type: String },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export const Server = model("Server", ServerSchema);
