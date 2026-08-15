import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signUserToken(userId) {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: "7d" });
}

export function requireUserAuth(req, res, next) {
  const authHeader = req.header("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "missing or malformed Authorization header" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
