// A small in-memory fixed-window rate limiter — no external dependency,
// consistent with how lean the rest of this backend (and the agent) have
// stayed. Fine for a single-process deployment; would need a shared store
// (Redis) behind a load balancer, which is out of scope until this
// actually runs behind one.
const windows = new Map(); // key -> { count, resetAt }

function checkAndIncrement(key, limit, windowMs) {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// Periodic cleanup so `windows` doesn't grow unbounded with one-off keys
// (e.g. an IP that hits an endpoint exactly once, ever).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer = null;
export function startRateLimitCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) windows.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.(); // don't keep the process alive just for cleanup
}
export function stopRateLimitCleanup() {
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}
export function _resetRateLimitState() {
  windows.clear();
}

/**
 * @param {{limit: number, windowMs: number, keyFn: (req: import('express').Request) => string}} opts
 */
export function rateLimit({ limit, windowMs, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const result = checkAndIncrement(key, limit, windowMs);

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      res.status(429).json({ error: "too many requests" });
      return;
    }
    next();
  };
}

// Auth routes are the brute-force target — strict, keyed by IP since
// there's no identity yet at that point.
export const authRateLimit = rateLimit({
  limit: 10,
  windowMs: 60_000,
  keyFn: (req) => `auth:${req.ip}`,
});

// Report ingestion is keyed by the authenticated server, not IP — a NAT'd
// fleet of servers sharing an egress IP shouldn't rate-limit each other,
// and a single misbehaving agent shouldn't need an IP-ban to contain.
export const reportsRateLimit = rateLimit({
  limit: 30,
  windowMs: 60_000,
  keyFn: (req) => `reports:${req.agentServerId ?? req.ip}`,
});

// Dashboard reads are keyed by user — generous, this is a human clicking
// around, not a scripted client.
export const dashboardRateLimit = rateLimit({
  limit: 120,
  windowMs: 60_000,
  keyFn: (req) => `dashboard:${req.userId ?? req.ip}`,
});
