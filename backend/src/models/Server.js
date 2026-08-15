import { Schema, model } from "mongoose";

// The agent's persistence baseline (cron entries, authorized_keys, etc.)
// stays local to the host — the agent diffs against it itself and only
// ever sends already-computed pass/fail statuses. This collection is
// intentionally just identity + auth, not a baseline store.
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
