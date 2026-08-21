import { env } from "../config/env.js";

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

// Pure and exported separately from the middleware so tests can exercise
// both branches (explicit allowlist vs. the default local-dev fallback)
// by passing the allowlist in directly, instead of needing to re-import
// the module under a different CORS_ORIGINS env var.
export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return false;
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin);
  }
  // No explicit allowlist configured. Vite's dev server auto-increments
  // its port when the default is already taken — this repo's own dev
  // environment has landed anywhere from 5173 to 5177 — so pinning one
  // port in the default would break the moment something else happens to
  // be listening on it. Set CORS_ORIGINS explicitly for anything beyond
  // local development.
  return LOCALHOST_ORIGIN.test(origin);
}

// No credentials (cookies) involved anywhere in this API — the dashboard
// sends its JWT via the Authorization header, not a cookie — so this
// never needs Access-Control-Allow-Credentials or the stricter
// exact-origin-only rules that come with it. Applied globally in app.js,
// not per-route: unlike auth middleware (which actually rejects
// requests and so must be scoped per-route — see the comment in
// app.js/routes/servers.js), this only ever adds response headers or
// answers a preflight, so a blanket app.use() is safe here.
export function cors(req, res, next) {
  const origin = req.header("origin");

  if (isAllowedOrigin(origin, env.corsOrigins)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
