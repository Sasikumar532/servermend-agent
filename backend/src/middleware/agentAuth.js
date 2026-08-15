import crypto from "node:crypto";
import { Server } from "../models/Server.js";

export function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

// API keys are high-entropy random tokens, not human passwords — a fast
// cryptographic hash with a unique index is the correct storage pattern
// here (bcrypt's slow-hash property exists to defend against brute-forcing
// low-entropy secrets, which isn't the threat model for a 256-bit key).
export async function requireAgentAuth(req, res, next) {
  const authHeader = req.header("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "missing or malformed Authorization header" });
    return;
  }

  const server = await Server.findOne({ apiKeyHash: hashApiKey(token) }).lean();
  if (!server) {
    res.status(401).json({ error: "invalid API key" });
    return;
  }

  req.agentServerId = server.serverId;
  next();
}
